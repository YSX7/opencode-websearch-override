# opencode-websearch-override

A drop-in replacement for [opencode](https://opencode.ai)'s built-in `websearch`
tool, for networks where the native backend (hosted search service) is
geo-blocked or unreachable.

The custom tool is named exactly `websearch`, so it **shadows the built-in
tool** — every existing instruction or habit ("use websearch") keeps working,
just against backends that actually answer on your network.

## How it works

Multi-backend chain with automatic silent fallback:

| Tier | Backend | Key needed | Geo-gated |
|---|---|---|---|
| 1 | **Serper** (Google SERP) | free key, ~2500 queries | no |
| 2 | **Tavily** REST | free key (~1000/mo) | yes¹ |
| 3 | **Bing RSS** (`/search?format=rss`) | none | no |
| 4 | **DuckDuckGo lite** scrape | none | yes¹ |

¹ Geo-gated backends are skipped automatically when your network exit is in a
blocked country (checked via Cloudflare `cdn-cgi/trace`, result cached 10 min).
Turn on your geo-hiding VPN and they start working again on the next cache
refresh — zero config changes needed.

If every stage fails, the tool returns a hint to use plain `webfetch` on a Bing
results URL as the last resort.

Keys are resolved per search: environment variable (`SERPER_API_KEY`,
`TAVILY_API_KEY`) first, then `~/.config/opencode/websearch.json`. Empty key =
tier disabled. Missing file / bad JSON degrades gracefully to the keyless
tiers.

## Install

Prerequisites: [opencode](https://opencode.ai) and git. Platform-specific
steps below; see *Manual install* for anything else.

### One command

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/YSX7/opencode-websearch-override/main/install.ps1 | iex
```

> Before publishing your fork, set the `$RepoUrl` default at the top of
> `install.ps1` to your actual repo URL so this one-liner works.

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/YSX7/opencode-websearch-override/main/install.sh | bash
```

With options:

```bash
curl -fsSL <raw-url>/install.sh | bash -s -- --no-autoupdate --repo-url https://github.com/you/opencode-websearch-override.git
```

> Same as above: set the `REPO_URL` default at the top of `install.sh` to your
> repo URL before publishing so the bare one-liner works.

Or from a local clone:

```bash
git clone https://github.com/YSX7/opencode-websearch-override.git
cd opencode-websearch-override
.\install.ps1            # Windows (add -NoAutoUpdate to skip the auto-update plugin)
./install.sh             # Linux / macOS (add --no-autoupdate)
```

The installer:

1. Clones/pulls itself into `~/.config/opencode/websearch-override/`
2. Installs the tool to `~/.config/opencode/tools/websearch.ts`
3. Merges the agent policy into `~/.config/opencode/AGENTS.md`
   (marker-guarded, idempotent)
4. Creates `~/.config/opencode/websearch.json` from the template **only if it
   doesn't already exist**
5. Installs the auto-update plugin (unless `-NoAutoUpdate`)

Then finish manually:

```powershell
notepad "$env:USERPROFILE\.config\opencode\websearch.json"
# paste your serper / tavily keys, keep "" to disable a tier
```

Restart opencode and ask your agent to search something.

### API keys

- Serper: sign up at <https://serper.dev> (free ~2500 queries, no card)
- Tavily: sign up at <https://tavily.com> (free ~1000 credits/mo)

Both are optional — with no keys at all you still get Bing RSS + DDG lite.

## Auto-update

The installed plugin (`plugins/websearch-autoupdate.ts` inside your opencode
config) checks this GitHub repo at most once every 6 hours on opencode startup.
If `main` moved, it pulls and refreshes the tool file. Your `websearch.json`
lives outside the repo directory and is never touched by updates.

Disable by deleting `~/.config/opencode/plugins/websearch-autoupdate.ts` or
installing with `-NoAutoUpdate`.

Manual update any time: re-run `install.ps1`.

## Manual install (any platform)

Copy three things into opencode's global config dir
(`%USERPROFILE%\.config\opencode` on Windows, `~/.config/opencode` on Linux/macOS,
respecting `XDG_CONFIG_HOME`):

1. `tools/websearch.ts` ← `tools/websearch.ts`
2. `websearch.json` ← edit from `websearch.example.json`
3. Content of `AGENTS-policy.md` → append to your `AGENTS.md`

## Uninstall

Delete `tools/websearch.ts`, `plugins/websearch-autoupdate.ts`,
`websearch-override/`, the marker-guarded block in `AGENTS.md`, and optionally
`websearch.json`. The native `websearch` tool comes back automatically.

## Linux notes

- Config dir follows XDG: `${XDG_CONFIG_HOME:-~/.config}/opencode` — same
  layout opencode uses natively on Linux.
- The tool and auto-update plugin are pure TypeScript running inside
  opencode's bundled Bun runtime; nothing platform-specific beyond the
  installer scripts.
- `install.sh` needs only bash + git + coreutils (present by default on Mint).

## Caveats

- The Bing RSS endpoint is undocumented; if Microsoft ever breaks it, the tool
  falls through to DDG lite and an update fixing it will follow.
- Scraping-based tiers (Bing RSS, DDG lite) depend on IP reputation — expect
  occasional CAPTCHAs on flagged/datacenter exits; that's what the fallback
  chain is for.
- Auto-update executes code pulled from this repo's `main` branch with your
  user privileges. Don't enable it if you didn't author/trust the repo.

## Alternatives

- [`sweetcornna/free-search-mcp`](https://github.com/sweetcornna/free-search-mcp)
  — heavier Python MCP with more engines (Mojeek, Startpage, Baidu), keyed
  tiers, per-engine proxy scoping.
- [`mrkrsl/web-search-mcp`](https://github.com/mrkrsl/web-search-mcp) —
  keyless Bing > Brave > DuckDuckGo via npx, Playwright fallback.
