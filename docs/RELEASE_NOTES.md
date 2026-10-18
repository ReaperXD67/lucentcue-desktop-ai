# LucentCue preview notes

## 0.2.1 — appearance and signing preparation

Published as [v0.2.1-preview.1](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.2.1-preview.1), with all five unsigned native packages and `SHA256SUMS.txt`. Trusted signing and installation on the tested PC remain pending.

- Dark by default, with Light and Follow system themes across chat, Settings, Markdown, and browser panels.
- Persisted 85–100% whole-companion opacity on Windows/macOS. The full workspace stays opaque; Linux and browser previews keep solid windows.
- Actual app version in the workspace footer, replacing the stale version label.
- A free-signing application draft and read-only Windows signature/payload verification procedure in [SIGNING.md](SIGNING.md). No application approval, signing credentials, or trusted signature has been obtained.

All **105 automated tests passed with real headed Chromium enabled**. [CI](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39117067053) passed on Windows, macOS, and Linux, including **21 Windows Electron smoke checks**. Appearance checks save Light and System, simulate system-color changes, verify Dark after renderer reload, compare native companion opacity near 0.85 with workspace opacity 1, and assert the actual startup version. Formatting, typecheck, production build, and the production dependency audit passed with zero reported vulnerabilities. Mac/Linux desktop runtime behavior remains unverified.

[Native packaging](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39117090507) and [asset verification](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39117292327) passed at source commit `b177ef7`. The Windows installer is 117,815,808 bytes, SHA-256 `243889d851e00f4fad18eed48a493ac075bf0a6f1414d418dc9e65cfb4d979d3`.

The published 0.2.0 assets remain unchanged. Windows Code Integrity events 3077 and 3033 confirm that the downloaded 0.2.0 installer failed this device's enterprise signing requirements; this is not an installer crash. The installed app remains 0.1.1, and the unsigned 0.2.1 installer was not used to retry the block. Security settings and trust stores were not changed. The 0.2.0 recording experiments below were not repeated for 0.2.1.

## 0.2.0 — published preview

Published as **[v0.2.0-preview.1](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.2.0-preview.1)** after source validation, cross-platform CI, native packaging, and asset verification passed. Downloads include Windows x64 NSIS, macOS x64/arm64 DMGs, Linux x64 AppImage/deb, and `SHA256SUMS.txt`. Packages are unsigned and macOS builds are not notarized.

## Changes

- **Compact companion:** a small resizable view for questions, screenshot attachments, and answers. Its Settings control opens the full workspace and Settings; both modes share the current conversation, unsent draft, and attachments.
- **`Alt+W` show/hide:** replaces `Alt+R` as the default. Existing custom bindings are preserved, and the screenshot default remains `Alt+Shift+S`.
- **Optional tray icon:** notification-area clutter can be reduced through Settings. An in-app Quit control and the normal shortcut/launcher paths remain available. LucentCue remains visible to Task Manager and the operating system.
- **Browser reliability:** the selected tab remains readable while the companion covers Chromium; actual background tabs remain hidden and minimized reads are rejected. Bounded shutdown waits for the owned Chromium process to exit, and a stale DevTools endpoint marker is removed before a fresh launch. Three reopen cycles passed without a profile-lock race.
- **Windows pinning:** uses a level above the taskbar after an A/B test reproduced immediate loss of native topmost state at the default floating level.

This preview includes the prior source fixes for selected browser tabs, unchanged-shortcut registration, copying answers, bounded streamed output, and long-conversation rendering. Browser assistance uses a visible separate Chromium profile, reads the selected tab, and fills only the field and text a person explicitly approves. It does not submit forms.

Free OpenRouter routing, personal-provider keys, screenshot review, optional local text history, Markdown export, and visible user-approved browser filling remain available. Free requests are quota-limited and have no automatic paid fallback. No personal key was provided during this session, so live provider completions have not been verified.

## Verification

Current 0.2.0 source passed **100 automated tests with headed Chromium enabled, repeated twice, and 21 Electron smoke checks** on Windows. Smoke checks include the companion Settings/workspace transition, draft preservation, 360 px minimum-width flow, real screenshots through preview/removal, visible browser read/attach/approved fill without submission, tray controls, explicit Quit availability, lost-shortcut registration recovery, and capture-protection state across mode changes. Native OS keypresses passed `Alt+W` hide/restore, `Alt+Shift+S` screenshot preview/removal, and restore with the tray icon disabled. Formatting and type checks passed; the dependency audit reported zero vulnerabilities. These checks use an isolated source-test profile and do not establish installed-package behavior. [Windows testing](WINDOWS_TESTING.md) distinguishes those outcomes from installation results.

[Cross-platform CI](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39057212565) passed at source commit `7a6ec0b`, including 19 real Windows Electron desktop smoke checks after building. The optional real screenshot/browser paths bring the local total to 21; native key injection and recording experiments remain separate local desktop checks. [Native packaging](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39057213652) passed at the same source commit for Windows x64, macOS x64/arm64, and Linux x64.

The [verified attachment workflow](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39057430853) supplied all five packages and their checksum manifest. The downloaded Windows CI installer was 117,814,323 bytes and matched published SHA-256 `31cdfd87f10b722f3efc14f78b836f6a6f1da469bca25c5f023865bca059e707`.

## Windows installation status

On the tested PC, Windows reported **“An Application Control policy has blocked this file.”** The 0.2.0 installer did not start and the existing 0.1.1 installation remains. Installing on that device requires a build signed by a certificate trusted by its policy, or administrator-approved deployment. No security policy was changed or bypassed. Installed 0.2.0 runtime behavior remains unverified; the new companion and `Alt+W` shortcut were verified in the isolated source app.

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
