import { afterEach, describe, expect, it, vi } from "vitest";

import pluginStandardSite from "../src/plugin";
import * as publisherModule from "../src/publisher";
import fs from "fs";

afterEach(() => {
  vi.restoreAllMocks();
});

const baseOptions = {
  pds: "https://bsky.social",
  identifier: "did:plc:abc123",
  password: "app-password",
  publicationName: "My Site",
  publicationDescription: "A test site",
  publicationUrl: "https://example.com"
};

type EleventyConfigArg = Parameters<typeof pluginStandardSite>[0];
type CollectionCallback = Parameters<EleventyConfigArg["addCollection"]>[1];
type AfterHandler = Parameters<EleventyConfigArg["on"]>[1];

function makeEleventyConfig() {
  const collections: Record<string, CollectionCallback> = {};
  const handlers: Record<string, AfterHandler> = {};

  return {
    addCollection: vi.fn((name: string, cb: CollectionCallback) => {
      collections[name] = cb;
    }),
    on: vi.fn((event: Parameters<EleventyConfigArg["on"]>[0], cb: AfterHandler) => {
      handlers[event] = cb;
    }),
    _collections: collections,
    _handlers: handlers
  };
}

describe("pluginStandardSite", () => {
  it("registers the standardSiteDocuments collection", () => {
    const config = makeEleventyConfig();

    pluginStandardSite(config, baseOptions);

    expect(config.addCollection).toHaveBeenCalledWith(
      "standardSiteDocuments",
      expect.any(Function)
    );
  });

  it("returns only posts with standardSiteDocument set to true", () => {
    const config = makeEleventyConfig();
    const posts = [
      { url: "/posts/1/", date: new Date("2026-06-06T00:00:00.000Z"), data: { title: "One" } },
      {
        url: "/posts/2/",
        date: new Date("2026-06-07T00:00:00.000Z"),
        data: { title: "Two", standardSiteDocument: true }
      }
    ];

    pluginStandardSite(config, baseOptions);

    const collectionCallback = config.addCollection.mock.calls[0][1];
    const result = collectionCallback({ getAll: () => posts });

    expect(result).toEqual([posts[1]]);
    expect(result[0].data.standardSiteDocument).toBe(true);
    expect(result[0].url).toBe("/posts/2/");
  });

  it("registers an eleventy.after handler", () => {
    const config = makeEleventyConfig();

    pluginStandardSite(config, baseOptions);

    expect(config.on).toHaveBeenCalledWith("eleventy.after", expect.any(Function));
  });

  it("syncs all document posts", async () => {
    const config = makeEleventyConfig();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "readdirSync")
      .mockReturnValueOnce([
        {
          name: "posts",
          isDirectory: () => true,
          isFile: () => false
        }
      ] as fs.Dirent[])
      .mockReturnValueOnce([
        {
          name: "hello",
          isDirectory: () => true,
          isFile: () => false
        },
        {
          name: "about.html",
          isDirectory: () => false,
          isFile: () => true
        }
      ] as fs.Dirent[])
      .mockReturnValueOnce([
        {
          name: "index.html",
          isDirectory: () => false,
          isFile: () => true
        }
      ] as fs.Dirent[]);
    const readFileSyncSpy = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue("<html><head></head><body>content</body></html>");

    const mockPublisher = {
      startSession: vi.fn().mockResolvedValue(undefined),
      createOrUpdatePublicationRecord: vi
        .fn()
        .mockResolvedValue("at://did:plc:abc123/site.standard.publication/pub-key"),
      createOrUpdateDocumentRecord: vi
        .fn()
        .mockResolvedValue("at://did:plc:abc123/site.standard.document/doc-key")
    };
    vi.spyOn(publisherModule, "createPublisher").mockReturnValue(mockPublisher);

    const fakePost = {
      url: "/posts/hello/",
      date: new Date("2026-01-01T00:00:00.000Z"),
      data: { title: "Hello", description: "World" }
    };

    pluginStandardSite(config, baseOptions);

    // Simulate the collection being populated
    const collectionCallback = config.addCollection.mock.calls[0][1];
    collectionCallback({
      getAll: () => [{ ...fakePost, data: { ...fakePost.data, standardSiteDocument: true } }]
    });

    const afterHandler = config._handlers["eleventy.after"];
    await afterHandler({ dir: { output: "/tmp/output" } });

    expect(mockPublisher.createOrUpdateDocumentRecord).toHaveBeenCalledTimes(1);
    expect(mockPublisher.createOrUpdateDocumentRecord).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Hello", path: "/posts/hello/" })
    );
    expect(readFileSyncSpy).toHaveBeenCalledWith("/tmp/output/posts/hello/index.html", "utf-8");

    const writeFileSyncSpy = vi.mocked(fs.writeFileSync);
    const htmlWriteCalls = writeFileSyncSpy.mock.calls.filter(
      ([filePath]) => filePath === "/tmp/output/posts/hello/index.html"
    );
    const htmlWriteCall = htmlWriteCalls.at(-1);
    expect(htmlWriteCall).toBeDefined();
    expect(htmlWriteCall?.[1]).toContain('rel="site.standard.document"');
    expect(htmlWriteCall?.[1]).toContain(
      'href="at://did:plc:abc123/site.standard.document/doc-key"'
    );

    const aboutWriteCall = writeFileSyncSpy.mock.calls.find(
      ([filePath]) => filePath === "/tmp/output/posts/about.html"
    );
    expect(aboutWriteCall?.[1]).toContain('rel="site.standard.publication"');
    expect(aboutWriteCall?.[1]).toContain(
      'href="at://did:plc:abc123/site.standard.publication/pub-key"'
    );
  });

  it("updates existing site.standard.document link tag href", async () => {
    const config = makeEleventyConfig();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "readdirSync").mockReturnValue([] as fs.Dirent[]);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      '<html><head><link rel="site.standard.document" href="at://old/value" /></head><body>content</body></html>'
    );

    const mockPublisher = {
      startSession: vi.fn().mockResolvedValue(undefined),
      createOrUpdatePublicationRecord: vi
        .fn()
        .mockResolvedValue("at://did:plc:abc123/site.standard.publication/pub-key"),
      createOrUpdateDocumentRecord: vi
        .fn()
        .mockResolvedValue("at://did:plc:abc123/site.standard.document/doc-key")
    };
    vi.spyOn(publisherModule, "createPublisher").mockReturnValue(mockPublisher);

    const fakePost = {
      url: "/posts/hello/",
      date: new Date("2026-01-01T00:00:00.000Z"),
      data: { title: "Hello", description: "World" }
    };

    pluginStandardSite(config, baseOptions);

    const collectionCallback = config.addCollection.mock.calls[0][1];
    collectionCallback({
      getAll: () => [{ ...fakePost, data: { ...fakePost.data, standardSiteDocument: true } }]
    });

    const afterHandler = config._handlers["eleventy.after"];
    await afterHandler({ dir: { output: "/tmp/output" } });

    const writeFileSyncSpy = vi.mocked(fs.writeFileSync);
    const htmlWriteCall = writeFileSyncSpy.mock.calls.find(
      ([filePath]) => filePath === "/tmp/output/posts/hello/index.html"
    );
    expect(htmlWriteCall).toBeDefined();
    expect(htmlWriteCall?.[1]).toContain(
      'href="at://did:plc:abc123/site.standard.document/doc-key"'
    );
    expect(htmlWriteCall?.[1]).not.toContain('href="at://old/value"');
  });

  it("warns and continues when the generated html file has no head tag", async () => {
    const config = makeEleventyConfig();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "readdirSync").mockReturnValue([] as fs.Dirent[]);
    vi.spyOn(fs, "readFileSync").mockReturnValue("<html><body>content</body></html>");

    const mockPublisher = {
      startSession: vi.fn().mockResolvedValue(undefined),
      createOrUpdatePublicationRecord: vi
        .fn()
        .mockResolvedValue("at://did:plc:abc123/site.standard.publication/pub-key"),
      createOrUpdateDocumentRecord: vi
        .fn()
        .mockResolvedValue("at://did:plc:abc123/site.standard.document/doc-key")
    };
    vi.spyOn(publisherModule, "createPublisher").mockReturnValue(mockPublisher);

    const fakePost = {
      url: "/posts/hello/",
      date: new Date("2026-01-01T00:00:00.000Z"),
      data: { title: "Hello", description: "World" }
    };

    pluginStandardSite(config, baseOptions);

    const collectionCallback = config.addCollection.mock.calls[0][1];
    collectionCallback({
      getAll: () => [{ ...fakePost, data: { ...fakePost.data, standardSiteDocument: true } }]
    });

    const afterHandler = config._handlers["eleventy.after"];
    await afterHandler({ dir: { output: "/tmp/output" } });

    expect(mockPublisher.createOrUpdateDocumentRecord).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Skipping link tag injection for /tmp/output/posts/hello/index.html: file does not include a </head> tag."
    );
  });

  it("continues processing remaining posts when one document sync fails", async () => {
    const config = makeEleventyConfig();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(fs, "readdirSync").mockReturnValue([] as fs.Dirent[]);

    const mockPublisher = {
      startSession: vi.fn().mockResolvedValue(undefined),
      createOrUpdatePublicationRecord: vi
        .fn()
        .mockResolvedValue("at://did:plc:abc123/site.standard.publication/pub-key"),
      createOrUpdateDocumentRecord: vi
        .fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce("at://did:plc:abc123/site.standard.document/doc-key-2")
    };
    vi.spyOn(publisherModule, "createPublisher").mockReturnValue(mockPublisher);

    const posts = [
      { url: "/posts/fail/", date: new Date("2026-01-01T00:00:00.000Z"), data: { title: "Fail" } },
      { url: "/posts/ok/", date: new Date("2026-01-02T00:00:00.000Z"), data: { title: "Ok" } }
    ];

    pluginStandardSite(config, baseOptions);

    const collectionCallback = config.addCollection.mock.calls[0][1];
    collectionCallback({
      getAll: () =>
        posts.map((post) => ({ ...post, data: { ...post.data, standardSiteDocument: true } }))
    });

    const afterHandler = config._handlers["eleventy.after"];
    await afterHandler({ dir: { output: "/tmp/output" } });

    expect(mockPublisher.createOrUpdateDocumentRecord).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to sync document record for /posts/fail/:",
      expect.any(Error)
    );
  });
});
