# Web search policy (opencode-websearch-override)

The built-in `websearch` tool is overridden by a custom tool of the same name
(`~/.config/opencode/tools/websearch.ts`, installed by opencode-websearch-override).
It runs a multi-backend chain:
Serper (Google) -> Tavily -> SerpAPI -> Brave API -> Bing RSS -> AnySearch
-> DuckDuckGo lite -> Marginalia -> SearXNG rescue. Keyed backends activate
automatically when keys exist in `~/.config/opencode/websearch.json` (or env:
`SERPER_API_KEY`, `TAVILY_API_KEY`, `SERPAPI_API_KEY`, `BRAVE_SEARCH_KEY`,
`ANYSEARCH_API_KEY` optional, `MARGINALIA_API_KEY`
optional, default shared key `public`). Tavily and DDG are geo-gated: they
are skipped automatically when the network exit is in Russia (checked via
Cloudflare trace, cached 10 min). Failing backends are health-cached and
skipped with backoff (2/5/10 min). Backends are configured automatically;
no manual setup needed for searches.

For ANY web search:

1. **Always use the `websearch` tool first.** Do NOT probe search engines
   manually via bash.
2. If `websearch` reports that all backends failed, follow its manual-fallback
   hint: use `webfetch` on the Bing results URL it provides, then extract
   links from the page.
3. For retrieving a specific known URL, always prefer plain `webfetch`
   directly.
4. VPN note: when the user enables their geo-hiding VPN, the gated backends
   (Tavily, DDG) become available automatically on the next cache refresh;
   no config change is needed.

Known alternative if this tool ever needs replacing:
`sweetcornna/free-search-mcp` (Python/uv MCP, multi-engine + keyed tiers).

This block is kept in sync by the auto-update plugin: on a real upstream
update it replaces the content between the markers in place; if the markers
are missing or duplicated, this block is left untouched (deleting them opts
out of policy refresh).
