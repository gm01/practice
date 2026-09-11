import { playerSearchRequest } from "../../shared/playerSearchRequest";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  Vibration,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import { fetchDashboard, fetchPlayerDetail, fetchPlayerFilters, searchPlayers, setDiagnosticListener, type PlayerCard, type PlayerDetail, type PlayerDetailOptions, type PlayerFilterMetadata, type PlayerSearchFilters } from "./src/api";
import { C, s } from "./src/styles";
import type { Dashboard, Match, Player, Side } from "./src/types";
import { focusedTrainingOvr, orderedAbilityColumns, recommendedFocusedTraining } from "../../shared/playerOvr";
import { POSITION_COORDINATES, formationName, startingPlayers, substitutePlayers } from "../../shared/formation";
import { compareAbility, setComparisonGrade } from "../../shared/comparison";
import type { DiagnosticInfo, PlayerCatalogStatus } from "../../shared/contracts";
import { installMobileErrorHandler, reportMobileError, setRelatedRequestId } from "./src/telemetry";
import { resolveBackAction } from "./src/navigation";
import { analyzePlayStyle, dailyChallenge } from "./src/gamification";
import {
  loadSearches,
  loadPlayerFavorites,
  rememberSearch,
  removeSearch,
  toggleFavorite,
  togglePlayerFavorite,
  loadUpgradeHistory,
  loadUpgradeStats,
  rememberUpgrades,
  clearUpgradeHistory,
  type SearchItem,
  type UpgradeHistoryItem,
  type UpgradeStats,
} from "./src/storage";
import { canUseGradeProtection, simulateUpgradeSeries, upgradeProbability, type UpgradeResult } from "./src/upgradeSimulator";

const average = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
const percent = (v: number, t: number) => (t ? Math.round((v / t) * 100) : 0);
const date = (v: string) =>
  new Date(v.endsWith("Z") ? v : `${v}Z`).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
const statColor = (value: number) => {
  if (value >= 170) return "#20d67a";
  if (value >= 160) return "#27b8ad";
  if (value >= 150) return "#f0d719";
  if (value >= 140) return "#d19f00";
  if (value >= 130) return "#f03838";
  if (value >= 120) return "#d52acb";
  if (value >= 110) return "#a348ec";
  if (value >= 100) return "#704fff";
  if (value >= 90) return "#4e76ff";
  if (value >= 80) return "#2aa8e6";
  if (value >= 70) return "#eef7f1";
  return "#65776d";
};
const sortedClubCareer = (rows: PlayerDetail["clubCareer"]) => {
  const year = (value: string) => Number(value.match(/\d{4}/)?.[0] ?? 0);
  return [...rows].sort((a,b)=>year(b.years)-year(a.years)||b.years.localeCompare(a.years,"ko-KR")||a.club.localeCompare(b.club,"ko-KR"));
};
const focusedTrainingLimit = (grade: number) => grade >= 11 ? 6 : 5;

function PlayerImage({ player, size = 52, showSeason = false }: { player: Player; size?: number; showSeason?: boolean }) {
  const [index, setIndex] = useState(0),
    [failed, setFailed] = useState(false),
    [seasonFailed,setSeasonFailed]=useState(false);
  useEffect(()=>setSeasonFailed(false),[player.seasonImageUrl]);
  return (
    <View
      style={[s.photoWrap, { width: size, height: size }]}
    >
      <View style={[s.photo, { width: size, height: size, borderRadius: size / 2 }]}>
        {failed ? (
          <Text style={s.photoText}>{player.name.slice(0, 1)}</Text>
        ) : (
          <Image
            source={{ uri: player.imageUrls[index] }}
            style={{ width: size, height: size }}
            resizeMode="contain"
            onError={() =>
              index + 1 < player.imageUrls.length
                ? setIndex(index + 1)
                : setFailed(true)
            }
          />
        )}
      </View>
      {showSeason&&!!player.seasonImageUrl&&!seasonFailed&&<Image source={{uri:player.seasonImageUrl}} style={[s.playerSeasonIcon,{width:Math.max(18,Math.round(size*.32)),height:Math.max(18,Math.round(size*.32))}]} resizeMode="contain" accessibilityLabel={`${player.seasonName} 시즌`} onError={()=>setSeasonFailed(true)}/>}
    </View>
  );
}
function CardImage({ card, size = 72, seasonImageUrl }: { card: Pick<PlayerCard, "name" | "imageUrls">; size?: number; seasonImageUrl?: string }) {
  const [index, setIndex] = useState(0), [failed, setFailed] = useState(false), [seasonFailed, setSeasonFailed] = useState(false);
  useEffect(()=>{setSeasonFailed(false)},[seasonImageUrl]);
  const iconSize=Math.max(23,Math.round(size*.3));
  return <View style={[s.cardPhoto,{width:size,height:size}]}>{failed?<Text style={s.photoText}>{card.name.slice(0,1)}</Text>:<Image source={{uri:card.imageUrls[index]}} style={{width:size,height:size}} resizeMode="contain" onError={()=>index+1<card.imageUrls.length?setIndex(index+1):setFailed(true)}/>}{!!seasonImageUrl&&!seasonFailed&&<Image source={{uri:seasonImageUrl}} style={[s.cardSeasonIcon,{width:iconSize,height:iconSize}]} resizeMode="contain" onError={()=>setSeasonFailed(true)}/>}</View>;
}

function SeasonIcon({ card, size = 22 }: { card: Pick<PlayerCard, "seasonImageUrl" | "seasonName">; size?: number }) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>{setFailed(false)},[card.seasonImageUrl]);
  if(!card.seasonImageUrl||failed)return null;
  return <Image source={{uri:card.seasonImageUrl}} style={{width:size,height:size}} resizeMode="contain" accessibilityLabel={`${card.seasonName} 시즌`} onError={()=>setFailed(true)}/>;
}

function FootRatings({ right, left }: { right: number; left: number }) {
  return <View style={s.dbFeet} accessibilityLabel={`왼발 ${left||"정보 없음"}, 오른발 ${right||"정보 없음"}`}><View style={s.dbFootBadge}><Text style={s.dbFootLabel}>왼발</Text><Text style={s.dbFootValue}>{left||"-"}</Text></View><View style={s.dbFootBadge}><Text style={s.dbFootLabel}>오른발</Text><Text style={s.dbFootValue}>{right||"-"}</Text></View></View>;
}
function Back({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.back}>
      <Text style={s.backText}>← 뒤로</Text>
    </Pressable>
  );
}
function Result({ value }: { value: string }) {
  const color = value === "승" ? C.green : value === "패" ? C.red : C.muted;
  return (
    <View style={[s.result, { borderColor: color }]}>
      <Text style={{ color, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}
function Kpi({
  label,
  value,
  note,
  compact = false,
}: {
  label: string;
  value: string;
  note: string;
  compact?: boolean;
}) {
  return (
    <View style={[s.kpi,compact&&s.upgradeKpi]}>
      <Text style={[s.label,compact&&s.upgradeKpiLabel]}>{label}</Text>
      <Text style={[s.kpiValue,compact&&s.upgradeKpiValue]}>{value}</Text>
      <Text numberOfLines={compact?1:undefined} adjustsFontSizeToFit={compact} style={[s.muted,compact&&s.upgradeKpiNote]}>{note}</Text>
    </View>
  );
}
function PlayerRow({
  player,
  onPress,
}: {
  player: Player;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.playerRow} onPress={onPress}>
      <PlayerImage player={player} />
      <View style={s.flex}>
        <Text style={s.playerName}>{player.name}</Text>
        <Text style={s.muted}>
          {player.position} · +{player.grade}강
        </Text>
        <Text style={s.green}>
          {player.goals}골 {player.assists}도움
        </Text>
      </View>
      <Text style={s.rating}>{player.rating.toFixed(1)}</Text>
      <Text style={s.arrow}>→</Text>
    </Pressable>
  );
}

function PitchLines() {
  return (
    <>
      <View style={s.halfway} />
      <View style={s.centerCircle} />
      <View style={s.centerSpot} />
      <View style={s.topPenalty} />
      <View style={s.topGoalArea} />
      <View style={s.bottomPenalty} />
      <View style={s.bottomGoalArea} />
    </>
  );
}

function Formation({
  players,
  onPlayer,
}: {
  players: Player[];
  onPlayer: (id: number) => void;
}) {
  const starters = startingPlayers(players);
  const substitutes = substitutePlayers(players);
  const currentFormation = formationName(players);
  return (
    <>
      <Text style={s.formationTitle}>포메이션 {currentFormation} · 선발 {starters.length}명</Text>
      <View style={s.formationPitch}>
        <PitchLines />
        {starters.map((p) => {
          const [x, y] = POSITION_COORDINATES[p.positionCode] ?? [50, 50];
          return (
            <Pressable
              style={[s.formationPlayer, { left: `${x}%`, top: `${y}%` }]}
              onPress={() => onPlayer(p.spId)}
              key={p.spId}
            >
              <View>
                <PlayerImage player={p} size={38} />
                <Text style={s.formationRating}>{p.rating.toFixed(1)}</Text>
                {(p.goals > 0 || p.assists > 0) && (
                  <View style={s.playerEvents}>
                    <Text style={s.eventIcon}>{"⚽".repeat(p.goals)}</Text>
                    <Text style={s.eventIcon}>{"👟".repeat(p.assists)}</Text>
                  </View>
                )}
              </View>
              <Text style={s.formationName} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={s.formationMeta}>
                {p.position} · +{p.grade}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {substitutes.length > 0 && <><Text style={s.heading}>교체 선수</Text>{substitutes.map((p)=><PlayerRow key={p.spId} player={p} onPress={()=>onPlayer(p.spId)}/>)}</>}
    </>
  );
}

function Home({
  data,
  onMatch,
  onPlayer,
  onRefresh,
  refreshing,
  onExit,
  onFavorite,
}: {
  data: Dashboard;
  onMatch: (m: Match) => void;
  onPlayer: (id: number, side: Side) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onExit: () => void;
  onFavorite: () => void;
}) {
  const [range, setRange] = useState<5 | 10 | 20>(20);
  const sample = data.matches.slice(0, range);
  const report = useMemo(() => {
    const wins = sample.filter((m) => m.result === "승").length,
      goals = sample.reduce((a, m) => a + m.myScore, 0),
      against = sample.reduce((a, m) => a + m.opponentScore, 0),
      shots = sample.reduce((a, m) => a + m.stats.shots, 0);
    return { wins, goals, against, shots };
  }, [sample]);
  const playStyle = useMemo(() => analyzePlayStyle(data.matches), [data.matches]);
  const challenge = useMemo(() => dailyChallenge(data.profile.nickname, data.matches), [data.matches, data.profile.nickname]);
  const players = useMemo(() => {
    const map = new Map<
      number,
      {
        p: Player;
        games: number;
        rating: number;
        goals: number;
        assists: number;
      }
    >();
    sample.forEach((m) =>
      m.players
        .filter((p) => p.rating > 0)
        .forEach((p) => {
          const r = map.get(p.spId) ?? {
            p,
            games: 0,
            rating: 0,
            goals: 0,
            assists: 0,
          };
          r.games++;
          r.rating += p.rating;
          r.goals += p.goals;
          r.assists += p.assists;
          map.set(p.spId, r);
        }),
    );
    return [...map.values()]
      .sort(
        (a, b) => b.games - a.games || b.rating / b.games - a.rating / a.games,
      )
      .slice(0, 8);
  }, [sample]);
  return (
    <ScrollView
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.green}
        />
      }
    >
      <View style={s.homeActions}>
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="다른 구단주 검색"
        >
          <Text style={s.green}>← 다른 구단주</Text>
        </Pressable>
        <Pressable
          onPress={onFavorite}
          accessibilityRole="button"
          accessibilityLabel="구단주 즐겨찾기 전환"
        >
          <Text style={s.favorite}>★ 즐겨찾기</Text>
        </Pressable>
      </View>
      <View style={s.profile}>
        {players[0] && <PlayerImage player={players[0].p} size={66} />}
        <View style={s.flex}>
          <Text style={s.eyebrow}>CLUB OWNER</Text>
          <Text style={s.profileName} numberOfLines={2} adjustsFontSizeToFit>
            {data.profile.nickname}
          </Text>
          <Text style={s.muted}>
            LV.{data.profile.level.toLocaleString()} ·{" "}
            {data.profile.divisionName}
          </Text>
        </View>
      </View>
      <View style={s.funGrid}>
        <View style={s.funCard}>
          <View style={s.funCardTop}><Text style={s.funEmoji}>{playStyle.emoji}</Text><Text style={s.funLabel}>나의 감독 성향</Text></View>
          <Text style={s.funTitle}>{playStyle.title}</Text>
          <Text style={s.funDescription}>{playStyle.description}</Text>
          <Text style={s.funMetric}>{playStyle.metric}</Text>
        </View>
        <View style={[s.funCard, challenge.completed && s.funCardComplete]}>
          <View style={s.funCardTop}><Text style={s.funEmoji}>{challenge.completed ? "🏆" : challenge.emoji}</Text><Text style={s.funLabel}>오늘의 도전</Text></View>
          <Text style={s.funTitle}>{challenge.completed ? "도전 성공!" : challenge.title}</Text>
          <Text style={s.funDescription}>{challenge.description}</Text>
          <View style={s.challengeRow}><View style={s.challengeTrack}><View style={[s.challengeFill, { width: `${Math.round(challenge.progress / challenge.target * 100)}%` }]} /></View><Text style={s.challengeValue}>{challenge.progress}/{challenge.target}{challenge.unit}</Text></View>
        </View>
      </View>
      <View style={s.reportHeading}><Text style={s.heading}>최근 {sample.length}경기 리포트</Text><View style={s.rangeRow}>{([5,10,20] as const).map(value=><Pressable key={value} style={[s.rangeChip,range===value&&s.rangeChipActive]} onPress={()=>setRange(value)}><Text style={range===value?s.filterTextActive:s.muted}>{value}</Text></Pressable>)}</View></View>
      <View style={s.grid}>
        <Kpi
          label="승률"
          value={`${percent(report.wins, sample.length)}%`}
          note={`${report.wins}승`}
        />
        <Kpi
          label="평균 득실"
          value={`${average(sample.map((m) => m.myScore)).toFixed(1)} : ${average(sample.map((m) => m.opponentScore)).toFixed(1)}`}
          note={`득실차 ${report.goals - report.against}`}
        />
        <Kpi
          label="슛 전환율"
          value={`${percent(report.goals, report.shots)}%`}
          note={`${report.shots}슛 · ${report.goals}골`}
        />
        <Kpi
          label="유효 슈팅"
          value={`${percent(
            sample.reduce((a, m) => a + m.stats.effectiveShots, 0),
            report.shots,
          )}%`}
          note="전체 슈팅 기준"
        />
      </View>
      <Text style={s.heading}>선수 누적</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.horizontal}
      >
        {players.map((r) => (
          <Pressable
            style={s.playerCard}
            key={r.p.spId}
            onPress={() => onPlayer(r.p.spId, "mine")}
            accessibilityRole="button"
            accessibilityLabel={`${r.p.name} 플레이어 리포트, ${r.games}경기, 평균 평점 ${(r.rating / r.games).toFixed(1)}`}
          >
            <PlayerImage player={r.p} showSeason />
            <Text style={s.playerName} numberOfLines={2}>{r.p.name}</Text>
            <Text style={s.muted}>{r.games}경기 · {(r.rating / r.games).toFixed(1)}</Text>
            <Text style={s.green}>{r.goals}골 {r.assists}도움</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={s.heading}>최근 경기</Text>
      {data.matches.map((m, i) => (
        <Pressable
          style={s.matchRow}
          key={m.id}
          onPress={() => onMatch(m)}
          accessibilityRole="button"
          accessibilityLabel={`${m.opponentNickname} 상대 ${m.myScore}대 ${m.opponentScore}, ${m.result}`}
        >
          <Text style={s.matchNo}>{String(i + 1).padStart(2, "0")}</Text>
          <Result value={m.result} />
          <Text style={s.score}>
            {m.myScore} : {m.opponentScore}
          </Text>
          <View style={[s.flex, s.right]}>
            <Text style={s.playerName} numberOfLines={2}>
              VS {m.opponentNickname}
            </Text>
            <Text style={s.muted}>{date(m.matchDate)}</Text>
          </View>
          <Text style={s.arrow}>→</Text>
        </Pressable>
      ))}
      {data.warnings.length > 0 && (
        <Text style={s.warning}>
          일부 경기 {data.warnings.length}건을 불러오지 못했습니다.
        </Text>
      )}
    </ScrollView>
  );
}

function MatchScreen({
  match,
  nickname,
  onPlayer,
}: {
  match: Match;
  nickname: string;
  onPlayer: (id: number, side: Side) => void;
}) {
  const shareCard = useRef<ViewShotRef>(null);
  const [tab, setTab] = useState<"요약" | "통계" | "라인업" | "슛맵">("요약"),
    [side, setSide] = useState<Side>("mine"),
    [shotFilter, setShotFilter] = useState<"all" | Side | "goal" | "miss">("all"),
    [selectedShot, setSelectedShot] = useState<{
      shot: Match["shots"][number];
      side: Side;
    } | null>(null);
  const mine = match.players
      .filter((p) => p.rating > 0)
      .sort((a, b) => b.rating - a.rating),
    away = match.opponentPlayers
      .filter((p) => p.rating > 0)
      .sort((a, b) => b.rating - a.rating);
  let runningMine = match.ownGoalsFor;
  let runningAway = match.ownGoalsAgainst;
  const scoredGoals = match.goals.map((goal) => {
    if (goal.side === "mine") runningMine += 1; else runningAway += 1;
    return { ...goal, score: `${runningMine} : ${runningAway}` };
  });
  async function shareResult() {
    if (!shareCard.current || !(await Sharing.isAvailableAsync())) return;
    const uri = await shareCard.current.capture();
    await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "경기 결과 공유" });
  }
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.centerMuted}>
        {date(match.matchDate)} · {match.controller}
      </Text>
      <ViewShot ref={shareCard} options={{format:"png",quality:1}} style={s.shareCard}><View style={s.scoreHero}>
        <View style={s.club}>
          <Text style={s.clubName}>{nickname}</Text>
          <Text style={s.muted}>{match.divisionName}</Text>
        </View>
        <Text style={s.heroScore}>
          {match.myScore} : {match.opponentScore}
        </Text>
        <View style={s.club}>
          <Text style={s.clubName}>{match.opponentNickname}</Text>
          <Text style={s.muted}>{match.opponentDivisionName}</Text>
        </View>
      </View><Text style={s.shareCredit}>FC ONLINE LAB · Data based on NEXON Open API</Text></ViewShot>
      <Pressable style={s.shareButton} onPress={()=>void shareResult()} accessibilityRole="button" accessibilityLabel="경기 결과 이미지 공유"><Text style={s.shareButtonText}>결과 이미지 공유 ↗</Text></Pressable>
      <View style={s.tabs}>
        {(["요약", "통계", "라인업", "슛맵"] as const).map((t) => (
          <Pressable
            style={[s.tab, tab === t && s.activeTab]}
            onPress={() => setTab(t)}
            key={t}
          >
            <Text style={tab === t ? s.green : s.muted}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {tab === "요약" && (
        <>
          <Text style={s.heading}>득점 타임라인</Text>
          {scoredGoals.map((g, i) => (
            <View style={s.goalRow} key={`${g.minute}-${i}`}>
              <Text
                style={[
                  s.minute,
                  { color: g.side === "mine" ? C.green : C.blue },
                ]}
              >
                {g.minute}'
              </Text>
              <View style={s.flex}>
                <Text style={s.playerName}>⚽ {g.playerName}</Text>
                {g.assistName && (
                  <Text style={s.muted}>도움 · {g.assistName}</Text>
                )}
              </View>
              <Text style={s.liveScore}>{g.score}</Text>
            </View>
          ))}
          {match.ownGoalsFor > 0 && (
            <Text style={s.warning}>
              상대 자책골 {match.ownGoalsFor} · 시간 정보 없음
            </Text>
          )}
          {match.ownGoalsAgainst > 0 && (
            <Text style={s.warning}>
              내 자책골 {match.ownGoalsAgainst} · 시간 정보 없음
            </Text>
          )}
          <Text style={s.heading}>최고 평점 선수</Text>
          <View style={s.bestCompare}>{mine[0]&&<PlayerRow player={mine[0]} onPress={()=>onPlayer(mine[0].spId,"mine")}/>} {away[0]&&<PlayerRow player={away[0]} onPress={()=>onPlayer(away[0].spId,"opponent")}/>}</View>
        </>
      )}
      {tab === "통계" && (
        <View style={s.stats}>
          {[
            [
              "점유율",
              match.stats.possession,
              match.opponentStats.possession,
              "%",
            ],
            ["슈팅", match.stats.shots, match.opponentStats.shots, ""],
            [
              "유효 슈팅",
              match.stats.effectiveShots,
              match.opponentStats.effectiveShots,
              "",
            ],
            [
              "패스 성공률",
              match.stats.passAccuracy,
              match.opponentStats.passAccuracy,
              "%",
            ],
            ["자책골", match.ownGoalsAgainst, match.ownGoalsFor, ""],
          ].map(([l, a, b, u]) => (
            <View style={s.stat} key={String(l)}>
              <Text style={s.statValue}>
                {String(a)}
                {u}
              </Text>
              <Text style={s.muted}>{l??"정보 없음"}</Text>
              <Text style={s.statValue}>
                {String(b)}
                {u}
              </Text>
            </View>
          ))}
        </View>
      )}
      {tab === "라인업" && (
        <>
          <View style={s.sideTabs}>
            <Pressable onPress={() => setSide("mine")}>
              <Text style={side === "mine" ? s.green : s.muted}>
                {nickname}
              </Text>
            </Pressable>
            <Pressable onPress={() => setSide("opponent")}>
              <Text style={side === "opponent" ? s.blue : s.muted}>
                {match.opponentNickname}
              </Text>
            </Pressable>
          </View>
          <Formation
            players={side === "mine" ? mine : away}
            onPlayer={(id) => onPlayer(id, side)}
          />
        </>
      )}
      {tab === "슛맵" && (
        <>
          <View style={s.shotLegend}>{([['all','전체'],['mine','내 팀'],['opponent','상대 팀'],['goal','득점'],['miss','실패']] as const).map(([value,label])=><Pressable key={value} style={[s.filterChip,shotFilter===value&&s.filterChipActive]} onPress={()=>setShotFilter(value)}><Text style={shotFilter===value?s.filterTextActive:s.muted}>{label}</Text></Pressable>)}</View>
          <View style={s.pitch}>
            <PitchLines />
            {match.shots.filter(x=>(shotFilter==='all'||shotFilter==='mine'||(shotFilter==='goal'&&x.isGoal)||(shotFilter==='miss'&&!x.isGoal))).map((x, i) => (
              <Pressable
                hitSlop={9}
                onPress={() => setSelectedShot({ shot: x, side: "mine" })}
                style={[
                  s.shot,
                  { left: `${x.y * 100}%`, top: `${(1 - x.x) * 100}%` },
                  x.isGoal && s.goalShot,
                ]}
                key={`m${i}`}
              />
            ))}
            {match.opponentShots.filter(x=>(shotFilter==='all'||shotFilter==='opponent'||(shotFilter==='goal'&&x.isGoal)||(shotFilter==='miss'&&!x.isGoal))).map((x, i) => (
              <Pressable
                hitSlop={9}
                onPress={() => setSelectedShot({ shot: x, side: "opponent" })}
                style={[
                  s.shot,
                  {
                    left: `${(1 - x.y) * 100}%`,
                    top: `${x.x * 100}%`,
                    borderColor: C.blue,
                  },
                  x.isGoal && s.goalShot,
                ]}
                key={`a${i}`}
              />
            ))}
          </View>
          {selectedShot && (
            <View style={s.shotDetail}>
              {(()=>{const list=selectedShot.side==='mine'?match.players:match.opponentPlayers;const player=list.find(p=>p.name===selectedShot.shot.playerName);return player?<PlayerImage player={player} size={46}/>:null})()}
              <View
                style={[
                  s.shotBadge,
                  {
                    backgroundColor:
                      selectedShot.side === "mine" ? C.green : C.blue,
                  },
                ]}
              >
                <Text style={s.shotBadgeText}>{selectedShot.shot.minute}'</Text>
              </View>
              <View style={s.flex}>
                <Text style={s.playerName}>
                  {selectedShot.shot.isGoal ? "⚽ 득점" : "슈팅"} ·{" "}
                  {selectedShot.shot.playerName}
                </Text>
                <Text style={s.muted}>
                  {selectedShot.side === "mine"
                    ? nickname
                    : match.opponentNickname}
                  {selectedShot.shot.assistName
                    ? ` · 도움 ${selectedShot.shot.assistName}`
                    : ""}
                </Text>
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function PlayerScreen({
  matches,
  id,
  side,
  onMatch,
  onSearchPlayer,
}: {
  matches: Match[];
  id: number;
  side: Side;
  onMatch: (m: Match) => void;
  onSearchPlayer: (name: string) => void;
}) {
  const rows = matches.flatMap((match) => {
      const player = (
        side === "mine" ? match.players : match.opponentPlayers
      ).find((p) => p.spId === id && p.rating > 0);
      return player ? [{ match, player }] : [];
    }),
    player = rows[0]?.player;
  if (!player)
    return (
      <View style={s.content}>
        <Text style={s.heading}>출전 기록 없음</Text>
      </View>
    );
  const goals = rows.reduce((a, r) => a + r.player.goals, 0),
    assists = rows.reduce((a, r) => a + r.player.assists, 0),
    shots = rows.reduce((a, r) => a + r.player.shots, 0),
    passTry = rows.reduce((a, r) => a + r.player.passTry, 0),
    passSuccess = rows.reduce((a, r) => a + r.player.passSuccess, 0);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.playerHero}>
        <Pressable
          onPress={() => onSearchPlayer(player.name)}
          accessibilityRole="button"
          accessibilityLabel={`${player.name} 시즌 카드 검색`}
        >
          <PlayerImage player={player} size={90} showSeason />
        </Pressable>
        <View style={s.flex}>
          <Text style={s.eyebrow}>PLAYER REPORT</Text>
          <Text style={s.playerHeroName}>{player.name}</Text>
          <Text style={s.muted}>
            {player.seasonName} · {player.position} · +{player.grade}강
          </Text>
        </View>
        <Text style={s.heroRating}>
          {average(rows.map((r) => r.player.rating)).toFixed(2)}
        </Text>
      </View>
      <View style={s.grid}>
        <Kpi label="출전" value={`${rows.length}`} note="불러온 경기" />
        <Kpi
          label="골 · 도움"
          value={`${goals} · ${assists}`}
          note={`경기당 ${((goals + assists) / rows.length).toFixed(2)}P`}
        />
        <Kpi
          label="슈팅"
          value={`${shots}`}
          note={`유효 ${percent(
            rows.reduce((a, r) => a + r.player.effectiveShots, 0),
            shots,
          )}%`}
        />
        <Kpi
          label="패스"
          value={`${percent(passSuccess, passTry)}%`}
          note={`${passSuccess}/${passTry}`}
        />
      </View>
      <Text style={s.heading}>최근 평점</Text>
      <View style={s.bars}>
        {rows.slice(0, 10).map((r, i) => (
          <Pressable
            style={s.barWrap}
            onPress={() => onMatch(r.match)}
            key={r.match.id}
          >
            <Text style={s.muted}>{r.player.rating.toFixed(1)}</Text>
            <View
              style={[s.bar, { height: Math.max(18, r.player.rating * 14) }]}
            />
            <Text style={s.muted}>{i + 1}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.heading}>출전 경기</Text>
      {rows.map((r) => (
        <Pressable
          style={s.matchRow}
          onPress={() => onMatch(r.match)}
          key={r.match.id}
        >
          <Result
            value={
              side === "mine"
                ? r.match.result
                : r.match.result === "승"
                  ? "패"
                  : r.match.result === "패"
                    ? "승"
                    : "무"
            }
          />
          <View style={s.flex}>
            <Text style={s.playerName}>VS {r.match.opponentNickname}</Text>
            <Text style={s.muted}>
              {date(r.match.matchDate)} · {r.player.position}
            </Text>
          </View>
          <Text style={s.green}>
            {r.player.goals}G {r.player.assists}A
          </Text>
          <Text style={s.rating}>{r.player.rating.toFixed(1)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function MobilePriceBars({ rows }: { rows: Array<{ date: string; value: number }> }) {
  const recent=rows.slice(-24),values=recent.map(row=>row.value),min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,1);
  if(recent.length<2)return null;
  return <View><View style={s.dbPriceBars}>{recent.map((row,index)=><View key={`${row.date}-${index}`} style={[s.dbPriceBar,{height:12+(row.value-min)/range*62}]}/>)}</View><View style={s.dbPriceDates}><Text style={s.muted}>{recent[0].date}</Text><Text style={s.muted}>{recent.at(-1)?.date}</Text></View></View>;
}

function TeamColorChoices({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; name: string }>; onChange: (value: string) => void }) {
  return <View style={s.dbSelectorGroup}>
    <Text style={s.dbSelectorLabel}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dbSelectorRow}>
      <Pressable style={[s.dbChoice,value==="0"&&s.dbChoiceActive]} onPress={()=>onChange("0")}><Text style={value==="0"?s.dbChoiceActiveText:s.muted}>적용 안 함</Text></Pressable>
      {options.map(option=><Pressable key={`${label}-${option.value}`} style={[s.dbChoice,value===option.value&&s.dbChoiceActive]} onPress={()=>onChange(option.value)}><Text style={value===option.value?s.dbChoiceActiveText:s.muted}>{option.name}</Text></Pressable>)}
    </ScrollView>
  </View>;
}

function MobilePlayerComparison({ cards, onClose }: { cards: [PlayerCard,PlayerCard]; onClose: () => void }) {
  const [grades,setGrades]=useState<[number,number]>([1,1]);
  const comparisonKey=JSON.stringify([cards.map(card=>card.spId),grades]);
  const [loadedComparison,setLoadedComparison]=useState<{key:string;values:[PlayerDetail,PlayerDetail]}|null>(null);
  const details=loadedComparison?.key===comparisonKey?loadedComparison.values:[null,null];
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{let active=true;const controller=new AbortController();setLoading(true);setLoadedComparison(null);setError("");Promise.all(cards.map((card,index)=>fetchPlayerDetail(card.spId,grades[index],{adaptation:1},controller.signal))).then(values=>{if(active)setLoadedComparison({key:comparisonKey,values:values as [PlayerDetail,PlayerDetail]})}).catch(reason=>{if(active&&reason?.kind!=="cancelled")setError(reason instanceof Error?reason.message:"선수 비교 정보를 불러오지 못했습니다.")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false;controller.abort()}},[cards,grades]);
  const [left,right]=details;
  const labels=left&&right?[...new Set([...left.abilities.map(row=>row.label),...right.abilities.map(row=>row.label)])]:[];
  const ability=(detail:PlayerDetail,label:string)=>detail.abilities.find(row=>row.label===label)?.value;
  const changeGrade=(index:0|1,delta:number)=>setGrades(current=>setComparisonGrade(current,index,current[index]+delta));
  return <View style={s.comparePanel}><View style={s.compareHeading}><View><Text style={s.eyebrow}>PLAYER COMPARISON</Text><Text style={s.headingCompact}>선수 비교</Text></View><Pressable onPress={onClose} accessibilityLabel="선수 비교 닫기"><Text style={s.compareClose}>×</Text></Pressable></View><View style={s.compareHeroes}>{cards.map((card,index)=><View style={s.compareHero} key={card.spId}><CardImage card={card} size={72} seasonImageUrl={card.seasonImageUrl}/><Text style={s.playerName} numberOfLines={2}>{card.name}</Text><Text style={s.muted} numberOfLines={1}>{card.seasonName}</Text><Text style={s.dbMeta}>{card.primaryPosition} · 급여 {card.salary||"-"}</Text><FootRatings right={card.rightFoot} left={card.leftFoot}/><View style={s.compareGrade}><Pressable onPress={()=>changeGrade(index as 0|1,-1)}><Text style={s.compareGradeButton}>−</Text></Pressable><Text style={s.compareGradeValue}>{grades[index]}강</Text><Pressable onPress={()=>changeGrade(index as 0|1,1)}><Text style={s.compareGradeButton}>＋</Text></Pressable></View></View>)}</View>{loading&&<View style={s.loadingRow}><ActivityIndicator color={C.green}/><Text style={s.green}>두 선수의 능력치를 비교하는 중…</Text></View>}{!!error&&<Text style={s.error}>{error}</Text>}{left&&right&&<View style={s.compareTable}><View style={s.compareOverall}><Text style={[s.compareOverallValue,{color:statColor(left.overall)}]}>{left.overall}</Text><Text style={s.compareLabel}>OVR</Text><Text style={[s.compareOverallValue,{color:statColor(right.overall)}]}>{right.overall}</Text></View>{labels.map(label=>{const l=ability(left,label),r=ability(right,label),comparison=compareAbility(l,r);return <View style={s.compareRow} key={label}><View style={s.compareStat}><Text style={[s.compareStatValue,comparison.leftWins&&s.compareWinner]}>{l??"정보 없음"}</Text><Text style={s.compareDelta}>{comparison.leftDelta}</Text></View><Text style={s.compareLabel}>{label}</Text><View style={s.compareStat}><Text style={[s.compareStatValue,comparison.rightWins&&s.compareWinner]}>{r??"정보 없음"}</Text><Text style={s.compareDelta}>{comparison.rightDelta}</Text></View></View>})}</View>}</View>;
}

function UpgradeDataCard({ card, grade, overall }: { card: PlayerCard; grade: number; overall?: number }) {
  const sources=[
    "https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersActionHigh/p"+card.spId+".png",
    "https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p"+card.spId+".png",
    ...card.imageUrls,
  ];
  const [index,setIndex]=useState(0),[failed,setFailed]=useState(false);
  useEffect(()=>{setIndex(0);setFailed(false)},[card.spId]);
  return <View style={s.upgradeDataCard}>
    <View style={s.upgradeCardShine}/>
    {!!card.seasonImageUrl&&<Image source={{uri:card.seasonImageUrl}} style={s.upgradeCardSeason} resizeMode="contain"/>}
    <Text style={s.upgradeCardOvr}>{overall??card.overall}</Text><Text style={s.upgradeCardPosition}>{card.primaryPosition}</Text>
    {!failed?<Image source={{uri:sources[index]}} style={s.upgradeCardPlayer} resizeMode="contain" onError={()=>index+1<sources.length?setIndex(index+1):setFailed(true)}/>:<Text style={s.upgradeCardFallback}>{card.name.slice(0,1)}</Text>}
    <View style={s.upgradeCardBottom}><Text style={s.upgradeCardName} numberOfLines={1}>{card.name}</Text><Text style={s.upgradeCardClass} numberOfLines={1}>{card.seasonName}</Text></View>
    <View style={s.upgradeCardGrade}><Text style={s.upgradeCardGradeText}>+{grade}</Text></View>
  </View>;
}

function UpgradeSimulator({ card, initialGrade }: { card: PlayerCard; initialGrade: number }) {
  const [grade,setGrade]=useState(Math.min(13,Math.max(1,initialGrade))),[boost,setBoost]=useState(5),[protectGrade,setProtectGrade]=useState(false),[running,setRunning]=useState(false),[runningCount,setRunningCount]=useState(1),[result,setResult]=useState<UpgradeResult|null>(null),[batchResult,setBatchResult]=useState<{attempts:number;successes:number;finalGrade:number}|null>(null),[history,setHistory]=useState<UpgradeHistoryItem[]>([]);
  const [upgradeStats,setUpgradeStats]=useState<UpgradeStats>({attempts:0,successes:0});
  const [overall,setOverall]=useState<{current?:number;target?:number}>({});
  const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null),motion=useRef(new Animated.Value(0)).current,animationRef=useRef<Animated.CompositeAnimation|null>(null),upgradeScrollRef=useRef<ScrollView>(null),upgradeHeroYRef=useRef(0);
  useEffect(()=>{void Promise.all([loadUpgradeHistory(),loadUpgradeStats()]).then(([savedHistory,savedStats])=>{setHistory(savedHistory);setUpgradeStats(savedStats)})},[]);
  useEffect(()=>()=>{if(timerRef.current)clearTimeout(timerRef.current);animationRef.current?.stop()},[]);
  const canProtect=canUseGradeProtection(grade);
  useEffect(()=>{if(!canProtect&&protectGrade)setProtectGrade(false)},[canProtect,protectGrade]);
  useEffect(()=>{let active=true;const controller=new AbortController();setOverall({});const requests=[fetchPlayerDetail(card.spId,grade,{adaptation:1},controller.signal),...(grade<13?[fetchPlayerDetail(card.spId,grade+1,{adaptation:1},controller.signal)]:[])];Promise.all(requests).then(([current,target])=>{if(active)setOverall({current:current.overall,target:target?.overall})}).catch(()=>undefined);return()=>{active=false;controller.abort()}},[card.spId,grade]);
  const probability=grade<13?upgradeProbability(grade,boost):0,attempts=upgradeStats.attempts,successes=upgradeStats.successes;
  const cardScale=motion.interpolate({inputRange:[0,1],outputRange:[1,1.075]}),glowOpacity=motion.interpolate({inputRange:[0,1],outputRange:[0.12,0.95]});
  function chooseGrade(value:number){if(running)return;setGrade(value);setResult(null);setBatchResult(null)}
  function attempt(count:number){
    if(running||grade>=13)return;
    const results=simulateUpgradeSeries(grade,boost,count,canProtect&&protectGrade);
    if(!results.length)return;
    upgradeScrollRef.current?.scrollTo({y:Math.max(0,upgradeHeroYRef.current-8),animated:true});
    setRunning(true);setRunningCount(count);setResult(null);setBatchResult(null);Vibration.vibrate(35);motion.setValue(0);
    animationRef.current=Animated.loop(Animated.sequence([
      Animated.timing(motion,{toValue:1,duration:360,easing:Easing.inOut(Easing.cubic),useNativeDriver:true}),
      Animated.timing(motion,{toValue:0.15,duration:280,easing:Easing.inOut(Easing.cubic),useNativeDriver:true}),
    ]),{iterations:3});
    animationRef.current.start();
    timerRef.current=setTimeout(()=>{
      animationRef.current?.stop();motion.setValue(0);
      const last=results[results.length-1],stamp=Date.now();
      const items=results.map((next,index):UpgradeHistoryItem=>({
        id:String(stamp)+"-"+index+"-"+Math.random().toString(36).slice(2,6),
        spId:card.spId,name:card.name,seasonName:card.seasonName,
        imageUrl:"https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersActionHigh/p"+card.spId+".png",
        fromGrade:next.fromGrade,toGrade:next.toGrade,success:next.success,probability:next.probability,boost:next.boost,defended:next.defended,createdAt:new Date(stamp+index).toISOString(),
      }));
      setResult(last);setBatchResult(count>1?{attempts:results.length,successes:results.filter(item=>item.success).length,finalGrade:last.toGrade}:null);setGrade(Math.min(13,last.toGrade));setRunning(false);Vibration.vibrate(last.success?[0,80,60,160]:[0,180]);void rememberUpgrades(items).then(saved=>{setHistory(saved.history);setUpgradeStats(saved.stats)});
    },2100);
  }
  function confirmHistoryReset(){
    if(!attempts||running)return;
    Alert.alert("강화 기록 초기화","누적 집계와 최근 강화 기록을 모두 지울까요?",[
      {text:"취소",style:"cancel"},
      {text:"초기화",style:"destructive",onPress:()=>{void clearUpgradeHistory().then(()=>{setHistory([]);setUpgradeStats({attempts:0,successes:0});setResult(null);setBatchResult(null)})}},
    ]);
  }
  return <ScrollView ref={upgradeScrollRef} contentContainerStyle={s.content} nestedScrollEnabled>
    <Text style={s.eyebrow}>UPGRADE LAB</Text><Text style={s.playerHeroName}>강화 실험실</Text><Text style={s.upgradeNotice}>실제 게임 재화가 사용되지 않는 앱 내 시뮬레이션입니다.</Text>
    <View onLayout={event=>{upgradeHeroYRef.current=event.nativeEvent.layout.y}} style={[s.upgradeHero,result?.success&&s.upgradeHeroSuccess,result&&!result.success&&s.upgradeHeroFail]}>
      <Animated.View pointerEvents="none" style={[s.upgradeGlow,{opacity:glowOpacity}]}/>
      <Animated.View style={{transform:[{scale:cardScale}]}}><UpgradeDataCard card={card} grade={grade} overall={overall.current}/></Animated.View>
      {running&&<View style={s.upgradeResult}><View style={s.upgradeEnergyRow}>{[0,1,2,3,4].map(value=><View key={value} style={s.upgradeEnergyDot}/>)}</View><Text style={s.upgradeRunningText}>{runningCount===10?"10번의 강화 결과를 계산하는 중…":"강화 에너지가 카드에 집중되는 중…"}</Text></View>}
      {!running&&batchResult&&<View style={s.upgradeResult}><Text style={s.upgradeResultTitle}>10회 강화 결과</Text><Text style={s.upgradeResultGrade}>성공 {batchResult.successes} · 실패 {batchResult.attempts-batchResult.successes}</Text><Text style={s.upgradeBatchFinal}>최종 +{batchResult.finalGrade}강</Text></View>}
      {!running&&!batchResult&&result&&<View style={s.upgradeResult}><Text style={[s.upgradeResultTitle,{color:result.success?C.green:result.defended?"#78a7ff":C.red}]}>{result.success?"강화 성공!":result.defended?"방어 성공":"강화 실패"}</Text><Text style={s.upgradeResultGrade}>+{result.fromGrade} → +{result.toGrade}</Text><Text style={s.muted}>{result.success?"한 단계 더 높은 곳으로 올라갔습니다.":result.defended?"강화 단계가 안전하게 유지됐습니다.":"복구 단계에서 다시 도전할 수 있습니다."}</Text></View>}
    </View>
    <Text style={s.heading}>시작 강화 단계</Text><ScrollView horizontal directionalLockEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={s.upgradeChoices}>{Array.from({length:12},(_,index)=>index+1).map(value=><Pressable key={value} disabled={running} style={[s.upgradeChoice,grade===value&&s.upgradeChoiceActive]} onPress={()=>chooseGrade(value)}><Text style={grade===value?s.upgradeChoiceTextActive:s.muted}>+{value}</Text></Pressable>)}</ScrollView>
    <View style={s.upgradePanel}><View style={s.upgradePanelHeading}><Text style={s.headingCompact}>부스트 게이지</Text><Text style={s.upgradeProbability}>{grade>=13?"MAX":probability+"%"}</Text></View><Text style={s.muted}>{grade>=13?"최고 강화 단계에 도달했습니다.":"게이지를 채울수록 성공 확률이 높아집니다."}</Text><View style={s.upgradeGauge}>{[1,2,3,4,5].map(value=><Pressable key={value} disabled={running||grade>=13} style={[s.upgradeGaugeCell,value<=boost&&s.upgradeGaugeCellActive]} onPress={()=>setBoost(value)} accessibilityLabel={"부스트 게이지 "+value+"칸"}/>)}</View><View style={s.upgradeGaugeLabels}><Text style={s.muted}>1칸</Text><Text style={s.muted}>5칸</Text></View>
      <View style={[s.upgradeProtect,!canProtect&&s.upgradeProtectDisabled]}><View style={s.flex}><Text style={s.upgradeProtectTitle}>🛡️ 강화 단계 방어</Text><Text style={s.muted}>{canProtect?"실패해도 현재 강화 단계가 유지됩니다.":"8강부터 사용할 수 있습니다."}</Text></View><View style={s.upgradeProtectSwitchWrap}><Switch style={s.upgradeProtectSwitch} value={canProtect&&protectGrade} onValueChange={setProtectGrade} disabled={running||!canProtect} trackColor={{false:C.line,true:"#315d47"}} thumbColor={canProtect&&protectGrade?C.green:"#70847a"} accessibilityLabel="강화 단계 방어"/></View></View>
      <View style={s.upgradeActions}><Pressable disabled={running||grade>=13} style={[s.upgradeButton,s.upgradeSingleButton,(running||grade>=13)&&s.disabled]} onPress={()=>attempt(1)}><Text style={s.upgradeButtonText}>{grade>=13?"최고 강화":running?"진행 중":"1회 도전"}</Text></Pressable><Pressable disabled={running||grade>=13} style={[s.upgradeButton,s.upgradeTenButton,(running||grade>=13)&&s.disabled]} onPress={()=>attempt(10)}><Text style={s.upgradeTenButtonText}>10회 한꺼번에</Text></Pressable></View>
      <Text style={s.upgradeProbabilityNote}>표시 확률과 실패 복구 단계는 재미를 위한 시뮬레이션 값입니다.</Text></View>
    <View style={s.upgradeHistoryHeading}><Text style={s.headingCompact}>나의 강화 기록</Text><Pressable disabled={!attempts||running} style={[s.upgradeHistoryReset,(!attempts||running)&&s.disabled]} onPress={confirmHistoryReset} accessibilityRole="button" accessibilityLabel="강화 기록 초기화"><Text style={s.upgradeHistoryResetText}>기록 초기화</Text></Pressable></View>
    <View pointerEvents="none" style={s.upgradeStats}><Kpi compact label="전체" value={`${attempts}`} note="누적 기록"/><Kpi compact label="성공" value={`${successes}`} note={attempts?`${Math.round(successes/attempts*100)}% 성공`:"도전 전"}/><Kpi compact label="실패" value={`${attempts-successes}`} note="누적 결과"/></View>
    {attempts>history.length&&<Text style={s.upgradeHistoryLimit}>상세 내역은 최근 {history.length}회까지 표시됩니다.</Text>}
    {history.length===0?<Text style={s.warning}>아직 강화 기록이 없습니다. 첫 강화에 도전해 보세요.</Text>:<View style={s.upgradeHistory}>{history.map(item=><View style={s.upgradeHistoryCard} key={item.id}><Image source={{uri:item.imageUrl}} style={s.upgradeHistoryImage} resizeMode="contain"/><View style={[s.upgradeHistoryResult,item.success?s.upgradeHistorySuccess:item.defended?s.upgradeHistoryDefended:s.upgradeHistoryFail]}><Text style={s.upgradeHistoryResultText}>{item.success?"성공":item.defended?"방어":"실패"}</Text></View><View style={s.flex}><Text style={s.playerName} numberOfLines={1}>{item.name}</Text><Text style={s.muted} numberOfLines={1}>{item.seasonName}</Text><Text style={s.muted}>{item.boost}칸 · {item.probability}%</Text></View><Text style={s.upgradeHistoryGrade}>+{item.fromGrade} → +{item.toGrade}</Text></View>)}</View>}
  </ScrollView>;
}

const MOBILE_DEFAULT_FILTERS: PlayerSearchFilters={query:"",seasonIds:[],positions:[],grade:1,bodyTypes:[],includeTraits:[],excludeTraits:[],abilities:[],sort:"overall-desc"};
function mobileHasFilters(filters:PlayerSearchFilters){return Object.entries(filters).some(([key,value])=>!["query","grade","sort","limit","page","pageSize"].includes(key)&&(Array.isArray(value)?value.length:value!==undefined&&value!==""))}
function mobileToggle<T>(values:T[]|undefined,value:T){return values?.includes(value)?values.filter(item=>item!==value):[...(values??[]),value]}
function mobileNumber(value:string){return value===""?undefined:Number(value)}
function MobilePlayerFilters({value,meta,onChange,onReset,onApply}:{value:PlayerSearchFilters;meta:PlayerFilterMetadata|null;onChange:(value:PlayerSearchFilters)=>void;onReset:()=>void;onApply:()=>void}){
  const [ability,setAbility]=useState(""),[abilityMin,setAbilityMin]=useState(""),[abilityMax,setAbilityMax]=useState("");
  const [seasonQuery,setSeasonQuery]=useState(""),[seasonsExpanded,setSeasonsExpanded]=useState(false);
  const [teamColorOpen,setTeamColorOpen]=useState(false),[teamColorQuery,setTeamColorQuery]=useState("");
  const selectedTeamColor=meta?.teamColors?.find(row=>row.id===value.teamColorId);
  const matchingTeamColors=useMemo(()=>{const keyword=teamColorQuery.trim().toLocaleLowerCase("ko-KR");return (meta?.teamColors??[]).filter(row=>!keyword||row.name.toLocaleLowerCase("ko-KR").includes(keyword)).slice(0,100)},[meta?.teamColors,teamColorQuery]);
  const matchingSeasons=useMemo(()=>{const keyword=seasonQuery.trim().toLocaleLowerCase("ko-KR"),selected=new Set(value.seasonIds??[]);return (meta?.seasons??[]).filter(row=>!keyword||row.name.toLocaleLowerCase("ko-KR").includes(keyword)).sort((a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id)))},[meta?.seasons,seasonQuery,value.seasonIds]);
  const visibleSeasons=seasonQuery.trim()||seasonsExpanded?matchingSeasons:matchingSeasons.slice(0,12);
  const numberInput=(label:string,minKey:keyof PlayerSearchFilters,maxKey:keyof PlayerSearchFilters)=><View style={s.mobileFilterPair}><Text style={s.mobileFilterLabel}>{label}</Text><TextInput style={s.mobileFilterInput} keyboardType="number-pad" placeholder="최소" placeholderTextColor={C.muted} value={String(value[minKey]??"")} onChangeText={raw=>onChange({...value,[minKey]:mobileNumber(raw)})}/><Text style={s.muted}>~</Text><TextInput style={s.mobileFilterInput} keyboardType="number-pad" placeholder="최대" placeholderTextColor={C.muted} value={String(value[maxKey]??"")} onChangeText={raw=>onChange({...value,[maxKey]:mobileNumber(raw)})}/></View>;
  return <View style={s.mobileFilterPanel}><View style={s.mobileFilterHeading}><View style={s.flex}><Text style={s.mobileFilterHeadingTitle}>조건 검색</Text><Text style={s.mobileFilterDescription}>여러 조건을 조합해 원하는 선수를 찾을 수 있습니다.</Text></View><Pressable style={s.mobileFilterReset} onPress={onReset}><Text style={s.mobileFilterResetText}>전체 초기화</Text></Pressable></View>
    <Text style={s.mobileFilterTitle}>팀컬러</Text><View style={s.mobileTeamColorRow}><Pressable style={[s.mobileTeamColorButton,selectedTeamColor&&s.mobileTeamColorButtonActive]} onPress={()=>setTeamColorOpen(true)} accessibilityRole="button" accessibilityLabel="팀컬러 검색 열기"><Text numberOfLines={1} style={selectedTeamColor?s.mobileTeamColorTextActive:s.mobileTeamColorText}>{selectedTeamColor?.name??"팀컬러 검색·선택"}</Text>{selectedTeamColor&&<Text style={s.mobileTeamColorLevel}>{selectedTeamColor.level}단계</Text>}</Pressable>{selectedTeamColor&&<Pressable style={s.mobileTeamColorClear} onPress={()=>onChange({...value,teamColorId:undefined})} accessibilityLabel="선택한 팀컬러 해제"><Text style={s.mobileTeamColorClearText}>해제</Text></Pressable>}</View>
    <Modal visible={teamColorOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setTeamColorOpen(false)}><SafeAreaView style={s.teamColorModalSafe}><View style={s.teamColorModalHeader}><View><Text style={s.headingCompact}>팀컬러 선택</Text><Text style={s.muted}>전체 {meta?.teamColors?.length??0}개</Text></View><Pressable style={s.teamColorModalClose} onPress={()=>setTeamColorOpen(false)} accessibilityLabel="팀컬러 검색 닫기"><Text style={s.teamColorModalCloseText}>×</Text></Pressable></View><TextInput autoFocus style={s.teamColorModalSearch} value={teamColorQuery} onChangeText={setTeamColorQuery} placeholder="팀컬러 이름 검색" placeholderTextColor={C.muted} returnKeyType="search"/><ScrollView contentContainerStyle={s.teamColorModalList} keyboardShouldPersistTaps="handled">{matchingTeamColors.map(row=><Pressable style={[s.teamColorModalItem,value.teamColorId===row.id&&s.teamColorModalItemActive]} onPress={()=>{onChange({...value,teamColorId:row.id});setTeamColorOpen(false)}} key={row.id}><Text numberOfLines={2} style={value.teamColorId===row.id?s.teamColorModalItemTextActive:s.teamColorModalItemText}>{row.name}</Text><Text style={value.teamColorId===row.id?s.teamColorModalItemLevelActive:s.teamColorModalItemLevel}>{row.level}단계</Text></Pressable>)}{matchingTeamColors.length===0&&<Text style={s.mobileSeasonEmpty}>일치하는 팀컬러가 없습니다.</Text>}{matchingTeamColors.length===100&&<Text style={s.teamColorModalHint}>검색어를 더 입력하면 원하는 팀컬러를 빠르게 찾을 수 있습니다.</Text>}</ScrollView></SafeAreaView></Modal>
    <View style={s.mobileSeasonTitleRow}><View><Text style={s.mobileFilterTitle}>선수 클래스</Text><Text style={s.mobileSeasonCount}>선택 {value.seasonIds?.length??0}개 · 전체 {meta?.seasons.length??0}개</Text></View>{(value.seasonIds?.length??0)>0&&<Pressable onPress={()=>onChange({...value,seasonIds:[]})}><Text style={s.green}>선택 해제</Text></Pressable>}</View>
    <TextInput style={s.mobileSeasonSearch} value={seasonQuery} onChangeText={setSeasonQuery} placeholder="클래스명 검색" placeholderTextColor={C.muted} returnKeyType="done"/>
    <View style={s.mobileSeasonGrid}>{visibleSeasons.map(row=><Pressable style={[s.mobileSeasonChip,value.seasonIds?.includes(row.id)&&s.mobileFilterChipActive]} onPress={()=>onChange({...value,seasonIds:mobileToggle(value.seasonIds,row.id)})} key={row.id}>{row.imageUrl&&<Image source={{uri:row.imageUrl}} style={s.mobileSeasonImage}/>}<Text numberOfLines={2} style={value.seasonIds?.includes(row.id)?s.mobileFilterChipTextActive:s.mobileFilterChipText}>{row.name}</Text></Pressable>)}</View>
    {!seasonQuery.trim()&&matchingSeasons.length>12&&<Pressable style={s.mobileSeasonMore} onPress={()=>setSeasonsExpanded(value=>!value)}><Text style={s.green}>{seasonsExpanded?"간단히 보기":`전체 보기 (+${matchingSeasons.length-12})`}</Text></Pressable>}
    {seasonQuery.trim()&&matchingSeasons.length===0&&<Text style={s.mobileSeasonEmpty}>일치하는 클래스가 없습니다.</Text>}
    <Text style={s.mobileFilterTitle}>포지션</Text><View style={s.mobileFilterWrap}>{meta?.positions.map(position=><Pressable style={[s.mobileFilterChip,value.positions?.includes(position)&&s.mobileFilterChipActive]} onPress={()=>onChange({...value,positions:mobileToggle(value.positions,position)})} key={position}><Text style={value.positions?.includes(position)?s.mobileFilterChipTextActive:s.mobileFilterChipText}>{position}</Text></Pressable>)}</View>
    <View style={s.mobileGradeRow}><Text style={s.mobileFilterLabel}>강화</Text><Pressable style={s.mobileStepButton} onPress={()=>onChange({...value,grade:Math.max(1,(value.grade??1)-1)})}><Text style={s.green}>−</Text></Pressable><Text style={s.mobileGradeValue}>{value.grade??1}강</Text><Pressable style={s.mobileStepButton} onPress={()=>onChange({...value,grade:Math.min(13,(value.grade??1)+1)})}><Text style={s.green}>＋</Text></Pressable></View>
    {numberInput("OVR","overallMin","overallMax")}{numberInput("급여","salaryMin","salaryMax")}{numberInput("키(cm)","heightMin","heightMax")}{numberInput("몸무게(kg)","weightMin","weightMax")}{numberInput("약발","weakFootMin","weakFootMax")}{numberInput("개인기","skillMovesMin","skillMovesMax")}
    <Text style={s.mobileFilterTitle}>주발</Text><View style={s.mobileFilterWrap}>{["왼발","오른발","양발"].map(foot=><Pressable style={[s.mobileFilterChip,value.preferredFoot===foot&&s.mobileFilterChipActive]} onPress={()=>onChange({...value,preferredFoot:value.preferredFoot===foot?"":foot})} key={foot}><Text style={value.preferredFoot===foot?s.mobileFilterChipTextActive:s.mobileFilterChipText}>{foot}</Text></Pressable>)}</View>
    <Text style={s.mobileFilterTitle}>체형</Text><View style={s.mobileFilterWrap}>{meta?.bodyTypes.map(type=><Pressable style={[s.mobileFilterChip,value.bodyTypes?.includes(type)&&s.mobileFilterChipActive]} onPress={()=>onChange({...value,bodyTypes:mobileToggle(value.bodyTypes,type)})} key={type}><Text style={value.bodyTypes?.includes(type)?s.mobileFilterChipTextActive:s.mobileFilterChipText}>{type}</Text></Pressable>)}</View>
    <TextInput style={s.mobileFilterWideInput} placeholder="국가" placeholderTextColor={C.muted} value={value.nation??""} onChangeText={nation=>onChange({...value,nation})}/><TextInput style={s.mobileFilterWideInput} placeholder="포함할 특성 (쉼표로 구분)" placeholderTextColor={C.muted} value={(value.includeTraits??[]).join(",")} onChangeText={raw=>onChange({...value,includeTraits:raw.split(",").map(item=>item.trim()).filter(Boolean)})}/><TextInput style={s.mobileFilterWideInput} placeholder="제외할 특성 (쉼표로 구분)" placeholderTextColor={C.muted} value={(value.excludeTraits??[]).join(",")} onChangeText={raw=>onChange({...value,excludeTraits:raw.split(",").map(item=>item.trim()).filter(Boolean)})}/>
    <Text style={s.mobileFilterTitle}>세부 능력치</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.mobileFilterChips}>{meta?.abilities.map(label=><Pressable style={[s.mobileFilterChip,ability===label&&s.mobileFilterChipActive]} onPress={()=>setAbility(label)} key={label}><Text style={ability===label?s.mobileFilterChipTextActive:s.mobileFilterChipText}>{label}</Text></Pressable>)}</ScrollView><View style={s.mobileFilterPair}><TextInput style={s.mobileFilterInput} keyboardType="number-pad" placeholder="최소" placeholderTextColor={C.muted} value={abilityMin} onChangeText={setAbilityMin}/><Text style={s.muted}>~</Text><TextInput style={s.mobileFilterInput} keyboardType="number-pad" placeholder="최대" placeholderTextColor={C.muted} value={abilityMax} onChangeText={setAbilityMax}/><Pressable style={s.mobileFilterAdd} onPress={()=>{if(ability)onChange({...value,abilities:[...(value.abilities??[]).filter(row=>row.label!==ability),{label:ability,min:mobileNumber(abilityMin),max:mobileNumber(abilityMax)}]})}}><Text style={s.primaryText}>추가</Text></Pressable></View><View style={s.mobileFilterWrap}>{value.abilities?.map(row=><Pressable style={s.mobileFilterTag} onPress={()=>onChange({...value,abilities:value.abilities?.filter(item=>item.label!==row.label)})} key={row.label}><Text style={s.green}>{row.label} {row.min??"-"}~{row.max??"-"} ×</Text></Pressable>)}</View>
    <Text style={s.mobileFilterTitle}>정렬</Text><View style={s.mobileFilterWrap}>{[["overall-desc","OVR 높은 순"],["overall-asc","OVR 낮은 순"],["salary-desc","급여 높은 순"],["name-asc","이름 순"]].map(([key,label])=><Pressable style={[s.mobileFilterChip,value.sort===key&&s.mobileFilterChipActive]} onPress={()=>onChange({...value,sort:key})} key={key}><Text style={value.sort===key?s.mobileFilterChipTextActive:s.mobileFilterChipText}>{label}</Text></Pressable>)}</View>
    <Pressable style={s.mobileFilterApply} onPress={onApply}><Text style={s.primaryText}>이 조건으로 검색</Text></Pressable>
  </View>
}

function PlayerDatabase({ matches, onBack, onHeaderBackChange, initialQuery = "" }: { matches: Match[]; onBack: () => void; onHeaderBackChange: (handler: (() => void) | null) => void; initialQuery?: string }) {
  const [query,setQuery]=useState(initialQuery),[rows,setRows]=useState<PlayerCard[]>([]),[loading,setLoading]=useState(false),[detailLoading,setDetailLoading]=useState(false),[error,setError]=useState(""),[selected,setSelected]=useState<PlayerCard|null>(null),[loadedDetail,setLoadedDetail]=useState<{key:string;value:PlayerDetail}|null>(null),[grade,setGrade]=useState(1),[favorites,setFavorites]=useState<number[]>([]);
  const [detailOptions,setDetailOptions]=useState<PlayerDetailOptions>({adaptation:1}),[focusedTraining,setFocusedTraining]=useState<Record<string,number>>({});
  const detailKey=JSON.stringify([selected?.spId,grade,detailOptions]);
  const detail=loadedDetail?.key===detailKey?loadedDetail.value:null;
  const [compare,setCompare]=useState<PlayerCard[]>([]);
  const [simulatorOpen,setSimulatorOpen]=useState(false);
  const [filters,setFilters]=useState<PlayerSearchFilters>({...MOBILE_DEFAULT_FILTERS}),[filterMeta,setFilterMeta]=useState<PlayerFilterMetadata|null>(null),[filtersOpen,setFiltersOpen]=useState(false);
  const [hasMore,setHasMore]=useState(false),[resultTotal,setResultTotal]=useState(0),[catalog,setCatalog]=useState<PlayerCatalogStatus|null>(null);
  const pageRef=useRef(0);
  const appliedSearchRef=useRef<PlayerSearchFilters|null>(null);
  const searchAbortRef=useRef<AbortController|null>(null);
  useEffect(()=>{void loadPlayerFavorites().then(setFavorites)},[]);
  useEffect(()=>{if(!selected)return;let active=true;const controller=new AbortController();setDetailLoading(true);setLoadedDetail(null);setError("");void fetchPlayerDetail(selected.spId,grade,detailOptions,controller.signal).then(value=>{if(active)setLoadedDetail({key:detailKey,value})}).catch(reason=>{if(active&&reason?.kind!=="cancelled")setError(reason instanceof Error?reason.message:"선수 상세 조회 실패")}).finally(()=>{if(active)setDetailLoading(false)});return()=>{active=false;controller.abort()}},[selected,grade,detailOptions]);
  const closeDetail=useCallback(()=>{setSelected(null);setLoadedDetail(null);setSimulatorOpen(false)},[]);
  const closeSimulator=useCallback(()=>setSimulatorOpen(false),[]);
  useEffect(()=>{onHeaderBackChange(simulatorOpen?closeSimulator:selected?closeDetail:onBack);return()=>onHeaderBackChange(null)},[simulatorOpen,selected,closeSimulator,closeDetail,onBack,onHeaderBackChange]);
  useEffect(()=>{const controller=new AbortController();void fetchPlayerFilters(controller.signal).then(setFilterMeta).catch(()=>undefined);return()=>controller.abort()},[]);
  useEffect(()=>()=>searchAbortRef.current?.abort(),[]);
  const runSearch=useCallback(async(value:string,current:PlayerSearchFilters,append=false)=>{const nextPage=append?pageRef.current+1:1;const request=playerSearchRequest({...current,query:value},appliedSearchRef.current,nextPage);if(!request.query.trim()&&!mobileHasFilters(request)){setError("선수명 또는 검색 조건을 입력해 주세요.");return}searchAbortRef.current?.abort();const controller=new AbortController();searchAbortRef.current=controller;setLoading(true);setError("");try{const result=await searchPlayers(request,controller.signal);if(searchAbortRef.current===controller){appliedSearchRef.current=request;setRows(previous=>append?[...previous,...result.players.filter(row=>!previous.some(item=>item.spId===row.spId))]:result.players);pageRef.current=result.page;setHasMore(result.hasMore);setResultTotal(result.total);setCatalog(result.catalog);setSelected(null);if(!append)setFiltersOpen(false)}}catch(reason){if(searchAbortRef.current===controller&&(reason as {kind?:string})?.kind!=="cancelled")setError(reason instanceof Error?reason.message:"선수 검색 실패")}finally{if(searchAbortRef.current===controller){searchAbortRef.current=null;setLoading(false)}}},[]);
  useEffect(()=>{if(initialQuery.trim()){setQuery(initialQuery);void runSearch(initialQuery,MOBILE_DEFAULT_FILTERS)}},[initialQuery,runSearch]);
  async function run(){await runSearch(query,filters,false)}
  function toggleCompare(card:PlayerCard){setCompare(current=>current.some(item=>item.spId===card.spId)?current.filter(item=>item.spId!==card.spId):current.length<2?[...current,card]:[current[1],card])}
  function choose(card:PlayerCard){setSelected(card);setLoadedDetail(null);setGrade(card.grade||1);setDetailOptions({adaptation:1});setFocusedTraining({});setSimulatorOpen(false);setError("")}
  const trainingLimit=focusedTrainingLimit(grade),trainedCount=Object.values(focusedTraining).filter(value=>value>0).length;
  const focusedOverall=detail?focusedTrainingOvr(detail.primaryPosition,detail.overall,detail.abilities,focusedTraining):0;
  const focusedOverallDelta=detail?focusedOverall-detail.overall:0;
  const abilityColumns=detail?orderedAbilityColumns(detail.abilities):[];
  function changeFocusedTraining(label:string,delta:number){setFocusedTraining(current=>{const value=current[label]??0;if(delta>0&&value===0&&Object.values(current).filter(item=>item>0).length>=trainingLimit)return current;const next=Math.max(0,Math.min(2,value+delta));if(next===0){const copy={...current};delete copy[label];return copy}return {...current,[label]:next}})}
  if(selected&&simulatorOpen)return <UpgradeSimulator card={selected} initialGrade={grade}/>;
  if(selected){
    const appearances=matches.flatMap(match=>{const player=match.players.find(p=>p.spId===selected.spId&&p.rating>0);return player?[{match,player}]:[]});
    return <ScrollView contentContainerStyle={s.content}><View style={s.dbHero}><CardImage card={detail??selected} size={118} seasonImageUrl={selected.seasonImageUrl}/><View style={s.flex}><Text style={s.eyebrow}>PLAYER INFORMATION</Text><Text style={s.playerHeroName}>{selected.name}</Text><Text style={s.muted}>{selected.seasonName}</Text>{detail&&<><View style={s.dbOverallRow}><Text style={[s.dbOverall,{color:statColor(focusedOverall)}]}>{detail.primaryPosition} {focusedOverall}</Text>{detail.overallDelta+focusedOverallDelta>0&&<Text style={s.dbDelta}>+{detail.overallDelta+focusedOverallDelta}</Text>}{focusedOverallDelta>0&&<Text style={s.dbEstimate}>예상</Text>}</View><Text style={s.muted}>{detail.nation} · 급여 {detail.salary}</Text></>}</View><Pressable onPress={()=>void togglePlayerFavorite(selected.spId).then(setFavorites)} accessibilityLabel="선수 즐겨찾기"><Text style={s.favorite}>{favorites.includes(selected.spId)?"★":"☆"}</Text></Pressable></View>
      <Pressable style={s.upgradeEntry} onPress={()=>setSimulatorOpen(true)} accessibilityRole="button" accessibilityLabel={`${selected.name} 강화 실험실 열기`}><View><Text style={s.upgradeEntryEyebrow}>UPGRADE LAB</Text><Text style={s.upgradeEntryTitle}>이 선수로 강화 도전</Text><Text style={s.upgradeEntryDescription}>게이지를 채우고 최고 강화 단계에 도전해 보세요.</Text></View><Text style={s.upgradeEntryArrow}>⚡ →</Text></Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dbGradeRow}><Text style={s.dbGradeLabel}>강화</Text>{Array.from({length:13},(_,index)=>index+1).map(value=><Pressable key={value} style={[s.dbGrade,value===grade&&s.dbGradeActive]} onPress={()=>{setGrade(value);setDetailOptions({adaptation:1});setFocusedTraining({})}}><Text style={value===grade?s.dbGradeActiveText:s.muted}>+{value}</Text></Pressable>)}</ScrollView>
      {detailLoading&&<View style={s.loadingRow}><ActivityIndicator color={C.green}/><Text style={s.green}>능력치와 시세를 불러오는 중…</Text></View>}{error&&<Text style={s.error}>{error}</Text>}{detail?.degraded&&<Text style={s.warning}>데이터센터 형식 변경으로 일부 선수 정보만 표시합니다. 누락 항목: {detail.missingFields?.join(", ")||"상세 정보"}</Text>}
      {detail&&<><View style={s.dbTeamColor}><Text style={s.eyebrow}>TEAM COLOR DATABASE</Text><Text style={s.headingCompact}>능력치 적용 설정</Text><Text style={s.muted}>적응도와 팀컬러를 선택하면 기본 능력치 대비 상승값을 계산합니다.</Text><View style={s.dbSelectorGroup}><Text style={s.dbSelectorLabel}>적응도</Text><View style={s.dbSelectorRow}>{([1,5] as const).map(value=><Pressable key={value} style={[s.dbChoice,detailOptions.adaptation===value&&s.dbChoiceActive]} onPress={()=>setDetailOptions(current=>({...current,adaptation:value}))}><Text style={detailOptions.adaptation===value?s.dbChoiceActiveText:s.muted}>적응도 {value}</Text></Pressable>)}</View></View><TeamColorChoices label="강화 팀컬러" value={detailOptions.enhancementId?`${detailOptions.enhancementId}:${detailOptions.enhancementLevel??1}`:"0"} options={detail.teamColorOptions.enhancement.map(option=>({value:`${option.id}:${option.level}`,name:option.name}))} onChange={value=>{const [id,level]=value.split(":").map(Number);setDetailOptions(current=>({...current,enhancementId:id||0,enhancementLevel:level||0}))}}/><TeamColorChoices label="소속 팀컬러" value={detailOptions.affiliationId?`${detailOptions.affiliationId}:${detailOptions.affiliationLevel??1}`:"0"} options={detail.teamColorOptions.affiliation.map(option=>({value:`${option.id}:${option.level}`,name:option.name}))} onChange={value=>{const [id,level]=value.split(":").map(Number);setDetailOptions(current=>({...current,affiliationId:id||0,affiliationLevel:level||0}))}}/><TeamColorChoices label="관계·특성 팀컬러" value={String(detailOptions.featureId??0)} options={detail.teamColorOptions.feature.map(option=>({value:String(option.id),name:option.name}))} onChange={value=>setDetailOptions(current=>({...current,featureId:Number(value)}))}/></View><View style={s.dbPills}>{[detail.birthDate,detail.height,detail.weight,detail.bodyType,`개인기 ${"★".repeat(detail.skillMoves)}`].filter(Boolean).map(value=><Text style={s.dbPill} key={value}>{value}</Text>)}<FootRatings right={detail.rightFoot} left={detail.leftFoot}/></View><View style={s.dbSummary}>{detail.summaryAbilities.map(row=><View style={s.dbSummaryCell} key={row.label}><Text style={s.muted}>{row.label}</Text><View style={s.dbValueRow}><Text style={[s.dbAbilityValue,{color:statColor(row.value)}]}>{row.value}</Text>{row.delta>0&&<Text style={s.dbDelta}>+{row.delta}</Text>}</View></View>)}</View>
        <Text style={s.heading}>시세</Text><View style={s.dbPanel}><Text style={s.dbPrice}>{detail.currentPrice?`${detail.currentPrice.toLocaleString("ko-KR")} BP`:"시세 정보 없음"}</Text><MobilePriceBars rows={detail.priceHistory}/></View>
        <Text style={s.heading}>특성</Text><View style={s.dbPills}>{detail.traits.map(value=><Text style={s.dbPill} key={value}>{value}</Text>)}</View>
        <Text style={s.heading}>포지션별 오버롤</Text><View style={s.dbStatGrid}>{detail.positions.map(row=>{const value=focusedTrainingOvr(row.position,row.value,detail.abilities,focusedTraining),delta=row.delta+value-row.value;return <View style={s.dbStat} key={row.position}><Text style={s.muted}>{row.position}</Text><View style={s.dbValueRow}><Text style={[s.dbAbilityValue,{color:statColor(value)}]}>{value}</Text>{delta>0&&<Text style={s.dbDelta}>+{delta}</Text>}</View></View>})}</View>
        <View style={s.dbTrainingHeading}><View style={s.flex}><Text style={s.heading}>세부 능력치 · 집중훈련</Text><Text style={s.muted}>능력치별 최대 +2 · {trainingLimit}개까지 선택 가능</Text><Text style={s.dbEstimateNote}>포지션 가중치와 0.75 반올림 기준 예상치입니다.</Text></View><Text style={s.dbTrainingCount}>{trainedCount}/{trainingLimit}</Text><View style={s.dbTrainingActions}><Pressable style={s.dbTrainingReset} onPress={()=>setFocusedTraining(recommendedFocusedTraining(detail.primaryPosition,detail.abilities,trainingLimit))}><Text style={s.dbTrainingResetText}>추천</Text></Pressable><Pressable style={[s.dbTrainingReset,trainedCount===0&&s.dbTrainingDisabled]} onPress={()=>setFocusedTraining({})} disabled={trainedCount===0}><Text style={s.dbTrainingResetText}>초기화</Text></Pressable></View></View><View style={s.dbAbilityGrid}>{abilityColumns.map((column,columnIndex)=><View style={s.dbAbilityColumn} key={columnIndex}>{column.map(row=>{const training=focusedTraining[row.label]??0,totalDelta=row.delta+training,value=row.value+training,canAdd=training<2&&(training>0||trainedCount<trainingLimit);return <View style={[s.dbAbility,row.delta>0&&s.dbAbilityBoosted,training>0&&s.dbAbilityTrained]} key={row.label}><Text style={s.muted}>{row.label}</Text><View style={s.dbTrainingValue}><View style={s.dbValueRow}><Text style={[s.dbPurple,{color:statColor(value)}]}>{value}</Text>{totalDelta>0&&<Text style={s.dbDelta}>+{totalDelta}</Text>}</View><View style={s.dbTrainingControls}><Pressable style={[s.dbTrainingButton,training===0&&s.dbTrainingDisabled]} onPress={()=>changeFocusedTraining(row.label,-1)} disabled={training===0} accessibilityLabel={`${row.label} 집중훈련 감소`}><Text style={s.dbTrainingButtonText}>−</Text></Pressable><Text style={s.dbTrainingLevel}>{training}</Text><Pressable style={[s.dbTrainingButton,!canAdd&&s.dbTrainingDisabled]} onPress={()=>changeFocusedTraining(row.label,1)} disabled={!canAdd} accessibilityLabel={`${row.label} 집중훈련 증가`}><Text style={s.dbTrainingButtonText}>＋</Text></Pressable></View></View></View>})}</View>)}</View>
        <Text style={s.heading}>클럽 경력</Text><View style={s.dbPanel}>{detail.clubCareer.length?<><View style={[s.dbClub,s.dbClubHeader]}><Text style={s.dbClubYears}>기간</Text><Text style={s.dbClubName}>클럽</Text><Text style={s.dbClubLoan}>구분</Text></View>{sortedClubCareer(detail.clubCareer).map((row,index)=><View style={s.dbClub} key={`${row.years}-${row.club}-${index}`}><Text style={s.dbClubYears}>{row.years}</Text><Text style={s.dbClubName} numberOfLines={2}>{row.club}</Text><Text style={s.dbClubLoan}>{row.loan}</Text></View>)}</>:<Text style={s.muted}>등록된 클럽 경력이 없습니다.</Text>}</View></>}
      <Text style={s.heading}>내 경기 기록</Text>{appearances.length?<View style={s.grid}><Kpi label="출전" value={`${appearances.length}`} note="조회 경기 기준"/><Kpi label="평균 평점" value={average(appearances.map(row=>row.player.rating)).toFixed(2)} note="내 경기 기록"/><Kpi label="골·도움" value={`${appearances.reduce((a,r)=>a+r.player.goals,0)} · ${appearances.reduce((a,r)=>a+r.player.assists,0)}`} note="누적 기록"/><Kpi label="사용 강화" value={`+${appearances[0].player.grade}`} note="사용 카드"/></View>:<Text style={s.warning}>현재 조회한 최근 경기에서는 이 시즌 카드의 출전 기록이 없습니다.</Text>}<Text style={s.dbNotice}>Data based on NEXON Open API · 선수 상세 정보는 EA SPORTS FC ONLINE 데이터센터 기반입니다.</Text></ScrollView>;
  }
  const listHeader=<View><Text style={s.eyebrow}>PLAYER INFORMATION</Text><Text style={s.playerHeroName}>선수 정보</Text><Text style={s.subtitle}>선수명 또는 조건으로 시즌 카드를 찾고 능력치·시세·내 경기 기록을 확인합니다.</Text><View style={s.dbSearch}><TextInput style={[s.input,s.flex]} value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={()=>void run()} accessibilityLabel="선수명 검색"/><Pressable style={s.dbSearchButton} onPress={()=>void run()}><Text style={s.primaryText}>검색</Text></Pressable></View><Pressable style={[s.mobileFilterToggle,(filtersOpen||mobileHasFilters(filters))&&s.mobileFilterToggleActive]} onPress={()=>setFiltersOpen(value=>!value)} accessibilityRole="button" accessibilityState={{expanded:filtersOpen}}><Text style={s.mobileFilterToggleText}>조건 검색</Text><Text style={s.mobileFilterToggleState}>{filtersOpen?"접기":mobileHasFilters(filters)?"적용 중":"열기"}</Text></Pressable>{filtersOpen&&<MobilePlayerFilters value={filters} meta={filterMeta} onChange={setFilters} onReset={()=>setFilters({...MOBILE_DEFAULT_FILTERS})} onApply={()=>void run()}/>} {loading&&pageRef.current===0&&<ActivityIndicator color={C.green} style={{marginTop:24}}/>}{error&&<Text style={s.error}>{error}</Text>}{catalog?.source==="fallback"&&<Text style={s.warning}>공식 데이터센터 응답이 불안정하여 마지막 저장 데이터를 표시합니다.</Text>}{compare.length===1&&<Text style={s.compareHint}>{compare[0].name} 선택됨 · 비교할 선수를 한 명 더 선택하세요.</Text>}{compare.length===2&&<MobilePlayerComparison cards={compare as [PlayerCard,PlayerCard]} onClose={()=>setCompare([])}/>} {!loading&&(query||mobileHasFilters(filters))&&rows.length===0&&!error&&<Text style={s.warning}>검색 결과가 없습니다.</Text>}{rows.length>0&&<View style={s.dbResultsHeading}><View><Text style={s.headingCompact}>검색 결과</Text><Text style={s.muted}>{resultTotal.toLocaleString("ko-KR")}개 중 {rows.length}개</Text></View><Pressable style={s.dbResultsEdit} onPress={()=>setFiltersOpen(true)}><Text style={s.green}>조건 수정</Text></Pressable></View>}</View>;
  return <FlatList data={rows} keyExtractor={card=>String(card.spId)} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} removeClippedSubviews={Platform.OS==="android"} ListHeaderComponent={listHeader} renderItem={({item:card})=><Pressable style={s.dbRow} onPress={()=>choose(card)} accessibilityLabel={`${card.name}, ${card.seasonName}, ${card.primaryPosition}, 급여 ${card.salary||"정보 없음"}, OVR ${card.overall||"정보 없음"}, ${card.grade||1}강`}><CardImage card={card}/><View style={s.flex}><View style={s.dbResultNameRow}><SeasonIcon card={card}/><Text style={[s.playerName,s.dbResultPlayerName]} numberOfLines={1}>{card.name}</Text><FootRatings right={card.rightFoot} left={card.leftFoot}/></View><View style={s.dbCompactMeta}><Text style={s.dbPosition}>{card.primaryPosition||"-"}</Text><Text style={s.dbSalary}>급여 {card.salary||"-"}</Text><Text style={s.dbOvr}>OVR {card.overall||"-"}</Text><Text style={s.dbGradeBadge}>{card.grade||1}강</Text></View></View><View style={s.dbResultActions}><Text style={s.favorite}>{favorites.includes(card.spId)?"★":"☆"}</Text><Pressable style={[s.compareChoice,compare.some(item=>item.spId===card.spId)&&s.compareChoiceActive]} onPress={event=>{event.stopPropagation();toggleCompare(card)}} accessibilityLabel={`${card.name} 비교 선택`}><Text style={compare.some(item=>item.spId===card.spId)?s.compareChoiceTextActive:s.compareChoiceText}>{compare.some(item=>item.spId===card.spId)?"선택":"비교"}</Text></Pressable></View></Pressable>} onEndReachedThreshold={0.35} onEndReached={()=>{if(hasMore&&!loading)void runSearch(query,filters,true)}} ListFooterComponent={<View>{loading&&pageRef.current>0&&<ActivityIndicator color={C.green} style={{marginVertical:20}}/>}{hasMore&&!loading&&<Pressable style={s.mobileSeasonMore} onPress={()=>void runSearch(query,filters,true)}><Text style={s.green}>다음 선수 더 보기</Text></Pressable>}{catalog?.updatedAt&&<Text style={[s.muted,{textAlign:"center",marginTop:18}]}>선수 데이터 최근 갱신 {new Date(catalog.updatedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</Text>}</View>}/>;
}

export default function App() {
  const [nickname, setNickname] = useState(""),
    [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [match, setMatch] = useState<Match | null>(null),
    [player, setPlayer] = useState<{ id: number; side: Side } | null>(null),
    [searches, setSearches] = useState<SearchItem[]>([]),
    [playerDb, setPlayerDb] = useState(false),
    [playerDbQuery,setPlayerDbQuery]=useState("");
  const [diagnostics,setDiagnostics]=useState<DiagnosticInfo>({requestId:null,serverVersion:null,apiVersion:null});
  const [headerBack,setHeaderBack]=useState<(() => void)|null>(null);
  const dashboardAbortRef=useRef<AbortController|null>(null);
  useEffect(()=>()=>dashboardAbortRef.current?.abort(),[]);
  useEffect(() => installMobileErrorHandler(), []);
  useEffect(() => {
    setDiagnosticListener(value => { setDiagnostics(value); setRelatedRequestId(value.requestId); });
    return () => setDiagnosticListener(undefined);
  }, []);
  useEffect(() => {
    void loadSearches().then(setSearches);
  }, []);
  useEffect(() => {
    if (!loading) {
      setProgress(0);
      return;
    }
    const timer = setInterval(
      () => setProgress((value) => Math.min(value + 7, 92)),
      250,
    );
    return () => clearInterval(timer);
  }, [loading]);
  async function load(value = nickname) {
    const target = value.trim();
    if (!target) {
      setError("구단주명을 입력해 주세요.");
      return;
    }
    dashboardAbortRef.current?.abort();
    const controller=new AbortController();
    dashboardAbortRef.current=controller;
    setNickname(target);
    setLoading(true);
    setError("");
    try {
      const next = await fetchDashboard(target,controller.signal);
      if(dashboardAbortRef.current===controller){setData(next);setSearches(await rememberSearch(next.profile.nickname))}
    } catch (e) {
      if(dashboardAbortRef.current===controller&&(e as {kind?:string})?.kind!=="cancelled") {
        setError(e instanceof Error ? e.message : "전적 조회 실패");
        void reportMobileError(e, "DASHBOARD_REQUEST_ERROR", "dashboard");
      }
    } finally {
      if(dashboardAbortRef.current===controller){dashboardAbortRef.current=null;setProgress(100);setLoading(false)}
    }
  }
  async function favorite() {
    if (data) setSearches(await toggleFavorite(data.profile.nickname));
  }
  const closePlayerInfo=useCallback(()=>setPlayerDb(false),[]);
  const changeHeaderBack=useCallback((handler:(()=>void)|null)=>setHeaderBack(handler?()=>handler:null),[]);
  function openMatchFeature() {
    setPlayerDb(false);
    setHeaderBack(null);
    setPlayer(null);
    setMatch(null);
  }
  function openPlayerFeature() {
    setPlayerDbQuery("");
    setPlayerDb(true);
    setHeaderBack(null);
    setPlayer(null);
    setMatch(null);
  }
  function openPlayerSearch(name:string) {
    setPlayerDbQuery(name);
    setPlayerDb(true);
    setHeaderBack(null);
    setMatch(null);
  }
  function goBack() {
    const action=resolveBackAction({playerDatabase:playerDb,hasNestedPlayerDatabaseBack:Boolean(headerBack),player:Boolean(player),match:Boolean(match),dashboard:Boolean(data)});
    if(action==="nested-player-database") return headerBack?.();
    if(action==="close-player-database") return closePlayerInfo();
    if(action==="close-player") return setPlayer(null);
    if(action==="close-match") return setMatch(null);
    if(action==="close-dashboard") setData(null);
  }
  const canGoBack=Boolean(playerDb||player||match||data);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" />
        <View style={s.header}>
          {canGoBack&&(
            <Back onPress={goBack}/>
          )}
          <Text style={s.logo} numberOfLines={1}>
            FC ONLINE LAB
          </Text>
        </View>
        <View style={s.mainFeatureNav}>
          <Pressable style={[s.mainFeature, !playerDb&&s.mainFeatureActive]} onPress={openMatchFeature} accessibilityRole="tab" accessibilityState={{selected:!playerDb}}><Text style={[s.mainFeatureTitle,!playerDb&&s.mainFeatureTitleActive]}>경기·분석</Text><Text style={s.mainFeatureDescription}>구단주 전적과 경기 흐름</Text></Pressable>
          <Pressable style={[s.mainFeature, playerDb&&s.mainFeatureActive]} onPress={openPlayerFeature} accessibilityRole="tab" accessibilityState={{selected:playerDb}}><Text style={[s.mainFeatureTitle,playerDb&&s.mainFeatureTitleActive]}>선수 정보</Text><Text style={s.mainFeatureDescription}>시즌 카드와 팀컬러 능력치</Text></Pressable>
        </View>
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {playerDb ? (
            <PlayerDatabase matches={data?.matches??[]} initialQuery={playerDbQuery} onBack={closePlayerInfo} onHeaderBackChange={changeHeaderBack}/>
          ) : player && data ? (
            <PlayerScreen
              matches={data.matches}
              id={player.id}
              side={player.side}
              onMatch={(m) => {
                setPlayer(null);
                setMatch(m);
              }}
              onSearchPlayer={openPlayerSearch}
            />
          ) : match && data ? (
            <MatchScreen
              match={match}
              nickname={data.profile.nickname}
              onPlayer={(id, side) => setPlayer({ id, side })}
            />
          ) : data ? (
            <Home
              data={data}
              onMatch={setMatch}
              onPlayer={(id, side) => setPlayer({ id, side })}
              refreshing={loading}
              onRefresh={() => void load(data.profile.nickname)}
              onExit={() => setData(null)}
              onFavorite={() => void favorite()}
            />
          ) : (
            <TouchableWithoutFeedback
              onPress={Keyboard.dismiss}
              accessible={false}
            >
              <View style={s.flex}>
                <ScrollView
                  contentContainerStyle={s.landing}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={
                    Platform.OS === "ios" ? "interactive" : "on-drag"
                  }
                  automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
                >
                  <Text style={s.eyebrow}>MATCH INTELLIGENCE</Text>
                  <Text style={s.title} maxFontSizeMultiplier={1.35}>
                    내 플레이를{`\n`}숫자로 읽다.
                  </Text>
                  <Text style={s.subtitle}>
                    최근 경기 흐름과 선수 기록을 한곳에서 확인하세요.
                  </Text>
                  <Text style={s.inputLabel}>구단주명</Text>
                  <TextInput
                    style={s.input}
                    value={nickname}
                    onChangeText={setNickname}
                    placeholder="구단주명을 입력하세요"
                    placeholderTextColor="#496055"
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => void load()}
                    accessibilityLabel="구단주명 입력"
                  />
                  <Pressable
                    style={[s.primary, loading && s.disabled]}
                    onPress={() => void load()}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="전적 불러오기"
                  >
                    {loading ? (
                      <View style={s.loadingRow}>
                        <ActivityIndicator color={C.bg} />
                        <Text style={s.primaryText}>
                          경기 분석 중 {progress}%
                        </Text>
                      </View>
                    ) : (
                      <Text style={s.primaryText}>전적 불러오기 →</Text>
                    )}
                  </Pressable>
                  {loading && (
                    <View style={s.progressTrack}>
                      <View
                        style={[s.progressFill, { width: `${progress}%` }]}
                      />
                    </View>
                  )}
                  {error ? (
                    <View style={s.errorBox}>
                      <Text style={s.error}>{error}</Text>
                      <Pressable onPress={() => void load()} style={s.retry}>
                        <Text style={s.retryText}>다시 시도</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {searches.length > 0 && (
                    <>
                      <Text style={s.heading}>최근 검색</Text>
                      {searches.map((row) => (
                        <View style={s.searchRow} key={row.nickname}>
                          <Pressable
                            style={s.flex}
                            onPress={() => void load(row.nickname)}
                            accessibilityLabel={`${row.nickname} 다시 조회`}
                          >
                            <Text style={s.playerName}>
                              {row.favorite ? "★ " : ""}
                              {row.nickname}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              void toggleFavorite(row.nickname).then(
                                setSearches,
                              )
                            }
                            hitSlop={10}
                          >
                            <Text style={s.favorite}>
                              {row.favorite ? "★" : "☆"}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              void removeSearch(row.nickname).then(setSearches)
                            }
                            hitSlop={10}
                          >
                            <Text style={s.muted}>삭제</Text>
                          </Pressable>
                        </View>
                      ))}
                    </>
                  )}
                  <Text style={s.privacy}>
                    NEXON Open API 데이터를 안전한 서비스 서버를 통해
                    조회합니다.
                  </Text>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          )}
        </KeyboardAvoidingView>
        <View style={s.footer}>
          <Text style={s.muted}>앱 0.1.0 · API v{diagnostics.apiVersion??"-"} · 서버 {diagnostics.serverVersion?.slice(0,8)??"-"} · 요청 {diagnostics.requestId?.slice(0,8)??"-"}</Text>
          <Text style={s.muted}>Data based on NEXON Open API</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
