import {
  familyFontPreviewUrl,
  fontCaptureCount,
  fontMetadataOf,
} from "@/lib/fudge/catalog";
import type { FontCredit } from "@/lib/fudge/types";
import type { Stop as StopData } from "@/lib/fudge/move";
import { FONT_PANGRAM, FontSpecimen } from "@/components/font-specimen";
import { haptics } from "@/lib/haptics";
import { sfx } from "@/lib/sfx";

const FONT_VIEW_SAMPLE = "Hamburgefontsiv";

export function FontViewHeader({
  family,
  similar,
  similarLoading,
  pairings,
  onHit,
}: {
  family: string;
  similar: StopData[];
  similarLoading: boolean;
  pairings: StopData[];
  onHit: (stop: StopData) => void;
}) {
  const metadata = fontMetadataOf(family);
  const familyId = metadata?.familyIds[0];
  const designers = metadata?.designers ?? [];
  const foundries = metadata?.foundries ?? [];
  const captureCount = fontCaptureCount(family);

  return (
    <section className="font-view-header" aria-label={`${family} font details`}>
      <section className="font-view-section font-view-primary">
        <span className="font-view-label">{family}</span>
        <FontSpecimen
          family={family}
          familyId={familyId}
          previewUrl={
            familyId
              ? familyFontPreviewUrl(familyId, FONT_VIEW_SAMPLE)
              : undefined
          }
          imagePreview
          weight={400}
          className="font-view-primary-face"
        >
          {FONT_VIEW_SAMPLE}
        </FontSpecimen>
        <p className="font-view-prose">
          <strong>{family}</strong>
          {designers.length > 0 && (
            <>
              {" by "}
              <FontCreditLinks credits={designers} />
            </>
          )}
          {foundries.length > 0 && (
            <>
              {", sold by "}
              <FontCreditLinks credits={foundries} />
            </>
          )}
          . <strong>{captureCount.toLocaleString()} captures</strong>.
        </p>
      </section>

      <section className="font-view-section font-view-related">
        <div className="font-view-related-group">
          <span className="font-view-label">Similar in shape</span>
          <div className="font-view-preview-list">
            {similarLoading && (
              <span
                className="font-view-loading-skeleton"
                aria-label="Loading similar fonts"
              >
                <i />
                <i />
                <i />
              </span>
            )}
            {!similarLoading && similar.length === 0 && (
              <span className="font-view-empty">
                No similar fonts are available.
              </span>
            )}
            {!similarLoading &&
              similar.map((stop) => (
                <button
                  key={stop.id}
                  type="button"
                  onPointerEnter={() => sfx.contact("string")}
                  onPointerDown={() => sfx.press("string")}
                  onClick={() => onHit(stop)}
                >
                  <span>{stop.label}</span>
                  <FontSpecimen
                    family={stop.family ?? stop.label}
                    familyId={stop.fontFamilyId}
                    previewUrl={
                      stop.fontFamilyId
                        ? familyFontPreviewUrl(
                            stop.fontFamilyId,
                            FONT_VIEW_SAMPLE,
                          )
                        : stop.fontPreviewUrl
                    }
                    imagePreview
                    weight={stop.weight ?? 400}
                    className="font-view-related-face"
                  >
                    {FONT_VIEW_SAMPLE}
                  </FontSpecimen>
                </button>
              ))}
          </div>
        </div>

        <div className="font-view-pairings">
          <span className="font-view-label">Often seen with</span>
          {pairings.length === 0 ? (
            <span className="font-view-empty">No recorded pairings.</span>
          ) : (
            <span className="font-view-pairing-prose">
              {pairings.map((stop, index) => (
                <span key={stop.id}>
                  {index > 0 &&
                    (index === pairings.length - 1 ? " and " : ", ")}
                  <button
                    type="button"
                    onPointerEnter={() => sfx.contact("string")}
                    onPointerDown={() => sfx.press("string")}
                    onClick={() => onHit(stop)}
                  >
                    {stop.label}
                  </button>
                </span>
              ))}
              .
            </span>
          )}
        </div>
      </section>
    </section>
  );
}

function FontCreditLinks({ credits }: { credits: FontCredit[] }) {
  return (
    <>
      {credits.map((credit, index) => (
        <span key={credit.id}>
          {index > 0 && (index === credits.length - 1 ? " and " : ", ")}
          {credit.url ? (
            <a
              href={credit.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => haptics.selection()}
            >
              {credit.name} ↗
            </a>
          ) : (
            credit.name
          )}
        </span>
      ))}
    </>
  );
}
