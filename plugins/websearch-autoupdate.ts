import type { Plugin } from "@opencode-ai/plugin"
import { execFileSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const GIT_TIMEOUT_MS = 30000

const home = process.env.OCWS_FAKE_HOME || os.homedir()
const ocDir = path.join(home, ".config", "opencode")
const repoDir = path.join(ocDir, "websearch-override")
const stampFile = path.join(ocDir, ".websearch-autoupdate.json")
const toolSrc = path.join(repoDir, "tools", "websearch.ts")
const toolDst = path.join(ocDir, "tools", "websearch.ts")

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

async function checkForUpdate(): Promise<void> {
  if (!shouldCheck()) return
  touchStamp()
  if (!fs.existsSync(path.join(repoDir, ".git"))) return
  git(["fetch", "origin", "--quiet"])
  const local = git(["rev-parse", "HEAD"])
  const remote = git(["rev-parse", "@{u}"])
  if (local === remote) return
  git(["pull", "--ff-only", "--quiet"])
  if (fs.existsSync(toolSrc)) {
    fs.mkdirSync(path.dirname(toolDst), { recursive: true })
    fs.copyFileSync(toolSrc, toolDst)
  }
}

const timer = setTimeout(() => {
  checkForUpdate().catch(() => {})
}, 5000)
if (typeof timer.unref === "function") timer.unref()

export default (async () => ({})) satisfies Plugin
