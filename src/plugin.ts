import { createPublisher } from "./publisher";
import { LEXICONS, Publication, StandardSitePluginOptions, Document, DEFAULT_PDS_URL } from "./types";
import { injectDocumentLinkTag, injectPublicationLinkTags } from "./link-tags";
import striptags from "striptags";
import path from "path";
import fs from "fs";

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
  coverImagePath?: string;
}

interface EleventyCollectionItem {
  url: string;
  date: Date;
  templateContent?: string;
  data: EleventyCollectionItemData;
}

interface EleventyCollectionApiLike {
  getAll(): EleventyCollectionItem[];
}

interface EleventyConfigLike {
  addCollection(name: string, callback: (collection: EleventyCollectionApiLike) => EleventyCollectionItem[]): void;
  on(event: EleventyAfterEvent, callback: (data: EleventyAfterEventData) => Promise<void> | void): void;
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
    standardSiteDocumentPosts = collection.getAll().filter((item) => item.data.standardSiteDocument === true);
    return standardSiteDocumentPosts;
  });

  eleventyConfig.on("eleventy.after", async ({ dir }) => {
    const publisher = createPublisher(resolvedOptions);

    // Authenticating to the PDS
    try {
      await publisher.startSession();
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
    const publicationRecordUri = await publisher.createOrUpdatePublicationRecord(publication, {
      themeColors: resolvedOptions.themeColors,
      iconPath: resolvedOptions.publicationIconPath
    });

    // Expose .well-known endpoint for the publication record
    const outputDir = dir.output;
    const wellKnownEndpointPath = path.join(outputDir, ".well-known", LEXICONS.publication);

    fs.mkdirSync(path.dirname(wellKnownEndpointPath), { recursive: true });
    fs.writeFileSync(wellKnownEndpointPath, publicationRecordUri, "utf-8");
    injectPublicationLinkTags(outputDir, publicationRecordUri);

    // Create or update document records for each post with standardSiteDocument: true
    for (const post of standardSiteDocumentPosts) {
      console.log(`Processing post: ${post.url}`);
      const documentRecord: Document = {
        $type: LEXICONS.document,
        site: publicationRecordUri,
        title: post.data.title,
        publishedAt: post.date.toISOString(),
        path: post.url,
        description: post.data.description,
        bskyPostRef: post.data.bskyPostRef,
        textContent: post.templateContent !== undefined ? striptags(post.templateContent) : undefined
      };

      try {
        const documentRecordUri = await publisher.createOrUpdateDocumentRecord(documentRecord, {
          coverImagePath: post.data.coverImagePath
        });
        injectDocumentLinkTag(outputDir, post.url, documentRecordUri);
      } catch (error) {
        console.error(`Failed to sync document record for ${post.url}:`, error);
      }
    }

    console.log(
      `Finished processing Standard.site records with 1 publication and ${standardSiteDocumentPosts.length} documents.`
    );
  });
}
