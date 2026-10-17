import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserContext, ElementHandle, Frame, Locator, Page } from 'playwright';
import type { BrowserController, BrowserSnapshot } from '../shared/types';

const FIELD_ATTRIBUTE = 'data-lucentcue-field';
const TEXT_LIMIT = 12_000;
const FIELD_LIMIT = 50;
const CLOSED = 'The assistant browser is closed. Open a website first.';
const STALE = 'The page or field changed. Read the current page again before filling.';

/** Strictly validate before launching a browser or sending a navigation request. */
export function normalizeBrowserUrl(input: string): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 4096) {
    throw new Error('Enter a valid HTTP or HTTPS website address.');
  }
  const value = input.trim();
  // URL() otherwise repairs several malformed URLs and accepts control characters.
  if (/[\s\\\u0000-\u001f\u007f]/u.test(value) || value.startsWith('//')) {
    throw new Error('Enter a valid HTTP or HTTPS website address.');
  }
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  const localWithPort = /^(?:localhost|[\w.-]+\.[\w.-]+|\d{1,3}(?:\.\d{1,3}){3}):\d+(?:[/?#]|$)/i.test(value);
  const candidate = !hasScheme || localWithPort ? `https://${value}` : value;
  if (!/^https?:\/\/[^/]/i.test(candidate)) throw new Error('Only valid HTTP and HTTPS websites can be opened.');
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw new Error('Enter a valid HTTP or HTTPS website address.'); }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.origin === 'null') {
    throw new Error('Website addresses cannot contain embedded credentials.');
  }
  return parsed.href;
}

type DocumentRequest = { kind: 'read' | 'validate'; token: string; fieldId?: string };
type DocumentSnapshot = { title: string; text: string; fields: BrowserSnapshot['fields']; valid: boolean };

/** Runs only in the browser. Never reads input values, cookies, storage, or frames. */
export function inspectBrowserDocument(request: DocumentRequest): DocumentSnapshot {
  const attribute = 'data-lucentcue-field';
  const sensitive = /(?:pass(?:word|code)?|secret|token|api[\s_-]*key|one[\s_-]*time|\botp\b|\bpin\b|\bcvv\b|\bcvc\b|\bcc-|credit|debit|payment|billing|iban|routing|bank[\s_-]*account|social[\s_-]*security|\bssn\b|security[\s_-]*(?:code|answer)|username|login|sign[\s_-]*in|sign[\s_-]*up|card[\s_-]?(?:number|holder)|\bcard\b)/i;
  const permittedTypes = new Set(['text', 'search', 'email', 'url', 'tel']);
  const visible = (element: Element): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || element.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    }
    return element.getClientRects().length > 0;
  };
  const label = (element: HTMLElement): string => {
    const labels = 'labels' in element ? (element as HTMLInputElement).labels : null;
    const labelledBy = (element.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent || '').join(' ');
    return (element.getAttribute('aria-label') || labelledBy || Array.from(labels || []).map(item => item.textContent).join(' ') ||
      element.getAttribute('placeholder') || element.getAttribute('name') || element.id || 'Text field').replace(/\s+/g, ' ').trim().slice(0, 180);
  };
  const protectedContainer = (element: Element): boolean => {
    const container = element.closest('form,[role="dialog"]');
    if (!container) return false;
    if (sensitive.test([container.id, container.getAttribute('name'), container.getAttribute('aria-label')].join(' '))) return true;
    return Array.from(container.querySelectorAll('input')).some(input => input.type !== 'hidden' && (input.type === 'password' || sensitive.test([
      input.id, input.name, input.autocomplete, input.getAttribute('aria-label'), input.getAttribute('placeholder'),
    ].join(' '))));
  };
  const allowed = (element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLElement => {
    if (!visible(element) || protectedContainer(element) || element.getAttribute('aria-disabled') === 'true' || element.getAttribute('aria-readonly') === 'true') return false;
    const signature = [label(element), element.id, element.getAttribute('name'), element.getAttribute('autocomplete')].join(' ');
    if (sensitive.test(signature)) return false;
    if (element instanceof HTMLInputElement) return permittedTypes.has(element.type) && !element.disabled && !element.readOnly;
    if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
    return element.isContentEditable && element.getAttribute('contenteditable') !== 'false';
  };
  const result: DocumentSnapshot = { title: document.title.slice(0, 300), text: '', fields: [], valid: false };
  if (request.kind === 'validate') {
    // IDs are generated in Node, not derived from page content.
    const field = document.querySelector(`[${attribute}="${request.fieldId}"]`);
    result.valid = Boolean(field && allowed(field));
    return result;
  }
  document.querySelectorAll(`[${attribute}]`).forEach(element => element.removeAttribute(attribute));
  for (const element of document.querySelectorAll('input,textarea,[contenteditable]')) {
    if (result.fields.length >= 50) break;
    if (!allowed(element)) continue;
    // Nested contenteditable children share their parent's editing surface.
    if (element.parentElement?.closest('[contenteditable="true"],[contenteditable=""]')) continue;
    const id = `${request.token}-${result.fields.length}`;
    element.setAttribute(attribute, id);
    result.fields.push({ id, label: label(element), type: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase(), value: '' });
  }
  if (!document.body) return result;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const snippets: string[] = [];
  let length = 0;
  let visited = 0;
  while (walker.nextNode() && length < 12_000 && ++visited <= 50_000) {
    const parent = walker.currentNode.parentElement;
    if (!parent || !visible(parent) || protectedContainer(parent) || parent.closest('script,style,noscript,template,input,textarea,select,[contenteditable],iframe')) continue;
    const text = walker.currentNode.textContent?.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const snippet = text.slice(0, 12_000 - length);
    snippets.push(snippet);
    length += snippet.length + 1;
  }
  result.text = snippets.join('\n').slice(0, 12_000);
  return result;
}

interface FieldReference { page: Page; frame: Frame; url: string; revision: number; locator: Locator; element: ElementHandle }
export interface BrowserDependencies {
  launch(profilePath: string): Promise<BrowserContext>;
  createId?: () => string;
}

const defaults: BrowserDependencies = {
  async launch(profilePath) {
    const { chromium } = await import('playwright');
    return chromium.launchPersistentContext(profilePath, {
      headless: false, viewport: null, acceptDownloads: false, chromiumSandbox: true,
      timeout: 30_000,
    });
  },
};

/** A visible, separate Chromium profile. Only the UI invokes these operations. */
export function createBrowserController(
  profilePath = join(tmpdir(), 'lucentcue-browser-profile'),
  dependencies: BrowserDependencies = defaults,
): BrowserController {
  let context: BrowserContext | undefined;
  let launching: Promise<BrowserContext> | undefined;
  let lastPage: Page | undefined;
  let revision = 0;
  const references = new Map<string, FieldReference>();
  const watched = new WeakSet<Page>();
  const invalidate = () => {
    revision++;
    for (const reference of references.values()) void reference.element.dispose().catch(() => {});
    references.clear();
  };
  const watchPage = (page: Page) => {
    if (watched.has(page)) return;
    watched.add(page);
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) invalidate(); });
    page.on('close', () => { invalidate(); if (lastPage === page) lastPage = undefined; });
    // Playwright's focus emulation obscures which tab the user actually selected.
    void context?.newCDPSession(page).then(async session => {
      try { await session.send('Emulation.setFocusEmulationEnabled', { enabled: false }); }
      finally { await session.detach(); }
    }).catch(() => { /* A tab may close while its focus observation is configured. */ });
  };
  const ensureContext = async (): Promise<BrowserContext> => {
    if (context) return context;
    if (!launching) {
      launching = dependencies.launch(resolve(profilePath)).then(created => {
        context = created;
        created.on('close', () => {
          if (context === created) { context = undefined; lastPage = undefined; invalidate(); }
        });
        created.on('page', watchPage);
        created.pages().forEach(watchPage);
        return created;
      }).catch(() => {
        throw new Error('Could not launch the assistant browser. Run npm run browser:install, close any other LucentCue browser using this profile, and try again.');
      }).finally(() => { launching = undefined; });
    }
    return launching;
  };
  const activePage = async (): Promise<Page> => {
    if (!context) throw new Error(CLOSED);
    const pages = context.pages().filter(page => !page.isClosed());
    const observations = await Promise.all(pages.map(async page => {
      try { return { page, ...await page.evaluate(() => ({ visible: document.visibilityState === 'visible', focused: document.hasFocus() })) }; }
      catch { return { page, visible: false, focused: false }; }
    }));
    const visible = observations.filter(item => item.visible);
    const chosen = visible.find(item => item.focused)?.page || visible.find(item => item.page === lastPage)?.page || visible.at(-1)?.page;
    if (!chosen) throw new Error(pages.length ? 'Select a visible website tab in the assistant browser, then try again.' : CLOSED);
    lastPage = chosen;
    return chosen;
  };

  const controller: BrowserController = {
    async open(input) {
      const url = normalizeBrowserUrl(input);
      invalidate();
      const browser = await ensureContext();
      let page: Page;
      try { page = await activePage(); }
      catch { page = browser.pages().find(candidate => !candidate.isClosed()) || await browser.newPage(); }
      watchPage(page);
      lastPage = page;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.bringToFront();
      } catch {
        throw new Error('The website did not finish opening. Check the address and connection; you can review the browser and try Read page.');
      }
    },
    async read() {
      invalidate();
      const page = await activePage();
      const url = normalizeBrowserUrl(page.url());
      const version = revision;
      const token = (dependencies.createId || randomUUID)();
      if (!/^[a-zA-Z0-9-]+$/.test(token)) throw new Error('Could not create a browser snapshot.');
      try {
        const snapshot = await page.evaluate<DocumentSnapshot, DocumentRequest>(inspectBrowserDocument, { kind: 'read', token });
        for (const field of snapshot.fields.slice(0, FIELD_LIMIT)) {
          const locator = page.locator(`[${FIELD_ATTRIBUTE}="${field.id}"]`);
          const element = await locator.elementHandle({ timeout: 2_000 });
          if (element) references.set(field.id, { page, frame: page.mainFrame(), url, revision: version, locator, element });
        }
        if (version !== revision || page.url() !== url || page.isClosed()) { invalidate(); throw new Error(STALE); }
        return { url, title: snapshot.title, text: snapshot.text.slice(0, TEXT_LIMIT), fields: snapshot.fields.filter(field => references.has(field.id)).map(field => ({ ...field, value: '' })) };
      } catch (error) {
        invalidate();
        if (error instanceof Error && error.message === STALE) throw error;
        throw new Error('Could not read this page. Select an HTTP or HTTPS website tab and try again.');
      }
    },
    async fill(fieldId, text) {
      if (typeof text !== 'string' || text.length > 20_000) throw new Error('Field text must contain at most 20,000 characters.');
      const reference = references.get(fieldId);
      if (!reference) throw new Error(STALE);
      const page = await activePage();
      if (page !== reference.page || page.isClosed() || page.mainFrame() !== reference.frame || page.url() !== reference.url || revision !== reference.revision) {
        invalidate(); throw new Error(STALE);
      }
      try {
        const inspection = await page.evaluate<DocumentSnapshot, DocumentRequest>(inspectBrowserDocument, { kind: 'validate', token: '', fieldId });
        const sameElement = await reference.locator.evaluate((element, original) => element === original, reference.element, { timeout: 2_000 });
        if (!inspection.valid || !sameElement || revision !== reference.revision) throw new Error(STALE);
        // The retained node prevents re-targeting to a replacement field during a rerender.
        await reference.element.fill(text, { timeout: 4_000 });
      } catch {
        invalidate(); throw new Error(STALE);
      }
      invalidate(); // Every fill needs an explicit selection from a fresh read.
    },
    async close() {
      invalidate();
      const browser = context || await launching;
      context = undefined;
      lastPage = undefined;
      if (browser) await browser.close();
    },
  };
  // Keep overlapping UI requests from sharing or invalidating partial snapshots.
  let pending: Promise<void> = Promise.resolve();
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation);
    pending = result.then(() => {}, () => {});
    return result;
  };
  return {
    open: url => run(() => controller.open(url)),
    read: () => run(() => controller.read()),
    fill: (fieldId, text) => run(() => controller.fill(fieldId, text)),
    close: () => run(() => controller.close()),
  };
}
