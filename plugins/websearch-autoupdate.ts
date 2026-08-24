import type { Plugin } from "@opencode-ai/plugin"
import { execFileSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const GIT_TIMEOUT_MS = 30000

const MARKER_START = "<!-- opencode-websearch-override:start -->"
const MARKER_END = "<!-- opencode-websearch-override:end -->"

const home = process.env.OCWS_FAKE_HOME || os.homedir()
const ocDir = path.join(home, ".config", "opencode")
const repoDir = path.join(ocDir, "websearch-override")
const stampFile = path.join(ocDir, ".websearch-autoupdate.json")
const toolSrc = path.join(repoDir, "tools", "websearch.ts")
const toolDst = path.join(ocDir, "tools", "websearch.ts")
const policySrc = path.join(repoDir, "AGENTS-policy.md")
const agentsPath = path.join(ocDir, "AGENTS.md")
const pluginSrc = path.join(repoDir, "plugins", "websearch-autoupdate.ts")
const pluginDst = path.join(ocDir, "plugins", "websearch-autoupdate.ts")

function shouldCheck(): boolean {
  try {
    const s = JSON.parse(fs.readFileSync(stampFile, "utf8"))
    if (Date.now() - (s.lastCheck ?? 0) < CHECK_INTERVAL_MS) return false
  } catch {}
  return true
}

function touchStamp(): void {
  try {
    fs.writeFileSync(stampFile, JSON.stringify({ lastCheck: Date.now() }))
  } catch {}
}

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
}

function syncPolicy(): void {
  if (!fs.existsSync(policySrc) || !fs.existsSync(agentsPath)) return
  const policy = fs.readFileSync(policySrc, "utf8").trim()
  const agents = fs.readFileSync(agentsPath, "utf8")
  const startIdx = agents.indexOf(MARKER_START)
  const endIdx = agents.indexOf(MARKER_END)
  if (startIdx === -1 || endIdx === -1) return
  if (agents.indexOf(MARKER_START, startIdx + 1) !== -1) return
  if (agents.indexOf(MARKER_END, endIdx + 1) !== -1) return
  if (endIdx < startIdx + MARKER_START.length) return
  const updated =
    agents.slice(0, startIdx + MARKER_START.length) +
    "\n\n" +
    policy +
    "\n\n" +
    agents.slice(endIdx)
  if (updated === agents) return
  fs.writeFileSync(agentsPath, updated)
}

function selfUpdate(): void {
  if (!fs.existsSync(pluginSrc)) return
  const tmp = pluginDst + ".tmp"
  try {
    fs.mkdirSync(path.dirname(pluginDst), { recursive: true })
    fs.copyFileSync(pluginSrc, tmp)
    fs.renameSync(tmp, pluginDst)
  } catch {
    try {
      fs.unlinkSync(tmp)
    } catch {}
  }
}

async function checkForUpdate(): Promise<void> {
  if (!shouldCheck()) return
  touchStamp()
  if (!fs.existsSync(path.join(repoDir, ".git"))) return
  git(["fetch", "origin", "--quiet"])
  const local = git(["rev-parse", "HEAD"])
  const remote = git(["rev-parse", "@{u}"])
  if (local === remote) return
  git(["pull", "--ff-only", "--quiet"])
  try {
    if (fs.existsSync(toolSrc)) {
      fs.mkdirSync(path.dirname(toolDst), { recursive: true })
      fs.copyFileSync(toolSrc, toolDst)
    }
  } catch {}
  try {
    syncPolicy()
  } catch {}
  try {
    selfUpdate()
  } catch {}
}

export async function runUpdateCheck(): Promise<void> {
  await checkForUpdate()
}

const timer = setTimeout(() => {
  checkForUpdate().catch(() => {})
}, 5000)
if (typeof timer.unref === "function") timer.unref()

export default (async () => ({})) satisfies Plugin
