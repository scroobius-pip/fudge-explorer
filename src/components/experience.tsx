import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import {
  captureById,
  combineFieldViews,
  captureView,
  ensureCaptureEvidence,
  ensureFontSimilarity,
  ensureSemanticNeighbors,
  fieldFilters,
  subscribeCatalogUpdates,
  readCatalogDetailsStatus,
  latestFieldFilter,
} from "@/lib/fudge/catalog";
import {
  searchSemanticImage,
  searchSemanticText,
  type SemanticSearchResult,
} from "@/lib/fudge/api";
import { slotToward, type Slot } from "@/lib/fudge/layout";
import type { FieldView } from "@/lib/fudge/types";
import {
  armsOf,
  materialOf,
  moveOf,
  sameView,
  type Stop,
} from "@/lib/fudge/move";
import { strike } from "@/lib/impulse";
import { sfx } from "@/lib/sfx";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Chrome } from "@/components/chrome";
import { Wall } from "@/components/wall";
import { Juice } from "@/components/juice";
import { McpLink } from "@/components/mcp-link";
import { SoundControl } from "@/components/sound-control";
import { MobileMenu } from "@/components/mobile-menu";
const ROOT: FieldView = { kind: "all" };
const ignoreTravelState = () => undefined;
const SAVED_KEY = "fudge-explorer:saved-captures";

export function FieldExperience() {
  const initialNavigation = useRef(readNavigationHash()).current;
  const [trail, setTrail] = useState<FieldView[]>(initialNavigation.trail);
  const [viewIndex, setViewIndex] = useState(initialNavigation.viewIndex);
  const [focusedId, setFocusedId] = useState<number | null>(
    initialNavigation.focusedId,
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(readSavedIds);
  const [savedFeedback, setSavedFeedback] = useState<
    "added" | "removed" | null
  >(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [knockId, setKnockId] = useState<string | null>(null);
  const [pendingViewKey, setPendingViewKey] = useState<string | null>(null);
  const [relationEpoch, setRelationEpoch] = useState(0);
  const [catalogDetailsStatus, setCatalogDetailsStatus] = useState(
    readCatalogDetailsStatus,
  );
  const slotsRef = useRef<Slot[]>([]);
  const focusByView = useRef(new Map<string, number | null>());
  const applyingHash = useRef(false);
  const navigationReady = useRef(false);
  const searchControllerRef = useRef<AbortController | null>(null);
  const replaceNavigation = useRef(false);
  const savedFeedbackTimer = useRef(0);
  const [searchViewError, setSearchViewError] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const activeTrail = useMemo(
    () => trail.slice(0, viewIndex + 1),
    [trail, viewIndex],
  );
  const view = useMemo(() => combineFieldViews(activeTrail), [activeTrail]);
  const activeFilters = useMemo(() => fieldFilters(view), [view]);
  const activeFilter = latestFieldFilter(view);
  const savedActive = view.kind === "saved";
  const focused = focusedId ? (captureById.get(focusedId) ?? null) : null;
  const awaitingCatalogDetails =
    catalogDetailsStatus === "loading" &&
    activeFilters.some(
      (filter) => filter.kind === "term" || filter.kind === "facet",
    );
  const viewPending = pendingViewKey !== null || awaitingCatalogDetails;
  const field = useMemo(
    () => captureView(view, savedIds),
    [relationEpoch, savedIds, view],
  );
  const layers = useMemo(() => {
    if (savedActive) {
      return [{ view, depth: 0, captures: field.captures }];
    }
    return trail.map((_, depth) => {
      const layerView = combineFieldViews(trail.slice(0, depth + 1));
      return {
        view: layerView,
        depth,
        captures: captureView(layerView, savedIds).captures,
      };
    });
  }, [field.captures, relationEpoch, savedActive, savedIds, trail, view]);
  const wallActiveIndex = savedActive ? 0 : viewIndex;
  const visible = field.captures;
  const arms = useMemo(
    () => armsOf(view, focused),
    [focused, relationEpoch, view],
  );
  const empty = visible.length === 0;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", onChange);
    const unlock = () => {
      sfx.unlock();
      haptics.unlock();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(
    () =>
      subscribeCatalogUpdates(() => {
        setRelationEpoch((value) => value + 1);
        setCatalogDetailsStatus(readCatalogDetailsStatus());
      }),
    [],
  );

  useEffect(() => {
    if (activeFilter?.kind !== "font") return;
    let disposed = false;
    void ensureFontSimilarity(activeFilter.family)
      .catch(() => undefined)
      .then(() => {
        if (!disposed) setRelationEpoch((value) => value + 1);
      });
    return () => {
      disposed = true;
    };
  }, [activeFilter]);

  useEffect(() => {
    if (focusedId == null) return;
    let disposed = false;
    void Promise.allSettled([
      ensureCaptureEvidence(focusedId),
      ensureSemanticNeighbors(focusedId),
    ]).then(() => {
      if (!disposed) setRelationEpoch((value) => value + 1);
    });
    return () => {
      disposed = true;
    };
  }, [focusedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      strike({
        transmit: true,
        axis: "z",
        d: 1.6,
        v: 1,
        inbound: true,
        material: "paper",
        enter: visible.length,
        leave: 0,
      });
    }, 280);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    focusByView.current.set(viewStateKey(view), focusedId);
  }, [focusedId, view]);

  useEffect(() => {
    const restore = () => {
      const navigation = readNavigationHash();
      applyingHash.current = true;
      setTrail(navigation.trail);
      setViewIndex(navigation.viewIndex);
      setFocusedId(navigation.focusedId);
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);

  useEffect(() => {
    const hash = navigationHash({ trail, viewIndex, focusedId });
    if (!navigationReady.current) {
      navigationReady.current = true;
      if (window.location.hash !== hash) {
        window.history.replaceState(null, "", hash);
      }
      return;
    }
    if (applyingHash.current) {
      applyingHash.current = false;
      return;
    }
    if (window.location.hash !== hash) {
      if (replaceNavigation.current) {
        replaceNavigation.current = false;
        window.history.replaceState(null, "", hash);
      } else {
        window.history.pushState(null, "", hash);
      }
    }
  }, [focusedId, trail, viewIndex]);

  const activateViewIndex = useCallback(
    (nextIndex: number) => {
      const bounded = Math.max(0, Math.min(nextIndex, trail.length - 1));
      if (bounded === viewIndex && trail.length === bounded + 1) return;
      const nextTrail = trail.slice(0, bounded + 1);
      const target = combineFieldViews(nextTrail);
      focusByView.current.set(viewStateKey(view), focusedId);
      strike({
        transmit: true,
        axis: "z",
        d: 1.8,
        v: 1,
        inbound: bounded > viewIndex,
        material: materialOf(target),
        enter: captureView(target, savedIds).captures.length,
        leave: visible.length,
      });
      setTrail(nextTrail);
      setViewIndex(bounded);
      setFocusedId(focusByView.current.get(viewStateKey(target)) ?? null);
    },
    [focusedId, savedIds, trail, view, viewIndex, visible.length],
  );

  const transmitView = useCallback(
    (
      next: FieldView,
      fromId: number | null = focusedId,
      mode: "push" | "replace" = "push",
    ) => {
      const prefix =
        mode === "replace" ? [ROOT] : trail.slice(0, viewIndex + 1);
      const additions =
        next.kind === "all"
          ? []
          : fieldFilters(next).filter(
              (candidate) => !prefix.some((item) => sameView(item, candidate)),
            );

      const nextTrail =
        next.kind === "all"
          ? [ROOT]
          : next.kind === "saved"
            ? [ROOT, next]
            : [...prefix, ...additions];
      const nextView = combineFieldViews(nextTrail);
      const nextSet = captureView(nextView, savedIds).captures;
      const nextIndex = nextTrail.length - 1;
      if (
        focusedId == null &&
        nextIndex === viewIndex &&
        sameView(nextView, view)
      ) {
        strike({
          transmit: false,
          axis: "0",
          d: 0,
          v: 1,
          material: materialOf(nextView),
        });
        setKnockId(viewTitleKey(nextView));
        window.setTimeout(() => setKnockId(null), 320);
        return;
      }
      const move = moveOf(view, nextView, fromId, null);
      focusByView.current.set(viewStateKey(view), focusedId);
      strike({
        transmit: true,
        axis: nextIndex === viewIndex ? move.axis : "z",
        d: nextIndex === viewIndex ? move.d : 1.8,
        v: 1,
        inbound: nextIndex > viewIndex,
        material: move.material,
        enter: nextSet.length,
        leave: visible.length,
      });
      setTrail(nextTrail);
      setViewIndex(nextIndex);
      setFocusedId(null);
      if (nextSet.length === 0) {
        window.setTimeout(() => {
          strike({
            transmit: false,
            axis: "0",
            d: 0,
            v: 0.8,
            material: move.material,
          });
        }, 180);
      }
    },
    [focusedId, savedIds, trail, view, viewIndex, visible.length],
  );

  const beginSearchView = useCallback(
    (
      label: string,
      search: (signal: AbortSignal) => Promise<SemanticSearchResult[]>,
    ) => {
      searchControllerRef.current?.abort();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      const pendingView: FieldView = {
        kind: "search",
        query: label,
        captureIds: [],
      };
      const pendingKey = viewStateKey(pendingView);
      setSearchViewError(null);
      transmitView(pendingView);
      setPendingViewKey(pendingKey);
      void search(controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          const resolvedView: FieldView = {
            ...pendingView,
            captureIds: results.map((result) => result.captureId),
          };
          replaceNavigation.current = true;
          setTrail((current) =>
            current.map((item) => (item === pendingView ? resolvedView : item)),
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSearchViewError({
            key: pendingKey,
            message:
              error instanceof Error
                ? error.message
                : "Search is temporarily unavailable.",
          });
        })
        .finally(() => {
          if (searchControllerRef.current === controller) {
            searchControllerRef.current = null;
          }
          setPendingViewKey((current) =>
            current === pendingKey ? null : current,
          );
        });
    },
    [transmitView],
  );

  const onTextSearch = useCallback(
    (query: string) => {
      const normalized = query.trim();
      if (normalized.length < 3) return;
      beginSearchView(normalized, (signal) =>
        searchSemanticText(normalized, signal),
      );
    },
    [beginSearchView],
  );

  const onImageSearch = useCallback(
    (file: File) => {
      beginSearchView("Image search", (signal) =>
        searchSemanticImage(file, signal),
      );
    },
    [beginSearchView],
  );

  const onFocus = useCallback(
    (id: number | null) => {
      if (id === focusedId) {
        if (id != null) {
          strike({ transmit: false, axis: "z", d: 0, v: 1, material: "paper" });
        }
        return;
      }
      const inbound = id != null;
      strike({
        transmit: true,
        axis: "z",
        d: 1.35,
        v: 1,
        inbound,
        material: "paper",
        enter: inbound ? 1 : visible.length,
        leave: inbound ? visible.length : 1,
      });
      setFocusedId(id);
    },
    [focusedId, visible.length],
  );

  const transmitFromContext = useCallback(
    (next: FieldView) => {
      transmitView(
        next,
        focusedId,
        focusedId == null ? "push" : "replace",
      );
    },
    [focusedId, transmitView],
  );

  const onHitStop = useCallback(
    (stop: Stop) => {
      if (!stop.view) return;
      const target = stop.view;
      transmitFromContext(target);
      if (target.kind !== "visual") return;
      const key = viewStateKey(target);
      setPendingViewKey(key);
      void ensureSemanticNeighbors(target.id)
        .then(() => setRelationEpoch((value) => value + 1))
        .catch(() => {
          setKnockId(stop.id);
          window.setTimeout(() => setKnockId(null), 320);
        })
        .finally(() => {
          setPendingViewKey((current) => (current === key ? null : current));
        });
    },
    [transmitFromContext],
  );

  const onRemoveFilter = useCallback(
    (index: number) => {
      const nextFilters = activeFilters.filter(
        (_, filterIndex) => filterIndex !== index,
      );
      const nextTrail: FieldView[] = [ROOT, ...nextFilters];
      const target = combineFieldViews(nextTrail);
      strike({
        transmit: true,
        axis: "z",
        d: 1.35,
        v: 1,
        inbound: false,
        material: materialOf(target),
        enter: captureView(target, savedIds).captures.length,
        leave: visible.length,
      });
      setTrail(nextTrail);
      setViewIndex(nextTrail.length - 1);
      setFocusedId(null);
    },
    [activeFilters, savedIds, visible.length],
  );
  const onToggleSave = useCallback(() => {
    if (!focused) return;
    const id = String(focused.id);
    const saving = !savedIds.has(id);
    setSavedIds((previous) => {
      const next = new Set(previous);
      if (saving) next.add(id);
      else next.delete(id);
      window.localStorage.setItem(SAVED_KEY, JSON.stringify([...next]));
      return next;
    });
    setSavedFeedback(saving ? "added" : "removed");
    window.clearTimeout(savedFeedbackTimer.current);
    savedFeedbackTimer.current = window.setTimeout(
      () => setSavedFeedback(null),
      420,
    );
    strike({
      transmit: true,
      axis: "0",
      d: 0.4,
      v: 1,
      inbound: saving,
      material: "glass",
    });
  }, [focused, savedIds]);

  const onToggleSavedView = useCallback(() => {
    transmitView(savedActive ? ROOT : { kind: "saved" });
  }, [savedActive, transmitView]);

  useEffect(
    () => () => {
      searchControllerRef.current?.abort();
      window.clearTimeout(savedFeedbackTimer.current);
    },
    [],
  );

  const moveFocus = useCallback(
    (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
      const next = slotToward(slotsRef.current, focusedId, dx, dy);
      if (next == null || next === focusedId) {
        strike({
          transmit: false,
          axis: dx === 0 ? "y" : "x",
          d: 0,
          v: 0.8,
          material: "paper",
        });
        return;
      }
      onFocus(next);
    },
    [focusedId, onFocus],
  );

  useEffect(() => {
    const typing = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/" && !typing(event.target)) {
        event.preventDefault();
        if (focusedId) onFocus(null);
        window.requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>(
            "[data-field-search]",
          );
          input?.focus();
        });
        return;
      }
      if (typing(event.target)) return;

      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        if (focusedId) onFocus(null);
        else if (viewIndex > 0) activateViewIndex(viewIndex - 1);
        return;
      }

      const dir =
        event.key === "ArrowLeft" || event.key === "h"
          ? ([-1, 0] as const)
          : event.key === "ArrowRight" || event.key === "l"
            ? ([1, 0] as const)
            : event.key === "ArrowUp" || event.key === "k"
              ? ([0, 1] as const)
              : event.key === "ArrowDown" || event.key === "j"
                ? ([0, -1] as const)
                : null;

      if (dir) {
        event.preventDefault();
        moveFocus(dir[0], dir[1]);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (focused?.pageUrl) {
          window.open(focused.pageUrl, "_blank", "noreferrer");
          return;
        }
        const slots = slotsRef.current;
        const next = slotToward(slots, focusedId, 0, 0);
        if (next) onFocus(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activateViewIndex, focused, focusedId, moveFocus, onFocus, viewIndex]);

  return (
    <main
      className={cn(
        "sheet relative h-dvh overflow-hidden bg-bg text-fg",
        arms.x.length > 0 && "has-x",
        (arms.also.length > 0 || focused) && "has-also",
        focused && "has-focus",
        activeFilter?.kind === "font" && !focused && "has-font-view",
        arms.voice.length > 0 && "has-voice",
      )}
    >
      <div className="sheet-well">
        <Wall
          layers={layers}
          activeIndex={wallActiveIndex}
          focused={focused}
          reducedMotion={reducedMotion}
          onFocus={onFocus}
          onTraverse={activateViewIndex}
          onSwipeFocus={moveFocus}
          onTravelState={ignoreTravelState}
          onSlots={(slots) => {
            slotsRef.current = slots;
          }}
        />
      </div>
      <Juice />
      <div className="top-actions">
        <button
          type="button"
          className={cn(
            "saved-view-launch",
            savedActive && "is-active",
            savedFeedback && `is-${savedFeedback}`,
          )}
          aria-label={`${savedActive ? "Close" : "Open"} saved captures`}
          aria-pressed={savedActive}
          onPointerEnter={() => sfx.contact("paper")}
          onPointerDown={() => sfx.press("paper")}
          onClick={() => {
            haptics.selection();
            onToggleSavedView();
          }}
        >
          {savedActive ? (
            <BookmarkCheck className="size-4" strokeWidth={1.7} />
          ) : (
            <Bookmark className="size-4" strokeWidth={1.7} />
          )}
          <span>Saved</span>
          <small aria-live="polite">{savedIds.size}</small>
        </button>
        <SoundControl />
        <McpLink />
      </div>
      <MobileMenu
        savedActive={savedActive}
        savedCount={savedIds.size}
        onToggleSaved={onToggleSavedView}
      />
      <Chrome
        view={view}
        filters={activeFilters}
        focused={focused}
        relationEpoch={relationEpoch}
        saved={focused ? savedIds.has(String(focused.id)) : false}
        savedCount={savedIds.size}
        matchCount={field.total}
        viewPending={viewPending}
        viewError={
          catalogDetailsStatus === "failed" &&
          activeFilters.some(
            (filter) => filter.kind === "term" || filter.kind === "facet",
          )
            ? "Filter data could not be loaded. Reload to try again."
            : searchViewError &&
                activeFilters.some(
                  (filter) => viewStateKey(filter) === searchViewError.key,
                )
              ? searchViewError.message
              : null
        }
        empty={empty}
        knockId={knockId}
        onHitView={transmitFromContext}
        onHitStop={onHitStop}
        onSearchView={transmitView}
        onTextSearch={onTextSearch}
        onImageSearch={onImageSearch}
        onRemoveFilter={onRemoveFilter}
        onFocusCapture={(id) => onFocus(id)}
        onToggleSave={() => void onToggleSave()}
        onClose={() => onFocus(null)}
      />
    </main>
  );
}

function viewTitleKey(view: FieldView) {
  if ("id" in view) return String(view.id);
  if ("family" in view) return view.family;
  if ("origin" in view) return view.origin;
  if ("query" in view) return view.query;
  return view.kind;
}

function viewStateKey(view: FieldView) {
  return JSON.stringify(view);
}

type NavigationState = {
  trail: FieldView[];
  viewIndex: number;
  focusedId: number | null;
};

function navigationHash(state: NavigationState) {
  const params = new URLSearchParams();
  params.set("views", JSON.stringify(state.trail));
  params.set("at", String(state.viewIndex));
  if (state.focusedId != null) params.set("focus", String(state.focusedId));
  return `#${params.toString()}`;
}

function readNavigationHash(): NavigationState {
  if (typeof window === "undefined") {
    return { trail: [ROOT], viewIndex: 0, focusedId: null };
  }
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const parsed = JSON.parse(params.get("views") ?? "[]") as unknown;
    const views = Array.isArray(parsed) ? parsed.filter(isFieldView) : [];
    const trail: FieldView[] =
      views[0]?.kind === "all" ? views : [ROOT, ...views];
    if (trail.length === 0) trail.push(ROOT);
    const requestedIndex = Number(params.get("at"));
    const requestedViewIndex = Number.isSafeInteger(requestedIndex)
      ? Math.max(0, Math.min(requestedIndex, trail.length - 1))
      : trail.length - 1;
    const activeTrail = trail.slice(0, requestedViewIndex + 1);
    const viewIndex = activeTrail.length - 1;
    const requestedFocus = Number(params.get("focus"));
    const focusedId =
      Number.isSafeInteger(requestedFocus) && captureById.has(requestedFocus)
        ? requestedFocus
        : null;
    return { trail: activeTrail, viewIndex, focusedId };
  } catch {
    return { trail: [ROOT], viewIndex: 0, focusedId: null };
  }
}

function isFieldView(value: unknown): value is FieldView {
  if (
    !value ||
    typeof value !== "object" ||
    !("kind" in value) ||
    typeof value.kind !== "string"
  ) {
    return false;
  }
  if (value.kind === "filtered") {
    return (
      "filters" in value &&
      Array.isArray(value.filters) &&
      value.filters.every(
        (filter) =>
          isFieldView(filter) &&
          filter.kind !== "all" &&
          filter.kind !== "filtered",
      )
    );
  }
  if (
    value.kind === "all" ||
    value.kind === "saved" ||
    value.kind === "motion"
  ) {
    return true;
  }
  if (value.kind === "term" || value.kind === "facet") {
    return "id" in value && typeof value.id === "string";
  }
  if (value.kind === "font") {
    return "family" in value && typeof value.family === "string";
  }
  if (value.kind === "domain") {
    return "origin" in value && typeof value.origin === "string";
  }
  if (value.kind === "search") {
    return (
      "query" in value &&
      typeof value.query === "string" &&
      "captureIds" in value &&
      Array.isArray(value.captureIds) &&
      value.captureIds.every(
        (captureId) =>
          Number.isSafeInteger(captureId) && captureById.has(captureId),
      )
    );
  }
  if (
    value.kind === "palette" ||
    value.kind === "visual" ||
    value.kind === "semantic" ||
    value.kind === "typeSimilar" ||
    value.kind === "adjacent"
  ) {
    return (
      "id" in value &&
      typeof value.id === "number" &&
      Number.isSafeInteger(value.id)
    );
  }
  return false;
}

function readSavedIds(): Set<string> {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "[]");
    return new Set(
      Array.isArray(value) ? value.filter((id) => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}
