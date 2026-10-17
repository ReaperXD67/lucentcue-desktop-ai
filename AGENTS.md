# Working on LucentCue

Keep the main README and affected guides current for significant changes. Describe tested behavior and distinguish it from the roadmap.

## Development

- Use Node.js 24 and `npm ci`.
- `npm run dev` opens the desktop application. `npm run dev:ui` is an interface preview.
- Run `npm run format:check`, `npm run typecheck`, and the relevant tests for a change. `npm run format` applies the shared style.
- Run `npm run build` before `npm run test:desktop`; the smoke test uses an isolated profile and mocked provider completions.
- For real local browser integration, install Chromium and set `LUCENTCUE_BROWSER_TESTS=1` when running browser tests. No provider keys are needed.
- Package on native target systems. CI compilation does not prove OS permissions, GUI behavior, code signing, or notarization.

## Product invariants

- Free mode must validate zero-cost pricing before sending and must never use a paid fallback.
- Persisted provider keys stay in the main process and use secure OS encryption, or remain in memory when secure storage is unavailable.
- Keep the renderer sandboxed and validate IPC inputs and senders.
- Screenshots and page text are reviewed before sending. Screenshots do not persist in history.
- Browser actions require an explicit user action, stay visible, and never submit a form automatically.
- Capture protection is an OS capability with limitations. Do not claim process invisibility or universal capture exclusion.

## Delivery

The repository owner requested commits and pushes for completed changes. Make focused, tested commits and push them to the configured remote. Do not force-push, rewrite shared history, publish secrets, or contact other projects without an applicable user request. Keep generated builds, personal data, and keys out of Git.
