import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import vike from "vike/plugin";
import tailwindcss from "@tailwindcss/vite";
import "dotenv/config";

export default defineConfig({
  plugins: [vike(), react(), tailwindcss()],
  build: {
    target: "es2022",
  },
  resolve: {
    alias: {
      "#root": __dirname,
    },
  },
  define: {
    // Inject SINGLE_SHOP_MODE as a compile-time constant for both server and client
    "process.env.SINGLE_SHOP_MODE": JSON.stringify(
      process.env.SINGLE_SHOP_MODE,
    ),
  },
  server: {
    allowedHosts: ["www.perce-eg.com", "perce-eg.com"],
  },
});
