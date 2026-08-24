import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatNexonDate } from "../shared/nexon";
import { RankerView, TradeView } from "./components/FeatureViews";
import PlayerPhoto from "./components/PlayerPhoto";

type DetailTab = "summary" | "stats" | "lineup" | "shots";
const resultLabel: Record<string, string> = { 승: "WIN", 패: "LOSS", 무: "DRAW" };
const tabLabels: Record<DetailTab, string> = { summary: "요약", stats: "통계", lineup: "라인업", shots: "슛맵" };

function StatRow({ label, mine, opponent, unit = "" }: { label: string; mine: number | null; opponent: number | null; unit?: string }) {
  const total = (mine ?? 0) + (opponent ?? 0);
  const mineWidth = total ? ((mine ?? 0) / total) * 100 : 50;
  return (
    <div className="stat-row">
      <div className="stat-values"><b>{mine ?? "–"}{mine !== null ? unit : ""}</b><span>{label}</span><b>{opponent ?? "–"}{opponent !== null ? unit : ""}</b></div>
      <div className="compare-bar"><i style={{ width: `${mineWidth}%` }} /><em style={{ width: `${100 - mineWidth}%` }} /></div>
    </div>
  );
}

const positionCoordinates: Record<number, [number, number]> = {
  0:[50,90],1:[50,81],2:[88,75],3:[82,78],4:[66,77],5:[50,78],6:[34,77],7:[18,78],8:[12,70],
  9:[65,64],10:[50,65],11:[35,64],12:[84,54],13:[66,53],14:[50,54],15:[34,53],16:[16,54],
  17:[68,42],18:[50,43],19:[32,42],20:[67,28],21:[50,30],22:[33,28],23:[84,22],24:[63,17],25:[50,16],26:[37,17],27:[16,22],
};

function Lineup({ players }: { players: PlayerSummary[] }) {
  return <div className="formation-pitch">{players.filter((player) => player.positionCode < 28 && player.rating > 0).map((player) => {
    const [x, y] = positionCoordinates[player.positionCode] ?? [50, 50];
    return <div className="formation-player" style={{ left: `${x}%`, top: `${y}%` }} key={player.spId}>
      <div><PlayerPhoto player={player} compact /><b>{player.rating.toFixed(1)}</b>{(player.goals>0||player.assists>0)&&<div className="player-events">{player.goals>0&&<span className="event-stack" title={`${player.goals}골`}>{Array.from({length:player.goals},(_,index)=><i key={`goal-${index}`}>⚽</i>)}</span>}{player.assists>0&&<span className="event-stack" title={`${player.assists}도움`}>{Array.from({length:player.assists},(_,index)=><i key={`assist-${index}`}>👟</i>)}</span>}</div>}</div><span>{player.name}</span><small>{player.position} · +{player.grade}</small>
    </div>;
  })}</div>;
}

function ShotMap({ match }: { match: MatchSummary }) {
  return <div className="shot-panel">
    <div className="shot-legend"><span><i className="mine-dot" />내 슈팅</span><span><i className="opponent-dot" />상대 슈팅</span><span><i className="goal-dot" />득점</span></div>
    <div className="full-pitch"><div className="center-circle" /><div className="left-box" /><div className="right-box" />
      {match.shots.map((shot, index) => <span className={`map-shot mine ${shot.isGoal ? "goal" : ""}`} style={{ left:`${shot.x*100}%`, top:`${shot.y*100}%` }} title={`${shot.minute}' ${shot.playerName}`} key={`m${index}`} />)}
      {match.opponentShots.map((shot, index) => <span className={`map-shot away ${shot.isGoal ? "goal" : ""}`} style={{ left:`${(1-shot.x)*100}%`, top:`${100-shot.y*100}%` }} title={`${shot.minute}' ${shot.playerName}`} key={`o${index}`} />)}
    </div>
  </div>;
}

function MatchDetail({ match, myNickname, onBack }: { match: MatchSummary; myNickname: string; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>("summary");
  const [lineupSide, setLineupSide] = useState<"mine" | "opponent">("mine");
  const endLabel = match.endType === 1 ? "정상 종료" : match.endType === 2 ? "몰수 종료" : "경기 종료";
  return <section className="match-page">
    <button className="back-button" onClick={onBack}>← 최근 경기</button>
    <div className="match-hero">
      <p>{formatNexonDate(match.matchDate)} · 공식경기 · {match.controller}</p>
      <div className="scoreboard">
        <div className="club"><span>{myNickname.slice(0,1)}</span><h2>{myNickname}</h2><small>{match.divisionName}</small></div>
        <div className="final-score"><strong>{match.myScore}<i>:</i>{match.opponentScore}</strong><span>{endLabel}</span></div>
        <div className="club away"><span>{match.opponentNickname.slice(0,1)}</span><h2>{match.opponentNickname}</h2><small>{match.opponentDivisionName}</small></div>
      </div>
      <div className="scorer-summary"><div>{match.goals.filter(g=>g.side==="mine").map((goal,i)=><span key={i}><b>{goal.playerName} {goal.minute}'</b>{goal.assistName&&<small>도움 · {goal.assistName}</small>}</span>)}</div><div>{match.goals.filter(g=>g.side==="opponent").map((goal,i)=><span key={i}><b>{goal.minute}' {goal.playerName}</b>{goal.assistName&&<small>도움 · {goal.assistName}</small>}</span>)}</div></div>
    </div>
    <nav className="detail-tabs">{(Object.keys(tabLabels) as DetailTab[]).map((key)=><button className={tab===key?"active":""} onClick={()=>setTab(key)} key={key}>{tabLabels[key]}</button>)}</nav>

    {tab === "summary" && <div className="detail-section">
      <h3>주요 통계</h3><div className="key-stats">
        <StatRow label="점유율" mine={match.stats.possession} opponent={match.opponentStats.possession} unit="%" />
        <StatRow label="전체 슈팅" mine={match.stats.shots} opponent={match.opponentStats.shots} />
        <StatRow label="유효 슈팅" mine={match.stats.effectiveShots} opponent={match.opponentStats.effectiveShots} />
        <StatRow label="패스 성공률" mine={match.stats.passAccuracy} opponent={match.opponentStats.passAccuracy} unit="%" />
      </div>
      <h3>득점 타임라인</h3><div className="event-list">{match.goals.length ? match.goals.map((goal,index)=><div className={`event ${goal.side}`} key={index}>{goal.side==="mine"?<><b className="event-minute">{goal.minute}'</b><span className="event-scorer"><strong>⚽ {goal.playerName}</strong>{goal.assistName&&<em>도움 · {goal.assistName}</em>}</span><i/><i/></>:<><i/><i/><span className="event-scorer away">{goal.assistName&&<em>도움 · {goal.assistName}</em>}<strong>{goal.playerName} ⚽</strong></span><b className="event-minute">{goal.minute}'</b></>}</div>) : <p>득점 기록이 없습니다.</p>}</div>
      <h3>최고 평점 선수</h3><div className="top-player-grid">{match.topPlayers.map(player=><div className="top-player" key={player.spId}><PlayerPhoto player={player}/><div><b>{player.name}</b><span>{player.position} · +{player.grade}강</span><small>{player.goals}골 · {player.assists}도움</small></div><strong>{player.rating.toFixed(1)}</strong></div>)}</div>
    </div>}

    {tab === "stats" && <div className="detail-section stats-section"><h3>전체 통계</h3>{[
      ["점유율",match.stats.possession,match.opponentStats.possession,"%"],["전체 슈팅",match.stats.shots,match.opponentStats.shots,""],
      ["유효 슈팅",match.stats.effectiveShots,match.opponentStats.effectiveShots,""],["패스 성공률",match.stats.passAccuracy,match.opponentStats.passAccuracy,"%"],
      ["태클 성공",match.stats.tackles,match.opponentStats.tackles,""],["코너킥",match.stats.corners,match.opponentStats.corners,""],
      ["파울",match.stats.fouls,match.opponentStats.fouls,""],["오프사이드",match.stats.offsides,match.opponentStats.offsides,""],
      ["경고",match.stats.yellowCards,match.opponentStats.yellowCards,""],["퇴장",match.stats.redCards,match.opponentStats.redCards,""]
    ].map(([label,mine,away,unit])=><StatRow label={String(label)} mine={mine as number|null} opponent={away as number|null} unit={String(unit)} key={String(label)}/>)}</div>}

    {tab === "lineup" && <div className="detail-section"><div className="team-toggle"><button className={lineupSide==="mine"?"active":""} onClick={()=>setLineupSide("mine")}>{myNickname}</button><button className={lineupSide==="opponent"?"active":""} onClick={()=>setLineupSide("opponent")}>{match.opponentNickname}</button></div><Lineup players={lineupSide==="mine"?match.players:match.opponentPlayers}/></div>}
    {tab === "shots" && <div className="detail-section"><h3>양팀 슈팅 위치</h3><ShotMap match={match}/></div>}
  </section>;
}

export default function App() {
  const [apiKey,setApiKey]=useState(""); const [nickname,setNickname]=useState(""); const [matches,setMatches]=useState<MatchSummary[]>([]);
  const [profile,setProfile]=useState<UserProfile|null>(null); const [selectedId,setSelectedId]=useState<string|null>(null);
  const [loading,setLoading]=useState(false); const [error,setError]=useState(""); const [hasMore,setHasMore]=useState(false); const requestInFlight=useRef(false);
  const [warnings,setWarnings]=useState<string[]>([]);
  const [matchType,setMatchType]=useState(50); const [matchTypes,setMatchTypes]=useState([{id:50,name:"공식경기"},{id:52,name:"감독모드"},{id:60,name:"공식 친선"}]);
  const [view,setView]=useState<"matches"|"trades"|"ranker">("matches"); const [trades,setTrades]=useState<TradeRecord[]>([]); const [tradeOwner,setTradeOwner]=useState(""); const [rankers,setRankers]=useState<RankerRecord[]>([]); const [featureLoading,setFeatureLoading]=useState(false);
  const tradeRequestId=useRef(0);
  useEffect(()=>{window.fcOnline.loadSettings().then(settings=>setNickname(settings.nickname));},[]);
  const record=useMemo(()=>matches.reduce((sum,match)=>{sum[match.result==="승"?"wins":match.result==="패"?"losses":"draws"]+=1;return sum;},{wins:0,draws:0,losses:0}),[matches]);
  const representative=useMemo(()=>matches.flatMap(match=>match.players).filter(player=>player.rating>0).sort((a,b)=>b.rating-a.rating)[0]??null,[matches]);
  async function loadMatches(offset:number){if(requestInFlight.current)return;if(!apiKey.trim()||!nickname.trim()){setError("API 키와 구단주명을 모두 입력해 주세요.");return;}requestInFlight.current=true;setLoading(true);setError("");if(offset===0)setWarnings([]);try{const data=await window.fcOnline.fetchDashboard({apiKey,nickname,offset,matchType});if(data.profile)setProfile(data.profile);if(data.matchTypes.length)setMatchTypes(data.matchTypes);setMatches(current=>offset===0?data.matches:[...current,...data.matches]);setWarnings(current=>[...current,...data.failures.map(item=>`${item.matchId.slice(0,8)}…: ${item.message}`)]);setHasMore(data.matches.length+data.failures.length===3);setView("matches");await window.fcOnline.saveSettings(nickname);}catch(reason){setError(reason instanceof Error?reason.message:"전적을 불러오지 못했습니다.");}finally{requestInFlight.current=false;setLoading(false);}}
  async function openTrades(){const requestId=++tradeRequestId.current;setView("trades");setTrades([]);setTradeOwner("API 키 계정");if(!apiKey.trim()){setError("API 키를 입력해 주세요.");return;}setFeatureLoading(true);setError("");try{const result=await window.fcOnline.fetchTrades({apiKey});const nextTrades=Array.isArray(result)?result:result?.trades;if(!Array.isArray(nextTrades))throw new Error("거래 API 응답 형식을 확인할 수 없습니다.");if(requestId===tradeRequestId.current)setTrades(nextTrades);}catch(reason){if(requestId===tradeRequestId.current){setTrades([]);setError(reason instanceof Error?reason.message:"거래 기록을 불러오지 못했습니다.");}}finally{if(requestId===tradeRequestId.current)setFeatureLoading(false);}}
  async function openRankers(){setView("ranker");if(rankers.length||!apiKey)return;const candidates=matches.flatMap(match=>match.players).filter((player,index,array)=>player.rating>0&&player.positionCode<28&&array.findIndex(item=>item.spId===player.spId&&item.positionCode===player.positionCode)===index).slice(0,5);if(!candidates.length){setError("먼저 경기 전적을 불러와 주세요.");return;}setFeatureLoading(true);setError("");try{setRankers(await window.fcOnline.fetchRankerStats({apiKey,players:candidates.map(player=>({id:player.spId,po:player.positionCode}))}));}catch(reason){setError(reason instanceof Error?reason.message:"랭커 통계를 불러오지 못했습니다.");}finally{setFeatureLoading(false);}}
  function submit(event:FormEvent){event.preventDefault();void loadMatches(0);}
  const selectedMatch=matches.find(match=>match.id===selectedId);
  return <main className="shell"><header className="topbar"><div className="brand"><span className="brand-mark">FC</span><span>ONLINE LAB</span></div><button className="login-link" onClick={()=>void window.fcOnline.openLogin()}>넥슨 로그인 ↗</button></header>
    {selectedMatch ? <MatchDetail match={selectedMatch} myNickname={profile?.nickname??nickname} onBack={()=>setSelectedId(null)}/> : <>
      <section className="hero"><div><p className="eyebrow">MATCH INTELLIGENCE</p><h1>내 플레이를<br/><em>숫자로 읽다.</em></h1><p className="subtitle">최근 공식경기를 빠르게 확인하고, 다음 경기를 위한 흐름을 찾아보세요.</p></div><form className="search-card" onSubmit={submit}><label>구단주명<input value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="구단주명을 입력하세요"/></label><label>경기 유형<select value={matchType} onChange={e=>{setMatchType(Number(e.target.value));setMatches([]);setRankers([]);}}>{matchTypes.filter(type=>[30,40,50,52,60,204,214].includes(type.id)).map(type=><option value={type.id} key={type.id}>{type.name}</option>)}</select></label><label>Nexon Open API Key<input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="API 키는 저장되지 않습니다"/></label><button className="primary" disabled={loading}>{loading?"전적 분석 중…":"전적 불러오기"}<span>→</span></button>{error&&<p className="error">{error}</p>}<p className="privacy">API 키는 이 기기에서 요청할 때만 사용되며 저장하지 않습니다.</p></form></section>
      <section className="dashboard">{profile&&<div className="profile-strip"><div className="profile-representative">{representative?<PlayerPhoto player={representative}/>:<div className="profile-avatar">{profile.nickname.slice(0,1)}</div>}</div><div className="profile-name"><small>CLUB OWNER</small><h2>{profile.nickname}</h2><span>{representative?`대표 선수 · ${representative.name} (${representative.rating.toFixed(1)})`:`OUID ${profile.ouid.slice(0,8)}…`}</span></div><div className="profile-stat"><small>LEVEL</small><b>{profile.level.toLocaleString()}</b></div><div className="profile-stat"><small>BEST DIVISION</small><b>{profile.divisionName}</b><span>{profile.divisionDate?formatNexonDate(profile.divisionDate,true):"달성 기록 없음"}</span></div></div>}
      <nav className="feature-nav"><button className={view==="matches"?"active":""} onClick={()=>setView("matches")}>경기</button><button className={view==="trades"?"active":""} onClick={()=>void openTrades()}>거래</button><button className={view==="ranker"?"active":""} onClick={()=>void openRankers()}>랭커 비교</button></nav>
      {error&&<p className="dashboard-error">{error}</p>}
      {warnings.length>0&&<details className="dashboard-warning"><summary>일부 경기 {warnings.length}건을 불러오지 못했습니다</summary>{warnings.map((warning,index)=><p key={index}>{warning}</p>)}</details>}
      {view==="matches"&&<><div className="section-heading"><div><p className="eyebrow">RECENT FORM</p><h2>{matches.length?`${nickname}님의 ${matchTypes.find(type=>type.id===matchType)?.name??"경기"}`:"최근 전적"}</h2></div>{matches.length>0&&<div className="record"><b>{record.wins}W</b><span>{record.draws}D</span><span>{record.losses}L</span></div>}</div>{matches.length===0?<div className="empty"><span>↗</span><h3>경기 데이터가 여기에 표시됩니다</h3><p>API 키와 구단주명을 입력해 전적을 확인하세요.</p></div>:<div className="match-list">{matches.map((match,index)=><button className="match-row" onClick={()=>setSelectedId(match.id)} key={match.id}><span className="match-number">{String(index+1).padStart(2,"0")}</span><span className={`result result-${resultLabel[match.result]?.toLowerCase()??"draw"}`}>{resultLabel[match.result]??match.result}</span><div className="score"><strong>{match.myScore}</strong><span>:</span><strong>{match.opponentScore}</strong></div><div className="opponent"><small>{match.divisionName} · {formatNexonDate(match.matchDate,true)}</small><b>VS {match.opponentNickname}</b></div><span className="expand-icon">→</span></button>)}{hasMore&&<button className="more" disabled={loading} onClick={()=>void loadMatches(matches.length)}>{loading?"불러오는 중…":"3경기 더 보기 ↓"}</button>}</div>}</>}
      {view==="trades"&&<TradeView trades={trades} loading={featureLoading} owner={tradeOwner}/>} {view==="ranker"&&<RankerView rankers={rankers} loading={featureLoading}/>}</section></>}
    <footer className="app-footer"><span>FC ONLINE LAB</span><p>Data based on NEXON Open API</p></footer>
  </main>;
}
