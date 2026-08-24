type MatchStats = {
  possession: number | null; shots: number | null; effectiveShots: number | null;
  passAccuracy: number | null; tackles: number | null; corners: number | null;
  fouls: number | null; offsides: number | null; yellowCards: number | null;
  redCards: number | null; averageRating: number | null;
};

type PlayerSummary = {
  spId: number; name: string; position: string; positionCode: number; grade: number;
  rating: number; goals: number; assists: number; imageUrls: string[]; seasonName: string; seasonImageUrl: string;
};

type ShotSummary = { x: number; y: number; isGoal: boolean; playerName: string; assistName: string | null; minute: number };

type MatchSummary = {
  id: string; matchDate: string; result: string; myScore: number; opponentScore: number;
  opponentNickname: string; divisionName: string; opponentDivisionName: string;
  controller: string; endType: number; stats: MatchStats; opponentStats: MatchStats;
  players: PlayerSummary[]; opponentPlayers: PlayerSummary[]; topPlayers: PlayerSummary[];
  shots: ShotSummary[]; opponentShots: ShotSummary[];
  goals: Array<{ minute: number; playerName: string; assistName: string | null; side: "mine" | "opponent" }>;
};

type UserProfile = {
  ouid: string; nickname: string; level: number; divisionName: string; divisionDate: string | null;
};

interface Window {
  fcOnline: {
    fetchDashboard(input: { apiKey: string; nickname: string; offset: number; matchType: number }): Promise<{ profile: UserProfile | null; matches: MatchSummary[]; matchTypes: Array<{ id: number; name: string }> }>;
    fetchTrades(input: { apiKey: string; nickname: string }): Promise<TradeRecord[]>;
    fetchRankerStats(input: { apiKey: string; players: Array<{ id: number; po: number }> }): Promise<RankerRecord[]>;
    loadSettings(): Promise<{ nickname: string }>;
    saveSettings(nickname: string): Promise<void>;
    openLogin(): Promise<void>;
  };
}

type TradeRecord = { tradeDate: string; saleSn: string; spid: number; grade: number; value: number; type: "buy" | "sell"; playerName: string; seasonName: string; seasonImageUrl: string };
type RankerRecord = { spid: number; spPosition: number; playerName: string; position: string; createDate: string; status: { shoot: number; effectiveShoot: number; assist: number; goal: number; passTry: number; passSuccess: number; tackle: number; matchCount: number } };
