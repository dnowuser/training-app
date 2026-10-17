import type { ReactNode } from 'react'
import { regionLevels } from '../lib/muscles'

/**
 * Front and back body outlines with each muscle as a region. Shading comes from
 * `level` (0-1 per muscle name, the same plain words as exercises.muscles):
 * one hue, light to dark, so more work reads darker.
 */

type Shape = { e: [cx: number, cy: number, rx: number, ry: number] } | { r: [x: number, y: number, w: number, h: number] } | { p: string }

// Left-side shapes on a 100-wide figure; mirror() adds the right side.
const mirror = (shapes: Shape[]): Shape[] =>
  shapes.flatMap((s): Shape[] => ('e' in s ? [s, { e: [100 - s.e[0], s.e[1], s.e[2], s.e[3]] }] : [s]))

const FRONT: Record<string, Shape[]> = {
  neck: [{ r: [45, 21, 10, 7] }],
  traps: mirror([{ e: [39.5, 29, 6, 2.6] }]),
  'front delts': mirror([{ e: [30.5, 35, 5.5, 6] }]),
  'side delts': mirror([{ e: [25.2, 37, 2.4, 5] }]),
  chest: mirror([{ e: [41.5, 41.5, 8.5, 6.2] }]),
  biceps: mirror([{ e: [26, 54, 3.8, 8.5] }]),
  forearms: mirror([{ e: [23, 74, 3.4, 9.5] }]),
  wrists: mirror([{ e: [21.3, 87.5, 2.4, 1.8] }]),
  core: [{ r: [44, 49, 12, 29] }],
  obliques: mirror([{ e: [38.8, 62, 3.2, 10] }]),
  'hip flexors': mirror([{ e: [42.5, 86, 4.2, 4.6] }]),
  quads: mirror([{ e: [40, 108, 6.6, 16.5] }]),
  adductors: mirror([{ e: [47, 100, 2.6, 9.5] }]),
  shins: mirror([{ e: [40.5, 148, 3, 13.5] }]),
  feet: mirror([{ e: [40, 173.5, 5, 2.8] }]),
}

const BACK: Record<string, Shape[]> = {
  neck: [{ r: [45, 21, 10, 7] }],
  traps: [{ p: 'M36 29 L64 29 L56 39 L50 52 L44 39 Z' }],
  'rear delts': mirror([{ e: [30, 35.5, 5.5, 5.8] }]),
  'side delts': mirror([{ e: [25.2, 37, 2.4, 5] }]),
  'rotator cuff': mirror([{ e: [38.5, 40.5, 4.6, 3.6] }]),
  'upper back': mirror([{ e: [44.3, 47, 3.6, 5.5] }]),
  lats: mirror([{ e: [38.2, 56, 6.2, 10.5] }]),
  'lower back': [{ r: [44.5, 61, 11, 16] }],
  triceps: mirror([{ e: [25.8, 52, 3.8, 8.5] }]),
  forearms: mirror([{ e: [23, 74, 3.4, 9.5] }]),
  glutes: mirror([{ e: [42.5, 89.5, 7.6, 7.6] }]),
  hamstrings: mirror([{ e: [41, 113, 6.2, 13.5] }]),
  adductors: mirror([{ e: [47.2, 103, 2.3, 7.5] }]),
  calves: mirror([{ e: [40.5, 144, 4.8, 11.5] }]),
  feet: mirror([{ e: [40, 173.5, 4.2, 2.8] }]),
}

function Body({ shapes, level, dx, label }: { shapes: Record<string, Shape[]>; level: Record<string, number>; dx: number; label: string }) {
  const draw = (s: Shape, key: string, fill: string, title: string) =>
    'e' in s ? (
      <ellipse key={key} cx={s.e[0]} cy={s.e[1]} rx={s.e[2]} ry={s.e[3]} fill={fill}>
        <title>{title}</title>
      </ellipse>
    ) : 'r' in s ? (
      <rect key={key} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={3} fill={fill}>
        <title>{title}</title>
      </rect>
    ) : (
      <path key={key} d={s.p} fill={fill}>
        <title>{title}</title>
      </path>
    )
  return (
    // A hairline in the silhouette colour keeps touching muscles visually apart.
    <g transform={`translate(${dx} 0)`} stroke="var(--body-fill)" strokeWidth={0.9}>
      {/* Silhouette: thick round strokes for limbs, a shape for the torso. */}
      <g stroke="var(--body-fill)" strokeLinecap="round" fill="none" strokeWidth={0}>
        <path d="M27 32 L24 64" strokeWidth={9} />
        <path d="M73 32 L76 64" strokeWidth={9} />
        <path d="M24 64 L21.5 90" strokeWidth={7} />
        <path d="M76 64 L78.5 90" strokeWidth={7} />
        <path d="M41 92 L40.5 128" strokeWidth={15} />
        <path d="M59 92 L59.5 128" strokeWidth={15} />
        <path d="M40.5 128 L40.5 168" strokeWidth={10} />
        <path d="M59.5 128 L59.5 168" strokeWidth={10} />
      </g>
      <g fill="var(--body-fill)">
        <circle cx={50} cy={13} r={9} />
        <path d="M24 31 Q50 24 76 31 L67 58 L66 84 Q50 100 34 84 L33 58 Z" />
        <circle cx={21} cy={94} r={3.2} />
        <circle cx={79} cy={94} r={3.2} />
      </g>
      {Object.entries(shapes).flatMap(([muscle, list]) => {
        const v = level[muscle] ?? 0
        const fill = v > 0 ? `color-mix(in srgb, var(--series-1) ${Math.round(25 + 75 * v)}%, var(--body-muscle))` : 'var(--body-muscle)'
        return list.map((s, i) => draw(s, `${muscle}-${i}`, fill, muscle))
      })}

      <text x={50} y={186} textAnchor="middle" fontSize={7} fill="var(--chart-ink)" stroke="none">
        {label}
      </text>
    </g>
  )
}

export function MuscleDiagram({
  level,
  label,
  className = 'w-full max-w-xs',
  children,
}: {
  /** 0-1 per muscle name. */
  level: Record<string, number>
  label: string
  className?: string
  children?: ReactNode
}) {
  const regions = regionLevels(level)
  const cardio = (level.cardio ?? 0) > 0
  return (
    <figure className={className}>
      <svg viewBox="0 0 210 190" role="img" aria-label={label} className="w-full">
        <Body shapes={FRONT} level={regions} dx={0} label="Front" />
        <Body shapes={BACK} level={regions} dx={110} label="Back" />
        {cardio && (
          <path
            d="M44 38 c-2 -3 -6 -2 -6 1.5 c0 3 6 6.5 6 6.5 s6 -3.5 6 -6.5 c0 -3.5 -4 -4.5 -6 -1.5 z"
            fill="var(--series-2)"
            stroke="white"
            strokeWidth={0.8}
          >
            <title>cardio</title>
          </path>
        )}
      </svg>
      {children}
    </figure>
  )
}
