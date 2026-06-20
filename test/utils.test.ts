import { describe, expect, it } from "vitest";

import { extractRecordKey, normalizePdsUrl, normalizeIdentifier } from "../src/utils";

describe("extractRecordKey", () => {
  it("extracts the record key from a URI", () => {
    const uri = "at://did:plc:abc123/site.standard.publication/record-key-123";
    expect(extractRecordKey(uri)).toBe("record-key-123");
  });

  it("extracts the record key from a simple path", () => {
    const uri = "path/to/record";
    expect(extractRecordKey(uri)).toBe("record");
  });

  it("handles single segment URIs", () => {
    const uri = "just-key";
    expect(extractRecordKey(uri)).toBe("just-key");
  });
});

describe("normalizePdsUrl", () => {
  it("adds https:// prefix if no protocol specified", () => {
    expect(normalizePdsUrl("bsky.social")).toBe("https://bsky.social");
  });

  it("preserves https:// protocol", () => {
    expect(normalizePdsUrl("https://bsky.social")).toBe("https://bsky.social");
  });

  it("preserves http:// protocol", () => {
    expect(normalizePdsUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("removes trailing slash", () => {
    expect(normalizePdsUrl("https://bsky.social/")).toBe("https://bsky.social");
  });

  it("trims whitespace", () => {
    expect(normalizePdsUrl("  bsky.social  ")).toBe("https://bsky.social");
  });

  it("handles combined normalization", () => {
    expect(normalizePdsUrl("  bsky.social/  ")).toBe("https://bsky.social");
  });
});

describe("normalizeIdentifier", () => {
  it("removes @ prefix from identifier", () => {
    expect(normalizeIdentifier("@alice.bsky.social")).toBe("alice.bsky.social");
  });

  it("preserves identifier without @ prefix", () => {
    expect(normalizeIdentifier("alice.bsky.social")).toBe("alice.bsky.social");
  });

  it("preserves DID identifiers", () => {
    expect(normalizeIdentifier("did:plc:abc123")).toBe("did:plc:abc123");
  });

  it("trims whitespace", () => {
    expect(normalizeIdentifier("  @alice.bsky.social  ")).toBe("alice.bsky.social");
  });
});
