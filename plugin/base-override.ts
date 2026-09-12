import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const MARK = "[[OC_BASE_OVERRIDE]]";
const PARAMS = "[[OC_PARAMS]]";
const BASH_TIMEOUT_MAX = 600000;

type ParsedParams = { temperature?: number; topP?: number; bashTimeout?: number; reasoning?: string };

const bashTimeoutBySession = new Map<string, number>();

function secretsCandidates(): string[] {
  const list = [join(homedir(), ".config", "opencode-chat", "secrets.json")];
  const legacy = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (legacy) list.push(join(legacy, "opencode-chat", "secrets.json"));
  return list;
}

function readSecrets(): Record<string, unknown> {
  for (const file of secretsCandidates()) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      if (data && typeof data === "object") return data;
    } catch {
      /* try next candidate */
    }
  }
  return {};
}

function dpapiDecrypt(b64: string): string {
  try {
    const ps = "Add-Type -AssemblyName System.Security;" +
      "$b=[Convert]::FromBase64String($env:OC_ENC);" +
      "$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);" +
      "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))";
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      env: { ...process.env, OC_ENC: b64 },
      encoding: "utf8",
      windowsHide: true,
    });
    if (r.status !== 0 || r.error) return "";
    return String(r.stdout || "").trim();
  } catch {
    return "";
  }
}

function parseParams(system: unknown): ParsedParams | null {
  if (typeof system !== "string") return null;
  const i = system.indexOf(PARAMS);
  if (i < 0) return null;
  let line = system.slice(i + PARAMS.length);
  const nl = line.search(/[\r\n]/);
  if (nl >= 0) line = line.slice(0, nl);
  try {
    const obj = JSON.parse(line);
    if (!obj || typeof obj !== "object") return null;
    const out: ParsedParams = {};
    if (typeof obj.temperature === "number" && isFinite(obj.temperature)) out.temperature = obj.temperature;
    if (typeof obj.topP === "number" && isFinite(obj.topP)) out.topP = obj.topP;
    if (typeof obj.bashTimeout === "number" && isFinite(obj.bashTimeout) && obj.bashTimeout >= 0) out.bashTimeout = obj.bashTimeout;
    if (typeof obj.reasoning === "string" && obj.reasoning) out.reasoning = obj.reasoning;
    if (Object.keys(out).length === 0) return null;
    return out;
  } catch {
    return null;
  }
}

function stripParams(s: string): string {
  return s
    .replace(/\[\[OC_PARAMS\]\][^\r\n]*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default async () => ({
  config: async (config: { provider?: Record<string, any> }) => {
    try {
      const secrets = readSecrets();
      for (const provider of Object.keys(secrets)) {
        const raw = secrets[provider];
        let enc = "";
        let baseURL = "";
        let modelsList: string[] = [];
        if (typeof raw === "string") {
          enc = raw;
        } else if (raw && typeof raw === "object") {
          const obj = raw as { key?: unknown; baseURL?: unknown; models?: unknown };
          if (typeof obj.key === "string") enc = obj.key;
          if (typeof obj.baseURL === "string") baseURL = obj.baseURL;
          if (Array.isArray(obj.models)) {
            modelsList = obj.models.filter((x): x is string => typeof x === "string" && x.length > 0);
          }
        }
        const key = enc ? dpapiDecrypt(enc) : "";
        if (!key && !baseURL && !modelsList.length) continue;
        config.provider = config.provider || {};
        const p = (config.provider[provider] = config.provider[provider] || {});
        const options: Record<string, any> = Object.assign({}, p.options);
        if (key) options.apiKey = key;
        if (baseURL) options.baseURL = baseURL;
        p.options = options;
        if (modelsList.length) {
          const pm: Record<string, any> = Object.assign({}, p.models);
          for (const mid of modelsList) {
            if (!pm[mid]) pm[mid] = { name: mid };
          }
          p.models = pm;
        }
      }
    } catch {
      /* ignore: fall back to opencode's own auth */
    }
  },
  "experimental.chat.system.transform": async (
    _input: { sessionID?: string; model: unknown },
    output: { system: string[] },
  ) => {
    const sys = output.system;
    if (!Array.isArray(sys)) return;
    for (const s of sys) {
      if (typeof s === "string" && s.includes(MARK)) {
        const trimmed = stripParams(s.slice(s.indexOf(MARK) + MARK.length).trim());
        sys.length = 0;
        sys.push(trimmed);
        return;
      }
    }
    for (let i = 0; i < sys.length; i++) {
      const s = sys[i];
      if (typeof s === "string" && s.includes(PARAMS)) sys[i] = stripParams(s);
    }
  },
  "chat.params": async (
    input: {
      sessionID?: string;
      message?: { system?: string };
      model?: { providerID?: string; capabilities?: { temperature?: boolean }; api?: { npm?: string } };
    },
    output: { temperature: number; topP: number; options?: Record<string, any> },
  ) => {
    const p = parseParams(input && input.message && input.message.system);
    const sid = input && input.sessionID;
    if (sid && p && p.bashTimeout !== undefined) {
      if (p.bashTimeout > 0) bashTimeoutBySession.set(sid, p.bashTimeout);
      else bashTimeoutBySession.delete(sid);
    }
    if (!p) return;
    if (p.reasoning === "none" && output.options && typeof output.options === "object") {
      const npm = input.model && input.model.api && input.model.api.npm;
      const pid = String((input.model && input.model.providerID) || "");
      if (npm === "@ai-sdk/openai-compatible" || pid.includes("deepseek")) {
        // DeepSeek 等 OpenAI 兼容端点：思考开关为 thinking:{type:"disabled"}
        output.options.thinking = { type: "disabled" };
      } else {
        output.options.reasoningEffort = "none";
      }
    }
    const supports = !input.model || !input.model.capabilities || input.model.capabilities.temperature !== false;
    if (!supports) return;
    if (p.temperature !== undefined) output.temperature = p.temperature;
    if (p.topP !== undefined) output.topP = p.topP;
  },
  "tool.execute.before": async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: any },
  ) => {
    if (input.tool !== "bash") return;
    const args = output.args;
    if (!args || typeof args !== "object") return;
    const cur = args.timeout;
    if (typeof cur === "number" && isFinite(cur) && cur > 0) {
      if (cur > BASH_TIMEOUT_MAX) args.timeout = BASH_TIMEOUT_MAX;
      return;
    }
    const fallback = bashTimeoutBySession.get(input.sessionID);
    if (fallback) args.timeout = Math.min(fallback, BASH_TIMEOUT_MAX);
  },
});
