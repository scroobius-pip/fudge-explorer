import { loadCatalogFile } from "./api";
import type { CatalogDetailsProjection, CatalogFile } from "./types";
import { searchCatalogSnapshot } from "./corpus-search";
import { withSearchSuggestions } from "./search-suggestions";

type WorkerMessage =
  | { type: "load" }
  | { type: "search"; id: number; query: string }
  | {
      type: "capture-evidence";
      id: number;
      captureId: number;
      generation: number;
    };

type CorpusWorkerScope = {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
};

const scope = globalThis as unknown as CorpusWorkerScope;
let loading = false;
let catalogSnapshot: CatalogFile | null = null;

scope.onmessage = (event) => {
  if (event.data.type === "search") {
    scope.postMessage({
      type: "search-result",
      id: event.data.id,
      groups: withSearchSuggestions(
        event.data.query,
        catalogSnapshot
          ? searchCatalogSnapshot(catalogSnapshot, event.data.query)
          : [],
      ),
    });
    return;
  }
  if (event.data.type === "capture-evidence") {
    void loadCaptureEvidence(
      event.data.id,
      event.data.captureId,
      event.data.generation,
    );
    return;
  }
  if (loading) return;
  loading = true;
  void load();
};

async function loadCaptureEvidence(
  id: number,
  captureId: number,
  generation: number,
) {
  try {
    const response = await fetch(
      `/v1/capture-evidence?captureId=${captureId}&generation=${generation}`,
      { headers: { accept: "application/json" }, credentials: "same-origin" },
    );
    if (!response.ok) {
      throw new Error(`Capture evidence failed (${response.status})`);
    }
    scope.postMessage({
      type: "capture-evidence-result",
      id,
      payload: await response.json(),
    });
  } catch (error) {
    scope.postMessage({
      type: "capture-evidence-result",
      id,
      error:
        error instanceof Error
          ? error.message
          : "Capture evidence failed to load",
    });
  }
}

async function load() {
  let initialSent = false;
  try {
    const catalog = await loadCatalogFile();
    catalogSnapshot = catalog.initial;
    postCatalog("initial", compactInitialCatalog(catalog.initial));
    initialSent = true;
    const details = await catalog.details;
    if (details && catalogSnapshot) {
      catalogSnapshot = { ...catalogSnapshot, ...details };
    }
    postCatalog("details", details);
  } catch (error) {
    scope.postMessage({
      type: "error",
      phase: initialSent ? "details" : "initial",
      message:
        error instanceof Error ? error.message : "Corpus worker failed to load",
    });
    if (!initialSent) scope.close();
  }
}

function compactInitialCatalog(catalog: CatalogFile): CatalogFile {
  const visible = new Set(catalog.mainCaptureIds.map(String));
  return {
    ...catalog,
    palettes: pickVisible(catalog.palettes, visible),
    colorRoles: pickVisible(catalog.colorRoles, visible),
    fonts: pickVisible(catalog.fonts, visible),
    typeRoles: pickVisible(catalog.typeRoles, visible),
    searchTextByCapture: {},
  };
}

function pickVisible<T>(
  values: Record<string, T>,
  visible: Set<string>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(values).filter(([captureId]) => visible.has(captureId)),
  );
}
function postCatalog(
  phase: "initial" | "details",
  catalog: CatalogFile | CatalogDetailsProjection | null,
) {
  scope.postMessage({ type: phase, catalog });
}
