import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../public/data/", import.meta.url);
const channelsRoot = new URL("../lib/channels.json", import.meta.url);

test("shared channel config lists 14 free-to-air channels", async () => {
  const channels = JSON.parse(await readFile(channelsRoot, "utf8"));
  assert.equal(channels.length, 14);
  assert.ok(channels.every((channel) => channel.id && channel.name && channel.sourceUrl));
});

test("schedule index contains dated archives and status fields", async () => {
  const index = JSON.parse(await readFile(new URL("index.json", root), "utf8"));
  assert.ok(index.dates.length >= 1);
  assert.ok(index.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
  assert.ok(Array.isArray(index.errors));
  if (index.sourceStatus) {
    for (const value of Object.values(index.sourceStatus)) assert.equal(typeof value, "boolean");
  }
});

test("latest schedule has all 14 channels, status fields, and valid programmes", async () => {
  const index = JSON.parse(await readFile(new URL("index.json", root), "utf8"));
  const latest = index.dates.at(-1);
  const schedule = JSON.parse(await readFile(new URL(`${latest}.json`, root), "utf8"));
  assert.equal(schedule.channels.length, 14);
  assert.ok(schedule.programmes.length > 0);
  assert.ok(schedule.sourceStatus);
  assert.ok(schedule.errors === undefined || Array.isArray(schedule.errors));
  for (const item of schedule.programmes) {
    assert.ok(item.title);
    assert.ok(schedule.channels.some((channel) => channel.id === item.channelId));
    assert.ok(new Date(item.end) > new Date(item.start));
  }

  for (const channel of schedule.channels) {
    const programmes = schedule.programmes
      .filter((item) => item.channelId === channel.id)
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    for (let index = 1; index < programmes.length; index += 1) {
      assert.ok(
        new Date(programmes[index].start) >= new Date(programmes[index - 1].end),
        `${channel.name} programmes overlap around ${programmes[index].start}`,
      );
    }
  }
});
