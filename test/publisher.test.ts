import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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
      { method: "GET" }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://bsky.social/xrpc/com.atproto.repo.listRecords?collection=site.standard.publication&repo=did%3Aplc%3Aabc123&cursor=next-page-cursor",
      { method: "GET" }
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

  it("creates a publication record with theme colors", async () => {
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

    const uri = await publisher.createOrUpdatePublicationRecord(
      {
        $type: "site.standard.publication",
        url: "https://example.com",
        name: "Example",
        preferences: {
          showInDiscover: true
        }
      },
      {
        themeColors: {
          bg: { r: 255, g: 255, b: 255 },
          fg: { r: 31, g: 41, b: 55 },
          accent: { r: 59, g: 130, b: 246 },
          accentFg: { r: 255, g: 255, b: 255 }
        }
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.publication/new-record-key");

    // Check that the record was created with the theme
    const createRecordCall = fetchMock.mock.calls[2][1] as RequestInit;
    const body = JSON.parse(createRecordCall.body as string);
    expect(body.record.basicTheme).toBeDefined();
    expect(body.record.basicTheme.$type).toBe("site.standard.theme.basic");
    expect(body.record.basicTheme.background.r).toBe(255);
    expect(body.record.basicTheme.foreground.g).toBe(41);
    expect(body.record.basicTheme.accent.b).toBe(246);
    expect(body.record.basicTheme.accentForeground.r).toBe(255);
  });

  it("creates a publication record with icon blob", async () => {
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

    const uri = await publisher.createOrUpdatePublicationRecord(
      {
        $type: "site.standard.publication",
        url: "https://example.com",
        name: "Example",
        preferences: {
          showInDiscover: true
        }
      },
      {
        iconPath: "./assets/nonexistent.png"
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.publication/new-record-key");
  });

  it("warns and continues if publication icon file does not exist", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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

    const uri = await publisher.createOrUpdatePublicationRecord(
      {
        $type: "site.standard.publication",
        url: "https://example.com",
        name: "Example",
        preferences: {
          showInDiscover: true
        }
      },
      {
        iconPath: "./assets/nonexistent-logo.png"
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.publication/new-record-key");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Blob file not found: ./assets/nonexistent-logo.png"
    );

    // Check that the record was created without an icon
    const createRecordCall = fetchMock.mock.calls[2][1] as RequestInit;
    const body = JSON.parse(createRecordCall.body as string);
    expect(body.record.icon).toBeUndefined();

    consoleWarnSpy.mockRestore();
  });

  it("warns when publication icon processing fails", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "stdsite-icon-fail-"));
    const iconPath = join(tempDir, "icon.png");
    writeFileSync(iconPath, Buffer.from("icon-bytes"));

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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
                  name: "Example",
                  icon: {
                    $type: "blob",
                    ref: { $link: "bafkrei-existing" },
                    mimeType: "image/png",
                    size: 10
                  },
                  preferences: { showInDiscover: true }
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
        new Response("failed", {
          status: 500,
          statusText: "Internal Server Error"
        })
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

    const uri = await publisher.createOrUpdatePublicationRecord(
      {
        $type: "site.standard.publication",
        url: "https://example.com",
        name: "Example",
        preferences: {
          showInDiscover: true
        }
      },
      {
        iconPath
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.publication/existing-record-key");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `Failed to process blob from ${iconPath}:`,
      expect.any(Error)
    );

    const putRecordCall = fetchMock.mock.calls[3][1] as RequestInit;
    const putRecordBody = JSON.parse(putRecordCall.body as string);
    expect(putRecordBody.record.icon).toBeUndefined();

    consoleWarnSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reuses existing icon blob when provided icon file matches existing blob content", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "stdsite-icon-reuse-"));
    const iconPath = join(tempDir, "icon.png");
    const iconBytes = Buffer.from("same-image-bytes");
    writeFileSync(iconPath, iconBytes);

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
                  name: "Example",
                  icon: {
                    $type: "blob",
                    ref: { $link: "bafkrei-existing" },
                    mimeType: "image/png",
                    size: iconBytes.length
                  },
                  preferences: { showInDiscover: true }
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
        new Response(iconBytes, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream"
          }
        })
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

    const uri = await publisher.createOrUpdatePublicationRecord(
      {
        $type: "site.standard.publication",
        url: "https://example.com",
        name: "Example",
        preferences: {
          showInDiscover: true
        }
      },
      {
        iconPath
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.publication/existing-record-key");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://bsky.social/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc123&cid=bafkrei-existing",
      expect.objectContaining({ method: "GET" })
    );

    const putRecordCall = fetchMock.mock.calls[3][1] as RequestInit;
    const putRecordBody = JSON.parse(putRecordCall.body as string);
    expect(putRecordBody.record.icon.ref.$link).toBe("bafkrei-existing");

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("uploads a new icon blob when provided icon file differs from existing blob", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "stdsite-icon-reupload-"));
    const iconPath = join(tempDir, "icon.png");
    writeFileSync(iconPath, Buffer.from("new-image-bytes"));

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
                  name: "Example",
                  icon: {
                    $type: "blob",
                    ref: { $link: "bafkrei-existing" },
                    mimeType: "image/png",
                    size: 16
                  },
                  preferences: { showInDiscover: true }
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
        new Response(Buffer.from("old-image-bytes"), {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            blob: {
              $type: "blob",
              ref: { $link: "bafkrei-new" },
              mimeType: "image/png",
              size: 15
            }
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

    const uri = await publisher.createOrUpdatePublicationRecord(
      {
        $type: "site.standard.publication",
        url: "https://example.com",
        name: "Example",
        preferences: {
          showInDiscover: true
        }
      },
      {
        iconPath
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.publication/existing-record-key");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bsky.social/xrpc/com.atproto.repo.uploadBlob",
      expect.objectContaining({ method: "POST" })
    );

    const putRecordCall = fetchMock.mock.calls[4][1] as RequestInit;
    const putRecordBody = JSON.parse(putRecordCall.body as string);
    expect(putRecordBody.record.icon.ref.$link).toBe("bafkrei-new");

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a document record with coverImage blob", async () => {
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
            uri: "at://did:plc:abc123/site.standard.document/new-doc-key",
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

    const uri = await publisher.createOrUpdateDocumentRecord(
      {
        site: "at://did:plc:abc123/site.standard.publication/pub-key",
        title: "A post",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        path: "/posts/a-post/"
      },
      {
        coverImagePath: "./assets/nonexistent-cover.jpg"
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.document/new-doc-key");
  });

  it("warns and continues if document coverImage file does not exist", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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
            uri: "at://did:plc:abc123/site.standard.document/new-doc-key",
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

    const uri = await publisher.createOrUpdateDocumentRecord(
      {
        site: "at://did:plc:abc123/site.standard.publication/pub-key",
        title: "A post",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        path: "/posts/a-post/"
      },
      {
        coverImagePath: "./assets/nonexistent-cover.jpg"
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.document/new-doc-key");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Blob file not found: ./assets/nonexistent-cover.jpg"
    );

    // Check that the record was created without a coverImage
    const createRecordCall = fetchMock.mock.calls[2][1] as RequestInit;
    const body = JSON.parse(createRecordCall.body as string);
    expect(body.record.coverImage).toBeUndefined();

    consoleWarnSpy.mockRestore();
  });

  it("warns when document coverImage processing fails", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "stdsite-cover-fail-"));
    const coverImagePath = join(tempDir, "cover.jpg");
    writeFileSync(coverImagePath, Buffer.from("cover-bytes"));

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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
                  $type: "site.standard.document",
                  site: "at://did:plc:abc123/site.standard.publication/pub-key",
                  title: "A post",
                  path: "/posts/a-post/",
                  publishedAt: "2026-01-01T00:00:00.000Z",
                  coverImage: {
                    $type: "blob",
                    ref: { $link: "bafkrei-existing-cover" },
                    mimeType: "image/jpeg",
                    size: 11
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
        new Response("failed", {
          status: 500,
          statusText: "Internal Server Error"
        })
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

    const uri = await publisher.createOrUpdateDocumentRecord(
      {
        site: "at://did:plc:abc123/site.standard.publication/pub-key",
        title: "A post",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        path: "/posts/a-post/"
      },
      {
        coverImagePath
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.document/existing-doc-key");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `Failed to process blob from ${coverImagePath}:`,
      expect.any(Error)
    );

    const putRecordCall = fetchMock.mock.calls[3][1] as RequestInit;
    const putRecordBody = JSON.parse(putRecordCall.body as string);
    expect(putRecordBody.record.coverImage).toBeUndefined();

    consoleWarnSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reuses existing coverImage blob when provided file matches existing blob content", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "stdsite-cover-reuse-"));
    const coverImagePath = join(tempDir, "cover.jpg");
    const coverBytes = Buffer.from("same-cover-bytes");
    writeFileSync(coverImagePath, coverBytes);

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
                  $type: "site.standard.document",
                  site: "at://did:plc:abc123/site.standard.publication/pub-key",
                  title: "A post",
                  path: "/posts/a-post/",
                  publishedAt: "2026-01-01T00:00:00.000Z",
                  coverImage: {
                    $type: "blob",
                    ref: { $link: "bafkrei-existing-cover" },
                    mimeType: "image/jpeg",
                    size: coverBytes.length
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
        new Response(coverBytes, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream"
          }
        })
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

    const uri = await publisher.createOrUpdateDocumentRecord(
      {
        site: "at://did:plc:abc123/site.standard.publication/pub-key",
        title: "A post",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        path: "/posts/a-post/"
      },
      {
        coverImagePath
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.document/existing-doc-key");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://bsky.social/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc123&cid=bafkrei-existing-cover",
      expect.objectContaining({ method: "GET" })
    );

    const putRecordCall = fetchMock.mock.calls[3][1] as RequestInit;
    const putRecordBody = JSON.parse(putRecordCall.body as string);
    expect(putRecordBody.record.coverImage.ref.$link).toBe("bafkrei-existing-cover");

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("uploads a new coverImage blob when provided file differs from existing blob", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "stdsite-cover-reupload-"));
    const coverImagePath = join(tempDir, "cover.jpg");
    writeFileSync(coverImagePath, Buffer.from("new-cover-bytes"));

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
                  $type: "site.standard.document",
                  site: "at://did:plc:abc123/site.standard.publication/pub-key",
                  title: "A post",
                  path: "/posts/a-post/",
                  publishedAt: "2026-01-01T00:00:00.000Z",
                  coverImage: {
                    $type: "blob",
                    ref: { $link: "bafkrei-existing-cover" },
                    mimeType: "image/jpeg",
                    size: 15
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
        new Response(Buffer.from("old-cover-bytes"), {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            blob: {
              $type: "blob",
              ref: { $link: "bafkrei-new-cover" },
              mimeType: "image/jpeg",
              size: 14
            }
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

    const uri = await publisher.createOrUpdateDocumentRecord(
      {
        site: "at://did:plc:abc123/site.standard.publication/pub-key",
        title: "A post",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        path: "/posts/a-post/"
      },
      {
        coverImagePath
      }
    );

    expect(uri).toBe("at://did:plc:abc123/site.standard.document/existing-doc-key");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bsky.social/xrpc/com.atproto.repo.uploadBlob",
      expect.objectContaining({ method: "POST" })
    );

    const putRecordCall = fetchMock.mock.calls[4][1] as RequestInit;
    const putRecordBody = JSON.parse(putRecordCall.body as string);
    expect(putRecordBody.record.coverImage.ref.$link).toBe("bafkrei-new-cover");

    rmSync(tempDir, { recursive: true, force: true });
  });
});
