import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";

const TZ_SUFFIX = "+08:00";
const DEFAULT_ESTIMATED_MINUTES = 45;
const xmlParser = new XMLParser({ ignoreAttributes: false, trimValues: true });

export function hktDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00${TZ_SUFFIX}`);
  value.setUTCDate(value.getUTCDate() + days);
  return hktDate(value);
}

export function compactDate(date) {
  return date.replaceAll("-", "");
}

export function iso(localDateTime) {
  return `${localDateTime.replace(" ", "T")}${TZ_SUFFIX}`;
}

export function clean(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function list(value) {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

export function estimatedEndIso(startIso, minutes = DEFAULT_ESTIMATED_MINUTES) {
  return new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();
}

export function parseTVBPayload(payload, map) {
  const result = [];
  for (const channel of map) {
    const items = list(payload)
      .flatMap((group) => list(group.item))
      .flatMap((day) => list(day.epg));
    // Filter network by matching from outer structure if present; TVB API returns one network per request
    items.forEach((item, index) => {
      if (!item.start_datetime || !item.programme_title_tc) return;
      const next = items[index + 1];
      const start = iso(item.start_datetime);
      const estimatedEnd = !next?.start_datetime;
      const end = next?.start_datetime
        ? iso(next.start_datetime)
        : estimatedEndIso(start, DEFAULT_ESTIMATED_MINUTES);
      const url = item.programme_path
        ? `https://www.mytvsuper.com/tc/programme/${item.programme_path}/`
        : undefined;
      result.push({
        id: `${channel.id}-${new Date(start).getTime()}`,
        channelId: channel.id,
        title: clean(item.programme_title_tc),
        start,
        end,
        ...(estimatedEnd ? { endEstimated: true } : {}),
        description: clean(item.episode_synopsis_tc),
        ...(url ? { url } : {}),
        source: "TVB",
      });
    });
  }
  return result;
}

export function parseTVBNetworkPayload(payload, channelId) {
  return parseTVBPayload(payload, [{ id: channelId }]);
}

export function parseHOYXml(xmlText, number) {
  const xml = xmlParser.parse(xmlText);
  const result = [];
  const items = list(xml.ProgramGuide?.Channel).flatMap((channel) => list(channel.EpgItem));
  for (const item of items) {
    if (!item.EpgStartDateTime || !item.EpgEndDateTime) continue;
    const title = clean(item.EpisodeInfo?.EpisodeShortDescription || item.ProgramInfo?.ProgramTitle);
    if (!title) continue;
    const start = iso(item.EpgStartDateTime);
    result.push({
      id: `hoy-${number}-${new Date(start).getTime()}`,
      channelId: `hoy-${number}`,
      title,
      start,
      end: iso(item.EpgEndDateTime),
      description: clean(item.EpisodeInfo?.EpisodeLongDescription),
      source: "HOY",
    });
  }
  return result;
}

export function parseRTHKHtml(html, number) {
  const $ = load(html);
  const result = [];
  $(".slideBlock[date]").each((_, dayBlock) => {
    const rawDate = $(dayBlock).attr("date") || "";
    if (!/^\d{8}$/.test(rawDate)) return;
    const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    $(dayBlock).find(".shdBlock").each((__, row) => {
      const times = $(row)
        .find(".shTimeBlock .timeDis")
        .map((___, node) => clean($(node).text()))
        .get()
        .filter((value) => /^\d{2}:\d{2}$/.test(value));
      const titleAnchor = $(row).find(".shTitle a").first();
      const title = clean(titleAnchor.text() || $(row).find(".shTitle").first().text());
      if (!times[0] || !title) return;
      const start = iso(`${date} ${times[0]}:00`);
      let endDate = date;
      if (times[1] && times[1] < times[0]) endDate = shiftDate(date, 1);
      const estimatedEnd = !times[1];
      const end = times[1]
        ? iso(`${endDate} ${times[1]}:00`)
        : estimatedEndIso(start, 30);
      const href = titleAnchor.attr("href");
      const url = href ? new URL(href, "https://www.rthk.hk").href : undefined;
      result.push({
        id: `rthk-${number}-${new Date(start).getTime()}`,
        channelId: `rthk-${number}`,
        title,
        start,
        end,
        ...(estimatedEnd ? { endEstimated: true } : {}),
        description: clean($(row).find(".shSubTitle a").first().text()),
        ...(url ? { url } : {}),
        source: "港台",
      });
    });
  });
  return result;
}

export function extractJsonObjects(text) {
  const objects = [];
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") stack.push(index);
    else if (character === "}" && stack.length) {
      const start = stack.pop();
      try {
        objects.push(JSON.parse(text.slice(start, index + 1)));
      } catch {
        /* ignore incomplete objects */
      }
    }
  }
  return objects;
}

export function extractNextFlightData(html) {
  const $ = load(html);
  const chunks = [];
  $("script").each((_, script) => {
    const content = $(script).html() || "";
    const marker = content.indexOf("self.__next_f.push(");
    if (marker < 0) return;
    const start = content.indexOf("[", marker);
    const end = content.lastIndexOf("]");
    if (start < 0 || end < start) return;
    try {
      const payload = JSON.parse(content.slice(start, end + 1));
      if (typeof payload[1] === "string") chunks.push(payload[1]);
    } catch {
      /* ignore */
    }
  });
  return chunks.join("");
}

export function parseViuFlightData(flightData) {
  const result = [];
  for (const item of extractJsonObjects(flightData)) {
    const number = Number(item.channelId);
    if (![96, 99].includes(number) || !Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
    const start = new Date(item.start).toISOString();
    const title = clean(item.zh_HK?.program_title);
    const episode = clean(item.zh_HK?.episode_name);
    if (!title) continue;
    const programmeId = item.programme_id || item.program_id || item.id;
    const url = programmeId
      ? `https://viu.tv/encore/programme/${programmeId}`
      : undefined;
    result.push({
      id: `viu-${number}-${item.start}`,
      channelId: `viu-${number}`,
      title: clean(episode && episode !== "NA" ? `${title}｜${episode}` : title),
      start,
      end: new Date(item.end).toISOString(),
      description: clean(item.zh_HK?.short_synopsis),
      ...(url ? { url } : {}),
      source: "ViuTV",
    });
  }
  return result;
}

export function parseViuHtml(html) {
  return parseViuFlightData(extractNextFlightData(html));
}

export { DEFAULT_ESTIMATED_MINUTES };
