#!/usr/bin/env bash
#
# Dumps the pilot backend's deployment env vars (`npx convex env list`) to a
# file that belongs in the password manager.
#
# Why: a snapshot export (`npx convex export`) NEVER contains env vars or the
# deployed code. A backend rebuilt from a zip alone has no JWT_PRIVATE_KEY /
# JWKS / SITE_URL / ADMIN_SIGNUP_ALLOWLIST, so nobody can sign in. This file
# is the other half of a restore; scripts/pilot-rebuild.sh replays it with
# `convex env set --from-file`.
#
# Usage: scripts/pilot-env-backup.sh [out-file]
#   out-file  defaults to $HOME/pilot-env-<UTC timestamp>.env — OUTSIDE the
#             repo on purpose — created mode 600. Refuses to overwrite an
#             existing file. (`pilot-env-*.env` is also gitignored, as a
#             backstop for an explicit path inside the checkout.)
#
# Format: `env list` writes a DOTENV file, not raw NAME=value — a value
# containing '#', a newline or surrounding quotes comes quoted/escaped. Do
# not hand-edit values; the rebuild feeds the file to the CLI's own parser.
#
# Runs from any directory: the repo's own CLI (node_modules/.bin/convex,
# `pnpm install` first) is executed from the repo root.
#
# Credentials: ${PILOT_ENV_FILE:-.env.pilot.local}, relative to the repo root
# (the parent of this script's directory). The file is PARSED, not sourced:
# the admin key looks like 'kinolab|<hex>' and an unquoted '|' would be a
# pipe to the shell. CONVEX_DEPLOYMENT is exported empty so the CLI cannot
# pick up the local dev deployment from .env.local next to a self-hosted URL
# (the CLI crashes when both are set; dotenv never overrides an exported var).
#
# The admin key is never printed. The dump IS secret (it holds the JWT
# private key): keep it out of the repo and out of chat.
set -euo pipefail

SCRIPT_NAME=pilot-env-backup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONVEX_BIN="$REPO_ROOT/node_modules/.bin/convex"

# Names the app reads on the pilot (README §Deploying, convex/auth.ts).
# Missing ones are only reported: this script records what IS there.
EXPECTED_ENV_NAMES=(JWT_PRIVATE_KEY JWKS SITE_URL ADMIN_SIGNUP_ALLOWLIST
  INVITE_ONLY_SIGNUPS NEXT_PUBLIC_GOOGLE_API_KEY NEXT_PUBLIC_GOOGLE_APP_ID)

die() { printf '%s: ERROR: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage: scripts/pilot-env-backup.sh [out-file]

Writes `npx convex env list` of the pilot backend to out-file (default
$HOME/pilot-env-<UTC timestamp>.env, mode 600) and prints the variable NAMES.
Credentials: ${PILOT_ENV_FILE:-.env.pilot.local} in the repo root.
USAGE
}

abspath() {
  case $1 in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$PWD" "$1" ;; esac
}

# --- credentials -----------------------------------------------------------
# Duplicated in scripts/pilot-rebuild.sh on purpose: two self-contained
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
# CLI, blanks CONVEX_DEPLOYMENT, sets PILOT_ENV_FILE_RESOLVED.
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

# Say so when an explicit out-file lands inside the repo un-ignored, so it
# cannot slip into a commit.
warn_if_in_repo() {
  local abs=$1
  case $abs in "$REPO_ROOT"/*) ;; *) return 0 ;; esac
  command -v git >/dev/null 2>&1 || return 0
  if ! git -C "$REPO_ROOT" check-ignore -q -- "$abs" 2>/dev/null; then
    printf '\nWARNING: %s is inside the repo and NOT gitignored. Move it out before any git add.\n' "$abs"
  fi
}

main() {
  local out count name names missing= ts
  case ${1:-} in -h|--help) usage; exit 0 ;; esac
  [[ $# -le 1 ]] || { usage >&2; die "expected at most one argument"; }
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  out=${1:-$HOME/pilot-env-$ts.env}
  out=$(abspath "$out")
  [[ ! -e $out ]] || die "refusing to overwrite existing file: $out"
  [[ -x $CONVEX_BIN ]] || die "$CONVEX_BIN not found: run 'pnpm install' in $REPO_ROOT"
  load_pilot_credentials
  cd "$REPO_ROOT" || die "cannot cd to $REPO_ROOT"

  printf 'Backend:     %s\n' "$CONVEX_SELF_HOSTED_URL"
  printf 'Credentials: %s (admin key loaded, not shown)\n' "$PILOT_ENV_FILE_RESOLVED"
  printf 'Output:      %s\n\n' "$out"

  # Create the file empty under umask 077 so it is never readable by others,
  # not even between creation and chmod.
  ( umask 077; : > "$out" ) || die "cannot create $out"
  chmod 600 "$out"
  # The CLI's own messages go to stderr; stdout is the dotenv content only.
  if ! "$CONVEX_BIN" env list > "$out"; then
    rm -f "$out"
    die "'convex env list' failed against $CONVEX_SELF_HOSTED_URL; nothing written"
  fi
  # Names from the CLI (not parsed out of the dump: a multi-line value would
  # otherwise be mistaken for names and echoed to the terminal).
  names=$("$CONVEX_BIN" env list --names-only 2>/dev/null) || names=
  count=$(printf '%s\n' "$names" | grep -c -E '^[A-Za-z_][A-Za-z0-9_]*$' || true)
  if [[ ${count:-0} -eq 0 || ! -s $out ]]; then
    rm -f "$out"
    die "env list returned no variables (fresh backend, or wrong URL/admin key?); nothing written"
  fi

  printf 'Wrote %s variable(s) to %s (mode 600):\n' "$count" "$out"
  printf '%s\n' "$names" | sed 's/^/  /'

  for name in "${EXPECTED_ENV_NAMES[@]}"; do
    grep -qx "$name" <<<"$names" || missing="$missing $name"
  done
  if [[ -n $missing ]]; then
    printf '\nNOTE: expected on the pilot but not set right now:%s\n' "$missing"
    printf '      (pilot-rebuild.sh forces INVITE_ONLY_SIGNUPS=1; anything else must be set by hand)\n'
  fi

  warn_if_in_repo "$out"

  cat <<EOF

Store this file in the password manager NOW, then delete the local copy:
  $out
(e.g. an entry "Kinolab pilot - Convex env vars" with the file attached).
Snapshot exports never contain env vars; scripts/pilot-rebuild.sh needs it.
EOF
}

main "$@"
