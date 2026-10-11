import type { ReactNode } from 'react'

/** Stand-in for a screen that hasn't been built yet; lists what it will do. */
export function Placeholder({
  title,
  phase,
  children,
  items,
}: {
  title: string
  phase: 1 | 2 | 3
  children?: ReactNode
  items: string[]
}) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
      <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Coming in phase {phase}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
