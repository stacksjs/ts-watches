# Claude Code Guidelines

## About

ts-watches is a comprehensive TypeScript library for downloading, parsing, and analyzing data from smartwatches and fitness devices including Garmin, Polar, Suunto, Coros, Wahoo, and Apple Watch. It features a full FIT binary protocol parser, data export to GPX/TCX/CSV/GeoJSON, cloud integrations with Garmin Connect and Strava, training analysis tools (TSS, zones, race prediction), a workout/course builder with fluent API, and real-time data streaming via ANT+ and Bluetooth LE. The project includes a CLI tool (`watch`) for device detection, data download, and file parsing.

## Linting

- Use **pickier** for linting — never use eslint directly
- Run `bunx --bun pickier .` to lint, `bunx --bun pickier . --fix` to auto-fix
- When fixing unused variable warnings, prefer `// eslint-disable-next-line` comments over prefixing with `_`

## Frontend

- Use **stx** for templating — never write vanilla JS (`var`, `document.*`, `window.*`) in stx templates
- Use **crosswind** as the default CSS framework which enables standard Tailwind-like utility classes
- stx `<script>` tags should only contain stx-compatible code (signals, composables, directives)

## Dependencies

- **buddy-bot** handles dependency updates — not renovatebot
- **better-dx** provides shared dev tooling as peer dependencies — do not install its peers (e.g., `typescript`, `pickier`, `bun-plugin-dtsx`) separately if `better-dx` is already in `package.json`
- If `better-dx` is in `package.json`, ensure `bunfig.toml` includes `linker = "hoisted"`

## Commits

- Use conventional commit messages (e.g., `fix:`, `feat:`, `chore:`)
