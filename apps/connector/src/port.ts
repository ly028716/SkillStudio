const DEFAULT_PORT = 4317;

export function parseConnectorPort(value: string | undefined): number {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("SKILLSTUDIO_PORT must be an integer from 1024 through 65535.");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error("SKILLSTUDIO_PORT must be an integer from 1024 through 65535.");
  }
  return port;
}
