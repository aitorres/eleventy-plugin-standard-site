# eleventy-plugin-standard-site

[11ty](https://www.11ty.dev/) plugin to generate and publish [Standard.Site](https://standard.site/) records on your [AT Protocol](https://atproto.com/) PDS for your site.

## Installation

This project supports Node.js 18 and later. You can install the plugin from `npm`:

```bash
npm install eleventy-plugin-standard-site
```

## Usage

Add the plugin to your Eleventy configuration file, e.g.:

```js
import { pluginStandardSite } from "eleventy-plugin-standard-site";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(pluginStandardSite, {
    // Publication details for your site
    publicationName: "My Site",
    publicationDescription: "A blog where I write about my life!",
    publicationUrl: "https://example.com",
    // You can use your ATProto DID or handle
    identifier: "did:plc:abc123",
    // Please use an app-password!
    password: "app-password-xyz",

    // Optional: whether the publication should appear in discovery feeds, defaults to true
    showInDiscover: true,
    // Optional: PDS URL, defaults to "https://bsky.social"
    pds: "https://bsky.social",
    // Optional: Eleventy collection tag used to identify pages to publish, defaults to "standard-site-document"
    standardSiteDocumentTag: "standard-site-document"
  });
}
```

The plugin will get triggered on build time after Eleventy has generated the output files, and will integrate your website with Standard.Site lexicons as follows:

- One `site.standard.publication` record will be created (or updated) for the site as a whole, containing the publication metadata you provided in the plugin options.
- The `.well-known/site.standard.publication` endpoint will be created in your output directory, verifying the publication record's AT URI.
- One `site.standard.document` record will be created (or updated) for each page tagged with the value of `standardSiteDocumentTag` (default: `"standard-site-document"`), containing page metadata and a reference to the page URL.

Metadata for documents will be taken from the page's front matter. The example below lists all supported fields:

```yaml
---
title: "My First Post"
description: "This is the description of my first post."
date: 2026-06-20
tags:
  - standard-site-document

# Optional
bskyPostRef: "at://did:plc:abc123/app.bsky.feed.post/def456"
---
```

## Contributing

To set up the development environment, clone the repository and install dependencies with `npm install`. Development environment requires Node.js 22 or later.

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
