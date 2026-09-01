CREATE TABLE IF NOT EXISTS catalog_state (
  catalog_key TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL DEFAULT '',
  last_checked_at TEXT,
  last_success_at TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  new_item_count INTEGER NOT NULL DEFAULT 0,
  new_items_json TEXT NOT NULL DEFAULT '[]',
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS seasons (
  season_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  sp_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_search TEXT NOT NULL,
  season_id INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_name_search ON players(name_search);
CREATE INDEX IF NOT EXISTS idx_players_season_id ON players(season_id);

CREATE TABLE IF NOT EXISTS positions (
  position_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS divisions (
  division_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_colors (
  team_color_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_colors_name ON team_colors(name);

CREATE TABLE IF NOT EXISTS player_facts (
  sp_id INTEGER NOT NULL,
  grade INTEGER NOT NULL,
  facts_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (sp_id, grade)
);

CREATE INDEX IF NOT EXISTS idx_player_facts_updated_at ON player_facts(updated_at);

CREATE TABLE IF NOT EXISTS team_color_players (
  team_color_id INTEGER NOT NULL,
  sp_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_color_id, sp_id)
);

CREATE INDEX IF NOT EXISTS idx_team_color_players_sp_id ON team_color_players(sp_id);
