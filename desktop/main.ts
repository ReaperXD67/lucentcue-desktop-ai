import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  screen,
  shell,
  systemPreferences,
  Tray,
} from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Attachment, ChatEvent, ChatRequest, Settings } from '../shared/types';
import { createBrowserController } from './browser';
import { BrowserInstaller } from './browser-installer';
import { getModels, streamChat } from './providers';
import {
  DesktopStorage,
  sanitizeHistoryPayload,
  stringValue,
  validateConversation,
  validateMessages,
  validateProvider,
  validateSettings,
} from './storage';

app.setName('LucentCue');
if (!app.isPackaged && process.env.LUCENTCUE_USER_DATA)
  app.setPath('userData', process.env.LUCENTCUE_USER_DATA);
// Let Wayland desktops use their portal for configurable global shortcuts.
app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let capturing = false;
let settingsBusy = false;
let storage: DesktopStorage;
let trustedURL = '';
let captureProtectionSupported = process.platform === 'win32' || process.platform === 'darwin';
let captureProtectionNotice =
  process.platform === 'win32'
    ? 'Windows capture exclusion is best effort. It does not guarantee that other software cannot capture this window.'
    : process.platform === 'darwin'
      ? 'macOS capture protection is best effort. Modern apps using ScreenCaptureKit can ignore it.'
      : 'Window capture exclusion is not supported on Linux.';
const active = new Map<string, AbortController>();
const browser = createBrowserController(join(app.getPath('userData'), 'assistant-browser'));
const browserInstaller = new BrowserInstaller({
  executable: process.execPath,
  resolvePackage: () => require.resolve('playwright/package.json'),
  verifyInstalled: async () => {
    const { chromium } = await import('playwright');
    try {
      await access(chromium.executablePath());
      return true;
    } catch {
      return false;
    }
  },
});

function show(): void {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function toggle(): void {
  if (window?.isVisible() && !window.isMinimized()) window.hide();
  else show();
}
function emit(event: ChatEvent): void {
  if (window && !window.isDestroyed()) window.webContents.send('chat:event', event);
}
function trusted(event: IpcMainInvokeEvent): void {
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame.url.split('#')[0] !== trustedURL
  )
    throw new Error('Untrusted application frame.');
}
function handle(channel: string, action: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    trusted(event);
    return action(...args);
  });
}

function installShortcuts(next: Settings, previous?: Settings): void {
  const handlers = new Map<string, () => void>([
    [next.shortcut, toggle],
    [
      next.captureShortcut,
      () => {
        void captureScreen()
          .then((attachment) => {
            show();
            window?.webContents.send('app:captured', attachment);
          })
          .catch((error) => {
            if (String(error?.message) === 'Screenshot cancelled.') return;
            show();
            void dialog.showMessageBox(window!, {
              type: 'error',
              title: 'Screenshot unavailable',
              message: String(error?.message || 'Could not capture the display.'),
            });
          });
      },
    ],
  ]);
  const old = previous ? [previous.shortcut, previous.captureShortcut] : [];
  const added: string[] = [];
  try {
    // Keep old bindings registered until all genuinely new bindings succeed.
    for (const [accelerator, callback] of handlers)
      if (!old.includes(accelerator)) {
        if (!globalShortcut.register(accelerator, callback))
          throw new Error(
            `The shortcut ${accelerator} is already in use or unavailable. Choose another shortcut.`,
          );
        added.push(accelerator);
      }
  } catch (error) {
    for (const accelerator of added) globalShortcut.unregister(accelerator);
    throw error;
  }
  // Rebind reused accelerators too, allowing toggle/capture to swap safely.
  for (const accelerator of old) globalShortcut.unregister(accelerator);
  for (const [accelerator, callback] of handlers)
    if (old.includes(accelerator)) {
      if (!globalShortcut.register(accelerator, callback)) {
        for (const registered of handlers.keys()) globalShortcut.unregister(registered);
        if (previous) installShortcuts(previous);
        throw new Error(
          `The shortcut ${accelerator} could not be registered. Previous shortcuts were restored.`,
        );
      }
    }
}

async function captureScreen(): Promise<Attachment> {
  if (capturing) throw new Error('A screenshot is already in progress.');
  if (!window || window.isDestroyed()) throw new Error('The application window is unavailable.');
  capturing = true;
  const target = window;
  const wasVisible = target.isVisible();
  const wasMinimized = target.isMinimized();
  try {
    if (
      process.platform === 'darwin' &&
      systemPreferences.getMediaAccessStatus('screen') === 'denied'
    )
      throw new Error(
        'Allow LucentCue in System Settings → Privacy & Security → Screen Recording, then restart the app.',
      );
    const displays = screen.getAllDisplays();
    let selected = displays[0];
    if (displays.length > 1) {
      const choice = await dialog.showMessageBox(target, {
        type: 'question',
        title: 'Choose a display',
        message: 'Which display should be attached?',
        detail: 'You can review or remove the screenshot before sending it to your model.',
        buttons: [
          ...displays.map(
            (display, index) =>
              `${display.label || `Display ${index + 1}`} (${display.size.width} × ${display.size.height})`,
          ),
          'Cancel',
        ],
        cancelId: displays.length,
        defaultId: 0,
        noLink: true,
      });
      if (choice.response >= displays.length) throw new Error('Screenshot cancelled.');
      selected = displays[choice.response];
    }
    target.hide();
    await new Promise((resolve) => setTimeout(resolve, 220));
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1200 },
      fetchWindowIcons: false,
    });
    const source =
      sources.find((item) => item.display_id === String(selected.id)) ||
      (sources.length === 1 ? sources[0] : undefined);
    if (!source || source.thumbnail.isEmpty())
      throw new Error(
        'Screen capture was unavailable or cancelled. Check your OS screen recording permissions.',
      );
    const dataUrl = source.thumbnail.toDataURL();
    if (dataUrl.length > 8_000_000)
      throw new Error('This screenshot is too large. Try a lower display resolution.');
    return { id: randomUUID(), name: `Screenshot ${new Date().toLocaleTimeString()}.png`, dataUrl };
  } finally {
    capturing = false;
    if (!target.isDestroyed() && wasVisible && !quitting) {
      target.show();
      if (wasMinimized) target.minimize();
      else target.focus();
    }
  }
}

function registerIPC(): void {
  handle('app:state', () => ({
    settings: storage.settings,
    keys: storage.keyStatus(),
    conversations: storage.conversations,
    storageNotice: storage.notice,
    captureProtectionSupported,
    captureProtectionNotice,
  }));
  handle('app:settings', async (input: unknown) => {
    if (settingsBusy) throw new Error('Settings are already being saved. Please try again.');
    const next = validateSettings(input);
    const previous = storage.settings;
    settingsBusy = true;
    try {
      installShortcuts(next, previous);
      try {
        if (captureProtectionSupported && window && !window.isDestroyed())
          window.setContentProtection(next.captureProtection);
        await storage.saveSettings(next);
      } catch (error) {
        if (captureProtectionSupported && window && !window.isDestroyed()) {
          try {
            window.setContentProtection(previous.captureProtection);
          } catch {
            /* Retain original error. */
          }
        }
        installShortcuts(previous, next);
        throw error;
      }
      window?.setAlwaysOnTop(next.alwaysOnTop);
      return next;
    } finally {
      settingsBusy = false;
    }
  });
  handle('app:key', (provider: unknown, value: unknown) => {
    const key = stringValue(value, 'API key', 4096, true).trim();
    if (/[\r\n\s]/.test(key)) throw new Error('The API key must not contain whitespace.');
    return storage.setKey(validateProvider(provider), key);
  });
  handle('app:models', (mode: unknown, provider: unknown) => {
    if (mode !== 'free' && mode !== 'byok') throw new Error('Choose a valid access mode.');
    const selected = validateProvider(provider);
    return getModels(mode, selected, storage.key(mode === 'free' ? 'openrouter' : selected));
  });
  handle('chat:start', (value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid chat request.');
    const input = value as Record<string, unknown>;
    const id = stringValue(input.id, 'Request ID');
    if (active.size)
      throw new Error('Wait for the current answer or stop it before sending another message.');
    const request: ChatRequest = {
      id,
      messages: validateMessages(input.messages),
      ...(input.browserContext === undefined
        ? {}
        : { browserContext: stringValue(input.browserContext, 'Browser context', 50_000, true) }),
    };
    if (request.messages.at(-1)?.role !== 'user')
      throw new Error('The last message must be from you.');
    const settings = { ...storage.settings };
    const key = storage.key(settings.mode === 'free' ? 'openrouter' : settings.provider);
    const controller = new AbortController();
    active.set(id, controller);
    void streamChat(settings, key, request, controller.signal, (text) => {
      if (!controller.signal.aborted) emit({ id, type: 'delta', text });
    })
      .then(() => emit({ id, type: 'done' }))
      .catch((error) =>
        emit(
          controller.signal.aborted
            ? { id, type: 'done' }
            : {
                id,
                type: 'error',
                error: error instanceof Error ? error.message : 'The provider request failed.',
              },
        ),
      )
      .finally(() => {
        if (active.get(id) === controller) active.delete(id);
      });
  });
  handle('chat:cancel', (value: unknown) => {
    const id = stringValue(value, 'Request ID');
    const controller = active.get(id);
    if (controller) {
      controller.abort();
      if (active.get(id) === controller) active.delete(id);
    }
  });
  handle('app:capture', captureScreen);
  handle('app:history', (value: unknown) =>
    storage.saveConversations(sanitizeHistoryPayload(value)),
  );
  handle('app:export', async (value: unknown) => {
    const conversation = validateConversation(value);
    const result = await dialog.showSaveDialog(window!, {
      title: 'Export conversation',
      defaultPath: `${conversation.title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 70) || 'Conversation'}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return false;
    const text = `# ${conversation.title.replace(/[\r\n]/g, ' ')}\n\n${conversation.messages.map((message) => `## ${message.role === 'user' ? 'You' : 'LucentCue'}\n\n${message.content}${message.attachments?.length ? '\n\n[Screenshot omitted from export.]' : ''}`).join('\n\n')}\n`;
    await writeFile(result.filePath, text, { mode: 0o600 });
    return true;
  });
  handle('app:hide', () => window?.hide());
  handle('app:minimize', () => window?.minimize());
  handle('app:external', async (value: unknown) => {
    const url = new URL(stringValue(value, 'Link', 4096));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Only HTTP and HTTPS links can be opened.');
    await shell.openExternal(url.href);
  });
  handle('browser:open', (url: unknown) => browser.open(stringValue(url, 'Browser URL', 2048)));
  handle('browser:install', () => browserInstaller.install());
  handle('browser:read', () => browser.read());
  handle('browser:fill', (fieldId: unknown, text: unknown) =>
    browser.fill(
      stringValue(fieldId, 'Browser field ID'),
      stringValue(text, 'Field text', 20_000, true),
    ),
  );
  handle('browser:close', () => browser.close());
}

function makeTray(): void {
  const pixels = Buffer.alloc(24 * 24 * 4);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const offset = (y * 24 + x) * 4;
      const mark =
        (x >= 6 && x <= 9 && y >= 5 && y <= 18) || (y >= 15 && y <= 18 && x >= 6 && x <= 18);
      pixels[offset] = mark ? 255 : 52;
      pixels[offset + 1] = mark ? 255 : 148;
      pixels[offset + 2] = mark ? 255 : 26;
      pixels[offset + 3] = 255;
    }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 24, height: 24 }));
  tray.setToolTip('LucentCue — desktop AI assistant');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open LucentCue', click: show },
      {
        label: 'Take screenshot',
        click: () => {
          void captureScreen()
            .then((attachment) => {
              show();
              window?.webContents.send('app:captured', attachment);
            })
            .catch(() => show());
        },
      },
      { type: 'separator' },
      { label: 'Quit LucentCue', click: () => app.quit() },
    ]),
  );
  tray.on('click', toggle);
}

async function start(): Promise<void> {
  storage = new DesktopStorage(join(app.getPath('userData'), 'local'), safeStorage);
  await storage.init();
  const iconPath = join(app.getAppPath(), 'assets', 'icon.png');
  window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 880,
    minHeight: 620,
    show: false,
    title: 'LucentCue',
    frame: false,
    resizable: true,
    backgroundColor: '#f8f9f6',
    autoHideMenuBar: true,
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    alwaysOnTop: storage.settings.alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  if (captureProtectionSupported) {
    try {
      window.setContentProtection(storage.settings.captureProtection);
    } catch {
      captureProtectionSupported = false;
      captureProtectionNotice =
        'Window capture exclusion is unavailable on this system. Capture protection cannot be guaranteed.';
    }
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  const renderer = process.env.ELECTRON_RENDERER_URL;
  if (renderer && !app.isPackaged) {
    const url = new URL(renderer);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new Error('The development renderer must use localhost.');
    trustedURL = url.href.split('#')[0];
  } else trustedURL = pathToFileURL(join(__dirname, '../dist/index.html')).href;
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== trustedURL) event.preventDefault();
  });
  window.webContents.on('render-process-gone', () => {
    for (const controller of active.values()) controller.abort();
  });
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      window?.hide();
    }
  });
  registerIPC();
  makeTray();
  try {
    installShortcuts(storage.settings);
  } catch (error) {
    storage.notice = `${storage.notice ? `${storage.notice} ` : ''}${(error as Error).message} Open the app from its tray icon and change shortcuts in Settings.`;
  }
  await window.loadURL(trustedURL);
  show();
}

app.on('second-instance', show);
app.on('activate', show);
app.on('window-all-closed', () => {
  /* Tray and explicit Quit keep lifecycle predictable on all platforms. */
});
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  for (const controller of active.values()) controller.abort();
  globalShortcut.unregisterAll();
  tray?.destroy();
  void Promise.race([
    Promise.allSettled([browser.close(), browserInstaller.stop(), storage?.flush()]),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]).finally(() => app.quit());
});
app.on('will-quit', () => globalShortcut.unregisterAll());
if (hasLock)
  void app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox(
        'LucentCue could not start',
        error instanceof Error ? error.message : 'Unknown startup error.',
      );
      app.quit();
    });
