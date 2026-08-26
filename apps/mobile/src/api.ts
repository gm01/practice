import type { Dashboard, Match, Player, Shot, Stats } from "./types";

const API = "https://open.api.nexon.com/fconline/v1";
const META = "https://open.api.nexon.com/static/fconline/meta";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function request<T>(path: string, apiKey: string, params: Record<string, string | number>): Promise<T> {
  const query = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${API}${path}?${query}`, { headers: { "x-nxopen-api-key": apiKey } });
      if (response.ok) return response.json() as Promise<T>;
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      const raw = body.error?.message ?? `Nexon API 요청 실패 (${response.status})`;
      if (/api\s*key|apikey/i.test(raw) && /not valid|invalid/i.test(raw)) throw new Error("Nexon Open API 키가 유효하지 않습니다.");
      if (response.status !== 429 && response.status < 500) throw new Error(raw);
      lastError = new Error(raw);
    } catch (error) {
      if (error instanceof Error && (error.message.includes("유효하지") || error.message.includes("찾지 못"))) throw error;
      lastError = error;
    }
    await sleep(600 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error("넥슨 API에 연결하지 못했습니다.");
}

type Metadata = { players: Map<number,string>; positions: Map<number,string>; divisions: Map<number,string>; seasons: Map<number,string> };
let metadataCache: Promise<Metadata> | null = null;
function metadata(): Promise<Metadata> {
  if (!metadataCache) metadataCache = Promise.all([
    fetch(`${META}/spid.json`).then(r => r.json()) as Promise<Array<{id:number;name:string}>>,
    fetch(`${META}/spposition.json`).then(r => r.json()) as Promise<Array<{spposition:number;desc:string}>>,
    fetch(`${META}/division.json`).then(r => r.json()) as Promise<Array<{divisionId:number;divisionName:string}>>,
    fetch(`${META}/seasonid.json`).then(r => r.json()) as Promise<Array<{seasonId:number;className:string}>>,
  ]).then(([players, positions, divisions, seasons]) => ({
    players: new Map(players.map(item => [Number(item.id), item.name])),
    positions: new Map(positions.map(item => [Number(item.spposition), item.desc])),
    divisions: new Map(divisions.map(item => [Number(item.divisionId), item.divisionName])),
    seasons: new Map(seasons.map(item => [Number(item.seasonId), item.className])),
  })).catch(error => { metadataCache = null; throw error; });
  return metadataCache;
}

function minute(raw: number) {
  const size = 2 ** 24, period = Math.min(Math.max(Math.floor(raw / size), 0), 4);
  return Math.floor((raw - period * size + [0,2700,5400,6300,7200][period]) / 60) + 1;
}
function mapPlayers(info: Record<string,unknown>, meta: Metadata): Player[] {
  return ((info.player as Array<Record<string,unknown>> | undefined) ?? []).map(raw => {
    const status = raw.status as Record<string,unknown> | undefined;
    const spId = Number(raw.spId), pid = String(spId % 1_000_000);
    return { spId, name:meta.players.get(spId)??`선수 ${spId}`, position:meta.positions.get(Number(raw.spPosition))??"-", positionCode:Number(raw.spPosition), grade:Number(raw.spGrade??0), rating:Number(status?.spRating??0), goals:Number(status?.goal??0), assists:Number(status?.assist??0), shots:Number(status?.shoot??0), effectiveShots:Number(status?.effectiveShoot??0), passTry:Number(status?.passTry??0), passSuccess:Number(status?.passSuccess??0), seasonName:meta.seasons.get(Math.floor(spId/1_000_000))??"시즌 정보 없음", imageUrls:[`https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${spId}.png`,`https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${spId}.png`,`https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${pid}.png`] };
  });
}
function mapShots(info: Record<string,unknown>, names: Map<number,string>): Shot[] {
  return ((info.shootDetail as Array<Record<string,unknown>> | undefined)??[]).map(raw=>({x:Number(raw.x??0),y:Number(raw.y??0),isGoal:Number(raw.result)===3,playerName:names.get(Number(raw.spId))??"선수 정보 없음",assistName:Boolean(raw.assist)?names.get(Number(raw.assistSpId))??null:null,minute:minute(Number(raw.goalTime??0))}));
}
function mapStats(info: Record<string,unknown>): Stats {
  const detail=info.matchDetail as Record<string,unknown>|undefined, shoot=info.shoot as Record<string,unknown>|undefined, pass=info.pass as Record<string,unknown>|undefined;
  const passTry=Number(pass?.passTry??0), passSuccess=Number(pass?.passSuccess??0);
  return {possession:Number(detail?.possession??0),shots:Number(shoot?.shootTotal??0),effectiveShots:Number(shoot?.effectiveShootTotal??0),passAccuracy:passTry?Math.round(passSuccess/passTry*100):0};
}

export async function fetchDashboard(apiKey: string, nickname: string): Promise<Dashboard> {
  const identity=await request<{ouid:string}>("/id",apiKey,{nickname:nickname.trim()});
  const [profile, divisions, ids, meta]=await Promise.all([
    request<{ouid:string;nickname:string;level:number}>("/user/basic",apiKey,{ouid:identity.ouid}),
    request<Array<{matchType:number;division:number}>>("/user/maxdivision",apiKey,{ouid:identity.ouid}),
    request<string[]>("/user/match",apiKey,{ouid:identity.ouid,matchtype:50,offset:0,limit:20}), metadata(),
  ]);
  const matches: Match[]=[]; const warnings:string[]=[];
  for (const id of ids) {
    try {
      const detail=await request<{matchDate:string;matchInfo:Array<Record<string,unknown>>}>("/match-detail",apiKey,{matchid:id});
      const mine=detail.matchInfo.find(item=>item.ouid===identity.ouid), opponent=detail.matchInfo.find(item=>item.ouid!==identity.ouid);
      if(!mine||!opponent) throw new Error("경기 상세 정보 누락");
      const myShoot=mine.shoot as Record<string,unknown>|undefined, awayShoot=opponent.shoot as Record<string,unknown>|undefined;
      const shots=mapShots(mine,meta.players), opponentShots=mapShots(opponent,meta.players);
      const mineDetail=mine.matchDetail as Record<string,unknown>|undefined;
      matches.push({id,matchDate:detail.matchDate,result:String(mineDetail?.matchResult??"기록 없음"),myScore:Number(myShoot?.goalTotalDisplay??myShoot?.goalTotal??0),opponentScore:Number(awayShoot?.goalTotalDisplay??awayShoot?.goalTotal??0),ownGoalsFor:Number(awayShoot?.ownGoal??0),ownGoalsAgainst:Number(myShoot?.ownGoal??0),opponentNickname:String(opponent.nickname??"상대 구단주"),divisionName:meta.divisions.get(Number(mine.division))??"등급 정보 없음",opponentDivisionName:meta.divisions.get(Number(opponent.division))??"등급 정보 없음",controller:String(mineDetail?.controller??"정보 없음"),stats:mapStats(mine),opponentStats:mapStats(opponent),players:mapPlayers(mine,meta),opponentPlayers:mapPlayers(opponent,meta),shots,opponentShots,goals:[...shots.filter(s=>s.isGoal).map(s=>({...s,side:"mine" as const})),...opponentShots.filter(s=>s.isGoal).map(s=>({...s,side:"opponent" as const}))].sort((a,b)=>a.minute-b.minute)});
    } catch(error) { warnings.push(error instanceof Error?error.message:"경기 조회 실패"); }
    await sleep(150);
  }
  const division=divisions.find(item=>item.matchType===50);
  return {profile:{...profile,divisionName:division?meta.divisions.get(division.division)??"기록 없음":"기록 없음"},matches,warnings};
}
