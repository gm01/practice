export default function PlayerPhoto({ player, compact = false }: { player: PlayerSummary; compact?: boolean }) {
  return (
    <div className={`player-photo ${compact ? "compact" : ""}`}>
      <span>{player.name.slice(0, 1)}</span>
      <img
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
    </div>
  );
}
