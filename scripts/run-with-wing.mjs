import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pnhCleanWingEnvironment, pnhResolveLocalWing } from "./wing-mode.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const separator = process.argv.indexOf("--");
if (!new Set(["registry", "local"]).has(mode) || separator < 0 || !process.argv[separator + 1]) {
  throw new Error("用法：node scripts/run-with-wing.mjs <registry|local> -- <command> [...args]");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // pnpm.cmd cannot be spawned directly on Windows. Reuse the CLI that
    // launched this package script, without shell quoting or PATH lookup.
    const pnpmCli = process.env.npm_execpath;
    const usePnpmCli = command === "pnpm" && pnpmCli
      && /\.[cm]?js$/iu.test(pnpmCli) && existsSync(pnpmCli);
    if (process.platform === "win32" && command === "pnpm" && !usePnpmCli) {
      reject(new Error("无法定位 pnpm JavaScript CLI，请通过 pnpm dev 或 pnpm wing 启动 Hub"));
      return;
    }
    const executable = usePnpmCli ? process.execPath : command;
    const child = spawn(executable, usePnpmCli ? [pnpmCli, ...args] : args, { stdio: "inherit", ...options, shell: false });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${executable} 被信号 ${signal} 中止`));
      else if (code === 0) resolve();
      else reject(new Error(`${executable} 退出码 ${code}`));
    });
  });
}

try {
  const cleanEnvironment = pnhCleanWingEnvironment(process.env);
  let environment = cleanEnvironment;
  if (mode === "registry") {
    await run(process.execPath, [path.join(projectRoot, "scripts/verify-wing-registry.mjs")], { cwd: projectRoot, env: cleanEnvironment });
  } else {
    const wing = pnhResolveLocalWing(projectRoot, process.env);
    console.log(`[Wing][LOCAL] ${wing.root} (${wing.version})`);
    await run("pnpm", ["build"], { cwd: wing.root, env: cleanEnvironment });
    environment = {
      ...cleanEnvironment,
      PHOENIX_WING_MODE: "local",
      PHOENIX_WING_ROOT: wing.root,
    };
  }
  await run(process.argv[separator + 1], process.argv.slice(separator + 2), {
    cwd: projectRoot,
    env: environment,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
