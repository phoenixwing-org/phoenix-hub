import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { pnhLocalWingAliases } from "./scripts/wing-mode.mjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const localWingRoot = process.env.PHOENIX_WING_MODE === "local"
  ? process.env.PHOENIX_WING_ROOT
  : undefined;

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: "@", replacement: path.join(projectRoot, "src/client") },
      { find: "@shared", replacement: path.join(projectRoot, "src/shared") },
      ...pnhLocalWingAliases(process.env),
    ],
    dedupe: ["vue", "phoenix-wing"],
  },
  server: {
    middlewareMode: true,
    host: "127.0.0.1",
    strictPort: true,
    fs: localWingRoot ? { allow: [projectRoot, localWingRoot] } : undefined,
  },
});
