export type AbilityValue = { label: string; value: number };

export const ABILITY_COLUMNS = [
  [
    "속력", "가속력", "골 결정력", "슛 파워", "중거리 슛", "위치 선정", "발리슛", "페널티 킥",
    "짧은 패스", "시야", "크로스", "긴 패스", "프리킥", "커브", "드리블", "볼 컨트롤", "민첩성",
  ],
  [
    "밸런스", "반응 속도", "대인 수비", "태클", "가로채기", "헤더", "슬라이딩 태클", "몸싸움",
    "스태미너", "적극성", "점프", "침착성", "GK 다이빙", "GK 핸들링", "GK 킥", "GK 반응속도", "GK 위치 선정",
  ],
] as const;

type WeightMap = Record<string, number>;

const POSITION_WEIGHTS: Record<string, WeightMap> = {
  ST: { "골 결정력": 20, "위치 선정": 12, "헤더": 10, "슛 파워": 10, "반응 속도": 10, "볼 컨트롤": 8, "속력": 7, "몸싸움": 6, "가속력": 5, "짧은 패스": 5, "드리블": 4, "중거리 슛": 3 },
  CF: { "볼 컨트롤": 15, "드리블": 12, "골 결정력": 12, "위치 선정": 12, "가속력": 8, "반응 속도": 8, "짧은 패스": 8, "슛 파워": 6, "속력": 6, "중거리 슛": 5, "헤더": 4, "시야": 4 },
  W: { "드리블": 16, "가속력": 15, "속력": 14, "볼 컨트롤": 14, "크로스": 9, "짧은 패스": 9, "위치 선정": 9, "골 결정력": 5, "시야": 5, "반응 속도": 4 },
  AM: { "짧은 패스": 16, "시야": 16, "볼 컨트롤": 13, "드리블": 12, "위치 선정": 9, "반응 속도": 8, "중거리 슛": 6, "골 결정력": 5, "슛 파워": 5, "가속력": 4, "민첩성": 3, "속력": 3 },
  WM: { "크로스": 14, "드리블": 14, "속력": 13, "가속력": 12, "볼 컨트롤": 12, "짧은 패스": 9, "위치 선정": 8, "반응 속도": 7, "시야": 6, "스태미너": 5 },
  CM: { "짧은 패스": 17, "시야": 14, "볼 컨트롤": 13, "긴 패스": 13, "드리블": 7, "반응 속도": 7, "가로채기": 6, "위치 선정": 6, "태클": 5, "스태미너": 5, "중거리 슛": 4, "슛 파워": 3 },
  DM: { "짧은 패스": 14, "가로채기": 14, "태클": 12, "볼 컨트롤": 10, "긴 패스": 10, "반응 속도": 9, "대인 수비": 7, "몸싸움": 6, "스태미너": 6, "적극성": 5, "시야": 4, "가속력": 3 },
  WB: { "크로스": 12, "드리블": 10, "스태미너": 10, "짧은 패스": 10, "볼 컨트롤": 8, "속력": 8, "가속력": 7, "태클": 7, "가로채기": 7, "반응 속도": 6, "위치 선정": 6, "슬라이딩 태클": 5, "시야": 4 },
  FB: { "태클": 13, "슬라이딩 태클": 12, "가로채기": 12, "반응 속도": 8, "대인 수비": 7, "스태미너": 7, "크로스": 7, "볼 컨트롤": 7, "짧은 패스": 6, "속력": 5, "가속력": 5, "헤더": 4, "몸싸움": 4, "적극성": 3 },
  CB: { "태클": 15, "대인 수비": 15, "가로채기": 13, "헤더": 10, "몸싸움": 10, "슬라이딩 태클": 10, "적극성": 8, "반응 속도": 8, "점프": 6, "짧은 패스": 5 },
  SW: { "태클": 14, "가로채기": 14, "대인 수비": 12, "슬라이딩 태클": 10, "반응 속도": 8, "짧은 패스": 8, "몸싸움": 8, "헤더": 7, "적극성": 6, "긴 패스": 5, "점프": 4, "볼 컨트롤": 4 },
  GK: { "GK 다이빙": 21, "GK 핸들링": 21, "GK 위치 선정": 21, "GK 반응속도": 21, "반응 속도": 11, "GK 킥": 5 },
};

function weightKey(position: string) {
  const normalized = position.trim().toUpperCase();
  if (["ST", "LS", "RS"].includes(normalized)) return "ST";
  if (["CF", "LF", "RF", "SS"].includes(normalized)) return "CF";
  if (["LW", "RW"].includes(normalized)) return "W";
  if (["CAM", "LAM", "RAM"].includes(normalized)) return "AM";
  if (["LM", "RM"].includes(normalized)) return "WM";
  if (["CM", "LCM", "RCM"].includes(normalized)) return "CM";
  if (["CDM", "LDM", "RDM"].includes(normalized)) return "DM";
  if (["LWB", "RWB"].includes(normalized)) return "WB";
  if (["LB", "RB"].includes(normalized)) return "FB";
  if (["CB", "LCB", "RCB"].includes(normalized)) return "CB";
  return normalized === "SW" || normalized === "GK" ? normalized : "CM";
}

function weightedScore(abilities: AbilityValue[], weights: WeightMap, training: Record<string, number> = {}) {
  const values = new Map(abilities.map(row => [row.label, row.value + (training[row.label] ?? 0)]));
  return Object.entries(weights).reduce((sum, [label, weight]) => sum + (values.get(label) ?? 0) * weight / 100, 0);
}

/**
 * FC ONLINE does not publish its complete position-weight table. We keep the
 * server-returned OVR as the source of truth and only estimate the local
 * focused-training delta from position weights validated against Data Center
 * ability/OVR pairs.
 */
export function focusedTrainingOvr(position: string, officialOvr: number, abilities: AbilityValue[], training: Record<string, number>) {
  if (!Object.values(training).some(value => value > 0)) return officialOvr;
  const weights = POSITION_WEIGHTS[weightKey(position)];
  const before = weightedScore(abilities, weights);
  const after = weightedScore(abilities, weights, training);
  return officialOvr + Math.round(after) - Math.round(before);
}

export function orderedAbilityColumns<T extends { label: string }>(rows: T[]) {
  const byLabel = new Map(rows.map(row => [row.label, row]));
  const known = new Set<string>(ABILITY_COLUMNS.flat());
  const columns = ABILITY_COLUMNS.map(labels => labels.map(label => byLabel.get(label)).filter((row): row is T => Boolean(row)));
  rows.filter(row => !known.has(row.label)).forEach((row, index) => columns[index % columns.length].push(row));
  return columns;
}
