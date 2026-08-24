import { formatNexonDate } from "../../shared/nexon";

export function TradeView({ trades, loading, owner }: { trades: TradeRecord[]; loading: boolean; owner: string }) {
  const safeTrades = Array.isArray(trades) ? trades : [];
  const totals = safeTrades.reduce((sum, item) => {
    sum[item.type] += item.value;
    return sum;
  }, { buy: 0, sell: 0 });

  return <div className="feature-view">
    <div className="section-heading"><div><p className="eyebrow">TRANSFER MARKET</p><h2>{owner ? `${owner}의 최근 거래 기록` : "최근 거래 기록"}</h2><p className="feature-notice">거래 API는 OUID를 지원하지 않아 입력한 구단주명이 아닌 API 키에 연결된 계정의 기록을 표시합니다.</p></div></div>
    {loading ? <div className="empty">거래 기록을 불러오는 중…</div> : <>
      <div className="trade-summary">
        <div><small>구매 합계</small><b>{totals.buy.toLocaleString()} BP</b></div>
        <div><small>판매 합계</small><b>{totals.sell.toLocaleString()} BP</b></div>
        <div><small>순거래</small><b>{(totals.sell - totals.buy).toLocaleString()} BP</b></div>
      </div>
      <div className="trade-list">{safeTrades.map(item => <div className="trade-row" key={`${item.type}-${item.saleSn}`}>
        <span className={`trade-type ${item.type}`}>{item.type === "buy" ? "구매" : "판매"}</span>
        {item.seasonImageUrl ? <img src={item.seasonImageUrl} alt="" /> : <span />}
        <div><b>{item.playerName}</b><small>{item.seasonName} · +{item.grade}강</small></div>
        <strong>{item.value.toLocaleString()} BP</strong><time>{formatNexonDate(item.tradeDate)}</time>
      </div>)}</div>
    </>}
  </div>;
}

export function RankerView({ rankers, loading }: { rankers: RankerRecord[]; loading: boolean }) {
  return <div className="feature-view">
    <div className="section-heading"><div><p className="eyebrow">TOP 10,000 BENCHMARK</p><h2>랭커 선수 평균</h2></div></div>
    {loading ? <div className="empty">랭커 통계를 분석하는 중…</div> : <div className="ranker-grid">{rankers.map(item => <article className="ranker-card" key={`${item.spid}-${item.spPosition}`}>
      <div><small>{item.position} · 최근 {item.status.matchCount}경기</small><h3>{item.playerName}</h3></div>
      <div className="ranker-numbers">
        <span><small>경기당 골</small><b>{item.status.goal.toFixed(2)}</b></span>
        <span><small>경기당 도움</small><b>{item.status.assist.toFixed(2)}</b></span>
        <span><small>유효 슈팅</small><b>{item.status.effectiveShoot.toFixed(2)}</b></span>
        <span><small>패스 성공</small><b>{item.status.passSuccess.toFixed(2)}</b></span>
      </div>
      <time>기준 {formatNexonDate(item.createDate)}</time>
    </article>)}</div>}
  </div>;
}
