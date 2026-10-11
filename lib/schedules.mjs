export const SOURCES = ['TVB', 'HOY', '港台', 'ViuTV'];
export function hktDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function overlappingDates(item) {
  const dates = [];
  const end = Date.parse(item.end);
  for (let start = Date.parse(`${hktDate(item.start)}T00:00:00+08:00`); start < end; start += 86400000) dates.push(hktDate(start));
  return dates;
}
function valid(item, channels) {
  return item.title && channels.some(c => c.id === item.channelId) && Number.isFinite(Date.parse(item.start)) && Date.parse(item.end) > Date.parse(item.start);
}
export function mergeSchedules(archives, results, channels, checkedAt) {
  const old = new Map();
  for (const archive of archives) for (const item of archive.programmes) old.set(`${item.channelId}-${Date.parse(item.start)}`, item);
  for (const source of SOURCES) {
    const result = results[source];
    if (!result || result.error) continue;
    if (!result.items.length || result.items.some(item => !valid(item, channels))) throw new Error(`${source}: invalid schedule`);
    for (const channel of channels.filter(c => c.operator === source)) {
      const items = result.items.filter(item => item.channelId === channel.id).sort((a,b) => Date.parse(a.start)-Date.parse(b.start));
      if (!items.length) continue;
      // Only replace the range actually returned by this channel. Preserve older archives.
      for (const [key, item] of old) if (item.channelId === channel.id && items.some(next => Date.parse(item.start) >= Date.parse(next.start) && Date.parse(item.start) < Date.parse(next.end))) old.delete(key);
      for (const item of items) old.set(`${item.channelId}-${Date.parse(item.start)}`, { ...item, fetchedAt: checkedAt });
    }
  }
  const grouped = new Map(archives.map(a => [a.date, []]));
  for (const item of old.values()) {
    if (!valid(item, channels)) throw new Error(`Invalid archived programme ${item.id}`);
    for (const date of overlappingDates(item)) {
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date).push(item);
    }
  }
  return [...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([date, programmes]) => {
    programmes.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)||a.channelId.localeCompare(b.channelId));
    const previous = archives.find(a=>a.date===date);
    const start = Date.parse(`${date}T00:00:00+08:00`), end = start + 86400000;
    const sourceStatus = Object.fromEntries(SOURCES.map(source => {
      const sourceChannels = channels.filter(c=>c.operator===source);
      const channelStatus = Object.fromEntries(sourceChannels.map(channel => {
        const items = programmes.filter(p=>p.channelId===channel.id);
        let cursor = start, complete = true;
        for (const item of items) {
          if (Date.parse(item.start) > cursor || (Date.parse(item.start) < cursor && cursor > start) || item.endEstimated) complete = false;
          cursor = Math.max(cursor, Date.parse(item.end));
        }
        complete = complete && cursor >= end;
        const refreshed = items.length > 0 && items.every(item => item.fetchedAt === checkedAt);
        const lastSuccessAt = items.length > 0 && items.every(item => item.fetchedAt) ? items.map(item => item.fetchedAt).sort()[0] : null;
        return [channel.id, { count: items.length, complete, lastSuccessAt, refreshed }];
      }));
      const statuses = Object.values(channelStatus);
      return [source, { complete: statuses.every(s=>s.complete), refreshed: statuses.every(s=>s.refreshed), error: results[source]?.error ?? null, channels: channelStatus }];
    }));
    // Legacy timestamps describe a whole run, so never use them as proof of source freshness.
    const times = Object.values(sourceStatus).flatMap(s=>Object.values(s.channels).map(c=>c.lastSuccessAt)).filter(Boolean);
    return { date, updatedAt: times.sort().at(-1) ?? previous?.updatedAt ?? checkedAt, checkedAt, channels, programmes, sourceStatus };
  });
}
export function validateSchedules(schedules) {
  for (const schedule of schedules) {
    const ids = new Set();
    for (const item of schedule.programmes) {
      if (!valid(item, schedule.channels) || !overlappingDates(item).includes(schedule.date) || ids.has(item.id)) throw new Error(`Invalid or duplicate programme ${item.id} on ${schedule.date}`);
      ids.add(item.id);
    }
    for (const channel of schedule.channels) {
      const items = schedule.programmes.filter(p=>p.channelId===channel.id).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
      for (let i=1;i<items.length;i++) if (Date.parse(items[i].start)<Date.parse(items[i-1].end) && hktDate(items[i-1].start) === schedule.date) throw new Error(`Overlapping programmes on ${channel.id}: ${schedule.date}`);
    }
  }
}
