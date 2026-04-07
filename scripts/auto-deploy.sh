#!/bin/bash
# Auto-deploy MTC Renovations when new commits are pulled from GitHub
# Runs via launchd — uses existing wrangler OAuth auth

set -e

REPO_DIR="$HOME/Developer/mtc/repos/mtcrenovations-astro"
LOG_FILE="/tmp/mtc-auto-deploy.log"
LOCK_FILE="/tmp/mtc-auto-deploy.lock"

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
  exit 0
fi
trap "rm -f $LOCK_FILE" EXIT
touch "$LOCK_FILE"

cd "$REPO_DIR"

# Fetch latest
git fetch origin main --quiet 2>>"$LOG_FILE"

# Check if there are new commits
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "[$(date)] New commits detected. Deploying..." >> "$LOG_FILE"

# Pull changes
git pull origin main --quiet 2>>"$LOG_FILE"

# Build
/opt/homebrew/bin/node node_modules/.bin/astro build >> "$LOG_FILE" 2>&1

if [ $? -ne 0 ]; then
  echo "[$(date)] BUILD FAILED" >> "$LOG_FILE"
  exit 1
fi

# Deploy using existing wrangler auth
/opt/homebrew/bin/npx wrangler pages deploy dist --project-name=mtc-renovations --branch=main --commit-dirty=true >> "$LOG_FILE" 2>&1

echo "[$(date)] Deploy complete: $(git log --oneline -1)" >> "$LOG_FILE"
