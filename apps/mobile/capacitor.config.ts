import type { CapacitorConfig } from "@capacitor/cli";

// The WebView loads the live site (ADR-0017), so a frontend deploy reaches every installed app.
// `CAP_SERVER_URL` points a dev build at the local stack (`http://localhost:8080/app` over
// `adb reverse`); localhost is a secure context, so mic/camera/service worker still work.
const serverUrl = process.env.CAP_SERVER_URL ?? "https://ghostline.diotek.pp.ua/app";

const config: CapacitorConfig = {
  appId: "app.ghostline",
  appName: "Ghostline",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
    // The app's dark background (pwa.config.ts `background_color`) — no white flash before load.
    backgroundColor: "#0b0d12",
  },
  plugins: {
    // Light icons on the dark system bars painted by `styles.xml`.
    SystemBars: { style: "DARK" },
  },
};

export default config;
