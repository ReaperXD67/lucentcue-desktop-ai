# LucentCue 0.1.0 desktop preview

An original, open-source desktop AI copilot for screenshots, coding, research, and visible browser assistance. This is an unsigned developer preview.

Native packages were built from [cb35cd9](https://github.com/ReaperXD67/lucentcue-desktop-ai/commit/cb35cd99ef52c2955b8aaf44a67a4a7ec6cb68cd) in the verified cross-platform workflow.

## Included

- OpenRouter free-model mode with fresh zero-price validation and no automatic paid fallback.
- OpenRouter, OpenAI, and Gemini keys entered in Settings; streaming answers and cancellation.
- Configurable global shortcuts, screenshot previews, optional always-on-top, local text history, and Markdown export.
- A separate visible Playwright browser with in-app Chromium setup, page reading, and explicit field filling. You submit forms in the browser.
- Optional OS capture protection on Windows/macOS, with platform limitations clearly shown in Settings. Linux capture exclusion is unsupported; macOS ScreenCaptureKit may ignore protection. The app remains visible to OS process tools.

## Downloads and setup

Choose the Windows x64 installer, a macOS DMG for your Intel or Apple Silicon Mac, or a Linux x64 AppImage/deb. `SHA256SUMS.txt` contains the package hashes. Packages are unsigned and macOS builds are not notarized.

Open Settings and add your own provider key. Free models still have OpenRouter/provider quotas. For browser assistance, choose **Set up assistant browser** once; installed users do not need Node or npm for this step.

## Verification and limits

CI checks and native packaging passed on Windows, macOS, and Linux. Local Windows verification passed 78 offline tests, four real Chromium integration tests, 14 Electron smoke checks, and the packaged Chromium setup helper. The dependency audit reported no known vulnerabilities at delivery.

macOS/Linux desktop runtime behavior and live provider completions with a real key still require verification. Live transcription, a hosted shared-key service, automatic updates, signing, and notarization are planned work. Screenshots and attached page text go to your provider when you send a message; saved history is local plain text and off by default.

See the [README](../README.md), [browser guide](BROWSER.md), and [architecture](ARCHITECTURE.md) for setup, capabilities, and data boundaries.
