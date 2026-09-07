"use client";

import type { Channel, Programme } from "../../lib/types";
import {
  channelLogo,
  DAY_HEIGHT,
  halfHourMarks,
  hourMarks,
  isLive,
  isPast,
  programmeAriaLabel,
  programmeHref,
  programmeMeta,
  programmePosition,
  PX_PER_MINUTE,
  time,
} from "../../lib/schedule-utils";

type GuideGridProps = {
  displayChannels: Channel[];
  availableChannels: Channel[];
  activeChannelIds: string[];
  columnCount: number;
  handleChannelSlotChange: (slot: number, channelId: string) => void;
  programmesByChannel: Map<string, Programme[]>;
  selectedDate: string;
  now: number;
  nowMinutes: number | null;
  gridRef: React.RefObject<HTMLDivElement | null>;
};

export function GuideGrid({
  displayChannels,
  availableChannels,
  activeChannelIds,
  columnCount,
  handleChannelSlotChange,
  programmesByChannel,
  selectedDate,
  now,
  nowMinutes,
  gridRef,
}: GuideGridProps) {
  return (
    <>
      <div
        className="channel-pickers"
        aria-label="選擇顯示電視台"
        style={{ "--channel-count": Math.max(displayChannels.length, 1) } as React.CSSProperties}
      >
        {Array.from({ length: Math.min(columnCount, Math.max(availableChannels.length, 1)) }, (_, slot) => {
          const selectedId = displayChannels[slot]?.id ?? availableChannels[slot]?.id ?? "";
          return (
            <label key={slot}>
              <span>第 {slot + 1} 欄</span>
              <select value={selectedId} onChange={(event) => handleChannelSlotChange(slot, event.target.value)}>
                {availableChannels.map((channel) => (
                  <option
                    key={channel.id}
                    value={channel.id}
                    disabled={activeChannelIds.includes(channel.id) && channel.id !== selectedId}
                  >
                    {channel.number} · {channel.name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <div className="epg-viewport" ref={gridRef}>
        <div
          className="epg-canvas"
          style={
            {
              "--channel-count": Math.max(displayChannels.length, 1),
              "--day-height": `${DAY_HEIGHT}px`,
            } as React.CSSProperties
          }
        >
          <div className="epg-corner">時間</div>
          <div className="channel-headers">
            {displayChannels.map((channel) => {
              const logo = channelLogo(channel);
              return (
                <a
                  className="channel-header"
                  href={channel.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  key={channel.id}
                  style={{ "--accent": channel.accent } as React.CSSProperties}
                >
                  <span className={`channel-logo ${logo.tone}`}>
                    <small>{logo.brand}</small>
                    <strong>{channel.number}</strong>
                  </span>
                  <div>
                    <strong>{channel.name}</strong>
                    <small>{channel.operator}</small>
                  </div>
                </a>
              );
            })}
          </div>

          <div className="time-axis" style={{ height: DAY_HEIGHT }}>
            {hourMarks.map((hour) => (
              <span className="time-label" key={hour} style={{ top: hour * 60 * PX_PER_MINUTE }}>
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          <div className="schedule-grid" style={{ height: DAY_HEIGHT }}>
            {halfHourMarks.map((mark) => (
              <span
                className={mark % 2 === 0 ? "grid-line hour" : "grid-line"}
                key={mark}
                style={{ top: mark * 30 * PX_PER_MINUTE }}
              />
            ))}
            {displayChannels.map((channel) => (
              <div className="channel-column" key={channel.id}>
                {(programmesByChannel.get(channel.id) ?? []).map((programme) => {
                  const position = programmePosition(programme, selectedDate);
                  const live = isLive(programme, selectedDate, now);
                  const past = isPast(programme, selectedDate, now);
                  const compact = position.height < 46;
                  const micro = position.height < 18;
                  const href = programmeHref(programme, channel);
                  const label = programmeAriaLabel(programme, channel);
                  return (
                    <a
                      className={`programme-block${live ? " live" : ""}${past ? " past" : ""}${compact ? " compact" : ""}${micro ? " micro" : ""}${programme.endEstimated ? " estimated" : ""}`}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      key={programme.id}
                      style={
                        {
                          top: position.top,
                          height: position.height,
                          "--block-height": `${position.height}px`,
                          "--accent": channel.accent,
                        } as React.CSSProperties
                      }
                      title={label}
                      aria-label={label}
                    >
                      {!micro && (
                        <>
                          <span className="programme-slot">
                            {programmeMeta(programme)}
                            {programme.endEstimated ? " ≈" : ""}
                          </span>
                          <strong>{programme.title}</strong>
                        </>
                      )}
                      {!compact && programme.description && <small>{programme.description}</small>}
                      {live && !micro && <b>播放中</b>}
                    </a>
                  );
                })}
              </div>
            ))}
            {nowMinutes !== null && (
              <div className="now-line" style={{ top: nowMinutes * PX_PER_MINUTE }}>
                <span>而家 {time(new Date(now).toISOString())}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
