import { sfx } from '../lib/sound'
import { useEffect } from 'react'
import { teamOf, teamStandings } from '../lib/teams'

const ROW = 52
const MEDALS = ['🥇', '🥈', '🥉']

// Rows are absolutely positioned by rank so they slide when the order changes.
export default function Leaderboard({ players, meId, showFlags = false, teamCount = 0, showStreaks = false, onKick }) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.joined_at.localeCompare(b.joined_at))
  const rank = new Map(sorted.map((p, i) => [p.id, i]))
  const meScore = players.find((p) => p.id === meId)?.score
  useEffect(() => {
    if (meScore) sfx.select()
  }, [meScore])
  const teams = teamCount ? teamStandings(players, teamCount) : []

  return (
    <aside className="leaderboard pixel-box">
      <h3>⚔ Hall of Valhalla</h3>
      {teams.length > 0 && (
        <ul className="team-board">
          {teams.map((t) => (
            <li key={t.index} style={{ borderColor: t.color }}>
              <span style={{ color: t.color }}>{t.name}</span>
              <small>{t.members}p</small>
              <b>{t.score}</b>
            </li>
          ))}
        </ul>
      )}
      {sorted.length === 0 && <p className="muted">Waiting for players…</p>}
      <div className="lb-scroll">
        <ol className="lb-list" style={{ height: sorted.length * ROW }}>
          {players.map((p) => {
            const r = rank.get(p.id)
            return (
              <li
                key={p.id}
                className={`lb-row ${p.id === meId ? 'me' : ''}`}
                style={{ transform: `translateY(${r * ROW}px)` }}
              >
                <span className="lb-rank">{MEDALS[r] || `${r + 1}.`}</span>
                {teamCount > 0 && p.team != null && <span className="lb-team" style={{ background: teamOf(p.team).color }} title={teamOf(p.team).name} />}
                <span className="lb-name">{p.name}</span>
                {showStreaks && p.streak >= 2 && <span className="lb-streak" title={`${p.streak} correct in a row`}>🔥{p.streak}</span>}
                {showFlags && p.violations > 0 && (
                  <span className="lb-flag" title={`${p.violations} anti-cheat flags`}>⚠{p.violations}</span>
                )}
                <span className="lb-score" key={p.score}>
                  {p.score}
                </span>
                {onKick && (
                  <span className="lb-kick">
                    <button type="button" title="Kick" onClick={() => onKick(p, false)}>✕</button>
                    <button type="button" title="Ban" onClick={() => onKick(p, true)}>🚫</button>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </aside>
  )
}
