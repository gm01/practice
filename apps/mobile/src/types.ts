export type Side = "mine" | "opponent";

export type Player = {
  spId: number; name: string; position: string; positionCode: number; grade: number;
  rating: number; goals: number; assists: number; shots: number; effectiveShots: number;
  passTry: number; passSuccess: number; imageUrls: string[]; seasonName: string; seasonImageUrl: string;
};

export type Shot = { x: number; y: number; isGoal: boolean; playerName: string; assistName: string | null; minute: number };
export type Stats = { possession: number; shots: number; effectiveShots: number; passAccuracy: number };

export type Match = {
  id: string; matchDate: string; result: string; myScore: number; opponentScore: number;
  opponentNickname: string; divisionName: string; opponentDivisionName: string; controller: string;
  ownGoalsFor: number; ownGoalsAgainst: number; stats: Stats; opponentStats: Stats;
  players: Player[]; opponentPlayers: Player[]; shots: Shot[]; opponentShots: Shot[];
  goals: Array<{ minute: number; playerName: string; assistName: string | null; side: Side }>;
};

export type Profile = { ouid: string; nickname: string; level: number; divisionName: string };
export type Dashboard = { profile: Profile; matches: Match[]; warnings: string[] };
