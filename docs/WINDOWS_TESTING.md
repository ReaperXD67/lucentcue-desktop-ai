# Windows installation and privacy test record

This record separates source/release checks, tests of an installed application, and live provider access. **The official unsigned 0.2.1 Windows preview is now installed; native Alt+W hide/restore and Alt+Shift+S screenshot preview/removal passed.** The earlier 0.2.0 installer was blocked before startup; its installed behavior remains unverified. Trusted signing, personal OpenRouter key setup, and live answers remain pending. External recording privacy was not retested on the installed package.

## 0.2.2 source: shortcut attachment visibility

[CI passed on all three platforms](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39122073154) at `e4d73fa`, including 96 default automated tests and **22 Windows Electron desktop checks**. The new regression injects a known harmless 1 × 1 PNG through the main-process capture-delivery event in an isolated profile. At a 900 × 720 workspace, it first verifies that Settings/Browser hides the composer, then checks that capture closes either panel, renders the preview, focuses the visible text box, preserves existing draft/attachments, and does not increment mocked completion requests. It does not capture the user's desktop, clipboard, or a real model response.

The fix and actual SignPath application field guide are pushed in source. The existing 0.2.1 release assets are unchanged and do not contain this fix; the installed PC is now on that 0.2.1 package. No signing approval was obtained. On 18 October 2026, the owner reported successful SignPath application submission. This report is separate from a verified receipt or the Foundation's eligibility decision.

## 0.2.1 appearance and signing preparation

The source adds Dark, Light, and Follow system themes, persisted companion opacity, and the actual application version. All **105 automated tests passed with real headed Chromium enabled**; default CI runs 96 tests and skips nine optional browser checks. Formatting, typecheck, production build, and the production dependency audit passed with zero reported vulnerabilities. Browser-preview visual inspection covered the 480 × 380 dark companion and both color palettes in the workspace; this does not establish native opacity behavior.

Hosted Windows desktop smoke checks cover saving Light and System settings, simulated system-color changes, Dark persistence after renderer reload, companion native opacity near 0.85, workspace recovery to 1, and resetting the preference. The native suite uses a temporary profile and mocked completions. A follow-up harness change launches the project directory, matching normal app startup, and asserts the reported version against package.json. Exact CI and packaging results are linked in [preview notes](RELEASE_NOTES.md).

Read-only Windows Code Integrity logs show events **3077 and 3033** for the downloaded 0.2.0 installer, reporting enterprise signing requirements. That installer did not run. The later official 0.2.1 installer was accepted through normal installation. No trust store, security policy, file metadata, or published filename was changed, and a newly built local executable was not used to work around the earlier refusal. No cause for the differing policy outcome is asserted.

The [signing guide](SIGNING.md) records an owner-reported submitted application, not an accepted subscription. Its read-only verifier previously rejected the unsigned 0.2.0 installer and mixed 0.1.1 installed payload on PowerShell 5.1 and 7, including missing-file, duplicate-input, and report-overwrite cases. No successful signed-release fixture is available. Trusted signing enrollment and complete payload integration remain pending. Existing 0.2.0 recording results below were not rerun for installed 0.2.1.

### Installed 0.2.1 checks — 18 October 2026

| Check | Observed result |
| --- | --- |
| Official Windows installer | `LucentCue.Setup.0.2.1.exe`, 117,815,808 bytes |
| Installer SHA-256 | `243889d851e00f4fad18eed48a493ac075bf0a6f1414d418dc9e65cfb4d979d3`; matches release manifest and GitHub asset digest |
| Authenticode | `NotSigned`; installation success does not establish a trusted signature |
| Normal per-user upgrade | Official installer completed with exit code 0; installed product version `0.2.1.0`, file version `0.2.1` |
| Actual installed launch | Opened the dark 480 × 380 compact companion at `%LOCALAPPDATA%\Programs\LucentCue\LucentCue.exe` |
| Desktop shortcut | `LucentCue.lnk` exists on the user's desktop and targets the installed executable |
| Actual global `Alt+W` hide/restore | Passed: native keypresses from an owned Calculator window hid LucentCue and restored the same companion window |
| Installed `Alt+Shift+S` attachment preview/removal | Passed: native keypress from Calculator captured a screenshot, restored the companion, showed the attachment preview, and removal through the UI cleared it; no Send action or model request |
| Companion Settings gear | Opened the dark 1240 × 820 full workspace with version 0.2.1 in its footer |
| Personal OpenRouter key and live free-model answer | Not configured/tested; Settings has OpenRouter selected and reports no saved key; owner key entry remains pending |
| Installed opacity, browser assistance, and external recording privacy | Not tested; source evidence below remains separate |

The native shortcut tests used a fresh, owned Calculator window as the foreground target and closed it afterwards. No personal key, history contents, or screenshot image was included in public evidence, and no captured image was sent to a provider. The 0.2.2 source-only fix that reveals shortcut attachments beneath overlapping Settings/Browser panels is not in this installed 0.2.1 package. The release assets remain unchanged.

## Published 0.1.0 baseline

Read-only GitHub check on 17 October 2026 found:

| Item | Evidence |
| --- | --- |
| Published unsigned prerelease | [v0.1.0-preview.1](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.1.0-preview.1) |
| Native Windows/macOS/Linux package build | [39045558099 — successful](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39045558099) |
| Baseline CI | [39046554878 — successful](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39046554878) |
| Windows installer | `LucentCue.Setup.0.1.0.exe`, 117,807,377 bytes |
| Release asset SHA-256 | `c5f1aa33096b85990f0d601301bdcc9c11125d76824e5b9c3e1cde20d72b9727` |

This baseline does not establish that a personal provider key works or that every screen recorder honors protection. [Release notes](RELEASE_NOTES.md) describe the next preview separately.

## 0.1.1 baseline checks

| Check | Verified outcome |
| --- | --- |
| Automated suite with real Chromium enabled | 90 tests total, including 8 real Chromium tests |
| Electron smoke with `LUCENTCUE_DESKTOP_FEATURES=1` | 17 checks passed |
| Real display screenshot through UI button | Captured by the OS, preview appeared, attachment removed before any send |
| Visible assistant Chromium, local fixture | Opened through actual UI; page read/attached; approved chosen field filled; local input event confirmed; no submit |
| Copy answer regression | Bounded trusted IPC reached a spy of the native writer; no user clipboard read or replacement |
| Actual global-shortcut keypresses | Installed 0.1.1 hid successfully after an injected native `Alt+R`; global restore and screenshot keypress remain unverified |
| New-version packaging and installed upgrade | Windows NSIS build passed; silent per-user upgrade exited 0; installed executable reports `0.1.1.0` and opened |
| Cross-platform CI | [39049628563 — successful](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39049628563), commit `525e5f8` |
| Windows/macOS/Linux native packaging | [39049629404 — successful](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39049629404), same commit |

The locally built `LucentCue Setup 0.1.1.exe` is 117,809,712 bytes, SHA-256 `ec76628f2b1102c92e07cee0c76d712719e7a09823098ebd5aad9fbc3b073636`. This identifies the installed build's installer, not a future independently built CI asset.

These smoke checks use a temporary source-test profile. They do not replace installed-app checks or external recording tests. No model key or live model response was used.

## Synthetic UI comparison

`scripts/benchmark-ui.mjs` serves a built renderer locally, uses a synthetic desktop bridge, blocks external requests, and drives headless Chromium at 4× CPU throttling. Five measured runs used 60 messages containing 77,001 characters, 20 input keystrokes, and 40 simulated stream deltas scheduled 16 ms apart.

| Complete workload elapsed time | Before median | After median |
| --- | --- | --- |
| Type 20 characters | 16,543 ms | 549 ms |
| Process 40 stream deltas | 31,394 ms | 1,363 ms |

These are same-fixture local stress comparisons. They are not per-key latency, live provider/network measurements, or guarantees for a user's installed app. Completed-message rendering reuse is the change under comparison. Source reports were checked in `test-results/ui-benchmark-before.json` and `ui-benchmark-after.json`; generated results are local artifacts.

After `npm ci`, `npm run browser:install`, and `npm run build`, reproduce the current build with `node scripts/benchmark-ui.mjs dist current`. Optional positional arguments select a built-renderer directory and output label; `LUCENTCUE_BENCH_RUNS` defaults to five measured runs. The script writes `test-results/ui-benchmark-<label>.json`, uses no personal profile/keys, and checks preserved text, cancellation, copy callbacks, links, and absence of external requests/renderer errors. A before/after comparison requires two corresponding builds, not two labels for the same build.

## 0.2.0 verification

Source tests use an isolated LucentCue profile and harmless local fixtures. Native keypress tests injected actual OS key combinations while an owned local Electron fixture was foreground; they exercise global shortcuts rather than invoking registered callbacks directly. They do not replace installation checks of the distributed package.

| Check | Current-version outcome |
| --- | --- |
| Format, typecheck, dependency audit | Passed; audit reported zero vulnerabilities |
| Automated suite with Chromium | All 100 checks passed with headed Chromium enabled, repeated twice; headless run passed 99 with the one headed-only case skipped |
| Electron smoke | 21 checks passed, including compact/workspace transitions, shared draft, 360 px minimum-width flow, invalid mode rejection, tray controls, explicit Quit availability, shortcut re-registration recovery, capture-protection state across mode changes, screenshots, and browser flow |
| Companion → Settings/workspace → companion | Gear opened Settings in the full workspace; switching back retained the draft |
| `Alt+W` hide and global restore, including tray icon off | Actual native keypresses passed hide, restore, and restore with tray icon disabled |
| Old-default migration and custom-shortcut preservation | Automated storage regressions passed; installed upgrade could not run because Application Control blocked the installer |
| Screenshot UI and native `Alt+Shift+S`, preview/removal | Real OS screenshot paths passed; attachment appeared and was removed before sending |
| Visible browser read/attach/approved fill, no submit | Local-fixture UI flow passed; input was filled and no submit occurred |
| Covered selected browser tab, genuine background tab, minimized browser | Headed Windows browser tests passed read/fill while covered, preserved background-tab hidden state, and rejected minimized reads |
| Browser close/reopen | Removed stale DevTools endpoint marker before fresh launch; bounded shutdown waits for owned process exit. Three reopen cycles passed without a profile-lock race. |
| Tray icon toggle and explicit Quit | Source checks passed; launcher reopen remains an installed-package check |
| Windows pin state | A/B reproduced floating level getter false versus `pop-up-menu` true; Windows pin now uses the latter and may appear above the taskbar |
| External paired DXGI recording fixture, off/on/off | All six decoded frames per state passed; protected frames were 100% black; details below |
| External DXGI recording of the built LucentCue source app in both modes | 42 decoded frames across 7 stages passed: all 18 protected frames 100% black; all 24 unprotected baseline/restored frames showed app UI |
| External capture of installed binary, WGC, OBS, Zoom, or other target recorder | Not tested; source-app and fixture evidence do not establish this |
| Windows published installer | `LucentCue.Setup.0.2.0.exe`, 117,814,323 bytes; downloaded file matched the published SHA-256 below |
| Installed 0.2.0 upgrade / launch | Blocked before installer startup: “An Application Control policy has blocked this file.” The PC remained on 0.1.1 at that time and later upgraded directly to 0.2.1; no installed 0.2.0 runtime pass claimed |
| Windows/macOS/Linux CI | [39057212565 — successful](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39057212565), source `7a6ec0b`; Windows logs confirm 91 offline tests passed, 9 optional browser tests skipped, and 19 default real Electron checks |
| Matching-commit Windows/macOS/Linux native packages | [39057213652 — successful](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39057213652); Windows x64, macOS x64/arm64 DMG, Linux x64 AppImage/deb |
| Published release packages and SHA-256 checksums | [v0.2.0-preview.1](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.2.0-preview.1): five native packages plus `SHA256SUMS.txt`, matching source `7a6ec0b`; [attachment workflow 39057430853 passed](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39057430853) and GitHub asset digests verified |

The published Windows 0.2.0 CI installer's SHA-256 is `31cdfd87f10b722f3efc14f78b836f6a6f1da469bca25c5f023865bca059e707`. A correct hash establishes file identity, not permission to run under Windows policy. The later official 0.2.1 package installed successfully, as recorded above. No unblocking, policy/security-setting changes, or rebuild intended to evade policy were performed.

The Windows CI job passed `npm run test:desktop` after building, using its isolated profile and mocked completions. Its 19 default checks do not enable the two optional real screenshot/browser feature paths included in the 21 local checks, or replace the local native-keypress/recording experiments.

## Installed 0.1.1 baseline results

These are historical checks of the earlier 0.1.1 installation, which used `Alt+R`; the current installed 0.2.1 checks above use `Alt+W`. Preserve exact-version evidence without personal keys, prompts, browsing sessions, or other private content. Use `%LOCALAPPDATA%`/`%APPDATA%` in public paths rather than a person's Windows account name.

| Check | Observed result |
| --- | --- |
| Windows build / display configuration | Windows 11 Home, version `10.0.26200`; display configuration not yet recorded |
| Installed executable path | Successful per-user installation at `%LOCALAPPDATA%\Programs\LucentCue\LucentCue.exe` |
| Installed application launch | Actual installed LucentCue window opened successfully |
| Tray restore, titlebar hide, minimize, explicit Quit | Live-action checks pending |
| `Alt+R` hide/show; shortcut change/conflict handling | Native `Alt+R` hid the installed window; global restore keypress remains pending. Source registration/collision checks passed. |
| Screenshot button and `Alt+Shift+S`; preview/removal before send | Installed-app manual checks pending; real source UI-button path passed above |
| Public OpenRouter catalog | Loaded without a key; Free Models Router displayed with vision support |
| Personal OpenRouter key configured directly in app | Not performed; user chose to continue without a key |
| Free router live answer, streaming, Stop | Not tested; no personal key supplied |
| Optional browser setup, visible open/read/approved fill | Installed-app manual checks pending; visible source local-fixture path passed above |
| Installed interaction responsiveness / crashes | Pending; the headless source comparison above is separate |

After the successful hide keypress, Windows UI automation stopped because it could not confidently determine the foreground browser URL for its policy checks. No further native app input was issued during that test. The old build used `Alt+R`; the 0.2.0 default changes to `Alt+W`. Installed screenshot-hotkey and target-recorder checks were unfinished; source workflow and separate fixture results are listed independently.

## Capture-protection test method

1. Use a harmless test screen, with no key-entry panel, private chat, or personal browser page visible. Show a distinctive LucentCue window over an ordinary background.
2. Set **Exclude window from screen capture** off and save. Capture an external baseline that visibly contains the window.
3. Turn protection on and save, allow the desktop to redraw, and capture the same scene with the same app, capture mode, and display. Inspect the saved image or recording, not only the preview.
4. Record what was visible, excluded, or blacked out. Restore the user's preferred setting afterwards. If a sharing/recording product matters, test that exact product and its display/window mode separately.

LucentCue's own screenshot flow temporarily hides its window before capture. Its absence from that screenshot **does not test** capture protection.

| Evidence type | What it can establish | What it cannot establish |
| --- | --- | --- |
| Capture-affinity/API state | The OS accepted a protection request on that window | That every recorder honors it |
| External screenshot, with app/mode recorded | The pixels produced by that specific tool and mode | Untested Windows.Graphics.Capture or DXGI behavior |
| Identified Windows.Graphics.Capture display/window capture | Behavior of the tested WGC path and configuration | Every desktop-duplication, driver, camera, or conferencing path |
| Identified DXGI Desktop Duplication capture | Behavior of that tested desktop-duplication path | Every WGC/window-capture or third-party implementation |
| Task Manager/process listing | The app is an ordinary discoverable process | Screenshot content protection |

Name a capture API only when the tool/test identifies it. A generic screenshot or Snipping Tool observation should be described by tool and mode unless its implementation is independently established. Microsoft documents [Windows.Graphics.Capture](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture) and [DXGI Desktop Duplication](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api) as distinct capture mechanisms.

## Capture observations

### Built LucentCue app

`tests/app-recording-smoke.ts` recorded the actual built LucentCue source app in an isolated empty profile with a mocked catalog, no keys/history, and zero completion requests. Native protection was changed through the real Settings IPC and checked in companion and workspace modes. An owned opaque backdrop and strict crops kept unrelated desktop content outside the recordings; no other application received input.

FFmpeg 9.0 `ddagrab` used DXGI Desktop Duplication on Windows 11 with Electron 44.9.0. Seven stages recorded 1.2 seconds at 5 fps each, yielding 42 decoded frames:

| State | Observed pixels |
| --- | --- |
| Companion/workspace unprotected and restored OFF | All 24 frames showed app UI; expected app palette covered about 96.3% of the companion crop and 97.6% of workspace; black fraction stayed below 0.02% |
| Companion protected, workspace protected, and workspace protected after a mode transition | All 18 frames were 100% black |

Every decoded frame assertion passed, native protection flags matched the requested states, and no renderer errors occurred. This validates the built source app and tested DXGI configuration; it is not an installed-binary test or a result for WGC, OBS, Zoom, cameras, or every recorder. Reproduce on a Windows desktop with FFmpeg available by running `npm run build`, then `npx tsx tests/app-recording-smoke.ts`. Local recording evidence stays in ignored `test-results/`.

### Independent fixture

`tests/capture-protection-smoke.ts` exercised a separate harmless Electron fixture and owned opaque backdrop on Windows. It did not control the user's other applications. FFmpeg `ddagrab` captured a 605 × 405 region strictly within that backdrop using DXGI Desktop Duplication. OFF → ON → restored OFF produced native protection flags false → true → false. The current video experiment recorded 1.2 seconds per state at 5 fps, decoded six frames per state, and asserted every frame:

| Tool/API and mode | Protection off | Protection on | Restored off | Interpretation |
| --- | --- | --- | --- | --- |
| FFmpeg `ddagrab`, DXGI cropped display video | 96.8766% fixture colors in all 6 frames | All 6 frames 100% black | 96.8766% fixture colors in all 6 frames | Valid paired video baseline: this tested path blacked out the protected fixture throughout the short recording |
| FFmpeg `gdigrab`, GDI window-title capture | Black | Black | Black | **Inconclusive**: neither OFF baseline showed the fixture |
| Windows.Graphics.Capture | Not tested | Not tested | Not tested | No claim |
| OBS/Zoom or other actual target recorder/share | Not tested | Not tested | Not tested | No claim |

This is evidence for one isolated fixture, machine, Electron version, crop, and FFmpeg path. It does not establish that the installed LucentCue window, WGC, a conferencing app, every recorder, or a camera will exclude content. Local reports, images, and recordings are ignored evidence under `test-results/capture-protection/`, not public captures of a user's desktop. The optional harness requires an available FFmpeg executable; set `LUCENTCUE_CAPTURE_DXGI=1` and `LUCENTCUE_CAPTURE_VIDEO=1` to enable the guarded DXGI crop and video experiment in addition to GDI. Run `npx tsx tests/capture-protection-smoke.ts` on a Windows desktop session.

Windows capture exclusion is best effort. Microsoft's [SetWindowDisplayAffinity documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity) does not guarantee strict protection. Electron also notes that changes take effect on a later desktop composition and that macOS ScreenCaptureKit can ignore its setting. See [Electron platform limits](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows). Nothing here promises process invisibility, anonymous API usage, or undetectability.
