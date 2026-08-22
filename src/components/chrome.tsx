import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUIEvent,
} from "react";
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  ImagePlus,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CAPTURE_COUNT,
  browseCatalog,
  formatDate,
  hexSwatch,
  fontSimilarityReady,
  isKnown,
  mediaUrl,
  paletteOf,
  pxSize,
  latestFieldFilter,
  searchCatalog,
  viewPalette,
  viewTitle,
} from "@/lib/fudge/catalog";
import {
  armsOf,
  type Stop as StopData,
  type TypographyInfo,
} from "@/lib/fudge/move";
import type {
  Capture,
  FieldFilter,
  FieldView,
  SearchHit,
} from "@/lib/fudge/types";
import { PaletteStop, Stop, Swatches } from "@/components/stop";
import { FONT_PANGRAM, FontSpecimen } from "@/components/font-specimen";
import { Favicon } from "@/components/favicon";
import { FontViewHeader } from "@/components/font-view-header";
import { CaptureAiHandoff } from "@/components/capture-ai-handoff";
import { onImpulse } from "@/lib/impulse";
import { sfx } from "@/lib/sfx";
import { haptics } from "@/lib/haptics";

export function Chrome({
  view,
  filters,
  focused,
  saved,
  matchCount,
  viewPending,
  viewError,
  empty,
  knockId,
  onHitView,
  onSearchView,
  onTextSearch,
  onImageSearch,
  onHitStop,
  onRemoveFilter,
  onFocusCapture,
  onToggleSave,
  onClose,
}: {
  view: FieldView;
  filters: FieldFilter[];
  focused: Capture | null;
  saved: boolean;
  matchCount: number;
  viewPending: boolean;
  viewError: string | null;
  empty: boolean;
  knockId: string | null;
  onHitView: (view: FieldView) => void;
  onSearchView: (view: FieldView) => void;
  onTextSearch: (query: string) => void;
  onImageSearch: (file: File) => void;
  onHitStop: (stop: StopData) => void;
  onRemoveFilter: (index: number) => void;
  onFocusCapture: (id: number) => void;
  onToggleSave: () => void;
  onClose: () => void;
}) {
  const arms = armsOf(view, focused);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [open, setOpen] = useState(false);
  const [hit, setHit] = useState(false);
  const [held, setHeld] = useState<Capture | null>(null);
  const [activeResult, setActiveResult] = useState(0);
  const [keying, setKeying] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const keyTimerRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const lexicalGroups = useMemo(
    () => searchCatalog(deferredQuery),
    [deferredQuery],
  );
  const starters = useMemo(() => browseCatalog(), []);
  const hasFilters = filters.length > 0;
  const normalizedQuery = deferredQuery.trim();
  const groups = useMemo(() => {
    if (normalizedQuery.length < 3) return lexicalGroups;
    const searchAction: SearchHit = {
      kind: "search",
      id: normalizedQuery,
      title: hasFilters
        ? `Search selected filters for “${normalizedQuery}”`
        : `Search every capture for “${normalizedQuery}”`,
      sub: hasFilters
        ? "Combine semantic matches with selected filters"
        : "Open matching captures as a view",
    };
    return [{ label: "All captures", items: [searchAction] }, ...lexicalGroups];
  }, [hasFilters, lexicalGroups, normalizedQuery]);
  const lexicalPending = query !== deferredQuery;
  const searchPending = lexicalPending;
  const showResults = open && (query.trim().length > 0 || uploadError !== null);
  const showSuggest = open && !query.trim() && !uploadError && !focused;
  const navigationGroups =
    query.trim().length > 0 ? groups : uploadError ? [] : starters;
  const navigationHits = navigationGroups.flatMap((group) => group.items);
  const activeHit =
    navigationHits[Math.min(activeResult, navigationHits.length - 1)] ?? null;
  const activeHitKey = activeHit ? searchHitKey(activeHit) : null;
  const colors = focused ? paletteOf(focused.id).map(hexSwatch) : [];
  const plate = focused ?? held;
  const filterKey = filters.map((item) => viewTitle(item)).join("/");
  const displayView = latestFieldFilter(view) ?? view;
  const fontHeader = displayView.kind === "font" && !focused;

  const clearUploadError = () => {
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    setUploadError(null);
  };

  const chooseImage = (file: File) => {
    clearUploadError();
    setQuery("");
    setActiveResult(0);
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setUploadError("Choose a JPEG or PNG image.");
      setOpen(true);
      return;
    }
    if (file.size === 0 || file.size > 4 * 1024 * 1024) {
      setUploadError("Choose an image smaller than 4 MB.");
      setOpen(true);
      return;
    }
    setOpen(false);
    onImageSearch(file);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const selectHit = (hit: SearchHit, audio = false) => {
    const index = navigationHits.findIndex(
      (candidate) => searchHitKey(candidate) === searchHitKey(hit),
    );
    if (index >= 0) setActiveResult(index);
    if (audio) sfx.contact("glass");
  };

  const navigateHits = (delta: number) => {
    if (navigationHits.length === 0) return;
    setActiveResult((current) => {
      const next =
        (current + delta + navigationHits.length) % navigationHits.length;
      return next;
    });
    sfx.contact("glass");
    setKeying(true);
    window.clearTimeout(keyTimerRef.current);
    keyTimerRef.current = window.setTimeout(() => setKeying(false), 180);
  };

  const activateHit = (hit: SearchHit) => {
    sfx.press("glass");
    if (hit.kind === "search") onTextSearch(hit.id);
    else if (hit.kind === "capture") onFocusCapture(Number(hit.id));
    else if (hit.kind === "term") onSearchView({ kind: "term", id: hit.id });
    else if (hit.kind === "facet") onSearchView({ kind: "facet", id: hit.id });
    else if (hit.kind === "font")
      onSearchView({ kind: "font", family: hit.id });
    else onSearchView({ kind: "domain", origin: hit.id });
    setOpen(false);
    setQuery("");
    clearUploadError();
  };

  useEffect(() => {
    if (focused) setHeld(focused);
  }, [focused]);

  useEffect(() => {
    let timer = 0;
    const off = onImpulse(() => {
      setHit(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHit(false), 420);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    setActiveResult(0);
  }, [deferredQuery, open]);

  useEffect(() => {
    if (!open || !activeHit) return;
    window.requestAnimationFrame(() => {
      document
        .getElementById(searchHitDomId(activeHit))
        ?.scrollIntoView({ block: "nearest" });
    });
  }, [activeHitKey, open]);
  useEffect(() => {
    const element = filtersRef.current;
    if (!element) return;
    element.scrollLeft = element.scrollWidth;
  }, [filterKey]);

  useEffect(
    () => () => {
      window.clearTimeout(keyTimerRef.current);
    },
    [],
  );

  return (
    <>
      <div className={cn("instrument pointer-events-auto", hit && "is-hit")}>
        <div
          className={cn(
            "search-bar [backdrop-filter:blur(36px)_saturate(1.08)]",
            focused && "is-plate",
            (searchPending || viewPending) && "is-loading",
            keying && "is-keying",
          )}
          aria-busy={searchPending || viewPending}
        >
          <div
            className={cn(
              "head-layer",
              !focused && "is-on",
              hasFilters && "has-filters",
            )}
            aria-hidden={!!focused}
          >
            <Search className="size-4 shrink-0 text-subtle" strokeWidth={1.6} />
            <div ref={filtersRef} key={filterKey} className="head-filters">
              {filters.map((item, index) => (
                <button
                  key={`${viewTitle(item)}-${index}`}
                  type="button"
                  className="search-pill is-now"
                  style={{ ["--i" as string]: index }}
                  tabIndex={focused ? -1 : 0}
                  aria-label={`Remove ${viewTitle(item)} filter`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveFilter(index);
                  }}
                >
                  {item.kind === "domain" && <Favicon origin={item.origin} />}
                  {item.kind === "visual" && (
                    <img
                      className="search-pill-thumbnail"
                      src={mediaUrl(item.id)}
                      alt=""
                    />
                  )}
                  {item.kind === "palette" ? (
                    <Swatches
                      colors={viewPalette(item).map(hexSwatch)}
                      className="in-search"
                    />
                  ) : (
                    viewTitle(item)
                  )}
                  <X className="size-3.5 text-subtle" strokeWidth={1.8} />
                </button>
              ))}
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                clearUploadError();
                setQuery(event.target.value);
                setActiveResult(0);
                setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setQuery("");
                  clearUploadError();
                  setOpen(false);
                  event.currentTarget.blur();
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setOpen(true);
                  navigateHits(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setOpen(true);
                  navigateHits(-1);
                } else if (event.key === "Home" && navigationHits.length > 0) {
                  event.preventDefault();
                  setActiveResult(0);
                } else if (event.key === "End" && navigationHits.length > 0) {
                  event.preventDefault();
                  setActiveResult(navigationHits.length - 1);
                } else if (
                  event.key === "Enter" &&
                  !lexicalPending &&
                  activeHit
                ) {
                  event.preventDefault();
                  activateHit(activeHit);
                }
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 140)}
              placeholder={
                hasFilters ? "Add a filter or search" : "Search by text"
              }
              maxLength={512}
              data-field-search
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showResults || showSuggest}
              aria-controls="explorer-search-results"
              aria-activedescendant={
                activeHit ? searchHitDomId(activeHit) : undefined
              }
              tabIndex={focused ? -1 : 0}
              className="h-11 min-w-[7rem] flex-1 bg-transparent text-base text-fg outline-none placeholder:text-subtle"
            />
            <button
              type="button"
              className="semantic-image-search-button"
              aria-label={
                uploadError ? "Clear image search error" : "Search by image"
              }
              tabIndex={focused ? -1 : 0}
              onPointerDown={(event) => event.preventDefault()}
              onPointerEnter={() => sfx.contact("glass")}
              onClick={() => {
                haptics.selection();
                if (uploadError) clearUploadError();
                else uploadInputRef.current?.click();
              }}
            >
              {uploadError ? (
                <X className="size-4" strokeWidth={1.7} />
              ) : (
                <ImagePlus className="size-4" strokeWidth={1.7} />
              )}
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              tabIndex={-1}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) chooseImage(file);
              }}
            />
            <span className="search-count">
              <span>{viewPending ? "…" : matchCount}</span>
              <span className="search-count-total">/{CAPTURE_COUNT}</span>
            </span>
          </div>
          <div
            className={cn("head-layer is-identity", focused && "is-on")}
            aria-hidden={!focused}
          >
            {plate && (
              <PlateInner
                capture={plate}
                saved={saved}
                onHitView={onHitView}
                onToggleSave={onToggleSave}
                onClose={onClose}
              />
            )}
          </div>
        </div>
        {!focused && (showResults || showSuggest) && (
          <div
            id="explorer-search-results"
            role="listbox"
            className="legend [backdrop-filter:blur(42px)_saturate(1.04)]"
          >
            {showResults &&
              (lexicalPending ? (
                <p className="px-3 py-3 text-sm text-muted">Searching…</p>
              ) : navigationGroups.length > 0 ? (
                navigationGroups.map((group) => (
                  <HitGroup
                    key={group.label}
                    label={group.label}
                    items={group.items}
                    onActivate={activateHit}
                    activeKey={activeHitKey}
                    onActive={(hit) => selectHit(hit, true)}
                  />
                ))
              ) : uploadError ? null : (
                <p className="px-3 py-3 text-sm text-muted">No matches</p>
              ))}
            {showResults && uploadError && (
              <p className="semantic-search-error" role="alert">
                {uploadError}
              </p>
            )}
            {showSuggest &&
              starters.map((group) => (
                <HitGroup
                  key={group.label}
                  label={group.label}
                  items={group.items}
                  onActivate={activateHit}
                  activeKey={activeHitKey}
                  onActive={(hit) => selectHit(hit, true)}
                />
              ))}
          </div>
        )}
      </div>
      {fontHeader && (
        <FontViewHeader
          family={displayView.kind === "font" ? displayView.family : ""}
          similar={arms.x}
          similarLoading={
            displayView.kind === "font"
              ? !fontSimilarityReady(displayView.family)
              : false
          }
          pairings={arms.also}
          onHit={onHitStop}
        />
      )}

      {!fontHeader && arms.x.length > 0 && (
        <aside
          key={`x-${focused?.id ?? filterKey}`}
          className="arm arm-x pointer-events-none"
        >
          {arms.x.map((stop, index) => (
            <Stop
              key={stop.id}
              stop={stop}
              index={index}
              knocking={knockId === stop.id}
              onHit={onHitStop}
            />
          ))}
        </aside>
      )}

      {!fontHeader && (arms.also.length > 0 || colors.length > 0) && (
        <aside
          key={`also-${focused?.id ?? filterKey}`}
          className="arm arm-also pointer-events-none"
        >
          {colors.length > 0 && (
            <PaletteStop
              colors={colors}
              onHit={() =>
                focused && onHitView({ kind: "palette", id: focused.id })
              }
            />
          )}
          {arms.also.map((stop, index) => (
            <Stop
              key={stop.id}
              stop={stop}
              index={index}
              knocking={knockId === stop.id}
              onHit={onHitStop}
            />
          ))}
        </aside>
      )}

      {arms.voice.length > 0 && (
        <div className="arm-voice">
          {arms.voice.map((stop, index) => (
            <TypographyCard
              key={stop.id}
              stop={stop}
              index={index}
              onHit={onHitStop}
            />
          ))}
        </div>
      )}

      {empty && viewPending && (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          role="status"
        >
          <p className="font-display text-3xl tracking-tight">
            Loading matches
          </p>
        </div>
      )}

      {empty && !viewPending && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="font-display text-3xl tracking-tight">
            {viewError ?? "Nothing in this set"}
          </p>
        </div>
      )}

      {(focused ||
        (!fontHeader &&
          (arms.voice.length > 0 ||
            arms.x.length > 0 ||
            arms.also.length > 0 ||
            colors.length > 0))) && (
        <MobileDock
          focused={focused}
          voice={arms.voice}
          related={[...arms.x, ...arms.also]}
          colors={colors}
          onHitStop={onHitStop}
          onPalette={() =>
            focused && onHitView({ kind: "palette", id: focused.id })
          }
          onClose={onClose}
        />
      )}
    </>
  );
}
function MobileDock({
  focused,
  voice,
  related,
  colors,
  onHitStop,
  onPalette,
  onClose,
}: {
  focused: Capture | null;
  voice: StopData[];
  related: StopData[];
  colors: string[];
  onHitStop: (stop: StopData) => void;
  onPalette: () => void;
  onClose: () => void;
}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointerRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const dragYRef = useRef(0);
  const suppressClickRef = useRef(false);
  const scrollTimerRef = useRef(0);
  const stripPointerRef = useRef<number | null>(null);
  const stripStartRef = useRef({ x: 0, y: 0 });
  const stripMovedRef = useRef(false);
  const suppressStripClickRef = useRef(false);
  const snapIndexesRef = useRef(new WeakMap<Element, number>());
  const hasRelated = colors.length > 0 || related.length > 0;

  useEffect(
    () => () => {
      window.clearTimeout(scrollTimerRef.current);
    },
    [],
  );

  const resetDrag = () => {
    pointerRef.current = null;
    dragYRef.current = 0;
    setDragY(0);
    setDragging(false);
  };

  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    pointerRef.current = event.pointerId;
    startYRef.current = event.clientY;
    dragYRef.current = 0;
    suppressClickRef.current = false;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    const next = Math.max(0, event.clientY - startYRef.current);
    dragYRef.current = next;
    setDragY(next);
  };

  const onHandleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    const dismiss = dragYRef.current >= 56;
    suppressClickRef.current = dismiss;
    resetDrag();
    if (dismiss) onClose();
  };

  const onHandleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onClose();
  };

  const onStripScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const strip = event.currentTarget;
    window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      const items = Array.from(strip.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      if (items.length < 2) return;
      const center = strip.scrollLeft + strip.clientWidth / 2;
      let closest = 0;
      let distance = Number.POSITIVE_INFINITY;
      items.forEach((item, index) => {
        const next = Math.abs(item.offsetLeft + item.offsetWidth / 2 - center);
        if (next < distance) {
          distance = next;
          closest = index;
        }
      });
      const previous = snapIndexesRef.current.get(strip) ?? 0;
      snapIndexesRef.current.set(strip, closest);
      if (previous !== closest) haptics.selection();
    }, 80);
  };

  const onStripPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    stripPointerRef.current = event.pointerId;
    stripStartRef.current = { x: event.clientX, y: event.clientY };
    stripMovedRef.current = false;
    suppressStripClickRef.current = false;
  };

  const onStripPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stripPointerRef.current !== event.pointerId) return;
    const dx = Math.abs(event.clientX - stripStartRef.current.x);
    const dy = Math.abs(event.clientY - stripStartRef.current.y);
    if (dx > 8 || dy > 8) stripMovedRef.current = true;
  };

  const onStripPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stripPointerRef.current !== event.pointerId) return;
    stripPointerRef.current = null;
    if (!stripMovedRef.current) return;
    suppressStripClickRef.current = true;
  };

  const onStripClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressStripClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressStripClickRef.current = false;
  };

  return (
    <aside
      className={cn(
        "dock pointer-events-auto",
        focused ? "is-focus" : "is-context",
        dragging && "is-dragging",
      )}
      style={{ ["--dock-drag" as string]: `${dragY}px` } as CSSProperties}
      aria-label={focused ? "Capture details" : "Explore this set"}
    >
      {focused && (
        <button
          type="button"
          className="dock-handle"
          aria-label="Close capture"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={resetDrag}
          onClick={onHandleClick}
        >
          <span aria-hidden="true" />
        </button>
      )}
      <div className="dock-content">
        {voice.length > 0 && (
          <section className="dock-section" aria-label="Type on this page">
            <span className="dock-section-label">
              {focused ? "Type on this page" : "Type in this set"}
            </span>
            <div
              className="dock-strip dock-type-strip"
              onScroll={onStripScroll}
              onPointerDown={onStripPointerDown}
              onPointerMove={onStripPointerMove}
              onPointerUp={onStripPointerUp}
              onPointerCancel={onStripPointerUp}
              onClickCapture={onStripClick}
            >
              {voice.map((stop, index) => (
                <TypographyCard
                  key={`mobile-type-${stop.id}`}
                  stop={stop}
                  index={index}
                  onHit={onHitStop}
                  compact
                />
              ))}
            </div>
          </section>
        )}
        {hasRelated && (
          <section className="dock-section" aria-label="Explore related">
            <span className="dock-section-label">
              {focused ? "Explore related" : "Explore this set"}
            </span>
            <div
              className="dock-strip dock-related-strip"
              onScroll={onStripScroll}
              onPointerDown={onStripPointerDown}
              onPointerMove={onStripPointerMove}
              onPointerUp={onStripPointerUp}
              onPointerCancel={onStripPointerUp}
              onClickCapture={onStripClick}
            >
              {colors.length > 0 && (
                <PaletteStop colors={colors} onHit={onPalette} />
              )}
              {related.map((stop, index) => (
                <Stop
                  key={`mobile-related-${stop.id}-${index}`}
                  stop={stop}
                  index={index}
                  onHit={onHitStop}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function TypographyCard({
  stop,
  index,
  onHit,
  compact = false,
}: {
  stop: StopData;
  index: number;
  onHit: (stop: StopData) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "voice-stop [backdrop-filter:blur(36px)_saturate(1.08)]",
        compact && "is-compact",
      )}
      style={{ ["--i" as string]: index }}
      onPointerEnter={() => sfx.contact("string")}
      onPointerDown={() => sfx.press("string")}
      onClick={() => onHit(stop)}
    >
      {stop.family ? (
        <>
          <span className="voice-family">{fontFamilyLabel(stop.family)}</span>
          <span className="voice-specimen">
            <FontSpecimen
              family={stop.family}
              familyId={stop.fontFamilyId}
              previewUrl={stop.fontPreviewUrl}
              imagePreview
              weight={stop.weight ?? 400}
              className="voice-face"
            >
              {FONT_PANGRAM}
            </FontSpecimen>
          </span>
          {stop.typography ? (
            <TypographyFacts info={stop.typography} />
          ) : (
            stop.meta && <span className="voice-note">{stop.meta}</span>
          )}
        </>
      ) : (
        <span className="voice-face">{stop.label}</span>
      )}
    </button>
  );
}

function TypographyFacts({ info }: { info: TypographyInfo }) {
  const usage = [
    info.styles > 0
      ? `${info.styles} ${info.styles === 1 ? "style" : "styles"}`
      : "",
    info.uses > 0 ? `${info.uses} ${info.uses === 1 ? "use" : "uses"}` : "",
  ].filter(Boolean);
  return (
    <span className="voice-facts">
      {info.roles.length > 0 && (
        <span className="voice-roles">
          {info.roles.map((role) => (
            <span key={role}>{role}</span>
          ))}
        </span>
      )}
      <span className="voice-metrics">
        {info.weights.length > 0 && (
          <span>
            <span className="voice-metric-label">Weight</span>
            {formatValues(info.weights, (value) => String(value))}
          </span>
        )}
        {info.sizes.length > 0 && (
          <span>
            <span className="voice-metric-label">Size</span>
            {formatValues(info.sizes, pxSize)}
          </span>
        )}
      </span>
      {(usage.length > 0 || info.note) && (
        <span className="voice-note">
          {[...usage, info.note].filter(Boolean).join(" · ")}
        </span>
      )}
    </span>
  );
}

function formatValues(values: number[], formatter: (value: number) => string) {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length <= 3) return unique.map(formatter).join(" / ");
  return `${formatter(unique[0]!)}–${formatter(unique.at(-1)!)}`;
}

function fontFamilyLabel(family: string) {
  return family
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}

function PlateInner({
  capture,
  saved,
  onHitView,
  onToggleSave,
  onClose,
}: {
  capture: Capture;
  saved: boolean;
  onHitView: (view: FieldView) => void;
  onToggleSave: () => void;
  onClose: () => void;
}) {
  const facts = [
    formatDate(capture.capturedAt),
    capture.viewportWidth && capture.viewportHeight
      ? `${capture.viewportWidth}×${capture.viewportHeight}`
      : "",
    isKnown(capture.device) ? capture.device : "",
  ].filter(Boolean);

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 max-w-[11rem] shrink-0 items-center gap-2"
        onPointerEnter={() => sfx.contact("paper")}
        onPointerDown={() => sfx.press("paper")}
        onClick={() => onHitView({ kind: "domain", origin: capture.origin })}
      >
        <Favicon key={capture.id} origin={capture.origin} />
        <span className="min-w-0 text-left">
          <span className="block truncate text-[0.9375rem] font-medium">
            {capture.host}
          </span>
          {facts.length > 0 && (
            <span className="block truncate font-mono text-[0.625rem] text-subtle">
              {facts.join(" · ")}
            </span>
          )}
        </span>
      </button>
      <span className="plate-title" title={capture.title}>
        {capture.title}
      </span>
      <div className="plate-actions">
        {capture.pageUrl && (
          <a
            href={capture.pageUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open live page"
            onClick={() => haptics.selection()}
          >
            <ExternalLink className="size-3.5" strokeWidth={1.6} />
          </a>
        )}
        <CaptureAiHandoff capture={capture} />
        <button
          type="button"
          onClick={onToggleSave}
          aria-label={saved ? "Remove from saved" : "Save capture"}
        >
          {saved ? (
            <BookmarkCheck className="size-3.5" strokeWidth={1.6} />
          ) : (
            <Bookmark className="size-3.5" strokeWidth={1.6} />
          )}
        </button>
        <button type="button" onClick={onClose} aria-label="Close capture">
          <X className="size-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </>
  );
}

function searchHitKey(hit: SearchHit) {
  return `${hit.kind}:${hit.id}`;
}

function searchHitDomId(hit: SearchHit) {
  return `search-hit-${encodeURIComponent(searchHitKey(hit))}`;
}

function HitGroup({
  label,
  items,
  onActivate,
  activeKey,
  onActive,
}: {
  label: string;
  items: SearchHit[];
  onActivate: (hit: SearchHit) => void;
  activeKey: string | null;
  onActive: (hit: SearchHit) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="kicker px-3 pt-3 pb-1">{label}</p>
      {items.map((hit) => {
        const active = searchHitKey(hit) === activeKey;
        return (
          <button
            id={searchHitDomId(hit)}
            key={`${hit.kind}-${hit.id}`}
            type="button"
            role="option"
            aria-selected={active}
            onMouseDown={(event) => event.preventDefault()}
            onPointerEnter={() => onActive(hit)}
            onPointerDown={() => sfx.press("paper")}
            onClick={() => onActivate(hit)}
            className={cn("hit-result", active && "is-active")}
          >
            <span className="hit-title">
              {hit.kind === "domain" && <Favicon origin={hit.id} />}
              <span className="truncate text-[0.9375rem]">{hit.title}</span>
            </span>
            <span className="hit-sub ml-3 shrink-0 font-mono text-[0.6875rem]">
              {hit.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}
