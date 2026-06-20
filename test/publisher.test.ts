import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublisher } from "../src/publisher";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createPublisher", () => {
  it("throws when required options are missing", () => {
    expect(() => createPublisher({})).toThrow(
      "Missing required PDS configuration: pds, identifier, and password are all required."
    );
  });

  it("normalizes pds URL and returns accessJwt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessJwt: "jwt-123" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const publisher = createPublisher({
      pds: "bsky.social/",
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await expect(publisher.createSession()).resolves.toBe("jwt-123");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bsky.social/xrpc/com.atproto.server.createSession",
      expect.objectContaining({
        method: "POST"
      })
    );
  });

  it("throws when session creation fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Unauthorized", {
        status: 401,
        statusText: "Unauthorized"
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const publisher = createPublisher({
      pds: "https://bsky.social",
      identifier: "did:plc:abc123",
      password: "bad-password"
    });

    await expect(publisher.createSession()).rejects.toThrow(
      "Failed to create session: Unauthorized"
    );
  });
});
