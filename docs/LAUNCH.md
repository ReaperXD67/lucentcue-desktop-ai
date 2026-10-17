# Launch and discovery

Working brand: **LucentCue**. Proposed repository: **`lucentcue-desktop-ai`**. This is a preparation guide; it does not assert that a public repository, signed release, directory listing, or collaboration already exists.

## Positioning

Suggested repository description, once the listed functions pass release checks:

> An open-source desktop AI assistant with free-model routing, your own API keys, screenshot context, and configurable shortcuts for Windows, macOS, and Linux.

Use a useful product name plus clear category terms. A concise demo, trustworthy release downloads, setup instructions, and responsive issue handling give people a reason to star. Names and keyword density cannot guarantee rankings or stars.

Suggested [GitHub topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics), only when implemented: `ai-assistant`, `desktop-app`, `electron`, `openrouter`, `byok`, `screenshot`, `productivity`, `windows`, `macos`, `linux`. Add `gemini`, `openai`, or `playwright` only when the integration actually works. LucentCue uses Electron; Tauri directories are not a fit.

Before public release, verify packaged install/start/quit, shortcut conflicts, screenshot preview and removal, streaming cancellation, quota errors, key persistence, data deletion, and browser-action consent on each advertised OS. Publish a short capability table that labels untested platforms and planned features. Keep screenshots and the main README aligned with the released build. Avoid promises of zero bugs, unlimited free usage, or universal invisibility.

## OpenRouter directory

[OpenRouterTeam/awesome-openrouter](https://github.com/OpenRouterTeam/awesome-openrouter) is a relevant future target after real integration and public release. Its [contribution requirements](https://github.com/OpenRouterTeam/awesome-openrouter/blob/main/CONTRIBUTING.md) include BYO OpenRouter keys, a public app/landing page, logo, and traction or notability. Brand-new projects without users/downloads/community activity are unlikely to be accepted; a listing is not a partnership or endorsement.

The directory takes `apps/<slug>/app.yaml` and square `logo.png` (128 or 256 pixels recommended). The description has a 300-character ceiling. Do not edit its generated README. Draft below; replace every `OWNER` placeholder with the actual public owner, verify links, use the actual submission date, and update capability wording before submission:

```yaml
name: "LucentCue"
description: "Open-source desktop AI assistant with OpenRouter free-model routing, screenshot context, and configurable shortcuts. Bring your own OpenRouter key."
url: "https://github.com/OWNER/lucentcue-desktop-ai"
docs: "https://github.com/OWNER/lucentcue-desktop-ai#providers"
tags:
  - chat
  - productivity
open_source: "https://github.com/OWNER/lucentcue-desktop-ai"
date_added: "YYYY-MM-DD"
```

## Awesome Mac

[jaywcjlove/awesome-mac](https://github.com/jaywcjlove/awesome-mac) is a relevant target after a tested macOS build is available. Its [guidelines](https://github.com/jaywcjlove/awesome-mac/blob/master/docs/CONTRIBUTING.md) request useful entries, duplicate checks, the correct category, alphabetical placement, and concise descriptions. AI-assisted additions should synchronize English, Chinese, Japanese, and Korean README entries and preserve existing icon conventions. Re-read current guidelines at submission time.

Draft English entry for the AI Tools section, after the release claim is true:

```markdown
* [LucentCue](https://github.com/OWNER/lucentcue-desktop-ai) - Open-source desktop AI assistant with screenshot context, configurable shortcuts, and OpenRouter or your own provider keys.
```

## Collaboration

Start with reproducible bug reports and useful contributions to dependencies already used by the app. Propose listings only after their acceptance criteria are met. Keep partnership language out of the README until an actual agreement exists. No external contact, directory submission, GitHub push, or public post has been performed by this preparation work.
