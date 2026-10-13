#!/usr/bin/env bash
# Builds the app, resets the e2e database, and runs the browser tests.
# Needs a Postgres you can throw away: set E2E_DATABASE_URL (defaults to a local one on port 5433).
set -e
cd "$(dirname "$0")/.."
DB=${E2E_DATABASE_URL:-postgresql://postgres@127.0.0.1:5433/jaa_e2e}
node -e "
const pg = require('pg');
const url = new URL(process.argv[1]); const name = url.pathname.slice(1); url.pathname = '/postgres';
const c = new pg.Client({ connectionString: url.toString() });
c.connect().then(() => c.query('DROP DATABASE IF EXISTS ' + name + ' WITH (FORCE)')).then(() => c.query('CREATE DATABASE ' + name)).then(() => c.end());
" "$DB"
npm run build
E2E_DATABASE_URL=$DB npx playwright test "$@"
