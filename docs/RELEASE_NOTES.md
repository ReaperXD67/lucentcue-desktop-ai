# LucentCue 0.2.0 preview

Release candidate for **`v0.2.0-preview.1`**. Source validation, installation checks, and publication are in progress. [Published releases](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases) are the source for available downloads. Packages are unsigned and macOS builds are not notarized.

## Changes

- **Compact companion:** a small resizable view for questions, screenshot attachments, and answers. Its Settings control opens the full workspace and Settings; both modes share the current conversation, unsent draft, and attachments.
- **`Alt+W` show/hide:** replaces `Alt+R` as the default. Existing custom bindings are preserved, and the screenshot default remains `Alt+Shift+S`.
- **Optional tray icon:** notification-area clutter can be reduced through Settings. An in-app Quit control and the normal shortcut/launcher paths remain available. LucentCue remains visible to Task Manager and the operating system.
- **Browser reliability:** the selected tab remains readable while the companion covers Chromium; actual background tabs remain hidden and minimized reads are rejected. Bounded shutdown waits for the owned Chromium process to exit, and a stale DevTools endpoint marker is removed before a fresh launch. Three reopen cycles passed without a profile-lock race.
- **Windows pinning:** uses a level above the taskbar after an A/B test reproduced immediate loss of native topmost state at the default floating level.

This preview includes the prior source fixes for selected browser tabs, unchanged-shortcut registration, copying answers, bounded streamed output, and long-conversation rendering. Browser assistance uses a visible separate Chromium profile, reads the selected tab, and fills only the field and text a person explicitly approves. It does not submit forms.

Free OpenRouter routing, personal-provider keys, screenshot review, optional local text history, Markdown export, and visible user-approved browser filling remain available. Free requests are quota-limited and have no automatic paid fallback. No personal key was provided during this session, so live provider completions have not been verified.

## Verification

Current 0.2.0 source passed **100 automated tests with headed Chromium enabled, repeated twice, and 21 Electron smoke checks** on Windows. Smoke checks include the companion Settings/workspace transition, draft preservation, 360 px minimum-width flow, real screenshots through preview/removal, visible browser read/attach/approved fill without submission, tray controls, explicit Quit availability, lost-shortcut registration recovery, and capture-protection state across mode changes. Native OS keypresses passed `Alt+W` hide/restore, `Alt+Shift+S` screenshot preview/removal, and restore with the tray icon disabled. Formatting and type checks passed; the dependency audit reported zero vulnerabilities. These checks use an isolated source-test profile; installed 0.2.0 package checks and release publication remain pending. [Windows testing](WINDOWS_TESTING.md) distinguishes those outcomes from prior-version checks.

CI now runs the real Windows Electron desktop smoke after its build, in addition to source checks on Windows/macOS/Linux. Optional real screenshot/browser paths, native key injection, and recording experiments remain local desktop checks.

## Existing performance comparison

Five measured runs in headless Chromium used 4× CPU throttling, a 60-message/77,001-character fixture, 20 input keystrokes, and 40 simulated stream deltas scheduled 16 ms apart:

| Complete synthetic workload | Before median | After median |
| --- | --- | --- |
| Type 20 characters | 16,543 ms | 549 ms |
| Process 40 stream deltas | 31,394 ms | 1,363 ms |

These are local rendering stress measurements, not per-keystroke latency, provider response time, network benchmarks, or performance guarantees on installed devices. The fixture makes no provider requests and uses no personal keys/profile. [Method and reproduction](WINDOWS_TESTING.md#synthetic-ui-comparison) use `scripts/benchmark-ui.mjs`.

## Recording privacy and remaining checks

The actual built LucentCue source app passed a DXGI Desktop Duplication recording test in both modes, using an isolated empty profile, mocked catalog, and zero completions. Across seven 1.2-second stages at 5 fps, all **18 protected frames were 100% black** and all **24 unprotected baseline/restored frames showed app UI**. Protection was changed through real Settings IPC and retained across mode changes. A separate harmless Electron fixture passed an independent OFF → ON → OFF recording test. GDI window-title capture was inconclusive because its OFF baselines were also black.

These results cover one Windows machine, Electron version, FFmpeg capture mode, and source build. They do not establish installed-binary behavior or results for WGC, OBS, Zoom, cameras, or every recorder. [Detailed capture evidence](WINDOWS_TESTING.md#capture-observations) records the methods and limits.

OS capture protection is optional and best effort; Linux is unsupported and macOS ScreenCaptureKit can ignore it. LucentCue remains a normal discoverable process. Its own screenshot flow hides the window first and cannot establish recording privacy. Turning off the tray icon removes its notification-area entry; it does not hide the application from process monitoring or conceal keyboard activity.

macOS/Linux desktop runtime checks, live provider completions, signing, notarization, and automatic updates remain unverified or unimplemented. Live transcription and a hosted shared-key relay are planned work. Screenshots and attached page text go to the selected provider when sent; saved text history is local, unencrypted, and off by default.

See [Getting started](GETTING_STARTED.md), [browser assistance](BROWSER.md), and [architecture](ARCHITECTURE.md) for setup and data boundaries.
