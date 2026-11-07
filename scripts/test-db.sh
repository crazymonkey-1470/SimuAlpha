#!/usr/bin/env bash
# Spin up a throwaway local Postgres, apply a Supabase stub + every migration,
# then run supabase/tests/rls_test.sql. Needs Postgres 15+ server binaries.
# Usage: scripts/test-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"

run() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

cleanup() { run "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

[ "$(id -u)" = 0 ] && chown postgres "$WORK"
run "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust -E UTF8 --locale=C >/dev/null  # UTF-8 like Supabase
run "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=(psql -X -q -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"
