# Browser assistance

LucentCue opens a **visible Chromium window with its own profile**. It does not connect to your everyday Chrome, Edge, or Firefox profile. Website sessions in this separate profile can persist between launches. The desktop application supplies the profile directory beneath its application data directory.

## Setup

In an installed desktop build, open **Browser assist → Set up assistant browser**. LucentCue downloads the compatible Chromium build using its bundled Electron runtime; no system Node.js or npm installation is needed. The download is optional for chat and screenshots, needs an internet connection, and may take a few minutes. Setup errors can be retried from the same button. The app package includes the setup helper, not the Chromium binary.

For source development, either use that button or install dependencies and download Chromium from the project directory:

```sh
npm ci
npm run browser:install
```

On Linux, Playwright may also require system libraries. Use the [official browser installation instructions](https://playwright.dev/docs/browsers#install-system-dependencies) for your distribution. A missing browser calls for setup; a locked profile may require closing another LucentCue browser before retrying. Current platform and packaged-helper validation are recorded in the [release status](../README.md#release-status).

## Workflow

1. Enter an HTTP or HTTPS website address in the browser panel and choose **Open**. An address without a protocol defaults to HTTPS. Local development sites can use an explicit address such as `http://localhost:3000`.
2. Select the website tab you want in the Chromium window, then choose **Read page** in LucentCue. Review the page context before including it in a conversation.
3. Select an available text field, write or paste the exact text, and choose **Fill selected field**. Review the result in Chromium and perform any submission yourself.

Each read returns the title, URL, up to 12,000 characters of rendered page text, and up to 50 editable text fields from the top document. Existing field values are always returned as empty strings. Passwords, hidden inputs, credential fields, payment fields, login forms, and embedded frames are excluded. Supported fields are ordinary text, search, email, URL, telephone, textarea, and contenteditable surfaces.

A field reference expires after a fill, another read, tab navigation, or a browser close. A changed tab, replaced field, or field that becomes hidden or sensitive requires another read. If multiple browser windows are open, the focused visible tab takes priority; otherwise LucentCue uses the previously read visible tab or the most recently opened visible tab. Keep the intended window and tab selected for predictable results.

## Boundaries

Browser operations come from explicit user actions in the application. The model cannot call a browser tool, click links, submit forms, press Enter, sign in, or run scripts supplied by page text. Pages and their instructions are untrusted reference material. LucentCue does not read browser cookies, local storage, saved credentials, or other browser profiles. Closing the browser ends control but does not erase its profile.

Field filling fires the website's normal input events. A website can react to those events, including saving drafts or issuing requests, so review the destination and text before filling. Page text may itself contain private information; review the context before sending it to your selected model provider. Rendering and form markup vary across websites, so some custom editors are intentionally unavailable.

LucentCue starts a standard Chromium child with a separate user-data directory, then attaches Playwright over a local CDP endpoint using `noDefaults: true`. This preserves the actual tab focus/visibility instead of Playwright's default focus emulation, so **Read page** follows the selected tab. The ordinary Chromium flag `--disable-backgrounding-occluded-windows` allows the companion to cover that selected tab without making every background tab appear visible. A minimized browser must be restored before reading. Browser close waits for its owned process to exit within a bounded lifetime; a stale DevTools endpoint marker is removed before a fresh launch. Text filling uses Playwright's [text input APIs](https://playwright.dev/docs/input#text-input); no stealth plugins or process hiding are used. Current package and runtime outcomes are tracked in the [release status](../README.md#release-status).

## Verification

`npm test` runs browser controller and URL validation tests without launching Chromium. To also run the local page integration tests after installing Chromium, set `LUCENTCUE_BROWSER_TESTS=1` and run `npm test -- tests/browser.test.ts`. These checks use a temporary profile and a local HTTP server, exercise real field filling and stale field rejection, and do not need model keys. The test browser runs headless; the application browser always opens visibly.

On a desktop session, also set `LUCENTCUE_BROWSER_HEADED_TESTS=1` for the real window-occlusion/minimize checks. On Windows, that headed browser suite passed 51 checks, including selected-tab read/fill under a covering window, actual background-tab visibility, minimized-read rejection, and close/reopen of the same profile. These fixture checks do not establish compatibility with every website or other operating systems.
