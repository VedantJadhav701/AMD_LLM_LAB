import { build } from "esbuild";
const common = { bundle: true, platform: "node", target: "node22", sourcemap: true, external: ["electron"], logLevel: "info" };
await build({ ...common, entryPoints: ["src/main/index.ts"], outfile: "dist/main/index.js", format: "cjs" });
await build({ ...common, entryPoints: ["src/preload/index.ts"], outfile: "dist/preload/index.js", format: "cjs" });
