export const TEAMS = [
  { name: 'Æsir', color: '#f2c14e' },
  { name: 'Vanir', color: '#5fd38d' },
  { name: 'Jötnar', color: '#6fc3ff' },
  { name: 'Einherjar', color: '#ff7a45' },
  { name: 'Valkyries', color: '#c58bff' },
  { name: 'Berserkers', color: '#ff5470' },
]

export const teamOf = (i) => TEAMS[i] ?? TEAMS[0]

// Team score = average per member, so uneven teams stay fair.
export function teamStandings(players, count) {
  return Array.from({ length: count }, (_, i) => {
    const members = players.filter((p) => p.team === i)
    const total = members.reduce((s, p) => s + p.score, 0)
    return { index: i, ...teamOf(i), members: members.length, total, score: members.length ? Math.round(total / members.length) : 0 }
  }).sort((a, b) => b.score - a.score)
}
