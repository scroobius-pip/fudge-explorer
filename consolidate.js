const fs = require('fs');
const dir = '/Users/simdi/.local/share/opencode/tool-output/';

const colorFiles = [
  'tool_ff03d7a8d001EMFMKpS13wj7Xi',
  'tool_ff03d9388001nTxsUTxiVjoVD8',
];
const bgFiles = [
  'tool_ff03e91b30015UmQAS76jYjilv',
  'tool_ff03eaccc0013bIb2QhKbZmBRV',
  'tool_ff03ec922001D5NqGdDP2iFQMT',
  'tool_ff03ee1aa001yPGuzCgSBn9L19',
  'tool_ff03efb89001IGRCCWm9UJPeow',
  'tool_ff03f12c9001lqYIMREs3AIXzl',
  'tool_ff03f2e750018U8qQOUiQVDMi2',
  'tool_ff03f470f001QGYA1g1Po4QWzH',
  'tool_ff03f618c001lV8sdyorAcF5ho',
  'tool_ff03f7986001of9APoAJL1H8ER',
];
const fontFiles = ['tool_ff03fc658001yMVRpYlZ3jP0tI'];
const typeFiles = ['tool_ff03fe6eb0011ZXsUVx2RVcOnv'];
const colorP3 = '/Users/simdi/fudge-ontology-viz/color_p3.json';

const HEADERS = {
  color: 'capture_id|role|r|g|b|alpha_ppm|occurrence_count',
  bg: 'capture_id|r|g|b|alpha_ppm|occurrence_count|evidence_kind|observation_index',
  font: 'capture_id|observation_index|declared_family|computed_css_stack|weight_min|weight_max|character_share_ppm|occurrence_count',
  type: 'capture_id|role|declared_family|weight|size_milli_px|line_height_milli_px|character_share_ppm',
};

function load(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function verify(data, expectedHeaders, label, path) {
  const join = data.result.headers.join('|');
  if (join !== expectedHeaders) {
    throw new Error(`${label} header mismatch in ${path}: got "${join}"`);
  }
}

const colorRows = [];
for (const f of colorFiles) {
  const d = load(dir + f);
  verify(d, HEADERS.color, 'color', f);
  colorRows.push(...d.result.rows);
}
const d3 = load(colorP3);
verify(d3, HEADERS.color, 'color', colorP3);
colorRows.push(...d3.result.rows);

const bgRows = [];
for (const f of bgFiles) {
  const d = load(dir + f);
  verify(d, HEADERS.bg, 'background', f);
  bgRows.push(...d.result.rows);
}

const fontRows = [];
for (const f of fontFiles) {
  const d = load(dir + f);
  verify(d, HEADERS.font, 'font', f);
  fontRows.push(...d.result.rows);
}

const typeRows = [];
for (const f of typeFiles) {
  const d = load(dir + f);
  verify(d, HEADERS.type, 'type', f);
  typeRows.push(...d.result.rows);
}

function dedupe(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = JSON.stringify(r);
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out;
}

const result = {
  color_roles: dedupe(colorRows),
  backgrounds: dedupe(bgRows).map((r) => r.slice(0, 7)),
  font_obs: dedupe(fontRows),
  type_roles: dedupe(typeRows),
};

fs.writeFileSync('/Users/simdi/fudge-ontology-viz/export_obs.json', JSON.stringify(result));

console.log('color_roles:', result.color_roles.length, '(raw', colorRows.length + ')');
console.log('backgrounds:', result.backgrounds.length, '(raw', bgRows.length + ')');
console.log('font_obs:', result.font_obs.length, '(raw', fontRows.length + ')');
console.log('type_roles:', result.type_roles.length, '(raw', typeRows.length + ')');
