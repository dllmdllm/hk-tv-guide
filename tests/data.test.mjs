import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../public/data/", import.meta.url);

test("schedule index contains dated archives", async () => {
  const index = JSON.parse(await readFile(new URL("index.json", root), "utf8"));
  assert.ok(index.dates.length >= 1);
  assert.ok(index.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
});

test("latest schedule has all 14 free-to-air channels and valid programmes", async () => {
  const index = JSON.parse(await readFile(new URL("index.json", root), "utf8"));
  const latest = index.dates.at(-1);
  const schedule = JSON.parse(await readFile(new URL(`${latest}.json`, root), "utf8"));
  assert.equal(schedule.channels.length, 14);
  assert.ok(schedule.programmes.length > 0);
  for (const item of schedule.programmes) {
    assert.ok(item.title);
    assert.ok(schedule.channels.some((channel) => channel.id === item.channelId));
    assert.ok(new Date(item.end) > new Date(item.start));
  }
});
