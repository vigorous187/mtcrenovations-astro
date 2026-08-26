import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const key = "ae0b529e-ad61-4957-b4d9-6e2e253a8bd5";
const fileName = `${key}.txt`;
const expected = `${key}\n`;
const root = process.cwd();

assert.equal(
  await readFile(path.join(root, "public", fileName), "utf8"),
  expected,
  "IndexNow source key content is not exact",
);
assert.equal(
  await readFile(path.join(root, "dist", fileName), "utf8"),
  expected,
  "IndexNow built key content is not exact",
);

console.log(`IndexNow candidate contract passed: public/${fileName} -> dist/${fileName}`);
