#!/bin/sh
set -eu

node scripts/wait-for-deps.js

if [ "${KG_SKIP_DEV_SEED:-0}" != "1" ]; then
  echo "Seeding local Docker catalogs..."
  node scripts/create-dev-user.js
  node scripts/seed-games.js
  node scripts/seed-slots.js
  node scripts/seed-live.js

  if [ "${SPORTSBOOK_SKIP_HOUSE_CRICKET_SEED:-true}" != "true" ]; then
    node scripts/seed-live-cricket.js
  else
    echo "Skipping house cricket seed"
  fi

  if [ "${SPORTSBOOK_SKIP_ODDS_SPORTS_SEED:-true}" != "true" ]; then
    node scripts/seed-odds-sports.js || echo "The Odds API catalog seed skipped"
  else
    echo "Skipping The Odds API catalog seed"
  fi

  if [ -n "${ODDS_API_IO_KEY:-}" ]; then
    node scripts/seed-odds-api-io.js || echo "odds-api.io seed skipped"
  else
    echo "Skipping odds-api.io seed (ODDS_API_IO_KEY unset)"
  fi
fi

exec node index.js
