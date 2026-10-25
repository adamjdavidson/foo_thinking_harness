import { readFile } from 'node:fs/promises';
import { timingSafeEqual, createHmac } from 'node:crypto';
import { validateControls } from '../public/controls.js';
import { DEFAULT_MODE, validateMode } from '../public/modes.js';
const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/controls.js': ['controls.js', 'text/javascript'], '/modes.js': ['modes.js', 'text/javascript'], '/motion.js': ['motion.js', 'text/javascript'], '/audio.js': ['audio.js', 'text/javascript'] };
for (const file of ['boss.png', 'buddha.png', 'influencer.png']) assets[`/images/${file}`] = [`images/${file}`, 'image/png'];
export function createHandler({ pilot, pairingCode, origins }) {
  const session = createHmac('sha256', pairingCode).update('pi-fold-session-v1').digest('hex');
  const same = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  let failedLogins = 0, lockedUntil = 0;
  const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...extra } });
  return async function handle(request) {
    let response;
    try {
      const url = new URL(request.url);
      if (!origins.includes(url.origin)) return json({ error: 'Unknown app address. Configure APP_ORIGIN on the server.' }, 403);
      const path = url.pathname;
      const mutation = !['GET', 'HEAD'].includes(request.method);
      if (mutation && (request.headers.get('X-Pilot-Client') !== '1' || request.headers.get('Origin') !== url.origin)) return json({ error: 'Open the app directly to make changes.' }, 403);
      if (path === '/api/unlock' && request.method === 'POST') {
        if (Date.now() < lockedUntil) return json({ error: 'Too many attempts. Wait one minute.' }, 429);
        const body = await request.json();
        if (!same(body.code, pairingCode)) {
          failedLogins++;
          if (failedLogins >= 5) { lockedUntil = Date.now() + 60000; failedLogins = 0; }
          return json({ error: 'That pairing code does not match this server.' }, 401);
        }
        failedLogins = 0;
        response = json({ ok: true }, 200, { 'Set-Cookie': `pilot=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${url.protocol === 'https:' ? '; Secure' : ''}` });
      } else if (path.startsWith('/api/')) {
        const cookie = request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('pilot='))?.slice(6);
        if (!same(cookie, session)) return json({ error: 'Pair this browser with the server first.' }, 401);
        if (path === '/api/state' && request.method === 'GET') response = json(pilot.state());
        else if (path === '/api/settings' && request.method === 'POST') {
          if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Open the HTTPS address to configure API access.');
          response = json(await pilot.configure(await request.json()));
        }
        else if (path === '/api/conversations' && request.method === 'POST') {
          const body = await request.json();
          response = json(pilot.store.create(body.controls ? validateControls(body.controls) : undefined, validateMode(body.partnershipMode ?? DEFAULT_MODE)), 201);
        } else {
          const match = path.match(/^\/api\/conversations\/([a-f0-9-]+)(?:\/(controls|settings|turns))?$/);
          if (!match || !pilot.store.get(match[1])) response = json({ error: 'Not found.' }, 404);
          else if (!match[2] && request.method === 'GET') response = json(pilot.store.get(match[1]));
          else if (match[2] === 'controls' && request.method === 'PATCH') {
            pilot.store.controls(match[1], validateControls(await request.json())); response = json({ ok: true });
          } else if (match[2] === 'settings' && request.method === 'PATCH') {
            const body = await request.json();
            pilot.store.settings(match[1], validateControls(body.controls), validateMode(body.partnershipMode)); response = json({ ok: true });
          } else if (match[2] === 'turns' && request.method === 'POST') response = json(pilot.begin(match[1], await request.json()), 202);
          else response = json({ error: 'Not found.' }, 404);
        }
      } else if (assets[path] && request.method === 'GET') {
        const [file, type] = assets[path];
        response = new Response(await readFile(new URL(`../public/${file}`, import.meta.url)), { headers: { 'Content-Type': type.startsWith('text/') ? `${type}; charset=utf-8` : type } });
      } else response = json({ error: 'Not found.' }, 404);
    } catch (error) { response = json({ error: error.message || 'The request could not be processed.' }, 400); }
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    response.headers.set('Permissions-Policy', 'microphone=(self), accelerometer=(self), gyroscope=(self)');
    return response;
  };
}
