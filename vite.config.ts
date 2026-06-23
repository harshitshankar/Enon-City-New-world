import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Dev-only proxy so the client can talk to the multiplayer relay server at
  // ws://localhost:8080 without CORS issues. In production set VITE_WS_URL to
  // your deployed WebSocket service URL (e.g. wss://neon-city-ws.onrender.com).
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ws/, ""),
      },
    },
  },
});
