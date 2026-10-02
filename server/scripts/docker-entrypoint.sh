#!/bin/sh
# Waits for PostgreSQL, applies the schema, optionally loads demo data, then starts the server.
set -e
echo "Waiting for database..."
i=0
until node -e "require('pg').Pool && new (require('pg').Pool)({connectionString: process.env.DATABASE_URL}).query('select 1').then(()=>process.exit(0)).catch(()=>process.exit(1))"; do
  i=$((i+1)); [ $i -gt 60 ] && echo "Database not reachable" && exit 1; sleep 2
done
node scripts/migrate.js
if [ "${SEED_DEMO:-false}" = "true" ]; then node scripts/seed.js; fi
exec "$@"
