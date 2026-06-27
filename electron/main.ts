import { app, BrowserWindow } from 'electron';
import path from 'path';
import http from 'http';
import { startStaticServer } from './static-server';

let mainWindow: BrowserWindow | null = null;
let staticServer: http.Server | null = null;

if (app.isPackaged) {
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
  app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');
}

app.disableHardwareAcceleration();

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 520,
    title: 'Orion AI',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:orion',
      backgroundThrottling: true,
      spellcheck: false,
      enableWebSQL: false,
      v8CacheOptions: 'code',
    },
    autoHideMenuBar: true,
    backgroundColor: '#212121',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 520,
      height: 720,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: 'persist:orion',
      },
    },
  }));

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

app.whenReady().then(async () => {
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
