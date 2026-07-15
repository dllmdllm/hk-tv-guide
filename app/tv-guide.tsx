"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight, Clock, MagnifyingGlass } from "@phosphor-icons/react";

type Channel = {
  id: string;
  number: number;
  name: string;
  operator: "港台" | "HOY" | "TVB" | "ViuTV";
  accent: string;
  sourceUrl: string;
};

type Programme = {
  id: string;
  channelId: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  source: string;
};

type DaySchedule = {
  date: string;
  updatedAt: string;
  channels: Channel[];
  programmes: Programme[];
};

type ScheduleIndex = { updatedAt: string; dates: string[] };

const fallbackChannels: Channel[] = [
  ...[31, 32, 33, 34, 35].map((number) => ({ id: `rthk-${number}`, number, name: `港台電視 ${number}`, operator: "港台" as const, accent: "#31c48d", sourceUrl: `https://www.rthk.hk/timetable/tv${number}` })),
  ...[76, 77, 78].map((number) => ({ id: `hoy-${number}`, number, name: `HOY ${number}`, operator: "HOY" as const, accent: "#ff9f43", sourceUrl: "https://hoy.tv/live" })),
  { id: "tvb-81", number: 81, name: "翡翠台", operator: "TVB", accent: "#36a3ff", sourceUrl: "https://programme.tvb.com/" },
  { id: "tvb-82", number: 82, name: "TVB Plus", operator: "TVB", accent: "#36a3ff", sourceUrl: "https://programme.tvb.com/" },
  { id: "tvb-83", number: 83, name: "無綫新聞台", operator: "TVB", accent: "#36a3ff", sourceUrl: "https://programme.tvb.com/" },
  { id: "tvb-84", number: 84, name: "明珠台", operator: "TVB", accent: "#36a3ff", sourceUrl: "https://programme.tvb.com/" },
  { id: "viu-96", number: 96, name: "ViuTVsix", operator: "ViuTV", accent: "#ffd84d", sourceUrl: "https://viu.tv/epg" },
  { id: "viu-99", number: 99, name: "ViuTV", operator: "ViuTV", accent: "#ffd84d", sourceUrl: "https://viu.tv/epg" },
];

const operators = ["全部", "港台", "HOY", "TVB", "ViuTV"] as const;
const PX_PER_MINUTE = 2.5;
const DAY_HEIGHT = 24 * 60 * PX_PER_MINUTE;
const hourMarks = Array.from({ length: 25 }, (_, hour) => hour);
const halfHourMarks = Array.from({ length: 48 }, (_, halfHour) => halfHour);
const priorityChannelIds = ["rthk-31", "hoy-77", "tvb-81", "viu-99"];

function hktDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function displayDate(date: string) {
  const value = new Date(`${date}T12:00:00+08:00`);
  const label = new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", month: "long", day: "numeric", weekday: "long" }).format(value);
  return date === hktDate() ? `今日 · ${label}` : label;
}

function dayShort(date: string) {
  return new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", weekday: "short" }).format(new Date(`${date}T12:00:00+08:00`));
}

function time(value: string) {
  return new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function duration(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function programmeMeta(programme: Programme) {
  return `${time(programme.start)}-${time(programme.end)} (${duration(programme.start, programme.end)}分鐘)`;
}

function isLive(programme: Programme, selectedDate: string, now: number) {
  return selectedDate === hktDate() && new Date(programme.start).getTime() <= now && new Date(programme.end).getTime() > now;
}

function isPast(programme: Programme, selectedDate: string, now: number) {
  return selectedDate === hktDate() && new Date(programme.end).getTime() <= now;
}

function programmePosition(programme: Programme, selectedDate: string) {
  const dayStart = new Date(`${selectedDate}T00:00:00+08:00`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const start = Math.max(dayStart, new Date(programme.start).getTime());
  const end = Math.min(dayEnd, new Date(programme.end).getTime());
  return {
    top: ((start - dayStart) / 60000) * PX_PER_MINUTE,
    height: Math.max(2, ((end - start) / 60000) * PX_PER_MINUTE),
  };
}

export function TvGuide() {
  const [index, setIndex] = useState<ScheduleIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState(hktDate());
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [operator, setOperator] = useState<(typeof operators)[number]>("全部");
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState({ date: "", message: "" });
  const [now, setNow] = useState(0);
  const [columnCount, setColumnCount] = useState(4);
  const [selectedChannelIds, setSelectedChannelIds] = useState(priorityChannelIds);
  const gridRef = useRef<HTMLDivElement>(null);
  const didAutoScroll = useRef("");

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const updateColumnCount = () => setColumnCount(query.matches ? 1 : 4);
    updateColumnCount();
    query.addEventListener("change", updateColumnCount);
    return () => query.removeEventListener("change", updateColumnCount);
  }, []);

  useEffect(() => {
    fetch("data/index.json", { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("未能讀取日期索引"); return response.json(); })
      .then((value: ScheduleIndex) => {
        setIndex(value);
        const today = hktDate();
        setSelectedDate(value.dates.includes(today) ? today : value.dates.at(-1) ?? today);
      })
      .catch(() => setLoadError({ date: hktDate(), message: "節目資料暫時未能載入，請稍後再試。" }));
  }, []);

  useEffect(() => {
    fetch(`data/${selectedDate}.json`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("未有當日資料"); return response.json(); })
      .then((value: DaySchedule) => setSchedule(value))
      .catch(() => setLoadError({ date: selectedDate, message: "呢一日暫時未有節目資料。歷史紀錄會由網站啟用後逐日累積。" }));
  }, [selectedDate]);

  const dates = useMemo(() => index?.dates ?? [], [index]);
  const loading = schedule?.date !== selectedDate && loadError.date !== selectedDate;
  const error = loadError.date === selectedDate ? loadError.message : "";
  const currentIndex = dates.indexOf(selectedDate);
  const moveDate = useCallback((offset: number) => {
    const target = currentIndex + offset;
    if (target >= 0 && target < dates.length) setSelectedDate(dates[target]);
  }, [currentIndex, dates]);

  const channels = schedule?.channels ?? fallbackChannels;
  const orderedChannels = useMemo(() => {
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
  }, [channels]);
  const availableChannels = useMemo(() => orderedChannels.filter((channel) => operator === "全部" || channel.operator === operator), [operator, orderedChannels]);
  const displayChannels = useMemo(() => {
    const selected: Channel[] = [];
    const used = new Set<string>();
    selectedChannelIds.slice(0, columnCount).forEach((channelId) => {
      const channel = availableChannels.find((item) => item.id === channelId);
      if (channel && !used.has(channel.id)) {
        selected.push(channel);
        used.add(channel.id);
      }
    });
    availableChannels.forEach((channel) => {
      if (selected.length >= columnCount || used.has(channel.id)) return;
      selected.push(channel);
      used.add(channel.id);
    });
    return selected;
  }, [availableChannels, columnCount, selectedChannelIds]);

  const activeChannelIds = useMemo(() => displayChannels.map((channel) => channel.id), [displayChannels]);
  const handleChannelSlotChange = useCallback((slot: number, channelId: string) => {
    setSelectedChannelIds((current) => {
      const next = [...current];
      const duplicateSlot = next.findIndex((id, index) => id === channelId && index !== slot);
      if (duplicateSlot >= 0) next[duplicateSlot] = next[slot] ?? "";
      next[slot] = channelId;
      return next;
    });
  }, []);

  const programmesByChannel = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-HK");
    return new Map(displayChannels.map((channel) => [channel.id, (schedule?.programmes ?? [])
      .filter((programme) => programme.channelId === channel.id)
      .filter((programme) => !needle || programme.title.toLocaleLowerCase("zh-HK").includes(needle))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())]));
  }, [displayChannels, query, schedule]);

  const allVisibleProgrammes = useMemo(() => Array.from(programmesByChannel.values()).flat(), [programmesByChannel]);
  const liveCount = allVisibleProgrammes.filter((programme) => isLive(programme, selectedDate, now)).length;
  const nowMinutes = selectedDate === hktDate() && now
    ? (new Date(now).toLocaleString("en-US", { timeZone: "Asia/Hong_Kong", hour12: false, hour: "2-digit", minute: "2-digit" }).split(":").map(Number).reduce((hours, minutes) => hours * 60 + minutes))
    : null;

  const scrollToNow = useCallback((smooth = true) => {
    if (!gridRef.current) return;
    const targetMinutes = selectedDate === hktDate() && nowMinutes !== null ? nowMinutes : 8 * 60;
    const headerHeight = Number.parseFloat(window.getComputedStyle(gridRef.current).getPropertyValue("--header-height")) || 0;
    const targetTop = headerHeight + (targetMinutes * PX_PER_MINUTE) - (gridRef.current.clientHeight / 2);
    const maxTop = gridRef.current.scrollHeight - gridRef.current.clientHeight;
    gridRef.current.scrollTo({ top: Math.min(Math.max(targetTop, 0), maxTop), behavior: smooth ? "smooth" : "auto" });
  }, [nowMinutes, selectedDate]);

  useEffect(() => {
    if (!loading && schedule?.date === selectedDate && didAutoScroll.current !== selectedDate) {
      didAutoScroll.current = selectedDate;
      window.requestAnimationFrame(() => scrollToNow(false));
    }
  }, [loading, schedule?.date, scrollToNow, selectedDate]);

  return (
    <main className="site-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <div className="brand-badge">HK</div>
          <div><p className="eyebrow">香港免費電視節目表</p><h1>今晚睇咩</h1></div>
        </div>
        <div className="header-meta"><span className="live-dot" /><span>{liveCount ? `${liveCount} 個節目播放中` : "每日自動更新"}</span></div>
      </header>

      <section className="date-panel" aria-label="選擇日期">
        <button className="icon-button" onClick={() => moveDate(-1)} disabled={currentIndex <= 0} aria-label="前一日"><CaretLeft size={20} weight="bold" /></button>
        <div className="date-title"><span>{selectedDate}</span><strong>{displayDate(selectedDate)}</strong></div>
        <button className="icon-button" onClick={() => moveDate(1)} disabled={currentIndex < 0 || currentIndex >= dates.length - 1} aria-label="後一日"><CaretRight size={20} weight="bold" /></button>
        <button className="today-button" onClick={() => dates.includes(hktDate()) && setSelectedDate(hktDate())}><CalendarBlank size={18} weight="bold" />返今日</button>
        <label className="date-input-wrap"><CalendarBlank size={17} /><input className="date-input" type="date" value={selectedDate} min={dates[0]} max={dates.at(-1)} onChange={(event) => setSelectedDate(event.target.value)} aria-label="揀日期" /></label>
      </section>

      <section className="week-strip" aria-label="可選日期">
        {dates.slice(Math.max(0, currentIndex - 3), Math.max(7, currentIndex + 4)).map((date) => (
          <button key={date} className={date === selectedDate ? "day-chip active" : "day-chip"} onClick={() => setSelectedDate(date)}><span>{dayShort(date)}</span><strong>{date.slice(8)}</strong></button>
        ))}
      </section>

      <section className="controls">
        <div className="operator-tabs" role="tablist" aria-label="電視台機構">
          {operators.map((item) => <button key={item} className={operator === item ? "active" : ""} onClick={() => setOperator(item)}>{item}</button>)}
        </div>
        <div className="control-actions">
          <button className="now-button" onClick={() => scrollToNow()}><Clock size={17} weight="bold" />跳到而家</button>
          <label className="search-box"><MagnifyingGlass size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋節目" aria-label="搜尋節目" /></label>
        </div>
      </section>

      <section className="guide-section" aria-label={`${selectedDate} 電視節目表`}>
        <div className="guide-summary"><div><p className="eyebrow">00:00 — 23:59</p><h2>全日節目表</h2></div><span>顯示 {displayChannels.length} / {availableChannels.length} 個台 · {allVisibleProgrammes.length} 個節目</span></div>

        {loading && <div className="state-card"><span className="loader" />正在整理節目表…</div>}
        {!loading && error && <div className="state-card error"><strong>未有資料</strong><span>{error}</span></div>}
        {!loading && !error && (
          <>
            <div className="channel-pickers" aria-label="選擇顯示電視台" style={{ "--channel-count": Math.max(displayChannels.length, 1) } as React.CSSProperties}>
              {Array.from({ length: Math.min(columnCount, Math.max(availableChannels.length, 1)) }, (_, slot) => {
                const selectedId = displayChannels[slot]?.id ?? availableChannels[slot]?.id ?? "";
                return (
                  <label key={slot}>
                    <span>第 {slot + 1} 欄</span>
                    <select value={selectedId} onChange={(event) => handleChannelSlotChange(slot, event.target.value)}>
                      {availableChannels.map((channel) => (
                        <option key={channel.id} value={channel.id} disabled={activeChannelIds.includes(channel.id) && channel.id !== selectedId}>
                          {channel.number} · {channel.name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            <div className="epg-viewport" ref={gridRef}>
              <div className="epg-canvas" style={{ "--channel-count": Math.max(displayChannels.length, 1), "--day-height": `${DAY_HEIGHT}px` } as React.CSSProperties}>
                <div className="epg-corner">時間</div>
                <div className="channel-headers">
                  {displayChannels.map((channel) => (
                    <a className="channel-header" href={channel.sourceUrl} target="_blank" rel="noreferrer" key={channel.id} style={{ "--accent": channel.accent } as React.CSSProperties}>
                      <span>{channel.number}</span><div><strong>{channel.name}</strong><small>{channel.operator}</small></div>
                    </a>
                  ))}
                </div>

                <div className="time-axis" style={{ height: DAY_HEIGHT }}>
                  {hourMarks.map((hour) => <span className="time-label" key={hour} style={{ top: hour * 60 * PX_PER_MINUTE }}>{String(hour).padStart(2, "0")}:00</span>)}
                </div>

                <div className="schedule-grid" style={{ height: DAY_HEIGHT }}>
                  {halfHourMarks.map((mark) => <span className={mark % 2 === 0 ? "grid-line hour" : "grid-line"} key={mark} style={{ top: mark * 30 * PX_PER_MINUTE }} />)}
                  {displayChannels.map((channel) => (
                    <div className="channel-column" key={channel.id}>
                      {(programmesByChannel.get(channel.id) ?? []).map((programme) => {
                        const position = programmePosition(programme, selectedDate);
                        const live = isLive(programme, selectedDate, now);
                        const past = isPast(programme, selectedDate, now);
                        const compact = position.height < 46;
                        const micro = position.height < 18;
                        return (
                          <a className={`programme-block${live ? " live" : ""}${past ? " past" : ""}${compact ? " compact" : ""}${micro ? " micro" : ""}`} href={channel.sourceUrl} target="_blank" rel="noreferrer" key={programme.id} style={{ top: position.top, height: position.height, "--block-height": `${position.height}px`, "--accent": channel.accent } as React.CSSProperties} title={`${programmeMeta(programme)} ${programme.title}${programme.description ? ` · ${programme.description}` : ""}`}>
                            {!micro && <><span className="programme-slot">{programmeMeta(programme)}</span><strong>{programme.title}</strong></>}
                            {!compact && programme.description && <small>{programme.description}</small>}
                            {live && !micro && <b>播放中</b>}
                          </a>
                        );
                      })}
                    </div>
                  ))}
                  {nowMinutes !== null && <div className="now-line" style={{ top: nowMinutes * PX_PER_MINUTE }}><span>而家 {time(new Date(now).toISOString())}</span></div>}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <footer><p>節目如有更改，以電視台最後公布為準。</p><p>資料來自各電視台公開節目表 · 更新於 {schedule ? new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", dateStyle: "medium", timeStyle: "short" }).format(new Date(schedule.updatedAt)) : "—"}</p></footer>
    </main>
  );
}
