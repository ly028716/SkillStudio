# M0 Foundation and Harness Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a runnable TypeScript workspace that discovers local Harness installations, exposes versioned shared contracts, and records reproducible Codex/Hermes capability evidence without claiming unsupported execution.

**Architecture:** Keep `prototype/` as the approved visual reference. Add an npm workspace with three first-class packages: `packages/contracts` owns dependency-free DTOs and error codes; `packages/harness-core` owns pure discovery/normalization functions; `apps/connector` owns the localhost HTTP process and invokes the pure package. A minimal `apps/web` shell reads connector health and Harness state only; no Skill file access, execution, or persistence is implemented in M0.

**Tech Stack:** Node.js 25, npm workspaces, TypeScript, `tsx` test runner, React 19, Vite, native Node HTTP server, existing `prototype/` retained as reference.

**Spec:** `docs/superpowers/specs/2026-09-05-skillstudio-multi-harness-design.md`, `docs/superpowers/specs/2026-09-05-skillstudio-ui.md`, and `prototype/design-qa.md`.

## Global Constraints

- Target platform is Windows 11 with a desktop-browser-first experience.
- Keep the connector bound to `127.0.0.1`; M0 does not expose a LAN listener or WebSocket endpoint.
- Do not install, authenticate, or invoke a Harness as part of discovery.
- Codex CLI `0.153.4` was detected on 2026-09-10; reproduce the observation in a capability record.
- Hermes Agent source checkout was supplied at `D:\IDEWorkplaces\GitHub\hermes-agent` on 2026-09-10; its `pyproject.toml` declares version `0.21.0` and its root `hermes` launcher is the source entry point.
- No Python runtime was available on this machine on 2026-09-10, so Hermes source execution is `blocked` by a missing runtime; do not install Python or claim the source checkout is runnable.
- Hermes static compatibility evidence: trusted project skills resolve from `<project>/.hermes/skills` and `<project>/.agents/skills`; `skills.external_dirs` is the alternative configured directory path. A trusted project root is required before project skills load.
- DeepSeek Harness source checkout was supplied at `D:\IDEWorkplaces\GitHub\deepseek-harness` on 2026-09-10; its root package declares version `0.1.3-alpha.1` and supports Node `^22.19.0 || >=24.0.0`, which the current Node 25 runtime satisfies.
- The supplied DeepSeek checkout is 1301 commits behind its configured remote and has its own local changes. It remains a developer-preview source reference: M0 reports its source version and static Skill capability only, never starts, builds, updates, or executes that checkout.
- Do not read a user Skill directory, persist user data, or create real validation plans in M0.
- Preserve `prototype/` and its Sites packaging files unchanged.
- Every public DTO carries an explicit schema version; unknown Harness facts are represented as `unknown`, never inferred.
- The phase ends with `npm run test`, `npm run typecheck`, and `npm run build` passing from the repository root.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `package.json` | Root workspace scripts and development tooling. |
| `tsconfig.base.json` | Strict TypeScript defaults shared by all workspace packages. |
| `apps/connector/src/index.ts` | Starts and stops the localhost connector process. |
| `apps/connector/src/http/server.ts` | Routes `GET /api/health` and `GET /api/harnesses`; writes safe JSON responses. |
| `apps/connector/src/harnesses/service.ts` | Adapts pure discovery results to public contract DTOs. |
| `apps/connector/skillstudio.config.example.json` | Documents the explicit, non-secret source-checkout configuration used for a local Hermes probe. |
| `apps/web/src/App.tsx` | Minimal M0 status screen; fetches and renders connector/Harness state. |
| `apps/web/src/api/client.ts` | Typed HTTP client with recoverable unavailable state. |
| `packages/contracts/src/index.ts` | Shared DTOs, error codes, schema version, and response helpers. |
| `packages/harness-core/src/discovery.ts` | Pure command lookup and version-output normalization. |
| `packages/harness-core/src/profiles.ts` | Maps discovery facts to Codex, Hermes, and DeepSeek capability reports. |
| `tests/fixtures/harnesses/` | Fixed command-output fixtures; no installed Harness is required for unit tests. |
| `tests/contracts.test.ts` | Contract shape and status semantics. |
| `tests/harness-discovery.test.ts` | Discovery, missing executable, and unknown-version cases. |
| `tests/connector-http.test.ts` | Loopback-only HTTP health and Harness status responses. |
| `docs/decisions/0001-harness-capability-baseline.md` | Reproducible host evidence and phase limitations. |
| `docs/development.md` | Verified M0 install, test, build, and local-start commands. |

## Public Interfaces

```ts
export const CONTRACT_SCHEMA_VERSION = "2026-09-10" as const;

export type HarnessKind = "codex" | "hermes" | "deepseek";
export type FactStatus = "ready" | "blocked" | "not_installed" | "unknown" | "unsupported";

export interface CapabilityFact {
  key: "installation" | "version" | "execution" | "skillDiscovery";
  status: FactStatus;
  summary: string;
  evidence: string[];
  checkedAt: string;
}

export interface HarnessReport {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  kind: HarnessKind;
  displayName: string;
  executablePath: string | null;
  detectedVersion: string | null;
  facts: CapabilityFact[];
}

export interface ApiEnvelope<T> {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  requestId: string;
  data: T;
}

export interface HarnessDiscoveryPort {
  find(command: string): Promise<string | null>;
  version(commandPath: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  isFile(path: string): Promise<boolean>;
  readText(path: string): Promise<string | null>;
  pythonVersion(): Promise<string | null>;
  now(): string;
}

export interface HarnessDiscoveryConfig {
  hermesSourceCheckout: string | null;
  deepseekSourceCheckout: string | null;
}
```

### Task 1: Create the root workspace and deterministic tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `apps/connector/package.json`
- Create: `apps/connector/skillstudio.config.example.json`
- Create: `apps/web/package.json`
- Create: `packages/contracts/package.json`
- Create: `packages/harness-core/package.json`
- Create: `tests/fixtures/harnesses/codex-version.txt`

**Interfaces:**
- Produces root commands: `npm run test`, `npm run typecheck`, `npm run build`, `npm run dev:connector`, and `npm run dev:web`.
- Produces the path aliases `@skillstudio/contracts` and `@skillstudio/harness-core` for later tasks.

- [ ] **Step 1: Add root scripts and workspaces**

Create a root `package.json` with `workspaces: ["apps/*", "packages/*"]`. Use these exact scripts:

```json
{
  "test": "tsx --test tests/*.test.ts",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "build": "npm run typecheck && npm run build --workspaces --if-present",
  "dev:connector": "npm run dev --workspace=@skillstudio/connector",
  "dev:web": "npm run dev --workspace=@skillstudio/web"
}
```

- [ ] **Step 2: Add strict compiler configuration**

Create `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, and `target: "ES2022"`. Create root `tsconfig.json` with project references to each workspace package.

- [ ] **Step 3: Document local Harness configuration without storing user paths**

Create `apps/connector/skillstudio.config.example.json` with this shape:

```json
{
  "harnesses": {
    "hermes": { "sourceCheckout": "C:\\path\\to\\hermes-agent" },
    "deepseek": { "sourceCheckout": "C:\\path\\to\\deepseek-harness" }
  }
}
```

Add `apps/connector/skillstudio.config.json` to `.gitignore`. The actual machine-specific file is created manually by the user; it is never committed and cannot contain API keys.

- [ ] **Step 4: Add intentional ignore rules**

Add `node_modules/`, `dist/`, `.vite/`, `coverage/`, `.env`, and `.env.*` to root `.gitignore`. Do not add `prototype/` to ignore rules.

- [ ] **Step 5: Install declared development dependencies**

Run: `npm install -D typescript tsx @types/node`

Expected: root `package-lock.json` exists and no package is installed globally.

- [ ] **Step 6: Verify the initial tooling input**

Create `tests/fixtures/harnesses/codex-version.txt` containing `codex-cli 0.153.4`. Run: `npm run typecheck`.

Expected: the workspace compiler configuration loads successfully. The first test command is verified in Task 2 after its test file exists.

- [ ] **Step 7: Commit the workspace baseline**

```bash
git add package.json package-lock.json tsconfig.base.json tsconfig.json .gitignore apps packages tests/fixtures/harnesses/codex-version.txt
git commit -m "build: add SkillStudio workspace baseline"
```

### Task 2: Define versioned contracts before process integration

**Files:**
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/tsconfig.json`
- Create: `tests/contracts.test.ts`

**Interfaces:**
- Consumes: root TypeScript configuration from Task 1.
- Produces: `HarnessKind`, `FactStatus`, `CapabilityFact`, `HarnessReport`, `ApiEnvelope<T>`, `ApiError`, and `CONTRACT_SCHEMA_VERSION`.

- [ ] **Step 1: Write failing contract tests**

Add tests that assert these two invariants:

```ts
assert.equal(CONTRACT_SCHEMA_VERSION, "2026-09-10");
assert.deepEqual(createEnvelope("req-1", { status: "ok" }), {
  schemaVersion: "2026-09-10",
  requestId: "req-1",
  data: { status: "ok" },
});
```

Also assert that `FactStatus` is represented only by the documented string union at compile time using `satisfies`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/contracts.test.ts`

Expected: FAIL because `@skillstudio/contracts` and `createEnvelope` do not exist.

- [ ] **Step 3: Implement the minimum contract package**

Implement `createEnvelope<T>(requestId: string, data: T): ApiEnvelope<T>` and export the interfaces shown in **Public Interfaces**. Add:

```ts
export interface ApiError {
  code: "CONNECTOR_UNAVAILABLE" | "INVALID_REQUEST" | "NOT_FOUND" | "INTERNAL";
  message: string;
  requestId: string;
}
```

Set the package export map to `./src/index.ts` for development and its built declaration path for production.

- [ ] **Step 4: Run focused verification**

Run: `npm run test -- tests/contracts.test.ts && npm run typecheck`

Expected: PASS; no implicit `any` or nullable path errors.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add packages/contracts tests/contracts.test.ts
git commit -m "feat(contracts): define harness discovery DTOs"
```

### Task 3: Implement pure Harness discovery and capability normalization

**Files:**
- Create: `packages/harness-core/src/discovery.ts`
- Create: `packages/harness-core/src/profiles.ts`
- Create: `packages/harness-core/src/index.ts`
- Create: `packages/harness-core/tsconfig.json`
- Create: `tests/harness-discovery.test.ts`
- Create: `tests/fixtures/harnesses/hermes-source-pyproject.toml`
- Create: `tests/fixtures/harnesses/deepseek-source-package.json`
- Create: `tests/fixtures/harnesses/codex-unknown-version.txt`

**Interfaces:**
- Consumes: `HarnessDiscoveryPort`, `HarnessReport`, and `FactStatus` from `@skillstudio/contracts`.
- Produces: `discoverHarnesses(port: HarnessDiscoveryPort, config: HarnessDiscoveryConfig): Promise<HarnessReport[]>`.

- [ ] **Step 1: Write failing discovery tests**

Create a fake port whose `find("codex")` returns `C:\\Tools\\codex.exe`, whose version output reads the existing fixture, and whose `find("hermes")` returns `null`. Provide `hermesSourceCheckout: "C:\\repos\\hermes-agent"` and a file-reader fixture that returns project version `0.21.0` but no Python executable. Assert:

```ts
assert.equal(reports[0]?.kind, "codex");
assert.equal(reports[0]?.detectedVersion, "0.153.4");
assert.equal(fact(reports[0], "installation").status, "ready");
assert.equal(reports[1]?.detectedVersion, "0.21.0");
assert.equal(fact(reports[1], "installation").status, "blocked");
assert.equal(reports[2]?.detectedVersion, "0.1.3-alpha.1");
assert.equal(fact(reports[2], "execution").status, "unsupported");
```

Add a second test where Codex returns malformed version text and assert `detectedVersion === null` and the version fact is `unknown` rather than `blocked`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/harness-discovery.test.ts`

Expected: FAIL because `discoverHarnesses` is not exported.

- [ ] **Step 3: Implement discovery with no shell interpolation**

Implement `discoverHarnesses` to call only `port.find`, `port.version`, and injected file-system probes; it must not call `child_process` directly. Normalize a Codex line matching `/^codex-cli\s+(\S+)/m`.

For a configured Hermes source checkout, verify only that `hermes` and `pyproject.toml` exist, extract `[project].version`, and probe for an eligible Python 3.11–3.13 executable through the injected port. If Python is unavailable, set the Hermes execution fact to `blocked` with evidence `"Source checkout found; Python 3.11–3.13 runtime unavailable"`. Add skill-discovery evidence describing `.agents/skills`, `.hermes/skills`, and the required trust decision, but mark runtime verification `unknown` until the launcher can run. For a missing executable and no source checkout, use `not_installed`. Do not return an empty report list.

For a configured DeepSeek source checkout, verify only that `package.json`, `pnpm-workspace.yaml`, and `apps/cli/package.json` exist, then extract root `version` and Node engine range from `package.json`. Report the `dsh` profile launcher and the presence of `@deepseek-ai/dsh-skill` as static evidence. Set installation and skill-discovery facts to `unknown` with a source-checkout summary; set execution to `unsupported` with evidence `"M0 permits static compatibility diagnostics only"`. Never invoke `pnpm`, `dsh`, or any source package from the discovery layer.

- [ ] **Step 4: Run focused verification**

Run: `npm run test -- tests/harness-discovery.test.ts && npm run typecheck`

Expected: PASS; tests do not require a runnable Codex, Hermes, or Python installation.

- [ ] **Step 5: Commit the pure discovery layer**

```bash
git add packages/harness-core tests/harness-discovery.test.ts tests/fixtures/harnesses
git commit -m "feat(harnesses): add discovery capability reports"
```

### Task 4: Expose safe loopback-only connector endpoints

**Files:**
- Create: `apps/connector/src/harnesses/service.ts`
- Create: `apps/connector/src/http/server.ts`
- Create: `apps/connector/src/index.ts`
- Create: `apps/connector/tsconfig.json`
- Create: `tests/connector-http.test.ts`

**Interfaces:**
- Consumes: `discoverHarnesses`, `createEnvelope`, `ApiError`.
- Produces: `createConnectorServer(options): { listen(): Promise<number>; close(): Promise<void> }`.

- [ ] **Step 1: Write failing HTTP tests**

Start the connector with a fake discovery port on port `0`. Assert the following:

```ts
const health = await fetch(`${url}/api/health`);
assert.deepEqual(await health.json(), {
  schemaVersion: "2026-09-10",
  requestId: "test-request",
  data: { status: "ok" },
});

const reports = await fetch(`${url}/api/harnesses`);
assert.equal(reports.status, 200);
assert.equal((await reports.json()).data.length, 3);
```

Also create a request to `/api/missing` and assert a JSON `NOT_FOUND` response. Assert that `server.address()` uses `127.0.0.1`, never `0.0.0.0`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/connector-http.test.ts`

Expected: FAIL because `createConnectorServer` does not exist.

- [ ] **Step 3: Implement the connector**

Use Node `node:http`. Generate a request ID with `crypto.randomUUID()` for production requests; permit a deterministic `requestIdFactory` option for tests. Set `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff` on every response. Reject all methods other than `GET` with `404` in M0.

`apps/connector/src/index.ts` must read only `SKILLSTUDIO_PORT` with a numeric range of 1024–65535, default to 4317, and call `listen("127.0.0.1")`.

- [ ] **Step 4: Run focused verification**

Run: `npm run test -- tests/connector-http.test.ts && npm run typecheck`

Expected: PASS; the tests prove loopback binding and stable envelopes.

- [ ] **Step 5: Commit the connector milestone**

```bash
git add apps/connector tests/connector-http.test.ts
git commit -m "feat(connector): expose loopback harness status API"
```

### Task 5: Add the M0 web shell from the approved prototype direction

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/package.json`
- Create: `tests/web-api-client.test.ts`

**Interfaces:**
- Consumes: `HarnessReport` and `ApiEnvelope` from `@skillstudio/contracts` and `GET /api/harnesses` from Task 4.
- Produces: `getHarnessReports(fetchImpl, baseUrl): Promise<HarnessReport[]>` and a display-only Harness status screen.

- [ ] **Step 1: Write failing client tests**

Mock `fetchImpl` with a successful envelope that contains Codex ready, Hermes source discovered with execution blocked by a missing Python runtime, and DeepSeek source discovered with execution unsupported in M0. Assert that `getHarnessReports` returns all three reports. Mock a network rejection and assert the function throws `ConnectorUnavailableError` with message `"无法连接本地连接器"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/web-api-client.test.ts`

Expected: FAIL because `getHarnessReports` and `ConnectorUnavailableError` do not exist.

- [ ] **Step 3: Implement the typed API client**

Use `fetchImpl(url, { headers: { Accept: "application/json" } })`. Check `response.ok`, parse the envelope, and validate that `data` is an array before returning it. Do not persist results to local storage in M0.

- [ ] **Step 4: Implement the status screen**

Use the approved prototype’s dark, evidence-first visual language: left rail, workspace header, and a Harness capability matrix. The view must show literal status text beside color and icon, expose each fact’s evidence, show `Hermes Agent · 已发现，运行时受阻`, and show `DeepSeek Harness · 已发现源码，仅静态诊断`. It must not render execution controls, API-key fields, or an artificial “connected” state.

- [ ] **Step 5: Verify web build and interaction states**

Run: `npm run test -- tests/web-api-client.test.ts && npm run build --workspace=@skillstudio/web`.

Then run connector and web in separate terminals. In a browser, verify loading, ready, connector-unavailable, and expanded-evidence states. Capture a screenshot at 1440 × 1024 and save it as `docs/design/m0-harness-status.png`.

- [ ] **Step 6: Commit the web shell**

```bash
git add apps/web tests/web-api-client.test.ts docs/design/m0-harness-status.png
git commit -m "feat(web): add harness capability status screen"
```

### Task 6: Record real host evidence and document the M0 boundary

**Files:**
- Create: `docs/decisions/0001-harness-capability-baseline.md`
- Create: `docs/development.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: installed-command observations from Task 3 and runnable scripts from Tasks 1–5.
- Produces: a reproducible decision record and verified developer commands.

- [ ] **Step 1: Capture real, non-mutating probe output**

Run:

```powershell
codex --version
Get-Command hermes -ErrorAction SilentlyContinue
Get-Command hermes-agent -ErrorAction SilentlyContinue
Get-Command py -ErrorAction SilentlyContinue
Get-Content D:\IDEWorkplaces\GitHub\hermes-agent\pyproject.toml -TotalCount 20
Get-Content D:\IDEWorkplaces\GitHub\deepseek-harness\package.json -TotalCount 20
```

Record command, date, operating system, result, and the fact it supports. Do not record absolute user home paths or environment variables.

- [ ] **Step 2: Write the capability decision**

The decision must state that Codex discovery is evidence-backed, the supplied Hermes source checkout is version-evidenced but execution is blocked until Python 3.11–3.13 and authentication are separately verified, and the supplied DeepSeek source checkout is version-evidenced but execution remains unsupported in M0. Link the decision to `HarnessReport` field semantics.

- [ ] **Step 3: Add verified development instructions**

Document exact root commands:

```bash
npm install
npm run test
npm run typecheck
npm run build
npm run dev:connector
npm run dev:web
```

State that the connector defaults to `http://127.0.0.1:4317` and that no user Skill files are accessed in M0.

- [ ] **Step 4: Run the complete quality gate**

Run: `npm run test && npm run typecheck && npm run build`.

Expected: all commands exit 0. Inspect `git diff --check` and confirm the browser screen labels unavailable and unsupported Harnesses accurately.

- [ ] **Step 5: Commit M0 evidence**

```bash
git add docs/decisions/0001-harness-capability-baseline.md docs/development.md README.md
git commit -m "docs: record M0 harness capability baseline"
```

## Acceptance Checklist

- [ ] The root workspace installs and builds on Windows 11 with Node.js 25.
- [ ] Unit tests do not rely on any locally installed Harness.
- [ ] A Codex report includes detected version and command evidence when Codex is found.
- [ ] The supplied Hermes source checkout is visible with version `0.21.0`, a `blocked` execution fact when Python is unavailable, and no execution claim.
- [ ] The supplied DeepSeek checkout is visible with version `0.1.3-alpha.1`, source evidence, and exactly an `unsupported` execution fact in M0.
- [ ] Connector listens only on `127.0.0.1` and returns versioned JSON envelopes.
- [ ] The web shell presents evidence and literal statuses; it labels the supplied Hermes checkout as `已发现，运行时受阻` when Python is unavailable and does not include fake execution actions.
- [ ] `npm run test`, `npm run typecheck`, `npm run build`, and `git diff --check` pass.

## Self-Review

- Spec coverage: this plan implements stage A foundation and M0’s contract, discovery, capability matrix, visual baseline, evidence, and tooling requirements. Skill scanning, editing, TestCase creation, real execution, comparison, and improvement patches remain deliberately deferred to the later approved stages.
- Placeholder scan: no task contains temporary markers, unspecified tests, or generic error-handling instructions.
- Type consistency: `HarnessDiscoveryPort` is defined before `discoverHarnesses`; `HarnessReport` is shared by discovery, connector, and web; all public responses use `ApiEnvelope<T>`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-10-m0-foundation-and-harness-discovery.md`.

Two execution options:

1. Subagent-Driven (recommended) — dispatch a fresh worker for each task and review between tasks.
2. Inline Execution — execute tasks in this session using the executing-plans workflow, with checkpoints for review.
