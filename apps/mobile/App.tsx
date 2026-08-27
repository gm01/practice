import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import { fetchDashboard } from "./src/api";
import { C, s } from "./src/styles";
import type { Dashboard, Match, Player, Side } from "./src/types";
import {
  loadSearches,
  rememberSearch,
  removeSearch,
  toggleFavorite,
  type SearchItem,
} from "./src/storage";

const positionCoordinates: Record<number, [number, number]> = {
  0: [50, 90],
  1: [50, 81],
  2: [88, 75],
  3: [82, 78],
  4: [66, 77],
  5: [50, 78],
  6: [34, 77],
  7: [18, 78],
  8: [12, 70],
  9: [65, 64],
  10: [50, 65],
  11: [35, 64],
  12: [84, 54],
  13: [66, 53],
  14: [50, 54],
  15: [34, 53],
  16: [16, 54],
  17: [68, 42],
  18: [50, 43],
  19: [32, 42],
  20: [67, 28],
  21: [50, 30],
  22: [33, 28],
  23: [84, 22],
  24: [63, 17],
  25: [50, 16],
  26: [37, 17],
  27: [16, 22],
};

const average = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
const percent = (v: number, t: number) => (t ? Math.round((v / t) * 100) : 0);
const date = (v: string) =>
  new Date(v.endsWith("Z") ? v : `${v}Z`).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
  });

function PlayerImage({ player, size = 52 }: { player: Player; size?: number }) {
  const [index, setIndex] = useState(0),
    [failed, setFailed] = useState(false);
  return (
    <View
      style={[s.photo, { width: size, height: size, borderRadius: size / 2 }]}
    >
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
  );
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
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <View style={s.kpi}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.muted}>{note}</Text>
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
  const starters = players.filter((p) => p.rating > 0 && p.positionCode < 28);
  const substitutes = players.filter((p) => p.rating > 0 && p.positionCode >= 28);
  const lines = [
    starters.filter((p) => p.positionCode >= 20).length,
    starters.filter((p) => p.positionCode >= 9 && p.positionCode < 20).length,
    starters.filter((p) => p.positionCode >= 1 && p.positionCode < 9).length,
  ].filter(Boolean);
  const formationName = lines.join("-") || "포메이션 정보 없음";
  return (
    <>
      <Text style={s.formationTitle}>포메이션 {formationName} · 선발 {starters.length}명</Text>
      <View style={s.formationPitch}>
        <PitchLines />
        {starters.map((p) => {
          const [x, y] = positionCoordinates[p.positionCode] ?? [50, 50];
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
            accessibilityLabel={`${r.p.name}, ${r.games}경기, 평균 평점 ${(r.rating / r.games).toFixed(1)}`}
          >
            <PlayerImage player={r.p} />
            <Text style={s.playerName} numberOfLines={2}>
              {r.p.name}
            </Text>
            <Text style={s.muted}>
              {r.games}경기 · {(r.rating / r.games).toFixed(1)}
            </Text>
            <Text style={s.green}>
              {r.goals}골 {r.assists}도움
            </Text>
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
  onBack,
  onPlayer,
}: {
  match: Match;
  nickname: string;
  onBack: () => void;
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
      <Back onPress={onBack} />
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
              <Text style={s.muted}>{l}</Text>
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
  onBack,
  onMatch,
}: {
  matches: Match[];
  id: number;
  side: Side;
  onBack: () => void;
  onMatch: (m: Match) => void;
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
        <Back onPress={onBack} />
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
      <Back onPress={onBack} />
      <View style={s.playerHero}>
        <PlayerImage player={player} size={90} />
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

export default function App() {
  const [nickname, setNickname] = useState(""),
    [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [match, setMatch] = useState<Match | null>(null),
    [player, setPlayer] = useState<{ id: number; side: Side } | null>(null),
    [searches, setSearches] = useState<SearchItem[]>([]);
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
    setNickname(target);
    setLoading(true);
    setError("");
    try {
      const next = await fetchDashboard(target);
      setData(next);
      setSearches(await rememberSearch(next.profile.nickname));
    } catch (e) {
      setError(e instanceof Error ? e.message : "전적 조회 실패");
    } finally {
      setProgress(100);
      setLoading(false);
    }
  }
  async function favorite() {
    if (data) setSearches(await toggleFavorite(data.profile.nickname));
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" />
        <View style={s.header}>
          <Text style={s.logo} numberOfLines={1}>
            FC ONLINE LAB
          </Text>
          <Text style={s.green}>MOBILE</Text>
        </View>
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {player && data ? (
            <PlayerScreen
              matches={data.matches}
              id={player.id}
              side={player.side}
              onBack={() => setPlayer(null)}
              onMatch={(m) => {
                setPlayer(null);
                setMatch(m);
              }}
            />
          ) : match && data ? (
            <MatchScreen
              match={match}
              nickname={data.profile.nickname}
              onBack={() => setMatch(null)}
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
                    Android와 iOS에서 최근 경기와 선수 흐름을 확인하세요.
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
          <Text style={s.muted}>Data based on NEXON Open API</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
