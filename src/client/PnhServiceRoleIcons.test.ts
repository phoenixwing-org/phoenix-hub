import { describe, expect, it } from "vitest";
import { pnhServiceRibbonIcon } from "./PnhServiceRoleIcons";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import type { EndpointStatus } from "@shared/contracts";

describe("PnhServiceRoleIcons", () => {
  it("Web 可达即为绿色，不被 API 健康状态影响；Web 停止恢复灰色", async () => {
    const endpoint = (id: string, reachable: boolean): EndpointStatus => ({ id, label: id, port: 5180, reachable, healthy: null, pids: [], probeState: reachable ? "reachable-unverified" : "unreachable", probeMessage: reachable ? "端口可达" : "端口不可达" });
    const render = (webReady: boolean) => renderToString(createSSRApp({ render: () => h(pnhServiceRibbonIcon({
      lifecycle: "running", health: "partial", definition: { serviceRole: "app" },
      endpoints: [endpoint("web", webReady), endpoint("api", true)],
    })) }));
    expect(await render(true)).toContain('fill="#22c55e"');
    expect(await render(false)).toContain('fill="#94a3b8"');
  });
  it("按服务角色选择稳定的 Ribbon SVG 图标", () => {
    const stopped = { health: "unhealthy", lifecycle: "stopped" } as const;
    expect(pnhServiceRibbonIcon({ ...stopped, definition: { serviceRole: "web" } }).name).toBe("PnhWebServiceIcon");
    expect(pnhServiceRibbonIcon({ ...stopped, definition: { serviceRole: "api" } }).name).toBe("PnhApiServiceIcon");
    expect(pnhServiceRibbonIcon({ ...stopped, definition: { serviceRole: "app" } }).name).toBe("PnhApplicationServiceIcon");
  });
});
