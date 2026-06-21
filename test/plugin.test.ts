import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/link-tags", () => ({
  injectDocumentLinkTag: vi.fn(),
  injectPublicationLinkTags: vi.fn()
}));

import pluginStandardSite from "../src/plugin";
import * as publisherModule from "../src/publisher";
import { injectDocumentLinkTag, injectPublicationLinkTags } from "../src/link-tags";
import fs from "fs";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
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
      expect.objectContaining({
        $type: "site.standard.document",
        title: "Hello",
        path: "/posts/hello/",
        publishedAt: "2026-01-01T00:00:00.000Z"
      })
    );
    expect(injectPublicationLinkTags).toHaveBeenCalledWith(
      "/tmp/output",
      "at://did:plc:abc123/site.standard.publication/pub-key"
    );
    expect(injectDocumentLinkTag).toHaveBeenCalledWith(
      "/tmp/output",
      "/posts/hello/",
      "at://did:plc:abc123/site.standard.document/doc-key"
    );
  });

  it("works without publicationDescription (optional field)", async () => {
    const config = makeEleventyConfig();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

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

    const optionsWithoutDescription = { ...baseOptions, publicationDescription: undefined };
    pluginStandardSite(config, optionsWithoutDescription);

    const collectionCallback = config.addCollection.mock.calls[0][1];
    collectionCallback({ getAll: () => [] });

    const afterHandler = config._handlers["eleventy.after"];
    await afterHandler({ dir: { output: "/tmp/output" } });

    expect(mockPublisher.createOrUpdatePublicationRecord).toHaveBeenCalledWith(
      expect.not.objectContaining({ description: expect.anything() })
    );
  });

  it("derives textContent from templateContent by stripping HTML tags", async () => {
    const config = makeEleventyConfig();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

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
      templateContent: "<p>Hello <strong>world</strong>.</p>",
      data: { title: "Hello", standardSiteDocument: true }
    };

    pluginStandardSite(config, baseOptions);

    const collectionCallback = config.addCollection.mock.calls[0][1];
    collectionCallback({ getAll: () => [fakePost] });

    const afterHandler = config._handlers["eleventy.after"];
    await afterHandler({ dir: { output: "/tmp/output" } });

    expect(mockPublisher.createOrUpdateDocumentRecord).toHaveBeenCalledWith(
      expect.objectContaining({ textContent: "Hello world." })
    );
  });

  it("omits optional document fields when not present in front matter", async () => {
    const config = makeEleventyConfig();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

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
      data: { title: "Hello", standardSiteDocument: true }
    };

    pluginStandardSite(config, baseOptions);

    const collectionCallback = config.addCollection.mock.calls[0][1];
    collectionCallback({ getAll: () => [fakePost] });

    const afterHandler = config._handlers["eleventy.after"];
    await afterHandler({ dir: { output: "/tmp/output" } });

    const calledWith = mockPublisher.createOrUpdateDocumentRecord.mock.calls[0][0];
    expect(calledWith.description).toBeUndefined();
    expect(calledWith.textContent).toBeUndefined();
    expect(calledWith.bskyPostRef).toBeUndefined();
  });

  it("continues processing remaining posts when one document sync fails", async () => {
    const config = makeEleventyConfig();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

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
    expect(injectDocumentLinkTag).toHaveBeenCalledTimes(1);
    expect(injectDocumentLinkTag).toHaveBeenCalledWith(
      "/tmp/output",
      "/posts/ok/",
      "at://did:plc:abc123/site.standard.document/doc-key-2"
    );
  });
});
