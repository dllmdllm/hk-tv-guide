export function createLatestRequest() {
  let generation = 0;
  return function begin() {
    const current = ++generation;
    const controller = new AbortController();
    return { signal: controller.signal, isCurrent: () => current === generation && !controller.signal.aborted, cancel: () => controller.abort() };
  };
}
export function liveProgramme(programmes, now) {
  return programmes.find(p => Date.parse(p.start) <= now && Date.parse(p.end) > now) ?? null;
}
export function initialChannels(mobile, selected) {
  return mobile ? ['tvb-81', ...selected.filter(id=>id !== 'tvb-81')] : selected;
}

export function selectChannelSlot(current, slot, channelId) {
  const next = [...current];
  const duplicateSlot = next.findIndex((id, index) => id === channelId && index !== slot);
  if (duplicateSlot >= 0) next[duplicateSlot] = next[slot] ?? "";
  next[slot] = channelId;
  return next;
}
