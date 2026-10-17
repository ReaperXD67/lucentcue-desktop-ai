# LucentCue 0.1.1 preview

Release candidate for **`v0.1.1-preview.1`**. Source validation and local Windows packaging/installation passed; new-version cross-platform CI and downloadable release assets remain pending. [Published releases](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases) remain the source for available downloads. Packages are unsigned and macOS builds are not notarized.

## Changes

- **Selected browser tab:** Chromium runs with a separate profile and Playwright connects over local CDP with `noDefaults: true`, preserving native focus/visibility so Read page follows the tab a person selected. Closing browser assistance explicitly closes its owned Chromium process.
- **Smoother long conversations:** completed messages reuse their rendered output during typing and streaming instead of repeatedly parsing the full transcript.
- **Copy answer:** a narrow trusted IPC operation reaches the main-process clipboard writer, with a 100,000-character limit. The regression check spies on that writer; it does not read or replace the user's clipboard.
- **Shortcut stability:** saving unrelated settings no longer unregisters and re-registers unchanged global shortcuts.
- **Bounded answers:** oversized streamed output stops at the message limit, preserves accepted text, avoids splitting a surrogate pair, and reports a clear size-limit error.

Free OpenRouter routing, personal-provider keys, screenshot review, optional local text history, Markdown export, and visible user-approved browser filling remain available. Free requests are quota-limited and have no automatic paid fallback. No personal key was provided during this session, so live provider completions have not been verified.

## Verification

Current-source Windows checks passed **90 tests in total, including 8 real Chromium integration tests**, and **17 Electron smoke checks**. With `LUCENTCUE_DESKTOP_FEATURES=1`, smoke checks exercised real OS display capture through the UI's preview/removal flow before any send, plus a visible Chromium local fixture through opening, page reading/attachment, and selected-field filling. The local input event was confirmed and no form was submitted. These are source smoke results, not a completed upgrade test of the installed 0.1.1 package.

The prior 0.1.0 preview installed and opened successfully on Windows 11 Home and loaded OpenRouter's public zero-price catalog without a key. Its cross-platform CI/package results and installer hash are retained in [Windows testing](WINDOWS_TESTING.md). Those results do not establish that new-version CI or packaging has run.

## Performance comparison

Five measured runs in headless Chromium used 4× CPU throttling, a 60-message/77,001-character fixture, 20 input keystrokes, and 40 simulated stream deltas scheduled 16 ms apart:

| Complete synthetic workload | Before median | After median |
| --- | --- | --- |
| Type 20 characters | 16,543 ms | 549 ms |
| Process 40 stream deltas | 31,394 ms | 1,363 ms |

These are local rendering stress measurements, not per-keystroke latency, provider response time, network benchmarks, or performance guarantees on installed devices. The fixture makes no provider requests and uses no personal keys/profile. [Method and reproduction](WINDOWS_TESTING.md#synthetic-ui-comparison) use `scripts/benchmark-ui.mjs`.

## Remaining checks and boundaries

A separate harmless Windows Electron fixture was tested with FFmpeg DXGI Desktop Duplication: fixture colors appeared with protection off, the protected region was 99.948% black with protection on, and the fixture returned after protection was disabled. GDI window-title capture was inconclusive because its OFF baselines were also black. This is one scoped fixture experiment; WGC, actual OBS/Zoom recorders, and external capture of the installed 0.1.1 window remain untested. [Detailed capture evidence](WINDOWS_TESTING.md#capture-observations) records the method and limits.

The Windows 0.1.1 installer completed its per-user upgrade with exit code 0, the installed executable reports `0.1.1.0`, and the app opened. A native `Alt+R` hid its window. Global restore and screenshot keypress checks stopped when Windows UI automation could not reliably identify a browser URL. OS capture protection is optional and best effort; Linux is unsupported and macOS ScreenCaptureKit can ignore it. LucentCue remains a normal discoverable process. Its own screenshot flow hides the window first and cannot establish recording privacy.

macOS/Linux desktop runtime checks, live provider completions, signing, notarization, and automatic updates remain unverified or unimplemented. Live transcription and a hosted shared-key relay are planned work. Screenshots and attached page text go to the selected provider when sent; saved text history is local, unencrypted, and off by default.

See [Getting started](GETTING_STARTED.md), [browser assistance](BROWSER.md), and [architecture](ARCHITECTURE.md) for setup and data boundaries.
