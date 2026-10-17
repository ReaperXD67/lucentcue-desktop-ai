import { DEFAULT_SETTINGS, type AppState, type ChatEvent, type DesktopAPI, type Provider } from '../shared/types';

export const isPreview = !window.desktop;
let previewState: AppState = { settings: { ...DEFAULT_SETTINGS }, keys: { openrouter: false, openai: false, gemini: false }, conversations: [], captureProtectionSupported: false, captureProtectionNotice: 'Capture privacy is available in supported desktop builds.' };
const listeners = new Set<(event: ChatEvent) => void>();
const desktopOnly = async (): Promise<never> => { throw new Error('Open the desktop app to use this feature. This browser view is an interface preview.'); };
const preview: DesktopAPI = {
  async getState() { return structuredClone(previewState); },
  async saveSettings(settings) { previewState = { ...previewState, settings }; return settings; },
  setKey: async (_provider: Provider, _key: string) => desktopOnly(),
  async getModels() { return [{ id: 'openrouter/free', name: 'Free models router', vision: true, contextLength: 0, free: true }]; },
  async startChat(request) {
    queueMicrotask(() => {
      for (const listener of listeners) listener({ id: request.id, type: 'error', error: 'This is an interface preview. Run the desktop app and add a provider key in Settings to get real answers.' });
    });
  },
  async cancelChat() {},
  onChat(callback) { listeners.add(callback); return () => { listeners.delete(callback); }; },
  captureScreen: desktopOnly,
  onCapture() { return () => {}; },
  async saveConversations(conversations) { if (previewState.settings.saveHistory) previewState.conversations = conversations; },
  exportConversation: desktopOnly,
  async hide() {}, async minimize() {},
  async openExternal(url) { if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer'); },
  browserOpen: desktopOnly, browserInstall: desktopOnly, browserRead: desktopOnly, browserFill: desktopOnly, browserClose: desktopOnly,
};
export const api = window.desktop ?? preview;
