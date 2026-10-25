import { validateControls } from '../public/controls.js';
import { DEFAULT_MODE, validateMode } from '../public/modes.js';
import { responseBody, reserveForResponse, wavDuration } from './provider.js';
export class Pilot {
  constructor({ store, provider, budget = 0, settings }) { this.store = store; this.provider = provider; this.budget = budget; this.settings = settings; this.jobs = new Map(); this.configuring = false; }
  state() { return { mode: this.provider.mode, model: 'gpt-6.1-sol', budget: this.budget, accounted: this.store.spent(), hasKey: Boolean(this.provider.key), configuring: this.configuring, ready: this.provider.mode === 'demo' || Boolean(this.provider.key && this.budget > 0), conversations: this.store.list() }; }
  async configure(input) {
    if (!this.settings) throw new Error('API setup is not available on this server.');
    if (this.configuring || this.jobs.size) throw new Error('Let the current request finish before changing API settings.');
    if (!input || typeof input.key !== 'string' || !Number.isFinite(input.budget) || input.budget <= 0) throw new Error('Enter an API key and a positive total budget.');
    const key = input.key.trim() || this.provider.key;
    if (typeof key !== 'string' || !/^sk-[a-zA-Z0-9_-]{10,1000}$/.test(key)) throw new Error('Enter a valid OpenAI project API key.');
    if (input.budget <= this.store.spent()) throw new Error('The total budget must exceed the amount already accounted for.');
    this.configuring = true;
    try {
      await this.provider.checkAccess(key);
      this.settings.save({ mode: 'live', key, budget: input.budget });
      this.provider.key = key; this.provider.mode = 'live'; this.budget = input.budget;
    } finally { this.configuring = false; }
    return this.state();
  }
  begin(id, input) {
    if (this.configuring) throw new Error('API setup is in progress. Send your message once it finishes.');
    if (!input || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)) throw new Error('A valid request ID is required.');
    const conversation = this.store.get(id);
    if (!conversation) throw new Error('Conversation not found.');
    const existing = this.store.turn(input.requestId);
    if (existing) {
      if (existing.conversation !== id) throw new Error('Request ID belongs to another conversation.');
      return existing;
    }
    if (conversation.turns.some(t => t.status === 'pending')) throw new Error('Let the current response finish first.');
    const controls = validateControls(input.controls);
    const partnershipMode = validateMode(input.partnershipMode ?? conversation.partnershipMode ?? DEFAULT_MODE);
    let audio = null;
    if (input.audio !== undefined) {
      if (typeof input.audio !== 'string' || input.audio.length > 4_000_000) throw new Error('Recording is too large.');
      audio = Buffer.from(input.audio, 'base64'); wavDuration(audio);
    }
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!audio && (!text || text.length > 16000)) throw new Error('Enter a message of 1 to 16,000 characters.');
    if (this.provider.mode === 'live' && (!this.provider.key || !(this.budget > 0))) throw new Error('Live mode needs a backend API key and an approved pilot budget.');
    // Demo messages never become model context. Failed turns are visible but not silently resubmitted.
    const history = conversation.turns.filter(t => t.status === 'complete' && t.mode === this.provider.mode).flatMap(t => [{ role: 'user', content: t.text }, { role: 'assistant', content: t.answer }]);
    if (Buffer.byteLength(JSON.stringify(history)) > 160000) throw new Error('This pilot conversation is full. Export it and start a new conversation.');
    const turn = { id: input.requestId, conversation: id, created: new Date().toISOString(), status: 'pending', stage: audio ? 'transcribing' : 'thinking', mode: this.provider.mode, partnershipMode, controls, text, source: audio ? 'voice' : 'typed' };
    // Preflight enough budget for BOTH speech and a conservatively bounded transcript before recording a turn.
    if (this.provider.mode === 'live') {
      const body = responseBody(history, audio ? 'x'.repeat(64000) : text, controls, partnershipMode);
      this.store.reserve(`${turn.id}:response`, reserveForResponse(body), 'response', this.budget);
      try { if (audio) this.store.reserve(`${turn.id}:speech`, 0.015, 'speech', this.budget); }
      catch (e) { this.store.settle(`${turn.id}:response`, 0); throw e; }
    }
    this.store.saveTurn(turn);
    const job = this.run(turn, history, audio).finally(() => this.jobs.delete(turn.id));
    this.jobs.set(turn.id, job);
    return this.store.turn(turn.id);
  }
  async run(turn, history, audio) {
    try {
      if (audio) {
        turn.text = await this.provider.transcribe(audio);
        if (this.provider.mode === 'live') this.store.settle(`${turn.id}:speech`, Math.ceil(wavDuration(audio)) / 60 * 0.0045);
        if (Buffer.byteLength(turn.text) > 64000) throw new Error('Transcript exceeds the pilot limit. Type a shorter message.');
        turn.stage = 'thinking'; this.store.saveTurn(turn);
      }
      const result = await this.provider.respond(responseBody(history, turn.text, turn.controls, turn.partnershipMode));
      if (this.provider.mode === 'live' && Number.isFinite(result.usage?.input_tokens) && Number.isFinite(result.usage?.output_tokens)) {
        // Account at conservative rates (including headroom for cache writes); never claim dashboard billing.
        this.store.settle(`${turn.id}:response`, result.usage.input_tokens * 3 / 1e6 + result.usage.output_tokens * 15 / 1e6);
      }
      Object.assign(turn, { answer: result.text, status: 'complete', stage: null, usage: result.usage, responseId: result.responseId, incomplete: result.status === 'incomplete' });
    } catch (e) { Object.assign(turn, { status: 'failed', stage: null, error: e.message }); }
    this.store.saveTurn(turn);
  }
}
