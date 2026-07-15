"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type ScheduleIndex = {
  updatedAt: string;
  dates: string[];
};

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

function hktDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function displayDate(date: string) {
  const value = new Date(`${date}T12:00:00+08:00`);
  const label = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(value);
  return date === hktDate() ? `今日 · ${label}` : label;
}

function dayShort(date: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

function time(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function duration(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function isLive(programme: Programme, selectedDate: string, now: number) {
  return selectedDate === hktDate() && new Date(programme.start).getTime() <= now && new Date(programme.end).getTime() > now;
}

export function TvGuide() {
  const [index, setIndex] = useState<ScheduleIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState(hktDate());
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [operator, setOperator] = useState<(typeof operators)[number]>("全部");
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState({ date: "", message: "" });
  const [now, setNow] = useState(0);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    fetch("data/index.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("未能讀取日期索引");
        return response.json();
      })
      .then((value: ScheduleIndex) => {
        setIndex(value);
        const today = hktDate();
        if (value.dates.includes(today)) {
          setSelectedDate(today);
        } else if (value.dates.length) {
          setSelectedDate(value.dates.at(-1) ?? today);
        }
      })
      .catch(() => setLoadError({ date: hktDate(), message: "節目資料暫時未能載入，請稍後再試。" }));
  }, []);

  useEffect(() => {
    fetch(`data/${selectedDate}.json`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("未有當日資料");
        return response.json();
      })
      .then((value: DaySchedule) => setSchedule(value))
      .catch(() => {
        setLoadError({ date: selectedDate, message: "呢一日暫時未有節目資料。歷史紀錄會由網站啟用後逐日累積。" });
      });
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
  const visibleChannels = channels.filter((channel) => operator === "全部" || channel.operator === operator);
  const channelMap = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels]);
  const programmes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-HK");
    return (schedule?.programmes ?? [])
      .filter((programme) => selectedChannel === "all" || programme.channelId === selectedChannel)
      .filter((programme) => visibleChannels.some((channel) => channel.id === programme.channelId))
      .filter((programme) => !needle || programme.title.toLocaleLowerCase("zh-HK").includes(needle))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime() || (channelMap.get(a.channelId)?.number ?? 0) - (channelMap.get(b.channelId)?.number ?? 0));
  }, [channelMap, query, schedule, selectedChannel, visibleChannels]);

  const liveCount = programmes.filter((programme) => isLive(programme, selectedDate, now)).length;

  function selectOperator(value: (typeof operators)[number]) {
    setOperator(value);
    setSelectedChannel("all");
  }

  return (
    <main
      className="site-shell"
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const distance = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
        if (Math.abs(distance) > 70) moveDate(distance < 0 ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div>
            <p className="eyebrow">香港免費電視節目表</p>
            <h1>今晚睇咩</h1>
          </div>
        </div>
        <div className="header-meta">
          <span className="live-dot" />
          <span>{liveCount ? `${liveCount} 個節目播放中` : "每日自動更新"}</span>
        </div>
      </header>

      <section className="date-panel" aria-label="選擇日期">
        <button className="round-button" onClick={() => moveDate(-1)} disabled={currentIndex <= 0} aria-label="前一日">‹</button>
        <div className="date-title">
          <span>{selectedDate}</span>
          <strong>{displayDate(selectedDate)}</strong>
        </div>
        <button className="round-button" onClick={() => moveDate(1)} disabled={currentIndex < 0 || currentIndex >= dates.length - 1} aria-label="後一日">›</button>
        <button className="today-button" onClick={() => dates.includes(hktDate()) && setSelectedDate(hktDate())}>返今日</button>
        <input className="date-input" type="date" value={selectedDate} min={dates[0]} max={dates.at(-1)} onChange={(event) => setSelectedDate(event.target.value)} aria-label="揀日期" />
      </section>

      <section className="week-strip" aria-label="可選日期">
        {dates.slice(Math.max(0, currentIndex - 3), Math.max(7, currentIndex + 4)).map((date) => (
          <button key={date} className={date === selectedDate ? "day-chip active" : "day-chip"} onClick={() => setSelectedDate(date)}>
            <span>{dayShort(date)}</span><strong>{date.slice(8)}</strong>
          </button>
        ))}
      </section>

      <section className="controls">
        <div className="operator-tabs" role="tablist" aria-label="電視台機構">
          {operators.map((item) => <button key={item} className={operator === item ? "active" : ""} onClick={() => selectOperator(item)}>{item}</button>)}
        </div>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋節目" aria-label="搜尋節目" />
        </label>
      </section>

      <section className="channel-strip" aria-label="頻道篩選">
        <button className={selectedChannel === "all" ? "channel-chip active" : "channel-chip"} onClick={() => setSelectedChannel("all")}>
          <span className="channel-number">ALL</span><span>所有頻道</span>
        </button>
        {visibleChannels.map((channel) => (
          <button key={channel.id} className={selectedChannel === channel.id ? "channel-chip active" : "channel-chip"} onClick={() => setSelectedChannel(channel.id)} style={{ "--accent": channel.accent } as React.CSSProperties}>
            <span className="channel-number">{channel.number}</span><span>{channel.name}</span>
          </button>
        ))}
      </section>

      <section className="schedule-panel">
        <div className="schedule-heading">
          <div>
            <p className="eyebrow">00:00 — 23:59</p>
            <h2>{selectedChannel === "all" ? "全日節目" : channelMap.get(selectedChannel)?.name}</h2>
          </div>
          <span>{programmes.length} 個節目</span>
        </div>

        {loading && <div className="state-card"><span className="loader" />正在整理節目表…</div>}
        {!loading && error && <div className="state-card error"><strong>未有資料</strong><span>{error}</span></div>}
        {!loading && !error && programmes.length === 0 && <div className="state-card"><strong>搵唔到節目</strong><span>試下轉頻道或者清除搜尋字。</span></div>}
        {!loading && programmes.length > 0 && (
          <ol className="programme-list">
            {programmes.map((programme) => {
              const channel = channelMap.get(programme.channelId);
              const live = isLive(programme, selectedDate, now);
              const progress = live ? Math.min(100, Math.max(0, ((now - new Date(programme.start).getTime()) / (new Date(programme.end).getTime() - new Date(programme.start).getTime())) * 100)) : 0;
              return (
                <li key={programme.id} className={live ? "programme-row live" : "programme-row"} style={{ "--accent": channel?.accent ?? "#777" } as React.CSSProperties}>
                  <div className="programme-time"><strong>{time(programme.start)}</strong><span>{time(programme.end)}</span></div>
                  <a className="programme-channel" href={channel?.sourceUrl} target="_blank" rel="noreferrer" title="前往官方節目表">
                    <span>{channel?.number}</span><small>{channel?.name}</small>
                  </a>
                  <div className="programme-copy">
                    <div className="title-line">{live && <span className="on-air">直播中</span>}<h3>{programme.title}</h3></div>
                    <p>{programme.description || `${duration(programme.start, programme.end)} 分鐘 · 資料來源：${programme.source}`}</p>
                    {live && <div className="progress-track" aria-label={`播放進度 ${Math.round(progress)}%`}><i style={{ width: `${progress}%` }} /></div>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <footer>
        <p>節目如有更改，以電視台最後公布為準。</p>
        <p>資料來自各電視台公開節目表 · 更新於 {schedule ? new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", dateStyle: "medium", timeStyle: "short" }).format(new Date(schedule.updatedAt)) : "—"}</p>
      </footer>
    </main>
  );
}
