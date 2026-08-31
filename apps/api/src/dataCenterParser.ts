import { affiliationTeamColorLevel } from "./playerAbility";

export type TeamColorOption = { id: number; level: number; name: string };
export type ParserValidation = {
  success: boolean;
  partial: boolean;
  missingFields: string[];
  signature: string;
};

export function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstMatch(html: string, expression: RegExp, fallback = "") {
  return decodeHtml(expression.exec(html)?.[1] ?? fallback);
}

export function classText(html: string, className: string) {
  return firstMatch(html, new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
}

export function parseAbilities(html: string) {
  const start = html.indexOf('<div class="content_bottom">');
  const scope = start >= 0 ? html.slice(start) : html;
  const rows: Array<{ label: string; value: number }> = [];
  const expression = /<li class="ab"[\s\S]*?<div class="txt">([\s\S]*?)<\/div>\s*<div class="value[^"]*">\s*(\d+)/gi;
  for (const match of scope.matchAll(expression)) rows.push({ label: decodeHtml(match[1]), value: Number(match[2]) });
  return rows.filter((row, index) => row.label && rows.findIndex(candidate => candidate.label === row.label) === index);
}

export function parseSummaryAbilities(html: string) {
  const start = html.indexOf('<div class="content_middle">');
  const end = html.indexOf('<div class="content_bottom">');
  const scope = start >= 0 && end > start ? html.slice(start, end) : "";
  const rows: Array<{ label: string; value: number }> = [];
  const expression = /<li class="ab">\s*<div class="txt">([\s\S]*?)<\/div>\s*<div class="value[^"]*">\s*(\d+)/gi;
  for (const match of scope.matchAll(expression)) rows.push({ label: decodeHtml(match[1]), value: Number(match[2]) });
  return rows.slice(-6);
}

export function parsePositions(html: string) {
  const scope = /<div class="ovr_set">([\s\S]*?)<\/div>\s*<\/div>/.exec(html)?.[1] ?? "";
  const rows: Array<{ position: string; value: number }> = [];
  for (const match of scope.matchAll(/<div class="position\s+([a-z]+)\s+value">\s*(\d+)/gi)) {
    rows.push({ position: match[1].toUpperCase(), value: Number(match[2]) });
  }
  return rows;
}

export function parseTraits(html: string) {
  const scope = /<div class="skill_wrap">([\s\S]*?)<div class="en_selector_wrap">/i.exec(html)?.[1] ?? "";
  return [...scope.matchAll(/<span class="desc">([\s\S]*?)<\/span>/gi)].map(match => decodeHtml(match[1])).filter(Boolean);
}

function parseTeamColorLinks(scope: string, idIndex: number, levelIndex?: number): TeamColorOption[] {
  const rows: TeamColorOption[] = [];
  const expression = /<a[^>]*onclick="DataCenter\.GetPlayerAbility\(([^)]*)\);?"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of scope.matchAll(expression)) {
    const args = match[1].split(",").map(value => Number(value.trim()));
    const id = args[idIndex] ?? 0;
    const level = levelIndex === undefined ? 1 : args[levelIndex] ?? 1;
    const name = decodeHtml(match[2]);
    if (id > 0 && name) rows.push({ id, level, name });
  }
  return rows.filter((row, index) => rows.findIndex(candidate => candidate.id === row.id && candidate.level === row.level) === index);
}

export function parseTeamColorOptions(html: string, seasonName = "") {
  const start = html.indexOf('<div class="teamcolor_selector_wrap">');
  const end = html.indexOf('<div class="ovr_set">', start);
  const scope = start >= 0 ? html.slice(start, end > start ? end : undefined) : "";
  const affiliationStart = scope.indexOf('<div class="tdefault">');
  const featureStart = scope.indexOf('<div class="tspecial">');
  const enhancementScope = scope.slice(0, affiliationStart >= 0 ? affiliationStart : undefined);
  const affiliationScope = affiliationStart >= 0 ? scope.slice(affiliationStart, featureStart >= 0 ? featureStart : undefined) : "";
  const featureScope = featureStart >= 0 ? scope.slice(featureStart) : "";
  return {
    enhancement: parseTeamColorLinks(enhancementScope, 5, 6),
    affiliation: parseTeamColorLinks(affiliationScope, 3, 4).map(option => ({ ...option, level: affiliationTeamColorLevel(option.id, seasonName, option.name) })),
    feature: parseTeamColorLinks(featureScope, 7),
  };
}

export function parseClubCareer(html: string) {
  const scope = /<div class="content data_detail_club">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i.exec(html)?.[1] ?? "";
  const rows: Array<{ years: string; club: string; loan: string }> = [];
  for (const match of scope.matchAll(/<li>[\s\S]*?<div class="td year">([\s\S]*?)<\/div>[\s\S]*?<div class="td club">([\s\S]*?)<\/div>[\s\S]*?<div class="td rent">([\s\S]*?)<\/div>[\s\S]*?<\/li>/gi)) {
    rows.push({ years: decodeHtml(match[1]), club: decodeHtml(match[2]), loan: decodeHtml(match[3]) });
  }
  return rows;
}

export function parseRankerStats(html: string) {
  const scope = /<div class="ranker_record">([\s\S]*?)<div class="view_wrap">/i.exec(html)?.[1] ?? "";
  const labels = ["출전", "득점", "도움", "유효 슈팅", "일반 슈팅", "패스 성공률", "드리블 성공률", "공중볼 경합 성공률", "가로채기", "태클 성공률", "차단 성공률", "선방", "평점"];
  const values = [...scope.matchAll(/<span class="td[^"']*">([\s\S]*?)<\/span>/gi)].map(match => decodeHtml(match[1]));
  return Object.fromEntries(labels.map((label, index) => [label, values[index] ?? "-"]));
}

export function parsePrice(html: string) {
  const current = Number((/<strong\s+alt="([\d,]+)"/i.exec(html)?.[1] ?? "0").replace(/,/g, ""));
  let history: Array<{ date: string; value: number }> = [];
  const jsonText = /var json1\s*=\s*({[\s\S]*?})\s*var option\s*=/i.exec(html)?.[1] ?? "";
  if (jsonText) {
    const timeBlock = /"time"\s*:\s*\[([\s\S]*?)\]/i.exec(jsonText)?.[1] ?? "";
    const valueBlock = /"value"\s*:\s*\[([\s\S]*?)\]/i.exec(jsonText)?.[1] ?? "";
    const dates = [...timeBlock.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    const values = [...valueBlock.matchAll(/"([\d.]+)"/g)].map(match => Number(match[1]));
    history = values.map((value, index) => ({ date: dates[index] ?? "", value })).filter(item => item.date && Number.isFinite(item.value));
  }
  return { current, history: history.slice(-365) };
}

export function validatePlayerAbilityHtml(html: string, requireName = true): ParserValidation {
  const missingFields: string[] = [];
  const name = firstMatch(html, /<div class="name">([\s\S]*?)<\/div>/i);
  const overall = Number(firstMatch(html, /<div class="ovr value">\s*(\d+)/i, "0"));
  const positions = parsePositions(html);
  const abilities = parseAbilities(html);
  if (!name) missingFields.push("name");
  if (overall <= 0) missingFields.push("overall");
  if (!positions.length) missingFields.push("positions");
  if (abilities.length < 10) missingFields.push("abilities");
  if (!classText(html, "height")) missingFields.push("height");
  if (!firstMatch(html, /<div class="etc nation">[\s\S]*?<span class="txt">([\s\S]*?)<\/span>/i)) missingFields.push("nation");
  const required = new Set([...(requireName ? ["name"] : []), "overall", "positions", "abilities"]);
  const requiredMissing = missingFields.filter(field => required.has(field));
  return {
    success: requiredMissing.length === 0,
    partial: requiredMissing.length === 0 && missingFields.length > 0,
    missingFields,
    signature: `ability:${html.includes('content_bottom') ? 1 : 0}:${positions.length}:${abilities.length}`,
  };
}
