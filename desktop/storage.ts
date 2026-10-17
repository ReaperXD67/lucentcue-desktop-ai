import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS } from '../shared/types';
import type { Attachment, Conversation, Message, Provider, Settings } from '../shared/types';

export const PROVIDERS: Provider[] = ['openrouter', 'openai', 'gemini'];
export const HISTORY_MAX_BYTES = 8_000_000;
const SCREENSHOT_NOTE = '\n\n[Screenshot attached; image not saved to history.]';
export interface EncryptionAdapter {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object.');
  return value as Record<string, unknown>;
};
export function stringValue(value: unknown, label: string, limit = 200, empty = false): string {
  if (typeof value !== 'string' || value.length > limit || (!empty && !value.trim()))
    throw new Error(`${label} is invalid or too long.`);
  return value;
}
export function validateProvider(value: unknown): Provider {
  if (!PROVIDERS.includes(value as Provider)) throw new Error('Choose a supported provider.');
  return value as Provider;
}
function shortcut(value: unknown): string {
  const raw = stringValue(value, 'Shortcut', 80);
  const aliases: Record<string, string> = {
    alt: 'Alt',
    option: 'Alt',
    ctrl: 'Control',
    control: 'Control',
    shift: 'Shift',
    cmd: 'Command',
    command: 'Command',
    cmdorctrl: 'CommandOrControl',
    commandorcontrol: 'CommandOrControl',
    super: 'Super',
    meta: 'Super',
  };
  const pieces = raw.split('+');
  const key = pieces.pop() || '';
  if (
    !pieces.length ||
    !/^(?:[a-z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Escape|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete)$/i.test(
      key,
    )
  )
    throw new Error('Use a shortcut such as Alt+R, Control+Shift+Space, or Command+J.');
  const modifiers = pieces.map((piece) => aliases[piece.toLowerCase()]);
  if (modifiers.some((item) => !item) || new Set(modifiers).size !== modifiers.length)
    throw new Error('Shortcut modifiers are invalid.');
  const namedKeys = [
    'Space',
    'Tab',
    'Escape',
    'Up',
    'Down',
    'Left',
    'Right',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'Insert',
    'Delete',
  ];
  const normalizedKey =
    namedKeys.find((item) => item.toLowerCase() === key.toLowerCase()) || key.toUpperCase();
  return [...modifiers.sort(), normalizedKey].join('+');
}
export function validateSettings(value: unknown): Settings {
  const input = record(value);
  if (input.mode !== 'free' && input.mode !== 'byok')
    throw new Error('Choose a valid access mode.');
  const provider = validateProvider(input.provider);
  const model = stringValue(input.model, 'Model', 200);
  if (!/^[a-zA-Z0-9_./:+-]+$/.test(model)) throw new Error('Model identifier is invalid.');
  for (const name of ['alwaysOnTop', 'saveHistory'])
    if (typeof input[name] !== 'boolean') throw new Error(`${name} must be true or false.`);
  const captureProtection =
    input.captureProtection === undefined
      ? DEFAULT_SETTINGS.captureProtection
      : input.captureProtection;
  if (typeof captureProtection !== 'boolean')
    throw new Error('captureProtection must be true or false.');
  const toggle = shortcut(input.shortcut);
  const capture = shortcut(input.captureShortcut);
  if (toggle.toLowerCase() === capture.toLowerCase())
    throw new Error('Toggle and screenshot shortcuts must be different.');
  return {
    mode: input.mode,
    provider: input.mode === 'free' ? 'openrouter' : provider,
    model,
    shortcut: toggle,
    captureShortcut: capture,
    alwaysOnTop: input.alwaysOnTop as boolean,
    captureProtection,
    saveHistory: input.saveHistory as boolean,
    systemPrompt: stringValue(input.systemPrompt, 'System prompt', 12_000),
  };
}

function validateAttachment(value: unknown): Attachment {
  const input = record(value);
  const dataUrl = stringValue(input.dataUrl, 'Screenshot', 8_000_000);
  if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(dataUrl))
    throw new Error('Only PNG, JPEG, or WebP screenshot attachments are accepted.');
  return {
    id: stringValue(input.id, 'Attachment ID'),
    name: stringValue(input.name, 'Attachment name'),
    dataUrl,
  };
}

export function validateMessages(value: unknown): Message[] {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new Error('A conversation must contain between 1 and 100 messages.');
  let total = 0;
  let imageBytes = 0;
  let imageCount = 0;
  const result = value.map((item) => {
    const input = record(item);
    if (input.role !== 'user' && input.role !== 'assistant')
      throw new Error('Message role is invalid.');
    const content = stringValue(input.content, 'Message', 100_000, true);
    total += content.length;
    let attachments: Attachment[] | undefined;
    if (input.attachments !== undefined) {
      if (
        !Array.isArray(input.attachments) ||
        input.attachments.length > 3 ||
        (input.role !== 'user' && input.attachments.length)
      )
        throw new Error('Only user messages can include up to three screenshots.');
      attachments = input.attachments.map(validateAttachment);
      for (const attachment of attachments) {
        imageBytes += attachment.dataUrl.length;
        imageCount++;
      }
    }
    return {
      id: stringValue(input.id, 'Message ID'),
      role: input.role as 'user' | 'assistant',
      content,
      ...(attachments?.length ? { attachments } : {}),
    };
  });
  if (total > 240_000 || imageBytes > 20_000_000 || imageCount > 8)
    throw new Error(
      'This conversation is too large. Start a new conversation or remove older screenshots.',
    );
  return result;
}

export function validateConversation(value: unknown): Conversation {
  const input = record(value);
  if (typeof input.updatedAt !== 'number' || !Number.isFinite(input.updatedAt))
    throw new Error('Conversation timestamp is invalid.');
  return {
    id: stringValue(input.id, 'Conversation ID'),
    title: stringValue(input.title, 'Conversation title', 150),
    updatedAt: input.updatedAt,
    messages:
      Array.isArray(input.messages) && !input.messages.length
        ? []
        : validateMessages(input.messages),
  };
}

/** History has a separate text-only boundary from multimodal API requests. */
export function sanitizeHistoryPayload(value: unknown): Conversation[] {
  if (!Array.isArray(value)) throw new Error('Saved conversations must be a list.');
  return value.slice(0, 40).map((item) => {
    const input = record(item);
    if (!Array.isArray(input.messages))
      throw new Error('Saved conversation messages must be a list.');
    const bounded = input.messages.slice(-100).map((item) => {
      const message = record(item);
      // Do not validate, copy, or persist image data: old screenshot count/size must
      // never prevent saving the text of a conversation.
      return {
        id: message.id,
        role: message.role,
        content: stringValue(message.content, 'Message', 100_000, true),
        hadScreenshot: Array.isArray(message.attachments) && message.attachments.length > 0,
      };
    });
    let total = 0;
    let first = bounded.length;
    for (let index = bounded.length - 1; index >= 0; index--) {
      if (total + bounded[index].content.length > 240_000) break;
      total += bounded[index].content.length;
      first = index;
    }
    const messages = bounded.slice(first).map((message) => {
      const noteFits =
        message.hadScreenshot &&
        message.content.length + SCREENSHOT_NOTE.length <= 100_000 &&
        total + SCREENSHOT_NOTE.length <= 240_000;
      if (noteFits) total += SCREENSHOT_NOTE.length;
      return {
        id: message.id,
        role: message.role,
        content: message.content + (noteFits ? SCREENSHOT_NOTE : ''),
      };
    });
    return validateConversation({ ...input, messages });
  });
}

/** Screenshots are deliberately omitted from disk. */
export function historyWithoutImages(conversations: Conversation[]): Conversation[] {
  return sanitizeHistoryPayload(conversations);
}

async function readJson(path: string, limit: number): Promise<unknown> {
  if ((await stat(path)).size > limit) throw new Error('Stored file exceeds the size limit.');
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function atomicJson(path: string, value: unknown, maxBytes?: number): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  if (maxBytes !== undefined && Buffer.byteLength(serialized, 'utf8') > maxBytes)
    throw new Error('Saved history is full. Delete older conversations first.');
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, serialized, { mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export class DesktopStorage {
  settings: Settings = { ...DEFAULT_SETTINGS };
  conversations: Conversation[] = [];
  private keys: Partial<Record<Provider, string>> = {};
  private encrypted: Partial<Record<Provider, string>> = {};
  private queue: Promise<unknown> = Promise.resolve();
  notice?: string;
  constructor(
    private readonly directory: string,
    private readonly encryption: EncryptionAdapter,
    private readonly platform = process.platform,
  ) {}
  private get secure(): boolean {
    try {
      return (
        this.encryption.isEncryptionAvailable() &&
        !(
          this.platform === 'linux' &&
          this.encryption.getSelectedStorageBackend?.() === 'basic_text'
        )
      );
    } catch {
      return false;
    }
  }
  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      this.settings = validateSettings({
        ...DEFAULT_SETTINGS,
        ...record(await readJson(join(this.directory, 'settings.json'), 100_000)),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.notice = 'Settings could not be read; safe defaults were loaded.';
    }
    if (this.settings.saveHistory) {
      try {
        const rows = await readJson(join(this.directory, 'history.json'), HISTORY_MAX_BYTES);
        this.conversations = sanitizeHistoryPayload(rows);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          this.notice =
            'Saved history could not be read. Your existing file has been left untouched.';
      }
    }
    if (!this.secure) {
      this.notice =
        'OS credential encryption is unavailable. API keys are kept in memory for this session only; configure your OS keychain to save them securely.';
      return;
    }
    try {
      const encrypted = record(await readJson(join(this.directory, 'keys.json'), 100_000));
      for (const provider of PROVIDERS)
        if (typeof encrypted[provider] === 'string') {
          try {
            this.keys[provider] = this.encryption.decryptString(
              Buffer.from(encrypted[provider] as string, 'base64'),
            );
            this.encrypted[provider] = encrypted[provider] as string;
          } catch {
            this.notice =
              'One or more saved API keys could not be unlocked. Enter the key again in Settings.';
          }
        }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.notice = 'Saved API keys could not be read. Enter your keys again in Settings.';
    }
  }
  key(provider: Provider): string {
    return this.keys[provider] || '';
  }
  keyStatus(): Record<Provider, boolean> {
    return {
      openrouter: !!this.keys.openrouter,
      openai: !!this.keys.openai,
      gemini: !!this.keys.gemini,
    };
  }
  private serialized<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(action);
    this.queue = pending.catch(() => undefined);
    return pending;
  }
  saveSettings(settings: Settings): Promise<void> {
    return this.serialized(async () => {
      const previous = this.settings;
      await atomicJson(join(this.directory, 'settings.json'), settings);
      if (!settings.saveHistory) {
        try {
          await unlink(join(this.directory, 'history.json')).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        } catch (error) {
          await atomicJson(join(this.directory, 'settings.json'), previous);
          throw error;
        }
        this.conversations = [];
      }
      this.settings = settings;
    });
  }
  setKey(provider: Provider, key: string): Promise<void> {
    return this.serialized(async () => {
      const next = { ...this.encrypted };
      if (this.secure) {
        if (key) next[provider] = this.encryption.encryptString(key).toString('base64');
        else delete next[provider];
        await atomicJson(join(this.directory, 'keys.json'), next);
        this.encrypted = next;
      } else {
        this.notice =
          'OS credential encryption is unavailable. API keys are kept in memory for this session only.';
        // A changed session-only key must not resurrect an older saved key on restart.
        // Preserve other providers' encrypted records without attempting to unlock them.
        try {
          const persisted = record(await readJson(join(this.directory, 'keys.json'), 100_000));
          delete persisted[provider];
          await atomicJson(join(this.directory, 'keys.json'), persisted);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      if (key) this.keys[provider] = key;
      else delete this.keys[provider];
    });
  }
  saveConversations(conversations: Conversation[]): Promise<void> {
    return this.serialized(async () => {
      if (!this.settings.saveHistory) return;
      const clean = historyWithoutImages(conversations);
      await atomicJson(join(this.directory, 'history.json'), clean, HISTORY_MAX_BYTES);
      this.conversations = clean;
    });
  }
  flush(): Promise<unknown> {
    return this.queue;
  }
}
