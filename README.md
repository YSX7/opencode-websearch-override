# opencode-websearch-override

A drop-in replacement for [opencode](https://opencode.ai)'s built-in `websearch`
tool, for networks where the native backend (hosted search service) is
geo-blocked or unreachable.

The custom tool is named exactly `websearch`, so it **shadows the built-in
tool** — every existing instruction or habit ("use websearch") keeps working,
just against backends that actually answer on your network.

## How it works

Multi-backend chain with automatic silent fallback:

| # | Backend | Key needed | Geo-gated |
|---|---|---|---|
| 1 | **Serper** (Google SERP) | free key, ~2500 queries | no |
| 2 | **Tavily** REST | free key (~1000/mo) | yes¹ |
| 3 | **SerpAPI** (Google SERP) | free key, 100/mo, no card | no |
| 4 | **Brave Search API** | free key ($5/mo credits ≈ 1000 q) | no |
| 5 | **Bing RSS** (`/search?format=rss`) | none | no |
| 6 | **AnySearch** unified REST | optional key; anonymous tier works | no |
| 7 | **DuckDuckGo lite** scrape | none | yes¹ |
| 8 | **Marginalia** API (`api2.marginalia-search.com`) | optional key; shared `public` key default | no |
| 9 | **SearXNG rescue** (pinned public instances) | none | no |

Failing backends are health-cached: after a failure a backend is skipped for
2 min, then 5 min, then 10 min (cap) on consecutive failures. A successful
call clears the entry instantly.

¹ Geo-gated backends are skipped automatically when your network exit is in a
blocked country (checked via Cloudflare `cdn-cgi/trace`, result cached 10 min).
Turn on your geo-hiding VPN and they start working again on the next cache
refresh — zero config changes needed.

If every stage fails, the tool returns a hint to use plain `webfetch` on a Bing
results URL as the last resort.

Keys are resolved per search: environment variable first (`SERPER_API_KEY`,
`TAVILY_API_KEY`, `SERPAPI_API_KEY`, `BRAVE_SEARCH_KEY`,
`ANYSEARCH_API_KEY`, `MARGINALIA_API_KEY`), then
`~/.config/opencode/websearch.json`. Empty key = keyed tier disabled (for
AnySearch and Marginalia that means falling back to their anonymous/shared
tiers). Missing file / bad JSON degrades gracefully to the keyless tiers.

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

Then finish manually — edit the keys file with any text editor:

```bash
# Linux / macOS
nano ~/.config/opencode/websearch.json
```

```powershell
# Windows
notepad "$env:USERPROFILE\.config\opencode\websearch.json"
```

Paste your serper / tavily keys, keep `""` to disable a tier.

Restart opencode and ask your agent to search something.

### API keys

All optional — with no keys at all you still get Bing RSS + AnySearch (anon) +
DDG lite + Marginalia (`public`) + SearXNG rescue:

- Serper: sign up at <https://serper.dev> (free ~2500 queries, no card)
- Tavily: sign up at <https://tavily.com> (free ~1000 credits/mo)
- SerpAPI: sign up at <https://serpapi.com> (free 100 searches/mo, no card;
  real Google results as a backup once the Serper quota runs out)
- Brave Search API: <https://brave.com/search/api/> ($5 free credits monthly
  ≈ 1000 searches; old fully-free plan was removed Feb 2026)
- AnySearch: anonymous tier works with no signup; a free key lifts rate limits
  (<https://anysearch.com/console/api-keys>)
- Marginalia: works on the shared `public` key; email
  contact@marginalia-search.com for a free non-commercial personal key

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

- Google's Custom Search JSON API was closed to new customers in 2026 (existing
  keys stop working Jan 1, 2027) — that's why this repo uses SerpAPI instead
  for its second real-Google source.
- Scraping-based tiers (Bing RSS, DDG lite, SearXNG rescue) depend on IP
  reputation and undocumented markup — expect occasional CAPTCHAs or breakage
  on flagged/datacenter exits; that's what the fallback chain and health cache
  are for.
- The pinned SearXNG instances (`opnxng.com`, `paulgo.io`, `searxng.site`)
  are public community servers and rate-limit aggressively; as last-chain
  rescue they may 429 under heavy use. Swap them in `SEARX_INSTANCES` inside
  `tools/websearch.ts` if they rot.
- Marginalia's shared `public` key has a global daily quota shared with every
  other consumer — a 429 there is normal; grab a free personal key to avoid it.
- Auto-update executes code pulled from this repo's `main` branch with your
  user privileges. Don't enable it if you didn't author/trust the repo.

## Alternatives

- [`sweetcornna/free-search-mcp`](https://github.com/sweetcornna/free-search-mcp)
  — heavier Python MCP with more engines (Mojeek, Startpage, Baidu), keyed
  tiers, per-engine proxy scoping.
- [`mrkrsl/web-search-mcp`](https://github.com/mrkrsl/web-search-mcp) —
  keyless Bing > Brave > DuckDuckGo via npx, Playwright fallback.
