import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

/** Keep in sync with `EMOJIBASE_URL` / `EMOJI_LOCALE` in `src/features/chat/EmojiPicker.tsx`. */
const URL_PREFIX = "/emojibase";
const LOCALE = "ru"; // also the locale directory resolved in `emojibaseData()`
const FILES = ["data.json", "messages.json"];

/**
 * Serves the Russian `emojibase-data` JSON from our own origin — `vite dev`
 * through a middleware, `vite build` as emitted assets — so the emoji picker
 * never has to fetch from a third-party CDN (its default is jsDelivr).
 * Only the one locale the UI uses is shipped, not the whole package.
 */
export function emojibaseData(): Plugin {
  // A literal specifier (not built from LOCALE) so knip sees the dependency is used.
  const dir = path.dirname(fileURLToPath(import.meta.resolve("emojibase-data/ru/data.json")));

  return {
    name: "ghostline:emojibase-data",
    configureServer(server) {
      server.middlewares.use(URL_PREFIX, (req, res, next) => {
        const file = FILES.find((name) => req.url === `/${LOCALE}/${name}`);
        if (!file) {
          next();
          return;
        }
        readFile(path.join(dir, file)).then(
          (body) => {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "public, max-age=86400");
            res.end(body);
          },
          (error: unknown) => {
            next(error);
          },
        );
      });
    },
    async generateBundle() {
      for (const file of FILES) {
        this.emitFile({
          type: "asset",
          fileName: `${URL_PREFIX.slice(1)}/${LOCALE}/${file}`,
          source: await readFile(path.join(dir, file)),
        });
      }
    },
  };
}
