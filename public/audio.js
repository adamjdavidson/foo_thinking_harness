export function encodeWav(chunks, sourceRate) {
  const length = chunks.reduce((n, x) => n + x.length, 0);
  const source = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { source.set(chunk, offset); offset += chunk.length; }
  const rate = 16000;
  const count = Math.floor(length * rate / sourceRate);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const a = Math.floor(i * sourceRate / rate), b = Math.max(a + 1, Math.floor((i + 1) * sourceRate / rate));
    let sample = 0;
    for (let j = a; j < b && j < length; j++) sample += source[j];
    sample = Math.max(-1, Math.min(1, sample / (b - a)));
    view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
export async function openMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone needs HTTPS and a supported browser. Typing is available.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  let context;
  try {
    context = new AudioContext();
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    // ScriptProcessor is intentionally used for this dependency-free pilot; replace with AudioWorklet later.
    const processor = context.createScriptProcessor(4096, 1, 1);
    const mute = context.createGain(); mute.gain.value = 0;
    source.connect(processor); processor.connect(mute); mute.connect(context.destination);
    let chunks = [], samples = 0, recording = false;
    processor.onaudioprocess = e => {
      if (!recording || samples >= context.sampleRate * 90) return;
      const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
      chunks.push(chunk); samples += chunk.length;
    };
    return {
      async start() { await context.resume(); chunks = []; samples = 0; recording = true; },
      stop() { recording = false; const wav = encodeWav(chunks, context.sampleRate); chunks = []; return wav; },
      close() { recording = false; processor.disconnect(); source.disconnect(); mute.disconnect(); stream.getTracks().forEach(t => t.stop()); void context.close(); }
    };
  } catch (error) { stream.getTracks().forEach(t => t.stop()); if (context) void context.close(); throw error; }
}
