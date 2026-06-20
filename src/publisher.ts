const ENDPOINTS = {
  createSession: "/xrpc/com.atproto.server.createSession",
  refreshSession: "/xrpc/com.atproto.server.refreshSession",
  createRecord: "/xrpc/com.atproto.repo.createRecord"
};

export interface PublisherOptions {
  pds?: string;
  identifier?: string;
  password?: string;
}

interface SessionResponse {
  accessJwt: string;
}

interface Publisher {
  createSession: () => Promise<string>;
}

export function createPublisher(options: PublisherOptions): Publisher {
  const { pds, identifier, password } = options;

  if (!pds || !identifier || !password) {
    throw new Error(
      "Missing required PDS configuration: pds, identifier, and password are all required."
    );
  }

  const normalizedPds = normalizePdsUrl(pds);
  const getEndpointUrl = (endpoint: string) => `${normalizedPds}${endpoint}`;

  return {
    createSession: async () => {
      const response = await fetch(getEndpointUrl(ENDPOINTS.createSession), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          identifier,
          password
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const data = (await response.json()) as SessionResponse;
      return data.accessJwt;
    }
  };
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
