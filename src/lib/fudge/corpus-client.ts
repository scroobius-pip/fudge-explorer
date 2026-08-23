import type { CatalogLoad } from "./api";
import { searchCatalogSnapshot } from "./corpus-search";
import type { CatalogFile, SearchHit } from "./types";

export type CaptureEvidenceRow = { identity: unknown; values: unknown[] };
export type CaptureEvidencePayload = {
  observedGeneration?: number;
  captureId?: number;
  evidence?: Record<string, CaptureEvidenceRow[]>;
};

type CorpusWorkerMessage =
  | { type: "progress"; value: number; label: string }
  | { type: "initial"; catalog: CatalogFile }
  | { type: "details"; catalog: CatalogFile | null }
  | { type: "search-result"; id: number; groups: SearchGroups }
  | {
      type: "capture-evidence-result";
      id: number;
      payload?: CaptureEvidencePayload;
      error?: string;
    }
  | { type: "error"; phase: "initial" | "details"; message: string };

type SearchGroups = { label: string; items: SearchHit[] }[];
let catalogLoad: Promise<CatalogLoad> | null = null;
let catalogWorker: Worker | null = null;
let latestCatalog: CatalogFile | null = null;
let searchRequestId = 0;
const searchRequests = new Map<number, (groups: SearchGroups) => void>();
let evidenceRequestId = 0;
const evidenceRequests = new Map<
  number,
  {
    resolve(payload: CaptureEvidencePayload): void;
    reject(error: Error): void;
  }
>();

export function loadCatalogInWorker(): Promise<CatalogLoad> {
  if (catalogLoad) return catalogLoad;
  catalogLoad =
    typeof Worker === "undefined"
      ? import("./api")
          .then(({ loadCatalogFile }) => loadCatalogFile())
          .then((load) => {
            latestCatalog = load.initial;
            void load.details.then((details) => {
              if (details) latestCatalog = details;
            });
            return load;
          })
      : startCatalogWorker();
  return catalogLoad;
}

export async function searchCatalogInWorker(
  query: string,
): Promise<SearchGroups> {
  await loadCatalogInWorker();
  if (!query.trim()) return [];
  if (!catalogWorker) {
    return latestCatalog ? searchCatalogSnapshot(latestCatalog, query) : [];
  }
  const id = ++searchRequestId;
  const { promise, resolve } = Promise.withResolvers<SearchGroups>();
  searchRequests.set(id, resolve);
  catalogWorker.postMessage({ type: "search", id, query });
  return promise;
}

export async function loadCaptureEvidenceInWorker(
  captureId: number,
  generation: number,
): Promise<CaptureEvidencePayload> {
  await loadCatalogInWorker();
  if (!catalogWorker) return fetchCaptureEvidence(captureId, generation);
  const id = ++evidenceRequestId;
  const { promise, resolve, reject } =
    Promise.withResolvers<CaptureEvidencePayload>();
  evidenceRequests.set(id, { resolve, reject });
  catalogWorker.postMessage({
    type: "capture-evidence",
    id,
    captureId,
    generation,
  });
  return promise;
}

async function fetchCaptureEvidence(
  captureId: number,
  generation: number,
): Promise<CaptureEvidencePayload> {
  const response = await fetch(
    `/v1/capture-evidence?captureId=${captureId}&generation=${generation}`,
    { headers: { accept: "application/json" }, credentials: "same-origin" },
  );
  if (!response.ok) {
    throw new Error(`Capture evidence failed (${response.status})`);
  }
  return response.json() as Promise<CaptureEvidencePayload>;
}

function startCatalogWorker(): Promise<CatalogLoad> {
  const worker = new Worker(new URL("./corpus.worker.ts", import.meta.url), {
    type: "module",
    name: "fudge-corpus",
  });
  catalogWorker = worker;
  let initialReceived = false;
  const { promise: details, resolve: resolveDetails } =
    Promise.withResolvers<CatalogFile | null>();
  const { promise, resolve, reject } = Promise.withResolvers<CatalogLoad>();

  worker.onmessage = (event: MessageEvent<CorpusWorkerMessage>) => {
    const message = event.data;
    if (message.type === "progress") {
      window.dispatchEvent(
        new CustomEvent("fudge:load-progress", {
          detail: { value: message.value, label: message.label },
        }),
      );
      return;
    }
    if (message.type === "search-result") {
      searchRequests.get(message.id)?.(message.groups);
      searchRequests.delete(message.id);
      return;
    }
    if (message.type === "capture-evidence-result") {
      const request = evidenceRequests.get(message.id);
      evidenceRequests.delete(message.id);
      if (!request) return;
      if (message.payload) request.resolve(message.payload);
      else
        request.reject(new Error(message.error || "Capture evidence failed"));
      return;
    }
    if (message.type === "initial") {
      initialReceived = true;
      latestCatalog = message.catalog;
      resolve({ initial: message.catalog, details });
      return;
    }
    if (message.type === "details") {
      if (message.catalog) latestCatalog = message.catalog;
      resolveDetails(message.catalog);
      return;
    }
    if (message.phase === "details" && initialReceived) {
      resolveDetails(null);
    } else {
      reject(new Error(message.message));
    }
  };
  worker.onerror = (event) => {
    for (const resolveSearch of searchRequests.values()) resolveSearch([]);
    searchRequests.clear();
    for (const request of evidenceRequests.values()) {
      request.reject(new Error("Corpus worker crashed"));
    }
    evidenceRequests.clear();
    catalogWorker = null;
    if (initialReceived) resolveDetails(null);
    else reject(new Error(event.message || "Corpus worker crashed"));
    worker.terminate();
  };
  worker.postMessage({ type: "load" });
  return promise;
}
