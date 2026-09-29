import { describe, expect, it } from "vitest";

import { buildRoomOptions } from "./room-options";

describe("buildRoomOptions", () => {
  it("enables adaptive streaming and dynacast", () => {
    const options = buildRoomOptions();
    expect(options.adaptiveStream).toBe(true);
    expect(options.dynacast).toBe(true);
  });

  it("publishes vp8 with simulcast and resilient audio (red/dtx)", () => {
    const options = buildRoomOptions();
    expect(options.publishDefaults?.videoCodec).toBe("vp8");
    expect(options.publishDefaults?.simulcast).toBe(true);
    expect(options.publishDefaults?.red).toBe(true);
    expect(options.publishDefaults?.dtx).toBe(true);
  });
});
