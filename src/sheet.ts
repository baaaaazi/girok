import { useEffect, useRef, type MouseEvent, type PointerEvent, type RefObject, type SyntheticEvent } from 'react'

// Bottom-sheet behavior shared by the routine and goal sheets, matching EntryDialog:
// opens with showModal(), closes after the exit animation from a timer (some WebViews defer the
// dialog close event), on a backdrop tap whose press and release both land on the backdrop, and on cancel
// (Escape, or the Android back button via App's backHandler).
export function useSheet(onClosed: () => void, initialFocus: RefObject<HTMLElement | null>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closing = useRef(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      // Keep the keyboard down and avoid a focus ring on the first control.
      initialFocus.current?.focus()
    }
    return () => { if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current) }
  }, [])

  const close = () => {
    const dialog = dialogRef.current
    if (!dialog?.open || closing.current) return
    closing.current = true
    dialog.setAttribute('data-closing', '')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 140 : window.matchMedia('(max-width: 719px)').matches ? 180 : 160
    closeTimer.current = window.setTimeout(() => { dialog.close(); onClosed() }, duration)
  }

  const dialogProps = {
    ref: dialogRef,
    onPointerDown: (event: PointerEvent<HTMLDialogElement>) => { pressedBackdrop.current = event.target === event.currentTarget },
    onClick: (event: MouseEvent<HTMLDialogElement>) => { if (pressedBackdrop.current && event.target === event.currentTarget) close() },
    onCancel: (event: SyntheticEvent<HTMLDialogElement>) => { event.preventDefault(); close() },
  }
  return { close, dialogProps }
}
