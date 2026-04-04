import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { createLogger, defineConfig } from "vite";

// Suppress lightningcss warnings about ::highlight() pseudo-element.
// The CSS Custom Highlight API is a valid standard; lightningcss doesn't
// recognise it yet (fix merged upstream, pending release).
const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  if (msg.includes("::highlight")) return;
  originalWarn(msg, options);
};

// Tailwind CSS v4 calls console.warn directly for lightningcss warnings
// (bypassing Vite's logger), so we also intercept that.
const originalConsoleWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("::highlight")) return;
  originalConsoleWarn(...args);
};

export default defineConfig({
  customLogger: logger,
  plugins: [tailwindcss(), svelte()],
  server: {
    port: 24678,
    strictPort: true,
    host: "127.0.0.1",
    hmr: {
      host: "127.0.0.1",
      port: 24678,
      clientPort: 24678,
    },
    proxy: {
      "/api": {
        target: "http://localhost:4567",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
  },
});
