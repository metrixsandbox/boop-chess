// Used by the App Store track (next week). Change appId to your reverse-DNS id
// before running `npx cap add ios`. Not needed for the PWA deploy.
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.boopchess",
  appName: "Boop Chess",
  webDir: "dist",
};

export default config;
