import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/store.js';
import { Pilot } from '../src/pilot.js';
import { Provider, responseBody, wavDuration, reserveForResponse } from '../src/provider.js';
import { createHandler } from '../src/http.js';
import { DEFAULT_CONTROLS as defaults, instructions } from '../public/controls.js';
import { TiltClutch, screenTilt } from '../public/motion.js';
import { encodeWav } from '../public/audio.js';
function fixture(t, provider = { mode: 'demo', respond: async () => ({ text: 'reply', status: 'completed' }) }, budget = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'pi-fold-'));
  const path = join(dir, 'test.sqlite');
  const store = new Store(path);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { path, store, pilot: new Pilot({ store, provider, budget }) };
}
const input = (text = 'hello', controls = defaults) => ({ requestId: randomUUID(), text, controls });

test('all effort positions reach the API exactly; independent behavioral extremes survive', () => {
  for (const [i, effort] of ['low', 'medium', 'high', 'xhigh', 'max'].entries()) {
    const body = responseBody([], 'hello', { ...defaults, effort: i + 1 });
    assert.equal(body.model, 'gpt-6.1-sol'); assert.equal(body.reasoning.effort, effort); assert.equal(body.store, false);
    assert.equal(body.temperature, undefined);
  }
  const prompt = instructions({ implementation: 2, wildness: 5, critique: 5, effort: 2 });
  assert.match(prompt, /focus does not mean a decision/); assert.match(prompt, /Suspend feasibility filtering/); assert.match(prompt, /do not manufacture objections/);
});
test('snapshot survives mid-response changes; settings and history survive reopening', async t => {
  let finish;
  const { store, pilot, path } = fixture(t, { mode: 'demo', respond: () => new Promise(r => { finish = r; }) });
  const c = store.create(); const request = input();
  const turn = pilot.begin(c.id, request);
  const next = { ...defaults, critique: 5 }; store.controls(c.id, next);
  assert.deepEqual(store.get(c.id).controls, next); assert.deepEqual(turn.controls, defaults);
  assert.throws(() => pilot.begin(c.id, input('second')), /finish/);
  assert.equal(pilot.begin(c.id, request).id, turn.id);
  finish({ text: 'done', status: 'completed' }); await pilot.jobs.get(turn.id);
  const reopened = new Store(path);
  try { assert.deepEqual(reopened.get(c.id).controls, next); assert.equal(reopened.get(c.id).turns[0].answer, 'done'); } finally { reopened.close(); }
});
test('idempotency survives completion and never reissues a paid request', async t => {
  let calls = 0;
  const { store, pilot } = fixture(t, { mode: 'live', key: 'test', respond: async () => { calls++; return { text: 'done', status: 'completed', usage: { input_tokens: 10, output_tokens: 20 } }; } }, 1);
  const c = store.create(), request = input();
  pilot.begin(c.id, request); await pilot.jobs.get(request.requestId);
  pilot.begin(c.id, request); assert.equal(calls, 1); assert.equal(store.get(c.id).turns.length, 1);
  assert.ok(store.spent() > 0 && store.spent() < 0.01);
});
test('budget rejection happens before provider invocation; uncertain failures keep reservations', async t => {
  let calls = 0;
  const provider = { mode: 'live', key: 'test', respond: async () => { calls++; throw new Error('Timeout'); } };
  const { store, pilot } = fixture(t, provider, 0);
  const c = store.create();
  assert.throws(() => pilot.begin(c.id, input()), /approved pilot budget/); assert.equal(calls, 0);
  pilot.budget = .001; assert.throws(() => pilot.begin(c.id, input()), /budget/); assert.equal(calls, 0);
  pilot.budget = 1; const request = input(); pilot.begin(c.id, request); await pilot.jobs.get(request.requestId);
  assert.equal(calls, 1); assert.equal(store.turn(request.requestId).status, 'failed'); assert.ok(store.spent() > .1);
});
test('recorded speech submits immediately with release settings and stores no raw audio', async t => {
  const audio = Buffer.from(await encodeWav([new Float32Array(48000)], 48000).arrayBuffer());
  assert.equal(wavDuration(audio), 1);
  let captured;
  const { store, pilot } = fixture(t, { mode: 'demo', transcribe: async () => 'a spoken thought', respond: async body => { captured = body; return { text: 'reply', status: 'completed' }; } });
  const c = store.create(), request = { ...input(), audio: audio.toString('base64'), text: undefined, controls: { ...defaults, wildness: 5 } };
  pilot.begin(c.id, request); await pilot.jobs.get(request.requestId);
  assert.equal(captured.input.at(-1).content, 'a spoken thought'); assert.match(captured.instructions, /Ridiculous/);
  const turn = store.turn(request.requestId); assert.equal(turn.text, 'a spoken thought'); assert.equal(turn.source, 'voice'); assert.equal(turn.audio, undefined);
  assert.throws(() => wavDuration(Buffer.from('bad')), /WAV/);
});
test('speech preflight reserves both calls and rolls back if the second cannot fit', async t => {
  const audio = Buffer.from(await encodeWav([new Float32Array(16000)], 16000).arrayBuffer());
  let calls = 0;
  const { store, pilot } = fixture(t, { mode: 'live', key: 'test', transcribe: async () => { calls++; return 'hi'; } }, .001);
  const c = store.create();
  assert.throws(() => pilot.begin(c.id, { ...input(), audio: audio.toString('base64') }), /budget/);
  assert.equal(calls, 0); assert.equal(store.get(c.id).turns.length, 0); assert.equal(store.spent(), 0);
  pilot.budget = reserveForResponse(responseBody([], 'x'.repeat(64000), defaults)) + .01;
  assert.throws(() => pilot.begin(c.id, { ...input(), audio: audio.toString('base64') }), /budget/);
  assert.equal(calls, 0); assert.equal(store.spent(), 0);
});
test('restart marks an interrupted turn without silently resending or dropping reservations', t => {
  const { store, path } = fixture(t); const c = store.create();
  store.saveTurn({ id: 'interrupted', conversation: c.id, status: 'pending', created: new Date().toISOString(), text: 'hi', controls: defaults });
  store.reserve('interrupted:response', .2, 'response', 1);
  const reopened = new Store(path);
  try { assert.equal(reopened.turn('interrupted').status, 'failed'); assert.equal(reopened.spent(), .2); } finally { reopened.close(); }
});
test('manual context excludes failed turns and separates demo from live', async t => {
  let body;
  const { store, pilot } = fixture(t, { mode: 'demo', respond: async b => { body = b; return { text: 'reply', status: 'completed' }; } });
  const c = store.create();
  for (const [id, mode, status] of [['old-demo', 'demo', 'complete'], ['old-live', 'live', 'complete'], ['failed', 'demo', 'failed']]) store.saveTurn({ id, mode, status, conversation: c.id, text: id, answer: id, controls: defaults, created: new Date().toISOString() });
  const request = input(); pilot.begin(c.id, request); await pilot.jobs.get(request.requestId);
  assert.deepEqual(body.input.map(x => x.content), ['old-demo', 'old-demo', 'hello']);
});
test('Responses HTTP contract, refusal handling, and no automatic retry', async () => {
  let call, count = 0;
  const provider = new Provider({ mode: 'live', key: 'private-test-key', fetchImpl: async (url, options) => {
    count++; call = { url, options }; return Response.json({ id: 'resp_test', status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot help with that.' }] }], usage: { input_tokens: 20, output_tokens: 30 } });
  } });
  const result = await provider.respond(responseBody([], 'hello', defaults));
  assert.equal(call.url, 'https://api.openai.com/v1/responses'); assert.equal(call.options.headers.Authorization, 'Bearer private-test-key'); assert.equal(result.text, 'Cannot help with that.'); assert.equal(count, 1);
  provider.fetch = async () => { count++; return new Response('', { status: 429 }); };
  await assert.rejects(() => provider.respond(responseBody([], 'hi', defaults)), /429/); assert.equal(count, 2);
});
test('demo provider cannot make network calls', async () => {
  const provider = new Provider({ mode: 'demo', fetchImpl: () => { throw new Error('Unexpected network'); } });
  assert.match((await provider.respond(responseBody([], 'test', defaults))).text, /Demo/);
  assert.match(await provider.transcribe(new Uint8Array()), /Demo/);
});
test('tilt requires the clutch, clamps extremes, handles wraparound, and holds on release', () => {
  const clutch = new TiltClutch(); assert.equal(clutch.sample(30), null);
  clutch.hold(3, 0); assert.equal(clutch.sample(6), 3); assert.equal(clutch.sample(9), 4); assert.equal(clutch.sample(5), 4); assert.equal(clutch.sample(3), 3);
  assert.equal(clutch.sample(80), 5); assert.equal(clutch.sample(-80), 1);
  clutch.release(); assert.equal(clutch.sample(0), null);
  clutch.hold(3, 179); assert.equal(clutch.sample(-179), 3);
  assert.ok(Math.abs(screenTilt(20, 10, 90) - 20) < .001);
  assert.equal(screenTilt(null, 10), null);
});
test('HTTP pairing, origin protection, validation, persistence, and secret isolation without sockets', async t => {
  const { pilot } = fixture(t); const origin = 'https://pi.example.ts.net';
  const handle = createHandler({ pilot, pairingCode: 'test-pairing-code', origins: [origin] });
  let cookie;
  async function request(path, method = 'GET', body, extra = {}) {
    return handle(new Request(origin + path, { method, headers: { Origin: origin, 'X-Pilot-Client': '1', ...(cookie ? { Cookie: cookie } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  }
  assert.equal((await request('/api/state')).status, 401);
  let response = await request('/api/unlock', 'POST', { code: 'test-pairing-code' });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/); assert.match(response.headers.get('set-cookie'), /Secure/); cookie = response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/conversations', 'POST', {}, { Origin: 'https://evil.test' })).status, 403);
  const c = await (await request('/api/conversations', 'POST', {})).json();
  response = await request(`/api/conversations/${c.id}/controls`, 'PATCH', { ...defaults, effort: 6 }); assert.equal(response.status, 400);
  response = await request(`/api/conversations/${c.id}/controls`, 'PATCH', { ...defaults, effort: 5 }); assert.equal(response.status, 200);
  const reloaded = await (await request(`/api/conversations/${c.id}`)).json(); assert.equal(reloaded.controls.effort, 5);
  response = await request('/api/state'); const data = await response.text(); assert.doesNotMatch(data, /test-pairing-code|OPENAI_API_KEY/);
  assert.equal((await request('/.env')).status, 404); assert.equal((await request('/data/pilot.sqlite')).status, 404); assert.equal((await request('/proposal.html')).status, 404);
  assert.equal((await request('/')).status, 200);
});

test('starting a second server does not mark an active turn failed before binding succeeds', t => {
  const { store, path } = fixture(t); const c = store.create();
  store.saveTurn({ id: 'still-active', conversation: c.id, status: 'pending', created: new Date().toISOString(), controls: defaults });
  const second = new Store(path, { recover: false });
  try { assert.equal(second.turn('still-active').status, 'pending'); }
  finally { second.close(); }
});
test('all conversations share one budget; in-flight reservations cannot overbook it', async t => {
  let complete;
  const { store, pilot } = fixture(t, { mode: 'live', key: 'test', respond: () => new Promise(r => { complete = r; }) }, .2);
  const a = store.create(), b = store.create(), request = input();
  pilot.begin(a.id, request);
  assert.throws(() => pilot.begin(b.id, input()), /budget/);
  complete({ text: 'done', status: 'completed', usage: { input_tokens: 10, output_tokens: 10 } });
  await pilot.jobs.get(request.requestId);
  assert.ok(store.spent() < .001);
});
test('a turn snapshot never overwrites a newer persistent control selection', async t => {
  const { store, pilot } = fixture(t); const c = store.create();
  const newer = { ...defaults, critique: 5 }; store.controls(c.id, newer);
  const request = input('snapshot', defaults); pilot.begin(c.id, request);
  await pilot.jobs.get(request.requestId);
  assert.deepEqual(store.get(c.id).controls, newer);
  assert.deepEqual(store.turn(request.requestId).controls, defaults);
});
test('file transcription sends the recorded WAV and selected speech model', async () => {
  const audio = Buffer.from(await encodeWav([new Float32Array(16000)], 16000).arrayBuffer());
  const provider = new Provider({ mode: 'live', key: 'test', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(options.body.get('model'), 'gpt-transcribe');
    assert.equal(options.body.get('file').type, 'audio/wav');
    assert.equal(wavDuration(await options.body.get('file').arrayBuffer()), 1);
    return Response.json({ text: ' Spoken thought. ' });
  } });
  assert.equal(await provider.transcribe(audio), 'Spoken thought.');
});
