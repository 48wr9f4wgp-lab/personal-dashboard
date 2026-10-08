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

## Current candidate

- Dashboard: `1.77-github`
- Loader: `1.4`
- Target layouts: Medium (calendar first) and Large (weather overview)
- Preserve local `ORE_DASH_CONFIG` when updating the loader. Do not copy personal settings into this repository.

### Large v1.77: two-card overview
- Natural month/day headline and full weekday, with the city and model timestamp retained.
- Weather name and icon stay prominent; temperature is supporting information beneath.
- One agenda card contains up to two deadlines first, then six schedule entries. A second card holds six forecast days.
- Deadline dates are absolute (with weekday); the right side shows today/tomorrow/countdown once, never two identical relative labels.
- Schedule weight follows timing, not sport. Known K-1 WGP abbreviations retain year, class and status. Large no longer cuts titles at 28 characters before native layout.
- Weekly temperatures use 10pt type. Long deadline titles still allow two lines.
- The 354pt maximum content budget is a design estimate, not proof of native iOS text fit. Test two long deadlines, six schedules and Light/Dark on iPhone before visual sign-off.
- Medium, data fetching/validation, Calendar selection, loader and local configuration are unchanged.

### Reliability changes

- Medium calendar and weather failures stay visible alongside the code-source warning. A calendar warning takes one existing row, keeping the 141pt/155pt layout budget.
- Missing daily rain probability is labeled unknown instead of showing a placeholder percentage.
- The configured anniversary appears on its actual day; matching all-day Calendar entries are not repeated.
- Calendar queries use one day snapshot if loading crosses midnight, and request an immediate refresh afterward. iOS decides the actual refresh time.
- Deadline cleanup only removes complete matching date tokens.
- Loader 1.4 requires a render-completion receipt before saving a newly downloaded version. Empty or incomplete downloads cannot replace the last-good cache. Cache read or storage failures have a visible recovery path.

## Updating safely

1. Publish the tested `main.js` first. Main 1.75 remains compatible with the existing Loader 1.3, so ordinary dashboard changes do not need a loader reinstall.
2. To enable the new download/cache protection, replace the Scriptable loader once with `loader.js`, preserving the device's existing `ORE_DASH_CONFIG` settings. Do this only after main 1.75 is available.
3. Loader 1.4 can still run already-saved v1.50–1.74 code offline with the last-good warning. Those legacy versions predate render receipts; they are accepted only as an existing cache, never as a new download.
4. Check one online run, then an offline run with a valid cache, then another online run. Medium/Large previews and native Calendar navigation still require iPhone verification.

Changing this repository's `main.js` on the main branch changes the code fetched by installed loaders on their next run. A branch or local candidate alone does not update the iPhone.

## Verification

Run from the repository root:

```sh
node scriptable-dashboard/tests/regression.cjs
```

The tests use synthetic weather, location, Calendar and filesystem data, without contacting services or reading personal records. They cover both layouts, light/dark source warnings, calendar/date boundaries, loader recovery and render-completion checks. A JSON result is written to `scriptable-dashboard/tests/test-results.json` and is not committed.

These are offline Scriptable API mocks. They do not establish native iOS text clipping, permission behavior, real weather accuracy, or widget refresh timing. No dependency install is needed.

API references: [CalendarEvent](https://docs.scriptable.app/calendarevent/), [ListWidget](https://docs.scriptable.app/listwidget/)
