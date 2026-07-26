import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // GitHub Pages serves from /<repo>/ — the deploy workflow sets GHPAGES=1.
  // Keep "/" for local dev, Codemagic, and the Capacitor iOS build.
  base: process.env.GHPAGES === "1" ? "/boop-chess/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Boop Chess",
        short_name: "Boop Chess",
        description: "Walnut-and-maple chess where every capture is a show.",
        theme_color: "#241a12",
        background_color: "#171310",
        display: "standalone",
        // "portrait" locked installed iPads out of the landscape layout
        orientation: "any",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      }
    })
  ]
});
