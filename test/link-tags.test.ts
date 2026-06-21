import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";

import { injectDocumentLinkTag, injectPublicationLinkTags } from "../src/link-tags";

function makeDirEntry(name: string, kind: "file" | "directory"): fs.Dirent {
  return {
    name,
    isFile: () => kind === "file",
    isDirectory: () => kind === "directory"
  } as fs.Dirent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("link-tags", () => {
  it("injects the document link tag into the post html file", () => {
    const readFileSyncSpy = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue("<html><head></head><body>content</body></html>");
    const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

    injectDocumentLinkTag("/tmp/output", "/posts/hello/", "at://did:plc:abc123/site.standard.document/doc-key");

    expect(readFileSyncSpy).toHaveBeenCalledWith("/tmp/output/posts/hello/index.html", "utf-8");
    const htmlWriteCall = writeFileSyncSpy.mock.calls[0];
    expect(htmlWriteCall?.[0]).toBe("/tmp/output/posts/hello/index.html");
    expect(htmlWriteCall?.[1]).toContain('rel="site.standard.document"');
    expect(htmlWriteCall?.[1]).toContain('href="at://did:plc:abc123/site.standard.document/doc-key"');
  });

  it("updates an existing document link tag href", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      '<html><head><link rel="site.standard.document" href="at://old/value" /></head><body>content</body></html>'
    );
    const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

    injectDocumentLinkTag("/tmp/output", "/posts/hello/", "at://did:plc:abc123/site.standard.document/doc-key");

    const htmlWriteCall = writeFileSyncSpy.mock.calls[0];
    expect(htmlWriteCall?.[1]).toContain('href="at://did:plc:abc123/site.standard.document/doc-key"');
    expect(htmlWriteCall?.[1]).not.toContain('href="at://old/value"');
  });

  it("warns and skips when html file has no head tag", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(fs, "readFileSync").mockReturnValue("<html><body>content</body></html>");
    const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

    injectDocumentLinkTag("/tmp/output", "/posts/hello/", "at://did:plc:abc123/site.standard.document/doc-key");

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Skipping link tag injection for /tmp/output/posts/hello/index.html: file does not include a </head> tag."
    );
  });

  it("injects publication link tags into all discovered html files", () => {
    vi.spyOn(fs, "readdirSync")
      .mockReturnValueOnce([
        makeDirEntry("posts", "directory"),
        makeDirEntry("index.html", "file"),
        makeDirEntry("styles.css", "file")
      ] as fs.Dirent[])
      .mockReturnValueOnce([makeDirEntry("article.html", "file")] as fs.Dirent[]);
    const readFileSyncSpy = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue("<html><head></head><body>content</body></html>");
    const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

    injectPublicationLinkTags("/tmp/output", "at://did:plc:abc123/site.standard.publication/pub-key");

    expect(readFileSyncSpy).toHaveBeenCalledWith("/tmp/output/index.html", "utf-8");
    expect(readFileSyncSpy).toHaveBeenCalledWith("/tmp/output/posts/article.html", "utf-8");

    const writeContents = writeFileSyncSpy.mock.calls.map(([, content]) => String(content));
    expect(writeContents).toHaveLength(2);
    expect(writeContents[0]).toContain('rel="site.standard.publication"');
    expect(writeContents[0]).toContain('href="at://did:plc:abc123/site.standard.publication/pub-key"');
    expect(writeContents[1]).toContain('rel="site.standard.publication"');
  });
});
