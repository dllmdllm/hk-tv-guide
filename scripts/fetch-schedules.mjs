import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  compactDate,
  hktDate,
  parseHOYXml,
  parseRTHKHtml,
  parseTVBNetworkPayload,
  parseViuHtml,
  shiftDate,
  list,
} from "./lib/parsers.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data");
const CHANNELS = JSON.parse(await readFile(path.join(ROOT, "lib", "channels.json"), "utf8"));
const USER_AGENT = "HKTVGuide/1.0 (+https://github.com/dllmdllm/hk-tv-guide)";
const RETENTION_DAYS = 30;
const SOURCE_NAMES = ["TVB", "HOY", "港台", "ViuTV"];

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": USER_AGENT,
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
    { id: "tvb-81", network: "J" },
    { id: "tvb-82", network: "B" },
    { id: "tvb-83", network: "C" },
    { id: "tvb-84", network: "P" },
  ];
  const today = hktDate();
  const from = compactDate(shiftDate(today, -1));
  const to = compactDate(shiftDate(today, 7));
  const headers = { origin: "https://www.mytvsuper.com", referer: "https://www.mytvsuper.com/" };
  const result = [];

  for (const channel of map) {
    const url = `https://content-api.mytvsuper.com/v1/epg?epg_platform=web&country_code=HK&network_code=${channel.network}&from=${from}&to=${to}`;
    const payload = JSON.parse(await fetchText(url, { headers }));
    result.push(...parseTVBNetworkPayload(payload, channel.id));
  }
  return result;
}

async function fetchHOY() {
  const channelPayload = JSON.parse(await fetchText("https://api2.hoy.tv/api/v3/a/channel"));
  const result = [];
  for (const rawChannel of list(channelPayload.data)) {
    const number = Number(rawChannel.videos?.id);
    if (![76, 77, 78].includes(number) || !rawChannel.epg) continue;
    const xmlText = await fetchText(rawChannel.epg);
    result.push(...parseHOYXml(xmlText, number));
  }
  return result;
}

async function fetchRTHK() {
  const result = [];
  for (const number of [31, 32, 33, 34, 35]) {
    const html = await fetchText(`https://www.rthk.hk/timetable/tv${number}`);
    result.push(...parseRTHKHtml(html, number));
  }
  return result;
}

async function fetchViuTV() {
  const result = [];
  for (const slug of ["99", "96"]) {
    const html = await fetchText(`https://viu.tv/epg/${slug}`);
    result.push(...parseViuHtml(html));
  }
  return result;
}

function programmeDate(programme) {
  return hktDate(new Date(programme.start));
}

function buildSourceStatus(errors) {
  return Object.fromEntries(SOURCE_NAMES.map((name) => [name, !errors.some((error) => error.startsWith(`${name}:`))]));
}

async function existingDates() {
  try {
    return (await readdir(DATA_DIR))
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .map((file) => file.slice(0, 10));
  } catch {
    return [];
  }
}

async function pruneArchives(keepFromDate) {
  const removed = [];
  for (const date of await existingDates()) {
    if (date >= keepFromDate) continue;
    await unlink(path.join(DATA_DIR, `${date}.json`));
    removed.push(date);
  }
  return removed;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const tasks = [
    ["TVB", fetchTVB],
    ["HOY", fetchHOY],
    ["港台", fetchRTHK],
    ["ViuTV", fetchViuTV],
  ];
  const programmes = [];
  const errors = [];

  for (const [name, fetcher] of tasks) {
    try {
      const items = await fetcher();
      if (!items.length) throw new Error("回傳 0 個節目");
      programmes.push(...items);
      console.log(`${name}: ${items.length}`);
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
      console.error(`${name} failed:`, error.message);
    }
  }

  if (!programmes.length) {
    throw new Error(`所有資料來源均失敗，保留現有資料。${errors.join("; ")}`);
  }

  const sourceStatus = buildSourceStatus(errors);
  const deduped = [
    ...new Map(
      programmes.map((item) => [`${item.channelId}-${new Date(item.start).getTime()}`, item]),
    ).values(),
  ].filter((item) => new Date(item.end) > new Date(item.start));

  const fetchedAt = new Date().toISOString();
  const grouped = Map.groupBy(deduped, programmeDate);
  const today = hktDate();
  const keepFrom = shiftDate(today, -(RETENTION_DAYS - 1));

  for (const [date, items] of grouped) {
    const payload = {
      date,
      updatedAt: fetchedAt,
      channels: CHANNELS,
      programmes: items.sort(
        (a, b) => new Date(a.start) - new Date(b.start) || a.channelId.localeCompare(b.channelId),
      ),
      sourceStatus,
      errors,
    };
    await writeFile(path.join(DATA_DIR, `${date}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  }

  const removed = await pruneArchives(keepFrom);
  if (removed.length) console.log(`Pruned ${removed.length} archives older than ${keepFrom}`);

  const dates = (await existingDates()).filter((date) => date >= keepFrom).sort();
  await writeFile(
    path.join(DATA_DIR, "index.json"),
    `${JSON.stringify({ updatedAt: fetchedAt, dates, errors, sourceStatus }, null, 2)}\n`,
  );

  console.log(`Saved ${deduped.length} programmes across ${grouped.size} dates.`);
  if (errors.length) {
    console.warn(`Partial update: ${errors.join("; ")}`);
  }
}

await main();
