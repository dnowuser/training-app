import { useState } from 'react'
import { formatDay, parseISODate } from '../lib/dates'
import type { Point } from '../lib/progress'

export interface Series {
  name: string
  /** CSS color, e.g. var(--series-1) */
  color: string
  points: Point[]
}

const W = 340
const H = 170
const PAD = { top: 12, right: 12, bottom: 22, left: 40 }

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(Number(t.toFixed(6)))
  return ticks
}

/**
 * Lines over time with an optional dashed target line. One y-axis only. Tap or
 * hover to read the values on the nearest date.
 */
export function LineChart({
  series,
  target,
  formatY = (v) => String(Math.round(v)),
  label,
}: {
  series: Series[]
  target?: { value: number; label: string }
  formatY?: (v: number) => string
  label: string
}) {
  const [hover, setHover] = useState<string | null>(null)
  const all = series.flatMap((s) => s.points)
  if (!all.length) return null

  const times = all.map((p) => parseISODate(p.x).getTime())
  let x0 = Math.min(...times)
  let x1 = Math.max(...times)
  if (x0 === x1) {
    x0 -= 7 * 864e5
    x1 += 7 * 864e5
  }
  const ys = all.map((p) => p.y).concat(target ? [target.value] : [])
  let y0 = Math.min(...ys)
  let y1 = Math.max(...ys)
  const pad = (y1 - y0) * 0.1 || Math.abs(y1) * 0.1 || 1
  y0 -= pad
  y1 += pad

  const sx = (x: string) => PAD.left + ((parseISODate(x).getTime() - x0) / (x1 - x0)) * (W - PAD.left - PAD.right)
  const sy = (y: number) => PAD.top + (1 - (y - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom)
  const dates = [...new Set(all.map((p) => p.x))].sort()
  const ticks = niceTicks(y0, y1)

  function nearest(clientX: number, rect: DOMRect) {
    const x = ((clientX - rect.left) / rect.width) * W
    let best = dates[0]
    for (const d of dates) if (Math.abs(sx(d) - x) < Math.abs(sx(best) - x)) best = d
    setHover(best)
  }

  const hovered = hover ? series.map((s) => ({ s, p: s.points.find((p) => p.x === hover) })).filter((h) => h.p) : []

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={label}
        onPointerMove={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={PAD.left - 6} y={sy(t) + 4} textAnchor="end" fontSize={10} fill="var(--chart-ink)">
              {formatY(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} fontSize={10} fill="var(--chart-ink)">
          {formatDay(dates[0])}
        </text>
        {dates.length > 1 && (
          <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={10} fill="var(--chart-ink)">
            {formatDay(dates.at(-1)!)}
          </text>
        )}
        {target && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(target.value)}
              y2={sy(target.value)}
              stroke="var(--chart-ink)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text x={W - PAD.right} y={sy(target.value) - 4} textAnchor="end" fontSize={10} fill="var(--chart-ink)">
              {target.label}
            </text>
          </g>
        )}
        {series.map((s) => (
          <g key={s.name}>
            {s.points.length > 1 && (
              <polyline
                points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {s.points.map((p) => (
              <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={hover === p.x ? 5 : 4} fill={s.color} strokeWidth={2} className="stroke-white dark:stroke-neutral-900" />
            ))}
          </g>
        ))}
        {hover && <line x1={sx(hover)} x2={sx(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--chart-ink)" strokeWidth={1} opacity={0.4} />}
      </svg>
      {hover && hovered.length > 0 && (
        <div className="pointer-events-none absolute top-0 left-12 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs shadow dark:border-neutral-700 dark:bg-neutral-900">
          <div className="text-neutral-500">{formatDay(hover)}</div>
          {hovered.map(({ s, p }) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.name}: <span className="font-semibold">{formatY(p!.y)}</span>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <figcaption className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-600 dark:text-neutral-300">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.name}
              {s.points.length > 0 && <span className="text-neutral-500">· latest {formatY(s.points.at(-1)!.y)}</span>}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  )
}
