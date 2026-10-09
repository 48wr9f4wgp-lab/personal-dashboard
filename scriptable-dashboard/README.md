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

- Dashboard: `1.80-github`
- Loader: `1.4`
- Target layouts: Medium (calendar first) and Large (weather overview)
- Preserve local `ORE_DASH_CONFIG` when updating the loader. Do not copy personal settings into this repository.

### v1.80: preserve the target session in Medium deadlines
- Only the Medium deadline title formatter changes; the Medium/Large renderers, row widths/heights, deadline times, data selection, Loader and device configuration are unchanged.
- For the explicit template '<course>: 受講申込期限 (<dated session>回)', display '<dated session>回 申込〆 <course>'. The original course name and date text are retained. The session/action precedes the course so a very long name cannot push the session off the row.
- Leading condition/status tags remain first. Timed deadlines retain their existing time column and elapsed deadlines retain the leading 【締切経過】 warning. All-day entries never gain a guessed clock time.
- Ambiguous dates, multiple sessions, extra conditions/suffixes and other deadline types stay on the original unabridged path. No general replacement or character-count truncation is applied.
- Existing 425-case regression suite is unchanged. A separate 59-case focused suite checks exact formatters, preservation/fallback cases and hash-guards the two renderers and Loader.
- Native iPhone fitting is still required for the new text. Small screens/very long names can still use native ellipsis after the session and action; no zero-truncation claim is made.

### v1.79: semantic audit repairs
- Timed deadlines retain the Calendar entry's start time and explicit all-day flag. The exact time is shown, with a distinct elapsed state. All-day entries never gain an invented time; no submission/completion state is inferred.
- Same-day deadline/start/end transitions crossed while requests are outstanding are evaluated at render time, while the existing midnight day snapshot is retained.
- Ongoing timed entries show their end time with an explicit end label. Overnight entries retain the original start date, and multi-day all-day entries show their stored date span. An explicit timed flag is not reclassified as all-day merely because duration is 24 hours.
- Both widget sizes preserve postponed/status/class/year information and unknown suffixes before native title ellipsis.
- GPS and reverse geocoding have separate 4,000ms/2,000ms await bounds using Scriptable Timer. Independent Calendar reads start first. Late location responses do not mutate the completed view; the native request itself is not cancellable here.
- Valid coordinates with unavailable geocoding display '現在地・地名不明', never an unrelated fallback city's name. Invalid fallback coordinates do not trigger a weather request.
- Medium shows the weather model timestamp rather than implying render age is weather age. In compact mode (<=320pt), the model timestamp takes priority over today's daily rain probability; the regular Medium retains both.
- Medium uses the same semantic weather colors as Large. Unknown current day/night uses a neutral symbol and disclosure; daily forecasts remain daily summaries.
- Request the next refresh at an approaching timed deadline or schedule boundary, without promising iOS will honor that time.
- Preserve two-card Large layout, 44pt time columns, 6 schedules/2 deadlines/6 forecasts, Medium geometry, Loader v1.4 and local configuration.
- Local offline suite: 425 cases pass; the same acceptance suite rejects the old v1.78 behavior in 78 conditions. These are conditions, not separate bug counts. Native text fitting and Timer behavior still require iPhone verification.

### Large v1.78: device-evidence layout repair
- Keep the v1.77 header, two backgrounds and 6 schedules / 2 deadlines / 6 forecast days.
- Time columns are 44pt with 10pt monospaced HH:mm and explicit zero padding. Dates retain 38pt. Titles, not times, may use native ellipsis.
- Deadline text has an explicit trailing spacer to align with the leading content edge. Two-line titles are retained.
- With zero/one deadline, row height is 23/21pt, with 4pt section spacing and 6pt card gaps. Two-deadline geometry retains the prior 354pt design maximum.
- Structural tests catch the v1.77 time-column and missing-leading-alignment regressions. They do not simulate native iOS truncation.
- iPhone screenshot confirmation is required; do not mark native clipping fixed from Node/CI tests alone.

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
node scriptable-dashboard/tests/medium-deadline-title.cjs
```

The tests use synthetic weather, location, Calendar and filesystem data, without contacting services or reading personal records. They cover both layouts, light/dark source warnings, calendar/date boundaries, loader recovery and render-completion checks. A JSON result is written to `scriptable-dashboard/tests/test-results.json` and is not committed.

These are offline Scriptable API mocks. They do not establish native iOS text clipping, permission behavior, real weather accuracy, or widget refresh timing. No dependency install is needed.

API references: [CalendarEvent](https://docs.scriptable.app/calendarevent/), [ListWidget](https://docs.scriptable.app/listwidget/)
