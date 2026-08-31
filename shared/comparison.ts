export type ComparisonGrades = [number, number];

export function setComparisonGrade(current: ComparisonGrades, index: 0 | 1, value: number): ComparisonGrades {
  const grade = Math.min(13, Math.max(1, Math.round(value)));
  return index === 0 ? [grade, current[1]] : [current[0], grade];
}
