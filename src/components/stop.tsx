import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FontSpecimen } from "@/components/font-specimen";
import { sfx } from "@/lib/sfx";
import type { Stop as StopData } from "@/lib/fudge/move";
import type { Material } from "@/lib/impulse";

function StopLabel({ stop }: { stop: StopData }) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [duration, setDuration] = useState(7);

  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return;
    const measure = () => {
      const width = text.getBoundingClientRect().width;
      setOverflowing(width > viewport.clientWidth + 1);
      setDuration(Math.max(7, width / 28));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(text);
    return () => observer.disconnect();
  }, [stop.family, stop.label, stop.weight]);

  const text = (copy = false) => (
    <span
      ref={copy ? undefined : textRef}
      className="stop-label-text"
      aria-hidden={copy || undefined}
    >
      {stop.family ? (
        <FontSpecimen
          family={stop.family}
          familyId={stop.fontFamilyId}
          previewUrl={stop.fontPreviewUrl}
          weight={stop.weight ?? 400}
        >
          {stop.label}
        </FontSpecimen>
      ) : (
        stop.label
      )}
    </span>
  );

  return (
    <span
      ref={viewportRef}
      className="stop-label"
      data-overflow={overflowing || undefined}
      style={{ ["--marquee-duration" as string]: `${duration}s` }}
    >
      <span className="stop-label-track">
        {text()}
        {overflowing && text(true)}
      </span>
    </span>
  );
}

export function Stop({
  stop,
  index = 0,
  knocking = false,
  onHit,
}: {
  stop: StopData;
  index?: number;
  knocking?: boolean;
  onHit: (stop: StopData) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "stop [backdrop-filter:blur(36px)_saturate(1.08)]",
        `stop-${stop.material}`,
        knocking && "is-knock",
        !stop.view && "is-passive",
      )}
      style={{ ["--i" as string]: index }}
      onPointerEnter={() => stop.view && sfx.contact(stop.material)}
      onPointerDown={() => stop.view && sfx.press(stop.material)}
      onClick={() => stop.view && onHit(stop)}
      aria-disabled={!stop.view}
    >
      {stop.thumbnail && (
        <img className="stop-thumbnail" src={stop.thumbnail} alt="" />
      )}
      {stop.loading ? (
        <span
          className="stop-loading-skeleton"
          aria-label="Loading measured effects"
        >
          <i />
          <i />
          <i />
        </span>
      ) : (
        <StopLabel stop={stop} />
      )}
      {stop.swatch ? (
        <span
          className="stop-swatch"
          style={{ background: stop.swatch }}
          title={stop.swatch}
          aria-label={stop.swatch}
        />
      ) : stop.meta || stop.count != null ? (
        <span className="shrink-0 font-mono text-[0.6875rem] text-subtle tabular-nums">
          {stop.meta ?? stop.count}
        </span>
      ) : null}
    </button>
  );
}

export function Swatches({
  colors,
  className,
}: {
  colors: string[];
  className?: string;
}) {
  if (colors.length === 0) return null;
  return (
    <span className={cn("pill-swatches", className)}>
      {colors.map((color) => (
        <i key={color} style={{ flexGrow: 1, background: color }} />
      ))}
    </span>
  );
}

export function PaletteStop({
  colors,
  onHit,
  material = "glass",
}: {
  colors: string[];
  onHit: () => void;
  material?: Material;
}) {
  if (colors.length === 0) return null;
  return (
    <button
      type="button"
      className="stop stop-glass px-1"
      aria-label="This palette"
      onPointerEnter={() => sfx.contact(material)}
      onPointerDown={() => sfx.press(material)}
      onClick={onHit}
    >
      <Swatches colors={colors} />
    </button>
  );
}
