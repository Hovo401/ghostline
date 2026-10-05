import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "ghostline-call-endpoint";
const STORED = "11111111-1111-4111-8111-111111111111";

type LockCallback = (lock: object | null) => unknown;

function stubLocks(taken: Set<string>): ReturnType<typeof vi.fn> {
  const request = vi.fn((name: string, _options: unknown, callback: LockCallback) => {
    if (taken.has(name)) return Promise.resolve(callback(null));
    taken.add(name);
    return Promise.resolve(callback({}));
  });
  vi.stubGlobal("navigator", { locks: { request } });
  return request;
}

async function load() {
  vi.resetModules();
  return import("./endpoint-id");
}

describe("getEndpointId", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates an id, persists it and memoizes it", async () => {
    stubLocks(new Set());
    const { getEndpointId } = await load();

    const id = await getEndpointId();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(id);
    expect(await getEndpointId()).toBe(id);
  });

  it("keeps the stored id across a reload when the lock is free", async () => {
    sessionStorage.setItem(STORAGE_KEY, STORED);
    stubLocks(new Set());
    const { getEndpointId } = await load();

    expect(await getEndpointId()).toBe(STORED);
  });

  it("generates a fresh id when a duplicated tab copied one that another tab still holds", async () => {
    sessionStorage.setItem(STORAGE_KEY, STORED);
    stubLocks(new Set(["ghostline-call-endpoint-" + STORED]));
    const { getEndpointId } = await load();

    const id = await getEndpointId();

    expect(id).not.toBe(STORED);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(id);
  });

  it("uses the stored id when Web Locks are unavailable", async () => {
    sessionStorage.setItem(STORAGE_KEY, STORED);
    vi.stubGlobal("navigator", {});
    const { getEndpointId } = await load();

    expect(await getEndpointId()).toBe(STORED);
  });

  it("ignores a malformed stored id", async () => {
    sessionStorage.setItem(STORAGE_KEY, "garbage");
    vi.stubGlobal("navigator", {});
    const { getEndpointId } = await load();

    expect(await getEndpointId()).not.toBe("garbage");
  });
});
