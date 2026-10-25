import { DIALS, DEFAULT_CONTROLS, describeControls } from './controls.js';
import { TiltClutch, screenTilt } from './motion.js';
import { openMicrophone } from './audio.js';
import { MODES, DEFAULT_MODE } from './modes.js';
const $ = id => document.getElementById(id);
let conversation, state, controls = { ...DEFAULT_CONTROLS }, selected = 'implementation';
let partnershipMode = DEFAULT_MODE;
let sending = false, recording = false, mic, micOpening, recordingTimer, talkPointer = null, adjustPointer = null;
let latestAngle = null, sensorAt = 0, motionEnabled = false, renderKey = '', version = 0, savedVersion = 0, saveTimer;
let saveQueue = Promise.resolve(), polling = false, switching = false, epoch = 0;
const clutch = new TiltClutch();
const storage = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k,v) { try { localStorage.setItem(k,v); } catch {} } };
const error = message => { $('error').textContent = message || ''; $('error').hidden = !message; };
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'X-Pilot-Client': '1', ...options.headers } }); }
  catch { throw new Error('Cannot reach the local server. Reconnect, then check this conversation before sending again. Nothing is automatically replayed.'); }
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) $('pairing').hidden = false; throw new Error(data.error || 'Request failed.'); }
  return data;
}
function busy() { return sending || recording || talkPointer !== null || switching || state?.configuring || conversation?.turns.some(t => t.status === 'pending'); }
function renderControls() {
  for (const [key, dial] of Object.entries(DIALS)) {
    const card = document.querySelector(`[data-dial="${key}"]`);
    card.classList.toggle('selected', key === selected);
    card.querySelector('.dial-select').setAttribute('aria-pressed', String(key === selected));
    card.querySelector('output').textContent = dial.labels[controls[key] - 1];
    card.querySelector('.position-count').textContent = `${controls[key]} / 5`;
    card.querySelectorAll('[data-position]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.position) === controls[key])));
  }
  $('selected-hint').textContent = `${DIALS[selected].title} · ${DIALS[selected].meanings[controls[selected] - 1]}`;
  for (const key of Object.keys(MODES)) {
    $('mode-' + key).setAttribute('aria-pressed', String(key === partnershipMode));
    $('mode-' + key).disabled = switching;
  }
  $('mode-description').textContent = MODES[partnershipMode].description;
  const active = conversation?.turns.find(t => t.status === 'pending');
  const changed = active && (active.partnershipMode !== partnershipMode || Object.keys(DIALS).some(k => active.controls[k] !== controls[k]));
  $('pending-controls').hidden = !changed;
  $('pending-controls').textContent = 'Mode or controls changed. This reply finishes with its original settings; your new choices apply to the next turn.';
}
function setControl(key, value) {
  if (switching || controls[key] === value) return;
  controls[key] = value; version++;
  $('save-status').textContent = 'Saving…'; renderControls();
  clearTimeout(saveTimer); saveTimer = setTimeout(() => void persistControls().catch(e => error(e.message)), 180);
}
function selectDial(key) {
  selected = key;
  if (clutch.active) releaseAdjust();
  renderControls();
}
function persistControls() {
  clearTimeout(saveTimer);
  const id = conversation?.id, snapshot = { controls: { ...controls }, partnershipMode }, target = version;
  if (!id || target === savedVersion) return saveQueue;
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await api(`/api/conversations/${id}/settings`, { method: 'PATCH', body: JSON.stringify(snapshot) });
    if (conversation.id === id) {
      savedVersion = target;
      $('save-status').textContent = version === target ? 'Saved locally' : 'Saving…';
    }
  }).catch(e => { $('save-status').textContent = 'Not saved — reconnect'; throw e; });
  return saveQueue;
}
for (const key of Object.keys(MODES)) $('mode-' + key).onclick = () => {
  if (switching || partnershipMode === key) return;
  partnershipMode = key; version++;
  $('save-status').textContent = 'Saving…'; renderControls();
  clearTimeout(saveTimer); saveTimer = setTimeout(() => void persistControls().catch(e => error(e.message)), 180);
};
for (const [key, dial] of Object.entries(DIALS)) {
  const card = document.createElement('section'); card.className = 'dial'; card.dataset.dial = key;
  const heading = document.createElement('div'); heading.className = 'dial-heading';
  const select = document.createElement('button'); select.className = 'dial-select'; select.textContent = dial.title; select.setAttribute('aria-label', `Select ${dial.title} for steering`); select.onclick = () => selectDial(key);
  const count = document.createElement('span'); count.className = 'position-count';
  heading.append(select, count);
  const output = document.createElement('output'); output.setAttribute('aria-label', dial.title);
  const positions = document.createElement('div'); positions.className = 'positions'; positions.setAttribute('role', 'group'); positions.setAttribute('aria-label', dial.title);
  dial.labels.forEach((label, i) => {
    const b = document.createElement('button'); b.textContent = i + 1; b.dataset.position = i + 1; b.title = label; b.setAttribute('aria-label', `${dial.title}: ${label}`);
    b.onclick = () => { selectDial(key); setControl(key, i + 1); }; positions.append(b);
  });
  card.append(heading, output, positions); $('dials').append(card);
}
// Keyboard, on-screen arrows, and tilt all change the same persistent controls.
function steer(direction) {
  if (!conversation || switching || !$('pairing').hidden || $('devices').open || $('api-setup').open) return;
  const keys = Object.keys(DIALS), index = keys.indexOf(selected);
  if (direction === 'up' || direction === 'down') {
    selectDial(keys[(index + (direction === 'up' ? -1 : 1) + keys.length) % keys.length]);
  } else {
    releaseAdjust();
    setControl(selected, Math.max(1, Math.min(5, controls[selected] + (direction === 'left' ? -1 : 1))));
  }
}
for (const direction of ['up', 'down', 'left', 'right']) $('steer-' + direction).onclick = () => steer(direction);
$('steer').onclick = () => $('steer').focus();
const editing = target => target?.isContentEditable || target?.closest('input, textarea, select, [role="textbox"]');
window.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || !conversation || switching || !$('pairing').hidden || $('devices').open || $('api-setup').open) return;
  if (e.key === 'Escape' && e.target === $('message')) {
    e.preventDefault(); $('steer').focus(); return;
  }
  if (editing(e.target) || e.target?.closest('#messages')) return;
  const direction = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' }[e.key.toLowerCase()];
  if (!direction) return;
  e.preventDefault(); steer(direction);
});
window.addEventListener('focusin', e => {
  $('keyboard-status').textContent = editing(e.target) ? 'Typing · steering paused' : 'Ready to steer';
});
function setPhoneControls(enabled) {
  $('instrument').classList.toggle('phone-controls', enabled);
  $('input-mode').setAttribute('aria-pressed', String(enabled));
  $('device-button').hidden = !enabled;
  storage.set('pi-fold-phone-controls', String(enabled));
  cancelGestures();
}
$('input-mode').onclick = () => setPhoneControls($('device-button').hidden);
function message(who, content, kind, turn) {
  const node = document.createElement('article'); node.className = `message ${kind}`;
  const label = document.createElement('span'); label.className = 'who'; label.textContent = who;
  const body = document.createElement('div'); body.className = 'content'; body.textContent = content;
  node.append(label, body);
  if (turn) {
    const details = document.createElement('details'), summary = document.createElement('summary'), info = document.createElement('p');
    summary.textContent = 'Settings used'; info.textContent = `${turn.partnershipMode ? MODES[turn.partnershipMode].title + ' mode · ' : ''}${describeControls(turn.controls)}`; details.append(summary, info);
    if (turn.usage) { const usage = document.createElement('p'); usage.textContent = `Tokens: ${turn.usage.input_tokens} in / ${turn.usage.output_tokens} out (includes reasoning)`; details.append(usage); }
    node.append(details);
  }
  return node;
}
function renderConversation() {
  const key = JSON.stringify(conversation.turns);
  if (key !== renderKey) {
    const panel = $('messages'); const nearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 100;
    panel.replaceChildren();
    if (!conversation.turns.length) {
      const empty = document.createElement('div'); empty.className = 'empty';
      const title = document.createElement('h2'); title.textContent = 'What’s on your mind?';
      const p = document.createElement('p'); p.textContent = 'A question, a rough idea, something you want to make. Steer the four controls to choose how we work together, then bring a thought.';
      empty.append(title, p); panel.append(empty);
    }
    for (const turn of conversation.turns) {
      if (turn.text) panel.append(message(turn.source === 'voice' ? 'YOU · VOICE' : 'YOU', turn.text, 'user'));
      if (turn.status === 'complete') panel.append(message(turn.mode === 'demo' ? 'INSTRUMENT · DEMO' : 'INSTRUMENT', turn.answer + (turn.incomplete ? '\n\n[The response reached its output limit. You can ask it to continue.]' : ''), 'assistant', turn));
      if (turn.status === 'failed') panel.append(message('TURN DID NOT FINISH', turn.error, 'failed', turn));
      if (turn.status === 'pending') panel.append(message('INSTRUMENT', turn.stage === 'transcribing' ? 'Listening back to your recording…' : 'Working with your current settings…', 'pending', turn));
    }
    if (nearBottom || renderKey === '') panel.scrollTop = panel.scrollHeight;
    renderKey = key;
  }
  const active = conversation.turns.find(t => t.status === 'pending');
  $('activity').textContent = recording ? 'Recording…' : sending ? 'Sending…' : active ? (active.stage === 'transcribing' ? 'Transcribing…' : 'Thinking…') : 'Ready';
  $('send').disabled = Boolean(busy() || state?.ready === false); $('new').disabled = Boolean(busy()); $('conversations').disabled = Boolean(busy());
  document.querySelectorAll('.talk').forEach(b => { b.disabled = Boolean(!recording && (busy() || state?.ready === false)); });
  renderControls();
}
function renderState() {
  $('mode').textContent = state.mode === 'demo' ? 'DEMO · NO API COST' : state.ready ? 'LIVE · GPT-6.1 SOL' : 'CONNECT API TO BEGIN';
  $('budget').textContent = state.mode === 'demo' ? 'Conversations saved locally' : `$${state.accounted.toFixed(3)} accounted / $${state.budget.toFixed(2)} budget`;
  $('demo-notice').hidden = state.mode !== 'demo' && state.ready;
  $('demo-notice').textContent = state.mode === 'demo' ? 'Interaction demo · Replies are placeholders. Open API setup to connect live AI.' : 'Ready for live AI · Open API setup and enter your project key to begin.';
  $('api-button').disabled = Boolean(busy());
  const select = $('conversations'); select.replaceChildren();
  for (const item of state.conversations) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; select.append(option); }
  if (conversation) select.value = conversation.id;
}
async function loadConversation(id) {
  conversation = await api(`/api/conversations/${id}`);
  controls = { ...conversation.controls }; version = savedVersion = 0; renderKey = '';
  partnershipMode = conversation.partnershipMode || DEFAULT_MODE;
  $('save-status').textContent = 'Saved locally'; storage.set('pi-fold-conversation', id); renderConversation();
}
async function boot() {
  state = await api('/api/state');
  const last = storage.get('pi-fold-conversation');
  const id = state.conversations.find(c => c.id === last)?.id || state.conversations[0]?.id;
  if (id) await loadConversation(id);
  else { const created = await api('/api/conversations', { method: 'POST', body: '{}' }); await loadConversation(created.id); state = await api('/api/state'); }
  renderState(); $('pairing').hidden = true; $('instrument').hidden = false;
}
$('pair-form').onsubmit = async e => {
  e.preventDefault();
  try { await api('/api/unlock', { method: 'POST', body: JSON.stringify({ code: $('pair-code').value.trim() }) }); $('pair-code').value = ''; await boot(); }
  catch (e) { $('pair-error').textContent = e.message; }
};
$('new').onclick = async () => {
  if (busy()) return; switching = true; releaseAdjust(); renderConversation();
  try { await persistControls(); const c = await api('/api/conversations', { method: 'POST', body: JSON.stringify({ controls, partnershipMode }) }); await loadConversation(c.id); state = await api('/api/state'); renderState(); error(''); }
  catch (e) { error(e.message); } finally { switching = false; renderConversation(); }
};
$('conversations').onchange = async e => {
  if (busy()) return; const id = e.target.value; switching = true; releaseAdjust(); renderConversation();
  try { await persistControls(); await loadConversation(id); error(''); }
  catch (e) { error(e.message); } finally { switching = false; $('conversations').value = conversation.id; renderConversation(); }
};
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ ...conversation, controls, partnershipMode }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `pi-fold-${conversation.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function submit(payload, snapshot = { ...controls }, modeSnapshot = partnershipMode) {
  if (busy() || state?.ready === false) return;
  epoch++; sending = true; error(''); renderConversation();
  const id = conversation.id, draft = $('message').value;
  try {
    await persistControls();
    const turn = await api(`/api/conversations/${id}/turns`, { method: 'POST', body: JSON.stringify({ ...payload, controls: snapshot, partnershipMode: modeSnapshot, requestId: crypto.randomUUID() }) });
    if (!conversation.turns.some(t => t.id === turn.id)) conversation.turns.push(turn);
    // An acknowledgment belongs to the submitted draft, not anything typed since.
    if (payload.text && $('message').value === draft) $('message').value = '';
  } catch (e) { error(e.message); }
  finally { sending = false; renderConversation(); }
}
$('compose').onsubmit = e => { e.preventDefault(); const text = $('message').value.trim(); if (text) void submit({ text }); };
$('message').onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('compose').requestSubmit(); } };
$('api-button').onclick = () => {
  if (busy()) return;
  $('api-key').value = ''; $('api-key').required = !state.hasKey;
  $('api-budget').value = state.budget > 0 ? state.budget : '';
  $('key-status').textContent = state.hasKey ? 'A key is saved. Leave blank to keep it, or enter a replacement.' : 'Paste the key here, not in chat.';
  $('api-result').textContent = '';
  $('api-setup').showModal();
};
$('close-api').onclick = () => $('api-setup').close();
$('api-setup').onclose = $('api-setup').oncancel = () => { $('api-key').value = ''; };
$('api-form').onsubmit = async e => {
  e.preventDefault();
  if ($('connect-api').disabled) return;
  const payload = { key: $('api-key').value.trim(), budget: Number($('api-budget').value) };
  $('api-key').value = ''; $('connect-api').disabled = true;
  $('api-result').textContent = 'Checking model access…';
  try {
    state = await api('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
    $('api-key').required = false;
    $('key-status').textContent = 'A key is saved. Leave blank to keep it, or enter a replacement.';
    $('api-result').textContent = 'Connected. Close this panel and send a thought to get a live AI reply.';
    renderState(); renderConversation();
  } catch (e) { $('api-result').textContent = e.message; }
  finally { payload.key = ''; $('connect-api').disabled = false; }
};
$('device-button').onclick = () => { $('secure-status').textContent = isSecureContext ? 'Secure connection ready.' : 'This address is not secure. Open the Tailscale HTTPS address for microphone and tilt.'; $('devices').showModal(); };
$('close-devices').onclick = () => $('devices').close();
$('enable-mic').onclick = async () => {
  if (mic || micOpening) return;
  micOpening = true; $('mic-status').textContent = 'Waiting for microphone permission…';
  try { mic = await openMicrophone(); $('mic-status').textContent = 'Microphone ready. Close this panel and hold Talk.'; }
  catch (e) { $('mic-status').textContent = e.message; }
  finally { micOpening = false; }
};
$('enable-motion').onclick = async () => {
  try {
    if (!isSecureContext || !window.DeviceOrientationEvent) throw new Error('Tilt needs HTTPS and an orientation sensor. Touch controls are available.');
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('Motion permission was not granted.');
    motionEnabled = true; $('motion-status').textContent = 'Waiting for sensor readings…';
    setTimeout(() => { if (!sensorAt) $('motion-status').textContent = 'No sensor readings received. Check browser permissions or use touch controls.'; }, 3000);
  } catch (e) { $('motion-status').textContent = e.message; }
};
window.addEventListener('deviceorientation', e => {
  if (!motionEnabled) return;
  const angle = screenTilt(e.beta, e.gamma, screen.orientation?.angle || 0);
  if (angle === null) return;
  latestAngle = angle; sensorAt = performance.now(); $('motion-status').textContent = 'Tilt sensor responding. Hold Adjust to move the selected dial.';
  const value = clutch.sample(angle); if (value !== null) setControl(selected, value);
});
function releaseAdjust() { adjustPointer = null; clutch.release(); document.querySelectorAll('.adjust').forEach(b => b.classList.remove('held')); }
function releaseTalk(cancel = false) {
  talkPointer = null; clearTimeout(recordingTimer);
  document.querySelectorAll('.talk').forEach(b => b.classList.remove('held'));
  if (!recording) return;
  // Freeze the release-time settings before asynchronous audio conversion.
  const snapshot = { ...controls }, modeSnapshot = partnershipMode;
  recording = false; const blob = mic.stop(); renderConversation();
  if (cancel) { error('Recording cancelled. Nothing was sent.'); return; }
  if (blob.size < 6444) { error('Hold Talk a little longer, or type your message.'); return; }
  // Convert before submission without allowing another gesture to overtake this recording.
  sending = true; renderConversation();
  void blob.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer); let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    sending = false; return submit({ audio: btoa(binary) }, snapshot, modeSnapshot);
  }).catch(e => { sending = false; error(e.message); renderConversation(); });
}
for (const button of document.querySelectorAll('.talk')) {
  button.oncontextmenu = e => e.preventDefault();
  button.onpointerdown = async e => {
    if (e.button !== 0 || talkPointer !== null || busy()) return;
    e.preventDefault();
    if (!mic) { $('devices').showModal(); $('mic-status').textContent = 'Enable the microphone here first, then hold Talk.'; return; }
    talkPointer = e.pointerId; button.setPointerCapture(e.pointerId);
    try {
      await mic.start();
      if (talkPointer !== e.pointerId) { mic.stop(); return; }
      recording = true; error(''); button.classList.add('held'); renderConversation();
      recordingTimer = setTimeout(() => releaseTalk(), 90000);
    } catch (e) { talkPointer = null; error(e.message); }
  };
  button.onpointerup = e => { if (talkPointer === e.pointerId) releaseTalk(); };
  button.onpointercancel = e => { if (talkPointer === e.pointerId) releaseTalk(true); };
  button.onlostpointercapture = e => { if (talkPointer === e.pointerId) releaseTalk(true); };
}
for (const button of document.querySelectorAll('.adjust')) {
  button.oncontextmenu = e => e.preventDefault();
  button.onpointerdown = e => {
    if (e.button !== 0 || adjustPointer !== null || switching) return;
    e.preventDefault();
    if (!motionEnabled || latestAngle === null || performance.now() - sensorAt > 2000) { error('Enable tilt in Device check and wait for sensor readings. Touch controls are available.'); return; }
    adjustPointer = e.pointerId; button.setPointerCapture(e.pointerId); clutch.hold(controls[selected], latestAngle); button.classList.add('held'); error('');
  };
  button.onpointerup = button.onpointercancel = button.onlostpointercapture = e => { if (adjustPointer === e.pointerId) releaseAdjust(); };
}
function cancelGestures() { releaseAdjust(); releaseTalk(true); }
window.addEventListener('blur', cancelGestures);
screen.orientation?.addEventListener('change', () => { releaseAdjust(); latestAngle = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelGestures(); mic?.close(); mic = null; $('mic-status').textContent = 'Microphone closed. Enable it again to talk.'; } });
window.addEventListener('pagehide', () => mic?.close());
setInterval(async () => {
  if (!conversation || polling || switching || sending || document.hidden || !$('pairing').hidden) return;
  polling = true;
  const id = conversation.id, startedAt = epoch;
  try {
    const fresh = await api(`/api/conversations/${id}`);
    if (conversation.id !== id || switching || startedAt !== epoch || sending) return;
    conversation = fresh;
    // Preserve local dial adjustments while a response completes.
    renderConversation(); state = await api('/api/state'); renderState();
  } catch (e) { error(e.message); }
  finally { polling = false; }
}, 1200);
renderControls();
setPhoneControls(storage.get('pi-fold-phone-controls') === 'true');
void boot().catch(e => { $('pair-error').textContent = e.message; });
