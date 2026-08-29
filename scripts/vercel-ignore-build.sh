#!/usr/bin/env bash
set -u

if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ] || ! git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  exit 1
fi

git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA}" HEAD -- \
  api/ engine/ data/ js/pg16/ js/pg17/ js/pg18/ js/pg2/ js/pg21/ js/pg22/ js/pg23/ js/pg233/ js/pg3/ assets/companion/ vendor/liveavatar/ \
  pocketguide-v23.html pocketguide-v23.css pocketguide-v233.css pocketguide-v3.css \
  manifest-v23.webmanifest manifest-v233.webmanifest manifest-v3.webmanifest service-worker.js \
  scripts/vercel-ignore-build.sh vercel.json \
  package.json package-lock.json pnpm-lock.yaml yarn.lock
