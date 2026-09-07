"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import channelsJson from "../../lib/channels.json";
import type { Channel, DaySchedule, Operator, ScheduleIndex } from "../../lib/types";
import {
  hktDate,
  isLive,
  orderChannels,
  programmeMatchesQuery,
  priorityChannelIds,
  PX_PER_MINUTE,
  readDateFromUrl,
  readStoredChannelIds,
  writeDateToUrl,
  writeStoredChannelIds,
} from "../../lib/schedule-utils";

const fallbackChannels = channelsJson as Channel[];

export function useTvGuide() {
  const [index, setIndex] = useState<ScheduleIndex | null>(null);
  const [selectedDate, setSelectedDateState] = useState(hktDate());
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [query, setQuery] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<Operator | "全部">("全部");
  const [loadError, setLoadError] = useState({ date: "", message: "" });
  const [now, setNow] = useState(0);
  const [columnCount, setColumnCount] = useState(4);
  const [selectedChannelIds, setSelectedChannelIds] = useState(priorityChannelIds);
  const [hydratedPrefs, setHydratedPrefs] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const didAutoScroll = useRef("");

  const setSelectedDate = useCallback((date: string) => {
    setSelectedDateState(date);
    writeDateToUrl(date);
  }, []);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const updateColumnCount = () => setColumnCount(media.matches ? 1 : 4);
    updateColumnCount();
    media.addEventListener("change", updateColumnCount);
    return () => media.removeEventListener("change", updateColumnCount);
  }, []);

  useEffect(() => {
    const stored = readStoredChannelIds();
    if (stored?.length) setSelectedChannelIds(stored);
    setHydratedPrefs(true);
  }, []);

  useEffect(() => {
    if (!hydratedPrefs) return;
    writeStoredChannelIds(selectedChannelIds);
  }, [hydratedPrefs, selectedChannelIds]);

  useEffect(() => {
    fetch("data/index.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("未能讀取日期索引");
        return response.json();
      })
      .then((value: ScheduleIndex) => {
        setIndex(value);
        const today = hktDate();
        const fromUrl = readDateFromUrl();
        const preferred =
          (fromUrl && value.dates.includes(fromUrl) && fromUrl) ||
          (value.dates.includes(today) ? today : value.dates.at(-1) ?? today);
        setSelectedDate(preferred);
      })
      .catch(() => setLoadError({ date: hktDate(), message: "節目資料暫時未能載入，請稍後再試。" }));
  }, [setSelectedDate]);

  useEffect(() => {
    setLoadError((current) => (current.date === selectedDate ? current : { date: "", message: "" }));
    fetch(`data/${selectedDate}.json`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("未有當日資料");
        return response.json();
      })
      .then((value: DaySchedule) => setSchedule(value))
      .catch(() =>
        setLoadError({
          date: selectedDate,
          message: "呢一日暫時未有節目資料。歷史紀錄會由網站啟用後逐日累積。",
        }),
      );
  }, [selectedDate]);

  const dates = useMemo(() => index?.dates ?? [], [index]);
  const loading = schedule?.date !== selectedDate && loadError.date !== selectedDate;
  const error = loadError.date === selectedDate ? loadError.message : "";
  const currentIndex = dates.indexOf(selectedDate);
  const moveDate = useCallback(
    (offset: number) => {
      const target = currentIndex + offset;
      if (target >= 0 && target < dates.length) setSelectedDate(dates[target]);
    },
    [currentIndex, dates, setSelectedDate],
  );

  const channels = schedule?.channels ?? fallbackChannels;
  const orderedChannels = useMemo(() => orderChannels(channels), [channels]);
  const availableChannels = useMemo(() => {
    if (operatorFilter === "全部") return orderedChannels;
    return orderedChannels.filter((channel) => channel.operator === operatorFilter);
  }, [operatorFilter, orderedChannels]);

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
      while (next.length <= slot) next.push("");
      const duplicateSlot = next.findIndex((id, index) => id === channelId && index !== slot);
      if (duplicateSlot >= 0) next[duplicateSlot] = next[slot] || availableChannels.find((c) => !next.includes(c.id))?.id || "";
      next[slot] = channelId;
      return next;
    });
  }, [availableChannels]);

  const needle = query.trim().toLocaleLowerCase("zh-HK");

  const matchedProgrammes = useMemo(() => {
    return (schedule?.programmes ?? [])
      .filter((programme) => programmeMatchesQuery(programme, needle))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [needle, schedule]);

  const programmesByChannel = useMemo(() => {
    return new Map(
      displayChannels.map((channel) => [
        channel.id,
        matchedProgrammes
          .filter((programme) => programme.channelId === channel.id)
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
      ]),
    );
  }, [displayChannels, matchedProgrammes]);

  const hiddenSearchHits = useMemo(() => {
    if (!needle) return [];
    const visible = new Set(activeChannelIds);
    const channelMap = new Map(orderedChannels.map((channel) => [channel.id, channel]));
    const counts = new Map<string, number>();
    for (const programme of matchedProgrammes) {
      if (visible.has(programme.channelId)) continue;
      counts.set(programme.channelId, (counts.get(programme.channelId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([channelId, count]) => ({ channel: channelMap.get(channelId)!, count }))
      .filter((item) => item.channel)
      .sort((a, b) => b.count - a.count || a.channel.number - b.channel.number);
  }, [activeChannelIds, matchedProgrammes, needle, orderedChannels]);

  const revealSearchChannel = useCallback(
    (channelId: string) => {
      setSelectedChannelIds((current) => {
        const next = [...current];
        while (next.length < columnCount) next.push(availableChannels[next.length]?.id ?? "");
        if (next.slice(0, columnCount).includes(channelId)) return next;
        next[0] = channelId;
        return next;
      });
    },
    [availableChannels, columnCount],
  );

  const allVisibleProgrammes = useMemo(
    () => Array.from(programmesByChannel.values()).flat(),
    [programmesByChannel],
  );
  const liveCount = allVisibleProgrammes.filter((programme) => isLive(programme, selectedDate, now)).length;
  const nowMinutes =
    selectedDate === hktDate() && now
      ? new Date(now)
          .toLocaleString("en-US", {
            timeZone: "Asia/Hong_Kong",
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          })
          .split(":")
          .map(Number)
          .reduce((hours, minutes) => hours * 60 + minutes)
      : null;

  const scrollToNow = useCallback(
    (smooth = true) => {
      if (!gridRef.current) return;
      const targetMinutes = selectedDate === hktDate() && nowMinutes !== null ? nowMinutes : 8 * 60;
      const headerHeight =
        Number.parseFloat(window.getComputedStyle(gridRef.current).getPropertyValue("--header-height")) || 0;
      const targetTop = headerHeight + targetMinutes * PX_PER_MINUTE - gridRef.current.clientHeight / 2;
      const maxTop = gridRef.current.scrollHeight - gridRef.current.clientHeight;
      gridRef.current.scrollTo({
        top: Math.min(Math.max(targetTop, 0), maxTop),
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [nowMinutes, selectedDate],
  );

  useEffect(() => {
    if (!loading && schedule?.date === selectedDate && didAutoScroll.current !== selectedDate) {
      didAutoScroll.current = selectedDate;
      window.requestAnimationFrame(() => scrollToNow(false));
    }
  }, [loading, schedule?.date, scrollToNow, selectedDate]);

  const statusErrors = schedule?.errors?.length ? schedule.errors : index?.errors ?? [];
  const sourceStatus = schedule?.sourceStatus ?? index?.sourceStatus;

  return {
    index,
    selectedDate,
    setSelectedDate,
    schedule,
    query,
    setQuery,
    operatorFilter,
    setOperatorFilter,
    loading,
    error,
    dates,
    currentIndex,
    moveDate,
    availableChannels,
    displayChannels,
    activeChannelIds,
    handleChannelSlotChange,
    columnCount,
    programmesByChannel,
    allVisibleProgrammes,
    liveCount,
    now,
    nowMinutes,
    gridRef,
    scrollToNow,
    statusErrors,
    sourceStatus,
    needle,
    hiddenSearchHits,
    revealSearchChannel,
    matchedCount: matchedProgrammes.length,
  };
}
