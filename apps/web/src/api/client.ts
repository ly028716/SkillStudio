import type { ApiEnvelope, HarnessReport } from "@skillstudio/contracts";

export class ConnectorUnavailableError extends Error {
  constructor() {
    super("无法连接本地连接器");
    this.name = "ConnectorUnavailableError";
  }
}

export async function getHarnessReports(
  fetchImpl: typeof fetch,
  baseUrl: string,
): Promise<HarnessReport[]> {
  try {
    const response = await fetchImpl(`${baseUrl}/api/harnesses`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new ConnectorUnavailableError();
    }

    const envelope: ApiEnvelope<unknown> = await response.json();
    if (!Array.isArray(envelope.data)) {
      throw new ConnectorUnavailableError();
    }

    return envelope.data as HarnessReport[];
  } catch (error) {
    if (error instanceof ConnectorUnavailableError) {
      throw error;
    }

    throw new ConnectorUnavailableError();
  }
}
