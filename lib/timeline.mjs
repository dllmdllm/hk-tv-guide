const PX_PER_MINUTE = 2.5;
export const MIN_TOUCH_HEIGHT = 48;

/** @param {{start: string, end: string}} programme @param {string} selectedDate */
export function programmeSpan(programme, selectedDate) {
  const dayStart = new Date(`${selectedDate}T00:00:00+08:00`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const start = Math.min(dayEnd, Math.max(dayStart, new Date(programme.start).getTime()));
  const end = Math.min(dayEnd, Math.max(dayStart, new Date(programme.end).getTime()));
  const startMinute = (start - dayStart) / 60000;
  const endMinute = (end - dayStart) / 60000;
  return {
    startMinute,
    endMinute,
    height: Math.max(2, (endMinute - startMinute) * PX_PER_MINUTE),
  };
}

/** @param {Array<{id: string, start: string, end: string}>} programmes @param {string} selectedDate @param {Record<string, number>} measuredHeights */
export function createTimelineLayout(programmes, selectedDate, measuredHeights = {}) {
  const spans = programmes.map((programme) => {
    const span = programmeSpan(programme, selectedDate);
    return {
      id: programme.id,
      start: span.startMinute,
      end: span.endMinute,
      scale: Math.max(1, Math.max(MIN_TOUCH_HEIGHT, measuredHeights[programme.id] ?? 0) / ((span.endMinute - span.startMinute) * PX_PER_MINUTE)),
    };
  }).filter((span) => span.end > span.start);

  const boundaries = new Set([0, 24 * 60]);
  for (let minute = 30; minute < 24 * 60; minute += 30) boundaries.add(minute);
  spans.forEach((span) => {
    boundaries.add(span.start);
    boundaries.add(span.end);
  });

  const points = [...boundaries].sort((a, b) => a - b);
  const segments = [];
  let height = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const scale = spans.reduce((largest, span) => span.start < end && span.end > start ? Math.max(largest, span.scale) : largest, 1);
    segments.push({ start, end, top: height, scale });
    height += (end - start) * PX_PER_MINUTE * scale;
  }

  const minuteToY = (minute) => {
    const clamped = Math.min(24 * 60, Math.max(0, minute));
    if (clamped === 24 * 60) return height;
    let low = 0;
    let high = segments.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (clamped <= segments[middle].end) high = middle;
      else low = middle + 1;
    }
    const segment = segments[low];
    return segment.top + (clamped - segment.start) * PX_PER_MINUTE * segment.scale;
  };

  const positions = new Map();
  spans.forEach((span) => {
    const top = minuteToY(span.start);
    positions.set(span.id, { top, height: minuteToY(span.end) - top });
  });

  return { height, positions, minuteToY };
}

/** Assign real source overlaps to separate lanes without changing broadcast timestamps.
 * @template {{id: string, start: string, end: string}} T
 * @param {T[]} programmes @param {string} selectedDate
 * @returns {Array<T & {lane: number, laneCount: number}>}
 */
export function createChannelLanes(programmes, selectedDate) {
  const sorted = [...programmes].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  const result = [];
  let group = [], laneEnds = [], groupEnd = -1;
  const flush = () => {
    for (const item of group) result.push({ ...item, laneCount: laneEnds.length });
    group = []; laneEnds = []; groupEnd = -1;
  };
  for (const programme of sorted) {
    const span = programmeSpan(programme, selectedDate);
    if (span.endMinute <= span.startMinute) continue;
    if (span.startMinute >= groupEnd) flush();
    let lane = laneEnds.findIndex(end => end <= span.startMinute);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = span.endMinute;
    groupEnd = Math.max(groupEnd, span.endMinute);
    group.push({ ...programme, lane });
  }
  flush();
  return result;
}
/** Position the whole current card when it fits; keep its beginning readable when taller than the viewport.
 * @param {{top: number, height: number}} position
 * @param {number} headerHeight @param {number} viewportHeight @param {number} maxTop
 * @param {number} visibleTop @param {number} visibleBottom
 */
export function programmeScrollTop(position, headerHeight, viewportHeight, maxTop, visibleTop = 0, visibleBottom = viewportHeight) {
  const usableTop = Math.max(headerHeight, visibleTop) + 12;
  const usableBottom = Math.max(usableTop, Math.min(viewportHeight, visibleBottom) - 12);
  const availableHeight = usableBottom - usableTop;
  const target = position.height > availableHeight ? headerHeight + position.top - usableTop : headerHeight + position.top + position.height / 2 - (usableTop + availableHeight / 2);
  return Math.max(0, Math.min(target, Math.max(0, maxTop)));
}
