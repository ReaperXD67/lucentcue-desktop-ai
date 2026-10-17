/**
 * Windows external capture experiment for a harmless, isolated Electron fixture.
 * Run: npx tsx tests/capture-protection-smoke.ts
 * Requires ffmpeg on PATH (or FFMPEG_PATH). No user application is controlled.
 *
 * Capture API: FFmpeg gdigrab, Windows GDI, input title=<unique fixture title>.
 * https://ffmpeg.org/ffmpeg-devices.html#gdigrab
 * Optional: LUCENTCUE_CAPTURE_DXGI=1 also tests Desktop Duplication, cropped
 * strictly inside an opaque harmless owned backdrop on a single-monitor setup.
 * https://ffmpeg.org/ffmpeg-filters.html#ddagrab
 * https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows
 * https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity
 * Native isContentProtected() verifies the requested flag; the independent
 * FFmpeg pixels below are the capture evidence. Neither proves all recorders.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir, release } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import electronExecutable from 'electron';
import { _electron, type ElectronApplication } from 'playwright';

assert.equal(process.platform, 'win32', 'This experiment uses the Windows GDI capture API.');
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(project, 'test-results', 'capture-protection');
const profile = await mkdtemp(join(tmpdir(), 'lucentcue-capture-fixture-'));
const title = `LucentCue Harmless Capture Fixture ${randomUUID()}`;
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const includeDXGI = process.env.LUCENTCUE_CAPTURE_DXGI === '1';
const includeVideo = process.env.LUCENTCUE_CAPTURE_VIDEO === '1';
assert(!includeVideo || includeDXGI, 'Video checks require the covered DXGI fixture crop.');
const palette = [
  [230, 40, 75],
  [40, 200, 90],
  [40, 100, 230],
  [235, 195, 35],
];
type Result = {
  api: 'gdi' | 'dxgi';
  state: 'off' | 'on' | 'off-restored';
  nativeFlag: boolean;
  captured: boolean;
  observation: string;
  fixtureFraction?: number;
  blackFraction?: number;
  recognizedFraction?: number;
  width?: number;
  height?: number;
  image?: string;
  error?: string;
  video?: string;
  videoFrames?: number;
  videoMinFixtureFraction?: number;
  videoMinBlackFraction?: number;
};

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
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('The fixture capture timed out.');
      child.kill();
    }, 15_000);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 20_000_000) {
        failure = new Error('Unexpected fixture capture size.');
        child.kill();
      } else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (errors.reduce((sum, item) => sum + item.length, 0) < 20_000) errors.push(chunk);
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
  const counts = palette.map(() => 0);
  let black = 0;
  let white = 0;
  for (let offset = 0; offset + 2 < rgb.length; offset += 3) {
    const pixel = [rgb[offset], rgb[offset + 1], rgb[offset + 2]];
    if (pixel.every((value) => value <= 5)) black++;
    else if (pixel.every((value) => value >= 250)) white++;
    else {
      const match = palette.findIndex((color) =>
        color.every((value, channel) => Math.abs(value - pixel[channel]) <= 5),
      );
      if (match >= 0) counts[match]++;
    }
  }
  const pixels = rgb.length / 3;
  const fixture = counts.reduce((sum, count) => sum + count, 0);
  return {
    fixtureFraction: fixture / pixels,
    blackFraction: black / pixels,
    recognizedFraction: (fixture + black + white) / pixels,
    everySwatch: counts.every((count) => count / pixels > 0.1),
  };
}

await mkdir(output, { recursive: true });
let application: ElectronApplication | undefined;
let applicationProcess: ChildProcess | undefined;
const observations: Result[] = [];
try {
  const version = (await runFFmpeg(['-hide_banner', '-version']))
    .toString('utf8')
    .split(/\r?\n/)[0];
  await runFFmpeg(['-hide_banner', '-h', 'demuxer=gdigrab']);
  if (includeDXGI) await runFFmpeg(['-hide_banner', '-h', 'filter=ddagrab']);
  const main = join(profile, 'fixture.cjs');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;font:700 20px system-ui;color:#000}.swatch{display:grid;place-items:center}.a{background:rgb(230,40,75)}.b{background:rgb(40,200,90)}.c{background:rgb(40,100,230)}.d{background:rgb(235,195,35)}</style></head>
  <body><div class="swatch a">HARMLESS</div><div class="swatch b">CAPTURE</div><div class="swatch c">LOCAL TEST</div><div class="swatch d">NO PRIVATE DATA</div></body></html>`;
  await writeFile(join(profile, 'fixture.html'), html);
  await writeFile(
    join(profile, 'backdrop.html'),
    '<!doctype html><html><body style="margin:0;background:#000"></body></html>',
  );
  await writeFile(
    main,
    `const { app, BrowserWindow, screen } = require('electron');
    const path = require('node:path');
    app.setName('LucentCue Capture Fixture');
    app.setPath('userData', path.join(__dirname, 'isolated-profile'));
    app.whenReady().then(async () => {
      const area = screen.getPrimaryDisplay().workArea;
      const x = Math.max(area.x + 40, area.x + area.width - 540);
      const y = area.y + 56;
      let backdrop;
      if (${includeDXGI}) {
        if (screen.getAllDisplays().length !== 1) { app.quit(); return; }
        backdrop = new BrowserWindow({title:'Harmless Capture Backdrop', width:560,height:400,
          x:x-40,y:y-40,frame:false,show:false,focusable:false,alwaysOnTop:true,skipTaskbar:true,
          resizable:false,movable:false,roundedCorners:false,backgroundColor:'#000',
          webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
        backdrop.setIgnoreMouseEvents(true);
        await backdrop.loadFile(path.join(__dirname,'backdrop.html'));
        backdrop.showInactive();
      }
      const fixture = new BrowserWindow({ title:${JSON.stringify(title)}, width:480, height:320,
        x,y,parent:backdrop,
        frame:false, show:false, focusable:false, alwaysOnTop:true, skipTaskbar:true,
        resizable:false, movable:false, roundedCorners:false,backgroundColor:'#e6284b',
        webPreferences:{sandbox:true, contextIsolation:true, nodeIntegration:false} });
      fixture.setIgnoreMouseEvents(true);
      fixture.webContents.setWindowOpenHandler(() => ({action:'deny'}));
      await fixture.loadFile(path.join(__dirname, 'fixture.html'));
      fixture.showInactive();
    });
    app.on('window-all-closed', () => app.quit());`,
  );
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined),
  );
  delete environment.ELECTRON_RUN_AS_NODE;
  application = await _electron.launch({
    executablePath: electronExecutable as unknown as string,
    args: [main],
    cwd: profile,
    env: environment,
    chromiumSandbox: true,
    timeout: 30_000,
  });
  applicationProcess = application.process();
  await application.firstWindow();
  let fixture = application.windows().find((page) => page.url().endsWith('/fixture.html'));
  for (let attempt = 0; !fixture && attempt < 200; attempt++) {
    await delay(25);
    fixture = application.windows().find((page) => page.url().endsWith('/fixture.html'));
  }
  assert.ok(
    fixture,
    'The harmless fixture must finish opening. DXGI requires exactly one monitor.',
  );
  await fixture.getByText('NO PRIVATE DATA', { exact: true }).waitFor();
  const electronVersion = await application.evaluate(() => process.versions.electron);
  const region = includeDXGI
    ? await application.evaluate(({ BrowserWindow, screen }, sourceTitle) => {
        if (screen.getAllDisplays().length !== 1)
          throw new Error('DXGI fixture test requires exactly one monitor.');
        const source = BrowserWindow.getAllWindows().find(
          (window) => window.getTitle() === sourceTitle,
        )!;
        const backdrop = BrowserWindow.getAllWindows().find(
          (window) => window.getTitle() === 'Harmless Capture Backdrop',
        )!;
        if (!source?.isVisible() || !backdrop?.isVisible() || backdrop.isContentProtected())
          throw new Error('The harmless source and unprotected backdrop must both be visible.');
        const bounds = screen.dipToScreenRect(source, source.getContentBounds());
        const cover = screen.dipToScreenRect(backdrop, backdrop.getContentBounds());
        const monitor = screen.dipToScreenRect(null, screen.getAllDisplays()[0].bounds);
        if (
          bounds.x < cover.x ||
          bounds.y < cover.y ||
          bounds.x + bounds.width > cover.x + cover.width ||
          bounds.y + bounds.height > cover.y + cover.height
        )
          throw new Error('The capture region is not covered by the harmless backdrop.');
        const x = bounds.x - monitor.x,
          y = bounds.y - monitor.y;
        if (
          x < 0 ||
          y < 0 ||
          x + bounds.width > monitor.width ||
          y + bounds.height > monitor.height
        )
          throw new Error('The capture region is outside the sole monitor.');
        return { x, y, width: bounds.width, height: bounds.height };
      }, title)
    : undefined;

  for (const state of ['off', 'on', 'off-restored'] as const) {
    const enabled = state === 'on';
    const nativeFlag: boolean = await application.evaluate(
      ({ BrowserWindow }, input) => {
        const window = BrowserWindow.getAllWindows().find(
          (window) => window.getTitle() === input.title,
        )!;
        window.setContentProtection(input.enabled);
        return window.isContentProtected();
      },
      { title, enabled },
    );
    assert.equal(nativeFlag, enabled);
    await delay(250); // Give Windows composition time to apply the display affinity.
    for (const api of (includeDXGI ? ['gdi', 'dxgi'] : ['gdi']) as ('gdi' | 'dxgi')[]) {
      const result: Result = {
        api,
        state,
        nativeFlag,
        captured: false,
        observation: 'capture unavailable',
      };
      try {
        // The only capture source is this unique harmless window title, never desktop.
        const inputArgs =
          api === 'gdi'
            ? [
                '-hide_banner',
                '-loglevel',
                'error',
                '-f',
                'gdigrab',
                '-framerate',
                '5',
                '-draw_mouse',
                '0',
                '-i',
                `title=${title}`,
              ]
            : [
                '-hide_banner',
                '-loglevel',
                'error',
                '-f',
                'lavfi',
                '-i',
                `ddagrab=output_idx=0:draw_mouse=0:framerate=5:video_size=${region!.width}x${region!.height}:offset_x=${region!.x}:offset_y=${region!.y}`,
                '-vf',
                'hwdownload,format=bgra',
              ];
        const png = await runFFmpeg([
          ...inputArgs,
          '-frames:v',
          '1',
          '-pix_fmt',
          'rgb24',
          '-c:v',
          'png',
          '-f',
          'image2pipe',
          'pipe:1',
        ]);
        assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
        result.width = png.readUInt32BE(16);
        result.height = png.readUInt32BE(20);
        const rgb = await runFFmpeg(
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
        assert.equal(rgb.length, result.width * result.height * 3);
        const stats = pixelStats(rgb);
        Object.assign(result, {
          fixtureFraction: stats.fixtureFraction,
          blackFraction: stats.blackFraction,
          recognizedFraction: stats.recognizedFraction,
        });
        result.captured = stats.everySwatch && stats.fixtureFraction > 0.8;
        result.observation = result.captured
          ? 'fixture visible in external capture'
          : stats.blackFraction > 0.98
            ? 'external capture is black'
            : 'unrecognized capture; pixels discarded';
        // Retain only recognizable harmless fixture or black frames. Unexpected
        // pixels are not written, even though the input is constrained to our window.
        if (stats.recognizedFraction > 0.98 && (result.captured || stats.blackFraction > 0.98)) {
          result.image = join(output, `${api}-${state}.png`);
          await writeFile(result.image, png);
        }
        if (includeVideo && api === 'dxgi') {
          const video = await runFFmpeg([
            ...inputArgs,
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
          const frameBytes = result.width * result.height * 3;
          assert.equal(decoded.length % frameBytes, 0);
          const frames = Array.from({ length: decoded.length / frameBytes }, (_, index) =>
            pixelStats(decoded.subarray(index * frameBytes, (index + 1) * frameBytes)),
          );
          assert(frames.length >= 5, 'Recording must contain at least five decoded frames.');
          result.videoFrames = frames.length;
          result.videoMinFixtureFraction = Math.min(
            ...frames.map((frame) => frame.fixtureFraction),
          );
          result.videoMinBlackFraction = Math.min(...frames.map((frame) => frame.blackFraction));
          assert(
            frames.every((frame) => frame.recognizedFraction > 0.98),
            'Unrecognized recording pixels were discarded.',
          );
          assert(
            enabled
              ? frames.every((frame) => frame.blackFraction > 0.98)
              : frames.every((frame) => frame.everySwatch && frame.fixtureFraction > 0.8),
            'Every decoded recording frame must match the expected protection state.',
          );
          result.video = join(output, `${api}-${state}.mkv`);
          await writeFile(result.video, video);
        }
      } catch (error) {
        result.error = error instanceof Error ? error.message.slice(0, 1000) : 'Capture failed.';
      }
      observations.push(result);
    }
  }
  const conclusions = (includeDXGI ? ['gdi', 'dxgi'] : ['gdi']).map((api) => {
    const frames = observations.filter((result) => result.api === api);
    const baselineValid = frames[0].captured && frames[2].captured;
    const on = frames[1];
    const conclusion = !baselineValid
      ? 'inconclusive: an OFF baseline did not capture the fixture'
      : on.captured
        ? 'this capture still contains the protected fixture'
        : on.blackFraction && on.blackFraction > 0.98
          ? 'this capture is black while protection is ON'
          : on.error
            ? 'this capture failed while protection is ON'
            : 'inconclusive: the ON frame did not match the fixture or a black frame';
    return { api, baselineValid, conclusion };
  });
  const report = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    windowsRelease: release(),
    electronVersion,
    ffmpegVersion: version,
    api: 'FFmpeg gdigrab: Windows GDI window title; optional ddagrab: DXGI Desktop Duplication strict crop inside an owned opaque backdrop',
    source: title,
    wholeDesktopCaptured: false,
    dxgiAttempted: includeDXGI,
    videoAttempted: includeVideo,
    dxgiCrop: region,
    observations,
    conclusions,
    limitation:
      'Evidence applies only to this Windows machine, Electron version, and the named FFmpeg capture paths. It does not establish behavior for all recorders or capture APIs.',
    documentation: [
      'https://ffmpeg.org/ffmpeg-devices.html#gdigrab',
      'https://ffmpeg.org/ffmpeg-filters.html#ddagrab',
      'https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows',
      'https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity',
    ],
  };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ conclusions, report: join(output, 'report.json'), observations }, null, 2),
  );
  assert.ok(
    conclusions.some((result) => result.baselineValid),
    'A recognizable external OFF baseline and restored OFF baseline are required.',
  );
  assert.ok(
    conclusions.some(
      (result) =>
        result.baselineValid &&
        observations.some(
          (frame) =>
            frame.api === result.api &&
            frame.state === 'on' &&
            !frame.captured &&
            (frame.blackFraction ?? 0) > 0.98,
        ),
    ),
    'No tested capture API demonstrated exclusion against valid OFF baselines.',
  );
  if (includeVideo)
    assert.ok(
      observations
        .filter((frame) => frame.api === 'dxgi')
        .every((frame) => !frame.error && (frame.videoFrames ?? 0) >= 5 && frame.video),
      'Every OFF/ON/restored-OFF video must pass all decoded-frame checks.',
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
    !withinTemporary.startsWith('lucentcue-capture-fixture-') ||
    withinTemporary.includes('..')
  )
    throw new Error('Unexpected fixture cleanup target.');
  await rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
