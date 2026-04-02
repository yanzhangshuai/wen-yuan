#!/bin/sh
set -eu

strip_wrapping_quotes() {
  value="$1"
  case "$value" in
    \"*\")
      value="${value#\"}"
      value="${value%\"}"
      ;;
    \'*\')
      value="${value#\'}"
      value="${value%\'}"
      ;;
  esac
  printf "%s" "$value"
}

wait_for_postgres() {
  admin_db_url="$1"
  max_retries="${DB_WAIT_MAX_RETRIES:-30}"
  retry_delay="${DB_WAIT_RETRY_DELAY_SECONDS:-2}"
  attempt=1

  while [ "$attempt" -le "$max_retries" ]; do
    if psql "$admin_db_url" -Atqc "SELECT 1;" >/dev/null 2>&1; then
      return 0
    fi

    echo "Postgres is not ready yet (${attempt}/${max_retries}), retrying in ${retry_delay}s..."
    sleep "$retry_delay"
    attempt=$((attempt + 1))
  done

  echo "ERROR: Postgres is still unavailable after ${max_retries} retries."
  return 1
}

run_seed() {
  echo "Running seed..."
  pnpm prisma:seed
}

run_migrations_and_seed() {
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is required."
    exit 1
  fi

  DATABASE_URL="$(strip_wrapping_quotes "${DATABASE_URL}")"
  ADMIN_USERNAME="$(strip_wrapping_quotes "${ADMIN_USERNAME:-}")"
  ADMIN_EMAIL="$(strip_wrapping_quotes "${ADMIN_EMAIL:-}")"
  ADMIN_NAME="$(strip_wrapping_quotes "${ADMIN_NAME:-}")"
  ADMIN_PASSWORD="$(strip_wrapping_quotes "${ADMIN_PASSWORD:-}")"
  JWT_SECRET="$(strip_wrapping_quotes "${JWT_SECRET:-}")"
  APP_ENCRYPTION_KEY="$(strip_wrapping_quotes "${APP_ENCRYPTION_KEY:-}")"
  RUN_DB_SEED="$(strip_wrapping_quotes "${RUN_DB_SEED:-if-empty}")"

  export DATABASE_URL
  export ADMIN_USERNAME
  export ADMIN_EMAIL
  export ADMIN_NAME
  export ADMIN_PASSWORD
  export JWT_SECRET
  export APP_ENCRYPTION_KEY
  export RUN_DB_SEED

  DB_URL_NO_QUERY="${DATABASE_URL%%\?*}"
  DB_NAME="${DB_URL_NO_QUERY##*/}"
  DB_BASE="${DB_URL_NO_QUERY%/*}"
  ADMIN_DB_URL="${DB_BASE}/postgres"

  wait_for_postgres "$ADMIN_DB_URL"

  echo "Ensuring database exists: ${DB_NAME}"
  DB_NAME_SQL_ESCAPED="$(printf "%s" "$DB_NAME" | sed "s/'/''/g")"
  DB_NAME_IDENT_ESCAPED="$(printf "%s" "$DB_NAME" | sed 's/\"/\"\"/g')"
  DB_EXISTS="$(psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME_SQL_ESCAPED}';" || true)"
  DB_CREATED="false"
  if [ "$DB_EXISTS" != "1" ]; then
    psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DB_NAME_IDENT_ESCAPED}\";"
    DB_CREATED="true"
  fi

  echo "Running Prisma migrations..."
  pnpm exec prisma migrate deploy

  case "$RUN_DB_SEED" in
    false|0|off|no)
      echo "Skipping seed (RUN_DB_SEED=${RUN_DB_SEED})."
      ;;
    always|force)
      run_seed
      ;;
    true|1|on|yes|if-empty)
      HAS_SEED_BASIS="$(psql "$DB_URL_NO_QUERY" -Atqc "SELECT CASE WHEN EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM ai_models) THEN 1 ELSE 0 END;" || echo "1")"
      if [ "$DB_CREATED" = "true" ] || [ "$HAS_SEED_BASIS" = "0" ]; then
        run_seed
      else
        echo "Skipping seed (existing users/ai_models detected)."
      fi
      ;;
    *)
      echo "ERROR: Unsupported RUN_DB_SEED value: ${RUN_DB_SEED}"
      echo "Use one of: if-empty, true, false, always"
      exit 1
      ;;
  esac
}

ENTRYPOINT_MODE="$(strip_wrapping_quotes "${ENTRYPOINT_MODE:-all}")"
case "$ENTRYPOINT_MODE" in
  migrate)
    run_migrations_and_seed
    echo "Migration service finished."
    exit 0
    ;;
  app)
    echo "Starting app..."
    exec pnpm start
    ;;
  all)
    run_migrations_and_seed
    echo "Starting app..."
    exec pnpm start
    ;;
  *)
    echo "ERROR: Unsupported ENTRYPOINT_MODE: ${ENTRYPOINT_MODE}"
    echo "Use one of: migrate, app, all"
    exit 1
    ;;
esac
