import type { HarnessReport } from "@skillstudio/contracts";

export interface HarnessesService {
  list(): Promise<HarnessReport[]>;
}

export interface HarnessesServiceOptions {
  discoverHarnesses: () => Promise<HarnessReport[]>;
}

export function createHarnessesService(
  options: HarnessesServiceOptions,
): HarnessesService {
  return {
    list: options.discoverHarnesses,
  };
}
