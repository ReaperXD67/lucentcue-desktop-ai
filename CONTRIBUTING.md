# Contributing to LucentCue

LucentCue is an original MIT-licensed Electron application. Useful bug reports, focused fixes, accessibility improvements, and documentation corrections are welcome. Check existing issues before starting a larger feature, and describe the user problem your change solves.

## Local setup

Use Node.js 24 and npm in the project directory:

```powershell
npm ci
npm run dev
```

For browser-assistance work, also run `npm run browser:install`. Chromium is an optional external runtime download; desktop packages do not bundle it. Linux setup and browser integration checks are described in [BROWSER.md](docs/BROWSER.md).

## Verify your change

```powershell
npm run format:check
npm run typecheck
npm test
npm run build
```

Run the existing checks appropriate to your change. Add a focused regression test for behavior changes when it would catch a real failure; presentation-only edits do not need artificial tests. For desktop lifecycle, IPC, shortcuts, or screenshots, also run `npm run test:desktop` on a desktop session after building. Describe what you actually verified and which operating systems you used.

CI runs formatting, type checking, tests, and build on Windows, macOS, and Linux. Use `npm run format` to apply the shared code style. CI does not run GUI smoke tests or download Chromium. The manually triggered **Build unsigned packages** workflow creates native packages on each OS and uploads unsigned artifacts; it does not publish releases, sign, notarize, or use model keys. A successful build is not proof that all runtime features work on that OS.

## Pull requests

Keep changes focused and explain the problem, resulting behavior, and relevant validation. Update the main README and affected guides for important capability, workflow, setup, or architecture changes. Label roadmap items clearly. Do not claim measured performance, provider success, platform support, or partnerships without evidence.

Never commit API keys, private screenshots, conversation history, browser profiles, or personal application-data files. Test provider behavior with mocks unless a live account check is explicitly needed; no key is required for the normal suite. Shared developer keys must stay out of client code and release assets. See [architecture and trust boundaries](docs/ARCHITECTURE.md).

The original icon sources are in `assets/`. To regenerate them, use Python 3 with Pillow and run `python scripts/generate-icon.py`; Pillow is optional for asset authors and is not needed to run or build the app.
