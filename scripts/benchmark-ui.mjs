/** Synthetic, headless-only chat benchmark. No desktop profile, keys, or provider requests. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';

const buildDirectory = resolve(process.argv[2] || 'dist');
const label = process.argv[3] || 'current';
assert(/^[a-z0-9_-]+$/i.test(label), 'Use a simple label containing letters, digits, _ or -.');
const runs = Number(process.env.LUCENTCUE_BENCH_RUNS || 5);
assert(Number.isInteger(runs) && runs >= 1 && runs <= 20, 'Use 1–20 benchmark runs.');
await readFile(join(buildDirectory, 'index.html'));
const paragraph = [
  '### A deliberate implementation note',
  'Keep **state updates predictable**, preserve keyboard access, and measure the actual rendering cost before adding complexity.',
  '- Read the relevant input.\n- Confirm the output is useful.\n- Keep the interaction understandable.',
  '| Step | Result |\n| --- | --- |\n| Read | Available |\n| Check | Verified |',
  '```typescript\nconst summary = items.map(item => ({ ...item, ready: true }));\n```',
  '[Reference](https://example.invalid/reference) and `inline code` stay readable.',
].join('\n\n');
const messages = Array.from({ length: 60 }, (_, index) => ({
  id: `fixture-message-${index}`,
  role: index % 2 ? 'assistant' : 'user',
  content:
    index % 2
      ? Array(5).fill(paragraph).join('\n\n')
      : `Question ${index / 2 + 1}: explain the steps and include a small example.`,
}));
assert(messages.reduce((sum, message) => sum + message.content.length, 0) < 240_000);
const fixture = {
  settings: {
    theme: 'dark',
    companionOpacity: 1,
    mode: 'free',
    provider: 'openrouter',
    model: 'openrouter/free',
    shortcut: 'Alt+W',
    showTrayIcon: true,
    captureShortcut: 'Alt+Shift+S',
    alwaysOnTop: false,
    captureProtection: false,
    saveHistory: false,
    systemPrompt: 'Synthetic benchmark only.',
  },
  keys: { openrouter: true, openai: false, gemini: false },
  windowMode: 'workspace',
  version: 'benchmark',
  appearanceOpacitySupported: false,
  conversations: [
    { id: 'fixture-conversation', title: 'Synthetic performance fixture', updatedAt: 1, messages },
  ],
  captureProtectionSupported: false,
  captureProtectionNotice: 'Headless benchmark fixture.',
};
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(buildDirectory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (relative(buildDirectory, file).startsWith('..')) throw new Error('Outside build.');
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
const externalRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', (route) => {
  if (new URL(route.request().url()).origin === origin) return route.continue();
  externalRequests.push(route.request().url());
  return route.abort();
});
await page.addInitScript((state) => {
  const listeners = new Set();
  const bench = (window.__lucentcueBenchmark = {
    requestId: null,
    copied: '',
    links: [],
    emit(event) {
      for (const listener of listeners) listener(event);
    },
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      async writeText(text) {
        bench.copied = text;
      },
    },
  });
  window.desktop = {
    async getState() {
      return structuredClone(state);
    },
    async setWindowMode(mode) {
      state.windowMode = mode;
    },
    onWindowMode() {
      return () => {};
    },
    async quit() {},
    async saveSettings(settings) {
      state.settings = settings;
      return settings;
    },
    async setKey() {
      throw new Error('No keys are used in this benchmark.');
    },
    async getModels() {
      return [
        {
          id: 'openrouter/free',
          name: 'Synthetic free model',
          vision: true,
          contextLength: 200000,
          free: true,
        },
      ];
    },
    async startChat(request) {
      bench.requestId = request.id;
    },
    async cancelChat() {
      bench.requestId = null;
    },
    onChat(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    onCapture() {
      return () => {};
    },
    async captureScreen() {
      throw new Error('No desktop capture in a benchmark.');
    },
    async saveConversations() {},
    async exportConversation() {
      return false;
    },
    async hide() {},
    async minimize() {},
    async copyText(text) {
      bench.copied = text;
    },
    async openExternal(url) {
      bench.links.push(url);
    },
    async browserOpen() {},
    async browserInstall() {},
    async browserRead() {},
    async browserFill() {},
    async browserClose() {},
  };
}, fixture);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
async function metrics() {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}
async function paint() {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
const samples = [];
try {
  // One unmeasured warm-up prevents the initial browser/V8 startup from dominating.
  for (let run = -1; run < runs; run++) {
    await page.goto(origin);
    await page.locator('.message').last().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 60);
    await paint();
    const typingBefore = await metrics();
    const typingStart = performance.now();
    await page
      .getByRole('textbox', { name: 'Message LucentCue' })
      .pressSequentially('A measured question.');
    await paint();
    const typingElapsedMs = performance.now() - typingStart;
    const typingAfter = await metrics();
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.waitForFunction(() => Boolean(window.__lucentcueBenchmark.requestId));
    const streamBefore = await metrics();
    const streamStart = performance.now();
    const expected = await page.evaluate(async () => {
      const bench = window.__lucentcueBenchmark;
      let text = '';
      for (let index = 0; index < 40; index++) {
        const delta = `Streaming delta ${index + 1}: a useful result. `;
        text += delta;
        bench.emit({ id: bench.requestId, type: 'delta', text: delta });
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      bench.emit({ id: bench.requestId, type: 'done' });
      return text;
    });
    await paint();
    const streamElapsedMs = performance.now() - streamStart;
    const streamAfter = await metrics();
    assert.equal(await page.locator('.message').count(), 62);
    assert.equal(
      await page.locator('.message.assistant .markdown').last().innerText(),
      expected.trim(),
    );
    assert.equal(await page.getByRole('button', { name: 'Stop generating' }).count(), 0);
    // Verify existing rows still expose the same copy and safe-link behavior.
    await page.getByRole('button', { name: 'Copy answer', exact: true }).last().click();
    assert.equal(await page.evaluate(() => window.__lucentcueBenchmark.copied), expected);
    await page.locator('.message.assistant a').first().click();
    assert.deepEqual(await page.evaluate(() => window.__lucentcueBenchmark.links), [
      'https://example.invalid/reference',
    ]);
    if (run >= 0)
      samples.push({
        typingElapsedMs,
        streamElapsedMs,
        typingScriptMs: (typingAfter.ScriptDuration - typingBefore.ScriptDuration) * 1000,
        typingTaskMs: (typingAfter.TaskDuration - typingBefore.TaskDuration) * 1000,
        streamScriptMs: (streamAfter.ScriptDuration - streamBefore.ScriptDuration) * 1000,
        streamTaskMs: (streamAfter.TaskDuration - streamBefore.TaskDuration) * 1000,
      });
    console.log(
      `${label} ${run < 0 ? 'warm-up' : `run ${run + 1}`}: typing ${typingElapsedMs.toFixed(1)}ms, streaming ${streamElapsedMs.toFixed(1)}ms`,
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  // Exercise cancellation after measurement so correctness checks do not affect timings.
  await page.getByRole('textbox', { name: 'Message LucentCue' }).fill('A cancellation check.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const cancelledId = await page.evaluate(() => window.__lucentcueBenchmark.requestId);
  await page.evaluate(
    (id) => window.__lucentcueBenchmark.emit({ id, type: 'delta', text: 'Kept partial answer.' }),
    cancelledId,
  );
  await paint();
  await page.getByRole('button', { name: 'Stop generating' }).click();
  await page.evaluate(
    (id) =>
      window.__lucentcueBenchmark.emit({ id, type: 'delta', text: 'Stale text must be ignored.' }),
    cancelledId,
  );
  await paint();
  assert.equal(
    await page.locator('.message.assistant .markdown').last().innerText(),
    'Kept partial answer.',
  );
  await page.getByRole('button', { name: 'New conversation' }).click();
  await paint();
  assert.equal(await page.locator('.message').count(), 0);
  assert.equal(await page.getByRole('textbox', { name: 'Message LucentCue' }).inputValue(), '');
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const report = {
    label,
    runs,
    browser: browser.version(),
    headless: true,
    cpuThrottle: 4,
    messages: messages.length,
    textCharacters: messages.reduce((sum, message) => sum + message.content.length, 0),
    typingCharacters: 20,
    streamDeltas: 40,
    streamIntervalMs: 16,
    samples,
    median: Object.fromEntries(
      Object.keys(samples[0]).map((name) => [name, median(samples.map((sample) => sample[name]))]),
    ),
    checks: [
      '62 messages after completion',
      'all 40 deltas preserved in order',
      'generation completes',
      'copy text unchanged',
      'safe external link callback unchanged',
      'no external requests',
      'no renderer errors',
      'cancellation retains partial text and ignores stale deltas',
      'new conversation clears transcript and composer',
    ],
  };
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/ui-benchmark-${label}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.median, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
