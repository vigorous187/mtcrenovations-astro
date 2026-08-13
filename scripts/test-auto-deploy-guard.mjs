import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve("scripts/auto-deploy.sh");

test("legacy auto-deploy fails closed before any production mutation", async () => {
  const source = await readFile(scriptPath, "utf8");
  for (const forbidden of [
    "git fetch",
    "git pull",
    "astro build",
    "wrangler pages deploy",
  ]) {
    assert.equal(source.includes(forbidden), false, `legacy guard still contains ${forbidden}`);
  }

  const directory = await mkdtemp(path.join(tmpdir(), "mtc-auto-deploy-guard-"));
  const logPath = path.join(directory, "guard.log");
  try {
    await assert.rejects(
      () =>
        execFileAsync("/bin/bash", [scriptPath], {
          env: { ...process.env, MTC_LEGACY_DEPLOY_LOG: logPath },
        }),
      (error) => {
        assert.equal(error.code, 78);
        assert.match(error.stderr, /legacy auto-deploy is disabled/i);
        return true;
      },
    );
    assert.match(await readFile(logPath, "utf8"), /BLOCKED: MTC legacy auto-deploy is disabled/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
