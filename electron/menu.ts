import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { checkForUpdates, RELEASES_URL } from './updater';

/**
 * Renderer actions are invoked with `executeJavaScript(..., userGesture=true)` so that
 * File System Access pickers (showOpenFilePicker) get the transient user activation they require.
 */
export function rendererAction(win: BrowserWindow, id: string) {
  return win.webContents.executeJavaScript(`window.djkadoActions?.${id}?.()`, true).catch(() => {});
}

export function buildMenu(win: BrowserWindow) {
  const isMac = process.platform === 'darwin';
  const act = (id: string) => () => void rendererAction(win, id);

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { label: 'Settings…', accelerator: 'Cmd+,', click: act('settings') },
              { label: 'Check for Updates…', click: () => void checkForUpdates().then(() => rendererAction(win, 'settings')) },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Files…', accelerator: 'CmdOrCtrl+O', click: act('openFiles') },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: act('openFolder') },
        { type: 'separator' },
        { label: 'Record Master Mix', accelerator: 'Shift+B', click: act('record') },
        { type: 'separator' },
        ...(isMac ? [{ role: 'close' as const }] : [{ label: 'Settings…', accelerator: 'Ctrl+,', click: act('settings') }, { type: 'separator' as const }, { role: 'quit' as const }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: 'View',
      submenu: [
        { label: '2 Decks', accelerator: 'CmdOrCtrl+1', click: act('layout2') },
        { label: '4 Decks', accelerator: 'CmdOrCtrl+2', click: act('layout4') },
        { type: 'separator' },
        { label: 'Toggle Sampler', accelerator: 'CmdOrCtrl+M', click: act('toggleSampler') },
        { label: 'Toggle Library', accelerator: 'CmdOrCtrl+L', click: act('toggleLibrary') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { role: 'reload' as const }, { role: 'toggleDevTools' as const }]),
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }])] },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'Shift+/', click: act('shortcuts') },
        { type: 'separator' },
        ...(!isMac ? [{ label: 'Check for Updates…', click: () => void checkForUpdates().then(() => rendererAction(win, 'settings')) }] : []),
        { label: 'DJKado on GitHub', click: () => void shell.openExternal('https://github.com/koneb71/djkado') },
        { label: 'Releases', click: () => void shell.openExternal(RELEASES_URL) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
