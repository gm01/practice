import { app, BrowserWindow, ipcMain, shell } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  fetchServiceDashboard,
  fetchServicePlayerDetail,
  fetchServicePlayerFilters,
  fetchServicePlayers,
  reportServiceClientError,
  setServiceDiagnosticsListener,
  type PlayerDetailOptions,
  type PlayerSearchFilters,
} from "./serviceApi";
import { validateDashboardInput, validatePlayerDetailInput, validatePlayerSearchFilters } from "./ipcValidation";

const NEXON_LOGIN_URL =
  "https://nxlogin.nexon.com/common/login.aspx?redirect=https%3A%2F%2Ffconline.nexon.com%2Fmain%2Findex";

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#07110d",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = process.env.ELECTRON_RENDERER_URL ?? `file://${join(__dirname, "../renderer/index.html")}`;
    if (!url.startsWith(allowed)) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else window.loadFile(join(__dirname, "../renderer/index.html"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

app.setAboutPanelOptions({
  applicationName: "FC Online Lab",
  applicationVersion: app.getVersion(),
  copyright: "Data based on NEXON Open API",
});

app.whenReady().then(() => {
  setServiceDiagnosticsListener(diagnostics => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("diagnostics:update", diagnostics);
  });
  ipcMain.handle("dashboard:fetch", (_event, input) => {
    const value = validateDashboardInput(input);
    return fetchServiceDashboard(value.nickname, value.offset, value.matchType);
  });
  ipcMain.handle("players:search", (_event, filters: PlayerSearchFilters) => fetchServicePlayers(validatePlayerSearchFilters(filters)));
  ipcMain.handle("players:filters", () => fetchServicePlayerFilters());
  ipcMain.handle("telemetry:client-error", (_event, event) => reportServiceClientError(event));
  ipcMain.handle("players:detail", (_event, input: { spId: number; grade: number; options?: PlayerDetailOptions }) => {
    const value = validatePlayerDetailInput(input);
    return fetchServicePlayerDetail(value.spId, value.grade, value.options);
  });
  ipcMain.handle("settings:load", async () => {
    try {
      return JSON.parse(await readFile(join(app.getPath("userData"), "settings.json"), "utf8"));
    } catch {
      return { nickname: "" };
    }
  });
  ipcMain.handle("settings:save", async (_event, nickname: string) => {
    await writeFile(join(app.getPath("userData"), "settings.json"), JSON.stringify({ nickname: nickname.trim() }, null, 2), "utf8");
  });
  ipcMain.handle("login:open", () => shell.openExternal(NEXON_LOGIN_URL));
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
