import type { PlayerCatalogStatus } from "../../../shared/contracts";

export type CatalogPlayer = { id: number; name: string };
export type CatalogPosition = { id: number; name: string };
export type CatalogDivision = { id: number; name: string };
export type CatalogSeason = { id: number; name: string; imageUrl: string };
export type CatalogTeamColor = { id: number; name: string; level: number };
export type CatalogSnapshot = {
  players: CatalogPlayer[];
  positions: CatalogPosition[];
  divisions: CatalogDivision[];
  seasons: CatalogSeason[];
  teamColors: CatalogTeamColor[];
};

export type StoredMetadata = {
  players: Map<number, string>;
  positions: Map<number, string>;
  divisions: Map<number, string>;
  seasons: Map<number, string>;
  seasonImages: Map<number, string>;
};

type StateRow = {
  catalog_key: string;
  content_hash: string;
  last_checked_at: string | null;
  last_success_at: string | null;
  item_count: number;
  new_item_count: number;
  new_items_json: string;
  error_message: string | null;
};

const CHUNK_SIZE = 100;
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

function chunks<T>(rows: T[], size = CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function state(db: D1Database, key: string) {
  return db.prepare("SELECT * FROM catalog_state WHERE catalog_key = ?").bind(key).first<StateRow>();
}

async function writeState(db: D1Database, key: string, hash: string, checkedAt: string, count: number, newItems: number[], newItemCount: number, error: string | null) {
  await db.prepare(`INSERT INTO catalog_state (catalog_key, content_hash, last_checked_at, last_success_at, item_count, new_item_count, new_items_json, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(catalog_key) DO UPDATE SET content_hash=excluded.content_hash, last_checked_at=excluded.last_checked_at,
      last_success_at=CASE WHEN excluded.error_message IS NULL THEN excluded.last_success_at ELSE catalog_state.last_success_at END,
      item_count=excluded.item_count, new_item_count=excluded.new_item_count, new_items_json=excluded.new_items_json,
      error_message=excluded.error_message`)
    .bind(key, hash, checkedAt, error ? null : checkedAt, count, newItemCount, JSON.stringify(newItems), error).run();
}

async function batch(db: D1Database, statements: D1PreparedStatement[]) {
  for (const group of chunks(statements)) await db.batch(group);
}

async function existingIds(db: D1Database, table: "players" | "seasons", idColumn: "sp_id" | "season_id") {
  const rows = await db.prepare(`SELECT ${idColumn} AS id FROM ${table}`).all<{ id: number }>();
  return new Set((rows.results ?? []).map(row => Number(row.id)));
}

export async function syncCatalogSnapshot(db: D1Database, snapshot: CatalogSnapshot, now = new Date().toISOString()) {
  const groups = [
    { key: "players", rows: snapshot.players },
    { key: "seasons", rows: snapshot.seasons },
    { key: "team_colors", rows: snapshot.teamColors },
    { key: "positions", rows: snapshot.positions },
    { key: "divisions", rows: snapshot.divisions },
  ] as const;
  const hashes = new Map<string, string>();
  for (const group of groups) hashes.set(group.key, await digest(group.rows));
  const currentStates = new Map<string, StateRow | null>();
  for (const group of groups) currentStates.set(group.key, await state(db, group.key));
  const hadPlayers = Boolean(currentStates.get("players"));
  const hadSeasons = Boolean(currentStates.get("seasons"));
  const playerIds = !hadPlayers || currentStates.get("players")?.content_hash === hashes.get("players") ? new Set<number>() : await existingIds(db, "players", "sp_id");
  const seasonIds = !hadSeasons || currentStates.get("seasons")?.content_hash === hashes.get("seasons") ? new Set<number>() : await existingIds(db, "seasons", "season_id");
  const newPlayerIds = hadPlayers ? snapshot.players.filter(row => !playerIds.has(row.id)).map(row => row.id) : [];
  const newSeasonIds = hadSeasons ? snapshot.seasons.filter(row => !seasonIds.has(row.id)).map(row => row.id) : [];

  if (currentStates.get("players")?.content_hash !== hashes.get("players")) {
    await batch(db, snapshot.players.map(row => db.prepare(`INSERT INTO players (sp_id, name, name_search, season_id, first_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(sp_id) DO UPDATE SET name=excluded.name, name_search=excluded.name_search,
      season_id=excluded.season_id, updated_at=excluded.updated_at`).bind(row.id, row.name, row.name.toLocaleLowerCase("ko-KR"), Math.floor(row.id / 1_000_000), now, now)));
  }
  if (currentStates.get("seasons")?.content_hash !== hashes.get("seasons")) {
    await batch(db, snapshot.seasons.map(row => db.prepare(`INSERT INTO seasons (season_id, name, image_url, first_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(season_id) DO UPDATE SET name=excluded.name, image_url=excluded.image_url, updated_at=excluded.updated_at`)
      .bind(row.id, row.name, row.imageUrl, now, now)));
  }
  if (currentStates.get("team_colors")?.content_hash !== hashes.get("team_colors")) {
    await batch(db, snapshot.teamColors.map(row => db.prepare(`INSERT INTO team_colors (team_color_id, name, level, first_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(team_color_id) DO UPDATE SET name=excluded.name, level=excluded.level, updated_at=excluded.updated_at`)
      .bind(row.id, row.name, row.level, now, now)));
  }
  if (currentStates.get("positions")?.content_hash !== hashes.get("positions")) {
    await batch(db, snapshot.positions.map(row => db.prepare(`INSERT INTO positions (position_id, name, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(position_id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`).bind(row.id, row.name, now)));
  }
  if (currentStates.get("divisions")?.content_hash !== hashes.get("divisions")) {
    await batch(db, snapshot.divisions.map(row => db.prepare(`INSERT INTO divisions (division_id, name, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(division_id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`).bind(row.id, row.name, now)));
  }

  for (const group of groups) {
    const newItems = group.key === "players" ? newPlayerIds : group.key === "seasons" ? newSeasonIds : [];
    await writeState(db, group.key, hashes.get(group.key) ?? "", now, group.rows.length, newItems.slice(0, 100), newItems.length, null);
  }
  return { newPlayerCount: newPlayerIds.length, newSeasonIds, updatedAt: now };
}

export async function markCatalogSyncFailure(db: D1Database, error: unknown, now = new Date().toISOString()) {
  const message = error instanceof Error ? error.message.slice(0, 500) : "알 수 없는 동기화 오류";
  const current = await state(db, "players");
  await writeState(db, "players", current?.content_hash ?? "", now, current?.item_count ?? 0, [], current?.new_item_count ?? 0, message);
}

export async function loadStoredMetadata(db: D1Database): Promise<StoredMetadata | null> {
  const [players, positions, divisions, seasons] = await Promise.all([
    db.prepare("SELECT sp_id, name FROM players").all<{ sp_id: number; name: string }>(),
    db.prepare("SELECT position_id, name FROM positions").all<{ position_id: number; name: string }>(),
    db.prepare("SELECT division_id, name FROM divisions").all<{ division_id: number; name: string }>(),
    db.prepare("SELECT season_id, name, image_url FROM seasons").all<{ season_id: number; name: string; image_url: string }>(),
  ]);
  if (!players.results?.length || !seasons.results?.length) return null;
  return {
    players: new Map(players.results.map(row => [Number(row.sp_id), row.name])),
    positions: new Map((positions.results ?? []).map(row => [Number(row.position_id), row.name])),
    divisions: new Map((divisions.results ?? []).map(row => [Number(row.division_id), row.name])),
    seasons: new Map(seasons.results.map(row => [Number(row.season_id), row.name])),
    seasonImages: new Map(seasons.results.map(row => [Number(row.season_id), row.image_url])),
  };
}

export async function loadStoredTeamColors(db: D1Database) {
  const result = await db.prepare("SELECT team_color_id, name, level FROM team_colors ORDER BY name, team_color_id").all<{ team_color_id: number; name: string; level: number }>();
  return (result.results ?? []).map(row => ({ id: Number(row.team_color_id), name: row.name, level: Number(row.level) }));
}

export async function catalogStatus(db: D1Database, source: PlayerCatalogStatus["source"] = "d1"): Promise<PlayerCatalogStatus> {
  const rows = await db.prepare("SELECT * FROM catalog_state WHERE catalog_key IN ('players','seasons','team_colors')").all<StateRow>();
  const states = new Map((rows.results ?? []).map(row => [row.catalog_key, row]));
  const player = states.get("players"), season = states.get("seasons"), teamColor = states.get("team_colors");
  const updatedAt = [player?.last_success_at, season?.last_success_at, teamColor?.last_success_at].filter(Boolean).sort().at(0) ?? null;
  const checkedAt = [player?.last_checked_at, season?.last_checked_at, teamColor?.last_checked_at].filter(Boolean).sort().at(-1) ?? null;
  const newSeasons = (() => { try { return JSON.parse(season?.new_items_json ?? "[]") as number[]; } catch { return []; } })();
  return {
    updatedAt,
    checkedAt,
    source,
    stale: !updatedAt || Date.now() - Date.parse(updatedAt) > STALE_AFTER_MS,
    playerCount: Number(player?.item_count ?? 0),
    seasonCount: Number(season?.item_count ?? 0),
    teamColorCount: Number(teamColor?.item_count ?? 0),
    newSeasonIds: newSeasons,
    newPlayerCount: Number(player?.new_item_count ?? 0),
  };
}

export async function savePlayerFacts(db: D1Database, spId: number, grade: number, facts: unknown, now = new Date().toISOString()) {
  await db.prepare(`INSERT INTO player_facts (sp_id, grade, facts_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(sp_id, grade) DO UPDATE SET facts_json=excluded.facts_json, updated_at=excluded.updated_at`)
    .bind(spId, grade, JSON.stringify(facts), now).run();
}

export async function loadPlayerFacts<T>(db: D1Database, spId: number, grade: number): Promise<T | null> {
  const row = await db.prepare("SELECT facts_json FROM player_facts WHERE sp_id = ? AND grade = ?").bind(spId, grade).first<{ facts_json: string }>();
  if (!row) return null;
  try { return JSON.parse(row.facts_json) as T; } catch { return null; }
}

export async function saveTeamColorPlayers(db: D1Database, teamColorId: number, playerIds: number[], now = new Date().toISOString()) {
  const statements: D1PreparedStatement[] = [db.prepare("DELETE FROM team_color_players WHERE team_color_id = ?").bind(teamColorId)];
  statements.push(...playerIds.map(spId => db.prepare("INSERT INTO team_color_players (team_color_id, sp_id, updated_at) VALUES (?, ?, ?)").bind(teamColorId, spId, now)));
  await batch(db, statements);
}

export async function storedPlayerIds(db: D1Database, input: { query: string; seasons: number[]; teamColorId?: number; offset: number; limit: number }) {
  const where: string[] = [], bindings: Array<string | number> = [];
  if (input.query) { where.push("p.name_search LIKE ?"); bindings.push(`%${input.query.toLocaleLowerCase("ko-KR")}%`); }
  if (input.seasons.length) { where.push(`p.season_id IN (${input.seasons.map(() => "?").join(",")})`); bindings.push(...input.seasons); }
  const join = input.teamColorId === undefined ? "" : "JOIN team_color_players tcp ON tcp.sp_id = p.sp_id";
  if (input.teamColorId !== undefined) { where.push("tcp.team_color_id = ?"); bindings.push(input.teamColorId); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM players p ${join} ${clause}`).bind(...bindings).first<{ count: number }>();
  const result = await db.prepare(`SELECT p.sp_id FROM players p ${join} ${clause} ORDER BY p.season_id DESC, p.name LIMIT ? OFFSET ?`)
    .bind(...bindings, input.limit, input.offset).all<{ sp_id: number }>();
  return { ids: (result.results ?? []).map(row => Number(row.sp_id)), total: Number(count?.count ?? 0) };
}
