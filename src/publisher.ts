import {
  ENDPOINTS,
  LEXICONS,
  PublisherOptions,
  SessionResponse,
  Record,
  CreateOrPutRecordResponse,
  ListRecordsResponse,
  Publication,
  PublicationWithUri,
  Publisher,
  Document,
  DocumentWithUri,
  DEFAULT_PDS_URL
} from "./types";
import { extractRecordKey, normalizePdsUrl, normalizeIdentifier } from "./utils";

export function createPublisher({ pds, identifier, password }: PublisherOptions): Publisher {
  if (!pds) {
    pds = DEFAULT_PDS_URL;
  }

  if (!identifier || !password) {
    throw new Error("Missing required PDS configuration: identifier and password are required.");
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
    checkSession();
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
          Authorization: `Bearer ${accessJwt}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list ${collection} records: ${response.statusText}`);
      }

      const data = (await response.json()) as ListRecordsResponse;
      records.push(...data.records);

      cursor = data.cursor ?? undefined;
    } while (cursor);

    return records;
  };

  const getPublicationRecords = async (): Promise<PublicationWithUri[]> => {
    const records = await listRecords(LEXICONS.publication);
    return records.map((record) => ({ ...(record.value as Publication), uri: record.uri }));
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

  const getSiteDocumentRecords = async (site: string): Promise<DocumentWithUri[]> => {
    const records = await listRecords(LEXICONS.document);
    return records
      .filter((record) => (record.value as Document).site === site)
      .map((record) => ({ ...(record.value as Document), uri: record.uri }));
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
        throw new Error(
          `Failed to create session on PDS ${pds} with provided credentials: ${response.statusText}`
        );
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
    },

    createOrUpdateDocumentRecord: async (document: Document): Promise<string> => {
      checkSession();

      // Try getting existing record to determine if we need to create or update
      const existingRecords = await getSiteDocumentRecords(document.site);
      const existingRecord = existingRecords.find((record) => record.path === document.path);

      let recordUri: string | undefined;
      if (existingRecord) {
        console.log(`Existing document record found for path ${document.path}, updating...`);

        const existingRecordUri = existingRecord.uri;
        const existingRecordKey = extractRecordKey(existingRecordUri);

        const updateRecordResponse = await putRecord(
          LEXICONS.document,
          existingRecordKey,
          document
        );
        recordUri = updateRecordResponse.uri;
      } else {
        console.log(
          `No existing document record found for path ${document.path}, creating new record...`
        );

        const newRecordResponse = await createRecord(LEXICONS.document, document);
        recordUri = newRecordResponse.uri;
      }

      const recordKey = extractRecordKey(recordUri);
      console.log(
        `Document record for path ${document.path} available at URI: ${recordUri} (record key: ${recordKey})`
      );

      return recordUri;
    }
  };
}
