// Extracts icon geometry straight from the prototype HTML — no hand-copied
// path data. Reads design/prototypes/arena-hub-player-app.html, parses the
// `const I = {...}` object (26 named icons) plus the other inline SVGs the
// screens use outside that object (brand mark, rating star, large
// confirmation tick, hero/card glow art), and writes a generated TS data
// module. The Icon component (components/ui/icon.tsx) only reads that
// generated data — it never contains path strings itself.
import fs from "node:fs";
import path from "node:path";

const HTML_PATH = path.resolve("../../design/prototypes/arena-hub-player-app.html");
const OUT_PATH = path.resolve("constants/icons.generated.ts");
const src = fs.readFileSync(HTML_PATH, "utf8");

function attr(tag, name) {
  // A bare negative-lookbehind-free boundary: require the char right before
  // the attribute name to be whitespace or the start of the tag, not a
  // letter/hyphen — otherwise `width=` also matches inside `stroke-width=`.
  const m = tag.match(new RegExp(`(?:^|[\\s<])${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

// Parses one `<svg ...>...</svg>` string into { viewBox, fill, stroke,
// strokeWidth, strokeLinecap, strokeLinejoin, shapes: [...] }.
function parseSvg(svgStr) {
  const openTagMatch = svgStr.match(/<svg\b([^>]*)>/);
  const openTag = openTagMatch[0];
  const inner = svgStr.slice(openTagMatch.index + openTag.length, svgStr.lastIndexOf("</svg>"));

  const shapes = [];
  const shapeRe = /<(path|circle|rect|ellipse)\b([^>]*?)\/?>/g;
  let m;
  while ((m = shapeRe.exec(inner))) {
    const [, tagName, attrsStr] = m;
    const tag = `<${tagName} ${attrsStr}>`;
    if (tagName === "path") {
      shapes.push({ type: "path", d: attr(tag, "d") });
    } else if (tagName === "circle") {
      shapes.push({ type: "circle", cx: attr(tag, "cx"), cy: attr(tag, "cy"), r: attr(tag, "r") });
    } else if (tagName === "rect") {
      shapes.push({
        type: "rect",
        x: attr(tag, "x"),
        y: attr(tag, "y"),
        width: attr(tag, "width"),
        height: attr(tag, "height"),
        rx: attr(tag, "rx"),
      });
    } else if (tagName === "ellipse") {
      shapes.push({ type: "ellipse", cx: attr(tag, "cx"), cy: attr(tag, "cy"), rx: attr(tag, "rx"), ry: attr(tag, "ry") });
    }
    // Per-shape fill/stroke overrides (e.g. a shape with its own `fill`
    // attribute distinct from the svg-level one) are captured too, since a
    // couple of the ported non-I assets (brand mark, glow art) need them.
    const shapeFill = attr(tag, "fill");
    const shapeStroke = attr(tag, "stroke");
    const shapeStrokeOpacity = attr(tag, "stroke-opacity");
    const shapeFillOpacity = attr(tag, "fill-opacity");
    const shapeStrokeWidth = attr(tag, "stroke-width");
    const shapeStrokeLinecap = attr(tag, "stroke-linecap");
    const shapeStrokeLinejoin = attr(tag, "stroke-linejoin");
    const last = shapes[shapes.length - 1];
    if (shapeFill !== undefined) last.fill = shapeFill;
    if (shapeStroke !== undefined) last.stroke = shapeStroke;
    if (shapeStrokeOpacity !== undefined) last.strokeOpacity = shapeStrokeOpacity;
    if (shapeFillOpacity !== undefined) last.fillOpacity = shapeFillOpacity;
    if (shapeStrokeWidth !== undefined) last.strokeWidth = shapeStrokeWidth;
    if (shapeStrokeLinecap !== undefined) last.strokeLinecap = shapeStrokeLinecap;
    if (shapeStrokeLinejoin !== undefined) last.strokeLinejoin = shapeStrokeLinejoin;
  }

  return {
    viewBox: attr(openTag, "viewBox"),
    width: attr(openTag, "width"),
    height: attr(openTag, "height"),
    fill: attr(openTag, "fill"),
    stroke: attr(openTag, "stroke"),
    strokeWidth: attr(openTag, "stroke-width"),
    strokeLinecap: attr(openTag, "stroke-linecap"),
    strokeLinejoin: attr(openTag, "stroke-linejoin"),
    shapes,
  };
}

// --- 1. The `const I = {...}` object: 26 named icons -----------------------
const iStart = src.indexOf("const I = {");
const iEnd = src.indexOf("\n};", iStart);
const iBlock = src.slice(iStart, iEnd);
const entryRe = /(\w+):'(<svg[\s\S]*?<\/svg>)'/g;
const icons = {};
let em;
while ((em = entryRe.exec(iBlock))) {
  icons[em[1]] = parseSvg(em[2]);
}

// --- 2. Brand mark (identical at lines ~635 and ~685) -----------------------
const brandMarkMatch = src.match(
  /<svg width="32" height="32" viewBox="0 0 32 32" fill="none">(<rect[^<]*\/>)(<path[^<]*\/>)(<path[^<]*\/>)(<circle[^<]*\/>)<\/svg>/,
);
const brandMark = brandMarkMatch
  ? parseSvg(`<svg viewBox="0 0 32 32">${brandMarkMatch[1]}${brandMarkMatch[2]}${brandMarkMatch[3]}${brandMarkMatch[4]}</svg>`)
  : null;

// --- 3. Rating star (filled/outline toggle, 11px, stroke 1.8) ---------------
const starRowMatch = src.match(
  /<svg viewBox="0 0 24 24" width="11" height="11" fill="'[^<]*<path d="([^"]+)"\/><\/svg>/,
);
// The template-literal fill expression isn't valid standalone JS/HTML, so
// pull the shared path + stroke-width directly instead of the whole tag.
const starPathMatch = src.match(/stars = \(n,sz\)[\s\S]*?<path d="([^"]+)"\/>/);
const starStrokeWidthMatch = src.match(/stars = \(n,sz\)[\s\S]*?stroke-width="([^"]+)"/);
const ratingStar = starPathMatch
  ? { viewBox: "0 0 24 24", d: starPathMatch[1], strokeWidth: starStrokeWidthMatch?.[1] ?? "1.8" }
  : null;

// --- 4. Large confirmation tick (34px, stroke 2.6) --------------------------
const bigTickMatch = src.match(
  /<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="([^"]+)" stroke-linecap="([^"]+)"><path d="([^"]+)"\/><\/svg>/,
);
const bigTick = bigTickMatch
  ? { viewBox: "0 0 24 24", d: bigTickMatch[3], strokeWidth: bigTickMatch[1], strokeLinecap: bigTickMatch[2] }
  : null;

// --- 5. Glow art: hero (Home, Profile) and card overlay ---------------------
const heroHomeMatch = src.match(
  /<svg class="hero-art" viewBox="0 0 300 200"[^>]*><rect width="300" height="200" fill="([^"]+)"\/><circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)" fill="([^"]+)" fill-opacity="([^"]+)"\/><path d="([^"]+)" stroke="([^"]+)" stroke-opacity="([^"]+)"\/><\/svg>/,
);
const glowHome = heroHomeMatch
  ? {
      viewBox: "0 0 300 200",
      rectFill: heroHomeMatch[1],
      circle: { cx: heroHomeMatch[2], cy: heroHomeMatch[3], r: heroHomeMatch[4], fill: heroHomeMatch[5], fillOpacity: heroHomeMatch[6] },
      lines: { d: heroHomeMatch[7], stroke: heroHomeMatch[8], strokeOpacity: heroHomeMatch[9] },
    }
  : null;

const heroProfileMatch = src.match(
  /<svg class="hero-art" viewBox="0 0 300 160"[^>]*><rect width="300" height="160" fill="([^"]+)"\/><circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)" fill="([^"]+)" fill-opacity="([^"]+)"\/><\/svg>/,
);
const glowProfile = heroProfileMatch
  ? {
      viewBox: "0 0 300 160",
      rectFill: heroProfileMatch[1],
      circle: { cx: heroProfileMatch[2], cy: heroProfileMatch[3], r: heroProfileMatch[4], fill: heroProfileMatch[5], fillOpacity: heroProfileMatch[6] },
    }
  : null;

const cardGlowMatch = src.match(
  /<svg style="position:absolute;inset:0;opacity:(\.\d+)" viewBox="0 0 300 120"[^>]*><circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)" fill="([^"]+)" fill-opacity="([^"]+)"\/><\/svg>/,
);
const glowCard = cardGlowMatch
  ? {
      viewBox: "0 0 300 120",
      wrapperOpacity: cardGlowMatch[1],
      circle: { cx: cardGlowMatch[2], cy: cardGlowMatch[3], r: cardGlowMatch[4], fill: cardGlowMatch[5], fillOpacity: cardGlowMatch[6] },
    }
  : null;

// --- sanity ------------------------------------------------------------
const iconNames = Object.keys(icons);
console.log("Extracted", iconNames.length, "named icons:", iconNames.join(", "));
console.log("brandMark:", !!brandMark, "ratingStar:", !!ratingStar, "bigTick:", !!bigTick);
console.log("glowHome:", !!glowHome, "glowProfile:", !!glowProfile, "glowCard:", !!glowCard);
for (const [name, def] of Object.entries(icons)) {
  if (!def.viewBox || def.shapes.length === 0) console.log("WARNING: incomplete parse for", name, def);
}
if (iconNames.length !== 26) console.log("WARNING: expected 26 icons, got", iconNames.length);
if (!brandMark || !ratingStar || !bigTick || !glowHome || !glowProfile || !glowCard) {
  console.log("WARNING: one or more non-I assets failed to extract — check the regexes above");
}

// --- write the generated module -----------------------------------------
const header = `// GENERATED by scripts/extract-icons.mjs from design/prototypes/arena-hub-player-app.html.
// Do not hand-edit — re-run the script if the prototype's icons change.

export interface IconShape {
  type: 'path' | 'circle' | 'rect' | 'ellipse';
  d?: string;
  cx?: string;
  cy?: string;
  r?: string;
  x?: string;
  y?: string;
  width?: string;
  height?: string;
  rx?: string;
  ry?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  strokeOpacity?: string;
  fillOpacity?: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
}

export interface IconDef {
  viewBox: string;
  width?: string;
  height?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  shapes: IconShape[];
}
`;
const body = `export type IconName = ${iconNames.map((n) => `'${n}'`).join(' | ')};

export const Icons: Record<IconName, IconDef> = ${JSON.stringify(icons, null, 2)};

export const BrandMarkDef: IconDef = ${JSON.stringify(brandMark, null, 2)};
export const RatingStarDef = ${JSON.stringify(ratingStar, null, 2)} as const;
export const BigTickDef = ${JSON.stringify(bigTick, null, 2)} as const;
export const GlowHomeDef = ${JSON.stringify(glowHome, null, 2)} as const;
export const GlowProfileDef = ${JSON.stringify(glowProfile, null, 2)} as const;
export const GlowCardDef = ${JSON.stringify(glowCard, null, 2)} as const;
`;
fs.writeFileSync(OUT_PATH, header + body);
console.log("Wrote", OUT_PATH);

// Plain-JSON sibling, for verification tooling only (so a plain Node script
// can consume the exact same extracted data without parsing TypeScript).
// Not part of the app; not committed.
const JSON_OUT = path.resolve("scripts/.icons-data.json");
fs.writeFileSync(
  JSON_OUT,
  JSON.stringify({ icons, brandMark, ratingStar, bigTick, glowHome, glowProfile, glowCard }, null, 2),
);
console.log("Wrote", JSON_OUT, "(verification-only, not committed)");
