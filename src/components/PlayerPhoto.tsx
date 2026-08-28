export default function PlayerPhoto({ player, compact = false, showSeason = false }: { player: PlayerSummary; compact?: boolean; showSeason?: boolean }) {
  return (
    <div className={`player-photo${compact ? " compact" : ""}${showSeason ? " has-season" : ""}`}>
      <span>{player.name.slice(0, 1)}</span>
      <img
        className="player-image"
        src={player.imageUrls[0]}
        alt={player.name}
        onError={(event) => {
          const image = event.currentTarget;
          const next = Number(image.dataset.index ?? 0) + 1;
          if (next < player.imageUrls.length) {
            image.dataset.index = String(next);
            image.src = player.imageUrls[next];
          } else {
            image.style.display = "none";
          }
        }}
      />
      {showSeason&&player.seasonImageUrl&&<img className="player-season-icon" src={player.seasonImageUrl} alt={`${player.seasonName} 시즌`} onError={event=>{event.currentTarget.style.display="none"}}/>}
    </div>
  );
}
