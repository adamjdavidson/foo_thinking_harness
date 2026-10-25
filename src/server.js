import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { Store } from './store.js';
import { Provider } from './provider.js';
import { Pilot } from './pilot.js';
import { createHandler } from './http.js';
import { ApiSettings } from './api-settings.js';

const mode = process.env.PILOT_MODE || 'demo';
if (!['live', 'demo'].includes(mode)) throw new Error('PILOT_MODE must be demo or live.');
const budget = Number(process.env.PILOT_BUDGET_USD || 0);
if (!Number.isFinite(budget) || budget < 0) throw new Error('PILOT_BUDGET_USD must be a nonnegative number.');
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
process.umask(0o077);
const data = resolve('data'); mkdirSync(data, { recursive: true, mode: 0o700 }); chmodSync(data, 0o700);
const settings = new ApiSettings(resolve(data, 'api-settings.json'));
const config = settings.load({ mode, budget, key: process.env.OPENAI_API_KEY });
const codeFile = resolve(data, 'pairing-code');
let pairingCode;
try { pairingCode = readFileSync(codeFile, 'utf8').trim(); }
catch (e) { if (e.code !== 'ENOENT') throw e; pairingCode = randomBytes(12).toString('hex'); writeFileSync(codeFile, pairingCode + '\n', { mode: 0o600 }); }
if (!/^[a-f0-9]{24}$/.test(pairingCode)) throw new Error('Invalid data/pairing-code. Restore the pairing code or remove that file to generate a new one.');
const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
if (process.env.APP_ORIGIN) {
  const origin = new URL(process.env.APP_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== process.env.APP_ORIGIN) throw new Error('APP_ORIGIN must be an exact HTTPS origin with no trailing slash.');
  origins.push(origin.origin);
}
const store = new Store(resolve(data, 'pilot.sqlite'), { recover: false });
const pilot = new Pilot({ store, provider: new Provider(config), budget: config.budget, settings });
const handle = createHandler({ pilot, pairingCode, origins });
const server = createServer(async (req, res) => {
  try {
    // The process binds only to loopback; Tailscale Serve is the only intended proxy.
    const host = req.headers.host;
    const external = origins.find(x => new URL(x).host === host);
    if (!external) { res.writeHead(403); res.end('Unknown host'); return; }
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4_100_000) { res.writeHead(413); res.end('Request too large'); return; }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const request = new Request(new URL(req.url, external), { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body } : {}) });
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { if (!res.headersSent) res.writeHead(500); res.end('Request failed.'); }
});
server.requestTimeout = 30000;
server.on('error', error => { console.error(`Cannot start pilot: ${error.code}. Run npm start in a normal terminal if sockets are restricted here.`); store.close(); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  store.recoverInterrupted();
  console.log(`Thinking instrument • ${config.mode.toUpperCase()}\nOpen ${process.env.APP_ORIGIN || `http://localhost:${port}`}\nPairing code: ${pairingCode}\nLive budget: $${config.budget.toFixed(2)}; accounted/reserved: $${store.spent().toFixed(3)}\nUse API setup in the app to connect a project key.`);
});
