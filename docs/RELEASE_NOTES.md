# LucentCue preview notes

## 0.2.4 — new companion conversation shortcut (source only)

**Alt+N** opens, reveals, and focuses a fresh companion from the workspace, companion, or a hidden window. It stops any active response, clears the unsent text/images/page context, and keeps completed turns and partial answers in the session conversation list. Settings exposes **New conversation shortcut** alongside show/hide and capture; failed changes restore all three bindings. Existing custom shortcuts survive migration, including an older Alt+N binding: the new action chooses Alt+Shift+N or Control+Alt+N if necessary and displays a notice.

The global action is ignored while a screenshot/chooser is active. Renderer capture promises and pending history selection are guarded against changing a newer conversation; late answer events are rejected by request ID. Focus waits for the new composer to render.

The three-image-per-message and eight-image-per-conversation safeguards remain. Follow-ups resend prior images, so the limits bound request size, session memory, and repeated image input costs; model/provider limits still apply independently.

Formatting, type checks, **101 default automated tests**, the production build, and **34 local Windows desktop checks** passed. The isolated-profile suite invokes actual registered main-process callbacks with mock context/completions and verifies reset/focus, hidden recovery, three-way shortcut configuration/rollback, partial stream cancellation, late-event rejection, and delayed history-selection cancellation. No real key, image capture, browser session, or provider completion was used. Actual installed Alt+N keypress behavior remains unverified.

This update is source only. No 0.2.4 installer or native package has been published, and the tested PC remains on installed 0.2.2. The existing 0.2.3 packages and signing status are unchanged.

## 0.2.3 — readable searchable model picker

Published as [v0.2.3-preview.1](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.2.3-preview.1) from source `76ef0a4f1fce29525fd6b8fd518a0cdd11d45f41`, with all five unsigned native packages and `SHA256SUMS.txt`. Windows Application Control blocked the installer on the tested PC before startup; the installed app remains 0.2.2.

Replaces the Windows model dropdown whose light text could appear on a white popup with a themed searchable picker. Names and exact IDs are readable in Dark and Light; image and free labels, **Images only**, selected-state feedback, empty results, and keyboard navigation make large catalogs easier to use. The popup stays within the workspace and avoids clipping above the composer. Provider and Settings dropdown options also receive explicit theme colours.

Model selection saves the exact catalog identifier and clears an earlier selection error after a successful save. Provider/mode transitions block the previous catalog until their new catalog or error is available. Ordinary model saves retain keyboard focus. Changing models does not submit a question or make a paid completion request. The existing Free defaults and provider/pricing policies are unchanged.

Formatting, type checks, **96 default automated tests**, the production build, and **30 local Windows desktop checks** passed. The isolated-profile desktop suite uses mocked completions and verifies search/filtering, persisted keyboard selection without sending, Escape/outside dismissal, selected feedback, Dark/Light label contrast and popup bounds, scrolling to the active option, and blocking stale catalog selection during a delayed provider save. Dark, Light, and filtered-search screenshots were visually inspected. [CI](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39132719890) passed on Windows, macOS, and Linux, including all 30 hosted Windows desktop checks. Matching-source [native packaging](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39132722198) and [asset/checksum verification](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39132934335) passed for all five packages and the manifest. macOS/Linux installed runtime remains unverified.

The Windows installer is 117,818,663 bytes, SHA-256 `84d819449ae541933daac9926c178ae645f30be194dac34f95dbafd9b2d2aae2`, matching the downloaded manifest and GitHub asset digest; Authenticode reports `NotSigned`. Normal `/S` startup was refused with **“An Application Control policy has blocked this file.”** Read-only Code Integrity events 3077/3033 at 19:18 on 18 October 2026 confirm enterprise signing requirements. No installer process started or exit code was returned. No security policy, trust, metadata, or published filename was changed. The installed 0.2.2.0 app reopened normally; **DeepSeek V4.1 Flash · vision** was selected through its existing native dropdown under Bring your key → OpenRouter and confirmed in the UI. The new picker is published but not installed on this PC. SignPath approval and trusted signing or administrator-approved deployment remain pending. No key or live model answer was tested, and the 0.2.2 release assets remain unchanged.

## 0.2.2 — direct appearance controls and screenshot delivery

Published as [v0.2.2-preview.1](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.2.2-preview.1) from source `d936e31f1ddba76f91931fb118e72ff630915a2e`, with all five unsigned native packages and `SHA256SUMS.txt`. The official Windows package installed and passed the checks below on 18 October 2026; trusted signing remains pending.

- A **sun/moon button** in both headers immediately switches and saves Dark/Light. Follow system remains in Settings.
- **Save appearance** saves only theme and opacity; **Save & preview companion** also opens the small window to show the effect. Preview waits for unrelated Workspace drafts to be saved, while appearance saves and quick theme changes preserve those drafts.
- Clearer opacity endpoints and guidance: Windows/macOS allow 85–100% opacity for the entire companion, including text. The workspace stays solid; Linux and browser previews remain solid. The native opacity behavior is unchanged; the controls now make its save-and-preview workflow explicit.
- Settings writes are serialized and merge only the requested changes. A quick theme change cannot overwrite an unsaved shortcut, prompt, or opacity draft; failed saves retain the saved appearance and can be retried.

Shortcut-delivered screenshots close an overlapping Settings/Browser panel and focus the composer after it becomes visible. This fixes narrow workspaces where the image attached correctly but its preview and text box stayed hidden. Capture focus follows React's committed layout. Draft text and existing attachments are preserved, including when a fourth capture is rejected; capture does not submit a question. A harmless 1 × 1 PNG desktop regression exercises both panels without taking a real screenshot or making a provider request.

Formatting, type checks, **96 default automated tests**, production build, and **26 local Windows Electron desktop checks** passed. The expanded desktop suite verifies immediate theme persistence, unrelated draft preservation, independent appearance saves, normalized shortcut reconciliation, companion preview, native opacity across hide/show and reload, and failed-save rollback/retry. It uses an isolated profile and mocked completions. [CI passed on Windows, macOS, and Linux](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39123365729), including **26 Windows desktop checks**. Matching-source [native packaging](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39123368696) and [asset verification](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39123563024) passed for all five packages and the checksum manifest. macOS/Linux desktop runtime behavior remains unverified.

The Windows installer is 117,816,774 bytes, SHA-256 `5bbf53f1db2b5b7dfd54771a6edc08e12d2208f06f69858091aa13af077115e1`, matching the downloaded manifest and GitHub asset digest. Normal per-user installation completed with exit code 0; the installed executable reports product version `0.2.2.0`, file version `0.2.2`, and Authenticode `NotSigned`.

In the actual installed app, the sun/moon button switched Dark → Light → Dark while retaining the unsent draft. Saving 85% opacity and previewing opened the visibly translucent 480 × 380 companion; reopening Settings showed the saved preference and a solid 1240 × 820 workspace. With the tray preference off, native **Alt+W** keypresses from an owned Calculator window hid and restored the same companion. The existing custom **Alt+S** capture binding attached a real screenshot; its preview appeared and removal succeeded without sending or changing the draft. The app was left in Dark at 85% opacity with its tray preference off. No personal key or live completion was tested; browser runtime and external recording privacy were not retested for the installed 0.2.2 package. See [Windows testing](WINDOWS_TESTING.md).

**Show tray icon** remains a Workspace preference applied with **Save settings**. `Alt+W` hides the window and keeps the app running; it does not remove a tray icon by itself. Turning the icon off reduces notification-area clutter and does not hide the process from Task Manager.

The [SignPath guide](SIGNING.md) records the actual application fields, public project draft, owner steps, and signing-to-installation workflow. On 18 October 2026, the owner reported successful application submission; approval remains pending. No signing certificate or undetectable-capture capability is claimed. The published 0.2.1 and 0.2.0 assets remain unchanged.

## 0.2.1 — appearance and signing preparation

Published as [v0.2.1-preview.1](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.2.1-preview.1), with all five unsigned native packages and `SHA256SUMS.txt`. The official Windows package installed successfully on the tested PC on 18 October 2026; trusted signing remains pending.

- Dark by default, with Light and Follow system themes across chat, Settings, Markdown, and browser panels.
- Persisted 85–100% whole-companion opacity on Windows/macOS. The full workspace stays opaque; Linux and browser previews keep solid windows.
- Actual app version in the workspace footer, replacing the stale version label.
- A free-signing application draft and read-only Windows signature/payload verification procedure in [SIGNING.md](SIGNING.md). No application approval, signing credentials, or trusted signature has been obtained.

All **105 automated tests passed with real headed Chromium enabled**. [CI](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39117067053) passed on Windows, macOS, and Linux, including **21 Windows Electron smoke checks**. Appearance checks save Light and System, simulate system-color changes, verify Dark after renderer reload, compare native companion opacity near 0.85 with workspace opacity 1, and assert the actual startup version. Formatting, typecheck, production build, and the production dependency audit passed with zero reported vulnerabilities. Mac/Linux desktop runtime behavior remains unverified.

[Native packaging](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39117090507) and [asset verification](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39117292327) passed at source commit `b177ef7`. The Windows installer is 117,815,808 bytes, SHA-256 `243889d851e00f4fad18eed48a493ac075bf0a6f1414d418dc9e65cfb4d979d3`.

The unchanged Windows 0.2.1 installer matched both `SHA256SUMS.txt` and GitHub's asset digest, completed normal per-user installation with exit code 0, and produced an installed executable reporting `0.2.1.0`. That installed version opened its dark 480 × 380 companion, with a desktop shortcut targeting the executable. Native **Alt+W** keypresses hid and restored it from another owned application. Native **Alt+Shift+S** attached a real screenshot, restored the companion, and displayed its preview; removing that attachment succeeded, and no question was sent. The Settings gear opened the 1240 × 820 workspace displaying version 0.2.1. Personal OpenRouter key setup and live answers remain pending. The later 0.2.2 appearance controls and screenshot-panel fix are not included in that historical package.

The published 0.2.0 assets remain unchanged. Windows Code Integrity events 3077 and 3033 confirm that the earlier downloaded 0.2.0 installer failed this device's enterprise signing requirements; it never started. The later 0.2.1 installer was accepted without changing security settings, trust stores, file metadata, or its published filename. No reason for this differing policy outcome is claimed. The 0.2.0 recording experiments below were not repeated for the installed 0.2.1 package.

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

Windows reported **“An Application Control policy has blocked this file.”** for the 0.2.0 installer, which never started. Installed 0.2.0 runtime behavior remains unverified; its companion and `Alt+W` tests used the isolated source app. The later official 0.2.1 installer succeeded as recorded above. No security policy was changed or bypassed, and no publisher signature has been obtained.

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
