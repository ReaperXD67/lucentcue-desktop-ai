/** Real Electron smoke test. Build first: npm run build && npm run test:desktop. */
import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import electronExecutable from 'electron';
import { _electron, type ElectronApplication, type Page } from 'playwright';
import { createServer } from 'node:http';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageVersion = (
  JSON.parse(await readFile(join(project, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;
const main = join(project, 'dist-desktop', 'main.cjs');
const results = join(project, 'test-results');
await Promise.all([access(main), access(join(project, 'dist', 'index.html'))]).catch(() => {
  throw new Error('Build LucentCue before its desktop smoke test: npm run build');
});
await mkdir(results, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'lucentcue-desktop-smoke-'));
const environment: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_RENDERER_URL;
environment.LUCENTCUE_USER_DATA = profile;
let application: ElectronApplication | undefined;
let applicationProcess: ChildProcess | undefined;
let renderer: Page | undefined;
let sensitiveCaptureActive = false;
const pageErrors: string[] = [];
const checks: string[] = [];
function checked(description: string) {
  checks.push(description);
  console.log(`PASS ${description}`);
}

try {
  application = await _electron.launch({
    executablePath: electronExecutable as unknown as string,
    args: [project],
    cwd: project,
    env: environment,
    chromiumSandbox: true,
    timeout: 40_000,
  });
  applicationProcess = application.process();
  renderer = await application.firstWindow({ timeout: 30_000 });
  renderer.setDefaultTimeout(15_000);
  renderer.on('pageerror', (error) => pageErrors.push(error.message));
  // firstWindow can resolve while BrowserWindow is still at its initial blank URL.
  await renderer.waitForURL('**/dist/index.html', { waitUntil: 'domcontentloaded' });
  await renderer.getByRole('textbox', { name: 'Message LucentCue' }).waitFor();

  const boundary = await application.evaluate(({ app, BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    return {
      userData: app.getPath('userData'),
      visible: mainWindow.isVisible(),
      sandbox: app
        .getAppMetrics()
        .find((metric) => metric.pid === mainWindow.webContents.getOSProcessId())?.sandboxed,
    };
  });
  assert.equal(
    resolve(boundary.userData),
    resolve(profile),
    'Smoke tests must use only their temporary user profile.',
  );
  // Electron reports the OS sandbox flag in process metrics on macOS and Windows.
  if (process.platform !== 'linux') assert.equal(boundary.sandbox, true);

  // Provider responses are mocked. The preload, IPC, validation, settings storage,
  // UI actions, streaming parser, and shortcuts run in the actual application.
  // Reload discards any catalog request that started before this override.
  await application.evaluate(`(() => {
    globalThis.__lucentcueSmokeRequests = { catalogs: 0, completions: 0, holding: 0, aborted: 0 };
    globalThis.__lucentcueSmokeMode = 'stream';
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url || String(input);
      if (url === 'https://openrouter.ai/api/v1/models' && (!init || !init.method || init.method === 'GET')) {
        globalThis.__lucentcueSmokeRequests.catalogs++;
        return new Response(JSON.stringify({ data: [{
          id: 'openrouter/free', name: 'Free models router', context_length: 128000,
          pricing: { prompt: '0', completion: '0', image: '0', request: '0' },
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }
        }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/chat/completions')) {
        globalThis.__lucentcueSmokeRequests.completions++;
        const mode = globalThis.__lucentcueSmokeMode;
        const encoder = new TextEncoder();
        const signal = init && init.signal;
        let timer;
        let stopped = false;
        let onAbort;
        return new Response(new ReadableStream({
          start(controller) {
            onAbort = () => {
              if (stopped) return;
              stopped = true;
              clearTimeout(timer);
              globalThis.__lucentcueSmokeRequests.aborted++;
              controller.error(new DOMException('Mock completion cancelled', 'AbortError'));
            };
            signal && signal.addEventListener('abort', onAbort, { once: true });
            if (signal && signal.aborted) { onAbort(); return; }
            if (mode === 'hold') { globalThis.__lucentcueSmokeRequests.holding++; return; }
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Start with one clear task. "}}]}\\n\\n'));
            timer = setTimeout(() => {
              if (stopped) return;
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Keep the next action small."},"finish_reason":"stop"}]}\\n\\ndata: [DONE]\\n\\n'));
              stopped = true;
              signal && signal.removeEventListener('abort', onAbort);
              controller.close();
            }, 180);
          },
          cancel() {
            stopped = true;
            clearTimeout(timer);
            signal && signal.removeEventListener('abort', onAbort);
          }
        }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      throw new Error('Desktop smoke test blocks external provider requests.');
    };
  })()`);
  await renderer.reload();
  await renderer.getByRole('textbox', { name: 'Message LucentCue' }).waitFor();
  await renderer.getByTitle('Free models router', { exact: true }).waitFor();
  const bridge = await renderer.evaluate(() => ({
    desktop: typeof window.desktop,
    require: typeof (globalThis as unknown as { require?: unknown }).require,
    process: typeof (globalThis as unknown as { process?: unknown }).process,
  }));
  assert.deepEqual(bridge, { desktop: 'object', require: 'undefined', process: 'undefined' });
  assert.equal(await renderer.getByText('Interface preview', { exact: true }).count(), 0);
  checked('Real sandboxed preload bridge with no renderer Node.js access');

  const readState = () => renderer!.evaluate(() => window.desktop!.getState());
  async function waitForMainCounter(name: 'holding' | 'aborted', minimum: number) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const counters = (await application!.evaluate(
        'globalThis.__lucentcueSmokeRequests',
      )) as Record<string, number>;
      if (counters[name] >= minimum) return;
      await delay(25);
    }
    throw new Error(`The mocked completion did not reach ${name}=${minimum}.`);
  }
  const first = await readState();
  assert.equal(first.settings.mode, 'free');
  assert.equal(first.settings.saveHistory, false);
  assert.deepEqual(first.keys, { openrouter: false, openai: false, gemini: false });
  assert.deepEqual(first.conversations, []);
  checked('First run has no API keys, no saved conversations, and history off');

  assert.equal(first.windowMode, 'companion');
  assert.equal(first.settings.shortcut, 'Alt+W');
  assert.equal(first.settings.theme, 'dark');
  assert.equal(first.settings.companionOpacity, 1);
  assert.equal(first.version, packageVersion);
  await renderer.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const companionDraft = 'Keep this draft when opening settings.';
  await renderer.getByRole('textbox', { name: 'Message LucentCue' }).fill(companionDraft);
  await renderer.screenshot({
    path: join(results, 'companion.png'),
    animations: 'disabled',
    scale: 'css',
  });
  await renderer.getByRole('button', { name: 'Open workspace settings', exact: true }).click();
  await renderer.getByRole('heading', { name: 'Make it yours' }).waitFor();
  assert.equal((await readState()).windowMode, 'workspace');
  await renderer.getByRole('button', { name: 'Close settings' }).click();
  await renderer.getByRole('button', { name: 'Companion mode', exact: true }).click();
  await renderer.getByRole('button', { name: 'Open workspace settings', exact: true }).waitFor();
  assert.equal(
    await renderer.getByRole('textbox', { name: 'Message LucentCue' }).inputValue(),
    companionDraft,
  );
  assert.equal((await readState()).windowMode, 'companion');
  await resize(360, 280);
  assert.equal(
    await renderer.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await renderer.getByRole('button', { name: 'Open full workspace', exact: true }).click();
  await renderer.getByRole('button', { name: 'Companion mode', exact: true }).waitFor();
  checked(
    'Companion opens settings in the full workspace, preserves its draft, and fits a 360px window',
  );
  const invalidMode = await renderer.evaluate(async () => {
    try {
      await window.desktop!.setWindowMode('hidden' as never);
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(invalidMode, true);
  assert.equal((await readState()).windowMode, 'workspace');
  checked('Invalid window modes are rejected without changing the active workspace');

  await renderer.getByRole('button', { name: 'Settings', exact: true }).click();
  const theme = renderer.getByRole('combobox', { name: 'Theme', exact: true });
  await theme.selectOption('light');
  await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
  await renderer.getByText('Settings saved.', { exact: true }).waitFor();
  await renderer.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.equal(await application.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'light');

  await theme.selectOption('system');
  await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
  await renderer.getByText('Settings saved.', { exact: true }).waitFor();
  assert.equal(await application.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'system');
  await renderer.emulateMedia({ colorScheme: 'dark' });
  await renderer.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await renderer.emulateMedia({ colorScheme: 'light' });
  await renderer.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  checked('Light and system themes apply through saved settings and follow changing system colors');

  await theme.selectOption('dark');
  const opacity = renderer.getByRole('slider', { name: 'Companion opacity', exact: true });
  if (first.appearanceOpacitySupported) {
    await opacity.focus();
    await opacity.press('Home');
    assert.equal(await opacity.inputValue(), '85');
  } else {
    assert.equal(await opacity.isDisabled(), true);
  }
  await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
  await renderer.getByText('Settings saved.', { exact: true }).waitFor();
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    ),
    1,
  );
  await renderer.getByRole('button', { name: 'Close settings' }).click();
  await renderer.getByRole('button', { name: 'Companion mode', exact: true }).click();
  await renderer.getByRole('button', { name: 'Open workspace settings', exact: true }).waitFor();
  if (first.appearanceOpacitySupported) {
    const nativeOpacity = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    assert.ok(Math.abs(nativeOpacity - 0.85) < 0.01, `Companion opacity was ${nativeOpacity}`);
  }
  await renderer.reload();
  await renderer.getByRole('button', { name: 'Open workspace settings', exact: true }).waitFor();
  const reloadedAppearance = await readState();
  assert.equal(reloadedAppearance.settings.theme, 'dark');
  assert.equal(
    reloadedAppearance.settings.companionOpacity,
    first.appearanceOpacitySupported ? 0.85 : 1,
  );
  await renderer.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await renderer.getByRole('button', { name: 'Open workspace settings', exact: true }).click();
  await theme.waitFor();
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    ),
    1,
  );
  if (first.appearanceOpacitySupported) {
    await opacity.focus();
    await opacity.press('End');
    await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
    await renderer.getByText('Settings saved.', { exact: true }).waitFor();
  }
  await renderer.getByRole('button', { name: 'Close settings' }).click();
  checked(
    'Appearance persists after reload; companion translucency leaves the workspace fully opaque',
  );

  async function resize(width: number, height: number) {
    await application!.evaluate(
      ({ BrowserWindow }, size) => {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        mainWindow.setContentSize(size.width, size.height);
        mainWindow.show();
      },
      { width, height },
    );
    await renderer!.waitForFunction(
      // Windows frame/DPI conversion can round a requested size by 1–2 CSS px.
      (size) => Math.abs(innerWidth - size.width) <= 2 && Math.abs(innerHeight - size.height) <= 2,
      { width, height },
    );
    await renderer!.evaluate(() => document.fonts.ready);
  }
  await resize(1280, 900);
  await renderer.screenshot({
    path: join(results, 'workspace.png'),
    animations: 'disabled',
    scale: 'css',
  });
  checked('Workspace screenshot captured at 1280 × 900');

  await renderer.getByRole('button', { name: /^Settings/ }).click();
  await renderer.getByRole('heading', { name: 'Make it yours' }).waitFor();
  assert.equal(await renderer.getByLabel('API key', { exact: true }).inputValue(), '');
  assert.equal(
    await renderer.getByRole('checkbox', { name: 'Save history on this device' }).isChecked(),
    false,
  );

  const available = await application.evaluate(({ globalShortcut }) => {
    const available: string[] = [];
    for (const candidate of [
      'Control+Alt+Shift+F11',
      'Control+Alt+Shift+F10',
      'Control+Alt+Shift+F9',
      'Control+Alt+Shift+F8',
    ]) {
      if (globalShortcut.register(candidate, () => {})) {
        available.push(candidate);
        globalShortcut.unregister(candidate);
      }
    }
    return available;
  });
  assert.ok(available.length >= 2, 'Two available test shortcuts are required.');
  await renderer.getByLabel('Show / hide shortcut', { exact: true }).fill(available[0]);
  await renderer.getByLabel('Screenshot shortcut', { exact: true }).fill(available[1]);
  await renderer.getByRole('checkbox', { name: 'Keep window on top' }).check();
  await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
  await renderer.getByText('Settings saved.', { exact: true }).waitFor();
  const saved = await readState();
  assert.equal(saved.settings.alwaysOnTop, true);
  assert.equal(saved.settings.saveHistory, false);
  assert.ok(saved.settings.shortcut.endsWith(available[0].split('+').at(-1)!));
  const registered = await application.evaluate(
    ({ globalShortcut, BrowserWindow }, settings) => ({
      toggle: globalShortcut.isRegistered(settings.shortcut),
      capture: globalShortcut.isRegistered(settings.captureShortcut),
      onTop: BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
    }),
    saved.settings,
  );
  // Windows applies native window stacking asynchronously after IPC resolves.
  for (let attempt = 0; !registered.onTop && attempt < 40; attempt++) {
    await delay(25);
    registered.onTop = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
    );
  }
  assert.deepEqual(registered, { toggle: true, capture: true, onTop: true });
  checked(
    'Settings save through real IPC, persist state, register shortcuts, and update the native window',
  );

  await renderer.getByRole('checkbox', { name: 'Show tray icon', exact: true }).uncheck();
  await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
  await renderer.getByText('Settings saved.', { exact: true }).waitFor();
  assert.equal((await readState()).settings.showTrayIcon, false);
  await renderer.getByRole('button', { name: 'Quit LucentCue', exact: true }).waitFor();
  await renderer.getByRole('checkbox', { name: 'Show tray icon', exact: true }).check();
  await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
  await renderer.getByText('Settings saved.', { exact: true }).waitFor();
  assert.equal((await readState()).settings.showTrayIcon, true);
  checked(
    'Tray visibility can be changed with an explicit Quit action and registered recovery shortcut',
  );

  await application.evaluate(({ globalShortcut }, settings) => {
    globalShortcut.unregister(settings.shortcut);
    globalShortcut.unregister(settings.captureShortcut);
  }, saved.settings);
  await renderer.evaluate((settings) => window.desktop!.saveSettings(settings), saved.settings);
  assert.deepEqual(
    await application.evaluate(
      ({ globalShortcut }, settings) => [
        globalShortcut.isRegistered(settings.shortcut),
        globalShortcut.isRegistered(settings.captureShortcut),
      ],
      saved.settings,
    ),
    [true, true],
  );
  checked('Saving unchanged shortcuts recovers bindings after a registration conflict clears');

  if (process.platform === 'win32') {
    assert.equal((await readState()).captureProtectionSupported, true);
    const capturePrivacy = renderer.getByRole('checkbox', {
      name: 'Exclude window from screen capture',
      exact: true,
    });
    await capturePrivacy.check();
    await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
    await renderer.getByText('Settings saved.', { exact: true }).waitFor();
    assert.equal((await readState()).settings.captureProtection, true);
    assert.equal(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isContentProtected(),
      ),
      true,
    );
    await renderer.getByRole('button', { name: 'Close settings' }).click();
    await renderer.getByRole('button', { name: 'Companion mode', exact: true }).click();
    await renderer.getByRole('button', { name: 'Open workspace settings', exact: true }).waitFor();
    assert.equal(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isContentProtected(),
      ),
      true,
    );
    await renderer.getByRole('button', { name: 'Open workspace settings', exact: true }).click();
    await renderer.getByRole('heading', { name: 'Make it yours' }).waitFor();
    assert.equal(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isContentProtected(),
      ),
      true,
    );
    await capturePrivacy.uncheck();
    await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
    await renderer.getByText('Settings saved.', { exact: true }).waitFor();
    assert.equal((await readState()).settings.captureProtection, false);
    assert.equal(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isContentProtected(),
      ),
      false,
    );
    checked(
      'Windows content protection survives both window modes and disables before screenshot tests',
    );
  }

  await renderer
    .getByLabel('Show / hide shortcut', { exact: true })
    .fill('Alt+DefinitelyNotARealKey');
  await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
  await renderer.getByRole('alert').filter({ hasText: 'Use a shortcut such as' }).waitFor();
  assert.deepEqual((await readState()).settings, saved.settings);
  checked('Invalid shortcut is rejected by the main process and saved settings remain intact');

  const collision = await application.evaluate(({ globalShortcut }) => {
    for (const candidate of [
      'Control+Alt+Shift+F12',
      'Control+Alt+Shift+F7',
      'Control+Alt+Shift+F6',
    ]) {
      if (globalShortcut.register(candidate, () => {})) return candidate;
    }
    return '';
  });
  assert.ok(collision, 'An available shortcut is required to simulate a registration collision.');
  try {
    await renderer.getByLabel('Show / hide shortcut', { exact: true }).fill(collision);
    await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
    await renderer
      .getByRole('alert')
      .filter({ hasText: /already in use|unavailable/ })
      .waitFor();
    assert.deepEqual((await readState()).settings, saved.settings);
    const preserved = await application.evaluate(
      ({ globalShortcut }, settings) => [
        globalShortcut.isRegistered(settings.shortcut),
        globalShortcut.isRegistered(settings.captureShortcut),
      ],
      saved.settings,
    );
    assert.deepEqual(preserved, [true, true]);
  } finally {
    await application.evaluate(
      ({ globalShortcut }, shortcut) => globalShortcut.unregister(shortcut),
      collision,
    );
  }
  checked('Shortcut registration failure preserves both prior bindings and saved settings');
  await renderer.getByRole('button', { name: 'Close settings' }).click();

  await renderer.getByRole('button', { name: 'Bring your key', exact: true }).click();
  await renderer.getByRole('combobox', { name: 'AI provider', exact: true }).waitFor();
  assert.equal((await readState()).settings.mode, 'byok');
  await renderer.getByRole('button', { name: 'Free', exact: true }).click();
  await renderer.waitForFunction(
    async () => (await window.desktop!.getState()).settings.mode === 'free',
  );
  await renderer
    .getByRole('combobox', { name: 'AI provider', exact: true })
    .waitFor({ state: 'detached' });
  assert.equal(
    await renderer.getByRole('combobox', { name: 'AI provider', exact: true }).count(),
    0,
  );
  checked('Free and bring-your-own-key modes switch through real saved settings');

  const composer = renderer.getByRole('textbox', { name: 'Message LucentCue' });
  await composer.fill('Draft that should clear when a new conversation starts.');
  await renderer.getByRole('button', { name: /^New conversation/ }).click();
  assert.equal(await composer.inputValue(), '');
  await composer.fill('Explain a useful way to organize this desktop task.');
  await composer.press('Shift+Enter');
  assert.equal(
    await composer.inputValue(),
    'Explain a useful way to organize this desktop task.\n',
  );
  await composer.press('Backspace');
  await composer.press('Enter');
  await renderer.getByRole('heading', { name: 'Make it yours' }).waitFor();
  await renderer
    .getByRole('status')
    .filter({ hasText: 'Add your OpenRouter API key in Settings to start.' })
    .waitFor();
  assert.equal(await composer.inputValue(), 'Explain a useful way to organize this desktop task.');
  assert.equal(await renderer.getByRole('button', { name: 'Stop generating' }).count(), 0);
  const requests = (await application.evaluate(`globalThis.__lucentcueSmokeRequests`)) as {
    catalogs: number;
    completions: number;
  };
  assert.ok(requests.catalogs >= 1);
  assert.equal(requests.completions, 0);
  checked(
    'New conversation clears the draft; sending without a key opens Settings without a completion request',
  );

  // A plainly fake key remains inside this temporary profile. Every completion
  // below is a local Response stream created by the main-process fetch override.
  await renderer
    .getByLabel('API key', { exact: true })
    .fill('lucentcue-desktop-smoke-placeholder-not-a-real-key');
  await renderer.getByRole('button', { name: 'Save key', exact: true }).click();
  await renderer.getByRole('status').filter({ hasText: 'OpenRouter key saved.' }).waitFor();
  await renderer.getByRole('button', { name: 'Close settings' }).click();
  await renderer.getByRole('button', { name: /^New conversation/ }).click();
  await composer.fill('Give me a useful desktop plan.');
  await renderer.getByRole('button', { name: 'Send message', exact: true }).click();
  await renderer
    .getByText('Start with one clear task. Keep the next action small.', { exact: true })
    .waitFor();
  await renderer.getByRole('button', { name: 'Stop generating' }).waitFor({ state: 'detached' });
  assert.equal(await renderer.locator('.message.assistant').count(), 1);
  checked('Mocked provider SSE streams through the main process and renders its completed answer');

  // Spy only on this temporary process's final native writer. Do not read or
  // replace the user's clipboard (which may contain non-text formats).
  await application.evaluate(({ clipboard }) => {
    const fixture = globalThis as unknown as {
      __originalClipboardWrite: typeof clipboard.writeText;
      __copiedText?: string;
    };
    fixture.__originalClipboardWrite = clipboard.writeText;
    clipboard.writeText = async (text: string) => {
      fixture.__copiedText = text;
    };
  });
  try {
    await renderer.getByRole('button', { name: 'Copy answer', exact: true }).click();
    await renderer.getByRole('button', { name: 'Copied', exact: true }).waitFor();
    assert.equal(
      await application.evaluate('globalThis.__copiedText'),
      'Start with one clear task. Keep the next action small.',
    );
    await renderer.evaluate(async () => {
      let rejected = false;
      try {
        await window.desktop!.copyText('x'.repeat(100_001));
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('Oversized clipboard payload was accepted.');
    });
    assert.equal(
      await application.evaluate('globalThis.__copiedText'),
      'Start with one clear task. Keep the next action small.',
    );
    checked('Copy answer reaches the bounded main-process clipboard writer through trusted IPC');
  } finally {
    await application.evaluate(({ clipboard }) => {
      const fixture = globalThis as unknown as {
        __originalClipboardWrite: typeof clipboard.writeText;
      };
      clipboard.writeText = fixture.__originalClipboardWrite;
    });
  }

  await application.evaluate(`globalThis.__lucentcueSmokeMode = 'hold'`);
  await renderer.getByRole('button', { name: /^New conversation/ }).click();
  await composer.fill('Hold this request until I stop.');
  await renderer.getByRole('button', { name: 'Send message', exact: true }).click();
  await waitForMainCounter('holding', 1);
  await renderer.getByRole('button', { name: 'Stop generating' }).click();
  await renderer.getByRole('button', { name: 'Stop generating' }).waitFor({ state: 'detached' });
  await waitForMainCounter('aborted', 1);
  assert.equal(await renderer.locator('.message.assistant').count(), 0);
  assert.equal(await renderer.getByText('Waiting for the model…', { exact: true }).count(), 0);
  checked(
    'Stopping before the first token aborts the provider stream and removes the waiting placeholder',
  );

  await renderer.getByRole('button', { name: /^Settings/ }).click();
  await renderer.getByRole('checkbox', { name: 'Save history on this device' }).check();
  await renderer.getByRole('button', { name: 'Save settings', exact: true }).click();
  await renderer.getByText('Settings saved.', { exact: true }).waitFor();
  await renderer.getByRole('button', { name: 'Close settings' }).click();
  await application.evaluate(`globalThis.__lucentcueSmokeMode = 'stream'`);
  await renderer.getByRole('button', { name: /^New conversation/ }).click();
  await composer.fill('Persist this throwaway test conversation.');
  await renderer.getByRole('button', { name: 'Send message', exact: true }).click();
  await renderer
    .getByText('Start with one clear task. Keep the next action small.', { exact: true })
    .waitFor();
  await renderer.getByRole('button', { name: 'Stop generating' }).waitFor({ state: 'detached' });
  let historyPersisted = false;
  for (let attempt = 0; !historyPersisted && attempt < 80; attempt++) {
    try {
      historyPersisted =
        JSON.parse(await readFile(join(profile, 'local', 'history.json'), 'utf8')).length > 0;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!historyPersisted) await delay(25);
  }
  assert.ok(
    historyPersisted,
    'The throwaway conversation must reach disk before deletion is tested.',
  );

  await application.evaluate(`globalThis.__lucentcueSmokeMode = 'hold'`);
  await renderer.getByRole('button', { name: /^New conversation/ }).click();
  await composer.fill('This pending conversation must be deleted.');
  await renderer.getByRole('button', { name: 'Send message', exact: true }).click();
  await waitForMainCounter('holding', 2);
  await renderer.getByRole('button', { name: /^Settings/ }).click();
  await renderer.getByRole('button', { name: 'Delete saved history', exact: true }).click();
  await renderer.getByRole('button', { name: 'Yes, delete history', exact: true }).click();
  await renderer.getByRole('button', { name: 'Delete saved history', exact: true }).waitFor();
  await waitForMainCounter('aborted', 2);
  // Verify after the application's 400ms writer debounce can fire again.
  await delay(650);
  assert.deepEqual((await readState()).conversations, []);
  assert.deepEqual(JSON.parse(await readFile(join(profile, 'local', 'history.json'), 'utf8')), []);
  assert.equal(await renderer.locator('.message').count(), 0);
  checked(
    'Deleting history during a pending answer cancels it and leaves disk history empty after debounce',
  );

  await renderer.getByRole('button', { name: 'Remove key', exact: true }).click();
  await renderer.getByRole('status').filter({ hasText: 'OpenRouter key removed.' }).waitFor();
  await renderer.getByRole('button', { name: 'Close settings' }).click();
  // Keep the temporary test shortcuts: an installed copy may own the defaults.
  // Restore all other initial settings for clean screenshots and no retained key.
  await renderer.evaluate((settings) => window.desktop!.saveSettings(settings), {
    ...first.settings,
    shortcut: saved.settings.shortcut,
    captureShortcut: saved.settings.captureShortcut,
  });
  await renderer.reload();
  await composer.waitFor();
  assert.deepEqual((await readState()).keys, first.keys);
  assert.equal((await readState()).settings.saveHistory, false);

  await renderer.getByRole('button', { name: 'Browser assist', exact: true }).click();
  const browserPanel = renderer.getByRole('complementary', { name: 'Browser assistance' });
  await browserPanel.waitFor();
  assert.equal(await browserPanel.getByRole('combobox', { name: 'Page field' }).isDisabled(), true);
  assert.equal(
    await browserPanel.getByRole('button', { name: 'Fill selected field' }).isDisabled(),
    true,
  );
  await browserPanel.getByLabel('Page address').fill('file:///private.txt');
  await browserPanel.getByRole('button', { name: 'Open browser', exact: true }).click();
  await browserPanel
    .getByRole('status')
    .filter({ hasText: /HTTP and HTTPS/ })
    .waitFor();
  checked('Browser UI gates unread fields and rejects file URLs through the real browser IPC');

  // Optional current-PC checks capture a local display in memory and launch the
  // visible assistant browser. Never save a screenshot containing that preview.
  if (process.env.LUCENTCUE_DESKTOP_FEATURES === '1') {
    const originalDialog = await application.evaluate(({ dialog }) => {
      (globalThis as any).__originalDisplayDialog = dialog.showMessageBox;
      dialog.showMessageBox = (async () => ({
        response: 0,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox;
      return true;
    });
    assert.equal(originalDialog, true);
    await browserPanel.getByRole('button', { name: 'Close browser panel' }).click();
    try {
      sensitiveCaptureActive = true;
      await renderer.getByRole('button', { name: 'Capture screenshot', exact: true }).click();
      const preview = renderer.getByRole('img', { name: 'Screenshot preview', exact: true });
      await preview.waitFor();
      assert.equal(
        await preview.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
        true,
      );
      await renderer.getByRole('button', { name: /^Remove Screenshot/ }).click();
      await preview.waitFor({ state: 'detached' });
      sensitiveCaptureActive = false;
      checked(
        'Screenshot button captures a real local display, previews it, and removes it before sending',
      );
    } finally {
      await renderer.getByRole('button', { name: /^New conversation/ }).click();
      await application.evaluate(({ dialog }) => {
        dialog.showMessageBox = (globalThis as any).__originalDisplayDialog;
      });
    }
    let filled = '';
    let submits = 0;
    const fixture = createServer(async (request, response) => {
      if (request.url === '/input') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        filled = Buffer.concat(chunks).toString('utf8');
        response.end('ok');
      } else if (request.url === '/submit') {
        submits++;
        response.end('submitted');
      } else {
        response.setHeader('Content-Type', 'text/html');
        response.end(
          '<!doctype html><title>LucentCue local browser check</title><h1>Harmless browser fixture</h1><p>Local-only reference text.</p><form action="/submit"><label>Draft note<textarea name="note" oninput="fetch(\'/input\',{method:\'POST\',body:this.value})"></textarea></label><button>Submit</button></form>',
        );
      }
    });
    await new Promise<void>((resolveListen) => fixture.listen(0, '127.0.0.1', resolveListen));
    try {
      const address = fixture.address();
      assert(address && typeof address !== 'string');
      await renderer.getByRole('button', { name: 'Browser assist', exact: true }).click();
      await browserPanel.getByLabel('Page address').fill(`http://127.0.0.1:${address.port}`);
      await browserPanel.getByRole('button', { name: 'Open browser', exact: true }).click();
      await browserPanel.getByRole('status').filter({ hasText: 'Browser opened.' }).waitFor();
      await browserPanel.getByRole('button', { name: 'Read page', exact: true }).click();
      await browserPanel.getByText('LucentCue local browser check', { exact: true }).waitFor();
      await browserPanel.getByRole('button', { name: 'Attach to question', exact: true }).click();
      await browserPanel.getByLabel('Text to fill').fill('LucentCue local-only approved draft');
      await browserPanel.getByRole('button', { name: 'Fill selected field', exact: true }).click();
      await browserPanel.getByRole('status').filter({ hasText: 'Field filled.' }).waitFor();
      for (let attempt = 0; !filled && attempt < 40; attempt++) await delay(25);
      assert.equal(filled, 'LucentCue local-only approved draft');
      assert.equal(submits, 0);
      checked(
        'Visible Chromium opens a local page, reads/attaches it, fills the approved field, and never submits',
      );
    } finally {
      try {
        await renderer.evaluate(() => window.desktop!.browserClose());
      } finally {
        await new Promise<void>((resolveClose, reject) =>
          fixture.close((error) => (error ? reject(error) : resolveClose())),
        );
      }
    }
  }
  await browserPanel.getByRole('button', { name: 'Close browser panel' }).click();
  await renderer.getByRole('button', { name: /^New conversation/ }).click();
  assert.equal((await readState()).settings.alwaysOnTop, false);

  await resize(900, 720);
  await composer.waitFor();
  const overflow = await renderer.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'The compact window must not overflow horizontally.');
  await renderer.screenshot({
    path: join(results, 'compact.png'),
    animations: 'disabled',
    scale: 'css',
  });
  checked('Compact workspace fits at 900 × 720');

  // Exercise the global-capture delivery path with a known harmless image;
  // this never captures the desktop, writes the clipboard, or submits a prompt.
  const captureDraft = 'Keep this draft and my existing screenshot attachments.';
  await composer.fill(captureDraft);
  const completionCountBeforeCapture = await application.evaluate(
    'globalThis.__lucentcueSmokeRequests.completions',
  );
  const syntheticImage =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  async function deliverCapture(id: string) {
    await application!.evaluate(
      ({ BrowserWindow }, attachment) =>
        BrowserWindow.getAllWindows()[0].webContents.send('app:captured', attachment),
      { id, name: `${id}.png`, dataUrl: syntheticImage },
    );
  }
  await deliverCapture('existing-synthetic-capture');
  await renderer.getByRole('button', { name: 'Remove existing-synthetic-capture.png' }).waitFor();
  await renderer.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.attachment img');
    return image?.complete && image.naturalWidth === 1 && image.naturalHeight === 1;
  });
  for (const [index, panel] of ['Settings', 'Browser assist'].entries()) {
    await renderer.getByRole('button', { name: panel, exact: true }).click();
    await renderer.waitForFunction(
      () => getComputedStyle(document.querySelector('.chat-workspace')!).display === 'none',
    );
    const id = `panel-synthetic-capture-${index}`;
    await deliverCapture(id);
    await renderer.getByRole('button', { name: `Remove ${id}.png`, exact: true }).waitFor();
    await renderer.waitForFunction(() => {
      const composer = document.getElementById('message-input');
      return (
        document.activeElement === composer &&
        getComputedStyle(document.querySelector('.chat-workspace')!).display !== 'none'
      );
    });
    assert.equal(await composer.inputValue(), captureDraft);
    assert.equal(
      await renderer.getByRole('img', { name: 'Screenshot preview' }).count(),
      index + 2,
    );
    assert.equal(
      await renderer.getByRole('button', { name: 'Remove existing-synthetic-capture.png' }).count(),
      1,
    );
    assert.equal(await renderer.locator('.settings-panel, .browser-panel').count(), 0);
  }
  await renderer.getByRole('button', { name: 'Settings', exact: true }).click();
  await renderer.waitForFunction(
    () => getComputedStyle(document.querySelector('.chat-workspace')!).display === 'none',
  );
  await deliverCapture('overflow-synthetic-capture');
  await renderer
    .getByRole('status')
    .filter({ hasText: 'You can attach up to three screenshots.' })
    .waitFor();
  await renderer.waitForFunction(() => {
    const composer = document.getElementById('message-input');
    return (
      document.activeElement === composer &&
      getComputedStyle(document.querySelector('.chat-workspace')!).display !== 'none'
    );
  });
  assert.equal(await composer.inputValue(), captureDraft);
  assert.equal(await renderer.getByRole('img', { name: 'Screenshot preview' }).count(), 3);
  assert.equal(
    await renderer.getByRole('button', { name: 'Remove overflow-synthetic-capture.png' }).count(),
    0,
  );
  assert.equal(await renderer.locator('.settings-panel, .browser-panel').count(), 0);
  assert.equal(
    await application.evaluate('globalThis.__lucentcueSmokeRequests.completions'),
    completionCountBeforeCapture,
  );
  await renderer.getByRole('button', { name: /^New conversation/ }).click();
  assert.equal(await renderer.getByRole('img', { name: 'Screenshot preview' }).count(), 0);
  checked(
    'Capture delivery closes either narrow workspace panel, focuses even at the attachment limit, preserves drafts and attachments, and never sends',
  );
  assert.deepEqual(pageErrors, [], 'The renderer must not emit uncaught JavaScript errors.');
  assert.equal((await readState()).settings.saveHistory, false);
  console.log(
    `Desktop smoke passed: ${checks.length} checks. App-only screenshots: ${join(results, 'workspace.png')} and ${join(results, 'compact.png')}`,
  );
} catch (error) {
  if (renderer && !renderer.isClosed() && !sensitiveCaptureActive)
    await renderer
      .screenshot({ path: join(results, 'failure.png'), animations: 'disabled', scale: 'css' })
      .catch(() => {});
  throw error;
} finally {
  if (application) {
    const closing = application.waitForEvent('close', { timeout: 15_000 }).catch(() => undefined);
    await application.evaluate(({ app }) => app.quit()).catch(() => undefined);
    await closing;
    // A failed startup must also release its test-only process and shortcuts.
    if (applicationProcess?.exitCode === null) await application.close().catch(() => undefined);
  }
  // Resolve and verify the exact mkdtemp target before recursive Windows cleanup.
  const cleanup = resolve(profile);
  const withinTemporary = relative(resolve(tmpdir()), cleanup);
  if (
    !withinTemporary.startsWith('lucentcue-desktop-smoke-') ||
    withinTemporary.includes('..') ||
    dirname(cleanup) !== resolve(tmpdir())
  ) {
    throw new Error('Refusing to remove an unexpected desktop smoke profile path.');
  }
  await rm(cleanup, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
