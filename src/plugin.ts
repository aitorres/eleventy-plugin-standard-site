import { createPublisher, type PublisherOptions } from "./publisher";

const DEFAULT_OPTIONS: PublisherOptions = {
  pds: "https://bsky.social"
};

type StandardSitePluginOptions = Partial<PublisherOptions>;

type EleventyAfterEvent = "eleventy.after";

interface EleventyConfigLike {
  on(event: EleventyAfterEvent, callback: () => Promise<void> | void): void;
}

export default function pluginStandardSite(
  eleventyConfig: EleventyConfigLike,
  options: StandardSitePluginOptions = {}
): void {
  const resolvedOptions: StandardSitePluginOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  eleventyConfig.on("eleventy.after", async () => {
    const publisher = createPublisher(resolvedOptions);

    try {
      await publisher.createSession();
      console.log("Successfully authenticated to PDS");
    } catch (error) {
      console.error("Failed to authenticate to PDS:", error);
      return;
    }

    console.log("TODO: Implement record creation logic!");
  });
}
