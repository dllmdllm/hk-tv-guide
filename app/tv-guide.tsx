"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight, Clock, MagnifyingGlass } from "@phosphor-icons/react";

import { createChannelLanes, createTimelineLayout, programmeScrollTop } from "../lib/timeline.mjs";
import { createLatestRequest, initialChannels, liveProgramme, selectChannelSlot } from "../lib/client.mjs";

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
  endEstimated?: boolean;
};

type DaySchedule = {
  date: string;
  updatedAt: string;
  channels: Channel[];
  programmes: Programme[];
  sourceStatus?: Record<string, boolean | { complete: boolean; refreshed: boolean; error: string | null; channels: Record<string, { lastSuccessAt: string | null }> }>;
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

function ProgrammeContent({ programme, live = false }: { programme: Programme; live?: boolean }) {
  return <div className="programme-content">
    <span className="programme-slot">{programmeMeta(programme)}</span>
    <strong>{programme.title}</strong>
    {programme.description && <small>{programme.description}</small>}
    <span className="programme-live-status">{live ? "播放中" : ""}</span>
  </div>;
}

function channelLogo(channel: Channel) {
  if (channel.operator === "港台") return { brand: "RTHK", tone: "rthk" };
  if (channel.operator === "HOY") return { brand: "HOY", tone: "hoy" };
  if (channel.operator === "TVB") return { brand: "TVB", tone: "tvb" };
  return { brand: "ViuTV", tone: "viu" };
}

function isLive(programme: Programme, selectedDate: string, now: number) {
  return selectedDate === hktDate() && new Date(programme.start).getTime() <= now && new Date(programme.end).getTime() > now;
}

function isPast(programme: Programme, selectedDate: string, now: number) {
  return selectedDate === hktDate() && new Date(programme.end).getTime() <= now;
}

export function TvGuide() {
  const [index, setIndex] = useState<ScheduleIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState(hktDate());
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState({ date: "", message: "" });
  const [now, setNow] = useState(0);
  const [columnCount, setColumnCount] = useState(4);
  const [selectedChannelIds, setSelectedChannelIds] = useState(priorityChannelIds);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const completedJump = useRef("");
  const jumpAnchor = useRef("");
  const lastJumpTimeline = useRef<ReturnType<typeof createTimelineLayout> | null>(null);
  const [jumpTargetId, setJumpTargetId] = useState("");
  const [jumpSequence, setJumpSequence] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const userSelectedChannel = useRef(false);
  const request = useRef(createLatestRequest());
  const [retry, setRetry] = useState(0);
  const [indexError, setIndexError] = useState("");

  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => { if (active) setFontsReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const updateColumnCount = () => {
      setColumnCount(query.matches ? 1 : 4);
      if (!userSelectedChannel.current && query.matches) setSelectedChannelIds(current => initialChannels(true, current));
    };
    updateColumnCount();
    query.addEventListener("change", updateColumnCount);
    return () => query.removeEventListener("change", updateColumnCount);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("data/index.json", { cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("未能讀取日期索引"); return response.json(); })
      .then((value: ScheduleIndex) => {
        if (controller.signal.aborted) return;
        setIndex(value);
        setIndexError("");

      })
      .catch(() => { if (!controller.signal.aborted) setIndexError("日期索引未能載入，請重試。"); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const pending = request.current();
    queueMicrotask(() => {
      if (pending.isCurrent()) { setLoadError({ date: "", message: "" }); setSchedule(null); }
    });
    fetch(`data/${selectedDate}.json`, { cache: "no-store", signal: pending.signal })
      .then((response) => { if (!response.ok) throw new Error("未有當日資料"); return response.json(); })
      .then((value: DaySchedule) => {
        if (!pending.isCurrent()) return;
        if (value.date !== selectedDate) throw new Error("日期不符");
        setSchedule(value);
        setLoadError({ date: "", message: "" });
      })
      .catch(() => { if (pending.isCurrent()) setLoadError({ date: selectedDate, message: "呢一日節目資料未能載入，請重試。" }); });
    return pending.cancel;
  }, [selectedDate, retry]);

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
  const availableChannels = orderedChannels;
  const displayChannels = useMemo(() => {
    const selected: Channel[] = [];
    const used = new Set<string>();
    (columnCount === 1 && jumpTargetId ? [jumpTargetId] : selectedChannelIds.slice(0, columnCount)).forEach((channelId) => {
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
  }, [availableChannels, columnCount, jumpTargetId, selectedChannelIds]);

  const activeChannelIds = useMemo(() => displayChannels.map((channel) => channel.id), [displayChannels]);
  const handleChannelSlotChange = useCallback((slot: number, channelId: string) => {
    userSelectedChannel.current = true;
    setJumpTargetId(channelId);
    setJumpSequence(sequence => sequence + 1);
    setSelectedDate(hktDate());
    setSelectedChannelIds(current => selectChannelSlot(current, slot, channelId));
  }, []);

  const layoutProgrammesByChannel = useMemo(() => {
    return new Map(displayChannels.map((channel) => [channel.id, createChannelLanes((schedule?.programmes ?? [])
      .filter((programme) => programme.channelId === channel.id), selectedDate)]));
  }, [displayChannels, schedule, selectedDate]);

  const programmesByChannel = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-HK");
    return new Map(displayChannels.map((channel) => [channel.id, (layoutProgrammesByChannel.get(channel.id) ?? [])
      .filter((programme) => !needle || programme.title.toLocaleLowerCase("zh-HK").includes(needle))]));
  }, [displayChannels, layoutProgrammesByChannel, query]);

  const timelineProgrammes = useMemo(() => Array.from(layoutProgrammesByChannel.values()).flat(), [layoutProgrammesByChannel]);
  const timeline = useMemo(() => createTimelineLayout(timelineProgrammes, selectedDate, measuredHeights), [measuredHeights, selectedDate, timelineProgrammes]);

  useLayoutEffect(() => {
    const viewport = gridRef.current;
    if (!viewport) return;

    const measureProgrammeCards = () => {
      const next: Record<string, number> = {};
      viewport.querySelectorAll<HTMLElement>("[data-programme-measure]").forEach((element) => {
        const programmeId = element.dataset.programmeMeasure;
        if (programmeId) next[programmeId] = Math.ceil(element.offsetHeight + 2);
      });
      setMeasuredHeights((current) => {
        const ids = Object.keys(next);
        if (ids.length === Object.keys(current).length && ids.every((id) => Math.abs(next[id] - (current[id] ?? 0)) < 2)) return current;
        return next;
      });
    };

    measureProgrammeCards();
    const observer = new ResizeObserver(measureProgrammeCards);
    observer.observe(viewport);
    viewport.querySelectorAll<HTMLElement>("[data-programme-measure]").forEach(element => observer.observe(element));
    let active = true;
    const onFontsLoaded = () => { if (active) measureProgrammeCards(); };
    void document.fonts.ready.then(onFontsLoaded);
    document.fonts.addEventListener("loadingdone", onFontsLoaded);
    return () => { active = false; observer.disconnect(); document.fonts.removeEventListener("loadingdone", onFontsLoaded); };
  }, [activeChannelIds, columnCount, layoutProgrammesByChannel, schedule?.date]);

  const allVisibleProgrammes = useMemo(() => Array.from(programmesByChannel.values()).flat(), [programmesByChannel]);
  const liveCount = allVisibleProgrammes.filter((programme) => isLive(programme, selectedDate, now)).length;
  const nowMinutes = selectedDate === hktDate() && now
    ? (new Date(now).toLocaleString("en-US", { timeZone: "Asia/Hong_Kong", hour12: false, hour: "2-digit", minute: "2-digit" }).split(":").map(Number).reduce((hours, minutes) => hours * 60 + minutes))
    : null;

  const targetChannelId = jumpTargetId || displayChannels[0]?.id;
  const jumpKey = `${selectedDate}:${targetChannelId}:${jumpSequence}`;
  const cancelJumpAnchor = () => { jumpAnchor.current = ""; completedJump.current = jumpKey; };
  const scrollToNow = useCallback((smooth = true) => {
    const viewport = gridRef.current;
    if (!viewport || selectedDate !== hktDate() || schedule?.date !== selectedDate || !now) return false;
    const current = liveProgramme(layoutProgrammesByChannel.get(targetChannelId) ?? [], now);
    if (!current) return false;
    const position = timeline.positions.get(current.id);
    if (!position) return false;
    const headerHeight = Number.parseFloat(window.getComputedStyle(viewport).getPropertyValue("--header-height")) || 0;
    const windowTop = window.visualViewport?.offsetTop ?? 0;
    const windowBottom = windowTop + (window.visualViewport?.height ?? window.innerHeight);
    let bounds = viewport.getBoundingClientRect();
    if (bounds.bottom <= windowTop || bounds.top + headerHeight >= windowBottom) {
      viewport.scrollIntoView({ block: "start", behavior: "auto" });
      bounds = viewport.getBoundingClientRect();
    }
    viewport.scrollTo({ top: programmeScrollTop(position, headerHeight, viewport.clientHeight, viewport.scrollHeight - viewport.clientHeight, Math.max(0, windowTop - bounds.top), Math.min(viewport.clientHeight, windowBottom - bounds.top)), behavior: smooth ? "smooth" : "auto" });
    jumpAnchor.current = jumpKey;
    completedJump.current = jumpKey;
    lastJumpTimeline.current = timeline;
    return true;
  }, [jumpKey, layoutProgrammesByChannel, now, schedule?.date, selectedDate, targetChannelId, timeline]);

  useEffect(() => {
    const key = jumpKey;
    if (loading || schedule?.date !== selectedDate || !fontsReady || !timelineProgrammes.every(programme => measuredHeights[programme.id] !== undefined)) return;
    if (completedJump.current === key && (jumpAnchor.current !== key || lastJumpTimeline.current === timeline)) return;
    // Wait two frames after intrinsic measurements; reflow or another selection cancels this target.
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (completedJump.current === key && jumpAnchor.current !== key) return;
        if (!scrollToNow(false)) { completedJump.current = key; jumpAnchor.current = ""; }
      });
    });
    return () => { window.cancelAnimationFrame(firstFrame); window.cancelAnimationFrame(secondFrame); };
  }, [fontsReady, jumpKey, loading, measuredHeights, schedule?.date, scrollToNow, selectedDate, timeline, timelineProgrammes]);

  const sourceWarnings = Object.entries(schedule?.sourceStatus ?? {}).filter(([, status]) => {
    if (typeof status === "boolean") return true;
    return !status.complete || !!status.error || (selectedDate === hktDate() && !status.refreshed) || Object.values(status.channels).some(channel => !channel.lastSuccessAt || (selectedDate === hktDate() && now - Date.parse(channel.lastSuccessAt) > 6 * 3600000));
  }).map(([source]) => source);
  const unknownFreshness = schedule && !schedule.sourceStatus;
  const hasCurrent = selectedDate === hktDate() && !!liveProgramme(layoutProgrammesByChannel.get(targetChannelId) ?? [], now);

  return (
    <main className="site-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <div className="brand-badge">HK</div>
          <div><p className="eyebrow">香港免費電視節目表</p><h1>今晚睇咩</h1></div>
        </div>
        <div className="header-meta"><span className="live-dot" /><span>{liveCount ? `${liveCount} 個節目播放中` : "每日自動更新"}</span></div>
      </header>

      {indexError && <p className="data-warning" role="status">{indexError} <button onClick={() => setRetry(value => value + 1)}>重試</button></p>}
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
        <div className="control-actions">
          <button className="now-button" disabled={!hasCurrent} title={hasCurrent ? "定位目前節目" : "所選日期／頻道未有正在播放節目"} onClick={() => scrollToNow()}><Clock size={17} weight="bold" />跳到而家</button>
          <label className="search-box"><MagnifyingGlass size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋節目" aria-label="搜尋節目" /></label>
        </div>
      </section>

      <section className="guide-section" aria-label={`${selectedDate} 電視節目表`}>
        <div className="guide-summary"><div><p className="eyebrow">00:00 — 23:59</p><h2>全日節目表</h2></div><span>顯示 {displayChannels.length} / {availableChannels.length} 個台 · {allVisibleProgrammes.length} 個節目</span></div>

        {loading && <div className="state-card"><span className="loader" />正在整理節目表…</div>}
        {!loading && error && <div className="state-card error"><strong>未有資料</strong><span>{error}</span><button className="today-button" onClick={() => setRetry(value => value + 1)}>重試</button></div>}
        {!loading && !error && (
          <>
            {(sourceWarnings.length > 0 || unknownFreshness) && <p className="data-warning" role="status">{unknownFreshness ? "資料來源更新狀態未確認。" : `${sourceWarnings.join("、")}：部分時段資料缺漏、更新失敗、過期或來源更新時間未確認。`} 空白時段不代表停播，請查看官方節目表。</p>}
            {!hasCurrent && <p className="data-warning">{availableChannels.find(channel => channel.id === targetChannelId)?.name ?? "所選頻道"}：所選日期未有正在播放節目資料，保留目前位置。</p>}
            <div className="channel-pickers" aria-label="選擇顯示電視台" style={{ "--channel-count": Math.max(displayChannels.length, 1) } as React.CSSProperties}>
              {Array.from({ length: Math.min(columnCount, Math.max(availableChannels.length, 1)) }, (_, slot) => {
                const selectedId = displayChannels[slot]?.id ?? availableChannels[slot]?.id ?? "";
                return (
                  <label key={slot}>
                    <span>第 {slot + 1} 欄</span>
                    <select value={selectedId} onChange={(event) => handleChannelSlotChange(slot, event.target.value)}>
                      {availableChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.number} · {channel.name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            <p className="timeline-note">節目按文字內容展開；同一橫線代表同一時間。來源時間重疊時並排顯示。</p>
            <div className="epg-viewport" ref={gridRef} onWheel={cancelJumpAnchor} onTouchStart={cancelJumpAnchor} onPointerDown={cancelJumpAnchor} onKeyDown={(event) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) cancelJumpAnchor(); }}>
              <div className="epg-canvas" style={{ "--channel-count": Math.max(displayChannels.length, 1) } as React.CSSProperties}>
                <div className="epg-corner">時間</div>
                <div className="channel-headers">
                  {displayChannels.map((channel) => {
                    const logo = channelLogo(channel);
                    return (
                      <a className="channel-header" href={channel.sourceUrl} target="_blank" rel="noreferrer" key={channel.id} style={{ "--accent": channel.accent } as React.CSSProperties}>
                        <span className={`channel-logo ${logo.tone}`}><small>{logo.brand}</small><strong>{channel.number}</strong></span>
                        <div><strong>{channel.name}</strong><small>{channel.operator}</small></div>
                      </a>
                    );
                  })}
                </div>

                <div className="time-axis" style={{ height: timeline.height }}>
                  {hourMarks.map((hour) => <span className="time-label" key={hour} style={{ top: timeline.minuteToY(hour * 60) }}>{String(hour).padStart(2, "0")}:00</span>)}
                </div>

                <div className="schedule-grid" style={{ height: timeline.height }}>
                  {halfHourMarks.map((mark) => <span className={mark % 2 === 0 ? "grid-line hour" : "grid-line"} key={mark} style={{ top: timeline.minuteToY(mark * 30) }} />)}
                  {displayChannels.map((channel) => (
                    <div className="channel-column" key={channel.id}>
                      {(programmesByChannel.get(channel.id) ?? []).map((programme) => {
                        const position = timeline.positions.get(programme.id);
                        if (!position) return null;
                        const live = isLive(programme, selectedDate, now);
                        const past = isPast(programme, selectedDate, now);
                        return (
                          <a className={`programme-block${live ? " live" : ""}${past ? " past" : ""}`} href={channel.sourceUrl} target="_blank" rel="noreferrer" key={programme.id} style={{ top: position.top, height: position.height, left: `calc(${100 * programme.lane / programme.laneCount}% + 3px)`, right: `calc(${100 * (programme.laneCount - programme.lane - 1) / programme.laneCount}% + 3px)`, "--block-height": `${position.height}px`, "--accent": channel.accent } as React.CSSProperties} title={`${programmeMeta(programme)} ${programme.title}${programme.description ? ` · ${programme.description}` : ""}`}>
                            <ProgrammeContent programme={programme} live={live} />
                          </a>
                        );
                      })}
                      <div className="programme-measure-layer" aria-hidden="true">
                        {(layoutProgrammesByChannel.get(channel.id) ?? []).map((programme) => {
                          return (
                            <div className="programme-measure" data-programme-measure={programme.id} key={programme.id} style={{ left: `calc(${100 * programme.lane / programme.laneCount}% + 3px)`, right: `calc(${100 * (programme.laneCount - programme.lane - 1) / programme.laneCount}% + 3px)`, "--accent": channel.accent } as React.CSSProperties}>
                              <ProgrammeContent programme={programme} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {nowMinutes !== null && <div className="now-line" style={{ top: timeline.minuteToY(nowMinutes) }}><span>而家 {time(new Date(now).toISOString())}</span></div>}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <footer><p>節目如有更改，以電視台最後公布為準。</p><p>資料來自各電視台公開節目表 · 檔案更新於 {schedule ? new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", dateStyle: "medium", timeStyle: "short" }).format(new Date(schedule.updatedAt)) : "—"}</p></footer>
    </main>
  );
}
