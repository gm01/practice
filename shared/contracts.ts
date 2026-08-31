export type Side = "mine" | "opponent";

export type MatchStats = {
  possession: number;
  shots: number;
  effectiveShots: number;
  passAccuracy: number;
  tackles: number;
  corners: number;
  fouls: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  averageRating: number | null;
};

export type PlayerSummary = {
  spId: number;
  name: string;
  position: string;
  positionCode: number;
  grade: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  effectiveShots: number;
  passTry: number;
  passSuccess: number;
  imageUrls: string[];
  seasonName: string;
  seasonImageUrl: string;
};

export type ShotSummary = {
  x: number;
  y: number;
  isGoal: boolean;
  playerName: string;
  assistName: string | null;
  minute: number;
  type: number;
  inPenalty: boolean;
};

export type MatchSummary = {
  id: string;
  matchDate: string;
  result: string;
  myScore: number;
  opponentScore: number;
  ownGoalsFor: number;
  ownGoalsAgainst: number;
  opponentNickname: string;
  divisionName: string;
  opponentDivisionName: string;
  controller: string;
  endType: number;
  stats: MatchStats;
  opponentStats: MatchStats;
  players: PlayerSummary[];
  opponentPlayers: PlayerSummary[];
  topPlayers: PlayerSummary[];
  shots: ShotSummary[];
  opponentShots: ShotSummary[];
  goals: Array<{ minute: number; playerName: string; assistName: string | null; side: Side }>;
};

export type UserProfile = {
  ouid: string;
  nickname: string;
  level: number;
  divisionName: string;
  divisionDate: string | null;
};

export type DashboardResponse = {
  profile: UserProfile;
  matches: MatchSummary[];
  warnings: string[];
};

export type PlayerCard = {
  spId: number;
  name: string;
  seasonId: number;
  seasonName: string;
  imageUrls: string[];
  seasonImageUrl: string;
  grade: number;
  overall: number;
  primaryPosition: string;
  salary: number;
  height: string;
  weight: string;
  bodyType: string;
  leftFoot: number;
  rightFoot: number;
  weakFoot: number;
  preferredFoot: string;
  skillMoves: number;
  nation: string;
  traits: string[];
  abilities: Array<{ label: string; value: number }>;
};

export type PlayerAbilityFilter = { label: string; min?: number; max?: number };

export type PlayerSearchFilters = {
  query: string;
  seasonIds?: number[];
  positions?: string[];
  grade?: number;
  overallMin?: number;
  overallMax?: number;
  salaryMin?: number;
  salaryMax?: number;
  heightMin?: number;
  heightMax?: number;
  weightMin?: number;
  weightMax?: number;
  bodyTypes?: string[];
  preferredFoot?: string;
  weakFootMin?: number;
  weakFootMax?: number;
  skillMovesMin?: number;
  skillMovesMax?: number;
  nation?: string;
  includeTraits?: string[];
  excludeTraits?: string[];
  abilities?: PlayerAbilityFilter[];
  sort?: string;
  limit?: number;
};

export type PlayerFilterMetadata = {
  seasons: Array<{ id: number; name: string; imageUrl: string }>;
  positions: string[];
  abilities: string[];
  bodyTypes: string[];
};

export type PlayerDetail = {
  spId: number;
  grade: number;
  name: string;
  seasonId: number;
  seasonName: string;
  overall: number;
  baseOverall: number;
  overallDelta: number;
  primaryPosition: string;
  salary: number;
  birthDate: string;
  height: string;
  weight: string;
  bodyType: string;
  playerClass: string;
  skillMoves: number;
  leftFoot: number;
  rightFoot: number;
  nation: string;
  traits: string[];
  positions: Array<{ position: string; value: number; baseValue: number; delta: number }>;
  summaryAbilities: Array<{ label: string; value: number; baseValue: number; delta: number }>;
  abilities: Array<{ label: string; value: number; baseValue: number; delta: number }>;
  clubCareer: Array<{ years: string; club: string; loan: string }>;
  rankerStats: Record<string, string>;
  rankerUpdatedAt: string;
  currentPrice: number;
  priceHistory: Array<{ date: string; value: number }>;
  teamColorOptions: {
    enhancement: Array<{ id: number; level: number; name: string }>;
    affiliation: Array<{ id: number; level: number; name: string }>;
    feature: Array<{ id: number; level: number; name: string }>;
  };
  selection: {
    adaptation: 1 | 5;
    affiliationId: number;
    affiliationLevel: number;
    enhancementId: number;
    enhancementLevel: number;
    featureId: number;
  };
  imageUrls: string[];
  sourceUrl: string;
  source: string;
  degraded?: boolean;
  missingFields?: string[];
};

export type PlayerDetailOptions = {
  adaptation?: 1 | 5;
  affiliationId?: number;
  affiliationLevel?: number;
  enhancementId?: number;
  enhancementLevel?: number;
  featureId?: number;
};

export type ApiErrorBody = {
  error?: { code?: string; message?: string; source?: string; requestId?: string };
};

export type DiagnosticInfo = {
  requestId: string | null;
  serverVersion: string | null;
  apiVersion: string | null;
};

export type ClientErrorEvent = {
  eventId: string;
  relatedRequestId?: string;
  platform: "desktop" | "ios" | "android";
  appVersion: string;
  screen: string;
  errorCode: string;
  message: string;
  stack?: string;
  occurredAt: string;
};
