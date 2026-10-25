# Notes for coding agents

- Start with `README.md` for setup, configuration, and the module map.
- `proposal.html` is the original design proposal. Keep it as a source reference; `npm run check` verifies its hash, so update `scripts/check.js` deliberately if you change it.
- Run `npm test` and `npm run check` before committing. Tests are offline and must not make paid API calls.
- Never commit `.env` or `data/` (API key, pairing code, conversations, spend ledger).
- Physical-object and cockpit-display ideas in `docs/PHYSICAL_OBJECT_IDEAS.md` are exploratory, not implemented. Confirm device and hardware capabilities from evidence rather than assuming them.
