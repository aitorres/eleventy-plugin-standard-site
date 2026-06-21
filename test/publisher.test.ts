import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublisher } from "../src/publisher";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createPublisher", () => {
  it("throws when required options are missing", () => {
    expect(() => createPublisher({})).toThrow(
      "Missing required PDS configuration: identifier and password are required."
    );
  });

  it("uses the default pds url when pds is not provided", async () => {
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
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await publisher.startSession();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bsky.social/xrpc/com.atproto.server.createSession",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("starts session and normalizes pds url and identifier", async () => {
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
      pds: "bsky.social",
      identifier: "@alice.bsky.social",
      password: "app-password"
    });

    publisher.startSession();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bsky.social/xrpc/com.atproto.server.createSession",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          identifier: "alice.bsky.social",
          password: "app-password"
        })
      }
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

    await expect(publisher.startSession()).rejects.toThrow(
      "Failed to create session on PDS https://bsky.social with provided credentials: Unauthorized"
    );
  });

  it("throws when creating or updating publication before session starts", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const publisher = createPublisher({
      pds: "https://bsky.social",
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await expect(
      publisher.createOrUpdatePublicationRecord({
        $type: "site.standard.publication",
        url: "https://example.com",
        name: "Example",
        description: "Example description",
        preferences: {
          showInDiscover: true
        }
      })
    ).rejects.toThrow("Session not started. Call startSession() before making requests.");
  });

  it("creates a publication record when no matching record exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessJwt: "jwt-123" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cursor: null, records: [] }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uri: "at://did:plc:abc123/site.standard.publication/new-record-key",
            cid: "cid-1",
            commit: {
              cid: "commit-cid-1",
              rev: "rev-1"
            },
            validationStatus: "valid"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const publisher = createPublisher({
      pds: "https://bsky.social",
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await publisher.startSession();

    const uri = await publisher.createOrUpdatePublicationRecord({
      $type: "site.standard.publication",
      url: "https://example.com",
      name: "Example",
      description: "Example description",
      preferences: {
        showInDiscover: true
      }
    });

    expect(uri).toBe("at://did:plc:abc123/site.standard.publication/new-record-key");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://bsky.social/xrpc/com.atproto.repo.createRecord",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws when listing existing records fails during publication create/update", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessJwt: "jwt-123" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response("Server error", {
          status: 500,
          statusText: "Internal Server Error"
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const publisher = createPublisher({
      pds: "https://bsky.social",
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await publisher.startSession();

    await expect(
      publisher.createOrUpdatePublicationRecord({
        $type: "site.standard.publication",
        url: "https://example.com",
        name: "Example",
        description: "Example description",
        preferences: {
          showInDiscover: true
        }
      })
    ).rejects.toThrow("Failed to list site.standard.publication records: Internal Server Error");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lists all paginated publication records and stops when cursor is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessJwt: "jwt-123" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cursor: "next-page-cursor",
            records: [
              {
                cid: "existing-cid-1",
                uri: "at://did:plc:abc123/site.standard.publication/record-key-1",
                value: {
                  $type: "site.standard.publication",
                  url: "https://example.com",
                  name: "Existing 1",
                  description: "Existing description 1",
                  preferences: {
                    showInDiscover: true
                  }
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            records: [
              {
                cid: "existing-cid-2",
                uri: "at://did:plc:abc123/site.standard.publication/record-key-2",
                value: {
                  $type: "site.standard.publication",
                  url: "https://example.org",
                  name: "Existing 2",
                  description: "Existing description 2",
                  preferences: {
                    showInDiscover: false
                  }
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uri: "at://did:plc:abc123/site.standard.publication/record-key-1",
            cid: "cid-2",
            commit: {
              cid: "commit-cid-2",
              rev: "rev-2"
            },
            validationStatus: "valid"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const publisher = createPublisher({
      pds: "https://bsky.social",
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await publisher.startSession();

    const uri = await publisher.createOrUpdatePublicationRecord({
      $type: "site.standard.publication",
      url: "https://example.com",
      name: "Updated",
      description: "Updated description",
      preferences: {
        showInDiscover: false
      }
    });

    expect(uri).toBe("at://did:plc:abc123/site.standard.publication/record-key-1");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://bsky.social/xrpc/com.atproto.repo.listRecords?collection=site.standard.publication&repo=did%3Aplc%3Aabc123",
      expect.objectContaining({ method: "GET" })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://bsky.social/xrpc/com.atproto.repo.listRecords?collection=site.standard.publication&repo=did%3Aplc%3Aabc123&cursor=next-page-cursor",
      expect.objectContaining({ method: "GET" })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://bsky.social/xrpc/com.atproto.repo.putRecord",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("updates a publication record when matching url already exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessJwt: "jwt-123" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cursor: null,
            records: [
              {
                cid: "existing-cid",
                uri: "at://did:plc:abc123/site.standard.publication/existing-record-key",
                value: {
                  $type: "site.standard.publication",
                  url: "https://example.com",
                  name: "Existing",
                  description: "Existing description",
                  preferences: {
                    showInDiscover: true
                  }
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uri: "at://did:plc:abc123/site.standard.publication/existing-record-key",
            cid: "cid-2",
            commit: {
              cid: "commit-cid-2",
              rev: "rev-2"
            },
            validationStatus: "valid"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const publisher = createPublisher({
      pds: "https://bsky.social",
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await publisher.startSession();

    const uri = await publisher.createOrUpdatePublicationRecord({
      $type: "site.standard.publication",
      url: "https://example.com",
      name: "Updated",
      description: "Updated description",
      preferences: {
        showInDiscover: false
      }
    });

    expect(uri).toBe("at://did:plc:abc123/site.standard.publication/existing-record-key");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://bsky.social/xrpc/com.atproto.repo.putRecord",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws when creating or updating document before session starts", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const publisher = createPublisher({
      pds: "https://bsky.social",
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await expect(
      publisher.createOrUpdateDocumentRecord({
        site: "at://did:plc:abc123/site.standard.publication/publication-key",
        title: "A post",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        path: "/posts/a-post/"
      })
    ).rejects.toThrow("Session not started. Call startSession() before making requests.");
  });

  it("creates a document record when no matching record exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessJwt: "jwt-123" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cursor: null, records: [] }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uri: "at://did:plc:abc123/site.standard.document/new-record-key",
            cid: "cid-3",
            commit: {
              cid: "commit-cid-3",
              rev: "rev-3"
            },
            validationStatus: "valid"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const publisher = createPublisher({
      pds: "https://bsky.social",
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await publisher.startSession();

    const uri = await publisher.createOrUpdateDocumentRecord({
      site: "at://did:plc:abc123/site.standard.publication/publication-key",
      title: "A post",
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      path: "/posts/a-post/"
    });

    expect(uri).toBe("at://did:plc:abc123/site.standard.document/new-record-key");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://bsky.social/xrpc/com.atproto.repo.createRecord",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("updates a document record when matching path already exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessJwt: "jwt-123" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cursor: null,
            records: [
              {
                cid: "existing-doc-cid",
                uri: "at://did:plc:abc123/site.standard.document/existing-doc-key",
                value: {
                  site: "at://did:plc:abc123/site.standard.publication/publication-key",
                  title: "Existing post",
                  publishedAt: "2026-01-01T00:00:00.000Z",
                  path: "/posts/a-post/"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uri: "at://did:plc:abc123/site.standard.document/existing-doc-key",
            cid: "cid-4",
            commit: {
              cid: "commit-cid-4",
              rev: "rev-4"
            },
            validationStatus: "valid"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const publisher = createPublisher({
      pds: "https://bsky.social",
      identifier: "did:plc:abc123",
      password: "app-password"
    });

    await publisher.startSession();

    const uri = await publisher.createOrUpdateDocumentRecord({
      site: "at://did:plc:abc123/site.standard.publication/publication-key",
      title: "Updated post",
      publishedAt: new Date("2026-01-02T00:00:00.000Z"),
      path: "/posts/a-post/"
    });

    expect(uri).toBe("at://did:plc:abc123/site.standard.document/existing-doc-key");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://bsky.social/xrpc/com.atproto.repo.putRecord",
      expect.objectContaining({ method: "POST" })
    );
  });
});
