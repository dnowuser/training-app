import type { ReactNode } from 'react'
import { BACK, FRONT, type Figure } from '../lib/anatomy'

export interface MuscleFill {
  fill: string
  title?: string
}

/**
 * Front and back anatomy figures with every muscle drawn separately and outlined,
 * coloured per muscle (muscle_ref names). Muscles without a fill stay neutral.
 */
export function AnatomyMap({
  fills,
  label,
  className = 'w-full max-w-sm',
  children,
}: {
  fills: Record<string, MuscleFill>
  label: string
  className?: string
  children?: ReactNode
}) {
  return (
    <figure className={className}>
      <svg viewBox="0 0 214 214" role="img" aria-label={label} className="w-full">
        <Body figure={FRONT} fills={fills} dx={2} label="Front" />
        <Body figure={BACK} fills={fills} dx={112} label="Back" />
      </svg>
      {children}
    </figure>
  )
}

function Body({ figure, fills, dx, label }: { figure: Figure; fills: Record<string, MuscleFill>; dx: number; label: string }) {
  const shape = (name: string, d: string, key: string) => {
    const f = fills[name]
    return (
      <path key={key} d={d} fill={f?.fill ?? 'var(--body-muscle)'}>
        <title>{f?.title ?? name}</title>
      </path>
    )
  }
  const muscles = Object.entries(figure.muscles)
  return (
    <g transform={`translate(${dx} 0)`}>
      <g fill="var(--body-fill)" stroke="var(--anatomy-line)" strokeWidth={0.8} strokeLinejoin="round">
        <path d={figure.silhouette} />
        <path d={figure.silhouette} transform="translate(100 0) scale(-1 1)" />
        <circle cx={figure.head.cx} cy={figure.head.cy} r={figure.head.r} />
      </g>
      {/* Bold outlines keep every muscle visibly separate. */}
      <g stroke="var(--anatomy-line)" strokeWidth={0.7} strokeLinejoin="round">
        {muscles.map(([name, d]) => shape(name, d, name))}
        <g transform="translate(100 0) scale(-1 1)">{muscles.map(([name, d]) => shape(name, d, name + '-r'))}</g>
        {Object.entries(figure.center ?? {}).map(([name, d]) => shape(name, d, name + '-c'))}
      </g>
      <text x={50} y={210} textAnchor="middle" fontSize={7} fill="var(--chart-ink)">
        {label}
      </text>
    </g>
  )
}
