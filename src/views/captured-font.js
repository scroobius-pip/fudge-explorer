import { html, nothing } from "lit";
import { store } from "../data/store.js";
import { esc } from "../data/util.js";
import { KV, capRow, foot, section } from "./shared.js";
import "../components/font-preview.js";

function capturedFontIdentity(id) {
  const match = /^(\d+):(\d+)$/.exec(String(id));
  if (!match) return null;
  const captureId = Number(match[1]);
  const observationIndex = Number(match[2]);
  return Number.isSafeInteger(captureId) && captureId > 0
    && Number.isSafeInteger(observationIndex) && observationIndex >= 0
    ? { captureId, observationIndex }
    : null;
}

function pipelineLabel(state) {
  return ({
    searchable: "ready for visual search",
    acquired_without_active_descriptor: "font file retained; visual search pending",
    source_not_acquired: "font file has not been retained",
    failed: "font file could not be retained",
  })[state] || String(state || "status unavailable").replace(/_/g, " ");
}

function faceSummary(face) {
  const metadata = face.metadata || {};
  return [
    metadata.fullName || metadata.family,
    metadata.version,
    metadata.vendorName,
  ].filter(Boolean).join(" · ");
}

export async function vCapturedFont(c, ctx) {
  const identity = capturedFontIdentity(c.id);
  if (!identity) return { n: null, body: html`<div class="empty">captured font not found</div>` };
  const cp = ctx.idx.cById.get(identity.captureId);
  const observed = (ctx.idx.fontsByCap.get(identity.captureId) || [])
    .find((row) => row[6] === identity.observationIndex);
  if (!cp || !observed) return { n: null, body: html`<div class="empty">captured font not found</div>` };

  const payload = await store.loadSimilarity(
    `captured-font:${identity.captureId}:${identity.observationIndex}`,
    "/v1/captured-font",
    identity,
  );
  const familyName = payload.observation?.declaredFamily || observed[0];
  const face = payload.faces?.[0] || null;
  const resolution = face?.resolution || null;
  const confirmed = resolution?.state === "confirmed" && resolution.familyId;
  const candidate = resolution?.state === "candidate" && resolution.familyId;
  const status = pipelineLabel(payload.pipeline?.state);
  const body = html`
    <div class="sec"><div class="associated-capture">${capRow(cp, `capture #${identity.captureId}`)}</div></div>
    <font-preview class="font-preview-hero" .result=${{
      familyName,
      previewUrl: payload.previewUrl,
    }}></font-preview>
    <div class="font-hero-caption">
      <strong>${esc(familyName)}</strong>
      <span>captured font · observation ${identity.observationIndex}</span>
    </div>
    <p class="prose">${esc(status)}.${confirmed
      ? html` Confirmed as <a class="lk fam" data-hop-type="family" data-hop-id=${resolution.familyId} data-hop-label=${String(resolution.familyName || familyName).slice(0, 40)}>${esc(resolution.familyName || familyName)}</a>.`
      : candidate
        ? html` Possible catalogue match: <a class="lk fam" data-hop-type="family" data-hop-id=${resolution.familyId} data-hop-label=${String(resolution.familyName || familyName).slice(0, 40)}>${esc(resolution.familyName || familyName)}</a>. This match has not been confirmed.`
        : html` No catalogue identity has been confirmed yet.`}</p>
    ${KV([
      ["declared family", esc(familyName), false],
      ["computed stack", esc(payload.observation?.computedCssStack || observed[1] || "—"), false],
      ["font file", payload.pipeline?.acquisitionIndex == null ? "not retained" : "retained", false],
      ["visual search", payload.pipeline?.state === "searchable" ? "ready" : "not ready", false],
      ["catalogue link", confirmed
        ? esc(resolution.familyName || `family #${resolution.familyId}`)
        : candidate
          ? `possible match: ${resolution.familyName || `family #${resolution.familyId}`}`
          : "unresolved", false],
    ])}
    ${face ? section("font metadata", html`
      ${faceSummary(face) ? html`<div class="hint">${esc(faceSummary(face))}</div>` : nothing}
      ${KV([
        ["family", esc(face.metadata?.family || "—"), false],
        ["subfamily", esc(face.metadata?.subfamily || "—"), false],
        ["PostScript name", esc(face.metadata?.postscriptName || "—"), true],
        ["version", esc(face.metadata?.version || "—"), true],
        ["variable axes", String(face.metadata?.axisCount ?? 0), true],
      ])}`) : nothing}
    ${payload.pipeline?.failureCode ? html`<div class="system-callout">Font processing failed: ${esc(payload.pipeline.failureCode.replace(/_/g, " "))}</div>` : nothing}
    ${payload.pipeline?.state === "searchable" ? section("visual similarity", html`
      <button class="evidence-family-row" data-hop-type="capturedFontLookup" data-hop-id="${identity.captureId}:${identity.observationIndex}" data-hop-label="Similar to ${String(familyName).slice(0, 28)}">
        <span class="evidence-family-copy">
          <span class="evidence-family-title">Visually similar catalogue fonts</span>
          <span class="evidence-family-preview">compare rendered glyph shapes</span>
        </span>
        <span class="evidence-count">live</span><span class="row-arrow">›</span>
      </button>`) : nothing}
    ${foot(ctx, c)}`;
  return { n: status, body, label: familyName };
}

export async function vCapturedFontLookup(c, ctx) {
  const identity = capturedFontIdentity(c.id);
  if (!identity) return { n: null, body: html`<div class="empty">captured font not found</div>` };
  const observed = (ctx.idx.fontsByCap.get(identity.captureId) || [])
    .find((row) => row[6] === identity.observationIndex);
  if (!observed) return { n: null, body: html`<div class="empty">captured font not found</div>` };

  const payload = await store.loadSimilarity(
    `captured-font-similarity:${identity.captureId}:${identity.observationIndex}`,
    "/v1/similar-captured-fonts",
    { ...identity, limit: 8 },
  );
  const familyName = payload.target?.familyName || observed[0];
  const rows = payload.results || [];
  const body = html`
    <p class="prose">Catalogue families with the closest rendered glyph shapes to <span class="font-highlight">${esc(familyName)}</span>. Lower distance is closer.</p>
    <font-preview .result=${{ familyName, previewUrl: payload.target?.previewUrl }}></font-preview>
    ${section("visual candidates", html`
      ${ctx.rows(rows, (result) => {
        const family = ctx.idx.fById.get(Number(result.familyId));
        const name = family?.[1] || result.familyName;
        const meta = `visual ${Number(result.visualDistance).toFixed(4)} · metric ${Number(result.metricDistance).toFixed(4)}${result.commonGlyphs ? ` · ${result.commonGlyphs} glyphs` : ""}`;
        return html`
          <button class="row" data-hop-type="family" data-hop-id=${result.familyId} data-hop-label=${String(name).slice(0, 34)}>
            <span class="t"><span class="font-highlight">${esc(name)}</span></span>
            <span class="s">#${result.rank}</span>
          </button>
          <font-preview releaseFallback .result=${result}></font-preview>
          <div class="font-src">${esc(meta)}</div>`;
      })}
      ${rows.length ? nothing : html`<div class="empty">no compatible catalogue descriptors were found</div>`}`, rows.length)}
    ${foot(ctx, c)}`;
  return { n: `${rows.length} results`, body, label: `Similar to ${familyName}` };
}
