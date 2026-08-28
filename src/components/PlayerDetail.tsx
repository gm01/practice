import { useMemo } from "react";
import { formatNexonDate } from "../../shared/nexon";
import PlayerPhoto from "./PlayerPhoto";

const resultLabel: Record<string, string> = { 승: "WIN", 패: "LOSS", 무: "DRAW" };
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percent = (value: number, total: number) => total ? Math.round(value / total * 100) : 0;
const inverseResult: Record<string, string> = { 승: "패", 패: "승", 무: "무" };

export default function PlayerDetail({ matches, spId, side, onOpenMatch, onSearchPlayer }: {
  matches: MatchSummary[]; spId: number; side: "mine" | "opponent";
  onOpenMatch: (matchId: string) => void;
  onSearchPlayer: (name: string) => void;
}) {
  const report = useMemo(() => {
    const appearances = matches.flatMap(match => {
      const players = side === "mine" ? match.players : match.opponentPlayers;
      const player = players.find(item => item.spId === spId && item.rating > 0);
      const result = side === "mine" ? match.result : (inverseResult[match.result] ?? match.result);
      return player ? [{ match, player, result }] : [];
    });
    const player = appearances[0]?.player;
    const ratings = appearances.map(item => item.player.rating);
    const goals = appearances.reduce((sum, item) => sum + item.player.goals, 0);
    const assists = appearances.reduce((sum, item) => sum + item.player.assists, 0);
    const shots = appearances.reduce((sum, item) => sum + item.player.shots, 0);
    const effectiveShots = appearances.reduce((sum, item) => sum + item.player.effectiveShots, 0);
    const passTry = appearances.reduce((sum, item) => sum + item.player.passTry, 0);
    const passSuccess = appearances.reduce((sum, item) => sum + item.player.passSuccess, 0);
    const positions = new Map<string, number>();
    appearances.forEach(item => positions.set(item.player.position, (positions.get(item.player.position) ?? 0) + 1));
    const mainPosition = [...positions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? player?.position ?? "-";
    const playerShots = appearances.flatMap(({ match, player: appearance }) =>
      (side === "mine" ? match.shots : match.opponentShots).filter(shot => shot.playerName === appearance.name));
    const resultRows = ["승", "무", "패"].map(result => {
      const rows = appearances.filter(item => item.result === result);
      return { result, games: rows.length, rating: average(rows.map(item => item.player.rating)), goals: rows.reduce((sum, item) => sum + item.player.goals, 0), assists: rows.reduce((sum, item) => sum + item.player.assists, 0) };
    });
    const positionRows = [...new Set(appearances.map(item => item.player.position))].map(position => {
      const rows = appearances.filter(item => item.player.position === position);
      return { position, games: rows.length, rating: average(rows.map(item => item.player.rating)), goals: rows.reduce((sum, item) => sum + item.player.goals, 0), assists: rows.reduce((sum, item) => sum + item.player.assists, 0) };
    }).sort((a, b) => b.games - a.games);
    const gradeRows = [...new Set(appearances.map(item => item.player.grade))].map(grade => {
      const rows = appearances.filter(item => item.player.grade === grade);
      return { grade, games: rows.length, rating: average(rows.map(item => item.player.rating)), points: rows.reduce((sum, item) => sum + item.player.goals + item.player.assists, 0) };
    }).sort((a, b) => b.grade - a.grade);
    const scoringRows = [
      { label: "득점 경기", rows: appearances.filter(item => item.player.goals > 0) },
      { label: "무득점 경기", rows: appearances.filter(item => item.player.goals === 0) },
    ].map(item => ({ label: item.label, games: item.rows.length, rating: average(item.rows.map(row => row.player.rating)), wins: item.rows.filter(row => row.result === "승").length }));
    const teammateMap = new Map<number, { player: PlayerSummary; games: number; wins: number; goalDifference: number }>();
    appearances.forEach(({ match, result }) => {
      const roster = side === "mine" ? match.players : match.opponentPlayers;
      const teamScore = side === "mine" ? match.myScore : match.opponentScore;
      const against = side === "mine" ? match.opponentScore : match.myScore;
      roster.filter(item => item.spId !== spId && item.rating > 0).forEach(teammate => {
        const row = teammateMap.get(teammate.spId) ?? { player: teammate, games: 0, wins: 0, goalDifference: 0 };
        row.games++; row.wins += result === "승" ? 1 : 0; row.goalDifference += teamScore - against; teammateMap.set(teammate.spId, row);
      });
    });
    const teammates = [...teammateMap.values()].sort((a, b) => percent(b.wins, b.games) - percent(a.wins, a.games) || b.games - a.games || b.goalDifference - a.goalDifference).slice(0, 5);
    const starterGames = appearances.filter(item => item.player.positionCode < 28).length;
    const substituteGames = appearances.filter(item => item.player.positionCode >= 28).length;
    return { appearances, player, ratings, goals, assists, shots, effectiveShots, passTry, passSuccess, mainPosition, playerShots, resultRows, positionRows, gradeRows, scoringRows, teammates, starterGames, substituteGames };
  }, [matches, side, spId]);

  if (!report.player) return <section className="player-detail-page"><div className="empty"><h3>선수 출전 기록을 찾지 못했습니다.</h3></div></section>;
  const best = Math.max(...report.ratings), worst = Math.min(...report.ratings), avgRating = average(report.ratings);
  return <section className="player-detail-page">
    <header className="player-detail-hero"><button className="player-detail-photo" onClick={()=>onSearchPlayer(report.player!.name)} aria-label={`${report.player.name} 시즌 카드 검색`}><PlayerPhoto player={report.player} showSeason/></button><div><p className="eyebrow">PLAYER REPORT</p><h1>{report.player.name}</h1><span>{report.player.seasonName} · {report.mainPosition} · +{report.player.grade}강</span></div><strong>{avgRating.toFixed(2)}<small>평균 평점</small></strong></header>
    <div className="player-detail-kpis">
      <article><small>출전</small><b>{report.appearances.length}</b><span>최근 불러온 경기 기준</span></article>
      <article><small>골 · 도움</small><b>{report.goals} · {report.assists}</b><span>경기당 {((report.goals + report.assists) / report.appearances.length).toFixed(2)} 공격P</span></article>
      <article><small>슈팅</small><b>{report.shots}</b><span>유효 슈팅 {percent(report.effectiveShots, report.shots)}%</span></article>
      <article><small>패스 성공률</small><b>{percent(report.passSuccess, report.passTry)}%</b><span>{report.passSuccess}/{report.passTry}</span></article>
      <article><small>최고 · 최저 평점</small><b>{best.toFixed(1)} · {worst.toFixed(1)}</b><span>평점 범위</span></article>
    </div>
    <div className="player-detail-grid">
      <section><div className="player-subheading"><h2>최근 평점 흐름</h2><span>왼쪽부터 최신 순</span></div><div className="player-rating-chart">{report.appearances.slice(0, 10).map(({ match, player }, index) => <button onClick={() => onOpenMatch(match.id)} key={match.id}><b>{player.rating.toFixed(1)}</b><i style={{ height: `${Math.max(12, player.rating * 10)}%` }}/><small>{index + 1}경기</small></button>)}</div></section>
      <section><div className="player-subheading"><h2>슈팅 위치</h2><span>{report.playerShots.length}회</span></div><div className="player-shot-pitch"><div/><em/>{report.playerShots.map((shot, index) => <i className={shot.isGoal ? "goal" : ""} style={{ left: `${shot.x * 100}%`, top: `${shot.y * 100}%` }} title={`${shot.minute}' ${shot.isGoal ? "득점" : "슈팅"}`} key={index}/>)}</div></section>
    </div>
    <div className="player-comparison-grid">
      <section><div className="player-subheading"><h2>경기 결과별 성과</h2><span>선수 소속 팀 기준</span></div><div className="player-compare-rows">{report.resultRows.map(row=><article key={row.result}><b>{row.result}</b><span>{row.games}경기</span><strong>{row.games ? row.rating.toFixed(2) : "–"}</strong><small>{row.goals}골 · {row.assists}도움</small></article>)}</div></section>
      <section><div className="player-subheading"><h2>득점 여부 비교</h2><span>승률과 평점</span></div><div className="player-compare-rows compact">{report.scoringRows.map(row=><article key={row.label}><b>{row.label}</b><span>{row.games}경기</span><strong>{row.games ? row.rating.toFixed(2) : "–"}</strong><small>승률 {percent(row.wins,row.games)}%</small></article>)}</div></section>
      <section><div className="player-subheading"><h2>포지션별 성과</h2><span>{report.positionRows.length}개 포지션</span></div><div className="player-table">{report.positionRows.map(row=><div key={row.position}><b>{row.position}</b><span>{row.games}경기</span><strong>{row.rating.toFixed(2)}</strong><small>{row.goals}골 {row.assists}도움</small></div>)}</div></section>
      <section><div className="player-subheading"><h2>강화 등급별 기록</h2><span>{report.player.seasonName}</span></div><div className="player-table">{report.gradeRows.map(row=><div key={row.grade}><b>+{row.grade}강</b><span>{row.games}경기</span><strong>{row.rating.toFixed(2)}</strong><small>{row.points} 공격P</small></div>)}</div></section>
    </div>
    <section className="player-teammates"><div className="player-subheading"><h2>함께 뛸 때 성적이 좋은 선수</h2><span>승률 우선 · 출전 수 반영</span></div><div>{report.teammates.map(row=><article key={row.player.spId}><PlayerPhoto player={row.player} compact/><span><b>{row.player.name}</b><small>{row.games}경기 · 득실차 {row.goalDifference>=0?"+":""}{row.goalDifference}</small></span><strong>{percent(row.wins,row.games)}%<small>승률</small></strong></article>)}</div></section>
    <section className="player-appearance-note"><div><b>포지션 배치 기록</b><span>필드 배치 {report.starterGames}경기 · 교체 명단 위치 {report.substituteGames}경기</span></div><p>Open API는 실제 선발·교체 투입 시점을 별도 제공하지 않습니다. 따라서 포지션 코드가 필드 위치인 경우와 교체 명단 위치인 경우를 구분한 참고 정보입니다.</p></section>
    <section className="player-match-history"><div className="player-subheading"><h2>출전 경기</h2><span>{report.appearances.length}경기</span></div>{report.appearances.map(({ match, player, result }) => <button onClick={() => onOpenMatch(match.id)} key={match.id}><span className={`result result-${resultLabel[result]?.toLowerCase() ?? "draw"}`}>{resultLabel[result] ?? result}</span><div><b>VS {match.opponentNickname}</b><small>{formatNexonDate(match.matchDate, true)} · {player.position}</small></div><strong>{player.goals}골 {player.assists}도움</strong><em>{player.rating.toFixed(1)}</em><i>→</i></button>)}</section>
  </section>;
}
