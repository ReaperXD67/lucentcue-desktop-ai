import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS } from '../shared/types';
import {
  DesktopStorage,
  HISTORY_MAX_BYTES,
  historyWithoutImages,
  sanitizeHistoryPayload,
  validateMessages,
  validateSettings,
  validateWindowMode,
} from '../desktop/storage';
import type { EncryptionAdapter } from '../desktop/storage';

// Test cipher is only a deterministic adapter; production always injects Electron safeStorage.
const secure: EncryptionAdapter = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`cipher:${Buffer.from(value).toString('base64')}`),
  decryptString: (value) => Buffer.from(value.toString().slice(7), 'base64').toString(),
};
const conversation = {
  id: 'c1',
  title: 'Example',
  updatedAt: Date.now(),
  messages: [
    {
      id: 'm1',
      role: 'user' as const,
      content: 'Read this',
      attachments: [{ id: 'a', name: 'Screen', dataUrl: 'data:image/png;base64,AA==' }],
    },
  ],
};
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lucentcue-storage-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('credential storage', () => {
  it('persists encrypted keys and returns status without plaintext', async () => {
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    await storage.setKey('openrouter', 'sk-secret-key');
    expect(await readFile(join(directory, 'keys.json'), 'utf8')).not.toContain('sk-secret-key');
    expect(storage.keyStatus()).toEqual({ openrouter: true, openai: false, gemini: false });
    const reloaded = new DesktopStorage(directory, secure);
    await reloaded.init();
    expect(reloaded.key('openrouter')).toBe('sk-secret-key');
    await reloaded.setKey('openrouter', '');
    expect(reloaded.keyStatus().openrouter).toBe(false);
  });
  it.each([false, true])(
    'keeps keys in memory without secure encryption (basic_text=%s)',
    async (basic) => {
      const storage = new DesktopStorage(
        directory,
        {
          ...secure,
          isEncryptionAvailable: () => basic,
          getSelectedStorageBackend: () => 'basic_text',
        },
        'linux',
      );
      await storage.init();
      await storage.setKey('openrouter', 'memory-key');
      expect(storage.key('openrouter')).toBe('memory-key');
      expect(storage.notice).toContain('memory');
      await expect(readFile(join(directory, 'keys.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      const reloaded = new DesktopStorage(directory, secure);
      await reloaded.init();
      expect(reloaded.keyStatus().openrouter).toBe(false);
    },
  );
});

describe('history policy', () => {
  it('does not write history when disabled and strips screenshot bytes when enabled', async () => {
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    await storage.saveSettings({ ...DEFAULT_SETTINGS, saveHistory: false });
    await storage.saveConversations([conversation]);
    await expect(readFile(join(directory, 'history.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await storage.saveSettings({ ...DEFAULT_SETTINGS, saveHistory: true });
    await storage.saveConversations([conversation]);
    const disk = await readFile(join(directory, 'history.json'), 'utf8');
    expect(disk).not.toContain('data:image');
    expect(disk).toContain('image not saved');
    const reloaded = new DesktopStorage(directory, secure);
    await reloaded.init();
    expect(reloaded.conversations[0].messages[0].attachments).toBeUndefined();
    await reloaded.saveSettings({ ...DEFAULT_SETTINGS, saveHistory: false });
    expect(reloaded.conversations).toEqual([]);
    await expect(readFile(join(directory, 'history.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('bounds stored conversations', () =>
    expect(historyWithoutImages(Array(60).fill(conversation))).toHaveLength(40));
  it('bounds history before validation and discards screenshots without validating their count or payload', () => {
    const rows = Array.from({ length: 45 }, (_, index) => ({
      ...conversation,
      id: `c${index}`,
      messages: Array.from({ length: 105 }, (_, messageIndex) => ({
        id: `m${messageIndex}`,
        role: 'user',
        content: `Text ${messageIndex}`,
        attachments: Array(12).fill({ dataUrl: 'not an accepted API image' }),
      })),
    }));
    const sanitized = sanitizeHistoryPayload(rows);
    expect(sanitized).toHaveLength(40);
    expect(sanitized[0].messages).toHaveLength(100);
    expect(sanitized[0].messages[0].id).toBe('m5');
    expect(sanitized[0].messages.at(-1)?.id).toBe('m104');
    expect(sanitized[0].messages.every((message) => !message.attachments)).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain('not an accepted API image');
    expect(sanitized[0].messages[0].content).toContain('image not saved');
  });
  it('keeps the most recent messages within the text budget and never makes omission notes exceed it', () => {
    const recent = sanitizeHistoryPayload([
      {
        ...conversation,
        messages: Array.from({ length: 4 }, (_, index) => ({
          ...conversation.messages[0],
          id: `m${index}`,
          content: String(index).repeat(70_000),
        })),
      },
    ]);
    expect(recent[0].messages.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
    expect(() => validateMessages(recent[0].messages)).not.toThrow();
    const maximum = sanitizeHistoryPayload([
      {
        ...conversation,
        messages: [100_000, 100_000, 40_000].map((length, index) => ({
          ...conversation.messages[0],
          id: `m${index}`,
          content: 'x'.repeat(length),
        })),
      },
    ]);
    expect(maximum[0].messages.map((message) => message.content.length)).toEqual([
      100_000, 100_000, 40_000,
    ]);
    expect(() => validateMessages(maximum[0].messages)).not.toThrow();
  });
  it('rejects malformed text safely without replacing valid saved history', async () => {
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    await storage.saveSettings({ ...DEFAULT_SETTINGS, saveHistory: true });
    await storage.saveConversations([conversation]);
    const before = await readFile(join(directory, 'history.json'), 'utf8');
    await expect(
      storage.saveConversations([
        {
          ...conversation,
          messages: [{ ...conversation.messages[0], content: 'x'.repeat(100_001) }],
        },
      ]),
    ).rejects.toThrow('too long');
    expect(await readFile(join(directory, 'history.json'), 'utf8')).toBe(before);
  });
  it('saves and reloads the exact UTF-8 byte boundary, rejecting an additional multibyte character', async () => {
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    await storage.saveSettings({ ...DEFAULT_SETTINGS, saveHistory: true });
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: `unicode-${index}`,
      title: 'Unicode',
      updatedAt: 1,
      messages: [100_000, 100_000, 40_000].map((length, messageIndex) => ({
        id: `m${messageIndex}`,
        role: 'user' as const,
        content: 'अ'.repeat(length),
      })),
    }));
    rows.push({
      id: 'boundary',
      title: 'Boundary',
      updatedAt: 1,
      messages: [{ id: 'last', role: 'user', content: '' }],
    });
    const baseline = sanitizeHistoryPayload(rows);
    const available =
      HISTORY_MAX_BYTES - Buffer.byteLength(JSON.stringify(baseline, null, 2), 'utf8');
    expect(available).toBeGreaterThan(0);
    baseline.at(-1)!.messages[0].content =
      'अ'.repeat(Math.floor(available / 3)) + 'x'.repeat(available % 3);
    const serialized = JSON.stringify(baseline, null, 2);
    expect(serialized.length).toBeLessThan(HISTORY_MAX_BYTES / 2);
    expect(Buffer.byteLength(serialized, 'utf8')).toBe(HISTORY_MAX_BYTES);
    await storage.saveConversations(baseline);
    const reloaded = new DesktopStorage(directory, secure);
    await reloaded.init();
    expect(reloaded.conversations).toHaveLength(12);
    expect(reloaded.notice).toBeUndefined();
    expect(reloaded.conversations.at(-1)?.messages[0].content.length).toBe(
      baseline.at(-1)!.messages[0].content.length,
    );
    baseline.at(-1)!.messages[0].content += 'अ';
    await expect(storage.saveConversations(baseline)).rejects.toThrow('history is full');
    expect(Buffer.byteLength(await readFile(join(directory, 'history.json'), 'utf8'), 'utf8')).toBe(
      HISTORY_MAX_BYTES,
    );
  });
});

describe('IPC payload validators', () => {
  it('defaults legacy appearance to dark and opaque without changing saved shortcuts', async () => {
    const { theme: _theme, companionOpacity: _opacity, ...legacy } = DEFAULT_SETTINGS;
    expect(validateSettings(legacy)).toMatchObject({ theme: 'dark', companionOpacity: 1 });
    await writeFile(
      join(directory, 'settings.json'),
      JSON.stringify({ ...legacy, shortcut: 'Control+Shift+Space', settingsVersion: 2 }),
    );
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    expect(storage.settings).toMatchObject({
      theme: 'dark',
      companionOpacity: 1,
      shortcut: 'Control+Shift+Space',
    });
  });
  it.each(['dark', 'light', 'system'] as const)(
    'persists %s appearance and companion opacity across restarts',
    async (theme) => {
      const storage = new DesktopStorage(directory, secure);
      await storage.init();
      await storage.saveSettings(
        validateSettings({ ...DEFAULT_SETTINGS, theme, companionOpacity: 0.85 }),
      );
      const reloaded = new DesktopStorage(directory, secure);
      await reloaded.init();
      expect(reloaded.settings).toMatchObject({ theme, companionOpacity: 0.85 });
    },
  );
  it('rejects invalid themes and opacity values instead of hiding or disabling the window', () => {
    for (const theme of ['', 'transparent', null, {}, false])
      expect(() => validateSettings({ ...DEFAULT_SETTINGS, theme })).toThrow('appearance');
    for (const companionOpacity of [0, 0.8499, 1.0001, NaN, Infinity, '0.9', null, {}])
      expect(() => validateSettings({ ...DEFAULT_SETTINGS, companionOpacity })).toThrow(
        'opacity must be between',
      );
    expect(validateSettings({ ...DEFAULT_SETTINGS, companionOpacity: 0.93 }).companionOpacity).toBe(
      0.93,
    );
  });
  it('accepts only the two supported native window modes', () => {
    expect(validateWindowMode('companion')).toBe('companion');
    expect(validateWindowMode('workspace')).toBe('workspace');
    for (const invalid of ['hidden', '', null, {}, ['companion'], true])
      expect(() => validateWindowMode(invalid)).toThrow('companion or workspace');
  });
  it('normalizes shortcuts and forces free mode to OpenRouter', () => {
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, provider: 'openai', shortcut: 'ctrl+shift+r' }),
    ).toMatchObject({ provider: 'openrouter', shortcut: 'Control+Shift+R' });
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, captureShortcut: 'Alt+W' })).toThrow(
      'different',
    );
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, shortcut: 'R' })).toThrow('shortcut');
  });
  it('defaults the new conversation shortcut and rejects normalized collisions across all three actions', () => {
    const { newConversationShortcut: _removed, ...legacy } = DEFAULT_SETTINGS;
    expect(validateSettings(legacy).newConversationShortcut).toBe('Alt+N');
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        newConversationShortcut: 'shift+ctrl+n',
      }).newConversationShortcut,
    ).toBe('Control+Shift+N');
    for (const shortcuts of [
      { newConversationShortcut: 'option+w' },
      { newConversationShortcut: 'shift+alt+s' },
      { shortcut: 'ctrl+shift+n', newConversationShortcut: 'shift+control+N' },
      { captureShortcut: 'shift+ctrl+n', newConversationShortcut: 'control+shift+N' },
    ])
      expect(() => validateSettings({ ...DEFAULT_SETTINGS, ...shortcuts })).toThrow('different');
    for (const invalid of ['', 'N', null, {}, 'Alt+Alt+N'])
      expect(() =>
        validateSettings({ ...DEFAULT_SETTINGS, newConversationShortcut: invalid }),
      ).toThrow('hortcut');
  });
  it.each([
    {
      shortcut: 'Alt+N',
      captureShortcut: 'Alt+S',
      expected: 'Alt+Shift+N',
    },
    {
      shortcut: 'Alt+W',
      captureShortcut: 'Alt+N',
      expected: 'Alt+Shift+N',
    },
    {
      shortcut: 'Alt+N',
      captureShortcut: 'Alt+Shift+N',
      expected: 'Alt+Control+N',
    },
  ])(
    'adds only an unused new-conversation shortcut to legacy settings: %o',
    async ({ shortcut, captureShortcut, expected }) => {
      const { newConversationShortcut: _removed, ...legacy } = DEFAULT_SETTINGS;
      const oldSettings = {
        ...legacy,
        mode: 'byok',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4.1-flash',
        shortcut,
        captureShortcut,
        theme: 'light',
        companionOpacity: 0.85,
        captureProtection: true,
        showTrayIcon: false,
        settingsVersion: 2,
      };
      const first = new DesktopStorage(directory, secure);
      await first.init();
      await first.setKey('openrouter', 'test-key-preserved');
      await writeFile(join(directory, 'settings.json'), JSON.stringify(oldSettings));
      const upgraded = new DesktopStorage(directory, secure);
      await upgraded.init();
      const { settingsVersion: _version, ...preservedSettings } = oldSettings;
      expect(upgraded.settings).toMatchObject({
        ...preservedSettings,
        newConversationShortcut: expected,
      });
      expect(upgraded.key('openrouter')).toBe('test-key-preserved');
      expect(upgraded.notice).toContain(`New conversation uses ${expected}`);
      const persisted = JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8'));
      expect(persisted).toMatchObject({
        ...preservedSettings,
        newConversationShortcut: expected,
      });
      expect(persisted.settingsVersion).toBe(3);
      const reloaded = new DesktopStorage(directory, secure);
      await reloaded.init();
      expect(reloaded.settings).toEqual(upgraded.settings);
      expect(reloaded.keyStatus().openrouter).toBe(true);
    },
  );
  it('persists an explicit custom new conversation shortcut without changing other preferences', async () => {
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    const settings = validateSettings({
      ...DEFAULT_SETTINGS,
      shortcut: 'Alt+R',
      captureShortcut: 'Alt+S',
      newConversationShortcut: 'Control+Shift+N',
      captureProtection: true,
    });
    await storage.saveSettings(settings);
    const reloaded = new DesktopStorage(directory, secure);
    await reloaded.init();
    expect(reloaded.settings).toEqual(settings);
  });
  it('defaults the visible tray on for legacy settings and persists an explicit disabled choice', async () => {
    const { showTrayIcon: _removed, ...legacy } = DEFAULT_SETTINGS;
    expect(validateSettings(legacy).showTrayIcon).toBe(true);
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, showTrayIcon: 'false' })).toThrow(
      'must be true or false',
    );
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    await storage.saveSettings({ ...DEFAULT_SETTINGS, showTrayIcon: false });
    const reloaded = new DesktopStorage(directory, secure);
    await reloaded.init();
    expect(reloaded.settings.showTrayIcon).toBe(false);
  });
  it('migrates the former default to Alt+W once while preserving subsequent user choices', async () => {
    const { showTrayIcon: _removed, ...legacy } = DEFAULT_SETTINGS;
    await writeFile(
      join(directory, 'settings.json'),
      JSON.stringify({ ...legacy, shortcut: 'alt+r' }),
    );
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    expect(storage.settings.shortcut).toBe('Alt+W');
    expect(storage.settings.showTrayIcon).toBe(true);
    const migrated = JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8'));
    expect(migrated.settingsVersion).toBe(3);
    await storage.saveSettings({ ...storage.settings, shortcut: 'Alt+R' });
    const reloaded = new DesktopStorage(directory, secure);
    await reloaded.init();
    expect(reloaded.settings.shortcut).toBe('Alt+R');
  });
  it.each([
    { shortcut: 'Control+Shift+Space', captureShortcut: 'Alt+Shift+S' },
    { shortcut: 'Alt+R', captureShortcut: 'Alt+W' },
  ])('preserves custom legacy shortcuts without introducing a collision: %o', async (shortcuts) => {
    await writeFile(
      join(directory, 'settings.json'),
      JSON.stringify({ ...DEFAULT_SETTINGS, ...shortcuts }),
    );
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    expect(storage.settings).toMatchObject(shortcuts);
    expect(() => validateSettings(storage.settings)).not.toThrow();
  });
  it('migrates old settings with capture protection off and rejects non-boolean values', async () => {
    const { captureProtection: _removed, ...legacy } = DEFAULT_SETTINGS;
    expect(validateSettings(legacy).captureProtection).toBe(false);
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, captureProtection: true }).captureProtection,
    ).toBe(true);
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, captureProtection: 'true' })).toThrow(
      'must be true or false',
    );
    const storage = new DesktopStorage(directory, secure);
    await storage.init();
    await storage.saveSettings({ ...DEFAULT_SETTINGS, captureProtection: true });
    const reloaded = new DesktopStorage(directory, secure);
    await reloaded.init();
    expect(reloaded.settings.captureProtection).toBe(true);
  });
  it('rejects roles, remote attachments, and oversized messages', () => {
    expect(() => validateMessages([{ ...conversation.messages[0], role: 'system' }])).toThrow(
      'role',
    );
    expect(() =>
      validateMessages([
        {
          ...conversation.messages[0],
          attachments: [{ id: 'a', name: 'Bad', dataUrl: 'https://tracker.example/image.png' }],
        },
      ]),
    ).toThrow('Only PNG');
    expect(() =>
      validateMessages([{ ...conversation.messages[0], content: 'x'.repeat(100_001) }]),
    ).toThrow('too long');
  });
});
