# Web search policy

Web search is already wired to a self-configuring multi-backend chain with
automatic key detection, geo-gating and failover. There is nothing to select,
configure, or troubleshoot — just search.

1. Use the `websearch` tool for any web search. Never probe search engines
   manually through the shell.
2. If it returns an "all backends failed" notice, `webfetch` the Bing results
   URL it hands you and read the links off that page.
3. For a URL you already know, use `webfetch` directly. No search needed.
