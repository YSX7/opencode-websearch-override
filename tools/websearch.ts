import { tool } from "@opencode-ai/plugin"
import os from "os"
import path from "path"
import fs from "fs"

type SearchResult = { title: string; url: string; snippet: string }

let keysCache: Record<string, string> | null = null

function loadKeys(): Record<string, string> {
  if (keysCache) return keysCache
  try {
    const raw = fs.readFileSync(
      path.join(os.homedir(), ".config", "opencode", "websearch.json"),
      "utf8",
    )
    const parsed = JSON.parse(raw)
    keysCache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {}
  keysCache ??= {}
  return keysCache
}

function resolveKey(fileKey: string, envVar: string): string {
  const env = process.env[envVar]
  if (env && env.trim()) return env.trim()
  return (loadKeys()[fileKey] ?? "").trim()
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
const GEO_CACHE_TTL_MS = 10 * 60 * 1000
const GEO_BLOCKED_COUNTRY = "RU"

let geoCache: { ok: boolean; ts: number } | null = null

async function geoUnblocked(): Promise<boolean> {
  if (geoCache && Date.now() - geoCache.ts < GEO_CACHE_TTL_MS) return geoCache.ok
  let ok = false
  try {
    const res = await fetch("https://1.1.1.1/cdn-cgi/trace", { signal: AbortSignal.timeout(5000) })
    const text = await res.text()
    const m = text.match(/^loc=(.+)$/m)
    ok = !!m && m[1].trim().toUpperCase() !== GEO_BLOCKED_COUNTRY
  } catch {}
  geoCache = { ok, ts: Date.now() }
  return ok
}

function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

async function serper(q: string, n: number, key: string): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q, num: n }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`serper HTTP ${res.status}`)
  const data: any = await res.json()
  return (data.organic ?? []).slice(0, n).map((r: any) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    snippet: r.snippet ?? "",
  }))
}

async function tavily(q: string, n: number, key: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, max_results: n }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`tavily HTTP ${res.status}`)
  const data: any = await res.json()
  return (data.results ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.content ?? "",
  }))
}

async function bingRss(q: string, n: number): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&count=${n}`
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`bing HTTP ${res.status}`)
  const xml = await res.text()
  const out: SearchResult[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1]
    const pick = (tag: string) => {
      const t = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))
      return t ? clean(t[1]) : ""
    }
    const title = pick("title")
    const link = pick("link")
    if (!link) continue
    out.push({ title, url: link, snippet: pick("description") })
  }
  return out.slice(0, n)
}

async function ddgLite(q: string, n: number): Promise<SearchResult[]> {
  const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`ddg HTTP ${res.status}`)
  const html = await res.text()
  if (/anomaly|challenge|captcha/i.test(html)) throw new Error("ddg bot-wall")
  const results: SearchResult[] = []
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1]
    if (!/class\s*=\s*['"]result-link['"]/i.test(attrs)) continue
    const h = attrs.match(/href\s*=\s*['"]([^'"]+)['"]/i)
    if (!h) continue
    let u = h[1]
    const ud = u.match(/[?&]uddg=([^&]+)/)
    if (ud) u = decodeURIComponent(ud[1])
    if (!/^https?:\/\//i.test(u)) continue
    results.push({ title: clean(m[2]), url: u, snippet: "" })
    if (results.length >= n) break
  }
  const snippets = [...html.matchAll(/class\s*=\s*['"]result-snippet['"][^>]*>([\s\S]*?)<\//gi)].map((s) =>
    clean(s[1]),
  )
  results.forEach((r, i) => {
    r.snippet = snippets[i] ?? ""
  })
  return results
}

export default tool({
  description:
    "Search the web for current information. Multi-backend chain with automatic fallback: Google (Serper), Tavily, Bing RSS, DuckDuckGo lite. Geo-restricted backends are skipped automatically when the current network exit is blocked. Returns compact title/URL/snippet results.",
  args: {
    query: tool.schema.string().describe("The search query"),
    count: tool.schema.number().optional().describe("Maximum number of results to return, 1-20 (default 8)"),
  },
  async execute(args) {
    const q = args.query.trim()
    if (!q) return "Empty query."
    const n = Math.min(Math.max(Math.trunc(args.count ?? 8), 1), 20)

    const serperKey = resolveKey("serper", "SERPER_API_KEY")
    const tavilyKey = resolveKey("tavily", "TAVILY_API_KEY")

    type Stage = { name: string; run: () => Promise<SearchResult[]> }
    const stages: Stage[] = []
    if (serperKey) stages.push({ name: "serper", run: () => serper(q, n, serperKey) })
    if (tavilyKey)
      stages.push({
        name: "tavily",
        run: async () => {
          if (!(await geoUnblocked())) throw new Error("geo-blocked exit")
          return tavily(q, n, tavilyKey)
        },
      })
    stages.push({ name: "bing", run: () => bingRss(q, n) })
    stages.push({
      name: "ddg-lite",
      run: async () => {
        if (!(await geoUnblocked())) throw new Error("geo-blocked exit")
        return ddgLite(q, n)
      },
    })

    for (const s of stages) {
      try {
        const results = await s.run()
        if (results.length === 0) continue
        const lines = results.map(
          (r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`,
        )
        return `Web search results for "${q}" (backend: ${s.name}):\n\n${lines.join("\n\n")}`
      } catch {}
    }
    return `All web search backends failed for "${q}". Manual fallback: use the webfetch tool on https://www.bing.com/search?q=${encodeURIComponent(q)} and read the results page directly.`
  },
})
