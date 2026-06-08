import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://vowvet.monminpet.com",
  // SSR cần cho middleware đọc cookie + Astro.request.headers trong dashboard.astro.
  // Bun chạy được @astrojs/node standalone (Node-compatible).
  output: "server",
  adapter: node({ mode: "standalone" }),
  server: {
    host: "0.0.0.0",
    port: 4321,
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Liệt kê tất cả host hợp lệ. true không propagate đúng qua Astro 5.18.
      // - vowvet.monminpet.com: browser truy cập qua Cloudflare/NPM
      // - vowvet-web: NPM upstream proxy_pass dùng container name làm Host
      // - localhost, 127.0.0.1: debug local
      allowedHosts: ["vowvet.monminpet.com", "vowvet-web", "localhost", "127.0.0.1"],
      // Proxy API requests sang vowvet-api container khi test localhost:4321 trực tiếp.
      // Ở production, Nginx Proxy Manager đảm nhận route /api/v1/* → vowvet-api:3000.
      proxy: {
        "/api": {
          target: process.env.API_INTERNAL_URL || "http://vowvet-api:3000",
          changeOrigin: true,
        },
      },
    },
  },
  integrations: [
  ],
});
