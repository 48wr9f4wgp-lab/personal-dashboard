# Personal Dashboard

Personal iPhone dashboard loaded by Scriptable from GitHub.

## Architecture
- `loader.js` — tiny one-time Scriptable loader.
- `main.js` — remotely updated dashboard implementation.
- Personal settings stay in the local Scriptable loader via `globalThis.ORE_DASH_CONFIG`.
- The public repository must not contain secrets, private API keys, or personal financial data.

The loader fetches `main.js` on each Scriptable run and caches the last successfully executed version. If GitHub or network loading fails, it falls back to that last-good cache.

Remote main:
`https://raw.githubusercontent.com/48wr9f4wgp-lab/personal-dashboard/main/scriptable-dashboard/main.js`
