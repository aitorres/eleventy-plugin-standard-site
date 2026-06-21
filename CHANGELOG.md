# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-21

We're live! 🎉

### Added

- Initial release of the Eleventy plugin for [Standard.site](https://standard.site/).
  - Exposes an Eleventy plugin that can be used at build time to integrate an Eleventy website with Standard.site lexicons and publish metadata records to an AT Protocol PDS.
  - Supports creating or updating a `site.standard.publication` record for the site, including name, description, URL, discovery preference, and optional icon and theme colors.
  - Supports creating or updating a `site.standard.document` record for each page whose front matter sets `standardSiteDocument: true`, including title, published date, path, description, and optional cover image, text content and Bluesky post reference.
  - Automatic text content extraction from each document's rendered HTML, toggleable via the `includeTextContent` option.
  - Injects `<link rel="site.standard.publication" ... />` tags into every generated HTML page and `<link rel="site.standard.document" ... />` tags into published document pages.
  - Generates a `.well-known/site.standard.publication` endpoint in the output directory verifying the publication record's AT URI.

[1.0.0]: https://github.com/aitorres/eleventy-plugin-standard-site/releases/tag/v1.0.0
