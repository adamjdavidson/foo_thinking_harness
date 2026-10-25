<img src="assets/icon.svg" width="64" height="64" alt="">

# Thinking Harness

A browser-based instrument for thinking with AI. You steer the conversation with four persistent dials and a set of partnership modes (Play, Extract, Boss, Buddha, Influencer) instead of rewriting your prompt each time. Conversations, dial positions and the settings used for every reply are saved locally.

It runs as a small local Node server with no dependencies and no build step, on any machine with Node: a laptop, a desktop or a home server such as a Raspberry Pi. You use it in a browser with a keyboard and mouse, or optionally from a phone. [`proposal.html`](proposal.html) is the original design proposal. [`nextsteps.md`](nextsteps.md) describes the larger idea behind it, a *thinking harness*, and what to build next.

## Quick start

You need [Node.js](https://nodejs.org/) 24 or newer. There is nothing to `npm install`.

```bash
git clone https://github.com/adamjdavidson/foo_thinking_harness.git
cd foo_thinking_harness
npm start
```

Open http://localhost:8787 and enter the **pairing code** printed in the terminal. Press Ctrl-C to stop the server.

The app starts in **demo mode**. Demo mode makes no network requests and returns clearly labeled placeholder replies, so you can try the dials, modes and saved conversations for free. To get real replies, [connect an OpenAI API key](#connect-live-ai).

To use a different port, run `PORT=8790 npm start`.

## Connect live AI

Live replies use the OpenAI Responses API and are billed to your own OpenAI account.

1. Create a project API key at [platform.openai.com](https://platform.openai.com/api-keys).
2. In the app, open **API setup**, paste the key, set a total **budget** in dollars, and select **Connect live AI**.

The server checks that the key can access the model, then switches to live mode immediately. The key is saved to `data/api-settings.json` (owner-only permissions) and restored on restart. It is never sent to the browser, saved in browser storage or included in exports. To change the key or budget later, reopen **API setup**. Leave the key field blank to keep the saved key.

If you prefer configuring by file, copy `.env.example` to `.env` and set:

```dotenv
PILOT_MODE=live
OPENAI_API_KEY=your-project-key
PILOT_BUDGET_USD=10
```

Settings saved through **API setup** take precedence over `.env`.

**Model:** conversations use `gpt-6.1-sol`, and the Effort dial maps to `reasoning.effort` (`low` to `max`). Speech input uses `gpt-transcribe`. No fallback model is chosen silently.

**Budget:** before each paid request, the app reserves a conservative cost estimate in a local SQLite ledger and refuses requests that would exceed your total. The estimate assumes $3/$15 per million input/output tokens, above the published rates when this was written, and up to 8,192 output tokens per reply. Once a reply returns, the unused part of its reservation is released. The budget is a running total across restarts, not a per-session allowance. This is local accounting, not a hard cap on your OpenAI account, so your OpenAI billing dashboard is the authority. Failed requests keep their reservation, and nothing is retried automatically. Start with the Effort dial at Medium. Higher efforts can use up the output allowance on reasoning.

Each request sends the visible text history of the current conversation plus the current dial and mode instructions, with `store: false`. Nothing is attached to your ChatGPT account.

## Using it

### Dials

There are four five-position dials. Their defaults are **Make it happen / Fresh twists / Medium / Balanced**. The meaning of the selected dial appears below the dial bank.

- **W/S or ↑/↓** selects the previous or next dial.
- **A/D or ←/→** moves it down or up (1 to 5).
- You can also click a dial title, a numbered position or the on-screen arrows.
- **Ctrl/Cmd+Enter** sends. **Esc** in the message box returns focus to the dials without losing your draft. Steering keys behave normally while you're typing.

Dial positions save with each conversation, and new conversations inherit the current positions. If you change a dial while a reply is in progress, the change applies to your next message. **Settings used** under each reply shows exactly what it was generated with.

### Partnership modes

Press an image tile above the conversation to choose a mode. Tab and Enter/Space also work.

- **Play:** explore freely, make connections and generate possibilities.
- **Extract:** pull out insights, decisions, open questions and next steps, separating real decisions from suggestions.
- **Boss:** shape the work around your boss's priorities, anticipate objections and present it persuasively. Tell it what your boss cares about in the conversation.
- **Buddha:** step back, notice attachments and assumptions, and find clarity and a compassionate next step.
- **Influencer:** a fashion-model and social-media lens focused on audience, image, attention, packaging and presentation.

A mode is saved per conversation and combines with the dials. Mode and dial meanings live in `public/modes.js` and `public/controls.js` if you want to change them.

**Tile images:** the Boss, Buddha and Influencer tiles use AI-generated figurines of fictional people. To personalize one, replace its file in `public/images/` with any square PNG, such as a photo of your own boss for `boss.png`. Generation prompts are in [`public/images/README.md`](public/images/README.md).

### Conversations

The menu switches between saved conversations. **Export** downloads a conversation, with the settings used for each reply and token counts, as JSON. Each conversation runs one reply at a time. Replies appear when complete. Conversations are capped at about 160 KB of text, and the app will ask you to export and start fresh rather than silently dropping older turns. Use a single browser tab at a time.

## Optional: use a phone as the controller

You can run the server on one machine (for example, an always-on Raspberry Pi) and use a phone as the controller. The phone layout was designed on a Galaxy Fold. Turn on **Phone controls** in the app for mirrored **Talk** and **Adjust** buttons:

- **Talk:** hold to record and release to send (speech is transcribed, up to 90 seconds).
- **Adjust:** hold and tilt the phone left/right to move the selected dial.

The server only listens on `127.0.0.1`. To reach it from a phone, use [Tailscale Serve](https://tailscale.com/kb/1312/serve) so it is reachable only on your private tailnet:

```bash
tailscale serve --bg http://127.0.0.1:8787
# or, if HTTPS 443 is already in use:
tailscale serve --bg --https=8443 http://127.0.0.1:8787
```

Then put the exact HTTPS address Tailscale prints (no trailing slash) in `.env` and restart:

```dotenv
APP_ORIGIN=https://your-machine.your-tailnet.ts.net:8443
```

Open that address on the phone, enter the pairing code, and use **Device check** to enable the microphone and motion sensors. `bash scripts/setup-pilot.sh` walks through these steps interactively. Don't use Tailscale Funnel, and don't bind the app to a public interface. [`docs/DEVICE_CHECK.md`](docs/DEVICE_CHECK.md) lists the on-device acceptance checks.

## Your data

Everything is stored under `data/`, which is gitignored:

- `data/pilot.sqlite` stores conversations, dial values, token usage and the budget ledger. It is not encrypted. To back up, stop the server and copy the whole `data/` folder.
- `data/pairing-code` is the browser pairing secret. To sign out all browsers, stop the server, delete this file and restart.
- `data/api-settings.json` stores your API key and live settings.

Audio is held in memory only and sent to OpenAI for transcription. The transcript is stored locally. The app has no tools, web access or code execution; it only produces text.

## Development

```bash
npm test         # 38 offline tests: app logic, HTTP routes, browser event handlers
npm run check    # JavaScript syntax check and proposal.html integrity check
```

The tests make no network requests. The browser tests run the real `public/app.js` handlers against a simulated DOM, so they don't cover layout or real devices.

| File | Responsibility |
|---|---|
| `src/server.js` | Starts the loopback server, reads config, creates the pairing code |
| `src/http.js` | Authenticated routes and static assets |
| `src/pilot.js` | Turns, live configuration, budget gating |
| `src/provider.js` | OpenAI Responses and transcription calls |
| `src/store.js` | SQLite persistence and migrations |
| `src/api-settings.js` | Private API-key persistence |
| `public/app.js` | Browser UI (keyboard and phone) |
| `public/controls.js` | Dial meanings and instructions |
| `public/modes.js` | Partnership modes |
| `public/motion.js`, `public/audio.js` | Tilt clutch and recording |

**Known limitations:** dial changes during a reply apply to the next message only. Replies aren't streamed. Audio capture uses the deprecated `ScriptProcessor` API. Phone sensors and the extreme dial positions haven't been fully calibrated on a real device. Ideas for physical controllers (NFC objects, cockpit-style displays) are in [`docs/PHYSICAL_OBJECT_IDEAS.md`](docs/PHYSICAL_OBJECT_IDEAS.md).
