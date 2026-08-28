import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const FAVORITES_KEY = "fconline.player-favorites.v1";

function readFavorites(): number[] { try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as number[]; } catch { return []; } }
function bp(value: number) { return value ? `${new Intl.NumberFormat("ko-KR").format(value)} BP` : "시세 정보 없음"; }
function statColor(value: number) {
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
}
function sortedClubCareer(rows: PlayerDetail["clubCareer"]) {
  const year = (value: string) => Number(value.match(/\d{4}/)?.[0] ?? 0);
  return [...rows].sort((a,b)=>year(b.years)-year(a.years)||b.years.localeCompare(a.years,"ko-KR")||a.club.localeCompare(b.club,"ko-KR"));
}

function CardPhoto({ card, large = false, seasonImageUrl }: { card: Pick<PlayerCard, "name" | "imageUrls">; large?: boolean; seasonImageUrl?: string }) {
  const [index,setIndex]=useState(0),[failed,setFailed]=useState(false),[seasonFailed,setSeasonFailed]=useState(false);
  useEffect(()=>{setIndex(0);setFailed(false)},[card.imageUrls]);
  useEffect(()=>setSeasonFailed(false),[seasonImageUrl]);
  return <div className={`db-card-photo${large?" large":""}`}>{failed?<span>{card.name.slice(0,1)}</span>:<img className="db-player-image" src={card.imageUrls[index]} alt={card.name} onError={()=>index+1<card.imageUrls.length?setIndex(index+1):setFailed(true)}/>} {seasonImageUrl&&!seasonFailed&&<img className="db-season-icon" src={seasonImageUrl} alt="" aria-hidden="true" onError={()=>setSeasonFailed(true)}/>}</div>;
}

function SeasonIcon({ card }: { card: Pick<PlayerCard, "seasonImageUrl" | "seasonName"> }) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[card.seasonImageUrl]);
  if(!card.seasonImageUrl||failed)return null;
  return <img className="db-inline-season-icon" src={card.seasonImageUrl} alt={`${card.seasonName} 시즌`} onError={()=>setFailed(true)}/>;
}

function FootRatings({ right, left }: { right: number; left: number }) {
  return <span className="db-feet" aria-label={`왼발 ${left||"정보 없음"}, 오른발 ${right||"정보 없음"}`}><span><b>왼발</b>{left||"-"}</span><span><b>오른발</b>{right||"-"}</span></span>;
}

function PriceChart({ rows }: { rows: Array<{ date: string; value: number }> }) {
  const recent=rows.slice(-30),values=recent.map(row=>row.value),min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,1);
  if(recent.length<2)return null;
  const points=recent.map((row,index)=>`${index/(recent.length-1)*100},${42-(row.value-min)/range*38}`).join(" ");
  return <div className="db-price-chart"><svg viewBox="0 0 100 44" preserveAspectRatio="none" role="img" aria-label="최근 30일 시세 흐름"><polyline points={points}/></svg><small>{recent[0].date}</small><small>{recent.at(-1)?.date}</small></div>;
}

function TeamColorSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; name: string }>; onChange: (value: string) => void }) {
  return <label className="db-selector"><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value)}><option value="0">적용 안 함</option>{options.map(option=><option value={option.value} key={`${label}-${option.value}`}>{option.name}</option>)}</select></label>;
}

function PlayerComparison({ cards, onClose }: { cards: [PlayerCard,PlayerCard]; onClose: () => void }) {
  const [grades,setGrades]=useState<[number,number]>([1,1]);
  const [details,setDetails]=useState<[PlayerDetail|null,PlayerDetail|null]>([null,null]);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{let active=true;setLoading(true);setError("");Promise.all(cards.map((card,index)=>window.fcOnline.fetchPlayerDetail(card.spId,grades[index],{adaptation:1}))).then(values=>{if(active)setDetails(values as [PlayerDetail,PlayerDetail])}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"선수 비교 정보를 불러오지 못했습니다.")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[cards,grades]);
  const [left,right]=details;
  const labels=left&&right?[...new Set([...left.abilities.map(row=>row.label),...right.abilities.map(row=>row.label)])]:[];
  const ability=(detail:PlayerDetail,label:string)=>detail.abilities.find(row=>row.label===label)?.value??0;
  return <section className="db-comparison"><div className="db-compare-heading"><div><p className="eyebrow">PLAYER COMPARISON</p><h2>선수 비교</h2></div><button onClick={onClose} aria-label="선수 비교 닫기">×</button></div><div className="db-compare-heroes">{cards.map((card,index)=><article key={card.spId}><CardPhoto card={card} large seasonImageUrl={card.seasonImageUrl}/><div><SeasonIcon card={card}/><b>{card.name}</b><span>{card.seasonName}</span><small>{card.primaryPosition} · 급여 {card.salary||"-"}</small><FootRatings right={card.rightFoot} left={card.leftFoot}/></div><label>강화<select value={grades[index]} onChange={event=>setGrades(current=>index===0?[Number(event.target.value),current[1]]:[current[0],Number(event.target.value)])}>{Array.from({length:13},(_,grade)=><option value={grade+1} key={grade+1}>{grade+1}강</option>)}</select></label></article>)}</div>{loading&&<div className="db-loading">두 선수의 능력치를 비교하는 중…</div>}{error&&<p className="dashboard-error">{error}</p>}{left&&right&&<div className="db-compare-table"><div className="db-compare-overall"><strong style={{color:statColor(left.overall)}}>{left.overall}</strong><span>OVR</span><strong style={{color:statColor(right.overall)}}>{right.overall}</strong></div>{labels.map(label=>{const l=ability(left,label),r=ability(right,label);return <div className="db-compare-row" key={label}><strong className={l>r?"winner":""}>{l}</strong><i>{l===r?"–":l>r?`+${l-r}`:`-${r-l}`}</i><span>{label}</span><i>{l===r?"–":r>l?`+${r-l}`:`-${l-r}`}</i><strong className={r>l?"winner":""}>{r}</strong></div>})}</div>}</section>;
}

export default function PlayerDatabase({ matches, onHeaderBackChange, initialQuery = "" }: { matches: MatchSummary[]; onHeaderBackChange?: (handler: (() => void) | null) => void; initialQuery?: string }) {
  const [query,setQuery]=useState(initialQuery),[rows,setRows]=useState<PlayerCard[]>([]),[selected,setSelected]=useState<PlayerCard|null>(null),[grade,setGrade]=useState(1);
  const [detail,setDetail]=useState<PlayerDetail|null>(null),[detailLoading,setDetailLoading]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[favorites,setFavorites]=useState<number[]>(readFavorites);
  const [detailOptions,setDetailOptions]=useState<PlayerDetailOptions>({adaptation:1}),[statFilter,setStatFilter]=useState("전체");
  const [compare,setCompare]=useState<PlayerCard[]>([]);
  const closeDetail=useCallback(()=>{setSelected(null);setDetail(null)},[]);
  const appearances=useMemo(()=>selected?matches.flatMap(match=>{const player=match.players.find(item=>item.spId===selected.spId&&item.rating>0);return player?[{match,player}]:[]}):[],[matches,selected]);
  useEffect(()=>{if(!selected)return;let active=true;setDetailLoading(true);setError("");void window.fcOnline.fetchPlayerDetail(selected.spId,grade,detailOptions).then(value=>{if(active)setDetail(value)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"선수 상세 조회 실패")}).finally(()=>{if(active)setDetailLoading(false)});return()=>{active=false}},[selected,grade,detailOptions]);
  useEffect(()=>{onHeaderBackChange?.(selected?closeDetail:null);return()=>onHeaderBackChange?.(null)},[selected,closeDetail,onHeaderBackChange]);
  const runSearch=useCallback(async(value:string)=>{if(!value.trim()){setError("선수명을 입력해 주세요.");return}setLoading(true);setError("");try{setRows(await window.fcOnline.searchPlayers(value));setSelected(null)}catch(reason){setError(reason instanceof Error?reason.message:"선수 검색 실패")}finally{setLoading(false)}},[]);
  useEffect(()=>{if(initialQuery.trim()){setQuery(initialQuery);void runSearch(initialQuery)}},[initialQuery,runSearch]);
  async function submit(event:FormEvent){event.preventDefault();await runSearch(query)}
  function toggle(id:number){const next=favorites.includes(id)?favorites.filter(item=>item!==id):[id,...favorites];setFavorites(next);localStorage.setItem(FAVORITES_KEY,JSON.stringify(next));}
  function toggleCompare(card:PlayerCard){setCompare(current=>current.some(item=>item.spId===card.spId)?current.filter(item=>item.spId!==card.spId):current.length<2?[...current,card]:[current[1],card])}
  function choose(card:PlayerCard){setSelected(card);setDetail(null);setGrade(1);setDetailOptions({adaptation:1});setStatFilter("전체");setError("")}

  if(selected)return <section className="player-db">
    <div className="db-detail-hero"><CardPhoto card={detail??selected} large seasonImageUrl={selected.seasonImageUrl}/><div><p className="eyebrow">PLAYER INFORMATION</p><h1>{selected.name}</h1><span>{selected.seasonName}</span>{detail&&<><b className="db-overall" style={{color:statColor(detail.overall)}}>{detail.primaryPosition} {detail.overall}{detail.overallDelta>0&&<em>+{detail.overallDelta}</em>}</b><small>{detail.nation} · 급여 {detail.salary} · {detail.playerClass}</small></>}</div><button className="db-favorite" aria-label="선수 즐겨찾기" onClick={()=>toggle(selected.spId)}>{favorites.includes(selected.spId)?"★":"☆"}</button></div>
    <div className="db-grade"><b>강화</b>{Array.from({length:13},(_,index)=>index+1).map(value=><button className={grade===value?"active":""} onClick={()=>{setGrade(value);setDetailOptions({adaptation:1})}} key={value}>+{value}</button>)}</div>
    {detailLoading&&<div className="db-loading">선수 능력치와 시세를 불러오는 중…</div>}{error&&<p className="dashboard-error">{error}</p>}
    {detail&&<>
      <div className="db-teamcolor"><div><p className="eyebrow">TEAM COLOR DATABASE</p><h2>능력치 적용 설정</h2><small>적응도와 팀컬러를 선택하면 기본 능력치 대비 상승값을 계산합니다.</small></div><div className="db-selectors"><label className="db-selector"><span>적응도</span><select value={detailOptions.adaptation??1} onChange={event=>setDetailOptions(current=>({...current,adaptation:Number(event.target.value) as 1|5}))}><option value="1">적응도 1</option><option value="5">적응도 5</option></select></label><TeamColorSelect label="강화 팀컬러" value={detailOptions.enhancementId?`${detailOptions.enhancementId}:${detailOptions.enhancementLevel??1}`:"0"} options={detail.teamColorOptions.enhancement.map(option=>({value:`${option.id}:${option.level}`,name:option.name}))} onChange={value=>{const [id,level]=value.split(":").map(Number);setDetailOptions(current=>({...current,enhancementId:id||0,enhancementLevel:level||0}))}}/><TeamColorSelect label="소속 팀컬러" value={String(detailOptions.affiliationId??0)} options={detail.teamColorOptions.affiliation.map(option=>({value:String(option.id),name:option.name}))} onChange={value=>setDetailOptions(current=>({...current,affiliationId:Number(value)}))}/><TeamColorSelect label="관계·특성 팀컬러" value={String(detailOptions.featureId??0)} options={detail.teamColorOptions.feature.map(option=>({value:String(option.id),name:option.name}))} onChange={value=>setDetailOptions(current=>({...current,featureId:Number(value)}))}/></div></div>
      <div className="db-profile-line"><span>{detail.birthDate}</span><span>{detail.height}</span><span>{detail.weight}</span><span>{detail.bodyType}</span><span>개인기 {"★".repeat(detail.skillMoves)}</span><FootRatings right={detail.rightFoot} left={detail.leftFoot}/></div>
      <div className="db-summary-stats">{detail.summaryAbilities.map(row=><article key={row.label}><small>{row.label}</small><b style={{color:statColor(row.value)}}>{row.value}{row.delta>0&&<em>+{row.delta}</em>}</b></article>)}</div>
      <div className="db-section-grid"><article className="db-panel"><h2>시세</h2><strong className="db-current-price">{bp(detail.currentPrice)}</strong><PriceChart rows={detail.priceHistory}/></article><article className="db-panel"><h2>특성</h2><div className="db-traits">{detail.traits.length?detail.traits.map(trait=><span key={trait}>{trait}</span>):<small>등록된 특성이 없습니다.</small>}</div></article></div>
      <h2>포지션별 오버롤</h2><div className="db-positions">{detail.positions.map(row=><span key={row.position}><small>{row.position}</small><b style={{color:statColor(row.value)}}>{row.value}{row.delta>0&&<em>+{row.delta}</em>}</b></span>)}</div>
      <h2>세부 능력치</h2><div className="db-effect-filter"><button className={statFilter==="전체"?"active":""} onClick={()=>setStatFilter("전체")}>전체</button>{detail.abilities.map(row=><button className={statFilter===row.label?"active":""} onClick={()=>setStatFilter(row.label)} key={row.label}>{row.label}{row.delta>0&&` +${row.delta}`}</button>)}</div><div className="db-abilities">{detail.abilities.filter(row=>statFilter==="전체"||row.label===statFilter).map(row=><span className={row.delta>0?"boosted":""} key={row.label}><small>{row.label}</small><b style={{color:statColor(row.value)}}>{row.value}{row.delta>0&&<em>+{row.delta}</em>}</b></span>)}</div>
      <article className="db-panel db-club-panel"><h2>클럽 경력</h2>{detail.clubCareer.length?<><div className="db-club db-club-head" aria-hidden="true"><span>기간</span><b>클럽</b><small>구분</small></div>{sortedClubCareer(detail.clubCareer).map((row,index)=><div className="db-club" key={`${row.years}-${row.club}-${index}`}><span>{row.years}</span><b>{row.club}</b><small>{row.loan}</small></div>)}</>:<small>등록된 클럽 경력이 없습니다.</small>}</article>
    </>}
    <h2>내 경기 기록</h2>{appearances.length?<div className="db-kpis"><article><small>출전</small><b>{appearances.length}</b></article><article><small>평균 평점</small><b>{(appearances.reduce((sum,row)=>sum+row.player.rating,0)/appearances.length).toFixed(2)}</b></article><article><small>골·도움</small><b>{appearances.reduce((sum,row)=>sum+row.player.goals,0)} · {appearances.reduce((sum,row)=>sum+row.player.assists,0)}</b></article><article><small>사용 강화</small><b>+{appearances[0].player.grade}</b></article></div>:<p className="db-empty">현재 불러온 경기에는 이 시즌 카드의 출전 기록이 없습니다.</p>}
    <p className="db-source">Data based on NEXON Open API · 선수 상세 정보는 EA SPORTS FC ONLINE 데이터센터 기반입니다.</p>
  </section>;
  return <section className="player-db"><div className="section-heading"><div><p className="eyebrow">PLAYER INFORMATION</p><h2>선수 정보</h2><p>선수명으로 모든 시즌 카드를 찾고 능력치·시세·내 경기 기록을 확인합니다.</p></div></div><form className="db-search" onSubmit={submit}><input value={query} onChange={event=>setQuery(event.target.value)} aria-label="선수명 검색"/><button disabled={loading}>{loading?"검색 중…":"검색"}</button></form>{error&&<p className="dashboard-error">{error}</p>}{compare.length===1&&<p className="db-compare-hint"><b>{compare[0].name}</b> 선택됨 · 비교할 선수를 한 명 더 선택하세요.</p>}{compare.length===2&&<PlayerComparison cards={compare as [PlayerCard,PlayerCard]} onClose={()=>setCompare([])}/>}<div className="db-results">{rows.map(card=><article className="db-result" onClick={()=>choose(card)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" ")choose(card)}} role="button" tabIndex={0} key={card.spId}><CardPhoto card={card}/><span className="db-result-info"><span className="db-result-name"><SeasonIcon card={card}/><b>{card.name}</b><FootRatings right={card.rightFoot} left={card.leftFoot}/></span><span className="db-result-meta"><b>{card.primaryPosition||"-"}</b><small>급여 {card.salary||"-"}</small><strong>OVR {card.overall||"-"}</strong><em>1강</em></span></span><span className="db-result-actions"><i>{favorites.includes(card.spId)?"★":"→"}</i><button className={compare.some(item=>item.spId===card.spId)?"active":""} onClick={event=>{event.stopPropagation();toggleCompare(card)}}>{compare.some(item=>item.spId===card.spId)?"선택됨":"비교"}</button></span></article>)}</div>{!loading&&query&&rows.length===0&&!error&&<p className="db-empty">검색 결과가 없습니다.</p>}</section>;
}
