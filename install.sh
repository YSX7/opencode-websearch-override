#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/YOUR-USERNAME/opencode-websearch-override.git"
NO_AUTO_UPDATE=0
TARGET_DIR=""

usage() {
  cat <<EOF
Usage: install.sh [--repo-url URL] [--no-autoupdate] [--target-dir DIR]

  --repo-url URL       Source repository (default baked into script)
  --no-autoupdate      Do not install the auto-update plugin (and remove it if present)
  --target-dir DIR     Override the opencode config directory (for testing)
  -h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-url) REPO_URL="$2"; shift 2 ;;
    --no-autoupdate) NO_AUTO_UPDATE=1; shift ;;
    --target-dir) TARGET_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OC_DIR="${TARGET_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"

echo "== opencode-websearch-override installer =="
echo "Target: $OC_DIR"

if [[ -f "$SCRIPT_DIR/tools/websearch.ts" ]]; then
  echo "[1/5] Source: local copy at $SCRIPT_DIR"
else
  if [[ "$REPO_URL" == *"YOUR-USERNAME"* ]]; then
    echo "ERROR: RepoUrl is not set. Run from a clone of the repo, pass --repo-url, or edit REPO_URL in this script." >&2
    exit 1
  fi
  mkdir -p "$OC_DIR"
  REPO_DIR="$OC_DIR/websearch-override"
  if [[ -d "$REPO_DIR/.git" ]]; then
    echo "[1/5] Updating existing clone at $REPO_DIR"
    git -C "$REPO_DIR" pull --ff-only --quiet
  else
    echo "[1/5] Cloning $REPO_URL -> $REPO_DIR"
    git clone --depth 1 --quiet "$REPO_URL" "$REPO_DIR"
  fi
  SCRIPT_DIR="$REPO_DIR"
fi

SRC_TOOLS="$SCRIPT_DIR/tools/websearch.ts"
SRC_PLUGIN="$SCRIPT_DIR/plugins/websearch-autoupdate.ts"
SRC_POLICY="$SCRIPT_DIR/AGENTS-policy.md"
[[ -f "$SRC_TOOLS" ]] || { echo "ERROR: tool file not found at $SRC_TOOLS" >&2; exit 1; }

mkdir -p "$OC_DIR/tools"
cp "$SRC_TOOLS" "$OC_DIR/tools/websearch.ts"
echo "[2/5] Installed tool -> tools/websearch.ts"

AGENTS_PATH="$OC_DIR/AGENTS.md"

if [[ ! -f "$AGENTS_PATH" ]]; then
  printf '# Global agent rules\n\n%s\n\n%s\n' "<!-- opencode-websearch-override:start -->" "" > "$AGENTS_PATH"
  cat "$SRC_POLICY" >> "$AGENTS_PATH"
  printf '\n<!-- opencode-websearch-override:end -->\n' >> "$AGENTS_PATH"
  echo "[3/5] Created AGENTS.md with search policy"
elif ! grep -q "opencode-websearch-override:start" "$AGENTS_PATH"; then
  {
    echo ""
    echo "<!-- opencode-websearch-override:start -->"
    echo ""
    sed 's/[[:space:]]*$//' "$SRC_POLICY"
    echo ""
    echo "<!-- opencode-websearch-override:end -->"
  } >> "$AGENTS_PATH"
  echo "[3/5] Appended search policy to existing AGENTS.md"
else
  echo "[3/5] AGENTS.md already contains policy block, skipping"
fi

KEYS_PATH="$OC_DIR/websearch.json"
EXAMPLE_PATH="$SCRIPT_DIR/websearch.example.json"
if [[ -f "$KEYS_PATH" ]]; then
  echo "[4/5] websearch.json exists, left untouched"
elif [[ -f "$EXAMPLE_PATH" ]]; then
  cp "$EXAMPLE_PATH" "$KEYS_PATH"
  echo "[4/5] Seeded websearch.json from template - EDIT IT to add your API keys"
else
  printf '{\n  "serper": "",\n  "tavily": ""\n}\n' > "$KEYS_PATH"
  echo "[4/5] Created empty websearch.json - EDIT IT to add your API keys"
fi

PLUGIN_DST="$OC_DIR/plugins/websearch-autoupdate.ts"
mkdir -p "$OC_DIR/plugins"
if [[ "$NO_AUTO_UPDATE" -eq 1 ]]; then
  rm -f "$PLUGIN_DST"
  echo "[5/5] Auto-update disabled by switch (plugin removed if present)"
else
  cp "$SRC_PLUGIN" "$PLUGIN_DST"
  echo "[5/5] Installed auto-update plugin (checks GitHub every 6h; remove plugins/websearch-autoupdate.ts to disable)"
fi

echo ""
echo "Done. Next steps:"
echo "  1. Edit $KEYS_PATH and paste your serper / tavily API keys (empty = tier disabled)"
echo "  2. Restart opencode"
echo "  3. Ask your agent to search something"
