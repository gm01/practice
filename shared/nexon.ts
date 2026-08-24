export function gameMinute(rawTime: number): number {
  const periodSize = 2 ** 24;
  const period = Math.min(Math.max(Math.floor(rawTime / periodSize), 0), 4);
  const periodOffsets = [0, 45 * 60, 90 * 60, 105 * 60, 120 * 60];
  const seconds = rawTime - period * periodSize + periodOffsets[period];
  return Math.floor(seconds / 60) + 1;
}

export function nexonDate(value: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
}

export function formatNexonDate(value: string, dateOnly = false): string {
  return dateOnly
    ? nexonDate(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
    : nexonDate(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
