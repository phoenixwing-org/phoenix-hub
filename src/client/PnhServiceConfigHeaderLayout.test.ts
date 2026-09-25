import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  "src/client/components/PnhServiceConfigView.vue",
  "utf8",
).replace(/\r\n/g, "\n");

describe("PnhServiceConfigView header layout", () => {
  it("窄 View 优先保留完整操作区，并允许标题收缩", () => {
    expect(SOURCE).toContain("--pnw-page-header-title-min-width: 0px");
    expect(SOURCE).toContain(
      ".project-dialog :deep(.pnw-head-row) { grid-template-columns: minmax(0, 1fr) max-content auto; }",
    );
  });
});
