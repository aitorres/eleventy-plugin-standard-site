import { createPublisher } from "./publisher";
import { LEXICONS, Publication, StandardSitePluginOptions } from "./types";
import path from "path";
import fs from "fs";

const DEFAULT_OPTIONS: Partial<StandardSitePluginOptions> = {
  pds: "https://bsky.social",
  showInDiscover: true
};

type EleventyAfterEvent = "eleventy.after";

interface EleventyAfterEventData {
  dir: {
    output: string;
  };
}

interface EleventyConfigLike {
  on(
    event: EleventyAfterEvent,
    callback: (data: EleventyAfterEventData) => Promise<void> | void
  ): void;
}

export default function pluginStandardSite(
  eleventyConfig: EleventyConfigLike,
  options: StandardSitePluginOptions
): void {
  const resolvedOptions: StandardSitePluginOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

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
        showInDiscover: resolvedOptions.showInDiscover ?? true
      }
    };
    const publicationRecordUri = await publisher.createOrUpdatePublicationRecord(publication);

    // Expose .well-known endpoint for the publication record
    const outputDir = dir.output;
    const wellKnownEndpointPath = path.join(outputDir, ".well-known", "site.standard.publication");

    fs.mkdirSync(path.dirname(wellKnownEndpointPath), { recursive: true });
    fs.writeFileSync(wellKnownEndpointPath, publicationRecordUri, "utf-8");
  });
}
