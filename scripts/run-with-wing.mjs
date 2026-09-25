import { spawn } from "node:child_process";
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
    const executable = process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
    const child = spawn(executable, args, { stdio: "inherit", ...options });
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
    await run("pnpm", ["verify:wing"], { cwd: projectRoot, env: cleanEnvironment });
    console.log("[Wing][REGISTRY] 使用 manifest/lockfile 精确版本");
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
