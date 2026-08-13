export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

export function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const dateMs = (value) => (Number(value) < 1e12 ? Number(value) * 1000 : Number(value));
export function fmtDate(ms) {
  return new Date(dateMs(ms)).toISOString().slice(0, 10);
}
export function fmtDateTime(ms) {
  return new Date(dateMs(ms)).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
export const rgba = (r, g, b, a) =>
  a == null || a >= 1000000 ? hex(r, g, b) : "rgba(" + [r, g, b, Math.max(0, Math.min(1, a / 1000000))].join(",") + ")";
export const px = (m) => (m == null ? "" : (m / 1000 >= 10 ? Math.round(m / 1000) : (m / 1000).toFixed(1)) + "px");
export const intHex = (value) => "#" + Number(value).toString(16).padStart(6, "0").slice(-6);

export function capFallback(cp) {
  const seed = [...String(cp ? cp[1] || cp[0] : "")].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const hue = seed % 360;
  return "linear-gradient(135deg,hsl(" + hue + " 13% 25%),hsl(" + ((hue + 32) % 360) + " 12% 62%))";
}

export function shade(hexStr, f) {
  const n = parseInt(hexStr.slice(1), 16);
  const m = (x) => Math.max(0, Math.min(255, Math.round(x * f)));
  return "#" + [m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)]
    .map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function downloadText(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pushMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export const specTxt = () => "Hamburgefontsiv 0123456789";

export function familyPreviewUrl(familyId, width = 680) {
  const url = new URL(`https://api.withfudge.com/v1/font-previews/${familyId}`);
  url.searchParams.set("sample", specTxt());
  url.searchParams.set("width", String(width));
  return url.href;
}
