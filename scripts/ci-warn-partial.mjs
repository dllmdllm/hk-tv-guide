import { readFile } from "node:fs/promises";

const index = JSON.parse(await readFile("public/data/index.json", "utf8"));
const errors = index.errors ?? [];
const failed = Object.entries(index.sourceStatus ?? {}).filter(([, ok]) => !ok).map(([name]) => name);

if (!errors.length && !failed.length) {
  console.log("All sources OK");
  process.exit(0);
}

const detail = (failed.length ? failed : errors).join("; ");
console.warn(`::warning::Partial source failure: ${detail}`);
