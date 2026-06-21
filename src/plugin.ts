import { createPublisher } from "./publisher";
import {
  LEXICONS,
  Publication,
  StandardSitePluginOptions,
  Document,
  DEFAULT_PDS_URL
} from "./types";
import path from "path";
import fs from "fs";

const STANDARD_SITE_DOCUMENT_REL = LEXICONS.document;

const DEFAULT_OPTIONS: Partial<StandardSitePluginOptions> = {
  pds: DEFAULT_PDS_URL,
  showInDiscover: true
};

type EleventyAfterEvent = "eleventy.after";

interface EleventyAfterEventData {
  dir: {
    output: string;
  };
}

interface EleventyCollectionItemData {
  title: string;
  description?: string;
  bskyPostRef?: string;
  standardSiteDocument?: boolean;
}

interface EleventyCollectionItem {
  url: string;
  date: Date;
  data: EleventyCollectionItemData;
}

interface EleventyCollectionApiLike {
  getAll(): EleventyCollectionItem[];
}

interface EleventyConfigLike {
  addCollection(
    name: string,
    callback: (collection: EleventyCollectionApiLike) => EleventyCollectionItem[]
  ): void;
  on(
    event: EleventyAfterEvent,
    callback: (data: EleventyAfterEventData) => Promise<void> | void
  ): void;
}

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

function upsertStandardSiteDocumentLinkTag(
  outputDir: string,
  postUrl: string,
  documentRecordUri: string
): void {
  const htmlPath = getOutputHtmlPath(outputDir, postUrl);
  const linkTag = `<link rel="${STANDARD_SITE_DOCUMENT_REL}" href="${documentRecordUri}" />`;
  const existingLinkPattern = new RegExp(
    `<link\\b[^>]*\\brel=(?:"${STANDARD_SITE_DOCUMENT_REL}"|'${STANDARD_SITE_DOCUMENT_REL}')[^>]*>`,
    "i"
  );

  let htmlContent: string;
  try {
    htmlContent = fs.readFileSync(htmlPath, "utf-8");
  } catch (error) {
    console.warn(`Skipping link tag injection for ${postUrl}: failed reading ${htmlPath}.`, error);
    return;
  }

  let updatedHtmlContent = htmlContent;
  if (existingLinkPattern.test(updatedHtmlContent)) {
    updatedHtmlContent = updatedHtmlContent.replace(existingLinkPattern, linkTag);
  } else if (/<\/head>/i.test(updatedHtmlContent)) {
    updatedHtmlContent = updatedHtmlContent.replace(/<\/head>/i, `  ${linkTag}\n</head>`);
  } else {
    console.warn(
      `Skipping link tag injection for ${postUrl}: ${htmlPath} does not include a </head> tag.`
    );
    return;
  }

  if (updatedHtmlContent === htmlContent) {
    return;
  }

  try {
    fs.writeFileSync(htmlPath, updatedHtmlContent, "utf-8");
  } catch (error) {
    console.warn(`Skipping link tag injection for ${postUrl}: failed writing ${htmlPath}.`, error);
  }
}

export default function pluginStandardSite(
  eleventyConfig: EleventyConfigLike,
  options: StandardSitePluginOptions
): void {
  const resolvedOptions: StandardSitePluginOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  let standardSiteDocumentPosts: EleventyCollectionItem[] = [];
  eleventyConfig.addCollection("standardSiteDocuments", (collection: EleventyCollectionApiLike) => {
    standardSiteDocumentPosts = collection
      .getAll()
      .filter((item) => item.data.standardSiteDocument === true);
    return standardSiteDocumentPosts;
  });

  eleventyConfig.on("eleventy.after", async ({ dir }) => {
    const publisher = createPublisher(resolvedOptions);

    // Authenticating to the PDS
    try {
      await publisher.startSession();
      console.log("Successfully authenticated to PDS");
    } catch (error) {
      console.error("Failed to authenticate to PDS:", error);
      return;
    }

    // Get or create the publication record
    const publication: Publication = {
      $type: LEXICONS.publication,
      url: resolvedOptions.publicationUrl,
      name: resolvedOptions.publicationName,
      description: resolvedOptions.publicationDescription,
      preferences: {
        showInDiscover: resolvedOptions.showInDiscover ?? DEFAULT_OPTIONS.showInDiscover!
      }
    };
    const publicationRecordUri = await publisher.createOrUpdatePublicationRecord(publication);

    // Expose .well-known endpoint for the publication record
    const outputDir = dir.output;
    const wellKnownEndpointPath = path.join(outputDir, ".well-known", LEXICONS.publication);

    fs.mkdirSync(path.dirname(wellKnownEndpointPath), { recursive: true });
    fs.writeFileSync(wellKnownEndpointPath, publicationRecordUri, "utf-8");

    // Create or update document records for each post with standardSiteDocument: true
    for (const post of standardSiteDocumentPosts) {
      console.log(`Processing post: ${post.url}`);
      const documentRecord: Document = {
        site: publicationRecordUri,
        title: post.data.title,
        publishedAt: post.date,
        path: post.url,
        description: post.data.description,
        bskyPostRef: post.data.bskyPostRef
      };

      try {
        const documentRecordUri = await publisher.createOrUpdateDocumentRecord(documentRecord);
        upsertStandardSiteDocumentLinkTag(outputDir, post.url, documentRecordUri);
      } catch (error) {
        console.error(`Failed to sync document record for ${post.url}:`, error);
      }
    }

    console.log(
      `Finished processing Standard.Site records with 1 publication and ${standardSiteDocumentPosts.length} documents.`
    );
  });
}
