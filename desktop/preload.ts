import { contextBridge, ipcRenderer } from 'electron';
import type { Attachment, ChatEvent, DesktopAPI, WindowMode } from '../shared/types';

const api: DesktopAPI = {
  getState: () => ipcRenderer.invoke('app:state'),
  saveSettings: (settings) => ipcRenderer.invoke('app:settings', settings),
  setKey: (provider, key) => ipcRenderer.invoke('app:key', provider, key),
  getModels: (mode, provider) => ipcRenderer.invoke('app:models', mode, provider),
  startChat: (request) => ipcRenderer.invoke('chat:start', request),
  cancelChat: (id) => ipcRenderer.invoke('chat:cancel', id),
  onChat(callback) {
    const listener = (_event: Electron.IpcRendererEvent, event: ChatEvent) => callback(event);
    ipcRenderer.on('chat:event', listener);
    return () => ipcRenderer.removeListener('chat:event', listener);
  },
  captureScreen: () => ipcRenderer.invoke('app:capture'),
  onCapture(callback) {
    const listener = (_event: Electron.IpcRendererEvent, attachment: Attachment) =>
      callback(attachment);
    ipcRenderer.on('app:captured', listener);
    return () => ipcRenderer.removeListener('app:captured', listener);
  },
  onNewConversation(callback) {
    const listener = () => callback();
    ipcRenderer.on('app:new-conversation', listener);
    return () => ipcRenderer.removeListener('app:new-conversation', listener);
  },
  saveConversations: (conversations) => ipcRenderer.invoke('app:history', conversations),
  exportConversation: (conversation) => ipcRenderer.invoke('app:export', conversation),
  copyText: (text) => ipcRenderer.invoke('app:copy', text),
  setWindowMode: (mode) => ipcRenderer.invoke('app:window-mode:set', mode),
  onWindowMode(callback) {
    const listener = (_event: Electron.IpcRendererEvent, mode: WindowMode) => callback(mode);
    ipcRenderer.on('app:window-mode', listener);
    return () => ipcRenderer.removeListener('app:window-mode', listener);
  },
  hide: () => ipcRenderer.invoke('app:hide'),
  minimize: () => ipcRenderer.invoke('app:minimize'),
  quit: () => ipcRenderer.invoke('app:quit'),
  openExternal: (url) => ipcRenderer.invoke('app:external', url),
  browserOpen: (url) => ipcRenderer.invoke('browser:open', url),
  browserInstall: () => ipcRenderer.invoke('browser:install'),
  browserRead: () => ipcRenderer.invoke('browser:read'),
  browserFill: (fieldId, text) => ipcRenderer.invoke('browser:fill', fieldId, text),
  browserClose: () => ipcRenderer.invoke('browser:close'),
};
contextBridge.exposeInMainWorld('desktop', api);
