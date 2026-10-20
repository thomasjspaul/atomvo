import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin reads wrangler.jsonc, runs the Worker in `worker/index.ts`
// inside the dev server, and wires up local D1 / R2 emulation. `npm run dev`
// serves the React app and the API from one origin (no proxy needed).
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
