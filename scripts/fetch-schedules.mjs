import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { mergeSchedules, validateSchedules } from "../lib/schedules.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data");
const TZ_SUFFIX = "+08:00";
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

const channels = [
  ...[31, 32, 33, 34, 35].map((number) => ({ id: `rthk-${number}`, number, name: `港台電視 ${number}`, operator: "港台", accent: "#31c48d", sourceUrl: `https://www.rthk.hk/timetable/tv${number}` })),
  ...[76, 77, 78].map((number) => ({ id: `hoy-${number}`, number, name: `HOY ${number}`, operator: "HOY", accent: "#ff9f43", sourceUrl: "https://hoy.tv/live" })),
  { id: "tvb-81", number: 81, name: "翡翠台", operator: "TVB", accent: "#36a3ff", sourceUrl: "https://programme.tvb.com/" },
  { id: "tvb-82", number: 82, name: "TVB Plus", operator: "TVB", accent: "#36a3ff", sourceUrl: "https://programme.tvb.com/" },
  { id: "tvb-83", number: 83, name: "無綫新聞台", operator: "TVB", accent: "#36a3ff", sourceUrl: "https://programme.tvb.com/" },
  { id: "tvb-84", number: 84, name: "明珠台", operator: "TVB", accent: "#36a3ff", sourceUrl: "https://programme.tvb.com/" },
  { id: "viu-96", number: 96, name: "ViuTVsix", operator: "ViuTV", accent: "#ffd84d", sourceUrl: "https://viu.tv/epg" },
  { id: "viu-99", number: 99, name: "ViuTV", operator: "ViuTV", accent: "#ffd84d", sourceUrl: "https://viu.tv/epg" },
];

function hktDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00${TZ_SUFFIX}`);
  value.setUTCDate(value.getUTCDate() + days);
  return hktDate(value);
}

function compactDate(date) { return date.replaceAll("-", ""); }
function iso(localDateTime) { return `${localDateTime.replace(" ", "T")}${TZ_SUFFIX}`; }
function clean(value = "") { return String(value).replace(/\s+/g, " ").trim(); }
function list(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "HKTVGuide/1.0 (+https://github.com/)",
      accept: "text/html,application/json,application/xml,text/xml,*/*",
      ...options.headers,
    },
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function fetchTVB() {
  const map = [
    { id: "tvb-81", network: "J" }, { id: "tvb-82", network: "B" },
    { id: "tvb-83", network: "C" }, { id: "tvb-84", network: "P" },
  ];
  const today = hktDate();
  const from = compactDate(shiftDate(today, -1));
  const to = compactDate(shiftDate(today, 7));
  const headers = { origin: "https://www.mytvsuper.com", referer: "https://www.mytvsuper.com/" };
  const result = [];

  for (const channel of map) {
    const url = `https://content-api.mytvsuper.com/v1/epg?epg_platform=web&country_code=HK&network_code=${channel.network}&from=${from}&to=${to}`;
    const payload = JSON.parse(await fetchText(url, { headers }));
    const items = payload.flatMap((group) => list(group.item)).flatMap((day) => list(day.epg));
    items.forEach((item, index) => {
      if (!item.start_datetime || !item.programme_title_tc) return;
      const next = items[index + 1];
      const start = iso(item.start_datetime);
      const estimatedEnd = !next?.start_datetime;
      const end = next?.start_datetime ? iso(next.start_datetime) : new Date(new Date(start).getTime() + 60_000).toISOString();
      result.push({
        id: `${channel.id}-${new Date(start).getTime()}`,
        channelId: channel.id,
        title: clean(item.programme_title_tc),
        start,
        end,
        ...(estimatedEnd ? { endEstimated: true } : {}),
        description: clean(item.episode_synopsis_tc),
        source: "TVB",
      });
    });
  }
  return result;
}

async function fetchHOY() {
  const channelPayload = JSON.parse(await fetchText("https://api2.hoy.tv/api/v3/a/channel"));
  const result = [];
  for (const rawChannel of list(channelPayload.data)) {
    const number = Number(rawChannel.videos?.id);
    if (![76, 77, 78].includes(number) || !rawChannel.epg) continue;
    const xml = parser.parse(await fetchText(rawChannel.epg));
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
  }
  return result;
}

async function fetchRTHK() {
  const result = [];
  for (const number of [31, 32, 33, 34, 35]) {
    const html = await fetchText(`https://www.rthk.hk/timetable/tv${number}`);
    const $ = load(html);
    $(".slideBlock[date]").each((_, dayBlock) => {
      const rawDate = $(dayBlock).attr("date") || "";
      if (!/^\d{8}$/.test(rawDate)) return;
      const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      $(dayBlock).find(".shdBlock").each((__, row) => {
        const times = $(row).find(".shTimeBlock .timeDis").map((___, node) => clean($(node).text())).get().filter((value) => /^\d{2}:\d{2}$/.test(value));
        const title = clean($(row).find(".shTitle a").first().text());
        if (!times[0] || !title) return;
        const start = iso(`${date} ${times[0]}:00`);
        let endDate = date;
        if (times[1] && times[1] < times[0]) endDate = shiftDate(date, 1);
        const end = times[1] ? iso(`${endDate} ${times[1]}:00`) : new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
        result.push({
          id: `rthk-${number}-${new Date(start).getTime()}`,
          channelId: `rthk-${number}`,
          title,
          start,
          end,
          description: clean($(row).find(".shSubTitle a").first().text()),
          source: "港台",
        });
      });
    });
  }
  return result;
}

function extractJsonObjects(text) {
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
      try { objects.push(JSON.parse(text.slice(start, index + 1))); } catch {}
    }
  }
  return objects;
}

function extractNextFlightData(html) {
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
    } catch {}
  });
  return chunks.join("");
}

async function fetchViuTV() {
  const result = [];
  for (const slug of ["99", "96"]) {
    const html = await fetchText(`https://viu.tv/epg/${slug}`);
    const flightData = extractNextFlightData(html);
    for (const item of extractJsonObjects(flightData)) {
      const number = Number(item.channelId);
      if (![96, 99].includes(number) || !Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
      const start = new Date(item.start).toISOString();
      const title = clean(item.zh_HK?.program_title);
      const episode = clean(item.zh_HK?.episode_name);
      if (!title) continue;
      result.push({
        id: `viu-${number}-${item.start}`,
        channelId: `viu-${number}`,
        title: clean(episode && episode !== "NA" ? `${title}｜${episode}` : title),
        start,
        end: new Date(item.end).toISOString(),
        description: clean(item.zh_HK?.short_synopsis),
        source: "ViuTV",
      });
    }
  }
  return result;
}

async function existingDates() {
  try {
    return (await readdir(DATA_DIR)).filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file)).map((file) => file.slice(0, 10));
  } catch { return []; }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const tasks = [
    ["TVB", fetchTVB], ["HOY", fetchHOY], ["港台", fetchRTHK], ["ViuTV", fetchViuTV],
  ];
  const results = {};
  const errors = [];
  for (const [name, fetcher] of tasks) {
    try {
      const items = await fetcher();
      if (!items.length) throw new Error("回傳 0 個節目");
      results[name] = { items };
      console.log(`${name}: ${items.length}`);
    } catch (error) {
      results[name] = { error: error.message };
      errors.push(`${name}: ${error.message}`);
    }
  }
  if (errors.length === tasks.length) throw new Error("所有資料來源均失敗，保留現有資料。" + errors.join("; "));
  const archives = await Promise.all((await existingDates()).map(async date => JSON.parse(await readFile(path.join(DATA_DIR, `${date}.json`), "utf8"))));
  const checkedAt = new Date().toISOString();
  const schedules = mergeSchedules(archives, results, channels, checkedAt);
  validateSchedules(schedules);
  for (const schedule of schedules) await writeFile(path.join(DATA_DIR, `${schedule.date}.json`), `${JSON.stringify(schedule, null, 2)}\n`);
  await writeFile(path.join(DATA_DIR, "index.json"), `${JSON.stringify({ updatedAt: checkedAt, dates: schedules.map(s=>s.date), errors }, null, 2)}\n`);
  if (errors.length) console.warn(`Partial update: ${errors.join("; ")}`);
}

await main();
