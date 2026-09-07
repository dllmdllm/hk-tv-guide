import type { Channel, Programme } from "./types";

export const PX_PER_MINUTE = 2.5;
export const DAY_HEIGHT = 24 * 60 * PX_PER_MINUTE;
export const hourMarks = Array.from({ length: 25 }, (_, hour) => hour);
export const halfHourMarks = Array.from({ length: 48 }, (_, halfHour) => halfHour);
export const priorityChannelIds = ["rthk-31", "hoy-77", "tvb-81", "viu-99"];
export const CHANNEL_STORAGE_KEY = "hk-tv-guide:selected-channels";
export const OPERATORS = ["港台", "HOY", "TVB", "ViuTV"] as const;

export function hktDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function displayDate(date: string) {
  const value = new Date(`${date}T12:00:00+08:00`);
  const label = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(value);
  return date === hktDate() ? `今日 · ${label}` : label;
}

export function dayShort(date: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

export function time(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function duration(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export function programmeMeta(programme: Programme) {
  const base = `${time(programme.start)}-${time(programme.end)} (${duration(programme.start, programme.end)}分鐘)`;
  return programme.endEstimated ? `${base} · 結束時間為估計` : base;
}

export function channelLogo(channel: Channel) {
  if (channel.operator === "港台") return { brand: "RTHK", tone: "rthk" };
  if (channel.operator === "HOY") return { brand: "HOY", tone: "hoy" };
  if (channel.operator === "TVB") return { brand: "TVB", tone: "tvb" };
  return { brand: "ViuTV", tone: "viu" };
}

export function isLive(programme: Programme, selectedDate: string, now: number) {
  return selectedDate === hktDate() && new Date(programme.start).getTime() <= now && new Date(programme.end).getTime() > now;
}

export function isPast(programme: Programme, selectedDate: string, now: number) {
  return selectedDate === hktDate() && new Date(programme.end).getTime() <= now;
}

export function programmePosition(programme: Programme, selectedDate: string) {
  const dayStart = new Date(`${selectedDate}T00:00:00+08:00`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const start = Math.max(dayStart, new Date(programme.start).getTime());
  const end = Math.min(dayEnd, new Date(programme.end).getTime());
  return {
    top: ((start - dayStart) / 60000) * PX_PER_MINUTE,
    height: Math.max(2, ((end - start) / 60000) * PX_PER_MINUTE),
  };
}

export function programmeMatchesQuery(programme: Programme, needle: string) {
  if (!needle) return true;
  const haystack = `${programme.title} ${programme.description ?? ""}`.toLocaleLowerCase("zh-HK");
  return haystack.includes(needle);
}

export function programmeHref(programme: Programme, channel: Channel) {
  return programme.url || channel.sourceUrl;
}

export function programmeAriaLabel(programme: Programme, channel: Channel) {
  const description = programme.description ? `。${programme.description}` : "";
  return `${channel.name}：${programme.title}，${programmeMeta(programme)}${description}`;
}

export function orderChannels(channels: Channel[]) {
  const priority = new Map(priorityChannelIds.map((id, order) => [id, order]));
  return channels
    .map((channel, index) => ({ channel, index }))
    .sort((a, b) => {
      const priorityA = priority.get(a.channel.id);
      const priorityB = priority.get(b.channel.id);
      if (priorityA !== undefined && priorityB !== undefined) return priorityA - priorityB;
      if (priorityA !== undefined) return -1;
      if (priorityB !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ channel }) => channel);
}

export function readStoredChannelIds(): string[] | null {
  try {
    const raw = window.localStorage.getItem(CHANNEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredChannelIds(ids: string[]) {
  try {
    window.localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readDateFromUrl(): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get("date");
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDateToUrl(date: string) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}
