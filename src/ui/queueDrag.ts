/** Drop index for a Queue-screen drag. Playing row (0) is not a valid target. */
export const queueDragDropIndex = (
  from: number,
  translationY: number,
  viewLen: number,
  rowHeight: number,
): number => {
  'worklet'
  if (from < 1 || viewLen <= 1 || rowHeight <= 0) return from
  return Math.max(
    1,
    Math.min(viewLen - 1, from + Math.round(translationY / rowHeight)),
  )
}

/**
 * How far a non-dragged row should slide to open a drop gap.
 * The dragged row follows the finger instead.
 */
export const queueDragRowShift = (
  viewIndex: number,
  from: number,
  to: number,
  rowHeight: number,
): number => {
  'worklet'
  if (from < 1 || viewIndex === from || from === to) return 0
  if (from < to && viewIndex > from && viewIndex <= to) return -rowHeight
  if (from > to && viewIndex < from && viewIndex >= to) return rowHeight
  return 0
}
