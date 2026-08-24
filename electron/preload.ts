import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("fcOnline", {
  fetchDashboard: (input: { apiKey: string; nickname: string; offset: number; matchType: number }) =>
    ipcRenderer.invoke("dashboard:fetch", input),
  fetchTrades: (input: { apiKey: string; nickname: string }) => ipcRenderer.invoke("trades:fetch", input),
  fetchRankerStats: (input: { apiKey: string; players: Array<{ id: number; po: number }> }) => ipcRenderer.invoke("ranker:fetch", input),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (nickname: string) => ipcRenderer.invoke("settings:save", nickname),
  openLogin: () => ipcRenderer.invoke("login:open"),
});
