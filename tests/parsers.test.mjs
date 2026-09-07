import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  estimatedEndIso,
  parseHOYXml,
  parseRTHKHtml,
  parseTVBNetworkPayload,
  parseViuHtml,
} from "../scripts/lib/parsers.mjs";

const fixtures = new URL("./fixtures/", import.meta.url);

test("TVB parser maps programme urls and estimates final end at 45 minutes", async () => {
  const payload = JSON.parse(await readFile(new URL("tvb-epg.json", fixtures), "utf8"));
  const items = parseTVBNetworkPayload(payload, "tvb-81");
  assert.equal(items.length, 2);
  assert.equal(items[0].url, "https://www.mytvsuper.com/tc/programme/news_1/");
  assert.equal(items[0].endEstimated, undefined);
  assert.equal(items[1].endEstimated, true);
  assert.equal(items[1].end, estimatedEndIso(items[1].start, 45));
  assert.match(items[1].description, /電影/);
});

test("HOY parser reads XML programme windows", async () => {
  const xml = await readFile(new URL("hoy-epg.xml", fixtures), "utf8");
  const items = parseHOYXml(xml, 77);
  assert.equal(items.length, 1);
  assert.equal(items[0].channelId, "hoy-77");
  assert.equal(items[0].title, "晚間新聞");
  assert.ok(new Date(items[0].end) > new Date(items[0].start));
});

test("RTHK parser keeps links and estimates missing end times", async () => {
  const html = await readFile(new URL("rthk.html", fixtures), "utf8");
  const items = parseRTHKHtml(html, 31);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "六點半新聞報道");
  assert.ok(items[0].url?.includes("/tv/programme/demo"));
  assert.equal(items[1].endEstimated, true);
  assert.equal(items[1].end, estimatedEndIso(items[1].start, 30));
});

test("ViuTV parser extracts flight JSON programmes", async () => {
  const html = await readFile(new URL("viu.html", fixtures), "utf8");
  const items = parseViuHtml(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].channelId, "viu-99");
  assert.match(items[0].title, /Viu 節目/);
  assert.ok(items[0].url?.includes("/encore/programme/123"));
});
