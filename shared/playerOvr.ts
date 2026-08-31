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
  ST: { "골 결정력": 18, "위치 선정": 13, "볼 컨트롤": 10, "슛 파워": 10, "헤더": 10, "반응 속도": 8, "드리블": 7, "속력": 5, "몸싸움": 5, "짧은 패스": 5, "가속력": 4, "중거리 슛": 3, "발리슛": 2 },
  CF: { "볼 컨트롤": 15, "드리블": 14, "위치 선정": 13, "골 결정력": 11, "반응 속도": 9, "짧은 패스": 9, "시야": 8, "슛 파워": 5, "속력": 5, "가속력": 5, "중거리 슛": 4, "헤더": 2 },
  W: { "드리블": 16, "볼 컨트롤": 14, "골 결정력": 10, "위치 선정": 9, "짧은 패스": 9, "크로스": 9, "반응 속도": 7, "가속력": 7, "시야": 6, "속력": 6, "중거리 슛": 4, "민첩성": 3 },
  AM: { "짧은 패스": 16, "볼 컨트롤": 15, "시야": 14, "드리블": 13, "위치 선정": 9, "반응 속도": 7, "골 결정력": 7, "중거리 슛": 5, "가속력": 4, "긴 패스": 4, "속력": 3, "민첩성": 3 },
  WM: { "드리블": 15, "볼 컨트롤": 13, "짧은 패스": 11, "크로스": 10, "위치 선정": 8, "반응 속도": 7, "가속력": 7, "시야": 7, "골 결정력": 6, "속력": 6, "스태미너": 5, "긴 패스": 5 },
  CM: { "짧은 패스": 17, "볼 컨트롤": 14, "시야": 13, "긴 패스": 13, "반응 속도": 8, "드리블": 7, "위치 선정": 6, "스태미너": 6, "가로채기": 5, "태클": 5, "중거리 슛": 4, "골 결정력": 2 },
  DM: { "짧은 패스": 14, "가로채기": 14, "태클": 12, "볼 컨트롤": 10, "긴 패스": 10, "대인 수비": 9, "반응 속도": 7, "스태미너": 6, "적극성": 5, "슬라이딩 태클": 5, "시야": 4, "몸싸움": 4 },
  WB: { "가로채기": 12, "크로스": 12, "슬라이딩 태클": 11, "짧은 패스": 10, "스태미너": 10, "태클": 8, "볼 컨트롤": 8, "반응 속도": 8, "대인 수비": 7, "속력": 6, "드리블": 4, "가속력": 4 },
  FB: { "슬라이딩 태클": 14, "가로채기": 12, "태클": 11, "크로스": 9, "스태미너": 8, "반응 속도": 8, "대인 수비": 8, "볼 컨트롤": 7, "짧은 패스": 7, "속력": 7, "가속력": 5, "헤더": 4 },
  CB: { "가로채기": 20, "대인 수비": 14, "몸싸움": 10, "헤더": 10, "슬라이딩 태클": 10, "태클": 10, "적극성": 7, "반응 속도": 5, "짧은 패스": 5, "볼 컨트롤": 4, "점프": 3, "속력": 2 },
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

function fcOnlineRound(value: number) {
  return value - Math.floor(value) >= 0.75 ? Math.ceil(value) : Math.floor(value);
}

export function focusedTrainingWeight(position: string, label: string) {
  return POSITION_WEIGHTS[weightKey(position)][label] ?? 0;
}

export function recommendedFocusedTraining(position: string, abilities: AbilityValue[], limit: number) {
  const available = new Set(abilities.map(row => row.label));
  return Object.entries(POSITION_WEIGHTS[weightKey(position)])
    .filter(([label, weight]) => available.has(label) && weight > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .reduce<Record<string, number>>((result, [label]) => ({ ...result, [label]: 2 }), {});
}

/**
 * FC ONLINE does not publish its complete position-weight table. We keep the
 * server-returned OVR as the source of truth and only estimate the local
 * focused-training delta with community-verified position weights and FC
 * ONLINE's 0.75 rounding threshold.
 */
export function focusedTrainingOvr(position: string, officialOvr: number, abilities: AbilityValue[], training: Record<string, number>) {
  if (!Object.values(training).some(value => value > 0)) return officialOvr;
  const weights = POSITION_WEIGHTS[weightKey(position)];
  const before = weightedScore(abilities, weights);
  const after = weightedScore(abilities, weights, training);
  return officialOvr + fcOnlineRound(after) - fcOnlineRound(before);
}

export function orderedAbilityColumns<T extends { label: string }>(rows: T[]) {
  const byLabel = new Map(rows.map(row => [row.label, row]));
  const known = new Set<string>(ABILITY_COLUMNS.flat());
  const columns = ABILITY_COLUMNS.map(labels => labels.map(label => byLabel.get(label)).filter((row): row is T => Boolean(row)));
  rows.filter(row => !known.has(row.label)).forEach((row, index) => columns[index % columns.length].push(row));
  return columns;
}
