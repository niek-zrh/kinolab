#!/usr/bin/env bash
#
# Rebuilds a FRESH self-hosted Convex backend for the Kinolab pilot from a
# snapshot export plus a saved env-var dump, then re-pushes the functions.
#
# Usage: scripts/pilot-rebuild.sh [--dry-run] [--yes] [--overwrite-existing] <export.zip> <env-dump.env>
#
#   export.zip      from `npx convex export --include-file-storage` (the
#                   kinolab-convex-backup service writes these): one
#                   <table>/documents.jsonl per table plus _storage/.
#   env-dump.env    from scripts/pilot-env-backup.sh = `npx convex env list`
#                   output, which is a DOTENV file (values containing '#',
#                   newlines or quotes come quoted). Exports never contain
#                   env vars or code, hence this file.
#   --dry-run       print the plan and check the inputs. No network calls,
#                   nothing is changed.
#   --yes, -y       skip the confirmation gate in front of the destructive
#                   import (needed when stdin is not a terminal). Passing it
#                   asserts that you checked the backend runs on S3.
#   --overwrite-existing
#                   proceed although the backend already has env vars set,
#                   i.e. it is NOT fresh. Everything on it is replaced.
#
# When: right after `docker compose up -d` of an EMPTY backend that has the
# SAME INSTANCE_NAME/INSTANCE_SECRET as before (so the saved admin key still
# works), and after proving it runs on S3 — README §"Rebuild: fresh server".
#
#   1 preflight   inputs; /version; /instance_name (must be kinolab); the
#                 admin key works; the backend is fresh (no env vars) unless
#                 --overwrite-existing
#   2 import      convex import --replace-all --yes <zip>
#   3 env vars    convex env set --from-file <dump> --force  (the CLI's own
#                 inverse of `env list`), then INVITE_ONLY_SIGNUPS=1 unless
#                 the dump says ALLOW_OPEN_SIGNUPS=1 (convex/auth.ts:
#                 invite-only wins)
#   4 push        convex deploy --env-file .env.pilot.local
#   5 verify      env names, HTTP router (jwks 200 / unknown 404), a query
#
# Runs from any directory: the two paths are made absolute and the repo's own
# CLI (node_modules/.bin/convex — `pnpm install` first) is executed from the
# repo root, so npx can never substitute another CLI version for the
# destructive steps.
#
# Environment:
#   PILOT_ENV_FILE          credentials, default .env.pilot.local in the repo
#                           root: CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY
#   EXPECTED_INSTANCE_NAME  default kinolab
#   EXPECTED_SITE_URL       default https://pilot.kinolab.ai (SITE_URL in the dump)
#   CONVEX_SITE_URL_PUBLIC  HTTP-actions origin of THIS backend, used by the
#                           verify step. Defaults to https://actions.kinolab.ai
#                           only when CONVEX_SELF_HOSTED_URL is
#                           https://api.kinolab.ai; for any other backend (a
#                           rehearsal, a tunnel) it is required, so a rehearsal
#                           can never report PASS/FAIL from production.
#
# Findings baked in (Convex CLI 1.44.0, checked 2026-09-19):
#   - `import --yes` skips the delete-confirmation prompt; without it the
#     CLI exits 1 when stdin is not a TTY.
#   - `env set --from-file` parses the dump with dotenv, skips the
#     CLI-managed CONVEX_DEPLOYMENT/CONVEX_SELF_HOSTED_*/*_CONVEX_URL names
#     itself, applies every value in ONE update and prints counts, never
#     values. A hand parser would replay the dotenv quoting as part of the
#     value (a '#' in any value would do it).
#   - `deploy --env-file` never writes .env.local. `dev --once --env-file`
#     DOES (it erases CONVEX_DEPLOYMENT and rewrites the public URLs there),
#     which is why step 4 uses deploy. Never pass --url/--admin-key to
#     `convex dev` either.
#   - The credentials file is parsed, not sourced: the admin key has a '|'.
#   - `env set -- NAME VALUE`: the `--` matters for values starting with '-'.
#   - CONVEX_DEPLOYMENT is exported EMPTY: the CLI treats "" as unset and
#     dotenv never overrides an exported variable, so .env.local's value
#     cannot collide with the self-hosted URL.
set -euo pipefail

SCRIPT_NAME=pilot-rebuild
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONVEX_BIN="$REPO_ROOT/node_modules/.bin/convex"
PILOT_API_URL=https://api.kinolab.ai
PILOT_ACTIONS_URL=https://actions.kinolab.ai

EXPECTED_INSTANCE_NAME=${EXPECTED_INSTANCE_NAME:-kinolab}
EXPECTED_SITE_URL=${EXPECTED_SITE_URL:-https://pilot.kinolab.ai}
SITE_URL_PUBLIC=${CONVEX_SITE_URL_PUBLIC:-}
SITE_URL_PUBLIC=${SITE_URL_PUBLIC%/}

# Without these nobody can sign in (setup-auth.mjs would mint NEW keys and
# log everyone out), so their absence from the dump is fatal.
REQUIRED_ENV_NAMES=(JWT_PRIVATE_KEY JWKS SITE_URL)
# Expected on the pilot; the app degrades without them (no admin bootstrap,
# no Drive picker) rather than locking everyone out, so only a warning.
EXPECTED_ENV_NAMES=(ADMIN_SIGNUP_ALLOWLIST NEXT_PUBLIC_GOOGLE_API_KEY NEXT_PUBLIC_GOOGLE_APP_ID)

DRY_RUN=0
ASSUME_YES=0
OVERWRITE_EXISTING=0
ZIP=
ENV_BACKUP=
INSTANCE=
PROBLEMS=0   # --dry-run: input problems found
FAILED=0     # step 5: failed checks
RESULTS=
TMP_BODY=
# Names only — the values stay in the dump file; the CLI reads it directly.
ENV_NAMES=()
ENV_MANAGED=
ENV_BAD=0
STORED_FILES=0
FILE_INVITE_ONLY=
FILE_ALLOW_OPEN=
FILE_SITE_URL=
INVITE_DESC=unset

trap '[[ -z ${TMP_BODY:-} ]] || rm -f "$TMP_BODY"' EXIT

die()  { printf '%s: ERROR: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
step() { printf '\n== Step %s ==\n' "$*"; }
plan() { printf '   would run: %s\n' "$*"; }

usage() {
  cat <<'USAGE'
Usage: scripts/pilot-rebuild.sh [--dry-run] [--yes] [--overwrite-existing] <export.zip> <env-dump.env>

Rebuilds a fresh self-hosted Convex backend: preflight, import the snapshot
(--replace-all), replay the deployment env vars, push the functions, verify.
The header comment of this script has the details.

  --dry-run             print the plan and check the inputs; no network calls
  --yes, -y             skip the confirmation gate (asserts the S3 check was done)
  --overwrite-existing  allow a backend that already has env vars (not fresh)
Env: PILOT_ENV_FILE (.env.pilot.local), EXPECTED_INSTANCE_NAME (kinolab),
     EXPECTED_SITE_URL (https://pilot.kinolab.ai),
     CONVEX_SITE_URL_PUBLIC (required unless the backend is https://api.kinolab.ai)
USAGE
}

# In --dry-run a problem is listed and counted; for real it aborts.
note_problem() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '   !! %s\n' "$*"
    PROBLEMS=$((PROBLEMS + 1))
  else
    die "$*"
  fi
}

# abspath PATH: prints PATH made absolute against the caller's cwd. The file
# need not exist.
abspath() {
  case $1 in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$PWD" "$1" ;; esac
}

# The repo's pinned CLI, run from the repo root (main cd's there). Never
# `npx convex`: from another directory npx would download a different version.
convex_cli() { "$CONVEX_BIN" "$@"; }

# --- credentials -----------------------------------------------------------
# Duplicated in scripts/pilot-env-backup.sh on purpose: two self-contained
# operator scripts, no shared lib to source (sourcing is what we avoid here).

# env_file_value FILE NAME: prints NAME's value from a dotenv-style file, or
# nothing. Splits on the FIRST '=' only; strips a trailing \r and one pair of
# surrounding "..." or '...'. Accepts an optional 'export ' prefix.
env_file_value() {
  local file=$1 name=$2 line value
  while IFS= read -r line || [[ -n $line ]]; do
    line=${line%$'\r'}
    case $line in
      "$name="*|"export $name="*) value=${line#*=} ;;
      *) continue ;;
    esac
    if [[ ${#value} -ge 2 && $value == \"*\" ]]; then
      value=${value#\"}; value=${value%\"}
    elif [[ ${#value} -ge 2 && $value == \'*\' ]]; then
      value=${value#\'}; value=${value%\'}
    fi
    printf '%s' "$value"
    return 0
  done < "$file"
  return 0
}

# load_pilot_credentials: exports CONVEX_SELF_HOSTED_URL/_ADMIN_KEY for the
# CLI, blanks CONVEX_DEPLOYMENT, sets PILOT_ENV_FILE_RESOLVED (absolute).
load_pilot_credentials() {
  local rel=${PILOT_ENV_FILE:-.env.pilot.local} file
  case $rel in /*) file=$rel ;; *) file=$REPO_ROOT/$rel ;; esac
  [[ -f $file ]] || die "credentials file not found: $file (PILOT_ENV_FILE overrides)"
  CONVEX_SELF_HOSTED_URL=$(env_file_value "$file" CONVEX_SELF_HOSTED_URL)
  CONVEX_SELF_HOSTED_ADMIN_KEY=$(env_file_value "$file" CONVEX_SELF_HOSTED_ADMIN_KEY)
  [[ -n $CONVEX_SELF_HOSTED_URL ]] || die "CONVEX_SELF_HOSTED_URL is missing or empty in $file"
  [[ -n $CONVEX_SELF_HOSTED_ADMIN_KEY ]] || die "CONVEX_SELF_HOSTED_ADMIN_KEY is missing or empty in $file"
  CONVEX_SELF_HOSTED_URL=${CONVEX_SELF_HOSTED_URL%/}
  export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
  export CONVEX_DEPLOYMENT=
  PILOT_ENV_FILE_RESOLVED=$file
}

# resolve_site_url_public: the verify step must hit THIS backend's HTTP
# actions origin. Only the pilot URL has a known default.
resolve_site_url_public() {
  [[ -n $SITE_URL_PUBLIC ]] && return 0
  if [[ $CONVEX_SELF_HOSTED_URL == "$PILOT_API_URL" ]]; then
    SITE_URL_PUBLIC=$PILOT_ACTIONS_URL
  else
    die "CONVEX_SELF_HOSTED_URL is $CONVEX_SELF_HOSTED_URL (not the pilot): set CONVEX_SITE_URL_PUBLIC to the HTTP-actions origin of THAT backend, so the verify step cannot report production's answers"
  fi
}

# --- the env dump ----------------------------------------------------------

# parse_env_backup: reads the NAMES in $ENV_BACKUP into ENV_NAMES, plus the
# values of the three variables the sign-up gate and the checks care about,
# the way dotenv reads them — closely enough for these checks: blank lines
# and comments skipped, optional `export `, one pair of matching surrounding
# quotes removed, `\n` inside double quotes unescaped, a quoted value that
# opens on one line and closes on a later one consumed as one value. Step 3
# hands the file to the CLI, whose dotenv parse is the authoritative one.
# Anything else is reported by line number, never by content.
parse_env_backup() {
  local line stripped name value q rest bad lineno=0
  ENV_NAMES=(); ENV_MANAGED=; ENV_BAD=0
  FILE_INVITE_ONLY=; FILE_ALLOW_OPEN=; FILE_SITE_URL=
  while IFS= read -r line || [[ -n $line ]]; do
    lineno=$((lineno + 1))
    line=${line%$'\r'}
    stripped=${line#"${line%%[![:space:]]*}"}
    [[ -z $stripped || $stripped == \#* ]] && continue
    stripped=${stripped#export }
    name=${stripped%%=*}
    if [[ $name == "$stripped" || ! $name =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      warn "$ENV_BACKUP line $lineno is not NAME=value; skipped"
      ENV_BAD=$((ENV_BAD + 1))
      continue
    fi
    value=${stripped#*=}
    q=
    case $value in \"*) q=\" ;; \'*) q=\' ;; esac
    if [[ -n $q ]]; then
      bad=0
      while [[ ${#value} -lt 2 || $value != *"$q" ]]; do
        if ! IFS= read -r rest; then bad=1; break; fi
        lineno=$((lineno + 1))
        value="$value"$'\n'"${rest%$'\r'}"
      done
      if [[ $bad -eq 1 ]]; then
        warn "$ENV_BACKUP: the quoted value of $name is never closed"
        ENV_BAD=$((ENV_BAD + 1))
        continue
      fi
      value=${value#"$q"}; value=${value%"$q"}
      [[ $q == \" ]] && value=${value//\\n/$'\n'}
    else
      value=${value%"${value##*[![:space:]]}"}
    fi
    case $name in
      CONVEX_*|NEXT_PUBLIC_CONVEX*) ENV_MANAGED="$ENV_MANAGED $name"; continue ;;
      INVITE_ONLY_SIGNUPS) FILE_INVITE_ONLY=$value ;;
      ALLOW_OPEN_SIGNUPS)  FILE_ALLOW_OPEN=$value ;;
      SITE_URL)            FILE_SITE_URL=$value ;;
    esac
    ENV_NAMES+=("$name")
  done < "$ENV_BACKUP"
  if [[ -n $FILE_INVITE_ONLY ]]; then INVITE_DESC="set to '$FILE_INVITE_ONLY'"; else INVITE_DESC=unset; fi
}

env_backup_has() {
  local i
  for ((i = 0; i < ${#ENV_NAMES[@]}; i++)); do
    [[ ${ENV_NAMES[$i]} == "$1" ]] && return 0
  done
  return 1
}

env_backup_names() {  # space-separated, for printing
  local i out=
  for ((i = 0; i < ${#ENV_NAMES[@]}; i++)); do out="$out ${ENV_NAMES[$i]}"; done
  printf '%s' "${out# }"
}

# set_env_var NAME VALUE: prints only the name. The CLI's output is captured
# and shown only on failure, with the value redacted (1.44.0 prints just
# "Successfully set NAME", but do not rely on it).
set_env_var() {
  local name=$1 value=$2 out rc=0
  out=$(convex_cli env set -- "$name" "$value" 2>&1) || rc=$?
  if [[ $rc -ne 0 ]]; then
    [[ -z $value ]] || out=${out//"$value"/<redacted>}
    printf '%s\n' "$out" >&2
    die "env set $name failed (exit $rc)"
  fi
  printf '   set %s\n' "$name"
}

# --- inputs ----------------------------------------------------------------

check_inputs() {
  local tables n missing=

  if [[ ! -f $ZIP ]]; then
    note_problem "export zip not found: $ZIP"
  elif [[ ! -s $ZIP ]]; then
    note_problem "export zip is empty: $ZIP"
  elif ! command -v unzip >/dev/null 2>&1; then
    printf '   export zip: %s (unzip not installed, contents not inspected)\n' "$ZIP"
  elif ! tables=$(unzip -Z1 "$ZIP" 2>/dev/null | sed -n 's#/documents\.jsonl$##p' | grep -v '^_storage$' | sort | tr '\n' ' '); then
    note_problem "not a readable zip: $ZIP"
  else
    tables=${tables% }
    printf '   export zip: %s\n' "$ZIP"
    printf '   tables:     %s\n' "${tables:-<none>}"
    [[ -n $tables ]] || note_problem "no <table>/documents.jsonl entries in $ZIP; not a Convex snapshot export?"
    # _storage/documents.jsonl holds the rows; every other _storage/<id>
    # entry is a stored file. Rows without files = dangling after import.
    STORED_FILES=$(unzip -Z1 "$ZIP" 2>/dev/null | grep -E '^_storage/' | grep -v -c '^_storage/documents\.jsonl$' || true)
    if [[ ${STORED_FILES:-0} -gt 0 ]]; then
      printf '   _storage:   %s stored file(s) will be restored\n' "$STORED_FILES"
    else
      warn "no stored files in $ZIP: file storage will be EMPTY after the import (export taken without --include-file-storage, or the deployment had no files — e.g. the 2026-09 tables-only zip). Expected for the 2026-09 rebuild; otherwise use a zip that has them."
    fi
  fi

  if [[ ! -f $ENV_BACKUP ]]; then
    note_problem "env dump not found: $ENV_BACKUP"
    return 0
  fi
  parse_env_backup
  [[ $ENV_BAD -eq 0 ]] || note_problem "$ENV_BAD unparseable line(s) in $ENV_BACKUP; fix the file first"
  printf '   env dump:   %s (%d variable(s) to set)\n' "$ENV_BACKUP" "${#ENV_NAMES[@]}"
  [[ -z $ENV_MANAGED ]] || note_problem "env dump contains names the backend manages itself:$ENV_MANAGED — delete those lines (they derive from the compose origins)"
  for n in "${REQUIRED_ENV_NAMES[@]}"; do
    env_backup_has "$n" || missing="$missing $n"
  done
  [[ -z $missing ]] || note_problem "env dump lacks:$missing (without them nobody can sign in; scripts/setup-auth.mjs would mint NEW keys and log everyone out — README §Rebuild, 'No env dump?')"
  missing=
  for n in "${EXPECTED_ENV_NAMES[@]}"; do
    env_backup_has "$n" || missing="$missing $n"
  done
  [[ -z $missing ]] || warn "env dump lacks:$missing; the app degrades without them, set them by hand after the rebuild if needed"
  if [[ -n $FILE_SITE_URL && $FILE_SITE_URL != "$EXPECTED_SITE_URL" ]]; then
    warn "SITE_URL in the dump is $FILE_SITE_URL, expected $EXPECTED_SITE_URL (EXPECTED_SITE_URL overrides)"
  fi
}

# Typed confirmation before the only destructive step. Skipped with --yes;
# refuses to guess when stdin is not a terminal. Two answers: the S3 proof
# (a backend on --local-storage keeps the imported files inside the
# volume-less container, and the storage type is pinned on first boot), then
# the instance name.
confirm_gate() {
  local answer
  [[ $ASSUME_YES -eq 0 ]] || return 0
  [[ -t 0 ]] || die "stdin is not a terminal; pass --yes to confirm the --replace-all import into $CONVEX_SELF_HOSTED_URL (it also asserts you checked the backend runs on S3)"
  cat <<EOF

Before data is replaced on $CONVEX_SELF_HOSTED_URL (instance $INSTANCE):
  on the server, PID 1 of the backend container must show --s3-storage:
    docker compose -f deploy/convex-backend.compose.yml exec kinolab-convex-backend \\
      sh -c "tr '\\0' '\\n' </proc/1/cmdline | grep -E -- '--(s3|local)-storage'"
EOF
  printf 'Did that print --s3-storage? [y/N] '
  read -r answer
  [[ $answer == y || $answer == Y ]] || die "storage mode not confirmed; nothing changed. Fix deploy/.env, 'down -v' (empty database only), 'up -d', check again, re-run"
  printf '\nThis REPLACES ALL DATA on %s (instance %s) with %s.\nType the instance name to continue: ' \
    "$CONVEX_SELF_HOSTED_URL" "$INSTANCE" "$ZIP"
  read -r answer
  [[ $answer == "$INSTANCE" ]] || die "confirmation did not match; nothing changed"
}

# --- steps -----------------------------------------------------------------

step_preflight() {
  local version names existing
  step "1/5 Preflight"
  command -v curl >/dev/null 2>&1 || die "curl not found on PATH"
  if [[ -x $CONVEX_BIN ]]; then
    printf '   convex CLI: %s (%s)\n' "$(convex_cli --version 2>/dev/null || echo '?')" "$CONVEX_BIN"
  else
    note_problem "$CONVEX_BIN not found: run 'pnpm install' in $REPO_ROOT (the repo's pinned CLI is used, never an npx-downloaded one)"
  fi
  check_inputs
  if [[ $DRY_RUN -eq 1 ]]; then
    plan "curl -fsS $CONVEX_SELF_HOSTED_URL/version"
    plan "curl -fsS $CONVEX_SELF_HOSTED_URL/instance_name   (must print '$EXPECTED_INSTANCE_NAME')"
    plan "convex env list --names-only   (proves the admin key; must be EMPTY = fresh backend, unless --overwrite-existing)"
    return 0
  fi
  version=$(curl -fsS --max-time 20 "$CONVEX_SELF_HOSTED_URL/version") \
    || die "GET $CONVEX_SELF_HOSTED_URL/version failed; is the backend up and routed (Caddy/Cloudflare/tunnel)?"
  INSTANCE=$(curl -fsS --max-time 20 "$CONVEX_SELF_HOSTED_URL/instance_name") \
    || die "GET $CONVEX_SELF_HOSTED_URL/instance_name failed"
  printf '   backend version:  %s\n' "$version"
  printf '   instance_name:    %s\n' "$INSTANCE"
  [[ $INSTANCE == "$EXPECTED_INSTANCE_NAME" ]] \
    || die "instance_name is '$INSTANCE', expected '$EXPECTED_INSTANCE_NAME' (EXPECTED_INSTANCE_NAME overrides); refusing to continue"
  names=$(convex_cli env list --names-only 2>/dev/null) \
    || die "'convex env list' failed: admin key rejected? (INSTANCE_NAME/INSTANCE_SECRET must equal the old backend's)"
  existing=$(printf '%s\n' "$names" | grep -c -E '^[A-Za-z_][A-Za-z0-9_]*$' || true)
  if [[ ${existing:-0} -gt 0 ]]; then
    if [[ $OVERWRITE_EXISTING -eq 1 ]]; then
      printf '   admin key:        accepted; %s env var(s) already set — NOT a fresh backend; --overwrite-existing given, everything on it will be replaced\n' "$existing"
    else
      die "$CONVEX_SELF_HOSTED_URL already has $existing env var(s) set ($(printf '%s' "$names" | tr '\n' ' ')) — this is NOT a fresh backend. Is $PILOT_ENV_FILE_RESOLVED pointing at the right one? To replace everything on it anyway, pass --overwrite-existing."
    fi
  else
    printf '   admin key:        accepted; no env vars set yet (fresh backend)\n'
  fi
}

step_import() {
  step "2/5 Import snapshot (--replace-all)"
  if [[ $DRY_RUN -eq 1 ]]; then
    plan "convex import --replace-all --yes \"$ZIP\"   (--yes: CLI 1.44 flag that skips the delete-confirmation prompt)"
    return 0
  fi
  confirm_gate
  convex_cli import --replace-all --yes "$ZIP" \
    || die "import failed; the backend may be partially written. Fix the cause and re-run with --overwrite-existing (the import is idempotent with --replace-all)"
  printf '   imported %s\n' "$ZIP"
}

step_env() {
  local out rc=0
  step "3/5 Deployment env vars"
  if [[ $DRY_RUN -eq 1 ]]; then
    plan "convex env set --from-file \"$ENV_BACKUP\" --force   (one update; names: $(env_backup_names))"
    if [[ $FILE_ALLOW_OPEN == 1 ]]; then
      printf '   ALLOW_OPEN_SIGNUPS=1 in the dump: INVITE_ONLY_SIGNUPS left as in the file (%s)\n' "$INVITE_DESC"
    elif [[ $FILE_INVITE_ONLY == 1 ]]; then
      printf '   INVITE_ONLY_SIGNUPS=1 comes from the dump\n'
    else
      plan "convex env set -- INVITE_ONLY_SIGNUPS 1   (the dump has it $INVITE_DESC; ALLOW_OPEN_SIGNUPS=1 in the file opts out)"
    fi
    return 0
  fi
  # The CLI prints counts and skipped names, never values.
  out=$(convex_cli env set --from-file "$ENV_BACKUP" --force 2>&1) || rc=$?
  printf '%s\n' "$out" | sed 's/^/   /'
  [[ $rc -eq 0 ]] || die "env set --from-file failed (exit $rc); nothing from the dump was applied (the CLI applies all-or-nothing)"
  if [[ $FILE_ALLOW_OPEN == 1 ]]; then
    printf '   ALLOW_OPEN_SIGNUPS=1 in the dump: INVITE_ONLY_SIGNUPS left as in the file (%s)\n' "$INVITE_DESC"
  elif [[ $FILE_INVITE_ONLY == 1 ]]; then
    printf '   INVITE_ONLY_SIGNUPS=1 came from the dump\n'
  else
    set_env_var INVITE_ONLY_SIGNUPS 1
    printf '   (forced: the dump had INVITE_ONLY_SIGNUPS %s; ALLOW_OPEN_SIGNUPS=1 in the file opts out)\n' "$INVITE_DESC"
  fi
}

env_local_fingerprint() {
  if [[ -f $REPO_ROOT/.env.local ]]; then cksum < "$REPO_ROOT/.env.local"; else echo none; fi
}

step_push() {
  local before after
  step "4/5 Push functions"
  if [[ $DRY_RUN -eq 1 ]]; then
    plan "(cd \"$REPO_ROOT\" && convex deploy --env-file \"$PILOT_ENV_FILE_RESOLVED\")"
    return 0
  fi
  before=$(env_local_fingerprint)
  convex_cli deploy --env-file "$PILOT_ENV_FILE_RESOLVED" \
    || die "function push failed (schema mismatch with the imported data, or typecheck error?)"
  after=$(env_local_fingerprint)
  [[ $before == "$after" ]] || warn "$REPO_ROOT/.env.local changed during the push — 'deploy --env-file' must not do that; inspect it before running pnpm dev"
  printf '   pushed convex/ from %s\n' "$REPO_ROOT"
}

# http_code URL OUTFILE: prints the status code, 000 when curl itself fails.
http_code() {
  local code
  code=$(curl -s -o "$2" -w '%{http_code}' --max-time 20 "$1" 2>/dev/null) || true
  printf '%s' "${code:-000}"
}

record() {  # record PASS|FAIL "check" "detail"
  RESULTS="$RESULTS$(printf '   %-4s  %-40s  %s' "$1" "$2" "$3")"$'\n'
  [[ $1 == PASS ]] || FAILED=$((FAILED + 1))
}

step_verify() {
  local names missing= n code out
  step "5/5 Verify"
  if [[ $DRY_RUN -eq 1 ]]; then
    plan "convex env list --names-only   (required: ${REQUIRED_ENV_NAMES[*]} INVITE_ONLY_SIGNUPS)"
    plan "curl $SITE_URL_PUBLIC/.well-known/jwks.json   (must be 200 with a \"keys\" array)"
    plan "curl $SITE_URL_PUBLIC/does-not-exist   (must be 404; a 500 means the HTTP router is dead)"
    plan "convex run users:authProviders '{}'   (must succeed)"
    return 0
  fi

  names=$(convex_cli env list --names-only 2>/dev/null) || names=
  printf '   env vars on the backend: %s\n' "$(printf '%s' "$names" | tr '\n' ' ')"
  for n in "${REQUIRED_ENV_NAMES[@]}"; do
    grep -qx "$n" <<<"$names" || missing="$missing $n"
  done
  if [[ $FILE_ALLOW_OPEN != 1 ]]; then
    grep -qx INVITE_ONLY_SIGNUPS <<<"$names" || missing="$missing INVITE_ONLY_SIGNUPS"
  fi
  if [[ -z $missing ]]; then
    record PASS "env vars present" "required names all set"
  else
    record FAIL "env vars present" "missing:$missing"
  fi

  TMP_BODY=$(mktemp)
  code=$(http_code "$SITE_URL_PUBLIC/.well-known/jwks.json" "$TMP_BODY")
  if [[ $code == 200 ]] && grep -q '"keys"' "$TMP_BODY"; then
    record PASS "GET /.well-known/jwks.json" "HTTP 200 with keys"
  elif [[ $code == 200 ]]; then
    record FAIL "GET /.well-known/jwks.json" "HTTP 200 but no \"keys\" in the body (proxy page? JWKS not set?)"
  else
    record FAIL "GET /.well-known/jwks.json" "HTTP $code (want 200)"
  fi
  code=$(http_code "$SITE_URL_PUBLIC/does-not-exist" "$TMP_BODY")
  case $code in
    404) record PASS "GET /does-not-exist" "HTTP 404" ;;
    500) record FAIL "GET /does-not-exist" "HTTP 500: the HTTP router is dead (functions not pushed, or a broken http.ts)" ;;
    *)   record FAIL "GET /does-not-exist" "HTTP $code (want 404)" ;;
  esac

  if out=$(convex_cli run users:authProviders '{}' 2>&1); then
    record PASS "convex run users:authProviders" "$(printf '%s' "$out" | tr '\n' ' ' | tr -s ' ')"
  else
    record FAIL "convex run users:authProviders" "$(printf '%s' "$out" | tail -n 1)"
  fi

  printf '\n   %-4s  %-40s  %s\n' RESULT CHECK DETAIL
  printf '%s' "$RESULTS"
}

closing_checklist() {
  cat <<EOF

Next, by hand:
  [ ] sign in at $EXPECTED_SITE_URL as an EXISTING user (proves JWT keys and users came back)
  [ ] upload one image in the app; the MinIO console (host port 9001) shows a new object
      under kinolab-files/<instance>-<uuid>/ — and kinolab-snapshot-imports holds the zip
      you just imported. Neither happens on --local-storage.
  [ ] the backup service wrote a zip WITH stored files (once something was uploaded):
        unzip -l "\$(ls -t /var/backups/kinolab/kinolab-*.zip | head -1)" | grep '_storage/' | grep -v documents.jsonl
  [ ] Google Drive was connected before? reconnect it (refresh tokens in the snapshot may be revoked)
EOF
}

# --- main ------------------------------------------------------------------

parse_args() {
  local arg
  for arg in "$@"; do
    case $arg in
      --dry-run)            DRY_RUN=1 ;;
      -y|--yes)             ASSUME_YES=1 ;;
      --overwrite-existing) OVERWRITE_EXISTING=1 ;;
      -h|--help)            usage; exit 0 ;;
      -*)                   usage >&2; die "unknown option: $arg" ;;
      *)
        if [[ -z $ZIP ]]; then ZIP=$arg
        elif [[ -z $ENV_BACKUP ]]; then ENV_BACKUP=$arg
        else usage >&2; die "unexpected extra argument: $arg"
        fi ;;
    esac
  done
  [[ -n $ZIP && -n $ENV_BACKUP ]] || { usage >&2; die "need <export.zip> and <env-dump.env>"; }
}

main() {
  parse_args "$@"
  ZIP=$(abspath "$ZIP")
  ENV_BACKUP=$(abspath "$ENV_BACKUP")
  load_pilot_credentials
  resolve_site_url_public
  # The CLI must run where package.json lists convex; every path is absolute
  # by now, so the caller's cwd no longer matters.
  cd "$REPO_ROOT" || die "cannot cd to $REPO_ROOT"

  if [[ $DRY_RUN -eq 1 ]]; then
    printf '%s: DRY RUN. Nothing is changed; no network calls.\n\n' "$SCRIPT_NAME"
  fi
  printf 'Repo root:          %s\n' "$REPO_ROOT"
  printf 'Credentials:        %s (admin key loaded, not shown)\n' "$PILOT_ENV_FILE_RESOLVED"
  printf 'Backend:            %s\n' "$CONVEX_SELF_HOSTED_URL"
  printf 'HTTP actions:       %s\n' "$SITE_URL_PUBLIC"
  printf 'Expected instance:  %s\n' "$EXPECTED_INSTANCE_NAME"
  printf 'Export zip:         %s\n' "$ZIP"
  printf 'Env dump:           %s\n' "$ENV_BACKUP"
  [[ $OVERWRITE_EXISTING -eq 0 ]] || printf 'Mode:               --overwrite-existing (a non-fresh backend is accepted)\n'

  step_preflight
  step_import
  step_env
  step_push
  step_verify
  closing_checklist

  if [[ $DRY_RUN -eq 1 ]]; then
    if [[ $PROBLEMS -gt 0 ]]; then
      printf '\nDRY RUN: %d problem(s) with the inputs; fix them before a real run.\n' "$PROBLEMS"
      exit 1
    fi
    printf '\nDRY RUN OK: inputs look usable. Re-run without --dry-run to rebuild.\n'
    exit 0
  fi
  if [[ $FAILED -gt 0 ]]; then
    printf '\nFAIL: %d verification check(s) failed.\n' "$FAILED"
    exit 1
  fi
  printf '\nPASS: rebuild complete.\n'
}

main "$@"
