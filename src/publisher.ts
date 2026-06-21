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
  DEFAULT_PDS_URL,
  BlobRef,
  BasicTheme,
  ColorConfig,
  UploadBlobResponse,
  RGBColor
} from "./types";
import { extractRecordKey, normalizePdsUrl, normalizeIdentifier } from "./utils";
import { readFileSync, existsSync } from "fs";
import mime from "mime-types";

/** Creates a {@link Publisher} that authenticates to the PDS and syncs records. */
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

  const uploadBlob = async (filePath: string): Promise<BlobRef> => {
    checkSession();

    const fileBuffer = readFileSync(filePath);
    const mimeType = mime.lookup(filePath) || "application/octet-stream";

    const response = await fetch(getEndpointUrl(ENDPOINTS.uploadBlob), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        "Content-Type": mimeType
      },
      body: fileBuffer
    });

    if (!response.ok) {
      throw new Error(`Failed to upload blob: ${response.statusText}`);
    }

    const data = (await response.json()) as UploadBlobResponse;
    return data.blob;
  };

  const getBlobBuffer = async (cid: string): Promise<Buffer> => {
    const params = new URLSearchParams();
    params.set("did", normalizedIdentifier);
    params.set("cid", cid);

    const url = new URL(getEndpointUrl(ENDPOINTS.getBlob));
    url.search = params.toString();

    const response = await fetch(url.toString(), {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch existing blob ${cid}: ${response.statusText}`);
    }

    const body = await response.arrayBuffer();
    return Buffer.from(body);
  };

  const isSameFileAsExistingBlob = async (filePath: string, blob: BlobRef): Promise<boolean> => {
    const localFileBuffer = readFileSync(filePath);
    const existingBlobBuffer = await getBlobBuffer(blob.ref.$link);
    return localFileBuffer.equals(existingBlobBuffer);
  };

  const resolveBlobFromPath = async (options: {
    filePath?: string;
    existingBlob?: BlobRef;
  }): Promise<BlobRef | undefined> => {
    const { filePath, existingBlob } = options;

    if (!filePath) {
      return undefined;
    }

    if (!existsSync(filePath)) {
      console.warn(`\tBlob file not found: ${filePath}`);
      return undefined;
    }

    try {
      if (existingBlob) {
        const shouldReuseExistingBlob = await isSameFileAsExistingBlob(filePath, existingBlob);
        if (shouldReuseExistingBlob) {
          return existingBlob;
        }
      }

      return await uploadBlob(filePath);
    } catch (error) {
      console.warn(`Failed to process blob from ${filePath}:`, error);
      return undefined;
    }
  };

  const isValidRgbColor = (color: RGBColor): boolean => {
    for (const channel of [color.r, color.g, color.b]) {
      if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
        return false;
      }
    }

    return true;
  };

  const colorConfigToBasicTheme = (colors: ColorConfig): BasicTheme => {
    if (!colors.bg || !colors.fg || !colors.accent || !colors.accentFg) {
      throw new Error(
        "Incomplete color configuration provided. All colors (bg, fg, accent, accentFg) are required if you want to create a basic theme."
      );
    }

    if (
      !isValidRgbColor(colors.bg) ||
      !isValidRgbColor(colors.fg) ||
      !isValidRgbColor(colors.accent) ||
      !isValidRgbColor(colors.accentFg)
    ) {
      throw new Error("Invalid color configuration provided. RGB color values must be integers between 0 and 255.");
    }

    return {
      $type: LEXICONS.basicTheme,
      background: {
        $type: LEXICONS.rgbColor,
        r: colors.bg.r,
        g: colors.bg.g,
        b: colors.bg.b
      },
      foreground: {
        $type: LEXICONS.rgbColor,
        r: colors.fg.r,
        g: colors.fg.g,
        b: colors.fg.b
      },
      accent: {
        $type: LEXICONS.rgbColor,
        r: colors.accent.r,
        g: colors.accent.g,
        b: colors.accent.b
      },
      accentForeground: {
        $type: LEXICONS.rgbColor,
        r: colors.accentFg.r,
        g: colors.accentFg.g,
        b: colors.accentFg.b
      }
    };
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
        method: "GET"
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

  const createRecord = async (collection: string, value: object): Promise<CreateOrPutRecordResponse> => {
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
        throw new Error(`Failed to create session on PDS ${pds} with provided credentials: ${response.statusText}`);
      }

      const data = (await response.json()) as SessionResponse;
      accessJwt = data.accessJwt;
    },

    createOrUpdatePublicationRecord: async (
      publication: Publication,
      options?: { themeColors?: ColorConfig; iconPath?: string }
    ) => {
      checkSession();

      const publicationToPublish: Publication = { ...publication };

      if (options?.themeColors) {
        publicationToPublish.basicTheme = colorConfigToBasicTheme(options.themeColors);
      }

      // Try getting existing record to determine if we need to create or update
      const existingRecords = await getPublicationRecords();
      const existingRecord = existingRecords.find((record) => record.url === publication.url);

      const resolvedIconBlob = await resolveBlobFromPath({
        filePath: options?.iconPath,
        existingBlob: existingRecord?.icon
      });
      if (resolvedIconBlob) {
        publicationToPublish.icon = resolvedIconBlob;
      }

      let recordUri: string | undefined;
      if (existingRecord) {
        const existingRecordUri = existingRecord.uri;
        const existingRecordKey = extractRecordKey(existingRecordUri);

        const updateRecordResponse = await putRecord(LEXICONS.publication, existingRecordKey, publicationToPublish);
        recordUri = updateRecordResponse.uri;
      } else {
        const newRecordResponse = await createRecord(LEXICONS.publication, publicationToPublish);
        recordUri = newRecordResponse.uri;
      }

      const recordKey = extractRecordKey(recordUri);
      console.log(
        `Publication record for URL ${publication.url} available at URI: ${recordUri} (record key: ${recordKey})`
      );

      return recordUri;
    },

    createOrUpdateDocumentRecord: async (
      document: Document,
      options?: { coverImagePath?: string }
    ): Promise<string> => {
      checkSession();

      const documentToPublish: Document = { ...document };

      // Try getting existing record to determine if we need to create or update
      const existingRecords = await getSiteDocumentRecords(document.site);
      const existingRecord = existingRecords.find((record) => record.path === document.path);

      const resolvedCoverImageBlob = await resolveBlobFromPath({
        filePath: options?.coverImagePath,
        existingBlob: existingRecord?.coverImage
      });
      if (resolvedCoverImageBlob) {
        documentToPublish.coverImage = resolvedCoverImageBlob;
      }

      let recordUri: string | undefined;
      if (existingRecord) {
        const existingRecordUri = existingRecord.uri;
        const existingRecordKey = extractRecordKey(existingRecordUri);

        const updateRecordResponse = await putRecord(LEXICONS.document, existingRecordKey, documentToPublish);
        recordUri = updateRecordResponse.uri;
      } else {
        const newRecordResponse = await createRecord(LEXICONS.document, documentToPublish);
        recordUri = newRecordResponse.uri;
      }

      const recordKey = extractRecordKey(recordUri);
      console.log(
        `\tDocument record for path ${document.path} available at URI: ${recordUri} (record key: ${recordKey})`
      );

      return recordUri;
    }
  };
}
