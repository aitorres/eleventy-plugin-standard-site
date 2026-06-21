/** Default AT Protocol PDS URL used when none is configured. */
export const DEFAULT_PDS_URL = "https://bsky.social";

/** AT Protocol XRPC endpoint paths used by the publisher. */
export const ENDPOINTS = {
  createSession: "/xrpc/com.atproto.server.createSession",
  createRecord: "/xrpc/com.atproto.repo.createRecord",
  putRecord: "/xrpc/com.atproto.repo.putRecord",
  listRecords: "/xrpc/com.atproto.repo.listRecords",
  uploadBlob: "/xrpc/com.atproto.repo.uploadBlob",
  getBlob: "/xrpc/com.atproto.sync.getBlob"
};

/** Standard.site lexicon NSIDs for the records this plugin manages. */
export const LEXICONS = {
  publication: "site.standard.publication",
  document: "site.standard.document",
  basicTheme: "site.standard.theme.basic",
  rgbColor: "site.standard.theme.color#rgb"
};

/** An RGB color with channel values in the 0–255 range. */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/** Theme color set accepted in the plugin options. */
export interface ColorConfig {
  bg: RGBColor;
  fg: RGBColor;
  accent: RGBColor;
  accentFg: RGBColor;
}

/** Basic theme record as stored in a publication's `site.standard.theme.basic`. */
export interface BasicTheme {
  $type: string;
  background: {
    $type: string;
    r: number;
    g: number;
    b: number;
  };
  foreground: {
    $type: string;
    r: number;
    g: number;
    b: number;
  };
  accent: {
    $type: string;
    r: number;
    g: number;
    b: number;
  };
  accentForeground: {
    $type: string;
    r: number;
    g: number;
    b: number;
  };
}

/** Reference to a blob (e.g. uploaded image) stored on the PDS. */
export interface BlobRef {
  $type: "blob";
  ref: {
    $link: string;
  };
  mimeType: string;
  size: number;
}

/** Credentials and PDS configuration used to authenticate the publisher. */
export interface PublisherOptions {
  pds?: string;
  identifier?: string;
  password?: string;
}

/** Slim response from the PDS session creation endpoint. */
export interface SessionResponse {
  accessJwt: string;
  did: string;
}

/** A generic record returned stored in a PDS. */
export interface Record {
  cid: string;
  uri: string;
  value: object;
}

/** Response from creating or updating a record on the PDS. */
export interface CreateOrPutRecordResponse {
  uri: string;
  cid: string;
  commit: {
    cid: string;
    rev: string;
  };
  validationStatus: string;
}

/** Response from listing records of a given collection on the PDS. */
export interface ListRecordsResponse {
  cursor: string | null;
  records: Record[];
}

/** Response from uploading a blob to the PDS. */
export interface UploadBlobResponse {
  blob: BlobRef;
}

/** A `site.standard.publication` record describing the site as a whole. */
export interface Publication {
  $type: string;
  url: string;
  name: string;
  description?: string;
  basicTheme?: BasicTheme;
  icon?: BlobRef;
  preferences: {
    showInDiscover: boolean;
  };
}

/** A `site.standard.document` record describing a single published page. */
export interface Document {
  $type: string;
  site: string;
  title: string;
  publishedAt: string;
  path?: string;
  description?: string;
  coverImage?: BlobRef;
  textContent?: string;
  bskyPostRef?: string;
}

/** A publication record paired with its AT URI. */
export interface PublicationWithUri extends Publication {
  uri: string;
}

/** A document record paired with its AT URI. */
export interface DocumentWithUri extends Document {
  uri: string;
}

/** Client that authenticates to a PDS and syncs publication and document records. */
export interface Publisher {
  startSession: () => Promise<void>;
  createOrUpdatePublicationRecord: (
    publication: Publication,
    options?: { themeColors?: ColorConfig; iconPath?: string }
  ) => Promise<string>;
  createOrUpdateDocumentRecord: (document: Document, options?: { coverImagePath?: string }) => Promise<string>;
}

/** Configuration options accepted by the Eleventy plugin. */
export type StandardSitePluginOptions = Partial<PublisherOptions> & {
  publicationName: string;
  publicationDescription?: string;
  publicationUrl: string;
  showInDiscover?: boolean;
  includeTextContent?: boolean;
  themeColors?: ColorConfig;
  publicationIconPath?: string;
};
