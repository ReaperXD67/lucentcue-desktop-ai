# Get started with LucentCue on Windows

Use the desktop application for real answers, screenshots, and browser assistance. The web interface preview cannot perform those actions. Version 0.1.1 was installed and opened on Windows 11 Home. Current-PC results and source checks are recorded in [WINDOWS_TESTING.md](WINDOWS_TESTING.md). No personal key was supplied, so live model answers have not been verified.

## Install or upgrade

Use the [official releases page](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases) for available Windows installers and `SHA256SUMS.txt`. The locally verified 0.1.1 installer is installed; publication as `v0.1.1-preview.1` remains pending. The installer is unsigned. Open LucentCue from the Start menu after installation. Installed users do not need Node.js, npm, or a source checkout.

The verified per-user executable is `%LOCALAPPDATA%\Programs\LucentCue\LucentCue.exe`. For an upgrade, use **Quit LucentCue** in the tray menu first, then run the newer official installer and choose the same installation location. There is no automatic updater. If local history matters to you, export the conversations you want to keep before changing versions.

## Connect your personal OpenRouter key

You can browse OpenRouter's public free-model catalog without a key. This was observed in the installed preview, including **Free Models Router · vision**. Generating answers still requires a personal key; catalog loading is not a completion test. You can leave key setup for later.

1. Sign in to [OpenRouter's key settings](https://openrouter.ai/settings/keys) and create a dedicated personal key for LucentCue. Review its account and spending controls.
2. In LucentCue, choose **Settings → Connections → Provider → OpenRouter**. Paste the key into the password field and select **Save key**. Enter it directly in the app; never put it in chat, a bug report, source code, or Git.
3. Confirm **Key configured**, then close Settings. This confirms local storage, not that a provider has accepted the credential.
4. Keep **Free** selected below the composer and choose **Free models router** (`openrouter/free`). Send a harmless question such as “Reply with one short sentence about trees” to check live access.

The [free router](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground) chooses an available compatible free model. LucentCue checks zero pricing before each free request and does not fall back to a paid model. **Bring your key** mode can use paid models; stay in **Free** for free-model routing.

Free access is limited by [OpenRouter's current quotas](https://openrouter.ai/docs/api_reference/limits), account policy, and provider capacity. At this guide's 17 October 2026 check, the published policy was 20 requests/minute and 50/day below the credit-purchase threshold, with a higher daily tier after qualifying credit purchases. These limits can change. A 429 means wait before retrying; changing client keys does not create extra quota. If the catalog or router is unavailable, retry later or select another currently listed free model.

## Shortcuts and everyday controls

| Action | Default | Scope |
| --- | --- | --- |
| Show or hide LucentCue | `Alt+R` | Global, while LucentCue is running |
| Capture a display | `Alt+Shift+S` | Global, while LucentCue is running |
| Send a message | `Enter` | Message input focused |
| Insert a new line | `Shift+Enter` | Message input focused |
| Close the workspace to its tray | `Alt+F4` | Standard Windows close action; does not quit LucentCue |

Change the two global shortcuts in **Settings → Workspace**, then select **Save settings**. Use a modifier and key, such as `Control+Shift+Space`. If another app owns the combination, choose another; failed changes restore the previous bindings. New conversation, Search conversations, Export, and Stop generating are UI buttons without dedicated app shortcuts.

The titlebar **X** hides the workspace; **−** minimizes it. Click the tray icon to show/hide it, or use the tray menu's **Open LucentCue**, **Take screenshot**, and **Quit LucentCue**. The pin button or **Keep window on top** setting controls topmost behavior.

## Screenshots and browser assistance

Use the screenshot button or capture shortcut, select a display if asked, and review its attachment thumbnail. Remove it with its **X** before sending if it contains anything private. Choose a model marked **vision**. Capturing alone does not send the image; sending a message does. Images are omitted from saved history and Markdown exports.

In **Browser assist**, select **Set up assistant browser** once to download optional Chromium. This uses the bundled desktop runtime. Open a website, select its tab in the visible Chromium window, and choose **Read page**. Review the text, then **Attach to question** if you want it sent with your message. To write into a page, choose a supported field, review the exact text, and select **Fill selected field**. You submit in Chromium. Website input events may save drafts or trigger site behavior. See [browser boundaries](BROWSER.md).

## Privacy settings and limits

History and capture protection start **off**. **Save history on this device** stores recent conversation text locally without encryption; turning it off and saving removes saved history. **Delete saved history** has a second confirmation. Provider keys use OS-backed encryption when available; otherwise the app shows a notice and retains keys only for the session.

**Exclude window from screen capture** requests best-effort OS protection on Windows/macOS. Save the setting and test your actual capture setup with harmless content. Linux does not support it, and macOS ScreenCaptureKit can ignore it. It does not hide LucentCue from Task Manager, people looking at the screen, cameras, or every recording method. [Windows testing](WINDOWS_TESTING.md) distinguishes API state from observed capture results.

Your key authenticates an account; local encryption does not make provider usage anonymous. Sent prompts, screenshots, and attached page text go to the provider. OpenRouter says prompt/response retention is opt-in but request metadata is stored; underlying providers have their own policies. Review [OpenRouter privacy settings](https://openrouter.ai/settings/privacy), [data collection](https://openrouter.ai/docs/guides/privacy/data-collection), and [provider policies](https://openrouter.ai/docs/guides/privacy/provider-logging) before sending sensitive material.
