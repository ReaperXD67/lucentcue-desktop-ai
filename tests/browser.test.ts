import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { BrowserContext } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createBrowserController,
  inspectBrowserDocument,
  launchAssistantBrowser,
  normalizeBrowserUrl,
  stopOwnedBrowser,
} from '../desktop/browser';

class FakePage extends EventEmitter {
  urlValue = 'https://example.com/';
  visible = true;
  closed = false;
  valid = true;
  sameElement = true;
  frame = {};
  snapshot = {
    title: 'Example',
    text: 'Public text',
    fields: [{ id: 'snapshot-0', label: 'Search', type: 'search', value: 'do not return this' }],
    valid: false,
  };
  element = { fill: vi.fn(async (_text: string) => {}), dispose: vi.fn(async () => {}) };
  locatorValue = {
    elementHandle: vi.fn(async () => this.element),
    evaluate: vi.fn(async () => this.sameElement),
  };
  isClosed() {
    return this.closed;
  }
  url() {
    return this.urlValue;
  }
  mainFrame() {
    return this.frame;
  }
  goto = vi.fn(async (url: string) => {
    this.navigate(url);
  });
  bringToFront = vi.fn(async () => {});
  locator = vi.fn(() => this.locatorValue);
  evaluate = vi.fn(async (fn: unknown, argument?: { kind: string; token?: string }) => {
    if (fn === inspectBrowserDocument)
      return argument?.kind === 'validate'
        ? { valid: this.valid }
        : {
            ...this.snapshot,
            fields: this.snapshot.fields.map((field, index) => ({
              ...field,
              id: `${argument?.token}-${index}`,
            })),
          };
    return { visible: this.visible, focused: false };
  });
  navigate(url = this.urlValue) {
    this.urlValue = url;
    this.emit('framenavigated', this.frame);
  }
}

function fixture() {
  const page = new FakePage();
  const pages = [page];
  const events = new EventEmitter();
  const context = {
    on: events.on.bind(events),
    pages: () => pages,
    newPage: vi.fn(async () => {
      const created = new FakePage();
      pages.push(created);
      events.emit('page', created);
      return created;
    }),
    newCDPSession: vi.fn(async () => ({
      send: vi.fn(async () => {}),
      detach: vi.fn(async () => {}),
    })),
    close: vi.fn(async () => {
      page.closed = true;
      events.emit('close');
    }),
  };
  const launch = vi.fn(async () => context as unknown as BrowserContext);
  let id = 0;
  const controller = createBrowserController(join(tmpdir(), 'lucentcue-test-profile'), {
    launch,
    createId: () => (id++ ? `snapshot-${id}` : 'snapshot'),
  });
  return { controller, page, pages, context, events, launch };
}

describe('website URL validation', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['https://example.com/path?q=hello#part', 'https://example.com/path?q=hello#part'],
    ['http://localhost:3000', 'http://localhost:3000/'],
    ['example.com:8080/app', 'https://example.com:8080/app'],
    ['localhost:3000?preview=1', 'https://localhost:3000/?preview=1'],
    [' https://example.com ', 'https://example.com/'],
    ['https://[::1]:3000/', 'https://[::1]:3000/'],
  ])('accepts %s', (input, expected) => expect(normalizeBrowserUrl(input)).toBe(expected));

  it.each([
    '',
    ' ',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,test',
    'about:blank',
    'ftp://example.com',
    'https://user:password@example.com',
    'https://user@example.com',
    'https:///example.com',
    'https://',
    'https://foo bar.com',
    '//example.com',
    'https://example.com\n.evil.test',
    'https:\\example.com',
    'http:example.com',
    'https://example.com:wrong',
    'https://example.com/'.repeat(300),
  ])('rejects %s before navigation', (input) => expect(() => normalizeBrowserUrl(input)).toThrow());
});

describe('owned Chromium shutdown', () => {
  it('waits for graceful process exit without terminating it', async () => {
    let exited = false;
    let resolveExit!: () => void;
    const exit = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const terminate = vi.fn();
    const disconnect = vi.fn(async () => {
      expect(exited).toBe(true);
    });
    await stopOwnedBrowser(
      {
        requestClose: async () => {
          exited = true;
          resolveExit();
        },
        disconnect,
        exited: exit,
        hasExited: () => exited,
        terminate,
      },
      20,
    );
    expect(terminate).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('bounds a hung close/disconnect and waits for its terminated child to exit', async () => {
    let exited = false;
    let resolveExit!: () => void;
    const exit = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const requestClose = vi.fn(() => new Promise<void>(() => {}));
    const disconnect = vi.fn(() => {
      expect(exited).toBe(true);
      return new Promise<void>(() => {});
    });
    const terminate = vi.fn(() => {
      setTimeout(() => {
        exited = true;
        resolveExit();
      }, 1);
    });
    await stopOwnedBrowser(
      { requestClose, disconnect, exited: exit, hasExited: () => exited, terminate },
      20,
    );
    expect(requestClose).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(exited).toBe(true);
  });

  it('reports an owned process that could not be terminated instead of reopening its locked profile', async () => {
    const terminate = vi.fn();
    await expect(
      stopOwnedBrowser(
        {
          requestClose: () => new Promise<void>(() => {}),
          disconnect: async () => {},
          exited: new Promise<void>(() => {}),
          hasExited: () => false,
          terminate,
        },
        5,
      ),
    ).rejects.toThrow('has not closed yet');
    expect(terminate).toHaveBeenCalledOnce();
  });
});

describe('user directed browser controller', () => {
  it('does not launch for invalid URLs', async () => {
    const { controller, launch } = fixture();
    await expect(controller.open('file:///private.txt')).rejects.toThrow(/HTTP/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('opens a website and returns bounded context with empty field values', async () => {
    const { controller, page, launch } = fixture();
    page.snapshot.text = 'x'.repeat(13_000);
    await controller.open('example.com');
    const snapshot = await controller.read();
    expect(launch).toHaveBeenCalledOnce();
    expect(page.goto).toHaveBeenCalledWith('https://example.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    expect(page.bringToFront).toHaveBeenCalledOnce();
    expect(snapshot.text).toHaveLength(12_000);
    expect(snapshot.fields).toEqual([
      { id: 'snapshot-0', label: 'Search', type: 'search', value: '' },
    ]);
  });

  it('fills only the retained element once and does not send Enter or click', async () => {
    const { controller, page } = fixture();
    await controller.open('example.com');
    await controller.read();
    await controller.fill('snapshot-0', 'User approved text');
    expect(page.element.fill).toHaveBeenCalledExactlyOnceWith('User approved text', {
      timeout: 4_000,
    });
    await expect(controller.fill('snapshot-0', 'Again')).rejects.toThrow(
      /Read the current page again/,
    );
  });

  it.each(['navigation', 'same URL reload', 'tab switch', 'replaced element', 'sensitive field'])(
    'rejects a stale reference after %s',
    async (reason) => {
      const { controller, page, pages } = fixture();
      await controller.open('example.com');
      await controller.read();
      if (reason === 'navigation') page.navigate('https://example.com/other');
      if (reason === 'same URL reload') page.navigate();
      if (reason === 'tab switch') {
        page.visible = false;
        pages.push(new FakePage());
      }
      if (reason === 'replaced element') page.sameElement = false;
      if (reason === 'sensitive field') page.valid = false;
      await expect(controller.fill('snapshot-0', 'Text')).rejects.toThrow(
        /Read the current page again/,
      );
      expect(page.element.fill).not.toHaveBeenCalled();
    },
  );

  it('rejects unknown fields and oversized fill requests', async () => {
    const { controller } = fixture();
    await expect(controller.fill('made-up', 'Text')).rejects.toThrow(/Read the current page again/);
    await expect(controller.fill('made-up', 'x'.repeat(20_001))).rejects.toThrow(/20,000/);
  });

  it('reports a closed browser and can close repeatedly', async () => {
    const { controller, context } = fixture();
    await expect(controller.read()).rejects.toThrow(/closed/);
    await controller.open('example.com');
    await controller.close();
    await controller.close();
    expect(context.close).toHaveBeenCalledOnce();
    await expect(controller.read()).rejects.toThrow(/closed/);
  });

  it('reports browser install instructions without leaking launch internals', async () => {
    const controller = createBrowserController(undefined, {
      launch: async () => {
        throw new Error('Private profile details');
      },
    });
    await expect(controller.open('example.com')).rejects.toThrow(/npm run browser:install/);
    await expect(controller.open('example.com')).rejects.not.toThrow(/Private profile/);
  });

  it('keeps an empty field list usable as page context', async () => {
    const { controller, page } = fixture();
    page.snapshot.fields = [];
    await controller.open('example.com');
    expect((await controller.read()).fields).toEqual([]);
  });

  it('refuses to read or fill when every assistant tab is hidden', async () => {
    const { controller, page, pages } = fixture();
    await controller.open('example.com');
    const snapshot = await controller.read();
    page.visible = false;
    const background = new FakePage();
    background.visible = false;
    pages.push(background);
    await expect(controller.fill(snapshot.fields[0].id, 'Text')).rejects.toThrow(
      /Select a visible website tab/,
    );
    expect(page.element.fill).not.toHaveBeenCalled();
    expect(background.element.fill).not.toHaveBeenCalled();
    await expect(controller.read()).rejects.toThrow(/Select a visible website tab/);
  });

  it('invalidates an old reference when another read starts', async () => {
    const { controller } = fixture();
    await controller.open('example.com');
    await controller.read();
    // A second snapshot has new opaque IDs, even at the same URL.
    await controller.read();
    await expect(controller.fill('snapshot-0', 'Text')).rejects.toThrow(
      /Read the current page again/,
    );
  });
});

// Opt in after npm run browser:install. All pages are served locally; no keys/network service needed.
describe.skipIf(process.env.LUCENTCUE_BROWSER_TESTS !== '1')(
  'Chromium local page integration',
  { timeout: 30_000 },
  () => {
    let server: Server;
    let directory: string;
    let origin: string;
    let context: BrowserContext;
    let controller: ReturnType<typeof createBrowserController>;

    beforeAll(async () => {
      const html = `<!doctype html><html><head><title>Local browser test</title></head><body>
      <h1>Public article</h1><p>Visible reference text.</p>
      <label for="search">Search articles</label><input id="search" type="search" value="PRIVATE_FIELD_VALUE">
      <textarea aria-label="Notes">PRIVATE_NOTES</textarea><div contenteditable="true" aria-label="Draft">PRIVATE_DRAFT</div>
      <input type="hidden" value="HIDDEN_VALUE"><input aria-label="API key" value="SECRET_API_KEY">
      <input aria-label="Credit card" value="CARD_VALUE"><input aria-label="Disabled" disabled>
      <input aria-label="Read only" readonly><div style="opacity:0"><input aria-label="Transparent input"></div>
      <form><p>PRIVATE_LOGIN_FORM</p><input aria-label="Email"><input type="password" value="PASSWORD_VALUE"></form>
      <form><input aria-label="Cardholder"><input autocomplete="cc-number"></form>
      <form><input aria-label="Comment draft"><input type="hidden" name="csrf_token" value="PRIVATE_CSRF"></form>
      <iframe srcdoc="<input aria-label='Frame field'>"></iframe>
      <script>window.fillEvents=0;document.getElementById('search').addEventListener('input',()=>window.fillEvents++);</script>
      </body></html>`;
      server = createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(html);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing local server address');
      origin = `http://127.0.0.1:${address.port}`;
      directory = await mkdtemp(join(tmpdir(), 'lucentcue-browser-integration-'));
      controller = createBrowserController(directory, {
        launch: async (profilePath) => {
          context = await launchAssistantBrowser(
            profilePath,
            process.env.LUCENTCUE_BROWSER_HEADED_TESTS !== '1',
          );
          return context;
        },
      });
    }, 30_000);

    afterAll(async () => {
      await controller?.close();
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
      if (directory) await rm(directory, { recursive: true, force: true });
    });

    it('excludes sensitive, hidden, read only, and framed fields without returning existing values', async () => {
      await controller.open(origin);
      const snapshot = await controller.read();
      expect(snapshot.title).toBe('Local browser test');
      expect(snapshot.text).toContain('Visible reference text.');
      expect(snapshot.text).not.toMatch(
        /PRIVATE_|HIDDEN_VALUE|PASSWORD_VALUE|SECRET_API_KEY|CARD_VALUE/,
      );
      expect(snapshot.fields.map((field) => field.label)).toEqual([
        'Search articles',
        'Notes',
        'Draft',
        'Comment draft',
      ]);
      expect(snapshot.fields.every((field) => field.value === '')).toBe(true);
    });

    it('fills only the chosen field and never submits', async () => {
      const snapshot = await controller.read();
      await controller.fill(snapshot.fields[0].id, 'Review this draft');
      const page = context.pages()[0];
      expect(await page.locator('#search').inputValue()).toBe('Review this draft');
      expect(page.url()).toBe(`${origin}/`);
      expect(
        await page.evaluate(() => (window as unknown as { fillEvents: number }).fillEvents),
      ).toBe(1);
    });

    it('rejects an original field replaced with an identical clone', async () => {
      const snapshot = await controller.read();
      await context
        .pages()[0]
        .locator('#search')
        .evaluate((element) => element.replaceWith(element.cloneNode(true)));
      await expect(controller.fill(snapshot.fields[0].id, 'Text')).rejects.toThrow(
        /Read the current page again/,
      );
    });

    it('rejects fields changed to password after reading', async () => {
      const snapshot = await controller.read();
      await context
        .pages()[0]
        .locator('#search')
        .evaluate((element) => element.setAttribute('type', 'password'));
      await expect(controller.fill(snapshot.fields[0].id, 'Text')).rejects.toThrow(
        /Read the current page again/,
      );
    });

    it('reads the tab the user selected instead of the previously read tab', async () => {
      await controller.open(origin);
      const first = context.pages()[0];
      const second = await context.newPage();
      try {
        await second.goto(`${origin}/?second`);
        await second.bringToFront();
        expect((await controller.read()).url).toBe(`${origin}/?second`);
        await first.bringToFront();
        expect((await controller.read()).url).toBe(`${origin}/`);
      } finally {
        await second.close();
      }
    });

    it.skipIf(process.env.LUCENTCUE_BROWSER_HEADED_TESTS !== '1' || process.platform !== 'win32')(
      'reads the selected tab under another window while rejecting a minimized browser',
      async () => {
        await controller.open(origin);
        const first = context.pages()[0];
        const selected = await context.newPage();
        const cdp = await context.newCDPSession(first);
        const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
        const { chromium } = await import('playwright');
        let cover: Awaited<ReturnType<typeof chromium.launch>> | undefined;
        try {
          await cdp.send('Browser.setWindowBounds', {
            windowId,
            bounds: { left: 0, top: 0, width: 640, height: 480, windowState: 'normal' },
          });
          await selected.goto(`${origin}/?covered-selected`);
          await selected.bringToFront();
          cover = await chromium.launch({
            headless: false,
            args: ['--window-position=0,0', '--window-size=1000,800'],
          });
          const coverPage = await cover.newPage();
          await coverPage.setContent(
            '<title>Local occlusion check</title><h1>Harmless local cover</h1>',
          );
          await coverPage.bringToFront();
          // Native window occlusion is asynchronous. Leave time for Windows to
          // classify the covered target before testing a background IPC read.
          await delay(1500);
          expect(await first.evaluate(() => document.visibilityState)).toBe('hidden');
          expect(await selected.evaluate(() => document.visibilityState)).toBe('visible');
          const snapshot = await controller.read();
          expect(snapshot.url).toBe(`${origin}/?covered-selected`);
          await controller.fill(snapshot.fields[0].id, 'Approved while covered');
          expect(await selected.locator('#search').inputValue()).toBe('Approved while covered');

          await cdp.send('Browser.setWindowBounds', {
            windowId,
            bounds: { windowState: 'minimized' },
          });
          await expect.poll(() => selected.evaluate(() => document.visibilityState)).toBe('hidden');
          await expect(controller.read()).rejects.toThrow(/Select a visible website tab/);
        } finally {
          await cdp.send('Browser.setWindowBounds', {
            windowId,
            bounds: { windowState: 'normal' },
          });
          await cdp.send('Browser.setWindowBounds', { windowId, bounds });
          await cdp.detach();
          await cover?.close();
          if (!selected.isClosed()) await selected.close();
          await first.bringToFront();
        }
      },
    );

    it('keeps the selected tab field valid when a background tab navigates or closes', async () => {
      await controller.open(origin);
      const first = context.pages()[0];
      const background = await context.newPage();
      try {
        await background.goto(`${origin}/?background`);
        await first.bringToFront();
        const snapshot = await controller.read();
        await background.goto(`${origin}/?background-refresh`);
        await controller.fill(snapshot.fields[0].id, 'Still the selected field');
        expect(await first.locator('#search').inputValue()).toBe('Still the selected field');
        const nextSnapshot = await controller.read();
        await background.close();
        await controller.fill(nextSnapshot.fields[0].id, 'Background tab closed');
        expect(await first.locator('#search').inputValue()).toBe('Background tab closed');
      } finally {
        if (!background.isClosed()) await background.close();
      }
    });

    it('rejects an active-tab snapshot after a real same-URL reload', async () => {
      await controller.open(origin);
      const snapshot = await controller.read();
      await context.pages()[0].reload();
      await expect(controller.fill(snapshot.fields[0].id, 'An old snapshot')).rejects.toThrow(
        /Read the current page again/,
      );
    });

    it('reopens the same dedicated profile with a fresh endpoint over repeated close cycles', async () => {
      for (let cycle = 0; cycle < 3; cycle++) {
        const previousPages = context.pages();
        const previousMarker = await readFile(join(directory, 'DevToolsActivePort'), 'utf8');
        await controller.close();
        expect(previousPages.every((page) => page.isClosed())).toBe(true);
        await controller.open(origin);
        expect(await readFile(join(directory, 'DevToolsActivePort'), 'utf8')).not.toBe(
          previousMarker,
        );
        expect((await controller.read()).url).toBe(`${origin}/`);
      }
    });
  },
);
