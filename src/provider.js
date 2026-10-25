import { instructions, DIALS, describeControls } from '../public/controls.js';
import { DEFAULT_MODE, modeInstructions } from '../public/modes.js';
export const MODEL = 'gpt-6.1-sol';
export const SPEECH_MODEL = 'gpt-transcribe';
export const MAX_OUTPUT = 8192;
export function responseBody(history, text, controls, partnershipMode = DEFAULT_MODE) {
  return { model: MODEL, store: false, reasoning: { effort: DIALS.effort.values[controls.effort - 1] }, max_output_tokens: MAX_OUTPUT,
    instructions: instructions(controls) + '\n\n' + modeInstructions(partnershipMode), input: [...history, { role: 'user', content: text }] };
}
export function reserveForResponse(body) {
  // UTF-8 bytes conservatively bound text tokens; allow framing plus 50% rate headroom.
  return (Buffer.byteLength(JSON.stringify(body)) + 4096) * 3 / 1e6 + MAX_OUTPUT * 15 / 1e6;
}
export function wavDuration(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE' || b.toString('ascii', 12, 16) !== 'fmt ' || b.readUInt32LE(16) !== 16 || b.readUInt16LE(20) !== 1 || b.readUInt16LE(22) !== 1 || b.readUInt32LE(24) !== 16000 || b.readUInt32LE(28) !== 32000 || b.readUInt16LE(32) !== 2 || b.readUInt16LE(34) !== 16 || b.toString('ascii', 36, 40) !== 'data' || b.readUInt32LE(40) !== b.length - 44 || b.readUInt32LE(4) !== b.length - 8 || (b.length - 44) % 2) throw new Error('Expected a mono 16 kHz PCM WAV recording.');
  const seconds = (b.length - 44) / 32000;
  if (seconds < 0.2 || seconds > 91) throw new Error('Hold Talk for between a moment and 90 seconds.');
  return seconds;
}
export class Provider {
  constructor({ mode, key, fetchImpl = fetch }) { this.mode = mode; this.key = key; this.fetch = fetchImpl; }
  async checkAccess(key) {
    let response;
    try {
      response = await this.fetch(`https://api.openai.com/v1/models/${MODEL}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    } catch { throw new Error('Could not reach OpenAI to check the key. Settings were not changed. Try connecting again.'); }
    if (response.status === 401) throw new Error('OpenAI rejected this API key. Check it or create a new project key.');
    if (response.status === 403 || response.status === 404) throw new Error(`This key cannot access ${MODEL}. Check the project’s model access and key permissions.`);
    if (!response.ok) throw new Error(`OpenAI access check returned HTTP ${response.status}. Settings were not changed.`);
    // Do not return provider bodies: they may contain unexpected sensitive data.
    await response.arrayBuffer();
  }
  async request(path, options) {
    if (this.mode !== 'live' || !this.key) throw new Error('Live API access is not configured.');
    let response;
    try {
      response = await this.fetch(`https://api.openai.com/v1/${path}`, { ...options, headers: { ...options.headers, Authorization: `Bearer ${this.key}` }, signal: AbortSignal.timeout(180_000) });
    } catch { throw new Error('The API connection failed or timed out. This request was not retried; its budget reservation is retained.'); }
    if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}. Check model access, key, or billing. This request was not retried.`);
    return response.json();
  }
  async respond(body) {
    if (this.mode === 'demo') {
      await new Promise(resolve => setTimeout(resolve, 700));
      return { text: `Demo response — no AI request was made.\n\nYour message: ${body.input.at(-1).content}\n\nThe conversation and selected controls are saved on the server. Change a dial while this reply is preparing to test the next-turn behavior.`, status: 'completed', usage: null };
    }
    const result = await this.request('responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!['completed', 'incomplete'].includes(result.status)) throw new Error('The API did not complete this response. Its reservation is retained.');
    const text = (result.output || []).filter(x => x.type === 'message').flatMap(x => x.content || []).map(x => x.type === 'output_text' ? x.text : x.type === 'refusal' ? x.refusal : '').join('\n');
    return { text: text || 'No visible answer was returned. The output limit may have been used for reasoning.', status: result.status, usage: result.usage || null, responseId: result.id };
  }
  async transcribe(bytes) {
    if (this.mode === 'demo') return '[Demo voice turn — audio captured locally; transcription is disabled in demo mode.]';
    const form = new FormData();
    form.set('model', SPEECH_MODEL);
    form.set('file', new Blob([bytes], { type: 'audio/wav' }), 'speech.wav');
    const result = await this.request('audio/transcriptions', { method: 'POST', body: form });
    if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No speech was recognized. Try again or type.');
    return result.text.trim();
  }
}
export { describeControls };
