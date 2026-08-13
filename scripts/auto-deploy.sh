#!/usr/bin/env bash
# Legacy launchd entrypoint retained as a fail-closed compatibility guard.
# Production releases must use .github/workflows/deploy.yml so the exact source
# SHA, live release identity, post-deploy contracts, and rollback are enforced.

set -euo pipefail

readonly LOG_FILE="${MTC_LEGACY_DEPLOY_LOG:-/tmp/mtc-auto-deploy.log}"
readonly MESSAGE="MTC legacy auto-deploy is disabled; use the guarded GitHub production release path."

printf '[%s] BLOCKED: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MESSAGE" >> "$LOG_FILE"
printf '%s\n' "$MESSAGE" >&2
exit 78
