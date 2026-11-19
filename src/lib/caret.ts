import type { FocusEvent, MouseEvent } from 'react'

/**
 * Tapping into a number box puts the cursor after the number, so backspace clears
 * it and typing adds to it. iOS places the cursor where you tapped *after* the
 * focus event, so it's moved again once that tap finishes; a later tap inside an
 * already-focused box still puts the cursor where you tap.
 */
const toEnd = (el: HTMLInputElement) => {
  const n = el.value.length
  try {
    el.setSelectionRange(n, n)
  } catch {
    // Some input types don't allow a selection; nothing to do.
  }
}

export const caretToEnd = {
  onFocus: (e: FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget
    el.dataset.justFocused = '1'
    setTimeout(() => toEnd(el), 0)
    setTimeout(() => delete el.dataset.justFocused, 400)
  },
  onClick: (e: MouseEvent<HTMLInputElement>) => {
    const el = e.currentTarget
    if (el.dataset.justFocused) toEnd(el)
  },
}
