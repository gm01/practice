import type { Match } from "./types";

type FunMatch = Pick<Match, "matchDate" | "result" | "myScore" | "opponentScore" | "stats">;

export type PlayStyle = {
  emoji: string;
  title: string;
  description: string;
  metric: string;
};

export type DailyChallenge = {
  emoji: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  unit: string;
  completed: boolean;
};

function koreaDateKey(value: Date | string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function stableIndex(value: string, size: number) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % size;
}

export function analyzePlayStyle(matches: FunMatch[]): PlayStyle {
  const sample = matches.slice(0, 10);
  if (!sample.length) return { emoji: "🧭", title: "탐색 중", description: "경기를 플레이하면 감독 성향을 분석해 드려요.", metric: "분석할 경기 없음" };
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const goals = average(sample.map((match) => match.myScore));
  const conceded = average(sample.map((match) => match.opponentScore));
  const possession = average(sample.map((match) => match.stats.possession));
  const shots = sample.reduce((sum, match) => sum + match.stats.shots, 0);
  const conversion = shots ? sample.reduce((sum, match) => sum + match.myScore, 0) / shots * 100 : 0;
  const candidates = [
    { score: goals / 2, value: { emoji: "🔥", title: "공격 본능", description: "득점 기회를 놓치지 않고 경기를 몰아붙이는 스타일", metric: `경기당 ${goals.toFixed(1)}골` } },
    { score: Math.max(0, (2.2 - conceded) / 1.4), value: { emoji: "🧱", title: "철벽 수비", description: "실점을 억제하며 한 골 차 승부를 지켜내는 스타일", metric: `경기당 ${conceded.toFixed(1)}실점` } },
    { score: possession / 55, value: { emoji: "🎛️", title: "점유 설계자", description: "공을 소유하며 원하는 경기 흐름을 만드는 스타일", metric: `평균 점유율 ${Math.round(possession)}%` } },
    { score: conversion / 35, value: { emoji: "🎯", title: "효율 사냥꾼", description: "적은 기회도 득점으로 바꾸는 결정력 중심 스타일", metric: `슛 전환율 ${Math.round(conversion)}%` } },
  ];
  return candidates.sort((a, b) => b.score - a.score)[0].value;
}

export function dailyChallenge(nickname: string, matches: FunMatch[], now = new Date()): DailyChallenge {
  const today = koreaDateKey(now);
  const todaysMatches = matches.filter((match) => koreaDateKey(match.matchDate.endsWith("Z") ? match.matchDate : `${match.matchDate}Z`) === today);
  const challenges: Array<() => Omit<DailyChallenge, "completed">> = [
    () => ({ emoji: "⚽", title: "해트트릭 사냥", description: "오늘 한 경기에서 3골 이상 넣기", progress: Math.max(0, ...todaysMatches.map((match) => match.myScore)), target: 3, unit: "골" }),
    () => ({ emoji: "🧤", title: "클린 시트", description: "오늘 무실점 승리 한 번 기록하기", progress: todaysMatches.some((match) => match.result === "승" && match.opponentScore === 0) ? 1 : 0, target: 1, unit: "회" }),
    () => ({ emoji: "🎯", title: "골문 폭격", description: "오늘 한 경기에서 유효 슈팅 5개 기록하기", progress: Math.max(0, ...todaysMatches.map((match) => match.stats.effectiveShots)), target: 5, unit: "개" }),
    () => ({ emoji: "👑", title: "경기 지배", description: "오늘 55% 이상 점유율로 승리하기", progress: Math.max(0, ...todaysMatches.filter((match) => match.result === "승").map((match) => match.stats.possession)), target: 55, unit: "%" }),
    () => ({ emoji: "🚀", title: "연승 시동", description: "오늘 2승 기록하기", progress: todaysMatches.filter((match) => match.result === "승").length, target: 2, unit: "승" }),
  ];
  const challenge = challenges[stableIndex(`${today}:${nickname}`, challenges.length)]();
  return { ...challenge, progress: Math.min(challenge.progress, challenge.target), completed: challenge.progress >= challenge.target };
}
