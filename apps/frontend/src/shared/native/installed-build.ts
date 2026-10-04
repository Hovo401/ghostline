import { App } from "@capacitor/app";

/** The installed APK's `versionCode`. Native app only. */
export async function getInstalledBuild(): Promise<number> {
  return Number((await App.getInfo()).build);
}
