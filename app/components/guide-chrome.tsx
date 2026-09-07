"use client";

import { CalendarBlank, CaretLeft, CaretRight, Clock, MagnifyingGlass } from "@phosphor-icons/react";
import type { Channel, Operator, SourceStatus } from "../../lib/types";
import { dayShort, displayDate, hktDate, OPERATORS } from "../../lib/schedule-utils";

type GuideChromeProps = {
  selectedDate: string;
  dates: string[];
  currentIndex: number;
  moveDate: (offset: number) => void;
  setSelectedDate: (date: string) => void;
  liveCount: number;
  query: string;
  setQuery: (value: string) => void;
  operatorFilter: Operator | "全部";
  setOperatorFilter: (value: Operator | "全部") => void;
  scrollToNow: () => void;
  statusErrors: string[];
  sourceStatus?: SourceStatus;
  hiddenSearchHits: { channel: Channel; count: number }[];
  revealSearchChannel: (channelId: string) => void;
  needle: string;
  matchedCount: number;
};

function StatusBanner({
  statusErrors,
  sourceStatus,
}: {
  statusErrors: string[];
  sourceStatus?: SourceStatus;
}) {
  const failed = Object.entries(sourceStatus ?? {}).filter(([, ok]) => !ok).map(([name]) => name);
  if (!failed.length && !statusErrors.length) return null;
  return (
    <div className="status-banner" role="status">
      <strong>部分資料來源未能更新</strong>
      <span>
        {failed.length ? `受影響：${failed.join("、")}。` : ""}
        {statusErrors.length ? ` ${statusErrors.join("；")}` : " 其餘頻道仍可正常瀏覽。"}
      </span>
    </div>
  );
}

export function GuideChrome(props: GuideChromeProps) {
  const {
    selectedDate,
    dates,
    currentIndex,
    moveDate,
    setSelectedDate,
    liveCount,
    query,
    setQuery,
    operatorFilter,
    setOperatorFilter,
    scrollToNow,
    statusErrors,
    sourceStatus,
    hiddenSearchHits,
    revealSearchChannel,
    needle,
    matchedCount,
  } = props;

  return (
    <>
      <header className="masthead">
        <div className="brand-lockup">
          <div className="brand-badge">HK</div>
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

      <StatusBanner statusErrors={statusErrors} sourceStatus={sourceStatus} />

      <section className="date-panel" aria-label="選擇日期">
        <button className="icon-button" onClick={() => moveDate(-1)} disabled={currentIndex <= 0} aria-label="前一日">
          <CaretLeft size={20} weight="bold" />
        </button>
        <div className="date-title">
          <span>{selectedDate}</span>
          <strong>{displayDate(selectedDate)}</strong>
        </div>
        <button
          className="icon-button"
          onClick={() => moveDate(1)}
          disabled={currentIndex < 0 || currentIndex >= dates.length - 1}
          aria-label="後一日"
        >
          <CaretRight size={20} weight="bold" />
        </button>
        <button className="today-button" onClick={() => dates.includes(hktDate()) && setSelectedDate(hktDate())}>
          <CalendarBlank size={18} weight="bold" />
          返今日
        </button>
        <label className="date-input-wrap">
          <CalendarBlank size={17} />
          <input
            className="date-input"
            type="date"
            value={selectedDate}
            min={dates[0]}
            max={dates.at(-1)}
            onChange={(event) => setSelectedDate(event.target.value)}
            aria-label="揀日期"
          />
        </label>
      </section>

      <section className="week-strip" aria-label="可選日期">
        {dates.slice(Math.max(0, currentIndex - 3), Math.max(7, currentIndex + 4)).map((date) => (
          <button
            key={date}
            className={date === selectedDate ? "day-chip active" : "day-chip"}
            onClick={() => setSelectedDate(date)}
          >
            <span>{dayShort(date)}</span>
            <strong>{date.slice(8)}</strong>
          </button>
        ))}
      </section>

      <section className="controls">
        <div className="operator-filters" aria-label="電視台篩選">
          <button
            type="button"
            className={operatorFilter === "全部" ? "operator-chip active" : "operator-chip"}
            onClick={() => setOperatorFilter("全部")}
          >
            全部
          </button>
          {OPERATORS.map((operator) => (
            <button
              key={operator}
              type="button"
              className={operatorFilter === operator ? "operator-chip active" : "operator-chip"}
              onClick={() => setOperatorFilter(operator)}
            >
              {operator}
            </button>
          ))}
        </div>
        <div className="control-actions">
          <button className="now-button" onClick={() => scrollToNow()}>
            <Clock size={17} weight="bold" />
            跳到而家
          </button>
          <label className="search-box">
            <MagnifyingGlass size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋節目名稱或簡介"
              aria-label="搜尋節目名稱或簡介"
            />
          </label>
        </div>
      </section>

      {needle ? (
        <div className="search-meta" role="status">
          <span>
            今日共 {matchedCount} 個結果
            {hiddenSearchHits.length
              ? ` · 另有 ${hiddenSearchHits.reduce((sum, item) => sum + item.count, 0)} 個喺未顯示嘅頻道`
              : ""}
          </span>
          {hiddenSearchHits.length > 0 && (
            <div className="search-hit-channels">
              {hiddenSearchHits.slice(0, 6).map(({ channel, count }) => (
                <button
                  key={channel.id}
                  type="button"
                  className="search-hit-chip"
                  onClick={() => revealSearchChannel(channel.id)}
                >
                  {channel.name}（{count}）
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

export function GuideFooter({
  updatedAt,
  sourceStatus,
}: {
  updatedAt?: string;
  sourceStatus?: SourceStatus;
}) {
  return (
    <footer>
      <p>節目如有更改，以電視台最後公布為準。</p>
      <p>
        資料來自各電視台公開節目表
        {sourceStatus
          ? ` · 來源狀態：${Object.entries(sourceStatus)
              .map(([name, ok]) => `${name}${ok ? "✓" : "✗"}`)
              .join(" ")}`
          : ""}
        {" · "}
        更新於{" "}
        {updatedAt
          ? new Intl.DateTimeFormat("zh-HK", {
              timeZone: "Asia/Hong_Kong",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(updatedAt))
          : "—"}
      </p>
    </footer>
  );
}
