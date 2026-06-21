export const DEFAULT_PDS_URL = "https://bsky.social";

export const ENDPOINTS = {
  createSession: "/xrpc/com.atproto.server.createSession",
  createRecord: "/xrpc/com.atproto.repo.createRecord",
  putRecord: "/xrpc/com.atproto.repo.putRecord",
  listRecords: "/xrpc/com.atproto.repo.listRecords"
};

export const LEXICONS = {
  publication: "site.standard.publication",
  document: "site.standard.document"
};

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

export interface Publication {
  $type: string;
  url: string;
  name: string;
  description?: string;
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
  createOrUpdatePublicationRecord: (publication: Publication) => Promise<string>;
  createOrUpdateDocumentRecord: (document: Document) => Promise<string>;
}

export type StandardSitePluginOptions = Partial<PublisherOptions> & {
  publicationName: string;
  publicationDescription?: string;
  publicationUrl: string;
  showInDiscover?: boolean;
};
