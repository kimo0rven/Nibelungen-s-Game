const EMBERS = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 47) % 100,
  dur: 7 + ((i * 13) % 9),
  delay: -((i * 5) % 11),
  dx: ((i * 29) % 80) - 40,
}))

export default function Embers() {
  return (
    <div className="embers" aria-hidden="true">
      {EMBERS.map((e, i) => (
        <i key={i} style={{ left: `${e.left}%`, animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s`, '--dx': `${e.dx}px` }} />
      ))}
    </div>
  )
}
