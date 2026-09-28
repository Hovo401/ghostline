import { describe, expect, it } from "vitest";

import { fileExtension } from "./file-extension";

describe("fileExtension", () => {
  it("reads the extension off the file name", () => {
    expect(fileExtension("report.final.pdf", "application/pdf")).toBe("PDF");
    expect(fileExtension("archive.zip", "application/zip")).toBe("ZIP");
  });

  it("falls back to the mime subtype when there's no name", () => {
    expect(fileExtension(null, "application/pdf")).toBe("PDF");
  });

  it("falls back to the mime subtype when the name has no extension", () => {
    expect(fileExtension("README", "text/plain")).toBe("PLAI");
  });
});
