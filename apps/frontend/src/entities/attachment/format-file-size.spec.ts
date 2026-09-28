import { describe, expect, it } from "vitest";

import { formatFileSize } from "./format-file-size";

describe("formatFileSize", () => {
  it("shows whole bytes under 1 KB", () => {
    expect(formatFileSize(530)).toBe("530 Б");
    expect(formatFileSize(0)).toBe("0 Б");
  });

  it("shows one decimal place in KB/MB/GB", () => {
    expect(formatFileSize(2_516_582)).toBe("2.4 МБ");
    expect(formatFileSize(1536)).toBe("1.5 КБ");
  });

  it("clamps negative/invalid input to 0 bytes", () => {
    expect(formatFileSize(-5)).toBe("0 Б");
    expect(formatFileSize(Number.NaN)).toBe("0 Б");
  });
});
