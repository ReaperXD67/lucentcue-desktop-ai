# Windows installation and privacy test record

This record separates source/release checks, tests of an installed application, and live provider access. **0.1.1 was packaged, installed, and opened on Windows; source workflow checks and a scoped DXGI fixture experiment passed.** Target-recorder tests and live model answers remain pending.

## Published 0.1.0 baseline

Read-only GitHub check on 17 October 2026 found:

| Item | Evidence |
| --- | --- |
| Published unsigned prerelease | [v0.1.0-preview.1](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.1.0-preview.1) |
| Native Windows/macOS/Linux package build | [39045558099 — successful](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39045558099) |
| Latest checked CI | [39046554878 — successful](https://github.com/ReaperXD67/lucentcue-desktop-ai/actions/runs/39046554878) |
| Windows installer | `LucentCue.Setup.0.1.0.exe`, 117,807,377 bytes |
| Release asset SHA-256 | `c5f1aa33096b85990f0d601301bdcc9c11125d76824e5b9c3e1cde20d72b9727` |

This baseline does not establish that a personal provider key works or that every screen recorder honors protection. [0.1.1 release notes](RELEASE_NOTES.md) describe the next preview separately; no new-version CI/package success is claimed yet.

## Current 0.1.1 source checks

| Check | Verified outcome |
| --- | --- |
| Automated suite with real Chromium enabled | 90 tests total, including 8 real Chromium tests |
| Electron smoke with `LUCENTCUE_DESKTOP_FEATURES=1` | 17 checks passed |
| Real display screenshot through UI button | Captured by the OS, preview appeared, attachment removed before any send |
| Visible assistant Chromium, local fixture | Opened through actual UI; page read/attached; approved chosen field filled; local input event confirmed; no submit |
| Copy answer regression | Bounded trusted IPC reached a spy of the native writer; no user clipboard read or replacement |
| Actual global-shortcut keypresses | Installed 0.1.1 hid successfully after an injected native `Alt+R`; global restore and screenshot keypress remain unverified |
| New-version packaging and installed upgrade | Windows NSIS build passed; silent per-user upgrade exited 0; installed executable reports `0.1.1.0` and opened |

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

## Installed 0.1.1 current-PC results

Record the exact installed version and evidence without personal keys, prompts, browsing sessions, or other private content. Use `%LOCALAPPDATA%`/`%APPDATA%` in public paths rather than a person's Windows account name.

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

After the successful hide keypress, Windows UI automation stopped because it could not confidently determine the foreground browser URL for its policy checks. No further native app input was issued. The workspace can be reopened manually with `Alt+R` or the tray icon. Installed screenshot-hotkey and target-recorder checks remain pending; source workflow and separate fixture results are listed independently.

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

`tests/capture-protection-smoke.ts` exercised a separate harmless Electron fixture and owned opaque backdrop on Windows. It did not control the user's other applications. FFmpeg `ddagrab` captured a 605 × 405 region strictly within that backdrop using DXGI Desktop Duplication. OFF → ON → restored OFF produced native protection flags false → true → false and the following pixels:

| Tool/API and mode | Protection off | Protection on | Restored off | Interpretation |
| --- | --- | --- | --- | --- |
| FFmpeg `ddagrab`, DXGI cropped display | 96.82% fixture colors | 0% fixture; 99.948% black | 96.82% fixture colors | Valid paired baseline: this tested capture path blacked out the protected fixture |
| FFmpeg `gdigrab`, GDI window-title capture | Black | Black | Black | **Inconclusive**: neither OFF baseline showed the fixture |
| Windows.Graphics.Capture | Not tested | Not tested | Not tested | No claim |
| OBS/Zoom or other actual target recorder/share | Not tested | Not tested | Not tested | No claim |

This is evidence for one isolated fixture, machine, Electron version, crop, and FFmpeg path. It does not establish that the installed LucentCue window, WGC, a conferencing app, every recorder, or a camera will exclude content. The local report/images are ignored evidence under `test-results/capture-protection/`, not public captures of a user's desktop. The optional harness requires an available FFmpeg executable; `LUCENTCUE_CAPTURE_DXGI=1` enables the guarded DXGI crop in addition to the GDI experiment.

Windows capture exclusion is best effort. Microsoft's [SetWindowDisplayAffinity documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity) does not guarantee strict protection. Electron also notes that changes take effect on a later desktop composition and that macOS ScreenCaptureKit can ignore its setting. See [Electron platform limits](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows). Nothing here promises process invisibility, anonymous API usage, or undetectability.
