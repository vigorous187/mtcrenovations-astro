const SUBMISSION_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
const DEDUPE_TTL_SECONDS = 90 * 24 * 60 * 60;
const BROWSER_EVENT_DEDUPE_PREFIX = "mtc:generate-lead:";
const browserEventFallback = new WeakMap();

export function normalizeSubmissionId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return SUBMISSION_ID_PATTERN.test(normalized) ? normalized : null;
}

export function isConfirmedLeadResponse(value) {
  return Boolean(
    value &&
      value.success === true &&
      value.conversionEligible === true &&
      value.syncPending === false &&
      typeof value.jobTread?.jobId === "string" &&
      value.jobTread.jobId.trim(),
  );
}

export function buildGenerateLeadEvent(value, context) {
  if (!isConfirmedLeadResponse(value)) return null;
  return {
    form_name: context.formName,
    page_path: context.pagePath,
    event_id: value.jobTread.jobId,
    jobtread_confirmed: true,
    deduplicated: value.deduplicated === true,
  };
}

function browserStorage(target) {
  try {
    const storage = target?.sessionStorage;
    if (
      storage &&
      typeof storage.getItem === "function" &&
      typeof storage.setItem === "function"
    ) {
      return storage;
    }
  } catch {
    // Privacy modes may block storage; the in-memory fallback still protects
    // the current page lifecycle.
  }
  return null;
}

function browserEventKey(eventId) {
  return `${BROWSER_EVENT_DEDUPE_PREFIX}${encodeURIComponent(eventId)}`;
}

export function trackGenerateLeadOnce(event, target = globalThis.window) {
  const eventId = typeof event?.event_id === "string" ? event.event_id.trim() : "";
  const tracker = target?.zaraz?.track;
  if (!eventId || typeof tracker !== "function" || !target) return false;

  const key = browserEventKey(eventId);
  const storage = browserStorage(target);
  if (storage?.getItem(key) === "1") return false;
  if (browserEventFallback.get(target)?.has(eventId)) return false;

  tracker.call(target.zaraz, "generate_lead", event);

  storage?.setItem(key, "1");
  const seen = browserEventFallback.get(target) ?? new Set();
  seen.add(eventId);
  browserEventFallback.set(target, seen);
  return true;
}

function dedupeKey(submissionId) {
  const normalized = normalizeSubmissionId(submissionId);
  return normalized ? `lead-submit:v1:${normalized}` : null;
}

export async function readConfirmedLeadSubmission(kv, submissionId) {
  const key = dedupeKey(submissionId);
  if (!kv || !key) return null;

  const raw = await kv.get(key);
  if (!raw) return null;

  try {
    const response = JSON.parse(raw);
    return isConfirmedLeadResponse(response)
      ? { ...response, deduplicated: true }
      : null;
  } catch {
    return null;
  }
}

export async function writeConfirmedLeadSubmission(kv, submissionId, response) {
  const key = dedupeKey(submissionId);
  if (!kv || !key || !isConfirmedLeadResponse(response)) return false;

  await kv.put(key, JSON.stringify(response), {
    expirationTtl: DEDUPE_TTL_SECONDS,
  });
  return true;
}
