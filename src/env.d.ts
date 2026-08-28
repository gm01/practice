type MatchStats = {
  possession: number | null; shots: number | null; effectiveShots: number | null;
  passAccuracy: number | null; tackles: number | null; corners: number | null;
  fouls: number | null; offsides: number | null; yellowCards: number | null;
  redCards: number | null; averageRating: number | null;
};

type PlayerSummary = {
  spId: number; name: string; position: string; positionCode: number; grade: number;
  rating: number; goals: number; assists: number; shots: number; effectiveShots: number;
  passTry: number; passSuccess: number; imageUrls: string[]; seasonName: string; seasonImageUrl: string;
};

type ShotSummary = { x: number; y: number; isGoal: boolean; playerName: string; assistName: string | null; minute: number; type: number; inPenalty: boolean };

type MatchSummary = {
  id: string; matchDate: string; result: string; myScore: number; opponentScore: number;
  ownGoalsFor: number; ownGoalsAgainst: number;
  opponentNickname: string; divisionName: string; opponentDivisionName: string;
  controller: string; endType: number; stats: MatchStats; opponentStats: MatchStats;
  players: PlayerSummary[]; opponentPlayers: PlayerSummary[]; topPlayers: PlayerSummary[];
  shots: ShotSummary[]; opponentShots: ShotSummary[];
  goals: Array<{ minute: number; playerName: string; assistName: string | null; side: "mine" | "opponent" }>;
};

type UserProfile = {
  ouid: string; nickname: string; level: number; divisionName: string; divisionDate: string | null;
};
type PlayerCard = { spId: number; name: string; seasonId: number; seasonName: string; imageUrls: string[]; seasonImageUrl: string; overall: number; primaryPosition: string; height: string; weight: string; bodyType: string; leftFoot: number; rightFoot: number; weakFoot: number; preferredFoot: string };
type PlayerDetail = {
  spId: number; grade: number; name: string; seasonId: number; seasonName: string; overall: number; baseOverall: number; overallDelta: number; primaryPosition: string; salary: number;
  birthDate: string; height: string; weight: string; bodyType: string; playerClass: string; skillMoves: number; leftFoot: number; rightFoot: number;
  nation: string; traits: string[]; positions: Array<{ position: string; value: number; baseValue: number; delta: number }>; summaryAbilities: Array<{ label: string; value: number; baseValue: number; delta: number }>;
  abilities: Array<{ label: string; value: number; baseValue: number; delta: number }>; clubCareer: Array<{ years: string; club: string; loan: string }>;
  rankerStats: Record<string, string>; rankerUpdatedAt: string; currentPrice: number; priceHistory: Array<{ date: string; value: number }>;
  teamColorOptions: { enhancement: Array<{ id: number; level: number; name: string }>; affiliation: Array<{ id: number; level: number; name: string }>; feature: Array<{ id: number; level: number; name: string }> };
  selection: { adaptation: 1 | 5; affiliationId: number; enhancementId: number; enhancementLevel: number; featureId: number };
  imageUrls: string[]; sourceUrl: string; source: string;
};
type PlayerDetailOptions = { adaptation?: 1 | 5; affiliationId?: number; enhancementId?: number; enhancementLevel?: number; featureId?: number };

interface Window {
  fcOnline: {
    fetchDashboard(input: { apiKey?: string; nickname: string; offset: number; matchType: number }): Promise<{ profile: UserProfile | null; matches: MatchSummary[]; failures: Array<{ matchId: string; message: string }>; matchTypes: Array<{ id: number; name: string }> }>;
    fetchTrades(input: { apiKey: string }): Promise<{ trades: TradeRecord[] } | TradeRecord[]>;
    fetchRankerStats(input: { apiKey: string; players: Array<{ id: number; po: number }> }): Promise<RankerRecord[]>;
    searchPlayers(query: string): Promise<PlayerCard[]>;
    fetchPlayerDetail(spId: number, grade: number, options?: PlayerDetailOptions): Promise<PlayerDetail>;
    loadSettings(): Promise<{ nickname: string }>;
    saveSettings(nickname: string): Promise<void>;
    openLogin(): Promise<void>;
  };
}

type TradeRecord = { tradeDate: string; saleSn: string; spid: number; grade: number; value: number; type: "buy" | "sell"; playerName: string; seasonName: string; seasonImageUrl: string };
type RankerRecord = { spid: number; spPosition: number; playerName: string; position: string; createDate: string; status: { shoot: number; effectiveShoot: number; assist: number; goal: number; passTry: number; passSuccess: number; tackle: number; matchCount: number } };
