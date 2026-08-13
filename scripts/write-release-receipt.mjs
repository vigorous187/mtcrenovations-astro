import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function outcome(value) {
  return ["success", "failure", "skipped", "cancelled"].includes(value) ? value : "unknown";
}

async function readIndexNowStatus(receiptPath) {
  try {
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    return typeof receipt.status === "string" ? receipt.status : "unknown";
  } catch {
    return "skipped";
  }
}

export async function writeReleaseReceipt({
  outputPath = path.join("artifacts", "release-receipt.json"),
  indexNowReceiptPath = path.join("artifacts", "indexnow-receipt.json"),
  env = process.env,
  now = () => new Date(),
} = {}) {
  const identityOutcome = outcome(env.DEPLOYMENT_IDENTITY_OUTCOME);
  const productionOutcome = outcome(env.PRODUCTION_VERIFY_OUTCOME);
  const rollbackOutcome = outcome(env.ROLLBACK_OUTCOME);
  const indexNowOutcome = outcome(env.INDEXNOW_OUTCOME);
  const verificationStatus = identityOutcome === "success" && productionOutcome === "success"
    ? "passed"
    : [identityOutcome, productionOutcome].includes("failure")
      ? "failed"
      : "skipped";
  const rollbackStatus = rollbackOutcome === "success"
    ? "succeeded"
    : rollbackOutcome === "failure"
      ? "failed"
      : verificationStatus === "passed"
        ? "not_required"
        : "skipped";
  const receipt = {
    schema_version: 1,
    site: "mtcrenovations",
    candidate_sha: env.SOURCE_COMMIT || null,
    deployment_id: env.DEPLOYMENT_ID || null,
    verification_status: verificationStatus,
    verified_at: now().toISOString(),
    rollback_status: rollbackStatus,
    indexnow_status: indexNowOutcome === "failure"
      ? "failed_noncritical"
      : await readIndexNowStatus(indexNowReceiptPath),
    outcomes: {
      deployment_identity: identityOutcome,
      production_verification: productionOutcome,
      rollback: rollbackOutcome,
      indexnow: indexNowOutcome,
    },
  };
  const absoluteOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  writeReleaseReceipt().then((receipt) => {
    console.log(`Release receipt recorded: ${receipt.verification_status}; rollback ${receipt.rollback_status}; IndexNow ${receipt.indexnow_status}.`);
  }).catch((error) => {
    console.error(`Release receipt failed: ${error.message}`);
    process.exitCode = 1;
  });
}
