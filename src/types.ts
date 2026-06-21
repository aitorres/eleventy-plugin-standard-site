export const DEFAULT_PDS_URL = "https://bsky.social";

export const ENDPOINTS = {
  createSession: "/xrpc/com.atproto.server.createSession",
  createRecord: "/xrpc/com.atproto.repo.createRecord",
  putRecord: "/xrpc/com.atproto.repo.putRecord",
  listRecords: "/xrpc/com.atproto.repo.listRecords",
  uploadBlob: "/xrpc/com.atproto.repo.uploadBlob",
  getBlob: "/xrpc/com.atproto.sync.getBlob"
};

export const LEXICONS = {
  publication: "site.standard.publication",
  document: "site.standard.document",
  basicTheme: "site.standard.theme.basic",
  rgbColor: "site.standard.theme.color#rgb"
};

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ColorConfig {
  bg: RGBColor;
  fg: RGBColor;
  accent: RGBColor;
  accentFg: RGBColor;
}

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

export interface BlobRef {
  $type: "blob";
  ref: {
    $link: string;
  };
  mimeType: string;
  size: number;
}

export interface PublisherOptions {
  pds?: string;
  identifier?: string;
  password?: string;
}

export interface SessionResponse {
  accessJwt: string;
}

export interface Record {
  cid: string;
  uri: string;
  value: object;
}

export interface CreateOrPutRecordResponse {
  uri: string;
  cid: string;
  commit: {
    cid: string;
    rev: string;
  };
  validationStatus: string;
}

export interface ListRecordsResponse {
  cursor: string | null;
  records: Record[];
}

export interface UploadBlobResponse {
  blob: BlobRef;
}

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

export interface PublicationWithUri extends Publication {
  uri: string;
}

export interface DocumentWithUri extends Document {
  uri: string;
}

export interface Publisher {
  startSession: () => Promise<void>;
  createOrUpdatePublicationRecord: (
    publication: Publication,
    options?: { themeColors?: ColorConfig; iconPath?: string }
  ) => Promise<string>;
  createOrUpdateDocumentRecord: (
    document: Document,
    options?: { coverImagePath?: string }
  ) => Promise<string>;
}

export type StandardSitePluginOptions = Partial<PublisherOptions> & {
  publicationName: string;
  publicationDescription?: string;
  publicationUrl: string;
  showInDiscover?: boolean;
  themeColors?: ColorConfig;
  publicationIconPath?: string;
};
