import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { DIALS, DEFAULT_CONTROLS, describeControls } from '../public/controls.js';
import { TiltClutch, screenTilt } from '../public/motion.js';
import { MODES, DEFAULT_MODE } from '../public/modes.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const pointer = pointerId => ({ pointerId, button: 0, preventDefault() {} });

// A minimal DOM adapter for app event tests, not a layout or device simulator.
class Element {
  constructor(tag = 'div') {
    Object.assign(this, { tag, children: [], dataset: {}, attributes: {}, className: '', value: '', textContent: '', hidden: false, scrollHeight: 0, scrollTop: 0, clientHeight: 0 });
    this.classList = {
      toggle: (name, on) => {
        const names = new Set(this.className.split(' ').filter(Boolean));
        if (on) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
      },
      add: name => this.classList.toggle(name, true),
      remove: name => this.classList.toggle(name, false)
    };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  closest(selector) {
    if (selector === '#messages') return this.id === 'messages' ? this : null;
    return ['input', 'textarea', 'select'].includes(this.tag) || this.attributes.role === 'textbox' ? this : null;
  }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.onclose?.(); }
  setPointerCapture() {}
  querySelectorAll(selector) {
    const matches = node => {
      if (selector.startsWith('.')) return node.className.split(' ').includes(selector.slice(1));
      if (selector === '[data-position]') return node.dataset.position !== undefined;
      const dial = selector.match(/^\[data-dial="(.+)"\]$/);
      return dial ? node.dataset.dial === dial[1] : node.tag === selector;
    };
    return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
}

async function browser({ ready = true } = {}) {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  for (const [id, node] of Object.entries(elements)) node.id = id;
  elements.message.tag = 'textarea'; elements['pair-code'].tag = 'input'; elements.conversations.tag = 'select';
  const root = new Element(); root.append(...Object.values(elements));
  const talk = [new Element('button'), new Element('button')];
  const adjust = [new Element('button'), new Element('button')];
  talk.forEach(node => { node.className = 'talk'; });
  adjust.forEach(node => { node.className = 'adjust'; });
  root.append(...talk, ...adjust);
  const listeners = new Map(), timers = new Map(); let timerId = 0;
  const conversion = Promise.withResolvers();
  const turns = [];
  const setup = Promise.withResolvers(), setupRequests = [];
  const saved = { id: 'test-conversation', title: 'Test', controls: { ...DEFAULT_CONTROLS }, partnershipMode: DEFAULT_MODE, turns: [] };
  const fetch = async (path, options = {}) => {
    if (path === '/api/state') return Response.json({ mode: ready ? 'demo' : 'live', ready, hasKey: false, budget: 25, accounted: 0, conversations: [{ id: saved.id, title: saved.title }] });
    if (path === '/api/settings') { setupRequests.push(JSON.parse(options.body)); return setup.promise; }
    if (path === `/api/conversations/${saved.id}`) return Response.json(saved);
    if (path.endsWith('/controls')) { saved.controls = JSON.parse(options.body); return Response.json({ ok: true }); }
    if (path.endsWith('/settings')) { Object.assign(saved, JSON.parse(options.body)); return Response.json({ ok: true }); }
    if (path.endsWith('/turns')) {
      const request = JSON.parse(options.body), acknowledgment = Promise.withResolvers();
      turns.push({ request, acknowledgment });
      return acknowledgment.promise;
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  // Execute the entire application with real control/motion modules and fake browser
  // boundaries. Only imports are removed; event handlers and submission logic are intact.
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/^import .+;\n/gm, '');
  runInNewContext(source, {
    DIALS, DEFAULT_CONTROLS, describeControls, TiltClutch, screenTilt, MODES, DEFAULT_MODE,
    document: {
      getElementById: id => elements[id], createElement: tag => new Element(tag),
      querySelector: selector => root.querySelector(selector), querySelectorAll: selector => root.querySelectorAll(selector),
      addEventListener() {}, hidden: false
    },
    window: { addEventListener: (name, callback) => listeners.set(name, callback), DeviceOrientationEvent: {} },
    screen: { orientation: { angle: 0, addEventListener() {} } },
    isSecureContext: true, DeviceOrientationEvent: {}, localStorage: { getItem() { return null; }, setItem() {} },
    openMicrophone: async () => ({ start: async () => {}, stop: () => ({ size: 32044, arrayBuffer: () => conversion.promise }), close() {} }),
    fetch, crypto: { randomUUID }, performance: { now: () => 100 },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id), setInterval() {}
  }, { filename: 'public/app.js' });
  await flush();
  assert.equal(elements['pair-error'].textContent, '');
  assert.equal(elements.instrument.hidden, false);
  return {
    elements, talk, adjust, conversion, turns, saved, timers, setup, setupRequests,
    key(key, extra = {}) {
      const event = { key, target: root, preventDefault() { this.defaultPrevented = true; }, ...extra };
      listeners.get('keydown')(event);
      return event;
    },
    orient: gamma => listeners.get('deviceorientation')({ beta: 0, gamma }),
    dial: key => root.querySelector(`[data-dial="${key}"]`),
    send(text) { elements.message.value = text; elements.compose.onsubmit({ preventDefault() {} }); },
    acknowledge(index = 0, status = 202) {
      const { request, acknowledgment } = turns[index];
      acknowledgment.resolve(Response.json(status === 202 ? { id: request.requestId, text: request.text, controls: request.controls, partnershipMode: request.partnershipMode, status: 'pending', stage: 'thinking' } : { error: 'Rejected for test' }, { status }));
    }
  };
}

test('a delayed send acknowledgment preserves a newly typed draft', async () => {
  const page = await browser();
  page.send('original thought');
  await flush();
  assert.equal(page.turns[0].request.text, 'original thought');
  page.elements.message.value = 'the next thought';
  page.acknowledge();
  await flush();
  assert.equal(page.elements.message.value, 'the next thought');
});

test('a successful send clears the unchanged draft, including surrounding whitespace', async () => {
  const page = await browser();
  page.send('  original thought\n');
  await flush();
  assert.equal(page.turns[0].request.text, 'original thought');
  page.acknowledge();
  await flush();
  assert.equal(page.elements.message.value, '');
});

for (const edit of [false, true]) test(`a rejected send preserves the ${edit ? 'edited' : 'original'} draft`, async () => {
  const page = await browser();
  page.send('original thought');
  await flush();
  if (edit) page.elements.message.value = 'revised thought';
  page.acknowledge(0, 400);
  await flush();
  assert.equal(page.elements.message.value, edit ? 'revised thought' : 'original thought');
  assert.equal(page.elements.error.textContent, 'Rejected for test');
  assert.equal(page.elements.send.disabled, false);
});

for (const [side, timeout] of [[0, false], [1, false], [0, true]]) test(`voice freezes settings at ${timeout ? '90-second stop' : `Talk release (side ${side})`} while Adjust continues`, async () => {
  const page = await browser();
  page.elements.message.value = 'a separate typed draft';
  await page.elements['enable-mic'].onclick();
  await page.elements['enable-motion'].onclick();
  assert.equal(page.elements['motion-status'].textContent, 'Waiting for sensor readings…');
  page.dial('wildness').querySelector('.dial-select').onclick();
  page.orient(0);
  page.adjust[1 - side].onpointerdown(pointer(2));
  await page.talk[side].onpointerdown(pointer(1));
  page.orient(12); // Wildness 3 at release, different from its starting value of 2.
  assert.equal(page.dial('wildness').querySelector('output').textContent, 'Inventive / surprising');
  if (timeout) [...page.timers.values()].find(timer => timer.delay === 90000).callback();
  else page.talk[side].onpointerup(pointer(1));
  page.orient(36); // Still holding Adjust: wildness 5 for the NEXT turn.
  page.talk[side].onlostpointercapture(pointer(1));
  page.conversion.resolve(new ArrayBuffer(32044));
  await flush();
  assert.equal(page.turns.length, 1);
  assert.equal(page.turns[0].request.controls.wildness, 3);
  assert.equal(page.saved.controls.wildness, 5);
  page.acknowledge();
  await flush();
  assert.equal(page.elements['pending-controls'].hidden, false);
  assert.equal(page.elements.message.value, 'a separate typed draft');
});

test('cancelling Talk does not submit a voice turn', async () => {
  const page = await browser();
  await page.elements['enable-mic'].onclick();
  await page.talk[0].onpointerdown(pointer(1));
  page.talk[0].onpointercancel(pointer(1));
  page.conversion.resolve(new ArrayBuffer(32044));
  await flush();
  assert.equal(page.turns.length, 0);
  assert.equal(page.elements.error.textContent, 'Recording cancelled. Nothing was sent.');
  assert.equal(page.elements.send.disabled, false);
});

test('WASD and arrows steer, wrap selection, clamp positions, and persist the same controls', async () => {
  const page = await browser();
  assert.equal(page.key('ArrowLeft').defaultPrevented, true); // Implementation 5 -> 4.
  page.key('s'); page.key('D'); // Wildness 2 -> 3, including uppercase.
  page.key('ArrowDown'); page.key('ArrowRight'); // Effort 2 -> 3.
  page.key('s'); page.key('a'); // Critique 3 -> 2.
  page.key('ArrowDown'); // Wrap to implementation.
  for (let i = 0; i < 10; i++) page.key('d', { repeat: true });
  assert.equal(page.dial('implementation').querySelector('output').textContent, 'Make it happen');
  for (let i = 0; i < 10; i++) page.key('a');
  assert.equal(page.dial('implementation').querySelector('output').textContent, 'Feel around');
  page.key('w'); // Wrap back to critique.
  assert.equal(page.dial('critique').querySelector('.dial-select').attributes['aria-pressed'], 'true');
  page.elements['steer-right'].onclick();
  [...page.timers.values()].find(timer => timer.delay === 180).callback();
  await flush();
  assert.deepEqual(page.saved.controls, { implementation: 1, wildness: 3, effort: 3, critique: 3 });
  assert.equal(page.elements['save-status'].textContent, 'Saved locally');
});

test('steering leaves text editing, native selects, shortcuts, IME, dialogs and pairing alone', async () => {
  const page = await browser();
  const editable = new Element(); editable.isContentEditable = true;
  for (const target of [page.elements.message, page.elements['pair-code'], page.elements.conversations, editable, page.elements.messages]) {
    assert.equal(page.key('ArrowLeft', { target }).defaultPrevented, undefined);
    assert.equal(page.key('a', { target }).defaultPrevented, undefined);
  }
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
    assert.equal(page.key('a', extra).defaultPrevented, undefined);
  }
  page.elements.devices.open = true;
  assert.equal(page.key('a').defaultPrevented, undefined);
  page.elements.devices.open = false; page.elements.pairing.hidden = false;
  assert.equal(page.key('a').defaultPrevented, undefined);
  page.elements.pairing.hidden = true;
  assert.equal(page.dial('implementation').querySelector('output').textContent, 'Make it happen');
  page.elements.message.value = 'wasd is part of my thought';
  assert.equal(page.key('Escape', { target: page.elements.message }).defaultPrevented, true);
  assert.equal(page.elements.steer.focused, true);
  assert.equal(page.elements.message.value, 'wasd is part of my thought');
});

test('keyboard steering during a send preserves its snapshot and updates the next turn', async () => {
  const page = await browser();
  page.key('s'); page.key('d'); // Wildness 3 for this message.
  page.send('Explore an idea');
  await flush();
  page.key('d'); page.key('d'); // Wildness 5 while awaiting acknowledgment.
  [...page.timers.values()].find(timer => timer.delay === 180).callback();
  await flush();
  assert.equal(page.turns[0].request.controls.wildness, 3);
  assert.equal(page.saved.controls.wildness, 5);
  page.acknowledge();
  await flush();
  assert.equal(page.elements['pending-controls'].hidden, false);
  assert.equal(page.dial('wildness').querySelector('output').textContent, 'Ridiculous');
});

test('mode changes save without resetting dials and typed submissions freeze the chosen mode', async () => {
  const page = await browser();
  page.key('a'); // Implementation 4.
  page.elements['mode-extract'].onclick();
  page.send('Find the useful pieces');
  await flush();
  assert.equal(page.turns[0].request.partnershipMode, 'extract');
  assert.equal(page.turns[0].request.controls.implementation, 4);
  page.elements['mode-boss'].onclick();
  [...page.timers.values()].find(timer => timer.delay === 180).callback();
  await flush();
  assert.equal(page.saved.partnershipMode, 'boss');
  assert.equal(page.saved.controls.implementation, 4);
  page.acknowledge(); await flush();
  assert.equal(page.elements['pending-controls'].hidden, false);
  assert.equal(page.elements['mode-boss'].attributes['aria-pressed'], 'true');
});

test('voice mode is frozen at release, before asynchronous audio conversion', async () => {
  const page = await browser();
  await page.elements['enable-mic'].onclick();
  page.elements['mode-extract'].onclick();
  await page.talk[0].onpointerdown(pointer(1));
  page.talk[0].onpointerup(pointer(1));
  page.elements['mode-boss'].onclick();
  page.conversion.resolve(new ArrayBuffer(32044));
  await flush();
  assert.equal(page.turns[0].request.partnershipMode, 'extract');
  assert.equal(page.saved.partnershipMode, 'boss');
});

test('API setup clears keys, pauses steering, and enables real sends only after configuration succeeds', async () => {
  const page = await browser({ ready: false });
  assert.equal(page.elements.send.disabled, true);
  page.send('Do not submit before setup'); await flush();
  assert.equal(page.turns.length, 0);
  page.elements['api-button'].onclick();
  assert.equal(page.elements['api-budget'].value, 25);
  assert.equal(page.key('a').defaultPrevented, undefined);
  page.elements['api-key'].value = 'sk-offline-test-not-a-real-key';
  const configuring = page.elements['api-form'].onsubmit({ preventDefault() {} });
  assert.equal(page.elements['api-key'].value, '');
  assert.equal(page.elements['connect-api'].disabled, true);
  assert.equal(page.setupRequests[0].budget, 25);
  page.setup.resolve(Response.json({ mode: 'live', ready: true, hasKey: true, budget: 25, accounted: 0, conversations: [{ id: page.saved.id, title: 'Test' }] }));
  await configuring;
  assert.equal(page.elements.mode.textContent, 'LIVE · GPT-6.1 SOL');
  assert.equal(page.elements.send.disabled, false);
  assert.equal(page.elements['api-key'].value, '');
  assert.equal(page.elements['api-key'].required, false);
  page.elements['api-key'].value = 'a draft replacement';
  page.elements['close-api'].onclick();
  assert.equal(page.elements['api-key'].value, '');
});
