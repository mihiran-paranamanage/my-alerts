# my-alerts

Personal automated alert pipelines. Each alert source lives in its own
top-level folder with its own scripts, state, and GitHub Actions workflow.
Code shared across sources (if any) lives in `shared/`.

## Sources

- [`financialjuice/`](financialjuice/README.md) — polls financialjuice's news
  feed every 15 min, classifies headlines with Claude, sends a Bark push
  notification with an alarm-style sound for market-moving news.

## Adding a new source

1. Create a new top-level folder named after the source.
2. Give it its own `scripts/`, `state.json` (if it needs dedup), and
   `package.json`.
3. Add a workflow in `.github/workflows/<source>-poll.yml` with
   `working-directory: <source>` set in the job defaults.
4. Pull anything genuinely shared across sources into `shared/`.
