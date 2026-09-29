import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia — components read it for
// prefers-reduced-motion and the system theme. Individual specs stub it
// with vi.stubGlobal when they need specific matches; this is just the
// default so anything that reads it without stubbing doesn't throw.
window.matchMedia = function matchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  } as MediaQueryList;
};
