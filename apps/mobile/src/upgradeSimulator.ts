export const FULL_GAUGE_SUCCESS_RATE: Record<number, number> = {
  1: 100,
  2: 81,
  3: 64,
  4: 50,
  5: 26,
  6: 15,
  7: 7,
  8: 4,
  9: 2,
  10: 1,
  11: 0.8,
  12: 0.5,
};

export type UpgradeResult = {
  success: boolean;
  fromGrade: number;
  toGrade: number;
  probability: number;
  boost: number;
};

export function upgradeProbability(grade: number, boost: number) {
  const safeGrade = Math.min(12, Math.max(1, Math.round(grade)));
  const safeBoost = Math.min(5, Math.max(1, Math.round(boost)));
  return Number((FULL_GAUGE_SUCCESS_RATE[safeGrade] * safeBoost / 5).toFixed(2));
}

export function simulateUpgrade(grade: number, boost: number, random = Math.random): UpgradeResult {
  const fromGrade = Math.min(12, Math.max(1, Math.round(grade)));
  const safeBoost = Math.min(5, Math.max(1, Math.round(boost)));
  const probability = upgradeProbability(fromGrade, safeBoost);
  const success = random() * 100 < probability;
  if (success) return { success, fromGrade, toGrade: fromGrade + 1, probability, boost: safeBoost };
  const maximumDrop = fromGrade >= 8 ? 3 : fromGrade >= 5 ? 2 : 1;
  const drop = 1 + Math.floor(random() * maximumDrop);
  return { success, fromGrade, toGrade: Math.max(1, fromGrade - drop), probability, boost: safeBoost };
}
