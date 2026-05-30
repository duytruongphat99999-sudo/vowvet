import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import AstroPWA from "@vite-pwa/astro";
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
    AstroPWA({
      registerType: "autoUpdate",
      manifest: {
        name: "VowVet — Người bạn đồng hành sức khỏe cho thú cưng",
        short_name: "VowVet",
        description: "Nền tảng chăm sóc sức khỏe thú cưng thông minh dành cho người Việt",
        theme_color: "#0a0a0a",
        background_color: "#fafafa",
        display: "standalone",
        start_url: "/",
        lang: "vi",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
});
