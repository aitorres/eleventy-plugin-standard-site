import fs from "fs";
import path from "path";
import { LEXICONS } from "./types";

const STANDARD_SITE_DOCUMENT_REL = LEXICONS.document;
const STANDARD_SITE_PUBLICATION_REL = LEXICONS.publication;

function getOutputHtmlPath(outputDir: string, postUrl: string): string {
  const normalizedPostUrl = postUrl.replace(/^\/+/, "");

  if (!normalizedPostUrl) {
    return path.join(outputDir, "index.html");
  }

  if (normalizedPostUrl.endsWith("/")) {
    return path.join(outputDir, normalizedPostUrl, "index.html");
  }

  if (path.extname(normalizedPostUrl)) {
    return path.join(outputDir, normalizedPostUrl);
  }

  return path.join(outputDir, normalizedPostUrl, "index.html");
}

function getOutputHtmlPaths(outputDir: string): string[] {
  const htmlPaths: string[] = [];
  const directoriesToVisit = [outputDir];

  while (directoriesToVisit.length > 0) {
    const currentDirectory = directoriesToVisit.pop();
    if (!currentDirectory) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
    } catch (error) {
      console.warn(`Skipping publication link tag injection: failed reading directory ${currentDirectory}.`, error);
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        directoriesToVisit.push(entryPath);
        continue;
      }

      if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".html") {
        htmlPaths.push(entryPath);
      }
    }
  }

  return htmlPaths;
}

function upsertLinkTagInHtmlFile(htmlPath: string, rel: string, href: string): void {
  const linkTag = `<link rel="${rel}" href="${href}" />`;
  const existingLinkPattern = new RegExp(`<link\\b[^>]*\\brel=(?:"${rel}"|'${rel}')[^>]*>`, "i");

  let htmlContent: string;
  try {
    htmlContent = fs.readFileSync(htmlPath, "utf-8");
  } catch (error) {
    console.warn(`Skipping link tag injection for ${htmlPath}: failed reading file.`, error);
    return;
  }

  let updatedHtmlContent = htmlContent;
  if (existingLinkPattern.test(updatedHtmlContent)) {
    updatedHtmlContent = updatedHtmlContent.replace(existingLinkPattern, linkTag);
  } else if (/<\/head>/i.test(updatedHtmlContent)) {
    updatedHtmlContent = updatedHtmlContent.replace(/<\/head>/i, `  ${linkTag}\n</head>`);
  } else {
    console.warn(`Skipping link tag injection for ${htmlPath}: file does not include a </head> tag.`);
    return;
  }

  if (updatedHtmlContent === htmlContent) {
    return;
  }

  try {
    fs.writeFileSync(htmlPath, updatedHtmlContent, "utf-8");
  } catch (error) {
    console.warn(`Skipping link tag injection for ${htmlPath}: failed writing file.`, error);
  }
}

/** Injects the `site.standard.document` link tag into the given post's HTML output. */
export function injectDocumentLinkTag(outputDir: string, postUrl: string, documentRecordUri: string): void {
  const htmlPath = getOutputHtmlPath(outputDir, postUrl);
  upsertLinkTagInHtmlFile(htmlPath, STANDARD_SITE_DOCUMENT_REL, documentRecordUri);
}

/** Injects the `site.standard.publication` link tag into every HTML file in the output. */
export function injectPublicationLinkTags(outputDir: string, publicationRecordUri: string): void {
  const htmlPaths = getOutputHtmlPaths(outputDir);
  for (const htmlPath of htmlPaths) {
    upsertLinkTagInHtmlFile(htmlPath, STANDARD_SITE_PUBLICATION_REL, publicationRecordUri);
  }
}
