/// <reference types="vite/client" />

import type {
  MatchStats as SharedMatchStats,
  PlayerSummary as SharedPlayerSummary,
  ShotSummary as SharedShotSummary,
  MatchSummary as SharedMatchSummary,
  UserProfile as SharedUserProfile,
  PlayerCard as SharedPlayerCard,
  PlayerAbilityFilter as SharedPlayerAbilityFilter,
  PlayerSearchFilters as SharedPlayerSearchFilters,
  PlayerSearchResponse as SharedPlayerSearchResponse,
  PlayerCatalogStatus as SharedPlayerCatalogStatus,
  PlayerFilterMetadata as SharedPlayerFilterMetadata,
  PlayerDetail as SharedPlayerDetail,
  PlayerDetailOptions as SharedPlayerDetailOptions,
  ClientErrorEvent as SharedClientErrorEvent,
  DiagnosticInfo as SharedDiagnosticInfo,
} from "../shared/contracts";

declare global {
  type MatchStats = SharedMatchStats;
  type PlayerSummary = SharedPlayerSummary;
  type ShotSummary = SharedShotSummary;
  type MatchSummary = SharedMatchSummary;
  type UserProfile = SharedUserProfile;
  type PlayerCard = SharedPlayerCard;
  type PlayerAbilityFilter = SharedPlayerAbilityFilter;
  type PlayerSearchFilters = SharedPlayerSearchFilters;
  type PlayerSearchResponse = SharedPlayerSearchResponse;
  type PlayerCatalogStatus = SharedPlayerCatalogStatus;
  type PlayerFilterMetadata = SharedPlayerFilterMetadata;
  type PlayerDetail = SharedPlayerDetail;
  type PlayerDetailOptions = SharedPlayerDetailOptions;
  type ClientErrorEvent = SharedClientErrorEvent;
  type DiagnosticInfo = SharedDiagnosticInfo;

  interface Window {
    fcOnline: {
      fetchDashboard(input: { nickname: string; offset: number; matchType: number }): Promise<{ profile: UserProfile | null; matches: MatchSummary[]; failures: Array<{ matchId: string; message: string }>; matchTypes: Array<{ id: number; name: string }> }>;
      searchPlayers(filters: PlayerSearchFilters): Promise<PlayerSearchResponse>;
      fetchPlayerFilters(): Promise<PlayerFilterMetadata>;
      fetchPlayerDetail(spId: number, grade: number, options?: PlayerDetailOptions): Promise<PlayerDetail>;
      loadSettings(): Promise<{ nickname: string }>;
      saveSettings(nickname: string): Promise<void>;
      openLogin(): Promise<void>;
      reportClientError(event: ClientErrorEvent): Promise<unknown>;
      onDiagnostics(listener: (diagnostics: DiagnosticInfo) => void): () => void;
    };
  }
}

export {};
