import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("fcOnline", {
  fetchDashboard: (input: { nickname: string; offset: number; matchType: number }) =>
    ipcRenderer.invoke("dashboard:fetch", input),
  searchPlayers: (filters: { query: string; [key: string]: unknown }) => ipcRenderer.invoke("players:search", filters),
  fetchPlayerFilters: () => ipcRenderer.invoke("players:filters"),
  fetchPlayerDetail: (spId: number, grade: number, options?: { adaptation?: 1 | 5; affiliationId?: number; affiliationLevel?: number; enhancementId?: number; enhancementLevel?: number; featureId?: number }) => ipcRenderer.invoke("players:detail", { spId, grade, options }),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (nickname: string) => ipcRenderer.invoke("settings:save", nickname),
  openLogin: () => ipcRenderer.invoke("login:open"),
  reportClientError: (event: unknown) => ipcRenderer.invoke("telemetry:client-error", event),
  onDiagnostics: (listener: (diagnostics: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, diagnostics: unknown) => listener(diagnostics);
    ipcRenderer.on("diagnostics:update", handler);
    return () => ipcRenderer.removeListener("diagnostics:update", handler);
  },
});
