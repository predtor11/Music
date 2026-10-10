/**
 * The desktop app's window process. Starts the services in a background Node
 * process (server.ts), then opens the web app in a window with MIDI allowed.
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu, session, shell, utilityProcess, type UtilityProcess } from 'electron';
import { WEB_PORT } from './ports.js';
import { ensureSettingsFile } from './settings-file.js';

const ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
// Electron asks for midiSysex even when the page asks for MIDI without sysex.
const ALLOWED_PERMISSIONS = new Set(['midi', 'midiSysex', 'clipboard-sanitized-write', 'fullscreen']);

let services: UtilityProcess | null = null;
let window: BrowserWindow | null = null;
let quitting = false;

const dataDir = app.getPath('userData');
const settingsFile = join(dataDir, '.env');
const logDir = join(dataDir, 'logs');

let firstRun = false;

const ONLINE_HELP =
  'The app uses the hosted site by default, so you sign in with the same account as the web version and your progress is shared. Nothing needs setting up.\n\nTo keep everything on this computer instead (no account), open the settings file, add the line MUSIC_API_URL=local, then use File > Restart. No secret keys are ever needed.';
  'To sign in and share progress with the web version, open the settings file, set MUSIC_API_URL to the hosted site\'s address (for example https://your-site.vercel.app), add the two public sign-in values (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY), then use File > Restart.\n\nNo secret keys are needed. Left empty, the app keeps working on its own on this computer.';

function showOnlineHelp(): void {
  void dialog
    .showMessageBox({ type: 'info', title: 'Use your online account', message: 'Use your online account', detail: ONLINE_HELP, buttons: ['Open Settings File', 'Close'], defaultId: 0, cancelId: 1 })
    .then((r) => {
      if (r.response === 0) void shell.openPath(settingsFile);
    });
}

function startServices(): Promise<string> {
  mkdirSync(logDir, { recursive: true });
  firstRun = ensureSettingsFile(settingsFile);
  const log = createWriteStream(join(logDir, 'services.log'), { flags: 'w' });

  const child = utilityProcess.fork(join(__dirname, 'server', 'server.mjs'), [], {
    cwd: dataDir,
    serviceName: 'Music Theory Trainer services',
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MUSIC_APP_ROOT: __dirname,
      MUSIC_DATA_DIR: dataDir,
      MUSIC_WEB_DIR: join(__dirname, 'web'),
    },
  });
  services = child;
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);

  return new Promise((resolve, reject) => {
    child.on('message', (message: { type: string; url?: string; message?: string }) => {
      if (message.type === 'ready' && message.url) resolve(message.url);
      if (message.type === 'error') reject(new Error(message.message));
    });
    child.on('exit', (code) => {
      services = null;
      if (quitting) return;
      reject(new Error(`The services stopped (exit code ${code}).`));
      if (window) {
        dialog.showErrorBox('Music Theory Trainer', `The app's services stopped. Restart the app.\n\nDetails are in ${join(logDir, 'services.log')}`);
      }
    });
  });
}

function allowOnlyMidi(): void {
  const fromApp = (url: string | undefined) => !!url && url.startsWith(ORIGIN);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(fromApp(wc.getURL()) && ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => fromApp(origin) && ALLOWED_PERMISSIONS.has(permission));
}

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'Use Online Account...', click: showOnlineHelp },
          { label: 'Open Settings File', click: () => void shell.openPath(settingsFile) },
          { label: 'Open Data Folder', click: () => void shell.openPath(dataDir) },
          { label: 'Restart', click: () => { app.relaunch(); app.quit(); } },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Open Service Log', click: () => void shell.openPath(join(logDir, 'services.log')) },
          { label: `About (version ${app.getVersion()})`, click: () => void dialog.showMessageBox({ message: `Music Theory Trainer ${app.getVersion()}` }) },
        ],
      },
    ]),
  );
}

function openWindow(url: string): void {
  window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: 'Music Theory Trainer',
    backgroundColor: '#07070f',
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Sounds play straight away, like in a tab you've already clicked in.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  window.once('ready-to-show', () => window?.show());
  // Links to other sites open in the normal browser.
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) void shell.openExternal(target);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(ORIGIN)) {
      event.preventDefault();
      if (/^https?:/.test(target)) void shell.openExternal(target);
    }
  });
  window.on('closed', () => (window = null));
  void window.loadURL(url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(async () => {
    allowOnlyMidi();
    buildMenu();
    try {
      openWindow(await startServices());
      if (firstRun) window?.once('ready-to-show', showOnlineHelp);
    } catch (error) {
      dialog.showErrorBox(
        'Music Theory Trainer could not start',
        `${(error as Error).message}\n\nDetails are in ${join(logDir, 'services.log')}`,
      );
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    services?.kill();
  });
}
