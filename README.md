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
    // You can use your DID or handle
    identifier: "did:plc:abc123",
    // Please use an app-password!
    password: "app-password-xyz",
    // Optional: PDS URL, defaults to "https://bsky.social"
    pds: "https://bsky.social"
  });
}
```

The plugin will get triggered on build time after Eleventy has generated the output files.

## Contributing

To set up the development environment, clone the repository and install dependencies with `npm install`. Development environment requires Node.js 22 or later.

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
