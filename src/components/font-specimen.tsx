import { useEffect, useState } from "react";
import { CATALOG_GENERATION } from "@/lib/fudge/catalog";
import { cssFont } from "@/lib/fudge/fonts";
import { cn } from "@/lib/utils";

export const FONT_PANGRAM = "Hamburgefontsiv 0123456789";

type FontSourceResponse = {
  observedGeneration?: number;
  source?: {
    fontUrl?: string;
    format?: string;
  } | null;
};

const directFontLoads = new Map<string, Promise<string | null>>();
const googleFontLoads = new Map<string, Promise<string | null>>();

function loadGoogleFont(family: string): Promise<string | null> {
  const key = family.toLocaleLowerCase("en-US");
  const pending = googleFontLoads.get(key);
  if (pending) return pending;
  const request = new Promise<string | null>((resolve) => {
    const link = document.createElement("link");
    const url = new URL("https://fonts.googleapis.com/css2");
    url.searchParams.set("family", family);
    url.searchParams.set("display", "swap");
    link.rel = "stylesheet";
    link.href = url.href;
    link.onload = () => {
      void document.fonts.load(`1em "${family.replace(/"/g, "")}"`).then(
        () => resolve(family),
        () => resolve(null),
      );
    };
    link.onerror = () => resolve(null);
    document.head.append(link);
  });
  googleFontLoads.set(key, request);
  return request;
}

function loadDirectFont(
  familyId: number,
  family: string,
): Promise<string | null> {
  const key = `${familyId}:${family}`;
  const pending = directFontLoads.get(key);
  if (pending) return pending;
  const request = fetch(
    `/v1/family-font-source?familyId=${familyId}&generation=${CATALOG_GENERATION}`,
    { headers: { accept: "application/json" }, credentials: "same-origin" },
  )
    .then(async (response) => {
      if (!response.ok) return loadGoogleFont(family);
      const body = (await response.json()) as FontSourceResponse;
      const source = body.source;
      if (
        !Number.isSafeInteger(body.observedGeneration) ||
        (body.observedGeneration ?? 0) < 1 ||
        !source?.fontUrl
      ) {
        return loadGoogleFont(family);
      }
      const loadedFamily = `fudge-family-${familyId}`;
      const face = new FontFace(
        loadedFamily,
        `url("${source.fontUrl}") format("${source.format ?? "truetype"}")`,
      );
      await face.load();
      document.fonts.add(face);
      return loadedFamily;
    })
    .catch(() => loadGoogleFont(family));
  directFontLoads.set(key, request);
  return request;
}

export function FontSpecimen({
  family,
  familyId,
  previewUrl,
  imagePreview = false,
  weight = 400,
  children,
  className,
}: {
  family: string;
  familyId?: number;
  previewUrl?: string;
  imagePreview?: boolean;
  weight?: number;
  children: string;
  className?: string;
}) {
  const [loadedFamily, setLoadedFamily] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  useEffect(() => {
    setLoadedFamily(null);
    setPreviewFailed(false);
    setPreviewLoaded(false);
    let alive = true;
    const request = familyId
      ? loadDirectFont(familyId, family)
      : loadGoogleFont(family);
    void request.then((name) => {
      if (alive) setLoadedFamily(name);
    });
    return () => {
      alive = false;
    };
  }, [family, familyId]);

  if (imagePreview && !loadedFamily && previewUrl && !previewFailed) {
    return (
      <span
        className={cn(
          className,
          "font-preview-frame",
          previewLoaded && "is-loaded",
        )}
        style={{ fontFamily: cssFont(family), fontWeight: weight }}
      >
        {children}
        <img
          className="font-preview-image"
          src={previewUrl}
          alt=""
          aria-hidden="true"
          onLoad={() => setPreviewLoaded(true)}
          onError={() => setPreviewFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        fontFamily: loadedFamily ? `"${loadedFamily}"` : cssFont(family),
        fontWeight: weight,
      }}
    >
      {children}
    </span>
  );
}
