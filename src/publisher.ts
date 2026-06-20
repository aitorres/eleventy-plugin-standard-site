const ENDPOINTS = {
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

interface SessionResponse {
  accessJwt: string;
}

interface Record {
  cid: string;
  uri: string;
  value: object;
}

interface CreateOrPutRecordResponse {
  uri: string;
  cid: string;
  commit: {
    cid: string;
    rev: string;
  };
  validationStatus: string;
}

interface ListRecordsResponse {
  cursor: string | null;
  records: Record[];
}

export interface Publication {
  $type: string;
  url: string;
  name: string;
  description: string;
  preferences: {
    showInDiscover: boolean;
  };
}

export interface PublicationWithUri extends Publication {
  uri: string;
}

interface Publisher {
  startSession: () => Promise<void>;
  createOrUpdatePublicationRecord: (publication: Publication) => Promise<string>;
}

export function createPublisher({ pds, identifier, password }: PublisherOptions): Publisher {
  if (!pds || !identifier || !password) {
    throw new Error(
      "Missing required PDS configuration: pds, identifier, and password are all required."
    );
  }

  const normalizedPds = normalizePdsUrl(pds);
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const getEndpointUrl = (endpoint: string) => `${normalizedPds}${endpoint}`;

  let accessJwt: string | null = null;
  const checkSession = () => {
    if (!accessJwt) {
      throw new Error("Session not started. Call startSession() before making requests.");
    }
  };

  const listRecords = async (collection: string): Promise<Record[]> => {
    const baseEndpointUrl = getEndpointUrl(ENDPOINTS.listRecords);

    let cursor: string | undefined;
    const records: Record[] = [];
    do {
      const params = new URLSearchParams();
      params.set("collection", collection);
      params.set("repo", normalizedIdentifier);
      if (cursor) {
        params.set("cursor", cursor);
      }

      const url = new URL(baseEndpointUrl);
      url.search = params.toString();

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list ${collection} records: ${response.statusText}`);
      }

      const data = (await response.json()) as ListRecordsResponse;
      records.push(...data.records);

      if (data.cursor) {
        cursor = data.cursor;
      }
    } while (cursor);

    return records;
  };

  const getPublicationRecords = async (): Promise<PublicationWithUri[]> => {
    try {
      const records = await listRecords(LEXICONS.publication);
      return records.map((record) => ({ ...(record.value as Publication), uri: record.uri }));
    } catch (err) {
      console.error("Error fetching publication records:", err);
    }

    return [];
  };

  const createRecord = async (
    collection: string,
    value: object
  ): Promise<CreateOrPutRecordResponse> => {
    checkSession();

    const response = await fetch(getEndpointUrl(ENDPOINTS.createRecord), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        collection,
        record: value,
        repo: normalizedIdentifier
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create record in ${collection}: ${response.statusText}`);
    }

    return (await response.json()) as CreateOrPutRecordResponse;
  };

  const putRecord = async (
    collection: string,
    recordKey: string,
    value: object
  ): Promise<CreateOrPutRecordResponse> => {
    checkSession();

    const response = await fetch(getEndpointUrl(ENDPOINTS.putRecord), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        collection,
        rkey: recordKey,
        record: value,
        repo: normalizedIdentifier
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to update record in ${collection}: ${response.statusText}`);
    }

    return (await response.json()) as CreateOrPutRecordResponse;
  };

  return {
    startSession: async () => {
      const response = await fetch(getEndpointUrl(ENDPOINTS.createSession), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          identifier: normalizedIdentifier,
          password
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const data = (await response.json()) as SessionResponse;
      accessJwt = data.accessJwt;
    },

    createOrUpdatePublicationRecord: async (publication: Publication) => {
      checkSession();

      // Try getting existing record to determine if we need to create or update
      const existingRecords = await getPublicationRecords();
      const existingRecord = existingRecords.find((record) => record.url === publication.url);

      let recordUri: string | undefined;
      if (existingRecord) {
        console.log(`Existing publication record found for URL ${publication.url}, updating...`);

        const existingRecordUri = existingRecord.uri;
        const existingRecordKey = extractRecordKey(existingRecordUri);

        const updateRecordResponse = await putRecord(
          LEXICONS.publication,
          existingRecordKey,
          publication
        );
        recordUri = updateRecordResponse.uri;
      } else {
        console.log(
          `No existing publication record found for URL ${publication.url}, creating new record...`
        );

        const newRecordResponse = await createRecord(LEXICONS.publication, publication);
        recordUri = newRecordResponse.uri;
      }

      const recordKey = extractRecordKey(recordUri);
      console.log(
        `Publication record for URL ${publication.url} available at URI: ${recordUri} (record key: ${recordKey})`
      );

      return recordUri;
    }
  };
}

function extractRecordKey(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

function normalizePdsUrl(url: string): string {
  let normalizedUrl = url.trim();

  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  if (normalizedUrl.endsWith("/")) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

  return normalizedUrl;
}

function normalizeIdentifier(identifier: string): string {
  let normalizedIdentifier = identifier.trim();

  if (normalizedIdentifier.startsWith("@")) {
    normalizedIdentifier = normalizedIdentifier.slice(1);
  }

  return normalizedIdentifier;
}
