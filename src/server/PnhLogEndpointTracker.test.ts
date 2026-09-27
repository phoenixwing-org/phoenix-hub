import { describe, expect, it, vi } from "vitest";
import { PnhLogEndpointTracker, pnhResolveLogEndpoints } from "./PnhLogEndpointTracker.js";
import type { EndpointStatus, ServiceEndpointDefinition } from "../shared/contracts.js";

describe("launch log endpoint hints", () => {
  it("rejects foreign and raced listeners before displaying a runtime endpoint", async () => {
    const candidate = { id: "web", label: "Web", port: 5181 };
    const status = (endpoint: ServiceEndpointDefinition, pids: number[]): EndpointStatus => ({
      ...endpoint, reachable: true, healthy: true, probeState: "healthy", pids,
    });
    const old = status({ ...candidate, port: 5180 }, []);
    const probe = vi.fn(async (e: ServiceEndpointDefinition) => status(e, [42]));
    expect(await pnhResolveLogEndpoints([old], [candidate], new Set([42]), async () => [99], probe)).toEqual([old]);
    expect(probe).not.toHaveBeenCalled();
    expect((await pnhResolveLogEndpoints([old], [candidate], new Set([42]), async () => [42], probe)).map(e=>e.port)).toEqual([5181]);
    probe.mockImplementation(async e => status(e, [99]));
    expect(await pnhResolveLogEndpoints([], [candidate], new Set([42]), async () => [42], probe)).toEqual([]);
  });
  it("reads split ANSI URLs and replaces migrated ports rather than accumulating them", () => {
    const tracker = new PnhLogEndpointTracker();
    tracker.appendChunk("stdout", Buffer.from("[web] Local: http://127.0.0.1:\u001b[1m51"));
    expect(tracker.candidates()).toEqual([]);
    tracker.appendChunk("stdout", Buffer.from("80\u001b[22m/\n"));
    tracker.appendChunk("stdout", Buffer.from("[web] Local: http://localhost:5181/\n"));
    tracker.appendChunk("stderr", Buffer.from("[server] 已启动：http://127.0.0.1:48385\n"));
    expect(tracker.candidates().map(e => [e.id, e.port])).toEqual([["web", 5181], ["api", 48385]]);
    expect(new PnhLogEndpointTracker().candidates()).toEqual([]);
  });
  it("ignores remote URLs, proxy chatter and invalid ports, strips sensitive paths", () => {
    const tracker = new PnhLogEndpointTracker();
    tracker.appendChunk("stdout", Buffer.from("proxy target http://127.0.0.1:8080/\nLocal: https://example.com:1234/\nLocal: http://127.0.0.1:99999/\n"));
    expect(tracker.candidates()).toEqual([]);
    tracker.appendChunk("stdout", Buffer.from("Local: http://0.0.0.0:5180/private?token=example\n"));
    expect(tracker.candidates()[0].openUrl).toBe("http://127.0.0.1:5180/");
  });
});
