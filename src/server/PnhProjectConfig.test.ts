import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PnhProjectConfigStore } from "./PnhProjectConfig.js";

const temporaryRoots: string[] = [];

function createWorkspace(): { readonly hub: string; readonly project: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "pnh-projects-"));
  temporaryRoots.push(root);
  const hub = path.join(root, "phoenix-hub");
  const project = path.join(root, "sample-node-app");
  mkdirSync(hub);
  mkdirSync(project);
  writeFileSync(path.join(project, "package.json"), JSON.stringify({
    name: "@phoenix/sample-node-app",
    packageManager: "pnpm@10.15.1",
    scripts: { test: "vitest run", dev: "vite" },
  }));
  writeFileSync(path.join(project, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  return { hub, project };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("PnhProjectConfigStore", () => {
  it("不将不同启动脚本的所有备用 Web 端口铺成端点", () => {
    const { hub, project } = createWorkspace();
    writeFileSync(path.join(project, "package.json"), JSON.stringify({ scripts: {
      dev: "vite --port 5180", alternate: "vite --port 5173", preview: "vite --port 5174",
    } }));
    expect(new PnhProjectConfigStore(hub).inspect(project).endpoints).toEqual([{ id: "web", label: "Web", port: 5180 }]);
  });
  it("保留失效目录及错误供界面修正，不阻断其他项目加载，恢复目录后可重新加载", () => {
    const { hub, project } = createWorkspace();
    const store = new PnhProjectConfigStore(hub);
    store.add(project, "dev", new Set());
    const healthy = path.join(path.dirname(project), "healthy-app");
    mkdirSync(healthy);
    writeFileSync(path.join(healthy, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    store.add(healthy, "dev", new Set());
    const saved = readFileSync(path.join(hub, ".runtime/projects.json"), "utf8");
    rmSync(project, { recursive: true });
    const restored = new PnhProjectConfigStore(hub);
    const definitions = restored.serviceDefinitions();
    expect(definitions).toHaveLength(2);
    expect(definitions[0].configurationErrors).toEqual([`本地目录不存在：${project}`]);
    expect(definitions[1].configurationErrors).toBeUndefined();
    expect(restored.listProjects()).toHaveLength(2);
    expect(readFileSync(path.join(hub, ".runtime/projects.json"), "utf8")).toBe(saved);
    expect(() => restored.inspect(project)).toThrow("本地目录不存在");
    mkdirSync(project);
    writeFileSync(path.join(project, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    expect(restored.serviceDefinitions()[0].configurationErrors).toBeUndefined();
  });

  it("将失效脚本或损坏的 manifest 标记为配置错误", () => {
    const { hub, project } = createWorkspace();
    const store = new PnhProjectConfigStore(hub);
    store.add(project, "dev", new Set());
    writeFileSync(path.join(project, "package.json"), JSON.stringify({ scripts: { start: "node app.js" } }));
    expect(store.serviceDefinitions()[0].configurationErrors?.[0]).toContain("已不存在 script：dev");
    writeFileSync(path.join(project, "package.json"), "{");
    expect(store.serviceDefinitions()[0].configurationErrors?.[0]).toContain("无法读取 package.json");
  });
  it("发现 Hub 同级 Node.js 项目并优先提供 dev script", () => {
    const workspace = createWorkspace();
    const catalog = new PnhProjectConfigStore(workspace.hub).catalog();
    expect(catalog.defaultRoot).toBe(realpathSync(path.dirname(workspace.hub)));
    expect(catalog.candidates).toHaveLength(1);
    expect(catalog.candidates[0]).toMatchObject({
      name: "@phoenix/sample-node-app",
      directory: realpathSync(workspace.project),
      packageManager: "pnpm",
      scripts: ["dev", "test"],
      configured: false,
    });
  });

  it("以私有权限写入本机 JSON 并恢复受控服务", () => {
    const workspace = createWorkspace();
    const store = new PnhProjectConfigStore(workspace.hub);
    const added = store.add(workspace.project, "dev", new Set());
    const configPath = path.join(workspace.hub, ".runtime/projects.json");
    expect(added.definition).toMatchObject({
      id: added.project.serviceId,
      moduleId: added.project.id,
      localProjectId: added.project.id,
      cwd: realpathSync(workspace.project),
      command: { executable: "pnpm", args: ["dev"] },
      endpoints: [],
      externalStop: "confirm-matching-cwd",
    });
    const configStat = statSync(configPath);
    expect(configStat.isFile()).toBe(true);
    if (process.platform !== "win32") {
      expect(configStat.mode & 0o777).toBe(0o600);
    }
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
      version: 1,
      projects: [{ directory: realpathSync(workspace.project), script: "dev" }],
    });
    expect(new PnhProjectConfigStore(workspace.hub).serviceDefinitions()).toHaveLength(1);
  });

  it("从一级子目录识别 Web 与 API 端口并生成多个访问端点", () => {
    const workspace = createWorkspace();
    const client = path.join(workspace.project, "client");
    const server = path.join(workspace.project, "server");
    mkdirSync(client);
    mkdirSync(server);
    writeFileSync(path.join(client, "vite.config.ts"), [
      "export default {",
      "  server: { host: '127.0.0.1', port: 5180, strictPort: true },",
      "};",
    ].join("\n"));
    writeFileSync(path.join(server, "app.js"), [
      "const port = 8081;",
      "app.listen(port, '127.0.0.1');",
    ].join("\n"));

    const store = new PnhProjectConfigStore(workspace.hub);
    expect(store.inspect(workspace.project).port).toBe(5180);
    expect(store.inspect(workspace.project).endpoints).toEqual([
      { id: "web", label: "Web", port: 5180 },
      { id: "api", label: "API", port: 8081 },
    ]);
    const added = store.add(workspace.project, "dev", new Set());
    expect(added.project.port).toBe(5180);
    expect(added.definition.endpoints).toEqual([
      {
        id: "web",
        label: "Web",
        port: 5180,
        openUrl: "http://127.0.0.1:5180/",
        healthUrl: "http://127.0.0.1:5180/",
      },
      {
        id: "api",
        label: "API",
        port: 8081,
        openUrl: "http://127.0.0.1:8081/",
      },
    ]);
  });

  it("拒绝不存在的 script 和重复项目", () => {
    const workspace = createWorkspace();
    const store = new PnhProjectConfigStore(workspace.hub);
    expect(() => store.add(workspace.project, "missing", new Set())).toThrow("不存在 script");
    store.add(workspace.project, "dev", new Set());
    expect(() => store.add(workspace.project, "dev", new Set())).toThrow("已经加入启动列表");
  });

  it("编辑项目时保留稳定 ID，并可只移出 Hub 配置", () => {
    const workspace = createWorkspace();
    const store = new PnhProjectConfigStore(workspace.hub);
    const added = store.add(workspace.project, "dev", new Set());
    const updated = store.update(added.project.id, workspace.project, "test", "示例测试服务");

    expect(updated.project).toMatchObject({
      id: added.project.id,
      serviceId: added.project.serviceId,
      name: "示例测试服务",
      script: "test",
    });
    expect(updated.definition.command).toEqual({ executable: "pnpm", args: ["test"] });
    expect(store.remove(added.project.id).serviceId).toBe(added.project.serviceId);
    expect(store.listProjects()).toEqual([]);
    expect(existsSync(workspace.project)).toBe(true);
  });

  it("导出便携文档并以合并方式新增和更新项目", () => {
    const workspace = createWorkspace();
    const secondProject = path.join(path.dirname(workspace.hub), "second-node-app");
    mkdirSync(secondProject);
    writeFileSync(path.join(secondProject, "package.json"), JSON.stringify({
      name: "second-node-app",
      scripts: { start: "node index.js" },
    }));

    const store = new PnhProjectConfigStore(workspace.hub);
    const existing = store.add(workspace.project, "dev", new Set());
    expect(store.exportDocument()).toEqual({
      format: "phoenix-hub-projects",
      version: 1,
      projects: [{
        name: "@phoenix/sample-node-app",
        directory: realpathSync(workspace.project),
        script: "dev",
      }],
    });

    const plan = store.prepareImport({
      format: "phoenix-hub-projects",
      version: 1,
      projects: [
        { name: "更新后的名称", directory: workspace.project, script: "test" },
        { name: "第二个项目", directory: secondProject, script: "start" },
      ],
    }, new Set(["builtin-service", existing.project.serviceId]));
    expect(plan.updated).toHaveLength(1);
    expect(plan.added).toHaveLength(1);
    expect(plan.updated[0].project.serviceId).toBe(existing.project.serviceId);
    expect(plan.added[0].project.serviceId).not.toBe("builtin-service");

    store.commitImport(plan);
    expect(store.listProjects()).toHaveLength(2);
    expect(store.listProjects()[0]).toMatchObject({ name: "更新后的名称", script: "test" });
  });

  it("拒绝错误格式和重复的导入目录", () => {
    const workspace = createWorkspace();
    const store = new PnhProjectConfigStore(workspace.hub);
    expect(() => store.prepareImport({ version: 1, projects: [] }, new Set())).toThrow(
      "phoenix-hub-projects",
    );
    expect(() => store.prepareImport({
      format: "phoenix-hub-projects",
      version: 1,
      projects: [
        { name: "A", directory: workspace.project, script: "dev" },
        { name: "B", directory: workspace.project, script: "test" },
      ],
    }, new Set())).toThrow("重复目录");
  });
});
