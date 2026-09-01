import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const META = "https://open.api.nexon.com/static/fconline/meta";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, ".catalog-seed.sql");
const now = new Date().toISOString();

const json = async path => {
  const response = await fetch(`${META}/${path}`);
  if (!response.ok) throw new Error(`${path} 다운로드 실패 (${response.status})`);
  return response.json();
};
const quote = value => `'${String(value ?? "").replaceAll("'", "''")}'`;
const hash = rows => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const chunks = (rows, size = 200) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
const statements = [];

const [playerSource, positionSource, divisionSource, seasonSource] = await Promise.all([
  json("spid.json"), json("spposition.json"), json("division.json"), json("seasonid.json"),
]);
const players = playerSource.map(row => ({ id: Number(row.id), name: row.name }));
const positions = positionSource.map(row => ({ id: Number(row.spposition), name: row.desc }));
const divisions = divisionSource.map(row => ({ id: Number(row.divisionId), name: row.divisionName }));
const seasons = seasonSource.map(row => ({ id: Number(row.seasonId), name: row.className, imageUrl: row.seasonImg ?? "" }));

statements.push("PRAGMA defer_foreign_keys = true;");
for (const group of chunks(players)) statements.push(`INSERT INTO players (sp_id,name,name_search,season_id,first_seen_at,updated_at) VALUES ${group.map(row => `(${row.id},${quote(row.name)},${quote(row.name.toLocaleLowerCase("ko-KR"))},${Math.floor(row.id / 1_000_000)},${quote(now)},${quote(now)})`).join(",")} ON CONFLICT(sp_id) DO UPDATE SET name=excluded.name,name_search=excluded.name_search,season_id=excluded.season_id,updated_at=excluded.updated_at;`);
for (const group of chunks(seasons)) statements.push(`INSERT INTO seasons (season_id,name,image_url,first_seen_at,updated_at) VALUES ${group.map(row => `(${row.id},${quote(row.name)},${quote(row.imageUrl)},${quote(now)},${quote(now)})`).join(",")} ON CONFLICT(season_id) DO UPDATE SET name=excluded.name,image_url=excluded.image_url,updated_at=excluded.updated_at;`);
for (const group of chunks(positions)) statements.push(`INSERT INTO positions (position_id,name,updated_at) VALUES ${group.map(row => `(${row.id},${quote(row.name)},${quote(now)})`).join(",")} ON CONFLICT(position_id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at;`);
for (const group of chunks(divisions)) statements.push(`INSERT INTO divisions (division_id,name,updated_at) VALUES ${group.map(row => `(${row.id},${quote(row.name)},${quote(now)})`).join(",")} ON CONFLICT(division_id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at;`);
for (const [key, rows] of [["players", players], ["seasons", seasons], ["positions", positions], ["divisions", divisions]]) statements.push(`INSERT INTO catalog_state (catalog_key,content_hash,last_checked_at,last_success_at,item_count,new_item_count,new_items_json,error_message) VALUES (${quote(key)},${quote(hash(rows))},${quote(now)},${quote(now)},${rows.length},0,'[]',NULL) ON CONFLICT(catalog_key) DO UPDATE SET content_hash=excluded.content_hash,last_checked_at=excluded.last_checked_at,last_success_at=excluded.last_success_at,item_count=excluded.item_count,new_item_count=0,new_items_json='[]',error_message=NULL;`);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${statements.join("\n")}\n`);
console.log(JSON.stringify({ output, players: players.length, seasons: seasons.length, positions: positions.length, divisions: divisions.length, updatedAt: now }));
