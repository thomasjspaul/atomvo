#!/usr/bin/env bash
# Runs once when a codespace (or dev container) is created.
# Writes the git-ignored config files from Codespaces secrets, falling back to the
# example files, then installs dependencies and prepares the local database.
# Existing files are never overwritten, so a rebuild keeps local edits.
set -euo pipefail

write_config() { # <file> <secret value> <example file>
  if [ -e "$1" ]; then
    echo "$1 exists, leaving it alone"
  elif [ -n "$2" ]; then
    printf '%s\n' "$2" > "$1"
    echo "$1 written from Codespaces secret"
  else
    cp "$3" "$1"
    echo "$1 copied from $3"
  fi
}

write_config wrangler.jsonc "${ATOMVO_WRANGLER_CONFIG:-}" wrangler.example.jsonc
write_config .dev.vars "${ATOMVO_DEV_VARS:-}" .dev.vars.example

npm ci
npm run db:migrate:local
