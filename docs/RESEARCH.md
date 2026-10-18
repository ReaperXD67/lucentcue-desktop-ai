# Research and provenance

Initial research checked 17 October 2026; capture-privacy sources rechecked 18 October 2026. These findings guide an original implementation; they are not claims that every planned feature has shipped. See the main README for current capabilities and validation.

## Upstream and installer

[Pluely's current README](https://github.com/iamsrikanthnani/pluely#license) explicitly describes **v1 and later as proprietary binaries** and says earlier GPL-3 versions remain available in repository history. GitHub still displays a GPL-3 license badge and an old LICENSE file, so the badge alone does not establish permissions for the supplied 1.1.0 installer. No Pluely source, assets, branding, or decompiled implementation were incorporated into LucentCue. A historical GPL fork would require its own license/provenance audit and GPL-compliant distribution; this project instead uses original code under its root MIT license.

Only local Windows file metadata, Authenticode status, and SHA-256 were inspected. The installer was not run, installed, unpacked, or decompiled.

| Field | Observed value |
| --- | --- |
| File | `Pluely_1.1.0_x64-setup.exe` |
| Size | 10,567,325 bytes |
| Product / file version | Pluely / 1.1.0 |
| Company metadata | Empty |
| `Get-AuthenticodeSignature` status | `NotSigned` |
| SHA-256 | `993FBC9D85EE3E881C6751F247916C9FF00659854F7F7B614FAC04A8DEC9A24A` |

These observations identify this local file. They do not establish whether it is safe or matches an official release. Upstream's README mentions signed binaries, while this file returned `NotSigned`; that discrepancy remains unverified.

## Free models and keys

[OpenRouter free variants](https://openrouter.ai/docs/guides/routing/model-variants/free) are separate catalog entries with their own availability and limits. The documented [free router](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground) uses `openrouter/free` and selects an available free model compatible with requested features. Vision support must be checked before sending screenshots.

The [official limits documentation](https://openrouter.ai/docs/api_reference/limits) and its [Markdown source](https://openrouter.ai/docs/api_reference/limits.md) currently specify 20 requests/minute, 50/day below 10 lifetime purchased credits, and 1,000/day at the higher tier. The source also describes a current one-credit threshold grace. Limits can change: use `GET /api/v1/key` for the actual daily allowance; honor `Retry-After`, bounded backoff, and 429 errors. More client keys do not create independent capacity.

**Free inference is quota-limited, not unlimited service.** A no-charge mode should restrict routing to verified zero-price catalog entries and stop clearly when capacity is exhausted. Paid fallback must require the user's selection. Hosted providers receive submitted prompts and attachments; see [OpenRouter's provider logging policy](https://openrouter.ai/docs/guides/privacy/provider-logging).

Users can supply their own provider keys. A future developer-sponsored free service would need a server-side credential, per-user quotas, abuse controls, budgets, and transparent availability. Never embed a shared key in desktop code, renderer bundles, Git history, or release assets. That shared service is a later plan, not an existing unlimited entitlement.

## Privacy wording

Keep claims precise. Windows exposes capture exclusion through [SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity), but Microsoft explicitly provides no strict protection guarantee. Capture behavior depends on the OS and capture method. A normal desktop process remains discoverable by the operating system and security tools. Do not market LucentCue as process-invisible, universally undetectable, or guaranteed hidden from every recording tool.

LucentCue now exposes optional capture protection through [Electron's API](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows) on Windows/macOS; it is off by default and unsupported on Linux. Electron documents that macOS apps using ScreenCaptureKit can ignore the protection. Successful API calls are not evidence that every capture product excludes the window.

### Pluely's inspectable capture mechanism

At public commit `dc35e936e36b7fe2b03119df268cb1b02d35cf5b`, Pluely's [configuration](https://github.com/iamsrikanthnani/pluely/blob/dc35e936e36b7fe2b03119df268cb1b02d35cf5b/src-tauri/tauri.conf.json#L26) enables `contentProtected` for its main window, and its [dashboard builder](https://github.com/iamsrikanthnani/pluely/blob/dc35e936e36b7fe2b03119df268cb1b02d35cf5b/src-tauri/src/window.rs#L149) also enables content protection. Its [lockfile](https://github.com/iamsrikanthnani/pluely/blob/dc35e936e36b7fe2b03119df268cb1b02d35cf5b/src-tauri/Cargo.lock) pins Tao 0.34.2; that dependency's [Windows implementation](https://github.com/tauri-apps/tao/blob/tao-v0.34.2/src/platform_impl/windows/window.rs#L1003) calls `SetWindowDisplayAffinity` with `WDA_EXCLUDEFROMCAPTURE`. This is the same Windows capture-affinity mechanism class exposed by Electron, not evidence of a special process-hiding method. Pluely's [taskbar/Dock controls](https://github.com/iamsrikanthnani/pluely/blob/dc35e936e36b7fe2b03119df268cb1b02d35cf5b/src-tauri/src/shortcuts.rs#L475) are separate normal window/activation settings.

This comparison is limited to inspectable public code: that configuration reports version 0.1.9, while the [same commit's README](https://github.com/iamsrikanthnani/pluely/blob/dc35e936e36b7fe2b03119df268cb1b02d35cf5b/README.md) says v1 is closed source. It does not prove the supplied 1.1.0 binary's complete internals or actual results in every recorder. No upstream implementation was copied. [Capture privacy](CAPTURE_PRIVACY.md) separates this code evidence from the installed app's state and external capture observations.

## Brand search

**LucentCue** is the brand; the project repository is [ReaperXD67/lucentcue-desktop-ai](https://github.com/ReaperXD67/lucentcue-desktop-ai). Before project publication, exact quoted web searches for `LucentCue` and backup `CairnCue` returned no indexed matches on the check date. That initial search is not trademark clearance, domain availability, or a guarantee of search ranking.

The earlier CueHarbor candidate already appears in [CueHarbor Health](https://cueharborhealth.com/) and an [Android puzzle listing](https://play.google.com/store/apps/details?id=com.ylqcueharbor.xjvkpuzzle.hdtrmqa), so it was rejected as a public brand. The local folder name is only a development path.

Discovery and directory preparation are in [LAUNCH.md](LAUNCH.md). Research involved no maintainer contact, directory submission, partnership claim, or installer execution. Repository creation and authorized source publication are separate delivery steps.
