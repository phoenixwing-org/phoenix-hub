import { StringDecoder } from "node:string_decoder";
import type { EndpointStatus, ServiceEndpointDefinition } from "../shared/contracts.js";

export async function pnhResolveLogEndpoints(
  configured: readonly EndpointStatus[], candidates: readonly ServiceEndpointDefinition[],
  ownedPids: ReadonlySet<number>, lookup: (port: number) => Promise<readonly number[]>,
  probe: (endpoint: ServiceEndpointDefinition) => Promise<EndpointStatus>,
): Promise<EndpointStatus[]> {
  let endpoints = [...configured];
  for (const candidate of candidates) {
    const owners = await lookup(candidate.port);
    if (!owners.length || owners.some(pid => !ownedPids.has(pid))) continue;
    const observed = await probe(candidate);
    if (!observed.reachable || !observed.pids.length || observed.pids.some(pid => !ownedPids.has(pid))) continue;
    endpoints = [...endpoints.filter(endpoint => endpoint.port !== candidate.port && endpoint.id !== candidate.id), observed];
  }
  return endpoints.sort((a, b) => Number(b.id === "web") - Number(a.id === "web"));
}

/** Per-launch hints only. A hint is never trusted without process ownership checks. */
export class PnhLogEndpointTracker {
  readonly #candidates = new Map<string, ServiceEndpointDefinition>();
  readonly #decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  readonly #partial = { stdout: "", stderr: "" };

  appendChunk(stream: "stdout" | "stderr", chunk: Buffer): void {
    const lines = (this.#partial[stream] + this.#decoders[stream].write(chunk)).split(/\r?\n|\r/u);
    this.#partial[stream] = (lines.pop() ?? "").slice(-8192);
    for (const line of lines) this.#inspect(line);
    // Some servers print their startup URL without a final newline.
    if (/\s$/u.test(this.#partial[stream])) this.#inspect(this.#partial[stream]);
  }

  candidates(): readonly ServiceEndpointDefinition[] { return [...this.#candidates.values()]; }

  #inspect(raw: string): void {
    const line = raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, "");
    if (!/(?:\bLocal\s*:|\blistening\b|\brunning\b|\bstarted\b|已启动|监听|服务地址)/iu.test(line)) return;
    for (const match of line.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[::\]):(\d{1,5})(?=[/\s]|$)/giu)) {
      const port = Number(match[1]);
      if (port < 1 || port > 65535) continue;
      const id = /\[(?:server|api|backend)\]|\bAPI\b/iu.test(line) ? "api" : "web";
      const protocol = match[0].toLowerCase().startsWith("https:") ? "https" : "http";
      // Never carry paths, query strings, credentials or remote hosts from logs.
      const openUrl = `${protocol}://127.0.0.1:${port}/`;
      this.#candidates.set(id, { id, label: id === "api" ? "API" : "Web", port, openUrl,
        ...(id === "web" ? { healthUrl: openUrl } : {}),
      });
    }
  }
}
