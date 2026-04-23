import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, open: true },
  optimizeDeps: {
    include: ["@tsqlx/codegen", "@tsqlx/core", "monaco-editor"],
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
