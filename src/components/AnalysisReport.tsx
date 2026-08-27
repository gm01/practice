import { useMemo, useState } from "react";
import PlayerPhoto from "./PlayerPhoto";

type ReportTab = "overview" | "players" | "shots" | "tactics";

const timeLabels = ["0~15", "16~30", "31~45", "46~60", "61~75", "76~90", "추가시간"];
const shotTypeNames: Record<number, string> = { 1:"일반",2:"감아차기",3:"헤더",4:"로빙",5:"플레어",6:"낮은 슛",7:"발리",8:"프리킥",9:"페널티킥",10:"무회전",11:"바이시클",12:"파워 슛" };

function percent(value: number, total: number): number { return total ? Math.round(value / total * 100) : 0; }
function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function timeIndex(minute: number): number {
  if (minute <= 15) return 0; if (minute <= 30) return 1; if (minute <= 45) return 2;
  if (minute <= 60) return 3; if (minute <= 75) return 4; if (minute <= 90) return 5; return 6;
}
function formationOf(players: PlayerSummary[]): string {
  const starters = players.filter(player => player.rating > 0 && player.positionCode < 28);
  const defenders = starters.filter(player => player.positionCode >= 1 && player.positionCode <= 8).length;
  const midfielders = starters.filter(player => player.positionCode >= 9 && player.positionCode <= 19).length;
  const attackers = starters.filter(player => player.positionCode >= 20 && player.positionCode <= 27).length;
  return defenders && (midfielders || attackers) ? `${defenders}-${midfielders}-${attackers}` : "기타";
}
function shotQuality(shot: ShotSummary): number {
  if (shot.type === 9) return 0.76;
  let quality = 0.05;
  if (shot.x >= 0.88) quality += 0.18; else if (shot.x >= 0.72) quality += 0.1;
  if (Math.abs(shot.y - 0.5) <= 0.16) quality += 0.12;
  if (shot.inPenalty) quality += 0.17;
  if (shot.type === 3 || shot.type === 11) quality -= 0.03;
  return Math.max(0.03, Math.min(0.65, quality));
}

export default function AnalysisReport({ matches, rankers, onSelectPlayer }: { matches: MatchSummary[]; rankers: RankerRecord[]; onSelectPlayer: (spId: number) => void }) {
  const [tab, setTab] = useState<ReportTab>("overview");
  const [shotPlayer, setShotPlayer] = useState("전체");
  const [range, setRange] = useState<5 | 10 | 20>(20);
  const analysis = useMemo(() => {
    const sample = matches.slice(0, range);
    const wins = sample.filter(match => match.result === "승").length;
    const draws = sample.filter(match => match.result === "무").length;
    const losses = sample.filter(match => match.result === "패").length;
    const goalsFor = sample.reduce((sum, match) => sum + match.myScore, 0);
    const goalsAgainst = sample.reduce((sum, match) => sum + match.opponentScore, 0);
    const shots = sample.reduce((sum, match) => sum + (match.stats.shots ?? 0), 0);
    const effectiveShots = sample.reduce((sum, match) => sum + (match.stats.effectiveShots ?? 0), 0);
    const possessions = sample.map(match => match.stats.possession).filter((value): value is number => value !== null);
    const firstScored = sample.filter(match => match.goals[0]?.side === "mine");
    const firstConceded = sample.filter(match => match.goals[0]?.side === "opponent");
    const timeline = timeLabels.map(() => ({ mine: 0, opponent: 0 }));
    let firstHalfFor = 0, secondHalfFor = 0, firstHalfAgainst = 0, secondHalfAgainst = 0;
    sample.forEach(match => match.goals.forEach(goal => {
      timeline[timeIndex(goal.minute)][goal.side] += 1;
      if (goal.side === "mine") goal.minute <= 45 ? firstHalfFor++ : secondHalfFor++;
      else goal.minute <= 45 ? firstHalfAgainst++ : secondHalfAgainst++;
    }));
    const currentResult = sample[0]?.result;
    const streakCount = currentResult ? sample.findIndex(match => match.result !== currentResult) : 0;
    const streak = currentResult ? `${streakCount === -1 ? sample.length : streakCount}${currentResult === "승" ? "연승" : currentResult === "패" ? "연패" : "경기 연속 무승부"}` : "-";

    const playerMap = new Map<number, { player: PlayerSummary; games:number; ratings:number[]; goals:number; assists:number; shots:number; effectiveShots:number; passTry:number; passSuccess:number; positions:Map<string,number> }>();
    sample.forEach(match => match.players.filter(player => player.rating > 0).forEach(player => {
      const row = playerMap.get(player.spId) ?? { player, games:0, ratings:[], goals:0, assists:0, shots:0, effectiveShots:0, passTry:0, passSuccess:0, positions:new Map<string,number>() };
      row.games += 1; row.ratings.push(player.rating); row.goals += player.goals; row.assists += player.assists;
      row.shots += player.shots; row.effectiveShots += player.effectiveShots; row.passTry += player.passTry; row.passSuccess += player.passSuccess;
      row.positions.set(player.position, (row.positions.get(player.position) ?? 0) + 1); playerMap.set(player.spId, row);
    }));
    const players = [...playerMap.values()].sort((a,b) => b.games - a.games || average(b.ratings) - average(a.ratings));

    const allShots = sample.flatMap(match => match.shots);
    const allOpponentShots = sample.flatMap(match => match.opponentShots);
    const shotTypes = [...new Set(allShots.map(shot => shot.type))].map(type => {
      const rows = allShots.filter(shot => shot.type === type); return { type, count:rows.length, goals:rows.filter(shot => shot.isGoal).length };
    }).sort((a,b) => b.count-a.count);
    const formations = new Map<string, { games:number; wins:number; goals:number; conceded:number }>();
    sample.forEach(match => { const formation=formationOf(match.players); const row=formations.get(formation)??{games:0,wins:0,goals:0,conceded:0}; row.games++; row.wins+=match.result==="승"?1:0; row.goals+=match.myScore; row.conceded+=match.opponentScore; formations.set(formation,row); });
    const styles = { possession:0, counter:0, balanced:0 };
    sample.forEach(match => { const possession=match.stats.possession??50; if(possession>=55)styles.possession++;else if(possession<=45)styles.counter++;else styles.balanced++; });
    const lateConceded = timeline[5].opponent + timeline[6].opponent;
    const insight = goalsAgainst && lateConceded / goalsAgainst >= .35
      ? `전체 실점의 ${percent(lateConceded, goalsAgainst)}%가 76분 이후에 발생했습니다. 경기 후반 수비 집중도를 확인해 보세요.`
      : firstConceded.length && percent(firstConceded.filter(match=>match.result==="승").length, firstConceded.length) < 20
        ? "먼저 실점한 경기의 역전 승률이 낮습니다. 경기 초반 안정적인 운영이 중요합니다."
        : "특정 시간대에 크게 치우치지 않은 비교적 안정적인 득실점 흐름입니다.";
    return { sample,wins,draws,losses,goalsFor,goalsAgainst,shots,effectiveShots,possessions,firstScored,firstConceded,timeline,firstHalfFor,secondHalfFor,firstHalfAgainst,secondHalfAgainst,streak,players,allShots,allOpponentShots,shotTypes,formations:[...formations.entries()].sort((a,b)=>b[1].games-a[1].games),styles,insight };
  }, [matches, range]);

  const filteredShots = shotPlayer === "전체" ? analysis.allShots : analysis.allShots.filter(shot => shot.playerName === shotPlayer);
  const maxTimeline = Math.max(1, ...analysis.timeline.flatMap(row => [row.mine, row.opponent]));
  const tabs: Array<[ReportTab,string]> = [["overview","종합"],["players","선수"],["shots","슈팅"],["tactics","전술"]];
  return <section className="analysis-report">
    <div className="analysis-heading"><div><p className="eyebrow">PERFORMANCE REPORT</p><h2>최근 {analysis.sample.length}경기 분석</h2><div className="range-select">{([5,10,20] as const).map(value=><button className={range===value?'active':''} onClick={()=>setRange(value)} key={value}>{value}경기</button>)}</div></div><nav>{tabs.map(([key,label])=><button className={tab===key?"active":""} onClick={()=>setTab(key)} key={key}>{label}</button>)}</nav></div>

    {tab === "overview" && <div className="report-panel">
      <div className="report-kpis">
        <article><small>승률</small><b>{percent(analysis.wins,analysis.sample.length)}%</b><span>{analysis.wins}승 {analysis.draws}무 {analysis.losses}패 · {analysis.streak}</span></article>
        <article><small>평균 득점 / 실점</small><b>{average(analysis.sample.map(match=>match.myScore)).toFixed(2)} <i>/</i> {average(analysis.sample.map(match=>match.opponentScore)).toFixed(2)}</b><span>득실차 {analysis.goalsFor-analysis.goalsAgainst>=0?"+":""}{analysis.goalsFor-analysis.goalsAgainst}</span></article>
        <article><small>슛 전환율</small><b>{percent(analysis.goalsFor,analysis.shots)}%</b><span>{analysis.shots}개 슈팅 · {analysis.goalsFor}골</span></article>
        <article><small>유효 슈팅 비율</small><b>{percent(analysis.effectiveShots,analysis.shots)}%</b><span>{analysis.effectiveShots}/{analysis.shots}</span></article>
        <article><small>점유율 공격 효율</small><b>{(average(analysis.sample.map(match=>match.myScore))/Math.max(1,average(analysis.possessions))*100).toFixed(1)}</b><span>평균 점유율 100당 득점</span></article>
        <article><small>선제 득점 시 승률</small><b>{percent(analysis.firstScored.filter(match=>match.result==="승").length,analysis.firstScored.length)}%</b><span>{analysis.firstScored.length}경기 기준</span></article>
        <article><small>선실점 후 역전 승률</small><b>{percent(analysis.firstConceded.filter(match=>match.result==="승").length,analysis.firstConceded.length)}%</b><span>{analysis.firstConceded.length}경기 기준</span></article>
        <article><small>전반 / 후반 득실차</small><b>{analysis.firstHalfFor-analysis.firstHalfAgainst>=0?"+":""}{analysis.firstHalfFor-analysis.firstHalfAgainst} <i>/</i> {analysis.secondHalfFor-analysis.secondHalfAgainst>=0?"+":""}{analysis.secondHalfFor-analysis.secondHalfAgainst}</b><span>득점 {analysis.firstHalfFor}/{analysis.secondHalfFor} · 실점 {analysis.firstHalfAgainst}/{analysis.secondHalfAgainst}</span></article>
      </div>
      <div className="timeline-analysis"><h3>득점·실점 시간대</h3><div className="timeline-bars">{analysis.timeline.map((row,index)=><div key={timeLabels[index]}><b>{timeLabels[index]}</b><span><i className="for" style={{height:`${Math.max(3,row.mine/maxTimeline*100)}%`}} title={`득점 ${row.mine}`}/><i className="against" style={{height:`${Math.max(3,row.opponent/maxTimeline*100)}%`}} title={`실점 ${row.opponent}`}/></span><small>{row.mine} : {row.opponent}</small></div>)}</div><p className="analysis-insight">↗ {analysis.insight}</p></div>
    </div>}

    {tab === "players" && <div className="report-panel"><div className="player-report-head"><h3>선수 누적 리포트</h3><span>선수를 누르면 상세 기록을 확인할 수 있습니다.</span></div><div className="player-report-list">{analysis.players.slice(0,18).map(row=>{const ranker=rankers.find(item=>item.spid===row.player.spId);const mainPosition=[...row.positions.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??row.player.position;return <article className="clickable" onClick={()=>onSelectPlayer(row.player.spId)} key={row.player.spId}><PlayerPhoto player={row.player} compact/><div className="player-report-name"><b>{row.player.name}</b><span>{mainPosition} · {row.games}경기</span></div><div><small>평균/범위</small><b>{average(row.ratings).toFixed(2)}</b><span>{Math.min(...row.ratings).toFixed(1)}~{Math.max(...row.ratings).toFixed(1)}</span></div><div><small>골·도움</small><b>{row.goals} · {row.assists}</b><span>경기당 {((row.goals+row.assists)/row.games).toFixed(2)}P</span></div><div><small>슈팅</small><b>{row.shots}</b><span>유효 {percent(row.effectiveShots,row.shots)}%</span></div><div><small>패스</small><b>{percent(row.passSuccess,row.passTry)}%</b><span>{row.passSuccess}/{row.passTry}</span></div><div className="rating-flow"><small>최근 흐름</small><span>{row.ratings.slice(0,5).map((rating,index)=><i style={{height:`${Math.max(12,rating/10*100)}%`}} title={rating.toFixed(1)} key={index}/>)}</span></div><div><small>랭커 비교</small><b>{ranker?`${(row.goals/row.games-ranker.status.goal)>=0?"+":""}${(row.goals/row.games-ranker.status.goal).toFixed(2)}`:"–"}</b><span>{ranker?"경기당 골 차이":"랭커 탭 조회 필요"}</span></div></article>})}</div></div>}

    {tab === "shots" && <div className="report-panel"><div className="shot-report-grid"><div><div className="subheading"><h3>슈팅 히트맵</h3><select value={shotPlayer} onChange={event=>setShotPlayer(event.target.value)}><option>전체</option>{[...new Set(analysis.allShots.map(shot=>shot.playerName))].sort().map(name=><option key={name}>{name}</option>)}</select></div><div className="analysis-pitch"><div className="analysis-box"/><div className="analysis-goal"/>{filteredShots.map((shot,index)=><i className={shot.isGoal?"goal":""} style={{left:`${shot.x*100}%`,top:`${shot.y*100}%`,opacity:shot.isGoal?1:.38}} title={`${shot.minute}' ${shot.playerName}`} key={index}/>)}</div></div><div className="shot-breakdown"><h3>슈팅 분석</h3><div className="mini-kpis"><span><small>박스 안</small><b>{percent(filteredShots.filter(shot=>shot.inPenalty).length,filteredShots.length)}%</b></span><span><small>평균 품질</small><b>{Math.round(average(filteredShots.map(shotQuality))*100)}%</b></span><span><small>득점 전환</small><b>{percent(filteredShots.filter(shot=>shot.isGoal).length,filteredShots.length)}%</b></span><span><small>상대 대비 슈팅</small><b>{analysis.allShots.length-analysis.allOpponentShots.length>=0?"+":""}{analysis.allShots.length-analysis.allOpponentShots.length}</b></span></div><h4>공격 방향</h4>{[["왼쪽",0,.33],["중앙",.33,.67],["오른쪽",.67,1]].map(([label,min,max])=>{const count=filteredShots.filter(shot=>shot.y>=Number(min)&&shot.y<Number(max)).length;return <div className="direction-row" key={String(label)}><span>{label}</span><i><b style={{width:`${percent(count,filteredShots.length)}%`}}/></i><strong>{percent(count,filteredShots.length)}%</strong></div>})}<h4>슛 종류별 성공률</h4>{analysis.shotTypes.slice(0,6).map(row=><div className="direction-row" key={row.type}><span>{shotTypeNames[row.type]??`유형 ${row.type}`}</span><i><b style={{width:`${percent(row.goals,row.count)}%`}}/></i><strong>{row.goals}/{row.count}</strong></div>)}</div></div><p className="quality-note">예상 득점 확률은 슈팅 위치·박스 안팎·슛 종류를 이용한 자체 참고 지표이며 공식 xG가 아닙니다.</p></div>}

    {tab === "tactics" && <div className="report-panel"><div className="tactics-grid"><div><h3>포메이션별 성과</h3>{analysis.formations.map(([name,row])=><article className="formation-row" key={name}><b>{name}</b><span>{row.games}경기</span><strong>{percent(row.wins,row.games)}% 승</strong><small>{(row.goals/row.games).toFixed(1)}득점 · {(row.conceded/row.games).toFixed(1)}실점</small></article>)}</div><div><h3>플레이 성향</h3><div className="style-donut" style={{background:`conic-gradient(#8dffb1 0 ${percent(analysis.styles.possession,analysis.sample.length)}%,#78a7ff 0 ${percent(analysis.styles.possession+analysis.styles.counter,analysis.sample.length)}%,#52655a 0)`}}><span>{analysis.sample.length}<small>경기</small></span></div><div className="style-legend"><span><i className="possession"/>점유형 <b>{analysis.styles.possession}</b></span><span><i className="counter"/>역습형 <b>{analysis.styles.counter}</b></span><span><i className="balanced"/>균형형 <b>{analysis.styles.balanced}</b></span></div><p className="analysis-insight">{analysis.styles.possession>=analysis.styles.counter&&analysis.styles.possession>=analysis.styles.balanced?"평균 55% 이상의 점유율을 기록한 경기가 가장 많아 점유형 성향으로 분류됩니다.":analysis.styles.counter>=analysis.styles.balanced?"낮은 점유율에서 빠르게 공격하는 역습형 경기가 가장 많습니다.":"점유율 45~55%의 균형형 경기가 가장 많습니다."}</p></div></div><div className="outcome-formations"><span><small>승리 경기 주요 포메이션</small><b>{mostFormation(analysis.sample.filter(match=>match.result==="승"))}</b></span><span><small>패배 경기 주요 포메이션</small><b>{mostFormation(analysis.sample.filter(match=>match.result==="패"))}</b></span><span><small>승리 시 평균 점유율</small><b>{average(analysis.sample.filter(match=>match.result==="승").map(match=>match.stats.possession??0)).toFixed(1)}%</b></span><span><small>패배 시 평균 점유율</small><b>{average(analysis.sample.filter(match=>match.result==="패").map(match=>match.stats.possession??0)).toFixed(1)}%</b></span></div></div>}
  </section>;
}

function mostFormation(matches: MatchSummary[]): string {
  const counts = new Map<string,number>(); matches.forEach(match=>{const value=formationOf(match.players);counts.set(value,(counts.get(value)??0)+1);});
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??"기록 없음";
}
