import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { Pilot } from '../src/pilot.js';
import { Provider, responseBody } from '../src/provider.js';
import { ApiSettings } from '../src/api-settings.js';
import { createHandler } from '../src/http.js';
import { DEFAULT_CONTROLS } from '../public/controls.js';
import { MODES } from '../public/modes.js';

const fakeKey = 'sk-offline-test-not-a-real-key';
function fixture(t, fetchImpl = async () => Response.json({ id: 'gpt-6.1-sol' })) {
  const dir = mkdtempSync(join(tmpdir(), 'instrument-settings-'));
  const store = new Store(join(dir, 'test.sqlite'));
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const settings = new ApiSettings(join(dir, 'api-settings.json'));
  const provider = new Provider({ mode: 'demo', fetchImpl });
  const pilot = new Pilot({ store, provider, settings, budget: 25 });
  return { dir, store, settings, provider, pilot };
}
const turnInput = mode => ({ requestId: randomUUID(), text: 'An idea', controls: { ...DEFAULT_CONTROLS }, partnershipMode: mode });

test('each partnership mode reaches Responses without changing the independent dials', () => {
  for (const [key, mode] of Object.entries(MODES)) {
    const controls = { ...DEFAULT_CONTROLS, wildness: 5, critique: 5 };
    const body = responseBody([], 'Our idea', controls, key);
    assert.ok(body.instructions.includes(mode.instructions));
    assert.match(body.instructions, /Ridiculous/);
    assert.match(body.instructions, /Adversarial/);
    assert.equal(body.reasoning.effort, 'medium');
  }
  assert.throws(() => responseBody([], 'hello', DEFAULT_CONTROLS, 'toString'), /Choose Play/);
});

test('existing databases migrate without losing conversations or history', t => {
  const dir = mkdtempSync(join(tmpdir(), 'instrument-migration-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'old.sqlite'), old = new DatabaseSync(path);
  old.exec('CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, controls TEXT NOT NULL, updated TEXT NOT NULL)');
  old.prepare('INSERT INTO conversations VALUES (?,?,?,?)').run('old', 'Existing idea', JSON.stringify(DEFAULT_CONTROLS), new Date().toISOString());
  old.close();
  const store = new Store(path);
  assert.equal(store.get('old').title, 'Existing idea');
  assert.equal(store.get('old').partnershipMode, 'play');
  store.settings('old', { ...DEFAULT_CONTROLS, effort: 3 }, 'boss');
  store.close();
  const reopened = new Store(path);
  assert.equal(reopened.get('old').partnershipMode, 'boss');
  assert.equal(reopened.get('old').controls.effort, 3);
  reopened.close();
});

test('the retired "kim" mode id migrates to influencer in conversations and turn snapshots', t => {
  const dir = mkdtempSync(join(tmpdir(), 'instrument-migration-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'old.sqlite'), old = new DatabaseSync(path);
  old.exec("CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, controls TEXT NOT NULL, updated TEXT NOT NULL, partnershipMode TEXT NOT NULL DEFAULT 'play')");
  old.exec('CREATE TABLE turns (id TEXT PRIMARY KEY, conversation TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL)');
  const now = new Date().toISOString();
  old.prepare('INSERT INTO conversations VALUES (?,?,?,?,?)').run('old', 'Existing idea', JSON.stringify(DEFAULT_CONTROLS), now, 'kim');
  old.prepare('INSERT INTO turns VALUES (?,?,?,?,?)').run('t1', 'old', 'complete', JSON.stringify({ id: 't1', conversation: 'old', status: 'complete', partnershipMode: 'kim', text: 'Hi' }), now);
  old.close();
  const store = new Store(path);
  t.after(() => store.close());
  const conversation = store.get('old');
  assert.equal(conversation.partnershipMode, 'influencer');
  assert.equal(conversation.turns[0].partnershipMode, 'influencer');
  assert.equal(conversation.turns[0].text, 'Hi');
});

test('mode switches during a reply preserve the submitted mode and next conversation selection', async t => {
  const { store, pilot, provider } = fixture(t);
  const pending = Promise.withResolvers(); let sent;
  provider.respond = body => { sent = body; return pending.promise; };
  const c = store.create(DEFAULT_CONTROLS, 'extract');
  const turn = pilot.begin(c.id, turnInput('play'));
  store.partnershipMode(c.id, 'boss');
  assert.match(sent.instructions, /Partnership mode — Play/);
  assert.equal(store.turn(turn.id).partnershipMode, 'play');
  pending.resolve({ text: 'Reply', status: 'completed' });
  await pilot.jobs.get(turn.id);
  assert.equal(store.get(c.id).partnershipMode, 'boss');
  assert.equal(store.turn(turn.id).partnershipMode, 'play');
  assert.throws(() => pilot.begin(c.id, turnInput('unknown')), /Choose Play/);
});

test('API setup validates model access, stores an owner-only key, survives reload, and never exposes it', async t => {
  const calls = [];
  const { settings, pilot, provider, store } = fixture(t, async (url, options) => {
    calls.push({ url, options }); return Response.json({ id: 'gpt-6.1-sol' });
  });
  const state = await pilot.configure({ key: fakeKey, budget: 25 });
  assert.equal(state.mode, 'live'); assert.equal(state.ready, true); assert.equal(state.hasKey, true);
  assert.equal(JSON.stringify(state).includes(fakeKey), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/models/gpt-6.1-sol');
  assert.equal(calls[0].options.method, undefined); // GET only, no generation.
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${fakeKey}`);
  assert.equal(statSync(settings.path).mode & 0o777, 0o600);
  const restored = settings.load({ mode: 'demo', budget: 0 });
  assert.equal(restored.key, fakeKey); assert.equal(restored.budget, 25);
  const reopened = new Pilot({ store, provider: new Provider(restored), budget: restored.budget, settings });
  assert.equal(reopened.state().ready, true);
  await pilot.configure({ key: '', budget: 30 });
  assert.equal(provider.key, fakeKey); assert.equal(pilot.budget, 30);
  assert.equal(store.spent(), 0);
});

test('rejected access, invalid budgets, and disk failure preserve the previous API configuration', async t => {
  const { pilot, provider, settings, store } = fixture(t);
  await pilot.configure({ key: fakeKey, budget: 25 });
  provider.fetch = async () => Response.json({ error: fakeKey }, { status: 401 });
  await assert.rejects(pilot.configure({ key: 'sk-replacement-offline-test', budget: 50 }), error => {
    assert.match(error.message, /rejected/); assert.equal(error.message.includes(fakeKey), false); return true;
  });
  for (const budget of [0, -1, Infinity, NaN, '25']) await assert.rejects(pilot.configure({ key: fakeKey, budget }), /positive total budget/);
  assert.equal(provider.key, fakeKey); assert.equal(pilot.budget, 25);
  assert.equal(settings.load({}).budget, 25);
  store.reserve('existing', 1, 'response', 25);
  await assert.rejects(pilot.configure({ key: fakeKey, budget: 1 }), /already accounted/);
  provider.fetch = async () => Response.json({ id: 'gpt-6.1-sol' });
  settings.save = () => { throw new Error('Disk unavailable'); };
  await assert.rejects(pilot.configure({ key: fakeKey, budget: 50 }), /Disk unavailable/);
  assert.equal(pilot.budget, 25); assert.equal(pilot.configuring, false);
});

test('API reconfiguration cannot race with a turn or another configuration', async t => {
  const waiting = Promise.withResolvers();
  const { pilot, store, settings, provider } = fixture(t, () => waiting.promise);
  const c = store.create();
  const configuration = pilot.configure({ key: fakeKey, budget: 25 });
  assert.throws(() => pilot.begin(c.id, turnInput('play')), /setup is in progress/);
  await assert.rejects(pilot.configure({ key: fakeKey, budget: 50 }), /current request/);
  assert.equal(existsSync(settings.path), false);
  waiting.resolve(Response.json({ id: 'gpt-6.1-sol' }));
  await configuration;
  const response = Promise.withResolvers();
  provider.respond = () => response.promise;
  const turn = pilot.begin(c.id, turnInput('boss'));
  await assert.rejects(pilot.configure({ key: fakeKey, budget: 50 }), /current request/);
  response.resolve({ text: 'Reply', status: 'completed', usage: { input_tokens: 10, output_tokens: 10 } });
  await pilot.jobs.get(turn.id);
});

test('HTTP setup requires pairing and same origin; secrets stay outside public assets and conversation data', async t => {
  let checks = 0;
  const { pilot } = fixture(t, async () => { checks++; return Response.json({ id: 'gpt-6.1-sol' }); });
  const origin = 'https://instrument.test';
  const handler = createHandler({ pilot, pairingCode: 'pair-test', origins: [origin] });
  const request = (path, body, cookie, requestOrigin = origin) => new Request(origin + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pilot-Client': '1', Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body)
  });
  assert.equal((await handler(request('/api/settings', { key: fakeKey, budget: 25 }))).status, 401);
  const paired = await handler(request('/api/unlock', { code: 'pair-test' }));
  const cookie = paired.headers.get('set-cookie').split(';')[0];
  assert.equal((await handler(request('/api/settings', { key: fakeKey, budget: 25 }, cookie, 'https://elsewhere.test'))).status, 403);
  assert.equal(checks, 0);
  const configured = await handler(request('/api/settings', { key: fakeKey, budget: 25 }, cookie));
  assert.equal(configured.status, 200); assert.equal((await configured.text()).includes(fakeKey), false);
  const created = await handler(request('/api/conversations', { partnershipMode: 'boss' }, cookie));
  const conversation = await created.json();
  assert.equal(conversation.partnershipMode, 'boss'); assert.equal(JSON.stringify(conversation).includes(fakeKey), false);
  for (const path of ['/data/api-settings.json', '/api-settings.json', '/.env']) {
    assert.equal((await handler(new Request(origin + path, { headers: { Cookie: cookie } }))).status, 404);
  }
  const state = await handler(new Request(origin + '/api/state', { headers: { Cookie: cookie } }));
  assert.equal((await state.text()).includes(fakeKey), false);
});

test('a configured live conversation sends the key and selected mode, records usage, and never substitutes demo replies', async t => {
  const requests = [];
  const { pilot, store } = fixture(t, async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/models/gpt-6.1-sol')) return Response.json({ id: 'gpt-6.1-sol' });
    assert.equal(url, 'https://api.openai.com/v1/responses');
    return Response.json({ id: 'response-test', status: 'completed', usage: { input_tokens: 100, output_tokens: 50 }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Here are the extracted insights.' }] }] });
  });
  await pilot.configure({ key: fakeKey, budget: 25 });
  const c = store.create(DEFAULT_CONTROLS, 'extract');
  const turn = pilot.begin(c.id, turnInput('extract'));
  await pilot.jobs.get(turn.id);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.headers.Authorization, `Bearer ${fakeKey}`);
  const body = JSON.parse(requests[1].options.body);
  assert.match(body.instructions, /Partnership mode — Extract/);
  assert.equal(body.store, false);
  const completed = store.turn(turn.id);
  assert.equal(completed.mode, 'live'); assert.equal(completed.status, 'complete');
  assert.equal(completed.answer, 'Here are the extracted insights.');
  assert.equal(completed.partnershipMode, 'extract');
  assert.equal(completed.usage.output_tokens, 50);
  assert.ok(store.spent() > 0 && store.spent() < 0.01);
  assert.equal(JSON.stringify(store.get(c.id)).includes(fakeKey), false);
});
