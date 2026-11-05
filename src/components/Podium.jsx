export default function Podium({ players }) {
  const top = [...players].sort((a, b) => b.score - a.score).slice(0, 3)
  const order = [top[1], top[0], top[2]] // 2nd, 1st, 3rd
  const heights = [120, 170, 90]
  return (
    <div className="podium">
      {order.map((p, i) =>
        p ? (
          <div key={p.id} className="podium-col">
            <div className="podium-name">{p.name}</div>
            <div className="podium-score">{p.score}</div>
            <div className="podium-block" style={{ '--h': `${heights[i]}px`, animationDelay: `${i * 250}ms` }}>
              {['🥈', '🥇', '🥉'][i]}
            </div>
          </div>
        ) : (
          <div key={i} className="podium-col" />
        ),
      )}
    </div>
  )
}
