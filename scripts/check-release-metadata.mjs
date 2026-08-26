import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expectedCommit = process.env.PUBLIC_RELEASE_COMMIT || "local";
const expectedBranch = process.env.PUBLIC_RELEASE_BRANCH || "local";

if (expectedCommit !== "local") {
  assert.match(
    expectedCommit,
    /^[0-9a-f]{40}$/,
    "PUBLIC_RELEASE_COMMIT must be a full 40-character Git SHA",
  );
}

const metadata = JSON.parse(await readFile("dist/release.json", "utf8"));
assert.deepEqual(
  metadata,
  { commit: expectedCommit, branch: expectedBranch },
  "dist/release.json does not match the requested release identity",
);

console.log(`Release metadata verified: ${expectedBranch}@${expectedCommit}`);
