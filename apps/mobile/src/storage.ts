import AsyncStorage from "@react-native-async-storage/async-storage";

export type SearchItem = { nickname: string; searchedAt: string; favorite: boolean };

const SEARCHES = "fconline.searches.v1";

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
