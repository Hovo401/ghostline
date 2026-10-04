import { App } from "@capacitor/app";

import { isNativeApp } from "./is-native-app";

/**
 * Opens an App Link (`https://<our domain>/app?chat=…`) that launched or re-focused the app.
 * Only the path + query is used, so it works for any host the shell is pointed at (a dev stack
 * included). `navigate` is injected so `shared` doesn't import the router.
 * Call once at boot; a no-op outside the native app.
 */
export function listenForNativeLinks(navigate: (href: string) => void): void {
  if (!isNativeApp()) return;
  void App.addListener("appUrlOpen", ({ url }) => {
    const { pathname, search, hash } = new URL(url);
    navigate(`${pathname}${search}${hash}`);
  });
}
