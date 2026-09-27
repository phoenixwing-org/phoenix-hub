import fs from "node:fs";
import path from "node:path";

export const PNH_WING_MODE_ENV = "PHOENIX_WING_MODE";
export const PNH_WING_ROOT_ENV = "PHOENIX_WING_ROOT";

export function pnhCleanWingEnvironment(environment = process.env) {
  const clean = { ...environment };
  delete clean[PNH_WING_MODE_ENV];
  delete clean[PNH_WING_ROOT_ENV];
  delete clean.PHOENIX_WING_SRC;
  return clean;
}

export function pnhResolveLocalWing(projectRoot, environment = process.env) {
  const configured = String(environment[PNH_WING_ROOT_ENV] ?? "").trim();
  const candidate = path.resolve(configured || path.join(projectRoot, "..", "phoenix-wing"));
  const manifestPath = path.join(candidate, "package.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`本地 Wing 不存在：${candidate}\n请建立同级 ../phoenix-wing；只验证 Registry 时运行 pnpm dev`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.name !== "phoenix-wing") {
    throw new Error(`本地目录不是 phoenix-wing：${candidate}`);
  }
  return { root: fs.realpathSync(candidate), version: String(manifest.version ?? "unknown") };
}

export function pnhLocalWingAliases(environment = process.env) {
  if (environment[PNH_WING_MODE_ENV] !== "local") return [];
  const root = String(environment[PNH_WING_ROOT_ENV] ?? "").trim();
  if (!root) throw new Error("PHOENIX_WING_MODE=local 时必须设置 PHOENIX_WING_ROOT");
  const dist = path.join(root, "dist");
  return [
    { find: /^phoenix-wing$/, replacement: path.join(dist, "index.js") },
    { find: /^phoenix-wing\/style\.css$/, replacement: path.join(dist, "style.css") },
    { find: /^phoenix-wing\/(.+)\.vue$/, replacement: `${dist}/$1.js` },
    { find: /^phoenix-wing\/(.+)$/, replacement: `${dist}/$1.js` },
  ];
}
