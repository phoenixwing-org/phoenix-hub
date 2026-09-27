import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pnhCleanWingEnvironment, pnhLocalWingAliases, pnhResolveLocalWing } from "./wing-mode.mjs";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("Hub Wing 双入口", () => {
  it("Registry 模式清除本地来源变量", () => {
    expect(pnhCleanWingEnvironment({ PHOENIX_WING_MODE: "local", PHOENIX_WING_ROOT: "/tmp/x", KEEP: "1" }))
      .toEqual({ KEEP: "1" });
  });

  it("本地模式只接受同级 Wing 仓库并生成 dist alias", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pnh-wing-"));
    roots.push(root);
    const project = path.join(root, "phoenix-hub");
    const wing = path.join(root, "phoenix-wing");
    fs.mkdirSync(project);
    fs.mkdirSync(wing);
    fs.writeFileSync(path.join(wing, "package.json"), JSON.stringify({ name: "phoenix-wing", version: "0.7.5" }));
    const resolved = pnhResolveLocalWing(project, {});
    expect(resolved.version).toBe("0.7.5");
    expect(pnhLocalWingAliases({ PHOENIX_WING_MODE: "local", PHOENIX_WING_ROOT: resolved.root }))
      .toHaveLength(4);
  });

  it("缺少同级仓库时明确提示使用 pnpm dev", () => {
    expect(() => pnhResolveLocalWing("/missing/phoenix-hub", {})).toThrow(/pnpm dev/u);
  });
});
