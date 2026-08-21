import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tables = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "wheel.tables.json"), "utf8")
);

export const getWheelList = (risk, segments) => {
  const row = tables.find((entry) => entry.risk === risk);
  const table = row?.tables.find((entry) => Number(entry.n) === Number(segments));
  return table?.list || null;
};
