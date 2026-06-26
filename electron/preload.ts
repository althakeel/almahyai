import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('almahy', {
  auth: {
    syncFirebaseUser: (firebaseUid: string, email: string, displayName: string) =>
      ipcRenderer.invoke('auth:syncFirebaseUser', firebaseUid, email, displayName),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
  },
  keys: {
    save: (openaiKey: string | null, geminiKey: string | null) =>
      ipcRenderer.invoke('keys:save', openaiKey, geminiKey),
    status: () => ipcRenderer.invoke('keys:status'),
    testOpenai: (apiKey: string) => ipcRenderer.invoke('keys:testOpenai', apiKey),
    testGemini: (apiKey: string) => ipcRenderer.invoke('keys:testGemini', apiKey),
  },
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    create: (name: string) => ipcRenderer.invoke('workspace:create', name),
  },
  conversation: {
    list: (workspaceId: string) => ipcRenderer.invoke('conversation:list', workspaceId),
    create: (workspaceId: string, title: string, provider: 'openai' | 'gemini', model: string) =>
      ipcRenderer.invoke('conversation:create', workspaceId, title, provider, model),
    rename: (conversationId: string, title: string) =>
      ipcRenderer.invoke('conversation:rename', conversationId, title),
    delete: (conversationId: string) => ipcRenderer.invoke('conversation:delete', conversationId),
  },
  messages: {
    list: (conversationId: string) => ipcRenderer.invoke('messages:list', conversationId),
  },
  chat: {
    send: (conversationId: string, message: string, provider: 'openai' | 'gemini', model: string) =>
      ipcRenderer.invoke('chat:send', conversationId, message, provider, model),
  },
  models: {
    list: () => ipcRenderer.invoke('models:list'),
  },
});
