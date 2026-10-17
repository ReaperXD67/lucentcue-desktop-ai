# Browser assistance

LucentCue opens a **visible Chromium window with its own profile**. It does not connect to your everyday Chrome, Edge, or Firefox profile. Website sessions in this separate profile can persist between launches. The desktop application supplies the profile directory beneath its application data directory.

## Setup

From the project directory, install the application dependencies and Chromium:

```sh
npm install
npm run browser:install
```

On Linux, Playwright may also require system libraries. Use the [official browser installation instructions](https://playwright.dev/docs/browsers#install-system-dependencies) for your distribution. A missing browser or locked profile produces a setup error with the install command.

## Workflow

1. Enter an HTTP or HTTPS website address in the browser panel and choose **Open**. An address without a protocol defaults to HTTPS. Local development sites can use an explicit address such as `http://localhost:3000`.
2. Select the website tab you want in the Chromium window, then choose **Read page** in LucentCue. Review the page context before including it in a conversation.
3. Select an available text field, write or paste the exact text, and choose **Fill selected field**. Review the result in Chromium and perform any submission yourself.

Each read returns the title, URL, up to 12,000 characters of rendered page text, and up to 50 editable text fields from the top document. Existing field values are always returned as empty strings. Passwords, hidden inputs, credential fields, payment fields, login forms, and embedded frames are excluded. Supported fields are ordinary text, search, email, URL, telephone, textarea, and contenteditable surfaces.

A field reference expires after a fill, another read, tab navigation, or a browser close. A changed tab, replaced field, or field that becomes hidden or sensitive requires another read. If multiple browser windows are open, the focused visible tab takes priority; otherwise LucentCue uses the previously read visible tab or the most recently opened visible tab. Keep the intended window and tab selected for predictable results.

## Boundaries

Browser operations come from explicit user actions in the application. The model cannot call a browser tool, click links, submit forms, press Enter, sign in, or run scripts supplied by page text. Pages and their instructions are untrusted reference material. LucentCue does not read browser cookies, local storage, saved credentials, or other browser profiles. Closing the browser ends control but does not erase its profile.

Field filling fires the website's normal input events. A website can react to those events, including saving drafts or issuing requests, so review the destination and text before filling. Page text may itself contain private information; review the context before sending it to your selected model provider. Rendering and form markup vary across websites, so some custom editors are intentionally unavailable.

The implementation uses Playwright's [persistent browser context](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context) and [text input APIs](https://playwright.dev/docs/input#text-input). It uses standard browser automation without stealth plugins or process hiding.

## Verification

`npm test` runs browser controller and URL validation tests without launching Chromium. To also run the local page integration tests after installing Chromium, set `LUCENTCUE_BROWSER_TESTS=1` and run `npm test -- tests/browser.test.ts`. These checks use a temporary profile and a local HTTP server, exercise real field filling and stale field rejection, and do not need model keys. The test browser runs headless; the application browser always opens visibly.
