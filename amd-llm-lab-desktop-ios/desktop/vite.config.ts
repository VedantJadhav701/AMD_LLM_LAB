import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  base: "./",
  plugins: [react()],
  build: { outDir: path.resolve(__dirname, "dist/renderer"), emptyOutDir: true, target: "chrome140", sourcemap: false },
  server: { port: 5173, strictPort: true },
});
