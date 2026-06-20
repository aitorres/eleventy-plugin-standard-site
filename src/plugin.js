import { createPublisher } from "./publisher.js";

const DEFAULT_OPTIONS = {
    pds: "https://bsky.social",
    identifier: null,
    password: null
}

export default function standardSitePlugin(eleventyConfig, options) {
    options = { ...DEFAULT_OPTIONS, ...options };

    // Run once after build
    eleventyConfig.on('eleventy.after', async () => {
        const publisher = createPublisher(options);

        try {
            const jwt = await publisher.createSession();
            console.log("Successfully authenticated to PDS");
        } catch (error) {
            console.error("Failed to authenticate to PDS:", error);
            return;
        }

        console.log("TODO: Implement record creation logic!")
    })
}
