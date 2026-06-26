import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import http from 'http';
import { startStaticServer } from './static-server';
import {
  initDatabase,
  ensureFirebaseUser,
  getUserById,
  saveApiKeys,
  getApiKeysStatus,
  getWorkspaces,
  createWorkspace,
  getConversations,
  createConversation,
  updateConversationTitle,
  deleteConversation,
  getMessages,
} from './database';
import {
  sendChatMessage,
  testOpenAIKey,
  testGeminiKey,
  OPENAI_MODELS,
  GEMINI_MODELS,
} from './ai-service';

let mainWindow: BrowserWindow | null = null;
let currentUserId: string | null = null;
let staticServer: http.Server | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Almahy AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:almahy',
    },
    autoHideMenuBar: true,
    backgroundColor: '#212121',
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const distPath = path.join(__dirname, '../dist');
    const { server, port } = await startStaticServer(distPath);
    staticServer = server;
    await mainWindow.loadURL(`http://localhost:${port}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpc(): void {
  ipcMain.handle(
    'auth:syncFirebaseUser',
    async (_e, firebaseUid: string, email: string, displayName: string) => {
      try {
        const user = ensureFirebaseUser(firebaseUid, email, displayName);
        currentUserId = user.id;
        return { success: true, user };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to sync user';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('auth:logout', async () => {
    currentUserId = null;
    return { success: true };
  });

  ipcMain.handle('auth:getCurrentUser', async () => {
    if (!currentUserId) return null;
    return getUserById(currentUserId);
  });

  ipcMain.handle('keys:save', async (_e, openaiKey: string | null, geminiKey: string | null) => {
    if (!currentUserId) return { success: false, error: 'Not logged in' };
    saveApiKeys(currentUserId, { openaiKey, geminiKey });
    return { success: true };
  });

  ipcMain.handle('keys:status', async () => {
    if (!currentUserId) return { hasOpenai: false, hasGemini: false };
    return getApiKeysStatus(currentUserId);
  });

  ipcMain.handle('keys:testOpenai', async (_e, apiKey: string) => {
    const valid = await testOpenAIKey(apiKey);
    return { valid };
  });

  ipcMain.handle('keys:testGemini', async (_e, apiKey: string) => {
    const valid = await testGeminiKey(apiKey);
    return { valid };
  });

  ipcMain.handle('workspace:list', async () => {
    if (!currentUserId) return [];
    return getWorkspaces(currentUserId);
  });

  ipcMain.handle('workspace:create', async (_e, name: string) => {
    if (!currentUserId) return null;
    return createWorkspace(currentUserId, name);
  });

  ipcMain.handle('conversation:list', async (_e, workspaceId: string) => {
    return getConversations(workspaceId);
  });

  ipcMain.handle(
    'conversation:create',
    async (_e, workspaceId: string, title: string, provider: 'openai' | 'gemini', model: string) => {
      return createConversation(workspaceId, title, provider, model);
    }
  );

  ipcMain.handle('conversation:rename', async (_e, conversationId: string, title: string) => {
    updateConversationTitle(conversationId, title);
    return { success: true };
  });

  ipcMain.handle('conversation:delete', async (_e, conversationId: string) => {
    deleteConversation(conversationId);
    return { success: true };
  });

  ipcMain.handle('messages:list', async (_e, conversationId: string) => {
    return getMessages(conversationId);
  });

  ipcMain.handle('chat:send', async (_e, conversationId: string, message: string, provider: 'openai' | 'gemini', model: string) => {
    if (!currentUserId) return { success: false, error: 'Not logged in' };
    try {
      const response = await sendChatMessage({
        userId: currentUserId,
        conversationId,
        message,
        provider,
        model,
      });
      return { success: true, ...response };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Chat failed';
      return { success: false, error };
    }
  });

  ipcMain.handle('models:list', async () => {
    return { openai: OPENAI_MODELS, gemini: GEMINI_MODELS };
  });
}

app.whenReady().then(async () => {
  initDatabase();
  setupIpc();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('before-quit', () => {
  staticServer?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
