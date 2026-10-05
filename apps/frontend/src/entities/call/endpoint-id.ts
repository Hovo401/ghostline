import { EndpointIdSchema } from "@ghostline/contracts";

const STORAGE_KEY = "ghostline-call-endpoint";
const LOCK_PREFIX = "ghostline-call-endpoint-";

function readStored(): string | null {
  try {
    const parsed = EndpointIdSchema.safeParse(sessionStorage.getItem(STORAGE_KEY));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function store(id: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage blocked: the id then lives for this page load only.
  }
}

/** Holds the Web Lock named after `id` for as long as this page lives. Resolves to whether this
 * tab got it — `false` means another live tab already owns that id. */
function claim(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.locks
      .request(LOCK_PREFIX + id, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        // Never settles: the lock is released when the page goes away.
        return lock ? new Promise<never>(() => undefined) : undefined;
      })
      .catch(() => {
        resolve(true);
      });
  });
}

async function resolveEndpointId(): Promise<string> {
  const stored = readStored();
  const candidate = stored ?? crypto.randomUUID();
  if (stored === null) store(candidate);
  if (typeof navigator === "undefined" || !("locks" in navigator)) return candidate;

  if (await claim(candidate)) return candidate;
  // A duplicated tab copies sessionStorage, so two live tabs can carry the same id.
  const fresh = crypto.randomUUID();
  store(fresh);
  void claim(fresh);
  return fresh;
}

let endpointId: Promise<string> | null = null;

/**
 * The opaque id of *this* tab / WebView that the server records as the owner of a call's media
 * (ADR-0023). Kept in `sessionStorage` so a reload of the same tab resumes its call, and guarded
 * by a Web Lock so a duplicated tab (which copies `sessionStorage`) gets its own id. Every call
 * request awaits this.
 */
export function getEndpointId(): Promise<string> {
  endpointId ??= resolveEndpointId();
  return endpointId;
}
