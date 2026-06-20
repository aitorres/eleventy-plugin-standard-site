const ENDPOINTS = {
    createSession: "/xrpc/com.atproto.server.createSession",
    refreshSession: "/xrpc/com.atproto.server.refreshSession",
    createRecord: "/xrpc/com.atproto.repo.createRecord"
}

export default function createPublisher(options) {
    const { pds, identifier, password } = options;

    if (!pds || !identifier || !password) {
        throw new Error("Missing required PDS configuration: pds, identifier, and password are all required.");
    }

    const normalizedPds = normalizePdsUrl(pds);

    return {
        createSession: async () => {
            const response = await fetch(`${normalizedPds}${ENDPOINTS.createSession}`, {
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

            const data = await response.json();
            return data.accessJwt;
        }
    }
}

function normalizePdsUrl(url) {
    let normalizedUrl = url.trim();

    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
        normalizedUrl = `https://${normalizedUrl}`;
    }

    if (normalizedUrl.endsWith("/")) {
        normalizedUrl = normalizedUrl.slice(0, -1);
    }

    return normalizedUrl;
}
