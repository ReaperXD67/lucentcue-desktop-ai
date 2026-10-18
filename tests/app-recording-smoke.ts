/**
 * Actual LucentCue Windows recording test, using only an isolated empty profile.
 * Build first: npm run build && npx tsx tests/app-recording-smoke.ts
 * Requires FFmpeg ddagrab on PATH (or FFMPEG_PATH), and exactly one display.
 * Also compares Windows.Graphics.Capture exact-owned-window and cropped-display
 * paths when gfxcapture is available. Paired magenta-backdrop display probes
 * distinguish background omission from black redaction. Failures are separate.
 * Every display output is cropped inside an owned opaque known-color backdrop.
 * Unexpected pixels stay in memory and are discarded; only recognized local
 * app, synthetic background, or black frames are retained under test-results.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir, release } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import electronExecutable from 'electron';
import { _electron, type ElectronApplication, type Page } from 'playwright';
import { DEFAULT_SETTINGS, type WindowMode } from '../shared/types';

assert.equal(process.platform, 'win32', 'This experiment uses Windows capture APIs.');
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await readFile(join(project, 'package.json'), 'utf8')).version as string;
const main = join(project, 'dist-desktop', 'main.cjs');
await Promise.all([access(main), access(join(project, 'dist', 'index.html'))]);
const output = join(project, 'test-results', 'app-recording');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const profile = await mkdtemp(join(tmpdir(), 'lucentcue-app-recording-'));
const backdropTitle = `LucentCue Owned Black Recording Backdrop ${randomUUID()}`;
const sourceTitle = `LucentCue Owned App Recording ${randomUUID()}`;
const environment: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_RENDERER_URL;
environment.LUCENTCUE_USER_DATA = profile;

type Region = { x: number; y: number; width: number; height: number };
type CaptureTermination =
  | 'normal exit'
  | 'stopped after complete frame'
  | 'timeout before complete frame'
  | 'failed before complete frame';
type CaptureFailure = {
  termination: CaptureTermination;
  receivedFrameBytes: number;
  ffmpegExitCode: number | null;
  ffmpegExitSignal: NodeJS.Signals | null;
};
type Stage = {
  name: string;
  mode: WindowMode;
  protected: boolean;
  action?: 'hide-show' | 'reload';
};
type Observation = Stage & {
  nativeFlag: boolean;
  nativeFlagAfter: boolean;
  crop: Region;
  frames: number;
  minBlackFraction: number;
  maxBlackFraction: number;
  minGreenFraction: number;
  minPaperFraction: number;
  minAppPaletteFraction: number;
  recording: string;
  rendererAppPaletteFraction: number;
};
type WGCObservation = {
  state: 'off' | 'on' | 'off-restored';
  nativeFlag: boolean;
  localWindowVisible: boolean;
  captured: boolean;
  observation:
    'app visible' | 'black pixels' | 'unrecognized pixels discarded' | 'capture unavailable';
  frames?: number;
  minAppPaletteFraction?: number;
  minBlackFraction?: number;
  image?: string;
  termination?: CaptureTermination;
  ffmpegExitCode?: number | null;
  ffmpegExitSignal?: NodeJS.Signals | null;
  expectedFrameBytes?: number;
  receivedFrameBytes?: number;
  error?: string;
};
type DisplayObservation = {
  api: 'dxgi' | 'wgc-monitor';
  state: 'off' | 'on' | 'off-restored';
  nativeFlag: boolean;
  outcome:
    | 'app visible'
    | 'background revealed'
    | 'black redaction'
    | 'unrecognized pixels discarded'
    | 'capture unavailable';
  appPaletteFraction?: number;
  backgroundFraction?: number;
  blackFraction?: number;
  expectedFrameBytes: number;
  receivedFrameBytes?: number;
  termination?: CaptureTermination;
  ffmpegExitCode?: number | null;
  ffmpegExitSignal?: NodeJS.Signals | null;
  image?: string;
  error?: string;
};
const stages: Stage[] = [
  { name: 'companion-off', mode: 'companion', protected: false },
  { name: 'companion-on', mode: 'companion', protected: true },
  { name: 'companion-on-after-hide-show', mode: 'companion', protected: true, action: 'hide-show' },
  { name: 'workspace-on-after-mode-change', mode: 'workspace', protected: true },
  { name: 'workspace-off', mode: 'workspace', protected: false },
  { name: 'workspace-on', mode: 'workspace', protected: true },
  { name: 'workspace-on-after-reload', mode: 'workspace', protected: true, action: 'reload' },
  { name: 'workspace-off-restored', mode: 'workspace', protected: false },
  { name: 'companion-off-restored', mode: 'companion', protected: false },
];

async function runFFmpeg(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(ffmpeg, args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let size = 0;
    let errorBytes = 0;
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('Actual-app recording timed out.');
      child.kill();
    }, 20_000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 96_000_000) {
        failure = new Error('Unexpected recording output size.');
        child.kill();
      } else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (errorBytes < 20_000) errors.push(chunk);
      errorBytes += chunk.length;
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure || code !== 0)
        rejectRun(
          failure ||
            new Error(Buffer.concat(errors).toString('utf8').trim() || `FFmpeg exited ${code}.`),
        );
      else resolveRun(Buffer.concat(chunks));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function runOwnedWGCFrame(args: string[], expectedBytes: number) {
  return new Promise<{
    pixels: Buffer;
    termination: 'normal exit' | 'stopped after complete frame';
    exitCode: number | null;
    exitSignal: NodeJS.Signals | null;
  }>((resolveRun, rejectRun) => {
    const child = spawn(ffmpeg, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let received = 0;
    let errorBytes = 0;
    let failure: Error | undefined;
    let stoppedAfterFrame = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      failure = new Error(
        `WGC did not deliver one complete owned frame: ${received}/${expectedBytes} bytes.`,
      );
      child.kill();
    }, 20_000);
    child.stdout.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > expectedBytes) {
        failure = new Error(
          'WGC produced more than the expected single owned frame; pixels discarded.',
        );
        child.kill();
        return;
      }
      chunks.push(chunk);
      if (received === expectedBytes) {
        // Some FFmpeg/WinRT combinations deliver the frame but hang in filter
        // teardown. Capture is complete; explicitly stop only our child and
        // report this termination, rather than pretending it exited normally.
        stoppedAfterFrame = child.kill();
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (errorBytes < 20_000) errors.push(chunk);
      errorBytes += chunk.length;
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (failure || received !== expectedBytes || (!stoppedAfterFrame && code !== 0)) {
        const error =
          failure ||
          new Error(
            Buffer.concat(errors).toString('utf8').trim() ||
              `WGC exited ${code} before a complete frame.`,
          );
        Object.assign(error, {
          captureFailure: {
            termination: timedOut
              ? 'timeout before complete frame'
              : 'failed before complete frame',
            receivedFrameBytes: received,
            ffmpegExitCode: code,
            ffmpegExitSignal: signal,
          } satisfies CaptureFailure,
        });
        rejectRun(error);
      } else {
        resolveRun({
          pixels: Buffer.concat(chunks),
          termination: stoppedAfterFrame ? 'stopped after complete frame' : 'normal exit',
          exitCode: code,
          exitSignal: signal,
        });
      }
    });
  });
}

function pixelStats(rgb: Buffer) {
  const palette = [
    [248, 249, 246], // Actual application paper.
    [255, 255, 255], // Actual composer and settings surface.
    [29, 48, 42], // Actual evergreen companion header / workspace rail.
    [36, 54, 47], // Text.
    [56, 102, 76], // Actions.
    [101, 113, 106], // Muted copy.
    [220, 226, 218], // Borders.
    [233, 239, 229], // Soft green controls.
    [194, 219, 163], // Brand icon.
  ];
  let black = 0;
  let green = 0;
  let paper = 0;
  let appPalette = 0;
  for (let offset = 0; offset < rgb.length; offset += 3) {
    const pixel = [rgb[offset], rgb[offset + 1], rgb[offset + 2]];
    if (pixel.every((value) => value <= 5)) black++;
    if (pixel.every((value, index) => Math.abs(value - palette[2][index]) <= 6)) green++;
    if (pixel.every((value) => value >= 240)) paper++;
    if (
      palette.some((color) =>
        color.every((value, channel) => Math.abs(value - pixel[channel]) <= 18),
      )
    )
      appPalette++;
  }
  const count = rgb.length / 3;
  return {
    blackFraction: black / count,
    greenFraction: green / count,
    paperFraction: paper / count,
    appPaletteFraction: appPalette / count,
  };
}

await mkdir(output, { recursive: true });
let application: ElectronApplication | undefined;
let applicationProcess: ChildProcess | undefined;
let renderer: Page | undefined;
let mainWindowId = 0;
let backdropWindowId = 0;
let backdropColor = '#000000';
let backdropPaint = 'rgb(0, 0, 0)';
const observations: Observation[] = [];
const wgcObservations: WGCObservation[] = [];
const displayObservations: DisplayObservation[] = [];
const pageErrors: string[] = [];
try {
  const ffmpegVersion = (await runFFmpeg(['-hide_banner', '-version']))
    .toString('utf8')
    .split(/\r?\n/)[0];
  await runFFmpeg(['-hide_banner', '-h', 'filter=ddagrab']);
  const gfxHelp = (await runFFmpeg(['-hide_banner', '-h', 'filter=gfxcapture'])).toString('utf8');
  const wgcAvailable = gfxHelp.includes('gfxcapture AVOptions:') && gfxHelp.includes('hwnd');
  await mkdir(join(profile, 'local'), { recursive: true });
  await writeFile(
    join(profile, 'local', 'settings.json'),
    JSON.stringify({
      ...DEFAULT_SETTINGS,
      shortcut: 'Control+Alt+Shift+F11',
      captureShortcut: 'Control+Alt+Shift+F10',
      theme: 'light',
      companionOpacity: 1,
    }),
  );
  await writeFile(
    join(profile, 'package.json'),
    JSON.stringify({ name: 'lucentcue-recording-test', version, main: 'recording-bootstrap.cjs' }),
  );
  // Install the network boundary before the actual built app starts. The
  // temporary bootstrap changes no application implementation or user files.
  await writeFile(
    join(profile, 'recording-bootstrap.cjs'),
    `
    globalThis.__lucentcueRecordingRequests = { catalogs: 0, completions: 0 };
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url || String(input);
      if (url === 'https://openrouter.ai/api/v1/models' && (!init || !init.method || init.method === 'GET')) {
        globalThis.__lucentcueRecordingRequests.catalogs++;
        return new Response(JSON.stringify({ data: [{
          id: 'openrouter/free', name: 'Free models router', context_length: 128000,
          pricing: { prompt: '0', completion: '0', image: '0', request: '0' },
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }
        }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      globalThis.__lucentcueRecordingRequests.completions++;
      throw new Error('Recording test blocks all external provider requests.');
    };
    require(${JSON.stringify(main)});
  `,
  );
  application = await _electron.launch({
    executablePath: electronExecutable as unknown as string,
    args: [profile],
    cwd: project,
    env: environment,
    chromiumSandbox: true,
    timeout: 40_000,
  });
  applicationProcess = application.process();
  renderer = await application.firstWindow({ timeout: 30_000 });
  renderer.on('pageerror', (error) => pageErrors.push(error.message));
  renderer.setDefaultTimeout(15_000);
  await renderer.waitForURL('**/dist/index.html', { waitUntil: 'domcontentloaded' });
  await renderer.reload();
  await renderer.getByRole('textbox', { name: 'Message LucentCue' }).waitFor();
  await renderer.evaluate(() => document.fonts.ready);
  const state = await renderer.evaluate(() => window.desktop!.getState());
  assert.deepEqual(state.keys, { openrouter: false, openai: false, gemini: false });
  assert.deepEqual(state.conversations, []);
  assert.equal(state.settings.saveHistory, false);
  assert.equal(state.captureProtectionSupported, true);
  assert.equal(state.settings.theme, 'light');
  assert.equal(state.settings.companionOpacity, 1);
  assert.equal(state.version, version);
  const testBindings = await application.evaluate(
    ({ globalShortcut }, settings) => [
      globalShortcut.isRegistered(settings.shortcut),
      globalShortcut.isRegistered(settings.captureShortcut),
    ],
    state.settings,
  );
  assert.deepEqual(testBindings, [true, true], 'The uncommon test shortcuts must be available.');
  await renderer.waitForFunction(() => document.documentElement.dataset.theme === 'light');

  const boundary = await application.evaluate(
    async ({ app, BrowserWindow, screen }, input) => {
      if (screen.getAllDisplays().length !== 1)
        throw new Error('Actual-app DXGI recording requires exactly one display.');
      const mainWindow = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().endsWith('/dist/index.html'),
      );
      if (!mainWindow) throw new Error('The actual LucentCue renderer was not found.');
      const area = screen.getAllDisplays()[0].workArea;
      if (area.width < 900 || area.height < 720)
        throw new Error('The single display work area must fit the 900 × 720 workspace.');
      const backdrop = new BrowserWindow({
        title: input.backdropTitle,
        ...area,
        frame: false,
        show: false,
        focusable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        roundedCorners: false,
        transparent: false,
        backgroundColor: '#000000',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      await backdrop.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            '<!doctype html><html style="width:100%;height:100%;background:#000"><body style="margin:0;width:100%;height:100%;background:#000"></body></html>',
          ),
      );
      backdrop.setTitle(input.backdropTitle);
      backdrop.setAlwaysOnTop(true, 'pop-up-menu');
      backdrop.setIgnoreMouseEvents(true);
      backdrop.showInactive();
      mainWindow.setParentWindow(backdrop);
      mainWindow.setTitle(input.sourceTitle);
      mainWindow.setFocusable(false);
      mainWindow.setIgnoreMouseEvents(true);
      mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
      mainWindow.showInactive();
      return {
        userData: app.getPath('userData'),
        mainWindowId: mainWindow.id,
        backdropWindowId: backdrop.id,
        electronVersion: process.versions.electron,
      };
    },
    { backdropTitle, sourceTitle },
  );
  assert.equal(resolve(boundary.userData), resolve(profile));
  mainWindowId = boundary.mainWindowId;
  backdropWindowId = boundary.backdropWindowId;

  async function cropRegion(): Promise<Region> {
    return application!.evaluate(
      async ({ BrowserWindow, screen }, input) => {
        if (screen.getAllDisplays().length !== 1)
          throw new Error('The single-display capture boundary changed.');
        const source = BrowserWindow.fromId(input.mainWindowId);
        const backdrop = BrowserWindow.fromId(input.backdropWindowId);
        const ownership = {
          sourceVisible: source?.isVisible(),
          backdropVisible: backdrop?.isVisible(),
          parent: source?.getParentWindow()?.id,
          expectedParent: backdrop?.id,
          sourceOnTop: source?.isAlwaysOnTop(),
          backdropOnTop: backdrop?.isAlwaysOnTop(),
          backdropProtected: backdrop?.isContentProtected(),
          opacity: backdrop?.getOpacity(),
          background: backdrop?.getBackgroundColor(),
        };
        if (
          !source?.isVisible() ||
          !backdrop?.isVisible() ||
          source.getParentWindow()?.id !== backdrop.id ||
          !source.isAlwaysOnTop() ||
          !backdrop.isAlwaysOnTop() ||
          backdrop.isContentProtected() ||
          backdrop.getOpacity() !== 1 ||
          !new RegExp(`^${input.backdropColor}(?:ff)?$`, 'i').test(backdrop.getBackgroundColor()) ||
          (await backdrop.webContents.executeJavaScript(
            'getComputedStyle(document.body).backgroundColor',
          )) !== input.backdropPaint
        )
          throw new Error(
            'The opaque owned backdrop must remain behind the visible app: ' +
              JSON.stringify(ownership),
          );
        const bounds = screen.dipToScreenRect(source, source.getContentBounds());
        const cover = screen.dipToScreenRect(backdrop, backdrop.getContentBounds());
        const display = screen.dipToScreenRect(null, screen.getAllDisplays()[0].bounds);
        if (
          bounds.x < cover.x ||
          bounds.y < cover.y ||
          bounds.x + bounds.width > cover.x + cover.width ||
          bounds.y + bounds.height > cover.y + cover.height
        )
          throw new Error('The complete app crop must be inside the owned black backdrop.');
        const region = {
          x: bounds.x - display.x,
          y: bounds.y - display.y,
          width: bounds.width,
          height: bounds.height,
        };
        if (
          !Object.values(region).every(Number.isInteger) ||
          region.x < 0 ||
          region.y < 0 ||
          region.width <= 0 ||
          region.height <= 0 ||
          region.x + region.width > display.width ||
          region.y + region.height > display.height
        )
          throw new Error('The DXGI crop must stay strictly inside the sole physical display.');
        return region;
      },
      { mainWindowId, backdropWindowId, backdropColor, backdropPaint },
    );
  }

  async function rendererStats() {
    // Internal renderer paint is separate evidence: the protected app still
    // renders its UI locally. It is never substituted for external capture.
    const png = await renderer!.screenshot({ animations: 'disabled', scale: 'css' });
    const decoded = await runFFmpeg(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-frames:v',
        '1',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        'pipe:1',
      ],
      png,
    );
    const stats = pixelStats(decoded);
    assert(
      stats.appPaletteFraction > 0.95 && stats.paperFraction > 0.4 && stats.greenFraction > 0.05,
      'The isolated renderer must still paint its recognizable UI, including when protected.',
    );
    return stats;
  }

  for (const stage of stages) {
    // Exercise the real sandboxed preload and validated main-process settings IPC.
    await renderer.evaluate(async (input) => {
      const current = await window.desktop!.getState();
      if (current.windowMode !== input.mode) await window.desktop!.setWindowMode(input.mode);
      // An unchanged value must not be re-saved after switching modes: that
      // would reapply the flag and could mask a mode-change regression.
      if (current.settings.captureProtection !== input.protected)
        await window.desktop!.saveSettings({
          ...current.settings,
          captureProtection: input.protected,
        });
    }, stage);
    if (stage.action === 'hide-show') {
      await application.evaluate(({ BrowserWindow }, id) => {
        const source = BrowserWindow.fromId(id)!;
        source.hide();
        source.showInactive();
      }, mainWindowId);
    } else if (stage.action === 'reload') {
      await renderer.reload();
      await renderer.getByRole('textbox', { name: 'Message LucentCue' }).waitFor();
    }
    await renderer.waitForFunction(
      (mode) => document.querySelector('.app-shell')?.classList.contains(`${mode}-mode`),
      stage.mode,
    );
    const nativeFlag: boolean = await application.evaluate(
      ({ BrowserWindow, screen }, input) => {
        const source = BrowserWindow.fromId(input.mainWindowId)!;
        const backdrop = BrowserWindow.fromId(input.backdropWindowId)!;
        const area = screen.getAllDisplays()[0].workArea;
        const size =
          input.mode === 'companion' ? { width: 480, height: 380 } : { width: 900, height: 720 };
        source.setBounds({
          x: area.x + Math.floor((area.width - size.width) / 2),
          y: area.y + Math.floor((area.height - size.height) / 2),
          ...size,
        });
        // Saving ordinary app settings can demote the whole native owner group.
        // Reassert the owned cover first, then its actual-app child above it.
        backdrop.setAlwaysOnTop(true, 'pop-up-menu');
        backdrop.showInactive();
        source.setAlwaysOnTop(true, 'pop-up-menu');
        source.showInactive();
        source.moveTop();
        return source.isContentProtected();
      },
      { mainWindowId, backdropWindowId, mode: stage.mode },
    );
    assert.equal(nativeFlag, stage.protected, 'Actual window flag must match saved settings.');
    const localRenderer = await rendererStats();
    await delay(350); // Windows composition must settle after resizing and display-affinity changes.
    const crop = await cropRegion();
    const input = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `ddagrab=output_idx=0:draw_mouse=0:framerate=5:video_size=${crop.width}x${crop.height}:offset_x=${crop.x}:offset_y=${crop.y}`,
      '-vf',
      'hwdownload,format=bgra',
    ];
    const video = await runFFmpeg([
      ...input,
      '-t',
      '1.2',
      '-an',
      '-c:v',
      'libx264rgb',
      '-crf',
      '0',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'bgr0',
      '-f',
      'matroska',
      'pipe:1',
    ]);
    assert.deepEqual(
      await cropRegion(),
      crop,
      'The covered app crop must not move during recording.',
    );
    const nativeFlagAfter: boolean = await application.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.isContentProtected(),
      mainWindowId,
    );
    assert.equal(
      nativeFlagAfter,
      stage.protected,
      'The native flag must remain stable throughout DXGI recording.',
    );
    const decoded = await runFFmpeg(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        'pipe:1',
      ],
      video,
    );
    const frameBytes = crop.width * crop.height * 3;
    assert.equal(decoded.length % frameBytes, 0);
    const frames = Array.from({ length: decoded.length / frameBytes }, (_, index) =>
      pixelStats(decoded.subarray(index * frameBytes, (index + 1) * frameBytes)),
    );
    assert(frames.length >= 5, 'Each recording must contain at least five decoded frames.');
    assert(
      stage.protected
        ? frames.every((frame) => frame.blackFraction > 0.99)
        : frames.every(
            (frame) =>
              frame.blackFraction < 0.01 &&
              frame.greenFraction > 0.05 &&
              frame.paperFraction > 0.4 &&
              frame.appPaletteFraction > 0.95,
          ),
      `${stage.name}: every recording frame must match the actual app palette or protected black backdrop; unexpected pixels discarded. Numeric frame statistics: ${JSON.stringify(frames)}`,
    );
    const recording = join(output, `${stage.name}.mkv`);
    await writeFile(recording, video);
    const observation: Observation = {
      ...stage,
      nativeFlag,
      nativeFlagAfter,
      crop,
      frames: frames.length,
      minBlackFraction: Math.min(...frames.map((frame) => frame.blackFraction)),
      maxBlackFraction: Math.max(...frames.map((frame) => frame.blackFraction)),
      minGreenFraction: Math.min(...frames.map((frame) => frame.greenFraction)),
      minPaperFraction: Math.min(...frames.map((frame) => frame.paperFraction)),
      minAppPaletteFraction: Math.min(...frames.map((frame) => frame.appPaletteFraction)),
      recording,
      rendererAppPaletteFraction: localRenderer.appPaletteFraction,
    };
    observations.push(observation);
    console.log(`PASS ${stage.name}: ${frames.length} DXGI frames matched the expected state.`);
  }
  if (wgcAvailable) {
    for (const state of ['off', 'on', 'off-restored'] as const) {
      const enabled = state === 'on';
      await renderer.evaluate(async (enabled) => {
        const current = await window.desktop!.getState();
        await window.desktop!.saveSettings({ ...current.settings, captureProtection: enabled });
      }, enabled);
      const source: { hwnd: string; nativeFlag: boolean; localWindowVisible: boolean } =
        await application.evaluate(
          ({ BrowserWindow }, input) => {
            const window = BrowserWindow.fromId(input.mainWindowId)!;
            const backdrop = BrowserWindow.fromId(input.backdropWindowId)!;
            backdrop.setAlwaysOnTop(true, 'pop-up-menu');
            backdrop.showInactive();
            window.setAlwaysOnTop(true, 'pop-up-menu');
            window.showInactive();
            window.moveTop();
            const handle = window.getNativeWindowHandle();
            return {
              hwnd: (handle.length === 8
                ? handle.readBigUInt64LE()
                : BigInt(handle.readUInt32LE())
              ).toString(),
              nativeFlag: window.isContentProtected(),
              localWindowVisible: window.isVisible(),
            };
          },
          { mainWindowId, backdropWindowId },
        );
      assert.equal(source.nativeFlag, enabled);
      assert.equal(source.localWindowVisible, true);
      await delay(350);
      const crop = await cropRegion();
      await rendererStats();
      const observation: WGCObservation = {
        state,
        nativeFlag: source.nativeFlag,
        localWindowVisible: source.localWindowVisible,
        captured: false,
        observation: 'capture unavailable',
      };
      try {
        // Explicit HWND is owned by this exact temporary application. Never
        // enumerate/select a user's window or use a WGC monitor source.
        const frameBytes = crop.width * crop.height * 3;
        observation.expectedFrameBytes = frameBytes;
        const frame = await runOwnedWGCFrame(
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-f',
            'lavfi',
            '-i',
            `gfxcapture=hwnd=${source.hwnd}:capture_cursor=0:display_border=0:max_framerate=5:width=${crop.width}:height=${crop.height}:resize_mode=crop`,
            '-vf',
            'hwdownload,format=bgra',
            '-frames:v',
            '1',
            '-pix_fmt',
            'rgb24',
            '-f',
            'rawvideo',
            'pipe:1',
          ],
          frameBytes,
        );
        observation.termination = frame.termination;
        observation.ffmpegExitCode = frame.exitCode;
        observation.ffmpegExitSignal = frame.exitSignal;
        observation.receivedFrameBytes = frame.pixels.length;
        assert.deepEqual(
          await cropRegion(),
          crop,
          'The owned source must not move during WGC capture.',
        );
        const nativeStable: { visible: boolean; protected: boolean; hwnd: string } =
          await application.evaluate(({ BrowserWindow }, id) => {
            const window = BrowserWindow.fromId(id)!;
            const handle = window.getNativeWindowHandle();
            return {
              visible: window.isVisible(),
              protected: window.isContentProtected(),
              hwnd: (handle.length === 8
                ? handle.readBigUInt64LE()
                : BigInt(handle.readUInt32LE())
              ).toString(),
            };
          }, mainWindowId);
        assert.equal(nativeStable.visible, true);
        assert.equal(nativeStable.protected, enabled);
        assert.equal(nativeStable.hwnd, source.hwnd);
        const frames = [pixelStats(frame.pixels)];
        observation.frames = frames.length;
        observation.minAppPaletteFraction = Math.min(
          ...frames.map((frame) => frame.appPaletteFraction),
        );
        observation.minBlackFraction = Math.min(...frames.map((frame) => frame.blackFraction));
        const appVisible = frames.every(
          (frame) =>
            frame.appPaletteFraction > 0.95 &&
            frame.paperFraction > 0.4 &&
            frame.greenFraction > 0.05,
        );
        const black = frames.every((frame) => frame.blackFraction > 0.99);
        observation.captured = appVisible;
        observation.observation = appVisible
          ? 'app visible'
          : black
            ? 'black pixels'
            : 'unrecognized pixels discarded';
        if (appVisible || black) {
          const png = await runFFmpeg(
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-f',
              'rawvideo',
              '-pix_fmt',
              'rgb24',
              '-s',
              `${crop.width}x${crop.height}`,
              '-i',
              'pipe:0',
              '-frames:v',
              '1',
              '-c:v',
              'png',
              '-f',
              'image2pipe',
              'pipe:1',
            ],
            frame.pixels,
          );
          observation.image = join(output, `wgc-companion-${state}.png`);
          await writeFile(observation.image, png);
        }
      } catch (error) {
        observation.error =
          error instanceof Error ? error.message.slice(0, 2000) : 'WGC capture failed.';
        const failure = (error as { captureFailure?: CaptureFailure })?.captureFailure;
        if (failure) Object.assign(observation, failure);
      }
      wgcObservations.push(observation);
      console.log(
        `OBSERVED WGC companion ${state}: ${observation.observation}${observation.frames ? ` (${observation.frames} frames)` : ''}.`,
      );
      if (state === 'off' && !observation.captured) {
        console.log(
          'WGC ON/restored probes skipped: a recognizable OFF baseline is required first.',
        );
        break;
      }
    }
  }
  // A nonblack owned background distinguishes clean exclusion from black
  // redaction during display sharing. Keep this result separate from the
  // exact-window WGC test and the historical black-backdrop recordings.
  backdropColor = '#c525d6';
  backdropPaint = 'rgb(197, 37, 214)';
  await application.evaluate(
    async ({ BrowserWindow }, input) => {
      const backdrop = BrowserWindow.fromId(input.backdropWindowId)!;
      backdrop.setBackgroundColor(input.backdropColor);
      await backdrop.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            `<!doctype html><html style="width:100%;height:100%;background:${input.backdropColor}"><body style="margin:0;width:100%;height:100%;background:${input.backdropColor}"></body></html>`,
          ),
      );
    },
    { backdropWindowId, backdropColor },
  );
  for (const state of ['off', 'on', 'off-restored'] as const) {
    const enabled = state === 'on';
    await renderer.evaluate(async (enabled) => {
      const current = await window.desktop!.getState();
      await window.desktop!.saveSettings({ ...current.settings, captureProtection: enabled });
    }, enabled);
    await application.evaluate(
      ({ BrowserWindow }, input) => {
        const backdrop = BrowserWindow.fromId(input.backdropWindowId)!;
        const source = BrowserWindow.fromId(input.mainWindowId)!;
        backdrop.setAlwaysOnTop(true, 'pop-up-menu');
        backdrop.showInactive();
        source.setAlwaysOnTop(true, 'pop-up-menu');
        source.showInactive();
        source.moveTop();
      },
      { mainWindowId, backdropWindowId },
    );
    await delay(350);
    const crop = await cropRegion();
    await rendererStats();
    for (const api of (wgcAvailable ? ['dxgi', 'wgc-monitor'] : ['dxgi']) as (
      'dxgi' | 'wgc-monitor'
    )[]) {
      const frameBytes = crop.width * crop.height * 3;
      const observation: DisplayObservation = {
        api,
        state,
        nativeFlag: enabled,
        outcome: 'capture unavailable',
        expectedFrameBytes: frameBytes,
      };
      try {
        const before: { visible: boolean; protected: boolean } = await application.evaluate(
          ({ BrowserWindow }, id) => ({
            visible: BrowserWindow.fromId(id)!.isVisible(),
            protected: BrowserWindow.fromId(id)!.isContentProtected(),
          }),
          mainWindowId,
        );
        assert.equal(before.visible, true);
        assert.equal(before.protected, enabled);
        const input =
          api === 'dxgi'
            ? `ddagrab=output_idx=0:draw_mouse=0:framerate=5:video_size=${crop.width}x${crop.height}:offset_x=${crop.x}:offset_y=${crop.y}`
            : 'gfxcapture=monitor_idx=0:capture_cursor=0:display_border=0:max_framerate=5';
        // Monitor textures never go to stdout or disk in full: only the crop
        // strictly within the opaque owned backdrop is emitted as one RGB frame.
        const filter =
          api === 'dxgi'
            ? 'hwdownload,format=bgra'
            : `hwdownload,format=bgra,crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`;
        const args = [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          input,
          '-vf',
          filter,
          '-frames:v',
          '1',
          '-pix_fmt',
          'rgb24',
          '-f',
          'rawvideo',
          'pipe:1',
        ];
        const frame =
          api === 'dxgi'
            ? {
                pixels: await runFFmpeg(args),
                termination: 'normal exit' as const,
                exitCode: 0,
                exitSignal: null,
              }
            : await runOwnedWGCFrame(args, frameBytes);
        assert.equal(frame.pixels.length, frameBytes);
        observation.receivedFrameBytes = frame.pixels.length;
        observation.termination = frame.termination;
        observation.ffmpegExitCode = frame.exitCode;
        observation.ffmpegExitSignal = frame.exitSignal;
        assert.deepEqual(await cropRegion(), crop);
        const after: { visible: boolean; protected: boolean } = await application.evaluate(
          ({ BrowserWindow }, id) => ({
            visible: BrowserWindow.fromId(id)!.isVisible(),
            protected: BrowserWindow.fromId(id)!.isContentProtected(),
          }),
          mainWindowId,
        );
        assert.deepEqual(
          after,
          before,
          'Visibility and the native flag must stay stable during display capture.',
        );
        const stats = pixelStats(frame.pixels);
        let backgroundPixels = 0;
        for (let offset = 0; offset < frame.pixels.length; offset += 3)
          if (
            Math.abs(frame.pixels[offset] - 197) <= 5 &&
            Math.abs(frame.pixels[offset + 1] - 37) <= 5 &&
            Math.abs(frame.pixels[offset + 2] - 214) <= 5
          )
            backgroundPixels++;
        const backgroundFraction = backgroundPixels / (frame.pixels.length / 3);
        observation.backgroundFraction = backgroundFraction;
        observation.blackFraction = stats.blackFraction;
        observation.appPaletteFraction = stats.appPaletteFraction;
        const appVisible =
          stats.appPaletteFraction > 0.95 &&
          stats.paperFraction > 0.4 &&
          stats.greenFraction > 0.05;
        observation.outcome =
          backgroundFraction > 0.99
            ? 'background revealed'
            : stats.blackFraction > 0.99
              ? 'black redaction'
              : appVisible
                ? 'app visible'
                : 'unrecognized pixels discarded';
        if (observation.outcome !== 'unrecognized pixels discarded') {
          const png = await runFFmpeg(
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-f',
              'rawvideo',
              '-pix_fmt',
              'rgb24',
              '-s',
              `${crop.width}x${crop.height}`,
              '-i',
              'pipe:0',
              '-frames:v',
              '1',
              '-c:v',
              'png',
              '-f',
              'image2pipe',
              'pipe:1',
            ],
            frame.pixels,
          );
          observation.image = join(output, `display-${api}-${state}.png`);
          await writeFile(observation.image, png);
        }
      } catch (error) {
        observation.error =
          error instanceof Error ? error.message.slice(0, 2000) : 'Display capture failed.';
        const failure = (error as { captureFailure?: CaptureFailure })?.captureFailure;
        if (failure) Object.assign(observation, failure);
      }
      displayObservations.push(observation);
      console.log(`OBSERVED ${api} display ${state}: ${observation.outcome}.`);
    }
  }
  const displayConclusions = (wgcAvailable ? ['dxgi', 'wgc-monitor'] : ['dxgi']).map((api) => {
    const samples = displayObservations.filter((sample) => sample.api === api);
    const baselineValid =
      samples[0]?.outcome === 'app visible' && samples[2]?.outcome === 'app visible';
    return {
      api,
      baselineValid,
      protectedOutcome: baselineValid ? samples[1].outcome : 'inconclusive: invalid OFF controls',
    };
  });
  const wgcBaselinesValid =
    wgcObservations[0]?.captured === true && wgcObservations[2]?.captured === true;
  const wgcOn = wgcObservations[1];
  const wgcConclusion = !wgcAvailable
    ? 'FFmpeg gfxcapture unavailable; WGC not attempted.'
    : !wgcBaselinesValid
      ? 'Inconclusive: one or both WGC OFF baselines did not capture the app.'
      : wgcOn.observation === 'black pixels'
        ? 'Valid paired WGC baseline: protected external still contained black pixels.'
        : wgcOn.observation === 'capture unavailable'
          ? 'Valid WGC OFF baselines; protected capture was unavailable. Failure is not pixel proof of exclusion.'
          : wgcOn.captured
            ? 'WGC still captured the protected app despite valid OFF baselines.'
            : 'Inconclusive: protected WGC pixels were unrecognized and discarded.';
  const requests = (await application.evaluate('globalThis.__lucentcueRecordingRequests')) as {
    catalogs: number;
    completions: number;
  };
  assert.equal(requests.completions, 0);
  assert.deepEqual(pageErrors, []);
  const report = {
    timestamp: new Date().toISOString(),
    version,
    platform: process.platform,
    windowsRelease: release(),
    electronVersion: boundary.electronVersion,
    ffmpegVersion,
    actualBuiltApplication: true,
    isolatedEmptyProfile: true,
    providerCompletions: requests.completions,
    networkMockInstalledBeforeApplication: true,
    configuredTestShortcuts: [state.settings.shortcut, state.settings.captureShortcut],
    theme: 'light',
    companionOpacity: 1,
    captureAPI:
      'FFmpeg ddagrab (DXGI Desktop Duplication) strict owned crop; gfxcapture (Windows.Graphics.Capture) exact owned HWND and monitor 0 with strict owned crop before output',
    wholeDesktopOutputRetained: false,
    observations,
    wgcAvailable,
    wgcExactOwnedWindowOnly: true,
    wgcCaptureKind:
      'Single external PNG per state; capture failure is distinct from pixel evidence.',
    wgcBaselinesValid,
    wgcObservations,
    wgcConclusion,
    displayBackdrop: { nativeColor: backdropColor, rendererColor: backdropPaint, opaque: true },
    displayObservations,
    displayConclusions,
    displayOutputBoundary:
      'Only strict crops inside the owned cover are emitted or retained. Monitor APIs may internally acquire a full display surface.',
    conclusion:
      'Both actual LucentCue window modes were visible with protection OFF, black with protection ON, and visible after restoring OFF in DXGI capture. Protection survived mode change, hide/show and renderer reload. WGC results are reported separately.',
    limitation:
      'Evidence is limited to this Windows machine, Electron version and the tested capture APIs/modes. It is not an installed-binary or actual Scaler-recorder test, and does not establish universal exclusion, process hiding, or keyboard-trace evasion.',
    documentation: [
      'https://ffmpeg.org/ffmpeg-filters.html#ddagrab',
      'https://ffmpeg.org/ffmpeg-filters.html#gfxcapture',
      'https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows',
      'https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity',
    ],
  };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        passed: true,
        recordings: observations.length,
        wgcConclusion,
        displayConclusions,
        report: join(output, 'report.json'),
      },
      null,
      2,
    ),
  );
} finally {
  if (application) {
    const closing = application.waitForEvent('close', { timeout: 10_000 }).catch(() => undefined);
    await application.evaluate(({ app }) => app.quit()).catch(() => undefined);
    await closing;
    if (applicationProcess?.exitCode === null) await application.close().catch(() => undefined);
  }
  const target = resolve(profile);
  const withinTemporary = relative(resolve(tmpdir()), target);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !withinTemporary.startsWith('lucentcue-app-recording-') ||
    withinTemporary.includes('..')
  )
    throw new Error('Unexpected recording-test cleanup target.');
  await rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
