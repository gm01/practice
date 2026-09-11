import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ClientErrorEvent } from "../../../shared/contracts";
import { enqueueBounded } from "../../../shared/clientTelemetry";

export type SearchItem = { nickname: string; searchedAt: string; favorite: boolean };
export type UpgradeHistoryItem = {
  id: string;
  spId: number;
  name: string;
  seasonName: string;
  imageUrl: string;
  fromGrade: number;
  toGrade: number;
  success: boolean;
  probability: number;
  boost: number;
  defended?: boolean;
  createdAt: string;
};
export type UpgradeStats = { attempts: number; successes: number };

const SEARCHES = "fconline.searches.v1";
const PLAYER_FAVORITES = "fconline.player-favorites.v1";
const CLIENT_ERRORS = "fconline.client-errors.v1";
const UPGRADE_HISTORY = "fconline.upgrade-history.v1";
const UPGRADE_STATS = "fconline.upgrade-stats.v1";

export async function loadSearches(): Promise<SearchItem[]> {
  try {
    const value = await AsyncStorage.getItem(SEARCHES);
    const rows = value ? JSON.parse(value) as SearchItem[] : [];
    return rows.sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.searchedAt.localeCompare(a.searchedAt));
  } catch { return []; }
}

export async function rememberSearch(nickname: string): Promise<SearchItem[]> {
  const rows = await loadSearches();
  const previous = rows.find((row) => row.nickname === nickname);
  const next = [{ nickname, searchedAt: new Date().toISOString(), favorite: previous?.favorite ?? false }, ...rows.filter((row) => row.nickname !== nickname)].slice(0, 20);
  await AsyncStorage.setItem(SEARCHES, JSON.stringify(next));
  return next;
}

export async function toggleFavorite(nickname: string): Promise<SearchItem[]> {
  const rows = await loadSearches();
  const next = rows.map((row) => row.nickname === nickname ? { ...row, favorite: !row.favorite } : row)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.searchedAt.localeCompare(a.searchedAt));
  await AsyncStorage.setItem(SEARCHES, JSON.stringify(next));
  return next;
}

export async function removeSearch(nickname: string): Promise<SearchItem[]> {
  const next = (await loadSearches()).filter((row) => row.nickname !== nickname);
  await AsyncStorage.setItem(SEARCHES, JSON.stringify(next));
  return next;
}

export async function loadPlayerFavorites(): Promise<number[]> {
  try { return JSON.parse(await AsyncStorage.getItem(PLAYER_FAVORITES) ?? "[]") as number[]; } catch { return []; }
}

export async function togglePlayerFavorite(spId: number): Promise<number[]> {
  const current = await loadPlayerFavorites();
  const next = current.includes(spId) ? current.filter(id => id !== spId) : [spId, ...current];
  await AsyncStorage.setItem(PLAYER_FAVORITES, JSON.stringify(next));
  return next;
}

export async function loadClientErrors(): Promise<ClientErrorEvent[]> {
  try { return JSON.parse(await AsyncStorage.getItem(CLIENT_ERRORS) ?? "[]") as ClientErrorEvent[]; } catch { return []; }
}

export async function queueClientError(event: ClientErrorEvent) {
  await AsyncStorage.setItem(CLIENT_ERRORS, JSON.stringify(enqueueBounded(await loadClientErrors(), event)));
}

export async function saveClientErrors(events: ClientErrorEvent[]) {
  await AsyncStorage.setItem(CLIENT_ERRORS, JSON.stringify(events.slice(-20)));
}

export async function loadUpgradeHistory(): Promise<UpgradeHistoryItem[]> {
  try { return JSON.parse(await AsyncStorage.getItem(UPGRADE_HISTORY) ?? "[]") as UpgradeHistoryItem[]; } catch { return []; }
}

export async function loadUpgradeStats(): Promise<UpgradeStats> {
  try {
    const stored = await AsyncStorage.getItem(UPGRADE_STATS);
    if (stored) return JSON.parse(stored) as UpgradeStats;
  } catch { /* Existing history is used for migration below. */ }
  const history = await loadUpgradeHistory();
  return { attempts: history.length, successes: history.filter(item => item.success).length };
}

export async function rememberUpgrade(item: UpgradeHistoryItem) {
  return rememberUpgrades([item]);
}

export async function rememberUpgrades(items: UpgradeHistoryItem[]) {
  const [history, stats] = await Promise.all([loadUpgradeHistory(), loadUpgradeStats()]);
  const nextHistory = [...items].reverse().concat(history).slice(0, 100);
  const nextStats = {
    attempts: stats.attempts + items.length,
    successes: stats.successes + items.filter(item => item.success).length,
  };
  await Promise.all([
    AsyncStorage.setItem(UPGRADE_HISTORY, JSON.stringify(nextHistory)),
    AsyncStorage.setItem(UPGRADE_STATS, JSON.stringify(nextStats)),
  ]);
  return { history: nextHistory, stats: nextStats };
}

export async function clearUpgradeHistory() {
  await Promise.all([
    AsyncStorage.removeItem(UPGRADE_HISTORY),
    AsyncStorage.removeItem(UPGRADE_STATS),
  ]);
}
