/**
 * Actual LucentCue Windows recording test, using only an isolated empty profile.
 * Build first: npm run build && npx tsx tests/app-recording-smoke.ts
 * Requires FFmpeg ddagrab on PATH (or FFMPEG_PATH), and exactly one display.
 * Every DXGI frame is cropped inside an owned, opaque black backdrop. Unexpected
 * recordings stay in memory and are discarded; only passing local app/black
 * recordings are retained under ignored test-results/app-recording.
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
import type { WindowMode } from '../shared/types';

assert.equal(process.platform, 'win32', 'This experiment uses Windows DXGI Desktop Duplication.');
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const main = join(project, 'dist-desktop', 'main.cjs');
await Promise.all([access(main), access(join(project, 'dist', 'index.html'))]);
const output = join(project, 'test-results', 'app-recording');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const profile = await mkdtemp(join(tmpdir(), 'lucentcue-app-recording-'));
const backdropTitle = `LucentCue Owned Black Recording Backdrop ${randomUUID()}`;
const environment: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_RENDERER_URL;
environment.LUCENTCUE_USER_DATA = profile;

type Region = { x: number; y: number; width: number; height: number };
type Stage = { name: string; mode: WindowMode; protected: boolean };
type Observation = Stage & {
  nativeFlag: boolean;
  crop: Region;
  frames: number;
  minBlackFraction: number;
  maxBlackFraction: number;
  minGreenFraction: number;
  minPaperFraction: number;
  minAppPaletteFraction: number;
  recording: string;
};
const stages: Stage[] = [
  { name: 'companion-off', mode: 'companion', protected: false },
  { name: 'companion-on', mode: 'companion', protected: true },
  { name: 'workspace-on-after-mode-change', mode: 'workspace', protected: true },
  { name: 'workspace-off', mode: 'workspace', protected: false },
  { name: 'workspace-on', mode: 'workspace', protected: true },
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
const observations: Observation[] = [];
const pageErrors: string[] = [];
try {
  const ffmpegVersion = (await runFFmpeg(['-hide_banner', '-version']))
    .toString('utf8')
    .split(/\r?\n/)[0];
  await runFFmpeg(['-hide_banner', '-h', 'filter=ddagrab']);
  application = await _electron.launch({
    executablePath: electronExecutable as unknown as string,
    args: [main],
    cwd: project,
    env: environment,
    chromiumSandbox: true,
    timeout: 40_000,
  });
  applicationProcess = application.process();
  renderer = await application.firstWindow({ timeout: 30_000 });
  renderer.on('pageerror', (error) => pageErrors.push(error.message));
  renderer.setDefaultTimeout(15_000);
  await application.evaluate(`(() => {
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
      throw new Error('Actual-app recording test blocks all external provider requests.');
    };
  })()`);
  await renderer.waitForURL('**/dist/index.html', { waitUntil: 'domcontentloaded' });
  await renderer.reload();
  await renderer.getByRole('textbox', { name: 'Message LucentCue' }).waitFor();
  await renderer.evaluate(() => document.fonts.ready);
  const state = await renderer.evaluate(() => window.desktop!.getState());
  assert.deepEqual(state.keys, { openrouter: false, openai: false, gemini: false });
  assert.deepEqual(state.conversations, []);
  assert.equal(state.settings.saveHistory, false);
  assert.equal(state.captureProtectionSupported, true);

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
      mainWindow.setFocusable(false);
      mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
      mainWindow.showInactive();
      return {
        userData: app.getPath('userData'),
        mainWindowId: mainWindow.id,
        backdropWindowId: backdrop.id,
        electronVersion: process.versions.electron,
      };
    },
    { backdropTitle },
  );
  assert.equal(resolve(boundary.userData), resolve(profile));
  mainWindowId = boundary.mainWindowId;
  backdropWindowId = boundary.backdropWindowId;

  async function cropRegion(): Promise<Region> {
    return application!.evaluate(
      ({ BrowserWindow, screen }, input) => {
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
          !/^#000000(?:ff)?$/i.test(backdrop.getBackgroundColor())
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
      { mainWindowId, backdropWindowId },
    );
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
      `${stage.name}: every recording frame must match the actual app palette or protected black backdrop; unexpected pixels discarded.`,
    );
    const recording = join(output, `${stage.name}.mkv`);
    await writeFile(recording, video);
    const observation: Observation = {
      ...stage,
      nativeFlag,
      crop,
      frames: frames.length,
      minBlackFraction: Math.min(...frames.map((frame) => frame.blackFraction)),
      maxBlackFraction: Math.max(...frames.map((frame) => frame.blackFraction)),
      minGreenFraction: Math.min(...frames.map((frame) => frame.greenFraction)),
      minPaperFraction: Math.min(...frames.map((frame) => frame.paperFraction)),
      minAppPaletteFraction: Math.min(...frames.map((frame) => frame.appPaletteFraction)),
      recording,
    };
    observations.push(observation);
    console.log(`PASS ${stage.name}: ${frames.length} DXGI frames matched the expected state.`);
  }
  const requests = (await application.evaluate('globalThis.__lucentcueRecordingRequests')) as {
    catalogs: number;
    completions: number;
  };
  assert.equal(requests.completions, 0);
  assert.deepEqual(pageErrors, []);
  const report = {
    timestamp: new Date().toISOString(),
    version: JSON.parse(await readFile(join(project, 'package.json'), 'utf8')).version,
    platform: process.platform,
    windowsRelease: release(),
    electronVersion: boundary.electronVersion,
    ffmpegVersion,
    actualBuiltApplication: true,
    isolatedEmptyProfile: true,
    providerCompletions: requests.completions,
    captureAPI:
      'FFmpeg ddagrab: Windows DXGI Desktop Duplication, strict actual-app content crop inside an owned opaque black backdrop',
    wholeDesktopCaptured: false,
    observations,
    conclusion:
      'Both actual LucentCue window modes were visible with protection OFF, black with protection ON, and visible after restoring OFF. Protection survived the companion-to-workspace mode change.',
    limitation:
      'Evidence is limited to this Windows machine, Electron version and DXGI recording path. It does not establish universal recorder exclusion, process hiding, or keyboard-trace evasion.',
    documentation: [
      'https://ffmpeg.org/ffmpeg-filters.html#ddagrab',
      'https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows',
      'https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity',
    ],
  };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      { passed: true, recordings: observations.length, report: join(output, 'report.json') },
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
