# market-news-alert

Polls financialjuice's internal news feed every 15 minutes, asks Claude (Haiku)
whether any new headline is significant enough to move markets, and if so
fires a Bark push notification (with an alarm-style sound) to iPhone.

## How it works

1. GitHub Actions runs `scripts/poll.mjs` on a 15-minute cron.
2. The script calls financialjuice's `FJService.asmx/Startup` endpoint using
   an authenticated session token, and compares returned headlines against
   `state.json`'s `lastSeenId` to find anything new.
3. New headlines are sent to Claude for a major/not-major classification.
4. Anything flagged `major` triggers a Bark notification with `sound=alarm.caf`.
5. `state.json` is updated and committed back to the repo so the next run
   doesn't re-process the same headlines.

## One-time setup

1. Create a **public** GitHub repo (public = unlimited free Actions minutes)
   and push this project to it.
2. In the repo's Settings → Secrets and variables → Actions, add three
   repository secrets:
   - `FJ_INFO_TOKEN` — the encrypted session token from financialjuice,
     captured from a logged-in browser's Network tab (see below).
   - `ANTHROPIC_API_KEY` — your Anthropic API key.
   - `BARK_DEVICE_KEY` — your Bark app's device key.
3. Run the workflow manually once via the Actions tab ("Run workflow" on
   `poll.yml`) to confirm it works before relying on the schedule.

## Re-capturing FJ_INFO_TOKEN (when it eventually expires)

The token is tied to your logged-in financialjuice browser session and will
likely need to be refreshed periodically — there's no way to know the
lifetime in advance.

1. Log into financialjuice.com in a browser.
2. Open DevTools → Network tab → filter Fetch/XHR.
3. Reload the page, find the request to `FJService.asmx/Startup`.
4. Copy the `info` query parameter value (including the surrounding `"`
   quotes, decoded — i.e. before `%22`/`%2B`/etc. percent-encoding).
5. Update the `FJ_INFO_TOKEN` repo secret with that value.

If the workflow starts failing with an HTTP error on the financialjuice
request, this is almost certainly why — check the Actions run logs.

## Notes

- The workflow runs on `7,22,37,52 * * * *` (not `*/15`) to avoid clustering
  with every other scheduled job on GitHub that fires exactly on the quarter
  hour.
- `state.json` starts at the headline ID already seen during initial testing,
  so the first real run won't re-alert on old news.
