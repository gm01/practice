export type ComparisonGrades = [number, number];

export function setComparisonGrade(current: ComparisonGrades, index: 0 | 1, value: number): ComparisonGrades {
  const grade = Math.min(13, Math.max(1, Math.round(value)));
  return index === 0 ? [grade, current[1]] : [current[0], grade];
}

/** Missing values must not participate in ranking or difference calculations. */
export function compareAbility(left: number | undefined, right: number | undefined) {
  const comparable = left !== undefined && right !== undefined && Number.isFinite(left) && Number.isFinite(right);
  const delta = comparable ? left - right : 0;
  return {
    leftWins: comparable && delta > 0,
    rightWins: comparable && delta < 0,
    leftDelta: !comparable || delta === 0 ? "–" : `${delta > 0 ? "+" : ""}${delta}`,
    rightDelta: !comparable || delta === 0 ? "–" : `${delta < 0 ? "+" : ""}${-delta}`,
  };
}
