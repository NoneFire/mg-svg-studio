#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn2, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn2 && (res = (0, fn2[__getOwnPropNames(fn2)[0]])(fn2 = 0)), res;
  } catch (e2) {
    throw err = [e2], e2;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/css.ts
function parseTime(value) {
  if (!value) return null;
  const v2 = value.trim();
  const m2 = v2.match(TIMING_RE);
  if (m2) {
    const n3 = parseFloat(m2[1]);
    return m2[2] === "ms" ? n3 / 1e3 : n3;
  }
  return null;
}
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}
function parseStylesheet(cssText) {
  const css = stripComments(cssText || "");
  const rules = [];
  const keyframes = {};
  let order = 0;
  let i2 = 0;
  while (i2 < css.length) {
    const brace = css.indexOf("{", i2);
    if (brace < 0) break;
    const header = css.slice(i2, brace).trim();
    let depth = 1;
    let j3 = brace + 1;
    while (j3 < css.length && depth > 0) {
      if (css[j3] === "{") depth++;
      else if (css[j3] === "}") depth--;
      j3++;
    }
    const body = css.slice(brace + 1, j3 - 1);
    i2 = j3;
    if (!header) continue;
    if (header.startsWith("@keyframes") || header.startsWith("@-webkit-keyframes")) {
      const name = header.replace(/@(-webkit-)?keyframes/, "").trim();
      keyframes[name] = { name, frames: parseKeyframeBody(body) };
      continue;
    }
    if (header.startsWith("@")) {
      if (header.startsWith("@media") || header.startsWith("@supports")) {
        const inner = parseStylesheet(body);
        inner.rules.forEach((r3) => {
          r3.order = order++;
          rules.push(r3);
        });
      }
      continue;
    }
    const selectors = splitSelectors(header).map((s2) => parseSelector(s2)).filter(Boolean);
    if (!selectors.length) continue;
    rules.push({ selectors, decls: parseDecls(body), order: order++ });
  }
  return { rules, keyframes };
}
function parseDecls(body) {
  const out = {};
  body.split(";").forEach((chunk) => {
    const idx = chunk.indexOf(":");
    if (idx < 0) return;
    const key = chunk.slice(0, idx).trim().toLowerCase();
    const value = chunk.slice(idx + 1).replace(/!important/i, "").trim();
    if (key) out[key] = value;
  });
  return out;
}
function splitSelectors(header) {
  return header.split(",").map((s2) => s2.trim()).filter(Boolean);
}
function parseKeyframeBody(body) {
  const frames = [];
  let i2 = 0;
  while (i2 < body.length) {
    const brace = body.indexOf("{", i2);
    if (brace < 0) break;
    const header = body.slice(i2, brace).trim();
    let depth = 1;
    let j3 = brace + 1;
    while (j3 < body.length && depth > 0) {
      if (body[j3] === "{") depth++;
      else if (body[j3] === "}") depth--;
      j3++;
    }
    const content = body.slice(brace + 1, j3 - 1);
    i2 = j3;
    if (!header) continue;
    header.split(",").forEach((part) => {
      const p2 = part.trim();
      if (!p2) return;
      let offset = 0;
      if (p2 === "from") offset = 0;
      else if (p2 === "to") offset = 1;
      else offset = parseFloat(p2) / 100;
      if (Number.isNaN(offset)) return;
      frames.push({ offset, decls: parseDecls(content) });
    });
  }
  frames.sort((a, b2) => a.offset - b2.offset);
  return frames;
}
function parseCompound(text) {
  const compound = { classes: [], attrs: [] };
  const re4 = /(\*)|([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([^\]]+)\]|:[:a-zA-Z-]+(\([^)]*\))?/g;
  let m2;
  while (m2 = re4.exec(text)) {
    if (m2[1]) compound.universal = true;
    else if (m2[2]) compound.tag = m2[2].toLowerCase();
    else if (m2[3]) compound.id = m2[3];
    else if (m2[4]) compound.classes.push(m2[4]);
    else if (m2[5]) {
      const [name, ...rest] = m2[5].split("=");
      compound.attrs.push({ name: name.trim(), value: rest.join("=").replace(/["']/g, "").trim() || void 0 });
    } else if (m2[0]) {
      const not = m2[0].match(/^:not\(([\w-]+)\)$/);
      if (not) compound.notTag = not[1];
    }
  }
  return compound;
}
function parseSelector(text) {
  const src = text.trim();
  if (!src) return null;
  const parts = [];
  let buf = "";
  let combinator = "";
  const flush = (comb) => {
    const t2 = buf.trim();
    if (t2) parts.push({ combinator: parts.length ? comb || " " : "", compound: parseCompound(t2) });
    buf = "";
  };
  for (const ch2 of src) {
    if (ch2 === ">") {
      flush(">");
      combinator = ">";
    } else if (ch2 === "~" || ch2 === "+") {
      flush(" ");
      combinator = " ";
    } else if (/\s/.test(ch2)) {
      flush(combinator || " ");
      combinator = " ";
    } else {
      buf += ch2;
    }
  }
  flush(combinator || " ");
  if (!parts.length) return null;
  let spec = 0;
  parts.forEach((p2) => {
    const c = p2.compound;
    spec += (c.id ? 100 : 0) + c.classes.length * 10 + (c.tag ? 1 : 0);
  });
  return { source: src, specificity: spec, parts };
}
function matchCompound(el, c) {
  if (c.universal) return true;
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false;
  if (c.notTag && el.tagName.toLowerCase() === c.notTag) return false;
  if (c.id && el.getAttribute("id") !== c.id) return false;
  if (c.classes.length) {
    const cls = (el.getAttribute("class") || "").split(/\s+/);
    if (!c.classes.every((k2) => cls.includes(k2))) return false;
  }
  if (c.attrs.length) {
    for (const a of c.attrs) {
      const v2 = el.getAttribute(a.name);
      if (v2 === null) return false;
      if (a.value !== void 0 && v2 !== a.value) return false;
    }
  }
  return true;
}
function matchesSelector(el, sel) {
  let idx = sel.parts.length - 1;
  let node = el;
  if (!node || !matchCompound(node, sel.parts[idx].compound)) return false;
  idx--;
  while (idx >= 0) {
    const part = sel.parts[idx];
    const combinator = sel.parts[idx + 1].combinator;
    if (combinator === ">") {
      node = node.parentElement;
      if (!node || !matchCompound(node, part.compound)) return false;
    } else {
      let found = false;
      let cur = node.parentElement;
      while (cur) {
        if (matchCompound(cur, part.compound)) {
          found = true;
          node = cur;
          break;
        }
        cur = cur.parentElement;
      }
      if (!found) return false;
    }
    idx--;
  }
  return true;
}
function matchRules(el, sheet) {
  const matched = [];
  for (const rule of sheet.rules) {
    for (const sel of rule.selectors) {
      if (matchesSelector(el, sel)) {
        matched.push({ spec: sel.specificity, order: rule.order, decls: rule.decls });
        break;
      }
    }
  }
  matched.sort((a, b2) => a.spec - b2.spec || a.order - b2.order);
  const out = {};
  matched.forEach((m2) => Object.assign(out, m2.decls));
  return out;
}
function lookupVar(el, name) {
  let cur = el;
  while (cur) {
    const inline = cur.getAttribute("style");
    if (inline) {
      const m2 = inline.match(new RegExp(`${name}\\s*:\\s*([^;]+)`));
      if (m2) return m2[1].trim();
    }
    const attr = cur.getAttribute(name);
    if (attr) return attr.trim();
    cur = cur.parentElement;
  }
  return void 0;
}
function substituteVars(value, el, depth = 0) {
  if (!value || depth > 6 || !value.includes("var(")) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_all, name, fallback) => {
    const found = lookupVar(el, name);
    return substituteVars(found ?? fallback ?? "", el, depth + 1) || fallback || "";
  });
}
function evalTimeExpr(raw, el) {
  if (!raw) return null;
  let v2 = substituteVars(raw, el).trim();
  if (!v2) return null;
  const direct = parseTime(v2);
  if (direct !== null) return direct;
  if (/^-?[\d.]+(ms|s)$/.test(v2)) return parseTime(v2.replace(/^-/, "")) * (v2.startsWith("-") ? -1 : 1);
  const calc = v2.match(/calc\((.*)\)/);
  if (calc) {
    const expr = calc[1];
    const tokens = expr.match(/[-+]?\s*[\d.]+(?:ms|s)/g);
    if (tokens) {
      let total = 0;
      const re4 = /([-+]?)\s*([\d.]+)(ms|s)/g;
      let m2;
      while (m2 = re4.exec(expr)) {
        const val = parseFloat(m2[2]) * (m2[3] === "ms" ? 1e-3 : 1);
        total += m2[1] === "-" ? -val : val;
      }
      return total;
    }
    const only = expr.match(/^([\d.]+)(ms|s)?$/);
    if (only) return parseFloat(only[1]) * (only[2] === "ms" ? 1e-3 : 1);
    return null;
  }
  return null;
}
function parseColor(input, fallback = "#000000") {
  if (!input) return parseColor(fallback);
  let v2 = input.trim().toLowerCase();
  if (v2 === "currentcolor" || v2 === "inherit" || v2 === "none") return parseColor(fallback);
  if (NAMED[v2]) v2 = NAMED[v2];
  if (v2.startsWith("#")) {
    let hex2 = v2.slice(1);
    if (hex2.length === 3) hex2 = hex2.split("").map((c) => c + c).join("");
    if (hex2.length === 4) hex2 = hex2.split("").map((c) => c + c).join("");
    if (hex2.length === 6) {
      return {
        r: parseInt(hex2.slice(0, 2), 16),
        g: parseInt(hex2.slice(2, 4), 16),
        b: parseInt(hex2.slice(4, 6), 16),
        a: 1
      };
    }
    if (hex2.length === 8) {
      return {
        r: parseInt(hex2.slice(0, 2), 16),
        g: parseInt(hex2.slice(2, 4), 16),
        b: parseInt(hex2.slice(4, 6), 16),
        a: parseInt(hex2.slice(6, 8), 16) / 255
      };
    }
  }
  const rgb = v2.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean);
    const num3 = (s2) => s2.endsWith("%") ? parseFloat(s2) / 100 * 255 : parseFloat(s2);
    return {
      r: num3(parts[0] || "0"),
      g: num3(parts[1] || "0"),
      b: num3(parts[2] || "0"),
      a: parts[3] !== void 0 ? parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]) : 1
    };
  }
  const hsl = v2.match(/hsla?\(([^)]+)\)/);
  if (hsl) {
    const parts = hsl[1].split(/[,\s/]+/).filter(Boolean);
    return hslToRgba(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100, parts[3] ? parseFloat(parts[3]) : 1);
  }
  return parseColor(fallback);
}
function hslToRgba(h, s2, l2, a = 1) {
  h = (h % 360 + 360) % 360;
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x2 = c * (1 - Math.abs(h / 60 % 2 - 1));
  const m2 = l2 - c / 2;
  let r3 = 0;
  let g2 = 0;
  let b2 = 0;
  if (h < 60) [r3, g2, b2] = [c, x2, 0];
  else if (h < 120) [r3, g2, b2] = [x2, c, 0];
  else if (h < 180) [r3, g2, b2] = [0, c, x2];
  else if (h < 240) [r3, g2, b2] = [0, x2, c];
  else if (h < 300) [r3, g2, b2] = [x2, 0, c];
  else [r3, g2, b2] = [c, 0, x2];
  return { r: (r3 + m2) * 255, g: (g2 + m2) * 255, b: (b2 + m2) * 255, a };
}
function toHex(c) {
  const h = (n3) => Math.max(0, Math.min(255, Math.round(n3))).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
function rgbaString(c) {
  return c.a >= 1 ? toHex(c) : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${+c.a.toFixed(3)})`;
}
function mixColor(a, b2, t2) {
  return {
    r: a.r + (b2.r - a.r) * t2,
    g: a.g + (b2.g - a.g) * t2,
    b: a.b + (b2.b - a.b) * t2,
    a: a.a + (b2.a - a.a) * t2
  };
}
var TIMING_RE, NAMED;
var init_css = __esm({
  "src/lib/css.ts"() {
    TIMING_RE = /^([\d.]+)(ms|s)$/;
    NAMED = {
      black: "#000000",
      white: "#ffffff",
      red: "#ff0000",
      green: "#008000",
      blue: "#0000ff",
      yellow: "#ffff00",
      gray: "#808080",
      grey: "#808080",
      orange: "#ffa500",
      purple: "#800080",
      pink: "#ffc0cb",
      cyan: "#00ffff",
      magenta: "#ff00ff",
      transparent: "rgba(0,0,0,0)",
      gold: "#ffd700",
      silver: "#c0c0c0"
    };
  }
});

// src/lib/fonts.ts
function parseFontFaces(css) {
  const out = [];
  const re4 = /@font-face\s*\{([^}]*)\}/gi;
  let match;
  while (match = re4.exec(css)) {
    const decls = {};
    for (const chunk of match[1].split(";")) {
      const i2 = chunk.indexOf(":");
      if (i2 < 0) continue;
      const key = chunk.slice(0, i2).trim().toLowerCase();
      if (key) decls[key] = chunk.slice(i2 + 1).trim();
    }
    const family = (decls["font-family"] || "").replace(/^["']|["']$/g, "").trim();
    const src = decls["src"];
    if (!family || !src) continue;
    out.push({
      family,
      src,
      weight: decls["font-weight"] || "normal",
      style: decls["font-style"] || "normal"
    });
  }
  return out;
}
function extractSvgCss(svg) {
  let css = "";
  const re4 = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while (match = re4.exec(svg)) css += "\n" + match[1].replace(/<!\[CDATA\[|\]\]>/g, "");
  return css;
}
function usableSrc(src) {
  const parts = src.match(/local\([^)]*\)|url\([^)]*\)/gi) || [];
  return parts.filter((part) => /^local\(/i.test(part) || /^url\(\s*["']?data:/i.test(part)).join(", ");
}
function registerFace(spec) {
  const key = `${spec.family}|${spec.weight}|${spec.style}|${spec.src}`;
  const cached = settled.get(key);
  if (cached) return cached;
  const src = usableSrc(spec.src);
  if (!src) return Promise.resolve();
  let face;
  try {
    face = new FontFace(spec.family, src, { weight: spec.weight, style: spec.style });
  } catch {
    return Promise.resolve();
  }
  document.fonts.add(face);
  const task = face.load().then(() => void 0).catch(() => {
    document.fonts.delete(face);
    const note = `\u5B57\u4F53 ${spec.family}\uFF08${spec.weight}\uFF09\u6CA1\u88C5\u4E0A\uFF0C\u5DF2\u56DE\u9000\u5230\u4E0B\u4E00\u4E2A\u65CF\u540D`;
    if (!warned.has(note)) {
      warned.add(note);
      console.warn(`[mgsvg] ${note}`);
    }
  }).finally(() => {
    pending.delete(key);
    settled.set(key, task);
  });
  pending.set(key, task);
  return task;
}
function queueSvgFonts(svg) {
  if (!hasDocumentFonts()) return Promise.resolve();
  return Promise.all(parseFontFaces(extractSvgCss(svg)).map(registerFace)).then(() => void 0);
}
var settled, pending, warned, hasDocumentFonts;
var init_fonts = __esm({
  "src/lib/fonts.ts"() {
    settled = /* @__PURE__ */ new Map();
    pending = /* @__PURE__ */ new Map();
    warned = /* @__PURE__ */ new Set();
    hasDocumentFonts = () => typeof document !== "undefined" && typeof FontFace !== "undefined" && !!document.fonts;
  }
});

// src/lib/svg-doc.ts
function num(v2, fallback = 0) {
  if (v2 == null) return fallback;
  const n3 = parseFloat(v2);
  return Number.isFinite(n3) ? n3 : fallback;
}
function localTag(el) {
  return (el.localName || el.tagName || "").toLowerCase();
}
function collectSheet(doc) {
  let css = "";
  doc.querySelectorAll("style").forEach((s2) => {
    css += "\n" + (s2.textContent || "");
  });
  return parseStylesheet(css);
}
function setSvgDomParser(factory) {
  parserFactory = factory;
}
function parseSvgDocument(svgText) {
  const warnings = [];
  const doc = parserFactory().parseFromString(svgText, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("SVG \u89E3\u6790\u5931\u8D25\uFF1A" + (parseError.textContent || "").slice(0, 120));
  const svg = doc.documentElement;
  if (localTag(svg) !== "svg") throw new Error("\u4E0D\u662F\u6709\u6548 SVG \u6587\u4EF6");
  const sheet = collectSheet(doc);
  const viewBoxAttr = svg.getAttribute("viewBox");
  let viewBox;
  if (viewBoxAttr) {
    const p2 = viewBoxAttr.split(/[\s,]+/).map(Number);
    viewBox = [p2[0] || 0, p2[1] || 0, p2[2] || 0, p2[3] || 0];
  } else {
    viewBox = [0, 0, num(svg.getAttribute("width"), 1920), num(svg.getAttribute("height"), 1080)];
  }
  const rawW = svg.getAttribute("width");
  const rawH = svg.getAttribute("height");
  const width = rawW && !rawW.includes("%") ? num(rawW, viewBox[2]) : viewBox[2] || 1920;
  const height = rawH && !rawH.includes("%") ? num(rawH, viewBox[3]) : viewBox[3] || 1080;
  const gradients = {};
  const filterDefs = {};
  const patternIds = /* @__PURE__ */ new Set();
  doc.querySelectorAll("linearGradient, radialGradient").forEach((g2) => {
    const id2 = g2.getAttribute("id");
    if (!id2) return;
    const isLinear = localTag(g2) === "lineargradient";
    const stops = [];
    g2.querySelectorAll("stop").forEach((s2) => {
      stops.push({
        offset: num(s2.getAttribute("offset"), 0),
        color: s2.getAttribute("stop-color") || "#000000",
        opacity: num(s2.getAttribute("stop-opacity"), 1)
      });
    });
    gradients[id2] = {
      id: id2,
      type: isLinear ? "linear" : "radial",
      units: g2.getAttribute("gradientUnits") || "objectBoundingBox",
      x1: num(g2.getAttribute("x1"), 0),
      y1: num(g2.getAttribute("y1"), 0),
      x2: num(g2.getAttribute("x2"), isLinear ? 1 : 0),
      y2: num(g2.getAttribute("y2"), isLinear ? 0 : 1),
      cx: num(g2.getAttribute("cx"), 0.5),
      cy: num(g2.getAttribute("cy"), 0.5),
      r: num(g2.getAttribute("r"), 0.5),
      fx: num(g2.getAttribute("fx"), num(g2.getAttribute("cx"), 0.5)),
      fy: num(g2.getAttribute("fy"), num(g2.getAttribute("cy"), 0.5)),
      transform: g2.getAttribute("gradientTransform") || void 0,
      spread: g2.getAttribute("spreadMethod") || "pad",
      stops
    };
  });
  doc.querySelectorAll("pattern").forEach((p2) => {
    const id2 = p2.getAttribute("id");
    if (id2) patternIds.add(id2);
  });
  doc.querySelectorAll("filter").forEach((f2) => {
    const id2 = f2.getAttribute("id");
    if (!id2) return;
    const blurEl = f2.querySelector("feGaussianBlur");
    const unsupported = [];
    f2.querySelectorAll("*").forEach((child) => {
      const t2 = localTag(child);
      if (t2 === "fegaussianblur") return;
      if (t2 === "filter") return;
      unsupported.push(t2.replace(/^fe/, "fe"));
    });
    filterDefs[id2] = {
      id: id2,
      blur: blurEl ? num(blurEl.getAttribute("stdDeviation"), 0) : void 0,
      unsupported: Array.from(new Set(unsupported))
    };
  });
  Object.values(filterDefs).forEach((def) => {
    if (def.unsupported.length && def.blur) warnings.push(`\u6EE4\u955C #${def.id} \u53EA\u4FDD\u7559\u6A21\u7CCA ${def.blur}\uFF0C${def.unsupported.join("/")} \u5DF2\u5FFD\u7565`);
    else if (def.unsupported.length)
      warnings.push(
        `\u6EE4\u955C #${def.id} \u5DF2\u5FFD\u7565\uFF08${def.unsupported[0].replace(/^fe/, "fe")} \u7B49 ${def.unsupported.length} \u4E2A\u539F\u8BED\u4E0D\u652F\u6301\uFF09`
      );
    else if (def.blur) warnings.push(`\u6EE4\u955C #${def.id} \u5DF2\u8FD1\u4F3C\u4E3A\u6A21\u7CCA ${def.blur}`);
  });
  const elements = [];
  const drawables = [];
  let counter = 0;
  const resolveStyle = (el, parentStyle) => {
    const style = {};
    INHERITED.forEach((k2) => {
      if (parentStyle[k2] !== void 0) style[k2] = parentStyle[k2];
    });
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (PRESENTATION.has(name)) style[name] = attr.value;
    }
    Object.assign(style, matchRules(el, sheet));
    const inline = el.getAttribute("style");
    if (inline) {
      inline.split(";").forEach((chunk) => {
        const idx = chunk.indexOf(":");
        if (idx < 0) return;
        const k2 = chunk.slice(0, idx).trim().toLowerCase();
        const v2 = chunk.slice(idx + 1).trim();
        if (k2) style[k2] = v2;
      });
    }
    Object.keys(style).forEach((k2) => {
      if (style[k2] === "inherit" && parentStyle[k2] !== void 0) style[k2] = parentStyle[k2];
    });
    Object.keys(style).forEach((k2) => {
      if (style[k2] && style[k2].includes("var(")) style[k2] = substituteVars(style[k2], el);
    });
    return style;
  };
  const walk = (dom, parent, depth) => {
    const tag = localTag(dom);
    if (SKIP_TAGS.has(tag)) return null;
    if (tag === "use") {
      warnings.push(`<use> \u5F15\u7528\u672A\u5C55\u5F00\uFF08${dom.getAttribute("href") || dom.getAttribute("xlink:href") || ""}\uFF09`);
      return null;
    }
    if (tag === "foreignobject") {
      warnings.push("<foreignObject> \u4E0D\u652F\u6301");
      return null;
    }
    const index = counter++;
    const id2 = parent ? `${parent.id}.${index}` : `${index}`;
    const style = resolveStyle(dom, parent ? parent.style : {});
    const kind = tag === "g" || tag === "svg" ? "group" : tag === "text" ? "text" : tag === "image" ? "image" : SHAPE_TAGS.has(tag) ? "shape" : "other";
    if (style.display === "none") return null;
    const node = {
      id: id2,
      tag,
      kind,
      dom,
      depth,
      parentId: parent?.id,
      children: [],
      style,
      label: "",
      visible: true
    };
    node.label = describe(node);
    elements.push(node);
    if (DRAW_TAGS.has(tag)) drawables.push(node);
    if (tag === "image") warnings.push("\u4F4D\u56FE\u4EE5\u56FE\u7247\u5F62\u5F0F\u6E32\u67D3\uFF08\u4E0D\u80FD\u7F16\u8F91\u5185\u90E8\u50CF\u7D20\uFF09");
    if (style["clip-path"]) warnings.push("clip-path \u4EC5\u652F\u6301\u7B80\u5355\u5F62\u72B6\uFF0C\u5DF2\u6309\u53E0\u52A0\u5904\u7406");
    if (style["mask"]) warnings.push("mask \u6E10\u53D8\u906E\u7F69\u5DF2\u88AB\u5FFD\u7565");
    if (tag === "pattern") warnings.push("pattern \u586B\u5145\u5DF2\u8DF3\u8FC7");
    for (const child of Array.from(dom.children)) {
      const c = walk(child, node, depth + 1);
      if (c) node.children.push(c);
    }
    return node;
  };
  const root = walk(svg, void 0, 0) || {
    id: "root",
    tag: "svg",
    kind: "group",
    dom: svg,
    depth: 0,
    children: [],
    style: {},
    label: "svg",
    visible: true
  };
  if (drawables.length === 0) warnings.push("\u6CA1\u6709\u53EF\u7ED8\u5236\u7684\u56FE\u5F62\u5143\u7D20");
  const animatable = elements.filter((e2) => e2 !== root && (e2.kind === "shape" || e2.kind === "text" || e2.kind === "group"));
  const groups = extractAnimations(sheet, animatable, warnings);
  const known = /* @__PURE__ */ new Set([...Object.keys(gradients), ...Array.from(patternIds)]);
  elements.forEach((el) => {
    ;
    ["fill", "stroke"].forEach((key) => {
      const v2 = el.style[key];
      if (!v2) return;
      const m2 = v2.match(/url\(#([^)]+)\)/);
      if (m2 && !known.has(m2[1])) warnings.push(`${key} \u5F15\u7528\u7684 #${m2[1]} \u4E0D\u5B58\u5728\uFF0C\u5DF2\u8DF3\u8FC7`);
    });
  });
  if (patternIds.size) {
    drawables.forEach((el) => {
      const fill = el.style["fill"] || "";
      const m2 = fill.match(/url\(#([^)]+)\)/);
      if (m2 && patternIds.has(m2[1])) warnings.push(`pattern \u586B\u5145 #${m2[1]} \u5DF2\u8DF3\u8FC7\uFF08\u7528\u7EAF\u8272/\u6E10\u53D8\u66FF\u4EE3\uFF09`);
    });
  }
  void queueSvgFonts(svgText);
  return {
    width,
    height,
    viewBox,
    root,
    elements,
    drawables,
    gradients,
    filters: filterDefs,
    sheet,
    warnings: Array.from(new Set(warnings)),
    groups
  };
}
function describe(node) {
  const idAttr = node.dom.getAttribute("id");
  if (node.tag === "text") {
    const text = (node.dom.textContent || "").trim();
    return text ? `\u201C${text.slice(0, 12)}\u201D` : "\u6587\u672C";
  }
  if (idAttr) return `#${idAttr}`;
  const cls = node.dom.getAttribute("class");
  if (cls) return `${node.tag}.${cls.split(/\s+/)[0]}`;
  return node.tag;
}
function parseAnimationShorthand(value) {
  const parts = value.trim().split(/\s+/);
  const out = {};
  let timeSeen = 0;
  parts.forEach((p2) => {
    if (/^[\d.]+(ms|s)$/.test(p2)) {
      if (timeSeen === 0) out.duration = evalTimeExpr(p2, null) ?? 0;
      else if (timeSeen === 1) out.delay = evalTimeExpr(p2, null) ?? 0;
      timeSeen++;
      return;
    }
    if (p2 === "infinite") return void (out.iterations = "infinite");
    if (/^[\d.]+$/.test(p2)) return void (out.iterations = parseFloat(p2));
    if (["normal", "reverse", "alternate", "alternate-reverse"].includes(p2)) return void (out.direction = p2);
    if (["none", "forwards", "backwards", "both"].includes(p2)) return void (out.fillMode = p2);
    if (TIMING_FUNCS.includes(p2) || p2.startsWith("cubic-bezier") || p2.startsWith("steps") || p2.startsWith("linear(")) {
      return void (out.ease = p2);
    }
    if (!out.name) out.name = p2;
  });
  return out;
}
function normalizeEase(ease) {
  if (!ease) return "ease";
  return ease;
}
function splitList(value) {
  if (!value) return [];
  const out = [];
  let depth = 0;
  let buf = "";
  for (const ch2 of value) {
    if (ch2 === "(") depth++;
    if (ch2 === ")") depth--;
    if (ch2 === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
    } else buf += ch2;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
function parseTransformOrigin(style) {
  const box = style["transform-box"] || "view-box";
  const origin = style["transform-origin"] || "50% 50%";
  const parts = origin.trim().split(/\s+/);
  const pos = (v2, fallback) => {
    if (!v2) return fallback;
    if (v2 === "left" || v2 === "top") return 0;
    if (v2 === "center") return 0.5;
    if (v2 === "right" || v2 === "bottom") return 1;
    if (v2.endsWith("%")) return parseFloat(v2) / 100;
    return fallback;
  };
  const x2 = pos(parts[0], 0.5);
  const y2 = pos(parts[1], 0.5);
  return { x: x2, y: y2 };
}
function extractAnimations(sheet, drawables, warnings) {
  const groups = [];
  let n3 = 0;
  for (const el of drawables) {
    const style = el.style;
    const animations = splitList(style["animation"]);
    const names = splitList(style["animation-name"]);
    const durations = splitList(style["animation-duration"]);
    const delays = splitList(style["animation-delay"]);
    const easings = splitList(style["animation-timing-function"]);
    const iterations = splitList(style["animation-iteration-count"]);
    const directions = splitList(style["animation-direction"]);
    const fills = splitList(style["animation-fill-mode"]);
    const list = [];
    if (animations.length) {
      animations.forEach((a) => {
        const parsed = parseAnimationShorthand(substituteVars(a, el.dom));
        list.push({
          name: parsed.name,
          top: parsed.duration,
          delay: parsed.delay,
          ease: parsed.ease,
          iterations: parsed.iterations,
          direction: parsed.direction,
          fill: parsed.fillMode
        });
      });
    }
    if (!list.length && names.length) {
      names.forEach((name, i2) => {
        list.push({
          name,
          top: evalTimeExpr(durations[i2] ?? durations[0], el.dom) ?? 0,
          delay: evalTimeExpr(delays[i2] ?? delays[0], el.dom) ?? 0,
          ease: easings[i2] ?? easings[0]
        });
      });
    }
    list.forEach((item, idx) => {
      if (!item.name || item.name === "none") return;
      const kf = sheet.keyframes[item.name];
      if (!kf) return;
      const durations2 = durations.length ? evalTimeExpr(durations[idx] ?? durations[0], el.dom) : null;
      const delays2 = delays.length ? evalTimeExpr(delays[idx] ?? delays[0], el.dom) : null;
      const duration = item.top ?? durations2 ?? 0.6;
      const delay = item.delay ?? delays2 ?? 0;
      const ease = normalizeEase(item.ease || easings[idx] || easings[0] || "ease");
      const iterRaw = iterations[idx] ?? iterations[0];
      const iter = item.iterations === "infinite" ? "infinite" : item.iterations !== void 0 ? Math.max(1, Number(item.iterations)) : iterRaw === "infinite" ? "infinite" : Math.max(1, parseFloat(iterRaw ?? "1") || 1);
      const dir = item.direction ?? directions[idx] ?? directions[0] ?? "normal";
      const fill = item.fill ?? fills[idx] ?? fills[0] ?? "none";
      const tracks = [];
      ANIM_PROPS.forEach((prop) => {
        const frames = [];
        kf.frames.forEach((f2) => {
          const raw = f2.decls[prop];
          if (raw === void 0) return;
          frames.push({ offset: f2.offset, value: substituteVars(raw, el.dom) });
        });
        if (!frames.length) return;
        if (frames[0].offset > 0) frames.unshift({ offset: 0, value: defaultKeyValue(el, prop) });
        if (frames[frames.length - 1].offset < 1) frames.push({ offset: 1, value: frames[frames.length - 1].value });
        tracks.push({ id: `t${n3++}`, property: prop, keyframes: frames });
      });
      if (!tracks.length) return;
      groups.push({
        id: `g${n3++}`,
        name: item.name,
        targetId: el.id,
        duration: Math.max(0.05, duration),
        delay,
        ease,
        iterations: iter,
        direction: dir,
        fillMode: fill,
        tracks,
        origin: "css",
        originPoint: parseTransformOrigin(style),
        enabled: true
      });
    });
    Array.from(el.dom.children).forEach((child) => {
      const tag = localTag(child);
      if (tag !== "animate" && tag !== "animatetransform" && tag !== "animatemotion") return;
      if (tag === "animatemotion") {
        warnings.push("animateMotion \u6682\u4E0D\u652F\u6301");
        return;
      }
      const isTransform = tag === "animatetransform";
      const attribute = isTransform ? "transform" : child.getAttribute("attributeName") || "opacity";
      const tType = (child.getAttribute("type") || "translate").toLowerCase();
      const convertValue = (v2) => {
        if (!isTransform) return v2;
        const nums = v2.trim().split(/[\s,]+/).map(Number);
        if (tType === "rotate") return `rotate(${nums[0] || 0}deg)`;
        if (tType === "scale") return `scale(${nums[0] ?? 1}${nums[1] !== void 0 ? `, ${nums[1]}` : ""})`;
        if (tType === "skewx") return `skewX(${nums[0] || 0}deg)`;
        if (tType === "skewy") return `skewY(${nums[0] || 0}deg)`;
        return `translate(${nums[0] || 0}px, ${nums[1] || 0}px)`;
      };
      const dur = evalTimeExpr(child.getAttribute("dur"), el.dom) ?? 1;
      const begin = evalTimeExpr(child.getAttribute("begin"), el.dom) ?? 0;
      const values = child.getAttribute("values");
      const from = child.getAttribute("from");
      const to2 = child.getAttribute("to");
      const keyTimes = child.getAttribute("keyTimes");
      const frames = [];
      if (values) {
        const vals = values.split(";").filter((v2) => v2 !== "");
        const times = keyTimes ? keyTimes.split(";").map(Number).filter((v2) => !Number.isNaN(v2)) : vals.map((_2, i2) => i2 / Math.max(1, vals.length - 1));
        vals.forEach((v2, i2) => frames.push({ offset: times[i2] ?? i2 / Math.max(1, vals.length - 1), value: convertValue(v2) }));
      } else if (from !== null || to2 !== null) {
        frames.push({ offset: 0, value: convertValue(from ?? to2 ?? "") });
        frames.push({ offset: 1, value: convertValue(to2 ?? from ?? "") });
      }
      if (frames.length < 2) return;
      const repeat = child.getAttribute("repeatCount");
      groups.push({
        id: `g${n3++}`,
        name: `SMIL ${attribute}`,
        targetId: el.id,
        duration: dur,
        delay: begin,
        ease: "linear",
        iterations: repeat === "indefinite" ? "infinite" : Math.max(1, parseInt(repeat || "1", 10) || 1),
        direction: "normal",
        fillMode: child.getAttribute("fill") || "both",
        tracks: [{ id: `t${n3++}`, property: attribute, keyframes: frames }],
        origin: "smil",
        originPoint: parseTransformOrigin(style),
        enabled: true
      });
    });
  }
  return mergeLayers(groups);
}
function mergeLayers(groups) {
  const buckets = /* @__PURE__ */ new Map();
  for (const g2 of groups) {
    if (!g2.tracks.length) continue;
    const key = [
      g2.name,
      g2.duration.toFixed(4),
      String(g2.ease),
      String(g2.iterations),
      g2.direction,
      g2.fillMode,
      g2.origin,
      g2.tracks.map((t2) => `${t2.property}[${t2.keyframes.map((k2) => `${k2.offset}:${k2.value}`).join(",")}]`).join(";")
    ].join("|");
    const list = buckets.get(key) || [];
    list.push(g2);
    buckets.set(key, list);
  }
  const merged = [];
  const used = /* @__PURE__ */ new Set();
  buckets.forEach((list) => {
    const distinct = new Set(list.map((g2) => g2.targetId));
    if (list.length < 2 || distinct.size !== list.length) return;
    const sorted = [...list].sort((a, b2) => a.delay - b2.delay);
    const gaps = [];
    for (let i2 = 1; i2 < sorted.length; i2++) gaps.push(Math.max(0, sorted[i2].delay - sorted[i2 - 1].delay));
    gaps.sort((a, b2) => a - b2);
    const median2 = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    const stagger = Math.round(median2 * 1e3) / 1e3;
    const base = sorted[0];
    merged.push({
      ...base,
      id: base.id,
      name: base.name,
      targetId: base.targetId,
      targetIds: sorted.map((g2) => g2.targetId),
      stagger,
      delay: base.delay
    });
    sorted.forEach((g2) => used.add(g2.id));
  });
  const rest = groups.filter((g2) => !used.has(g2.id));
  return [...merged, ...rest].sort((a, b2) => a.delay - b2.delay || a.name.localeCompare(b2.name));
}
function defaultKeyValue(el, prop) {
  if (prop === "opacity") return el.style["opacity"] || "1";
  if (prop === "transform") return "none";
  if (prop === "fill") return el.style["fill"] || "#000";
  if (prop === "stroke") return el.style["stroke"] || "none";
  if (prop === "letter-spacing") return el.style["letter-spacing"] || "0";
  return "";
}
var SHAPE_TAGS, DRAW_TAGS, SKIP_TAGS, INHERITED, GEOMETRY, PRESENTATION, parserFactory, TIMING_FUNCS, ANIM_PROPS;
var init_svg_doc = __esm({
  "src/lib/svg-doc.ts"() {
    init_css();
    init_fonts();
    SHAPE_TAGS = /* @__PURE__ */ new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path"]);
    DRAW_TAGS = /* @__PURE__ */ new Set([...SHAPE_TAGS, "text"]);
    SKIP_TAGS = /* @__PURE__ */ new Set(["defs", "style", "title", "desc", "metadata", "clippath", "mask", "lineargradient", "radialgradient", "pattern", "filter", "symbol", "marker"]);
    INHERITED = [
      "fill",
      "fill-opacity",
      "fill-rule",
      "stroke",
      "stroke-opacity",
      "stroke-width",
      "stroke-dasharray",
      "stroke-dashoffset",
      "stroke-linecap",
      "stroke-linejoin",
      "color",
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "letter-spacing",
      "text-anchor",
      "dominant-baseline",
      "visibility",
      "clip-rule"
    ];
    GEOMETRY = [
      "x",
      "y",
      "width",
      "height",
      "rx",
      "ry",
      "cx",
      "cy",
      "r",
      "x1",
      "y1",
      "x2",
      "y2",
      "points",
      "d",
      "dx",
      "dy",
      "text-anchor",
      "dominant-baseline"
    ];
    PRESENTATION = /* @__PURE__ */ new Set([
      ...INHERITED,
      ...GEOMETRY,
      "opacity",
      "display",
      "transform",
      "transform-origin",
      "transform-box",
      "filter",
      "clip-path",
      "mask",
      "mix-blend-mode"
    ]);
    parserFactory = () => new DOMParser();
    TIMING_FUNCS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"];
    ANIM_PROPS = [
      "opacity",
      "transform",
      "letter-spacing",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-dashoffset",
      "stroke-dasharray",
      "font-size",
      "visibility",
      "width",
      "height"
    ];
  }
});

// src/lib/layout/types.ts
var DEFAULT_LAYOUT;
var init_types = __esm({
  "src/lib/layout/types.ts"() {
    DEFAULT_LAYOUT = {
      mode: "row",
      gap: 24,
      rowGap: 24,
      padding: 0,
      cols: 3,
      width: null,
      maxWidth: null,
      alignX: "start",
      alignY: "center",
      justify: "start",
      wrap: false
    };
  }
});

// src/lib/native/detect.ts
function looksLikeLottie(text) {
  const head = text.trim();
  if (!head.startsWith("{")) return false;
  try {
    const doc = JSON.parse(head);
    return Array.isArray(doc.layers) && (typeof doc.w === "number" || typeof doc.h === "number");
  } catch {
    return false;
  }
}
function looksLikeGsapSvg(text) {
  return /<script[\s>]/i.test(text) && /\bgsap\b/i.test(text) && /<\/svg>/i.test(text);
}
var init_detect = __esm({
  "src/lib/native/detect.ts"() {
  }
});

// src/lib/style-patch.ts
function parseStylePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("\u6837\u5F0F\u8865\u4E01\u5FC5\u987B\u662F\u5BF9\u8C61");
  const entries = Object.entries(value);
  if (!entries.length) throw new Error("\u8BF7\u81F3\u5C11\u63D0\u4F9B\u4E00\u4E2A\u6837\u5F0F\u5C5E\u6027");
  for (const [key, item] of entries) {
    if (TEXT_STYLE.has(key)) {
      if (typeof item !== "string") throw new Error(`\u6837\u5F0F ${key} \u9700\u8981\u5B57\u7B26\u4E32`);
    } else if (NUMERIC_STYLE.has(key)) {
      if (typeof item !== "number" || !Number.isFinite(item)) throw new Error(`\u6837\u5F0F ${key} \u9700\u8981\u6709\u9650\u6570\u5B57`);
      if (key === "opacity" && (item < 0 || item > 1)) throw new Error("\u4E0D\u900F\u660E\u5EA6\u5FC5\u987B\u5728 0 \u5230 1 \u4E4B\u95F4");
      if (NONNEGATIVE.has(key) && item < 0) throw new Error(`\u6837\u5F0F ${key} \u4E0D\u80FD\u5C0F\u4E8E 0`);
      if ((key === "scale" || key === "fontSize") && item <= 0) throw new Error(`\u6837\u5F0F ${key} \u5FC5\u987B\u5927\u4E8E 0`);
    } else {
      throw new Error(`\u4E0D\u652F\u6301\u7684\u6837\u5F0F\u5C5E\u6027\uFF1A${key}`);
    }
  }
  return Object.fromEntries(entries);
}
var NUMERIC_STYLE, TEXT_STYLE, NONNEGATIVE;
var init_style_patch = __esm({
  "src/lib/style-patch.ts"() {
    NUMERIC_STYLE = /* @__PURE__ */ new Set([
      "strokeWidth",
      "opacity",
      "x",
      "y",
      "rotation",
      "scale",
      "width",
      "height",
      "cornerRadius",
      "fontSize",
      "letterSpacing"
    ]);
    TEXT_STYLE = /* @__PURE__ */ new Set(["fill", "stroke", "text"]);
    NONNEGATIVE = /* @__PURE__ */ new Set(["strokeWidth", "width", "height", "cornerRadius"]);
  }
});

// src/lib/project-schema.ts
import { z } from "zod";
function schemaProblems(error) {
  return error.issues.flatMap((issue) => {
    const prefix = issue.path.length ? `${issue.path.join(".")}: ` : "";
    return issue.code === "unrecognized_keys" ? issue.keys.map((key) => `${prefix}\u672A\u77E5\u5B57\u6BB5 ${key}`) : [prefix + issue.message];
  });
}
function parse(schema, value, label) {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`${label}\u6821\u9A8C\u5931\u8D25\uFF1A${schemaProblems(result.error).join("\uFF0C")}`);
  return result.data;
}
function parseAnimationPatch(value) {
  return parse(animationPatch, value, "\u52A8\u753B\u53C2\u6570");
}
function parseLayoutPatch(value) {
  return parse(layoutPatch, value, "\u5E03\u5C40\u53C2\u6570");
}
function parseKeyframes(value) {
  return parse(z.array(keyframe), value, "\u5173\u952E\u5E27");
}
var id, keyframe, track, animationSchema, animationPatch, align, size, layoutPatch;
var init_project_schema = __esm({
  "src/lib/project-schema.ts"() {
    id = z.string().min(1);
    keyframe = z.strictObject({ offset: z.number().min(0).max(1), value: z.string() });
    track = z.strictObject({ id, property: id, keyframes: z.array(keyframe) });
    animationSchema = z.strictObject({
      id,
      name: z.string(),
      targetId: id,
      targetIds: z.array(id).min(1).optional(),
      duration: z.number().positive(),
      delay: z.number(),
      stagger: z.number().nonnegative().optional(),
      ease: id,
      iterations: z.union([z.number().positive(), z.literal("infinite")]),
      direction: z.enum(["normal", "reverse", "alternate", "alternate-reverse"]),
      fillMode: z.enum(["none", "forwards", "backwards", "both"]),
      origin: z.enum(["css", "smil", "manual", "lottie", "gsap"]),
      originPoint: z.strictObject({ x: z.number(), y: z.number() }),
      enabled: z.boolean().optional(),
      tracks: z.array(track).min(1)
    });
    animationPatch = animationSchema.omit({ id: true }).partial();
    align = z.enum(["start", "center", "end", "stretch"]);
    size = z.number().nonnegative().nullable().optional();
    layoutPatch = z.strictObject({
      mode: z.enum(["free", "row", "column", "grid"]),
      gap: z.number().nonnegative(),
      rowGap: z.number().nonnegative().optional(),
      padding: z.number().nonnegative(),
      cols: z.number().int().min(1).max(1e3),
      width: size,
      maxWidth: size,
      alignX: align,
      alignY: align,
      justify: z.enum(["start", "center", "end", "between"]),
      wrap: z.boolean()
    }).partial();
  }
});

// src/lib/project.ts
function genId(prefix) {
  seed++;
  return `${prefix}_${Date.now().toString(36)}${seed.toString(36)}`;
}
function normalizeVersions(raw) {
  if (!Array.isArray(raw)) return [];
  const byIndex = /* @__PURE__ */ new Map();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item;
    const index = Math.round(Number(entry.index));
    if (!Number.isFinite(index) || index < 1 || byIndex.has(index)) continue;
    if (typeof entry.svg !== "string" || !entry.svg.trim()) continue;
    byIndex.set(index, {
      index,
      createdAt: Number(entry.createdAt) || Date.now(),
      label: typeof entry.label === "string" && entry.label ? entry.label : void 0,
      svg: entry.svg,
      width: Number(entry.width) || 1920,
      height: Number(entry.height) || 1080
    });
  }
  return Array.from(byIndex.values()).sort((a, b2) => a.index - b2.index);
}
function elementIndexOf(doc) {
  return doc.elements.map((el) => ({
    id: el.id,
    tag: el.tag,
    label: el.label,
    depth: el.depth,
    kind: el.kind,
    parentId: el.parentId
  }));
}
function buildAssetFromSvg(svg, name, opts = {}) {
  const doc = parseSvgDocument(svg);
  const id2 = opts.id || genId("a");
  const groups = doc.groups.map((g2, i2) => ({ ...g2, id: `${id2}_g${i2}` }));
  return {
    id: id2,
    name,
    svg,
    format: "svg",
    payload: void 0,
    duration: void 0,
    width: doc.width || 1920,
    height: doc.height || 1080,
    kind: groups.length ? "animated" : "static",
    groups,
    elements: elementIndexOf(doc),
    overrides: {},
    layouts: {},
    warnings: doc.warnings,
    source: "import",
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    createdAt: Date.now(),
    version: 1
  };
}
function buildNativeAsset(format, payload, name, opts = {}) {
  let width = 1920;
  let height = 1080;
  let duration = 0;
  if (format === "lottie") {
    const data = JSON.parse(payload);
    width = Math.max(1, Math.round(Number(data.w) || 512));
    height = Math.max(1, Math.round(Number(data.h) || 512));
    const fr2 = Number(data.fr) || 30;
    const ip = Number(data.ip) || 0;
    const op = Number(data.op) || ip + 1;
    duration = Math.max(1e-3, (op - ip) / fr2);
  } else {
    const doc = parseSvgDocument(payload);
    width = doc.width || 1920;
    height = doc.height || 1080;
  }
  return {
    id: opts.id || genId("a"),
    name: name || (format === "lottie" ? "Lottie \u7D20\u6750" : "GSAP \u7D20\u6750"),
    svg: "",
    format,
    payload,
    duration,
    width,
    height,
    kind: "animated",
    groups: [],
    elements: [],
    overrides: {},
    layouts: {},
    warnings: [],
    source: "import",
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    createdAt: Date.now(),
    version: 1
  };
}
function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") throw new Error("\u9879\u76EE\u6587\u4EF6\u4E0D\u662F JSON \u5BF9\u8C61");
  if (raw.format !== PROJECT_FORMAT) {
    throw new Error(`\u4E0D\u662F MG SVG Studio \u9879\u76EE\u6587\u4EF6\uFF08format=${String(raw.format)}\uFF09`);
  }
  if (raw.version !== void 0 && raw.version !== PROJECT_VERSION && !LEGACY_PROJECT_VERSIONS.includes(raw.version)) {
    throw new Error(`\u4E0D\u652F\u6301\u7684\u9879\u76EE\u7248\u672C\uFF1A${raw.version}`);
  }
  if (!Array.isArray(raw.assets)) throw new Error("\u9879\u76EE\u7F3A\u5C11 assets \u6570\u7EC4");
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: raw.name || "\u672A\u547D\u540D\u7D20\u6750\u5E93",
    updatedAt: raw.updatedAt,
    assets: raw.assets.map((a) => normalizeAsset(a))
  };
}
function normalizeAsset(a) {
  if (!a || typeof a !== "object") throw new Error("assets \u91CC\u5B58\u5728\u975E\u5BF9\u8C61\u9879");
  if (typeof a.id !== "string") throw new Error("\u7D20\u6750\u7F3A\u5C11 id");
  const format = a.format === "lottie" || a.format === "gsap" ? a.format : "svg";
  if (format === "svg" && typeof a.svg !== "string") throw new Error(`\u7D20\u6750 ${a.id} \u7F3A\u5C11 svg`);
  if (format !== "svg" && typeof a.payload !== "string") throw new Error(`\u539F\u751F\u7D20\u6750 ${a.id} \u7F3A\u5C11 payload`);
  const groups = Array.isArray(a.groups) ? a.groups : [];
  return {
    id: a.id,
    name: a.name || a.id,
    svg: typeof a.svg === "string" ? a.svg : "",
    format,
    payload: typeof a.payload === "string" ? a.payload : void 0,
    duration: Number(a.duration) || void 0,
    width: Number(a.width) || 1920,
    height: Number(a.height) || 1080,
    kind: format !== "svg" || groups.length ? "animated" : "static",
    groups,
    elements: Array.isArray(a.elements) ? a.elements : [],
    videoCopy: typeof a.videoCopy === "string" ? a.videoCopy : "",
    voiceoverAudio: typeof a.voiceoverAudio === "string" ? a.voiceoverAudio : void 0,
    overrides: a.overrides && typeof a.overrides === "object" ? a.overrides : {},
    layouts: a.layouts && typeof a.layouts === "object" ? a.layouts : {},
    warnings: Array.isArray(a.warnings) ? a.warnings : [],
    source: a.source || "import",
    x: Number(a.x) || 0,
    y: Number(a.y) || 0,
    createdAt: Number(a.createdAt) || Date.now(),
    review: a.review && typeof a.review === "object" ? a.review : void 0,
    agentReview: a.agentReview && typeof a.agentReview === "object" ? a.agentReview : void 0,
    revision: a.revision && typeof a.revision === "object" ? {
      index: Number(a.revision.index) || 0,
      createdAt: Number(a.revision.createdAt) || 0,
      label: typeof a.revision.label === "string" ? a.revision.label : void 0
    } : void 0,
    versions: normalizeVersions(a.versions),
    version: 1
  };
}
function findAsset(project, ref) {
  const asset = project.assets.find((a) => a.id === ref);
  if (asset) return asset;
  const byName = project.assets.filter((a) => a.name === ref);
  if (byName.length === 1) return byName[0];
  throw new Error(`\u627E\u4E0D\u5230\u7D20\u6750 "${ref}"\uFF08\u73B0\u6709\uFF1A${project.assets.map((a) => a.id).join(", ")}\uFF09`);
}
function findElement(asset, ref) {
  const list = asset.elements || [];
  const byId = list.find((e2) => e2.id === ref);
  if (byId) return byId;
  const byLabel = list.filter((e2) => e2.label === ref);
  if (byLabel.length === 1) return byLabel[0];
  if (byLabel.length > 1) throw new Error(`\u5143\u7D20 "${ref}" \u5339\u914D\u5230 ${byLabel.length} \u4E2A\uFF0C\u8BF7\u7528 id\uFF1A${byLabel.map((e2) => e2.id).join(", ")}`);
  throw new Error(`\u7D20\u6750 ${asset.id} \u91CC\u627E\u4E0D\u5230\u5143\u7D20 "${ref}"`);
}
function findGroup(asset, ref) {
  const byId = asset.groups.find((g2) => g2.id === ref);
  if (byId) return byId;
  const byName = asset.groups.filter((g2) => g2.name === ref);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`\u52A8\u753B "${ref}" \u6709 ${byName.length} \u6761\u540C\u540D\u8F68\u9053\uFF0C\u8BF7\u7528 id\uFF1A${byName.map((g2) => g2.id).join(", ")}`);
  throw new Error(`\u7D20\u6750 ${asset.id} \u91CC\u627E\u4E0D\u5230\u52A8\u753B "${ref}"`);
}
function applyOps(project, ops) {
  const next = JSON.parse(JSON.stringify(project));
  const log = [];
  ops.forEach((op, index) => {
    const result = applyOne(next, op);
    log.push({ index, op: op.op, ok: true, detail: result });
  });
  next.assets = next.assets.map((a) => ({ ...a, kind: a.format && a.format !== "svg" || a.groups.length ? "animated" : "static" }));
  next.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  return { project: next, log };
}
function applyOne(project, op) {
  switch (op.op) {
    case "asset.add": {
      if (op.format === "lottie" || op.format === "gsap") {
        if (typeof op.payload !== "string" || !op.payload.trim()) throw new Error("asset.add \u7684\u539F\u751F\u7D20\u6750\u9700\u8981 payload");
        const asset2 = buildNativeAsset(op.format, op.payload, op.name || "\u539F\u751F\u7D20\u6750", { id: op.id, x: op.x, y: op.y });
        project.assets.push(asset2);
        return `\u6DFB\u52A0${op.format === "lottie" ? " Lottie" : " GSAP"} \u7D20\u6750 ${asset2.id}\uFF08\u539F\u751F\u8FD0\u884C\u65F6\uFF0C${asset2.width}\xD7${asset2.height}\uFF09`;
      }
      if (!op.svg || typeof op.svg !== "string") throw new Error("asset.add \u9700\u8981 svg\uFF0C\u6216 format + payload");
      const asset = buildAssetFromSvg(op.svg, op.name || "\u65B0\u7D20\u6750", { id: op.id, x: op.x, y: op.y });
      if (op.width) asset.width = op.width;
      if (op.height) asset.height = op.height;
      project.assets.push(asset);
      return `\u6DFB\u52A0\u7D20\u6750 ${asset.id}\uFF08${asset.groups.length} \u6761\u52A8\u753B\uFF0C${asset.elements?.length || 0} \u4E2A\u5143\u7D20\uFF09`;
    }
    case "asset.remove": {
      const asset = findAsset(project, op.asset);
      project.assets = project.assets.filter((a) => a.id !== asset.id);
      return `\u5220\u9664\u7D20\u6750 ${asset.id}`;
    }
    case "asset.update": {
      const asset = findAsset(project, op.asset);
      const { svg, ...fields } = op.patch;
      if (svg !== void 0) {
        if (typeof svg !== "string" || !svg.trim()) throw new Error("asset.update \u7684 svg \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32");
        if (asset.format === "lottie" || asset.format === "gsap") {
          const keep = {
            id: asset.id,
            name: asset.name,
            x: asset.x,
            y: asset.y,
            overrides: asset.overrides,
            layouts: asset.layouts,
            videoCopy: asset.videoCopy,
            voiceoverAudio: asset.voiceoverAudio,
            createdAt: asset.createdAt,
            source: asset.source
          };
          const rebuilt = looksLikeLottie(svg) ? buildNativeAsset("lottie", svg, keep.name, keep) : looksLikeGsapSvg(svg) ? buildNativeAsset("gsap", svg, keep.name, keep) : buildAssetFromSvg(svg, keep.name, keep);
          Object.assign(asset, rebuilt, keep);
          asset.format = rebuilt.format ?? "svg";
          asset.payload = rebuilt.payload;
          asset.duration = rebuilt.duration;
          Object.assign(asset, fields);
          return `\u66F4\u65B0\u7D20\u6750 ${asset.id}\uFF1A\u5185\u5BB9\u4E0E\u683C\u5F0F\uFF08\u2192 ${asset.format}\uFF09`;
        }
        const doc = parseSvgDocument(svg);
        asset.svg = svg;
        asset.width = doc.width || asset.width;
        asset.height = doc.height || asset.height;
        asset.elements = elementIndexOf(doc);
        asset.warnings = doc.warnings;
      }
      Object.assign(asset, fields);
      return `\u66F4\u65B0\u7D20\u6750 ${asset.id}\uFF1A${Object.keys(op.patch).join(", ")}`;
    }
    case "board.move": {
      const asset = findAsset(project, op.asset);
      asset.x = op.x;
      asset.y = op.y;
      return `\u753B\u677F ${asset.id} \u2192 (${op.x}, ${op.y})`;
    }
    case "anim.set": {
      const asset = findAsset(project, op.asset);
      if (!op.group || !op.group.id) throw new Error("anim.set \u9700\u8981\u5B8C\u6574\u7684 group \u5BF9\u8C61\uFF08\u542B id\uFF09");
      const idx = asset.groups.findIndex((g2) => g2.id === op.group.id);
      if (idx >= 0) asset.groups[idx] = op.group;
      else asset.groups.push(op.group);
      return `${idx >= 0 ? "\u66FF\u6362" : "\u6DFB\u52A0"}\u52A8\u753B ${op.group.id}\uFF08${op.group.name}\uFF09`;
    }
    case "anim.update": {
      const asset = findAsset(project, op.asset);
      const group = findGroup(asset, op.group);
      Object.assign(group, parseAnimationPatch(op.patch));
      return `\u66F4\u65B0\u52A8\u753B ${group.id}\uFF1A${Object.keys(op.patch).join(", ")}`;
    }
    case "anim.remove": {
      const asset = findAsset(project, op.asset);
      const group = findGroup(asset, op.group);
      asset.groups = asset.groups.filter((g2) => g2.id !== group.id);
      return `\u5220\u9664\u52A8\u753B ${group.id}`;
    }
    case "anim.layer": {
      const asset = findAsset(project, op.asset);
      const group = findGroup(asset, op.group);
      if (!Array.isArray(op.targets) || !op.targets.length) throw new Error("anim.layer \u9700\u8981 targets \u6570\u7EC4");
      const ids = op.targets.map((t2) => findElement(asset, t2).id);
      group.targetIds = ids;
      group.targetId = ids[0];
      if (op.stagger !== void 0) Object.assign(group, parseAnimationPatch({ stagger: op.stagger }));
      return `${group.name} \u8BBE\u4E3A ${ids.length} \u4E2A\u76EE\u6807\u7684\u5206\u5C42${op.stagger !== void 0 ? `\uFF0C\u4EA4\u9519 ${op.stagger}s` : ""}`;
    }
    case "anim.keyframes": {
      const asset = findAsset(project, op.asset);
      const group = findGroup(asset, op.group);
      const track2 = group.tracks.find((t2) => t2.property === op.property);
      if (!track2) throw new Error(`\u52A8\u753B ${group.id} \u6CA1\u6709\u5C5E\u6027 ${op.property}\uFF0C\u73B0\u6709\uFF1A${group.tracks.map((t2) => t2.property).join(", ")}`);
      track2.keyframes = parseKeyframes(op.keyframes).sort((a, b2) => a.offset - b2.offset);
      return `${group.name} \xB7 ${op.property} \u5173\u952E\u5E27 \u2192 ${op.keyframes.length} \u4E2A`;
    }
    case "style.set": {
      const asset = findAsset(project, op.asset);
      if (asset.format === "lottie" || asset.format === "gsap") {
        throw new Error(`${asset.format} \u662F\u539F\u751F\u7D20\u6750\uFF0C\u52A8\u753B\u5728\u8FD0\u884C\u65F6\u91CC\uFF0C\u4E0D\u652F\u6301\u9010\u5143\u7D20\u7F16\u8F91\uFF1B\u6539\u6E90\u6587\u4EF6\u540E\u91CD\u65B0\u5BFC\u5165`);
      }
      const el = findElement(asset, op.element);
      asset.overrides[el.id] = { ...asset.overrides[el.id] || {}, ...parseStylePatch(op.patch) };
      return `\u5143\u7D20 ${el.id}\uFF08${el.label}\uFF09\u6837\u5F0F\uFF1A${Object.entries(op.patch).map(([k2, v2]) => `${k2}=${v2}`).join(", ")}`;
    }
    case "style.clear": {
      const asset = findAsset(project, op.asset);
      if (asset.format === "lottie" || asset.format === "gsap") {
        throw new Error(`${asset.format} \u662F\u539F\u751F\u7D20\u6750\uFF0C\u52A8\u753B\u5728\u8FD0\u884C\u65F6\u91CC\uFF0C\u4E0D\u652F\u6301\u9010\u5143\u7D20\u7F16\u8F91\uFF1B\u6539\u6E90\u6587\u4EF6\u540E\u91CD\u65B0\u5BFC\u5165`);
      }
      const el = findElement(asset, op.element);
      delete asset.overrides[el.id];
      return `\u6E05\u7A7A\u5143\u7D20 ${el.id}\uFF08${el.label}\uFF09\u7684\u6837\u5F0F\u8986\u76D6`;
    }
    case "layout.set": {
      const asset = findAsset(project, op.asset);
      const el = findElement(asset, op.container);
      const spec = { ...DEFAULT_LAYOUT, ...parseLayoutPatch(op.spec) };
      asset.layouts = { ...asset.layouts || {}, [el.id]: spec };
      return `\u5BB9\u5668 ${el.id}\uFF08${el.label}\uFF09\u5E03\u5C40\uFF1A${spec.mode} gap=${spec.gap}${spec.mode === "grid" ? ` cols=${spec.cols}` : ""}`;
    }
    case "layout.clear": {
      const asset = findAsset(project, op.asset);
      const el = findElement(asset, op.container);
      if (asset.layouts) delete asset.layouts[el.id];
      return `\u6E05\u9664\u5BB9\u5668 ${el.id}\uFF08${el.label}\uFF09\u5E03\u5C40`;
    }
    default:
      throw new Error(`\u672A\u77E5\u64CD\u4F5C\uFF1A${op.op}`);
  }
}
function outline(project, opts = {}) {
  const lines = [];
  lines.push(`\u9879\u76EE\uFF1A${project.name} \xB7 ${project.assets.length} \u4E2A\u7D20\u6750${project.updatedAt ? ` \xB7 \u66F4\u65B0\u4E8E ${project.updatedAt}` : ""}`);
  const assets = opts.assetId ? [findAsset(project, opts.assetId)] : project.assets;
  for (const a of assets) {
    const native = a.format === "lottie" || a.format === "gsap";
    const animated = native || a.groups.length > 0;
    const kindLabel = native ? `\u539F\u751F ${a.format}${a.duration ? ` \xB7 ${a.duration.toFixed(2)}s` : ""}` : animated ? `${a.groups.length} \u6761\u52A8\u753B` : "\u9759\u6001";
    lines.push("");
    lines.push(`[${a.id}] ${a.name}  ${a.width}\xD7${a.height}  ${kindLabel}  \u4F4D\u7F6E (${Math.round(a.x)}, ${Math.round(a.y)})`);
    if (a.layouts && Object.keys(a.layouts).length) {
      lines.push(`  \u5E03\u5C40\uFF1A${Object.entries(a.layouts).map(([id2, s2]) => `${id2}=${s2.mode}${s2.mode === "grid" ? `/${s2.cols}\u5217` : ""}`).join("  ")}`);
    }
    if (a.overrides && Object.keys(a.overrides).length) {
      lines.push(`  \u6837\u5F0F\u8986\u76D6\uFF1A${Object.keys(a.overrides).length} \u4E2A\u5143\u7D20`);
    }
    a.groups.forEach((g2) => {
      const targets = g2.targetIds?.length || 1;
      const label = targets > 1 ? `\u5C42 \xD7${targets}` : `${findLabel(a, g2.targetId)}`;
      lines.push(
        `  \xB7 ${g2.name}  ${label}  ${g2.duration.toFixed(2)}s +${g2.delay.toFixed(2)}s${g2.stagger ? ` \u4EA4\u9519 ${g2.stagger}s` : ""}  [${g2.origin}]${g2.enabled === false ? " (\u505C\u7528)" : ""}  id=${g2.id}`
      );
    });
    if (opts.elements) {
      lines.push("  \u5143\u7D20\uFF1A");
      (a.elements || []).forEach((el) => {
        lines.push(`    ${el.id}  ${el.tag}  ${el.label}${el.kind === "group" ? "  (\u7EC4)" : ""}`);
      });
    }
  }
  if (project.assets.some((a) => (a.elements?.length || 0) === 0)) {
    lines.push("");
    lines.push("\u63D0\u793A\uFF1A\u90E8\u5206\u7D20\u6750\u6CA1\u6709\u5143\u7D20\u7D22\u5F15\uFF0C\u7528 `mgsvg repair <file>` \u53EF\u4EE5\u4ECE SVG \u91CD\u65B0\u751F\u6210\u3002");
  }
  return lines.join("\n");
}
function findLabel(asset, id2) {
  return asset.elements?.find((e2) => e2.id === id2)?.label || id2;
}
function validateProject(project) {
  const problems = [];
  const ids = /* @__PURE__ */ new Set();
  project.assets.forEach((a) => {
    if (ids.has(a.id)) problems.push(`\u7D20\u6750 id \u91CD\u590D\uFF1A${a.id}`);
    ids.add(a.id);
    const native = a.format === "lottie" || a.format === "gsap";
    if (native) {
      if (!a.payload) problems.push(`\u539F\u751F\u7D20\u6750 ${a.id} \u6CA1\u6709 payload`);
    } else if (!a.svg) {
      problems.push(`\u7D20\u6750 ${a.id} \u6CA1\u6709 svg`);
    }
    const elementIds = new Set((a.elements || []).map((e2) => e2.id));
    a.groups.forEach((g2, index) => {
      const checked = animationSchema.safeParse(g2);
      if (!checked.success) {
        problems.push(...schemaProblems(checked.error).map((problem) => `\u7D20\u6750 ${a.id} \u52A8\u753B ${g2?.id || index}\uFF1A${problem}`));
        return;
      }
      const targets = g2.targetIds?.length ? g2.targetIds : [g2.targetId];
      targets.forEach((t2) => {
        if (elementIds.size && !elementIds.has(t2)) problems.push(`\u52A8\u753B ${g2.id} \u6307\u5411\u4E0D\u5B58\u5728\u7684\u5143\u7D20 ${t2}`);
      });
    });
    Object.entries(a.overrides || {}).forEach(([el]) => {
      if (elementIds.size && !elementIds.has(el)) problems.push(`\u7D20\u6750 ${a.id} \u7684\u6837\u5F0F\u8986\u76D6\u6307\u5411\u4E0D\u5B58\u5728\u7684\u5143\u7D20 ${el}`);
    });
    Object.entries(a.layouts || {}).forEach(([el, spec]) => {
      if (elementIds.size && !elementIds.has(el)) problems.push(`\u7D20\u6750 ${a.id} \u7684\u5E03\u5C40\u6307\u5411\u4E0D\u5B58\u5728\u7684\u5BB9\u5668 ${el}`);
      try {
        parseLayoutPatch(spec);
      } catch (error) {
        problems.push(`\u7D20\u6750 ${a.id} \u5BB9\u5668 ${el}\uFF1A${error.message}`);
      }
    });
  });
  return { ok: problems.length === 0, problems };
}
var PROJECT_FORMAT, PROJECT_VERSION, LEGACY_PROJECT_VERSIONS, seed;
var init_project = __esm({
  "src/lib/project.ts"() {
    init_types();
    init_svg_doc();
    init_detect();
    init_style_patch();
    init_project_schema();
    PROJECT_FORMAT = "mg-svg-studio/project";
    PROJECT_VERSION = 2;
    LEGACY_PROJECT_VERSIONS = [1];
    seed = 0;
  }
});

// src/cli/io.ts
import fs from "node:fs";
import path from "node:path";
import { DOMParser as LinkedomParser } from "linkedom";
function readProject(file) {
  return readProjectFile(file).project;
}
function readProjectFile(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`\u9879\u76EE\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${abs}`);
  const raw = fs.readFileSync(abs, "utf8");
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`\u9879\u76EE\u6587\u4EF6\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${err.message}`);
  }
  return { project: normalizeProject(json), snapshot: raw };
}
function writeProject(file, project, snapshot) {
  const abs = path.resolve(file);
  const tmp = `${abs}.tmp-${process.pid}`;
  const body = JSON.stringify(project, null, 2) + "\n";
  try {
    fs.writeFileSync(tmp, body, "utf8");
    if (snapshot !== void 0 && fs.readFileSync(abs, "utf8") !== snapshot) {
      throw new Error("\u9879\u76EE\u6587\u4EF6\u5728\u8BFB\u53D6\u540E\u5DF2\u88AB\u4FEE\u6539\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u540E\u518D\u5E94\u7528");
    }
    fs.renameSync(tmp, abs);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return abs;
}
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
var init_io = __esm({
  "src/cli/io.ts"() {
    init_svg_doc();
    init_project();
    setSvgDomParser(() => new LinkedomParser());
  }
});

// src/lib/bridge-protocol.ts
function bridgeCommandTimeout(type) {
  return type === "review" ? 45e3 : type === "asset.add" || type === "project.reload" ? 2e4 : 8e3;
}
var init_bridge_protocol = __esm({
  "src/lib/bridge-protocol.ts"() {
  }
});

// src/lib/review/rules-core.json
var rules_core_default;
var init_rules_core = __esm({
  "src/lib/review/rules-core.json"() {
    rules_core_default = {
      libraryVersion: 4,
      referenceCanvas: {
        width: 1920,
        height: 1080,
        note: "\u51E0\u4F55\u9608\u503C\u4E3A px@1080p\uFF0C\u5B9E\u9645\u6309 scale = min(W,H)/1080 \u7F29\u653E"
      },
      coveragePolicy: {
        rule: "\u6BCF\u6761\u5199\u4F5C\u89C4\u5219\u90FD\u5FC5\u987B\u6709\u53EF\u7B97\u6307\u6807\uFF08metric + gate\uFF09\u548C\u843D\u5730\u5B9E\u73B0\uFF1B\u6CA1\u6709 metric \u7684\u89C4\u5219\u4E0D\u7B97\u89C4\u5219",
        noMetric: "\u65E0 metric \u7684\u89C4\u5219\u53EA\u80FD\u8BB0 severity=human\uFF0C\u8FDB\u4EBA\u5BA1\u6E05\u5355\uFF0C\u4E0D\u8BA1\u5165\u901A\u8FC7\u7387",
        silent: "\u89C4\u5219\u5DF2\u5B9E\u73B0\u4F46\u672C\u6B21\u6CA1\u6709\u4EA7\u51FA\u8BB0\u5F55\u65F6\u8BB0 UNMEASURED\uFF0C\u4E0D\u5F97\u7B97 PASS\uFF1B\u62A5\u544A\u5FC5\u987B\u9010\u6761\u5217\u51FA\u72B6\u6001"
      },
      statusVocabulary: [
        "PASS",
        "WARN",
        "FAIL",
        "UNMEASURED",
        "NA",
        "DIAGNOSTIC"
      ],
      dimensions: {
        measure: "exact \u5B9A\u4E49\u5373\u6570\u503C / model \u4EE3\u7406\u6A21\u578B\uFF0C\u4EC5\u5E8F\u5173\u7CFB\u53EF\u4FE1 / semantic \u53EA\u80FD\u4EBA\u5224",
        threshold: "standard \u53EF\u5F15\u7528\u89C4\u8303\uFF0C\u6539\u52A8\u9700\u6362\u5F15\u6587 / convention \u884C\u4E1A\u60EF\u4F8B\uFF0C\u53EF\u8FA9\u62A4\u65E0\u5F3A\u5236\u529B / proposal \u672C\u9879\u76EE\u63D0\u6848\uFF0C\u6C38\u4E0D\u963B\u65AD",
        severity: "blocker \u503C\u5F97\u4FEE / warn \u53EF\u8BA8\u8BBA / info \u53C2\u8003",
        impact: "high \u9AD8\uFF08\u505A\u4E0D\u6210\uFF09/ medium \u4E2D\uFF08\u8BFB\u4E0D\u987A\uFF09/ low \u4F4E\uFF08\u4E0D\u7CBE\u81F4\uFF09\uFF1B\u53EA\u51B3\u5B9A\u6392\u5E8F\u4E0E\u5C55\u793A\u9884\u7B97\uFF0C\u4E0D\u51B3\u5B9A\u80FD\u4E0D\u80FD\u62E6",
        medium: "video / ui / print",
        status: "PASS/WARN/FAIL \u662F\u95F8\u95E8\u7ED3\u8BBA\uFF1BDIAGNOSTIC \u662F\u8BCA\u65AD\u8F93\u51FA\uFF0C\u4E0D\u53C2\u4E0E\u5224\u5B9A"
      },
      impactPolicy: {
        axis: "\u5F71\u54CD\u7A0B\u5EA6\uFF1A\u9AD8=\u505A\u4E0D\u6210 / \u4E2D=\u8BFB\u4E0D\u987A / \u4F4E=\u4E0D\u7CBE\u81F4\uFF1B\u4E0E\u95F8\u95E8\u6743\u9650\uFF08\u80FD\u4E0D\u80FD\u62E6\uFF09\u3001\u5A92\u4ECB\uFF08video/ui/print\uFF09\u76F8\u4E92\u72EC\u7ACB",
        labels: {
          high: "\u9AD8",
          medium: "\u4E2D",
          low: "\u4F4E"
        },
        byPrinciple: {
          \u53EF\u8BFB\u6027: "high",
          \u53EF\u7528\u6027: "high",
          \u4EA4\u4ED8\u5B8C\u6574\u6027: "high",
          \u5BF9\u6BD4: "high",
          \u4EB2\u5BC6\u6027: "medium",
          \u89C6\u89C9\u5C42\u6B21: "medium",
          \u5BF9\u9F50: "medium",
          \u7F51\u683C: "medium",
          "\u683C\u5F0F\u5854\xB7\u76F8\u4F3C": "medium",
          "\u683C\u5F0F\u5854\xB7\u95ED\u5408": "medium",
          "\u683C\u5F0F\u5854\xB7\u8FDE\u7EED": "medium",
          \u5171\u540C\u533A\u57DF: "medium",
          \u8D1F\u7A7A\u95F4: "medium",
          \u91CD\u590D\u4E0E\u4E00\u81F4\u6027: "medium",
          \u4FE1\u606F\u5BC6\u5EA6: "medium",
          \u8FD0\u52A8\u4E0E\u8282\u594F: "medium",
          \u7EDF\u4E00\u4E0E\u591A\u6837: "low",
          \u5E73\u8861: "low",
          \u6BD4\u4F8B: "low",
          \u610F\u4E49: "low"
        },
        override: {
          "SN-01": "low",
          "OR-01": "low",
          "PN-01": "low",
          "NS-02": "low",
          "TY-07": "medium",
          "TY-08": "medium"
        },
        fallback: "medium",
        order: [
          "high",
          "medium",
          "low"
        ],
        budget: {
          high: null,
          medium: 5,
          low: 0,
          elementsPerCard: 5,
          note: "\u9AD8\u5F71\u54CD\u4E0D\u6298\u53E0\uFF08\u4E00\u6761\u95EE\u9898\u90FD\u4E0D\u8BE5\u88AB\u85CF\uFF09\uFF1B\u4E2D\u5F71\u54CD\u6309\u89C4\u5219\u805A\u5408\u6210\u4E00\u5F20\u5361\uFF0C\u8D85\u8FC7 5 \u7C7B\u6298\u6210\u4E00\u884C\uFF1B\u4F4E\u5F71\u54CD\u53EA\u7ED9\u6761\u6570\u4E0E\u89C4\u5219 ID"
        },
        note: "\u5F71\u54CD\u7A0B\u5EA6\u53EA\u505A\u6392\u5E8F\u4E0E\u5C55\u793A\u9884\u7B97\uFF0C\u4E0D\u6539\u53D8 PASS/WARN/FAIL\uFF1A\u9AD8\u5F71\u54CD\u4E0D\u7B49\u4E8E\u80FD\u62E6\uFF0C\u4F4E\u5F71\u54CD\u4E5F\u4E0D\u7B49\u4E8E\u53EF\u5FFD\u7565\u3002\u5B8C\u6574\u8BB0\u5F55\u4ECD\u5728 findings[]\uFF0C\u6298\u53E0\u53EA\u53D1\u751F\u5728 view \u91CC"
      },
      rules: [
        {
          id: "PR-01",
          title: "\u8BED\u4E49\u5206\u7EC4",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "gap_ratio",
          unit: "ratio",
          gate: {
            warn: {
              lt: 1.2
            }
          },
          minSamples: 3,
          requires: [
            "boxes"
          ],
          note: "\u95F4\u8DDD\u6BD4\u7528\u4E8E\u5B9A\u4F4D\uFF0C\u7ED3\u5408\u5171\u540C\u533A\u57DF\u548C\u4EFB\u52A1\u8BED\u4E49\u505A\u4E00\u6B21\u5224\u65AD\u3002\u7F3A\u5C11\u53EF\u6838\u5BF9\u7684\u5F52\u5C5E\u8BC1\u636E\u65F6\u8BB0\u672A\u6D4B\u3002\u540C\u4E00\u5BB9\u5668\u5185\u7684\u884C\u8DDD\u6309\u7EC4\u5185\u95F4\u8DDD\u5904\u7406\uFF0C\u7528\u4E0E\u7EC4\u5185\u51C0\u8DDD\u76F8\u540C\u7684\u91CF\u53D6\u57FA\u51C6\uFF1B\u5BB9\u5668\u8FB9\u754C\u53EA\u7528\u6765\u5224\u65AD\u5F52\u5C5E\uFF0C\u4E0D\u5F53\u95F4\u8DDD\u7528\u3002",
          supersededBy: "GR-02",
          measure: "semantic",
          threshold: "proposal",
          citation: "Williams\u300A\u5199\u7ED9\u5927\u5BB6\u770B\u7684\u8BBE\u8BA1\u4E66\u300B\uFF08The Non-Designer's Design Book\uFF09 Proximity\uFF1B\u8003\u592B\u5361\u300A\u683C\u5F0F\u5854\u5FC3\u7406\u5B66\u539F\u7406\u300B\uFF08Principles of Gestalt Psychology, 1935\uFF09 \u63A5\u8FD1\u6027\u539F\u7406\uFF1BWertheimer 1923 \u8BBA\u6587",
          principle: "\u4EB2\u5BC6",
          violation: "\u914D\u9001\u5730\u5740\u7684\u6807\u7B7E\u79BB\u4ED8\u6B3E\u5B57\u6BB5 8px\uFF0C\u79BB\u81EA\u5DF1\u7684\u5730\u5740\u8F93\u5165\u6846 24px\uFF0C\u4E24\u7EC4\u53C8\u6CA1\u6709\u5206\u9694\u3002\u6309\u8868\u5355\u7684\u5B57\u6BB5\u5B9A\u4E49\uFF0C\u5730\u5740\u6807\u7B7E\u4E0E\u5730\u5740\u8F93\u5165\u6846\u540C\u7EC4\u3002\u5F53\u524D\u7248\u9762\u66F4\u5BB9\u6613\u628A\u6807\u7B7E\u8BFB\u6210\u4ED8\u6B3E\u5B57\u6BB5\u7684\u8BF4"
        },
        {
          id: "CR-01",
          title: "\u5171\u540C\u533A\u57DF",
          principle: "\u683C\u5F0F\u5854",
          measure: "semantic",
          threshold: "proposal",
          citation: "\u8003\u592B\u5361\u300A\u683C\u5F0F\u5854\u5FC3\u7406\u5B66\u539F\u7406\u300B\uFF08Principles of Gestalt Psychology, 1935\uFF09 \u5171\u540C\u533A\u57DF\u539F\u7406\uFF1BWertheimer 1923 \u8BBA\u6587\u300ALaws of Organization in Perceptual Forms\u300B",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "cross_container_group_ratio",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.3
            }
          },
          minSamples: 2,
          requires: [
            "boxes",
            "groups"
          ],
          implemented: false,
          violation: "\u5217\u8868\u9879\u7684\u6807\u9898\u5728\u8868\u683C\u5934\u5BB9\u5668\uFF0C\u5185\u5BB9\u5728\u8868\u4F53\u5BB9\u5668\uFF0C\u4E24\u8005\u5E94\u5C5E\u540C\u4E00\u7EC4\u3002",
          note: "\u5171\u540C\u533A\u57DF\u6307\uFF1A\u540C\u4E00\u5BB9\u5668\u6216\u80CC\u666F\u5757\u5185\u7684\u5143\u7D20\u88AB\u89C6\u4E3A\u4E00\u7EC4\uFF0C\u4F18\u5148\u4E8E\u5355\u7EAF\u7684\u8DDD\u79BB\u5173\u7CFB\u3002\u5BB9\u5668\u8FB9\u754C\u9700\u53EF\u89C1\uFF08\u80CC\u666F\u3001\u63CF\u8FB9\u3001\u5206\u5272\u7EBF\u6216\u7559\u767D\u5757\uFF09\u3002\u65E0\u5BB9\u5668\u7684\u7EAF\u6392\u7248\u9875\u9762\u6309\u8BED\u4E49\u5206\u7EC4\u89C4\u5219\u5224\uFF0C\u672C\u89C4\u5219\u8BB0\u4E0D\u9002\u7528\u3002\u300C\u5E94\u8BE5\u540C\u7EC4\u300D\u9700\u8981\u4EFB\u52A1\u8BED\u4E49\uFF0C\u7F3A\u4EFB\u52A1\u4E0A\u4E0B\u6587\u65F6\u8BB0\u672A\u6D4B\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "ML-01",
          title: "\u5206\u5757\u4E0E\u5C42\u7EA7",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "chunk_count",
          unit: "count",
          gate: {
            warn: {
              gt: 9
            }
          },
          minSamples: 1,
          requires: [
            "boxes",
            "groups"
          ],
          note: "\u53EA\u7EDF\u8BA1\u540C\u4E00\u89C6\u53E3\u5185\u7684\u4E3B\u8981\u4FE1\u606F\u5757\u3002\u8868\u683C\u884C\u3001\u5217\u8868\u9879\u3001\u56FE\u4F8B\u6761\u76EE\u7B97\u5757\u5185\u5143\u7D20\uFF0C\u4E0D\u5355\u72EC\u8BA1\u5757\u3002\u4EEA\u8868\u76D8\u548C\u76D1\u63A7\u5899\u5929\u7136\u591A\u5757\uFF0C\u6709\u58F0\u660E\u65F6\u8BB0\u4E0D\u9002\u7528\u3002\u5224\u65AD\u300C\u4E3B\u8981\u300D\u9700\u8981\u4EFB\u52A1\u76EE\u6807\uFF0C\u7F3A\u4EFB\u52A1\u4E0A\u4E0B\u6587\u65F6\u8BB0\u672A\u6D4B\u3002",
          measure: "semantic",
          threshold: "proposal",
          citation: "Miller 1956\u300AThe Magical Number Seven, Plus or Minus Two\u300B\uFF1BCowan 2001\u300AThe magical number 4 in short-term memory\u300B\uFF1BMorville & Rosenfeld \u7EC4\u7EC7\u7CFB\u7EDF",
          principle: "\u4FE1\u606F\u7EC4\u7EC7",
          violation: "\u4E00\u5C4F 11 \u4E2A\u4FE1\u606F\u5757\uFF0C\u89C6\u89C9\u6743\u91CD\u51E0\u4E4E\u76F8\u540C\uFF0C\u6807\u9898\u51FA\u73B0\u56DB\u7EA7\u3002"
        },
        {
          id: "CT-02",
          title: "\u524D\u666F\u5BF9\u6BD4\u5EA6",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "wcag_contrast",
          unit: "ratio",
          gate: {
            fail: {
              lt: 4
            },
            warn: {
              lt: 4.5
            }
          },
          minSamples: 1,
          gateLarge: {
            fail: {
              lt: 2.5
            },
            warn: {
              lt: 3
            }
          },
          requires: [
            "rendered_frame",
            "boxes"
          ],
          note: "\u5927\u5B57\u4E3A\u81F3\u5C11 18pt \u6216 14pt \u7C97\u4F53\uFF0CCJK \u7528\u7B49\u6548\u5C3A\u5BF8\u3002\u53EA\u68C0\u67E5\u9002\u7528\u7684\u6587\u5B57\u548C\u5FC5\u8981\u89C6\u89C9\u7EBF\u7D22\u3002\u6295\u653E\u80CC\u666F\u672A\u77E5\u65F6\u8BB0\u672A\u6D4B\u3002\u6587\u5B57\u548C\u56FE\u5F62\u5206\u522B\u6838\u9A8C\uFF0C\u6574\u6761\u89C4\u5219\u53D6\u6700\u5DEE\u5DF2\u786E\u8BA4\u7ED3\u679C\u3002",
          measure: "exact",
          threshold: "standard",
          citation: "WCAG 2.2 SC 1.4.3\u3001SC 1.4.11",
          principle: "\u5BF9\u6BD4",
          violation: "\u5B9E\u9645 Web \u666E\u901A\u767D\u5B57\u7F6E\u4E8E #777 \u80CC\u666F\u4E0A\uFF0C\u5BF9\u6BD4\u5EA6\u7EA6 4.48:1\u3002\u767D\u5E95\u4E0A\u7528\u4E8E\u8BC6\u522B\u8F93\u5165\u6846\u7684\u5FC5\u8981\u8FB9\u754C\u4E3A #999\uFF0C\u5BF9\u6BD4\u5EA6\u7EA6 2.85:1\u3002\u4E24\u5904\u5747\u4F4E\u4E8E\u5404\u81EA\u95E8\u69DB\u3002"
        },
        {
          id: "CORE-01",
          title: "\u989C\u8272\u975E\u552F\u4E00\u7EBF\u7D22",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "unimplemented",
          unit: "ratio",
          gate: {
            warn: {}
          },
          minSamples: 1,
          note: "\u53EA\u6D4B\u4F20\u8FBE\u4FE1\u606F\u7684\u989C\u8272\u3002\u7EAF\u88C5\u9970\u7528\u8272\u4E0D\u9002\u7528\u3002\u94FE\u63A5\u5E26\u4E0B\u5212\u7EBF\u6216\u56FE\u6807\u65F6\u5408\u89C4\u3002\u7F3A\u4EFB\u52A1\u8BED\u4E49\u3001\u65E0\u6CD5\u5224\u65AD\u989C\u8272\u662F\u5426\u627F\u8F7D\u4FE1\u606F\u65F6\u8BB0\u672A\u6D4B\u3002",
          measure: "semantic",
          threshold: "proposal",
          principle: "\u5BF9\u6BD4",
          violation: "\u5FC5\u586B\u9879\u53EA\u7528\u7EA2\u8272\u533A\u5206\uFF0C\u6CA1\u6709\u56FE\u6807\u6216\u6587\u5B57\u8BF4\u660E\uFF1B\u9519\u8BEF\u6001\u53EA\u628A\u8FB9\u6846\u53D8\u7EA2\uFF0C\u4E0D\u663E\u793A\u56FE\u6807\u548C\u539F\u56E0\u3002",
          citation: "WCAG 2.2 SC 1.4.1 Use of Color\uFF08Level A\uFF09"
        },
        {
          id: "RP-01",
          title: "\u540C\u7C7B\u7EC4\u4EF6\u4E0E\u6837\u5F0F\u4E00\u81F4\u6027",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "type_scale_levels",
          unit: "count",
          gate: {
            warn: {
              gt: 0
            }
          },
          minSamples: 3,
          requires: [
            "boxes"
          ],
          note: "\u540C\u7EC4\u6307\u540C\u89D2\u8272\u3001\u540C\u72B6\u6001\u3001\u540C\u5BB9\u5668\u5185\u81F3\u5C11 2 \u4E2A\u5B9E\u4F8B\u3002\u72B6\u6001\u5DEE\u5F02\uFF08\u60AC\u505C\u3001\u7981\u7528\u3001\u9519\u8BEF\uFF09\u548C\u5DF2\u58F0\u660E\u7684\u5408\u6CD5\u53D8\u4F53\u4E0D\u7B97\u504F\u5DEE\u3002\u8BED\u4E49\u8272\u8DE8\u4F4D\u7F6E\u6F02\u79FB\u5355\u72EC\u8BB0\u5F55\uFF1A\u540C\u4E00\u8BED\u4E49\uFF08\u6210\u529F\u3001\u8B66\u544A\u3001\u9519\u8BEF\u3001\u94FE\u63A5\uFF09\u5728\u9875\u9762\u5185\u51FA\u73B0\u4E24\u79CD\u4EE5\u4E0A\u8272\u76F8\u5373\u8BA1\u5165 N\u3002\u7F3A\u58F0\u660E\u89C4\u683C\u65F6\u53EA\u62A5\u544A\u5B9E\u6D4B\u6837\u5F0F\u5206\u5E03\uFF0C\u4E0D\u5224 WARN\u3002",
          measure: "exact",
          threshold: "proposal",
          citation: "Williams\u300A\u5199\u7ED9\u5927\u5BB6\u770B\u7684\u8BBE\u8BA1\u4E66\u300B\uFF08The Non-Designer's Design Book\uFF09 Repetition\uFF1B\u8003\u592B\u5361\u300A\u683C\u5F0F\u5854\u5FC3\u7406\u5B66\u539F\u7406\u300B\uFF08Principles of Gestalt Psychology, 1935\uFF09 \u76F8\u4F3C\u6027\u539F\u7406\uFF1B\u8BBE\u8BA1 token \u5316\uFF08Material 3\u3001Polaris\uFF09",
          principle: "\u91CD\u590D",
          violation: "\u540C\u4E00\u7EC4\u3001\u540C\u89D2\u8272\u7684\u5B9E\u4F8B\u957F\u5F97\u4E0D\u4E00\u6837\uFF0C\u8BFB\u8005\u4F1A\u4EE5\u4E3A\u5B83\u4EEC\u4E0D\u662F\u540C\u4E00\u79CD\u4E1C\u897F\u3002"
        },
        {
          id: "SP-01",
          title: "\u95F4\u8DDD\u8282\u594F\u4E00\u81F4\u6027",
          principle: "\u91CD\u590D",
          measure: "exact",
          threshold: "proposal",
          citation: "Material Design 8dp \u57FA\u7EBF\u7F51\u683C\uFF1B\u300C\u540C\u7EC4\u540C\u6863\u300D\u662F\u5728\u6B64\u4E4B\u4E0A\u7684\u63A8\u8BBA\uFF0C\u4E0D\u662F\u89C4\u8303\u6761\u6587",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "spacing_scale_levels",
          unit: "count",
          gate: {
            warn: {
              gt: 0
            }
          },
          minSamples: 5,
          requires: [
            "boxes"
          ],
          violation: "\u540C\u7EC4 5 \u884C\u5217\u8868\uFF0C\u51C0\u8DDD 16\u300124\u300116\u300132\u300116 CSS px\u3002\u4F17\u6570\u6863\u4E3A 16\uFF0C24 \u4E0E 32 \u5404\u504F\u79BB\u4E00\u6B21\uFF0CK=2\u3002\u8BB0 WARN\uFF0C\u6307\u5411\u8FD9\u4E24\u5904\u3002CV \u2248 0.",
          note: "\u540C\u7EC4\u81F3\u5C11 3 \u4E2A\u76F8\u90BB\u5BF9\uFF0C\u5143\u7D20\u4E3A\u540C\u89D2\u8272\u540C\u7EA7\uFF08\u540C tag\u3001\u540C\u5BB9\u5668\u3001\u5B57\u9AD8\u5DEE < 1.5 \u500D\uFF09\u3002\u8868\u683C\u884C\u5217\u3001\u7F51\u683C\u5E03\u5C40\u548C\u58F0\u660E\u4E3A\u4E0D\u7B49\u8DDD\u7684\u5206\u7EC4\uFF08\u65F6\u95F4\u8F74\u3001\u7011\u5E03\u6D41\uFF09\u8BB0\u4E0D\u9002\u7528\u3002\u7EC4\u95F4\u8DDD\u79BB\u4E0D\u53C2\u4E0E\u672C\u89C4\u5219\uFF0C\u5F52\u8BED\u4E49\u5206\u7EC4\u3002\u91CF\u53D6\u57FA\u51C6\uFF08\u8FB9\u754C\u6216\u4E2D\u7EBF\uFF09\u5FC5\u987B\u56FA\u5B9A\u4E00\u79CD\uFF0C\u62A5\u544A\u5199\u660E\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "TY-01",
          title: "\u6392\u7248\u6863\u4F4D\u9884\u7B97",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "family_count",
          unit: "count",
          gate: {
            warn: {
              gt: 0
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          secondary: {
            metric: "weight_count",
            gate: {
              warn: {
                gt: 4
              }
            }
          },
          note: '\u53EA\u7EDF\u8BA1\u540C\u4E00\u89C6\u53E3\u5185\u7684\u53EF\u89C1\u6587\u5B57\u3002\u5C55\u793A\u578B\u9875\u9762\u3001\u591A\u54C1\u724C\u5D4C\u5165\u548C\u4EE3\u7801\u5C55\u793A\u7C7B\u9875\u9762\u6309 Ant \u7684\u4F8B\u5916\u8BF4\u660E\u5904\u7406\u3002Ant \u7684 3\u20135 \u9488\u5BF9"\u4E00\u4E2A\u7CFB\u7EDF\u8BBE\u8BA1"\uFF0C\u672C\u89C4\u5219\u501F\u7528\u5B83\u4F5C\u5355\u9875\u7B5B\u67E5\u4E0A\u9650\uFF0C\u8D85\u51FA\u4E0D\u7B49\u4E8E\u9519\uFF0C\u53EA\u8BF4\u660E\u7CFB\u7EDF\u590D\u6742\u5EA6\u504F\u9AD8\u3002\u6863\u4F4D\u8BA1\u6570\u4E0D\u8BF4\u660E\u5C42\u7EA7\u662F\u5426\u6210\u6BD4\u4F8B\uFF1B\u6210\u6BD4\u4F8B\u4E0E\u5426\u8981\u770B\u76F8\u90BB\u6863\u4F4D\u6BD4\uFF0C\u4E0D\u5728\u672C\u89C4\u5219\u5185\u3002',
          measure: "exact",
          threshold: "convention",
          citation: "Ant Design \u5B57\u4F53\u89C4\u8303",
          principle: "\u91CD\u590D",
          violation: "\u5B57\u53F7\u6863\u6216\u5B57\u91CD\u6863\u8D85\u51FA\u9884\u7B97\uFF0C\u5C42\u7EA7\u7CFB\u7EDF\u53D8\u590D\u6742\uFF0C\u8BFB\u8005\u5206\u4E0D\u6E05\u54EA\u4E9B\u4FE1\u606F\u540C\u7EA7\u3002"
        },
        {
          id: "CL-01",
          title: "\u8272\u5F69\u9884\u7B97",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "palette_count",
          unit: "count",
          gate: {
            warn: {
              gt: 4
            }
          },
          minSamples: 1,
          requires: [
            "rendered_frame"
          ],
          secondary: {
            metric: "dominant_share",
            gate: {
              warn: {
                lt: 0.15
              }
            }
          },
          note: "\u5355\u5C4F\u6307\u4E00\u4E2A\u56FA\u5B9A\u89C6\u53E3\u3002\u72B6\u6001\u8272\uFF08\u6210\u529F\u3001\u8B66\u544A\u3001\u9519\u8BEF\uFF09\u6309\u89D2\u8272\u8BA1\uFF0C\u540C\u4E00\u89D2\u8272\u4E0D\u540C\u660E\u5EA6\u4E0D\u7B97\u65B0\u989C\u8272\u3002\u54C1\u724C\u6E10\u53D8\u6309 1 \u8272\u8BA1\u3002\u56FE\u7247\u3001\u89C6\u9891\u5185\u5BB9\u4E0D\u8BA1\u3002\u542B\u5B8C\u6574\u8BED\u4E49\u8272\u4F53\u7CFB\u7684\u754C\u9762\u901A\u5E38\u9700\u8981 5\u20137 \u8272\uFF0C4 \u662F\u57FA\u7EBF\u4E0D\u662F\u786C\u6027\u4E0A\u9650\uFF0C\u8D85\u51FA\u65F6\u5148\u786E\u8BA4\u6BCF\u4E2A\u989C\u8272\u80FD\u5426\u6620\u5C04\u5230\u58F0\u660E\u89D2\u8272\u3002\u540C\u4E00\u89D2\u8272\u5185\u90E8\u662F\u5426\u540C\u8272\u5F52\u540C\u7C7B\u7EC4\u4EF6\u89C4\u5219\uFF0C\u672C\u89C4\u5219\u53EA\u7BA1\u989C\u8272\u603B\u91CF\u4E0E\u662F\u5426\u6765\u81EA\u58F0\u660E\u8C03\u8272\u677F\u3002\u8425\u9500\u9875\u3001\u5C55\u793A\u578B\u9875\u9762\u53EF\u653E\u5BBD\u5230 7 \u8272\u5E76\u6CE8\u660E\u7406\u7531\uFF1B\u7167\u7247\u7C7B\u754C\u9762\u3001\u5730\u56FE\u548C\u56FE\u8868\u8BB0\u4E0D\u9002\u7528\u3002",
          measure: "exact",
          threshold: "proposal",
          citation: "Shneiderman\u300ADesigning the User Interface\u300B\uFF1BMaterial 3 \u989C\u8272\u89D2\u8272",
          principle: "\u91CD\u590D",
          violation: "\u5355\u5C4F 7 \u79CD\u53EF\u8FA8\u989C\u8272\uFF1A\u80CC\u666F\u3001\u6B63\u6587\u3001\u4E3B\u8272\u3001\u6B21\u8272\u3001\u4E24\u79CD\u4E0D\u540C\u8272\u76F8\u7684\u4FC3\u9500\u8272\u3001\u4E00\u4E2A\u672A\u58F0\u660E\u7684\u56FE\u6807\u8272\u3002C\u5355=7\uFF0C\u8D85\u8FC7 4\uFF1B\u540E\u4E09\u79CD\u65E0\u6CD5\u6620\u5C04\u5230\u8C03\u8272\u677F\u3002\u6570\u91CF\u4E0E\u6620\u5C04\u4E24\u9879\u5404\u8BB0\u4E00\u6B21 WA"
        },
        {
          id: "AL-01",
          title: "\u5BF9\u9F50",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "align_dev_p90",
          unit: "px@1080p",
          gate: {
            warn: {
              gt: 2
            }
          },
          minSamples: 4,
          requires: [
            "boxes",
            "groups"
          ],
          note: "\u4EC5\u6D4B\u5DF2\u58F0\u660E\u6216\u6709\u660E\u786E\u4F9D\u636E\u7684\u540C\u5C42\u7EA7\u3001\u540C\u8F74\u951A\u70B9\u7EC4\u3002\u7EC4\u6216\u8F74\u65E0\u6CD5\u786E\u8BA4\u65F6\u8BB0\u672A\u6D4B\uFF1B\u5149\u5B66\u8865\u507F\u548C\u81EA\u7531\u6784\u56FE\u53EF\u6CE8\u660E\u4F8B\u5916\u3002\u5750\u6807\u4F7F\u7528\u6295\u653E\u5750\u6807\u7CFB\u3002\u8868\u683C\u5185\u7684\u5217\u5BF9\u9F50\u5355\u72EC\u6838\u5BF9\uFF1A\u540C\u4E00\u5217\u7684\u6570\u5B57\u53F3\u5BF9\u9F50\u6216\u5C0F\u6570\u70B9\u5BF9\u9F50\uFF0C\u6587\u5B57\u5217\u5DE6\u5BF9\u9F50\uFF1B\u6DF7\u6392\u65F6\u6309\u8BE5\u5217\u591A\u6570\u503C\u7684\u5BF9\u9F50\u65B9\u5F0F\u5224\u3002",
          measure: "exact",
          threshold: "proposal",
          citation: "Williams\u300A\u5199\u7ED9\u5927\u5BB6\u770B\u7684\u8BBE\u8BA1\u4E66\u300B\uFF08The Non-Designer's Design Book\uFF09 Alignment\uFF1BM\xFCller-Brockmann\u300AGrid Systems in Graphic Design\u300B",
          principle: "\u5BF9\u9F50",
          violation: "\u9879\u76EE\u58F0\u660E\u540C\u5217\u8F93\u5165\u6846\u7684\u5DE6\u951A\u70B9\u4E3A x=24 CSS px\uFF0C\u5176\u4E2D\u4E00\u4E2A\u843D\u5728 x=28 CSS px\u3002\u5BF9\u58F0\u660E\u951A\u70B9\u7684\u504F\u5DEE\u4E3A 4 CSS px\uFF0C\u8D85\u8FC7 Web \u521D\u59CB\u9884\u8BBE 2 C",
          needsPreciseBoxes: true
        },
        {
          id: "GR-01",
          title: "\u7F51\u683C\u5BF9\u9F50",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "grid_align_share",
          unit: "ratio",
          gate: {
            warn: {
              lt: 0.8
            }
          },
          minSamples: 5,
          requires: [
            "boxes"
          ],
          note: "\u6309\u5404\u58F0\u660E\u8F74\u72EC\u7ACB\u91CF\u504F\u5DEE\uFF0C\u5143\u7D20\u5FC5\u987B\u6EE1\u8DB3\u6240\u6709\u9002\u7528\u8F74\u3002\u7F51\u683C\u5E94\u5B58\u5728\u4F46\u7F3A\u58F0\u660E\u65F6\u8BB0\u672A\u6D4B\uFF1B\u660E\u786E\u91C7\u7528\u81EA\u7531\u5E03\u5C40\u65F6\u8BB0\u4E0D\u9002\u7528\u3002",
          measure: "exact",
          threshold: "proposal",
          citation: "M\xFCller-Brockmann\u300AGrid Systems in Graphic Design\u300B\uFF1BMaterial 3 8dp",
          principle: "\u7F51\u683C",
          violation: "\u58F0\u660E\u53CC\u8F74\u5747\u987B\u843D\u5728\u539F\u70B9 (0,0)\u3001\u6B65\u957F 8px \u7684\u7F51\u683C\u4E0A\u30026 \u4E2A\u5143\u7D20\u7684\u6A2A\u5750\u6807\u5747\u5728\u683C\u4E0A\uFF0C\u7EB5\u5750\u6807\u5747\u504F 1px\u3002\u53CC\u8F74\u5BB9\u5DEE\u4E3A 0.8px\uFF0C6 \u4E2A\u5143\u7D20\u5747\u672A\u540C\u65F6\u6EE1\u8DB3\u4E24\u8F74\uFF0C\u843D",
          needsPreciseBoxes: true
        },
        {
          id: "VH-01",
          title: "\u4E3B\u6B21\u4E0E\u89C6\u89C9\u7126\u70B9",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "primary_rank",
          unit: "rank",
          gate: {
            warn: {
              gt: 1
            }
          },
          minSamples: 2,
          requires: [
            "boxes",
            "salience"
          ],
          note: "\u5B57\u53F7\u7EA7\u5DEE\u3001\u5F3A\u8C03\u6837\u5F0F\u548C\u88C5\u9970\u566A\u58F0\u5C5E\u4E8E\u8BCA\u65AD\u8BC1\u636E\u3002\u7F3A\u4EFB\u52A1\u76EE\u6807\u65F6\u8BB0\u672A\u6D4B\u3002\u9605\u8BFB\u6D41\u5355\u72EC\u6838\u5BF9\uFF1A\u91CD\u91CF\u5CF0\u503C\u662F\u5426\u843D\u5728\u6B64\u6B21\u4EFB\u52A1\u7684\u4E3B\u4FE1\u606F\u4E0A\uFF0C\u8DEF\u5F84\u662F\u5426\u88AB\u65E0\u5173\u9AD8\u5BF9\u6BD4\u5143\u7D20\u6253\u65AD\uFF1BRTL \u8BED\u8A00\u6309\u955C\u50CF\u65B9\u5411\u8BC4\u4F30\uFF0C\u81EA\u7531\u6784\u56FE\u548C\u827A\u672F\u6027\u6392\u7248\u53EF\u58F0\u660E\u4F8B\u5916\u3002",
          measure: "semantic",
          threshold: "proposal",
          citation: "Williams\u300A\u5199\u7ED9\u5927\u5BB6\u770B\u7684\u8BBE\u8BA1\u4E66\u300B\uFF08The Non-Designer's Design Book\uFF09 Contrast\uFF1BNgo \u7B49 2003 \u754C\u9762\u7F8E\u5B66\u5EA6\u91CF\uFF08Sequence\uFF09",
          principle: "\u89C6\u89C9\u5C42\u6B21",
          violation: "\u5E93\u5B58\u76D1\u63A7\u9875\u5E94\u4F18\u5148\u4F20\u8FBE\u4E25\u91CD\u544A\u8B66\u3002\u9996\u5C4F\u6700\u5927\u3001\u5BF9\u6BD4\u6700\u9AD8\u7684\u662F\u4FC3\u9500\u6A2A\u5E45\uFF0C\u544A\u8B66\u5374\u7F29\u5728\u4F4E\u663E\u8457\u6027\u7684\u89D2\u843D\u3002\u6307\u51FA\u6A2A\u5E45\u4E0E\u544A\u8B66\u4F4D\u7F6E\uFF0C\u8BF4\u660E\u4E3B\u4EFB\u52A1\u4E3A\u4F55\u88AB\u62A2\u5360\u3002"
        },
        {
          id: "SN-01",
          title: "\u4FE1\u606F\u566A\u97F3\u6BD4",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "decor_ratio",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.3
            }
          },
          minSamples: 1,
          requires: [
            "boxes",
            "roles"
          ],
          note: "\u88C5\u9970\u6307\u4E0D\u627F\u8F7D\u4FE1\u606F\u4E0E\u64CD\u4F5C\u7684\u7EAF\u89C6\u89C9\u5143\u7D20\uFF1A\u80CC\u666F\u7EB9\u7406\u3001\u88C5\u9970\u7EBF\u6761\u3001\u63D2\u753B\u3001\u6C34\u5370\u3002\u56FE\u6807\u548C\u63D2\u56FE\u82E5\u627F\u62C5\u8BC6\u522B\u6216\u5F15\u5BFC\u529F\u80FD\uFF0C\u7B97\u4FE1\u606F\u4E0D\u7B97\u88C5\u9970\u3002\u88C5\u9970\u5BC6\u5EA6\u4F4E\u7684\u6781\u7B80\u754C\u9762\u548C\u6EE1\u7248\u4FE1\u606F\u56FE\u90FD\u4E0D\u9002\u7528\u3002\u89D2\u8272\u5F52\u5C5E\u6709\u6B67\u4E49\u65F6\u8BB0\u672A\u6D4B\u3002",
          measure: "semantic",
          threshold: "proposal",
          citation: "Tufte\u300AThe Visual Display of Quantitative Information\u300B(1983) data-ink ratio\uFF1B\u4FE1\u53F7\u566A\u97F3\u6BD4\uFF08\u901A\u4FE1\u7406\u8BBA\uFF09",
          principle: "\u89C6\u89C9\u5C42\u6B21",
          violation: "\u9875\u9762\u7528\u5927\u9762\u79EF\u6E10\u53D8\u3001\u6C34\u5370\u548C\u88C5\u9970\u56FE\u6807\u94FA\u5E95\uFF0C\u4E3B\u64CD\u4F5C\u533A\u53CD\u800C\u5BF9\u6BD4\u6700\u4F4E\u3002"
        },
        {
          id: "BL-01",
          title: "\u89C6\u89C9\u91CD\u91CF\u4E0E\u7559\u767D",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "weight_delta_ratio",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.15
            }
          },
          minSamples: 1,
          requires: [
            "salience"
          ],
          note: "\u5C40\u90E8\u5BC6\u5EA6\u3001\u5BF9\u79F0\u6027\u548C\u6BD4\u4F8B\u90FD\u53EF\u4F5C\u4E3A\u8BC1\u636E\uFF0C\u6BD4\u8F83\u65F6\u56FA\u5B9A\u533A\u57DF\u548C\u53E3\u5F84\u3002\u9608\u503C\u6309\u9879\u76EE\u58F0\u660E\u3002",
          measure: "semantic",
          threshold: "proposal",
          citation: "Ngo \u7B49 2003\uFF0C14 \u9879\u754C\u9762\u7F8E\u5B66\u5EA6\u91CF\uFF08Balance\u3001Equilibrium\u3001Density\uFF09",
          principle: "\u5E73\u8861\u4E0E\u6BD4\u4F8B",
          violation: "\u4E09\u4E2A\u540C\u7528\u9014\u3001\u7B49\u9762\u79EF\u6458\u8981\u533A\u8981\u6C42\u5E03\u5C40\u5747\u8861\uFF0C\u5176\u4E2D\u4E00\u5757\u4E34\u65F6\u5806\u5165\u591A\u7EC4\u8BF4\u660E\uFF0C\u6807\u7B7E\u4E92\u76F8\u6324\u538B\u3002\u5360\u7528\u7387\u4E3A 34%\u300136%\u300168%\u3002\u7ED3\u5408\u6807\u7B7E\u95F4\u8DDD\u548C\u5185\u5BB9\u5F52\u5C5E\u786E\u8BA4\u7B2C\u4E09\u5757\u9700\u8981\u62C6\u5206\u3002"
        },
        {
          id: "QL-03",
          title: "\u5B57\u53F7\u4E0B\u9650",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "font_size_ratio_short_side",
          unit: "ratio",
          gate: {
            fail: {
              lt: 0.022
            },
            warn: {
              lt: 0.035
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          gateUI: {
            metric: "font_size_px",
            gate: {
              fail: {
                lt: 12
              },
              warn: {
                lt: 14
              }
            }
          },
          note: "\u6309\u76EE\u6807\u89C6\u53E3\u548C\u5B9E\u9645\u53D8\u6362\u91CF\u6295\u653E\u5B57\u53F7\u3002\u7F3A\u6295\u653E\u5C3A\u5BF8\u4E14\u65E0\u6CD5\u6362\u7B97 CSS px \u65F6\u8BB0\u672A\u6D4B\u3002",
          measure: "exact",
          threshold: "convention",
          citation: "Carbon Design System type sets\uFF1BAnt Design",
          principle: "\u53EF\u8BFB\u6027\u4E0E\u53EF\u8FA8\u8BC6\u6027",
          violation: "\u9879\u76EE\u91C7\u7528 12 CSS px \u6B63\u6587\u5B57\u53F7\u4E0B\u9650\uFF0CWeb \u8868\u5355\u8F85\u52A9\u8BF4\u660E\u7528 11 CSS px\u3002\u6B63\u6587 11 CSS px\u3002FAIL\uFF1A\u4F4E\u4E8E\u8BE5\u9879\u76EE\u58F0\u660E\u7684 12 CSS px",
          needsPreciseBoxes: true
        },
        {
          id: "TY-02",
          title: "\u884C\u957F",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "chars_per_line",
          unit: "chars",
          gate: {
            warn: {
              gt: 1
            }
          },
          minSamples: 1,
          requires: [
            "boxes",
            "font_metrics"
          ],
          note: "\u53EA\u6D4B\u8FDE\u7EED\u6B63\u6587\u6BB5\u843D\u3002\u6807\u9898\u3001\u6309\u94AE\u3001\u8868\u683C\u5355\u5143\u683C\u3001\u4EE3\u7801\u5757\u4E0D\u9002\u7528\u3002\u884C\u5BBD\u968F\u89C6\u53E3\u53D8\u5316\u65F6\u6309\u8BC4\u5BA1\u89C6\u53E3\u8BB0\u5F55\u5E76\u6CE8\u660E\u3002",
          measure: "exact",
          threshold: "convention",
          citation: "WCAG 2.2 SC 1.4.8 Visual Presentation\uFF08Level AAA\uFF09\uFF1BBringhurst\u300AThe Elements of Typographic Style\u300B",
          principle: "\u53EF\u8BFB\u6027\u4E0E\u53EF\u8FA8\u8BC6\u6027",
          violation: "\u6B63\u6587\u6BCF\u884C\u5B57\u6570\u8D85\u51FA\u53EF\u8BFB\u4E0A\u9650\uFF0C\u6362\u884C\u65F6\u5BB9\u6613\u4E32\u884C\u3002"
        },
        {
          id: "QL-04",
          title: "\u6B63\u6587\u6392\u7248",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "line_height_ratio",
          unit: "ratio",
          gate: {
            fail: {
              lt: 1.4
            },
            warn: {
              lt: 1.5
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          gateDisplay: {
            metric: "line_height_ratio_display",
            gate: {
              fail: {
                lt: 1.02
              },
              warn: {
                lt: 1.08
              }
            }
          },
          note: "\u6BB5\u843D\u5173\u7CFB\u5F52\u8BED\u4E49\u5206\u7EC4\uFF0C\u6587\u5B57\u662F\u5426\u8DB3\u591F\u5927\u5F52\u5B57\u53F7\u4E0B\u9650\u3002\u6BB5\u843D\u5C45\u4E2D\u3001\u5B64\u884C\u3001\u7EA4\u7EC6\u5B57\u91CD\u3001\u5B57\u8DDD\u548C\u6587\u672C\u5360\u6BD4\u53EF\u4F5C\u8BC1\u636E\u3002\u7F3A\u53EF\u8BFB\u539F\u6587\u6216\u65E0\u6CD5\u786E\u8BA4\u6B63\u6587\u89D2\u8272\u65F6\u8BB0\u672A\u6D4B\u3002",
          measure: "semantic",
          threshold: "convention",
          citation: "Bringhurst\u300AThe Elements of Typographic Style\u300B\uFF1BAnt Design \u5B57\u4F53\u89C4\u8303",
          principle: "\u53EF\u8BFB\u6027\u4E0E\u53EF\u8FA8\u8BC6\u6027",
          violation: "\u8BF4\u660E\u6B63\u6587\u6BCF\u884C 52 \u4E2A\u6C49\u5B57\uFF0C16px \u5B57\u53F7\u914D 19px \u57FA\u7EBF\u95F4\u8DDD\uFF0C\u884C\u672B\u56DE\u5230\u4E0B\u4E00\u884C\u65F6\u5BB9\u6613\u4E32\u884C\u3002\u884C\u9AD8\u6BD4\u7EA6 1.19\u3002\u68C0\u67E5\u957F\u884C\u548C\u8FC7\u8FD1\u7684\u76F8\u90BB\u57FA\u7EBF\uFF0C\u5EFA\u8BAE\u7F29\u7A84\u6B63\u6587\u5217\u5E76\u589E\u52A0\u884C",
          needsPreciseBoxes: true
        },
        {
          id: "SG-01",
          title: "\u56FE\u5F62\u548C\u6807\u7B7E\u7684\u542B\u4E49",
          principle: "\u53EF\u8BFB\u6027\u4E0E\u53EF\u8FA8\u8BC6\u6027",
          measure: "semantic",
          threshold: "proposal",
          citation: "Nielsen\u300AUsability Engineering\u300B\u53EF\u7528\u6027\u542F\u53D1\u5F0F\uFF08\u5339\u914D\u771F\u5B9E\u4E16\u754C\uFF09",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: null,
          gate: null,
          minSamples: 0,
          requires: [
            "intent"
          ],
          violation: "\u63D0\u4EA4\u5165\u53E3\u53EA\u6709\u4E00\u4E2A\u62BD\u8C61\u7B26\u53F7\uFF0C\u9644\u8FD1\u6CA1\u6709\u6587\u5B57\u3002\u6309\u4EFB\u52A1\u5B9A\u4E49\uFF0C\u8BE5\u63A7\u4EF6\u8868\u793A\u63D0\u4EA4\u7533\u8BF7\uFF0C\u7B26\u53F7\u4E5F\u53EF\u7406\u89E3\u4E3A\u4FDD\u5B58\u8349\u7A3F\u3002\u6307\u51FA\u8BE5\u56FE\u5F62\u53CA\u5176\u6240\u5728\u533A\u57DF\uFF0C\u5EFA\u8BAE\u8865\u4E0A\u660E\u786E\u6807\u7B7E\u3002",
          note: "\u53EA\u8BC4\u5BA1\u753B\u9762\u63D0\u4F9B\u7684\u8BED\u4E49\u7EBF\u7D22\u3002\u7F3A\u4EFB\u52A1\u4E0A\u4E0B\u6587\u65F6\u8BB0\u672A\u6D4B\u3002"
        },
        {
          id: "CORE-02",
          title: "\u56FE\u50CF\u6BD4\u4F8B\u5931\u771F",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "aspect_distortion",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.02
            }
          },
          minSamples: 1,
          note: "\u53EA\u6D4B\u6709\u539F\u59CB\u5C3A\u5BF8\u7684\u4F4D\u56FE\u3002SVG\u3001\u56FE\u6807\u5B57\u4F53\u3001\u6709\u610F\u88C1\u5207\uFF08object-fit: cover\uFF09\u548C\u88C5\u9970\u6027\u80CC\u666F\u4E0D\u9002\u7528\u3002\u7F3A\u539F\u56FE\u5C3A\u5BF8\u8BB0\u672A\u6D4B\u3002",
          measure: "exact",
          threshold: "proposal",
          principle: "\u53EF\u8BFB\u6027\u4E0E\u53EF\u8FA8\u8BC6\u6027",
          violation: "\u4F4D\u56FE\u88AB\u62C9\u4F38\u6216\u538B\u6241\uFF0C\u6BD4\u4F8B\u5931\u771F\uFF0C\u753B\u9762\u663E\u5F97\u4E1A\u4F59\u3002",
          citation: "\u5B9A\u4E49\u6027\uFF1A\u5BBD\u9AD8\u6BD4\u6539\u53D8\u5373\u53D8\u5F62\uFF1BAUV-Bench graphics & imagery \u7EF4\u5EA6\u8981\u6C42 appropriately proportioned"
        },
        {
          id: "QL-07",
          title: "\u8D44\u6E90\u5931\u6548",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "resource_status",
          unit: "enum",
          gate: {
            fail: {
              in: [
                404,
                "empty",
                "decode_error"
              ]
            }
          },
          minSamples: 1,
          requires: [
            "asset_scan"
          ],
          note: "\u68C0\u67E5\u5B9E\u9645\u8BF7\u6C42\u548C\u89E3\u7801\u7ED3\u679C\uFF0C\u4E0D\u53EA\u68C0\u67E5 URL \u5B57\u7B26\u4E32\u3002\u68C0\u67E5\u52A0\u8F7D\u548C\u89E3\u7801\uFF0C\u4E0D\u5E94\u53EA\u4EE5 URL \u662F\u5426\u5B58\u5728\u5224\u5B9A\u3002\u7F3A\u6240\u9700\u8BC1\u636E\u65F6\u8BB0\u672A\u6D4B\uFF1B\u786E\u8BA4\u573A\u666F\u4E0D\u9002\u7528\u65F6\u8BB0\u4E0D\u9002\u7528\u3002",
          measure: "exact",
          threshold: "standard",
          citation: "\u5B9A\u4E49\u6027\uFF1A\u8D44\u6E90\u4E0D\u53EF\u89E3\u7801\u5373\u4E0D\u5B58\u5728",
          principle: "\u4EA4\u4ED8\u68C0\u67E5",
          violation: "\u9996\u5C4F\u4EA7\u54C1\u56FE\u8BF7\u6C42\u8FD4\u56DE 404\uFF0C\u753B\u9762\u663E\u793A\u7834\u56FE\u3002\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25\u6570=1\u3002FAIL\uFF1A\u81F3\u5C11\u4E00\u4E2A\u5931\u8D25\u8D44\u6E90\u3002"
        },
        {
          id: "QL-01",
          title: "\u6587\u672C\u6EA2\u51FA",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "overflow_px_1080",
          unit: "px@1080p",
          gate: {
            fail: {
              gt: 0.5
            }
          },
          minSamples: 1,
          requires: [
            "rendered_frame",
            "boxes"
          ],
          note: "\u53EA\u6D4B\u5FC5\u987B\u5B8C\u6574\u663E\u793A\u7684\u6587\u5B57\u3002\u6709\u610F\u51FA\u8840\u3001\u5141\u8BB8\u7701\u7565\u7684\u6587\u672C\u3001\u88C5\u9970\u6027\u6587\u5B57\u4E0D\u9002\u7528\u3002\u7F3A\u6E32\u67D3\u540E\u58A8\u8FF9\u8FB9\u754C\u65F6\u8BB0\u672A\u6D4B\uFF0C\u4E0D\u80FD\u7528\u5B57\u53F7\u63A8\u7B97\u6587\u672C\u5BBD\u5EA6\u3002",
          measure: "exact",
          threshold: "convention",
          citation: "\u5B9A\u4E49\u6027\uFF1A\u6587\u5B57\u8D85\u51FA\u5141\u8BB8\u533A\u57DF\u5373\u6EA2\u51FA\uFF1B0.5 CSS px \u4E3A\u6297\u952F\u9F7F\u5BB9\u5DEE",
          principle: "\u4EA4\u4ED8\u68C0\u67E5",
          violation: "\u6309\u94AE\u5185\u300C\u63D0\u4EA4\u7533\u8BF7\u300D\u6700\u540E\u4E00\u5B57\u8D85\u51FA\u5BB9\u5668\u5185\u5BB9\u533A 3 CSS px\uFF0C\u538B\u5230\u76F8\u90BB\u56FE\u6807\u4E0A\u3002",
          needsPreciseBoxes: true,
          needsExactWidth: true
        },
        {
          id: "VS-01",
          title: "\u5FC5\u8981\u5185\u5BB9\u88C1\u5207",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "out_of_canvas_ratio",
          unit: "ratio",
          gate: {
            fail: {
              gt: 0
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          secondary: {
            metric: "out_of_safe_ratio",
            gate: {
              warn: {
                gt: 0
              }
            }
          },
          note: "\u6587\u5B57\u6309\u6E32\u67D3\u58A8\u8FF9\u68C0\u67E5\u3002\u5141\u8BB8\u7684\u7701\u7565\u53CA\u6709\u610F\u51FA\u8840\u6309\u58F0\u660E\u6392\u9664\u3002\u76EE\u6807\u753B\u677F\u3001\u5FC5\u8981\u89D2\u8272\u6216\u88C1\u5207\u8BC1\u636E\u4E0D\u660E\u65F6\u8BB0\u672A\u6D4B\u3002",
          measure: "exact",
          threshold: "standard",
          citation: "\u5B9A\u4E49\u6027\uFF1A\u5185\u5BB9\u88AB\u88C1\u5373\u4E0D\u53EF\u89C1",
          principle: "\u4EA4\u4ED8\u68C0\u67E5",
          violation: "\u7A84\u6309\u94AE\u7684\u5BB9\u5668\u88C1\u6389\u300C\u63D0\u4EA4\u7533\u8BF7\u300D\u6700\u540E\u4E00\u4E2A\u5B57\u7684\u4E00\u90E8\u5206\u3002\u6295\u653E\u5C3A\u5BF8\u4E0B\u5B9E\u9645\u88C1\u5207 3 CSS px\uFF0C\u8D85\u8FC7 0.5 px\uFF0C\u8BB0 FAIL\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "QL-02",
          title: "\u5FC5\u8981\u5185\u5BB9\u906E\u6321",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "occlusion_ratio",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.03
            }
          },
          minSamples: 1,
          requires: [
            "rendered_frame",
            "boxes"
          ],
          note: "\u8FD9\u91CC\u68C0\u67E5\u56FE\u5C42\u8986\u76D6\u9020\u6210\u7684\u5185\u5BB9\u635F\u5931\u3002\u5BB9\u5668\u6216\u753B\u677F\u88C1\u5207\u5F52\u5FC5\u8981\u5185\u5BB9\u88C1\u5207\u3002\u6709\u610F\u91CD\u53E0\u4E14\u4E0D\u635F\u5BB3\u5FC5\u8981\u4FE1\u606F\u65F6\u4E0D\u9002\u7528\u3002",
          measure: "exact",
          threshold: "proposal",
          citation: "\u5B9A\u4E49\u6027\uFF1A\u906E\u6321\u9020\u6210\u4FE1\u606F\u635F\u5931\uFF1B3% \u4E3A\u63D0\u6848\u503C",
          principle: "\u4EA4\u4ED8\u68C0\u67E5",
          violation: "\u5F39\u7A97\u7684\u5173\u95ED\u56FE\u6807\u8986\u76D6\u6807\u9898\u3002\u5BF9\u6BD4\u6709\u65E0\u8BE5\u56FE\u6807\u7684\u6E32\u67D3\u7ED3\u679C\uFF0C\u6807\u9898\u58A8\u8FF9\u88AB\u6321 8%\uFF0C\u8BB0 WARN\u3002",
          needsExactWidth: true
        }
      ],
      provenance: {
        measure: {
          exact: "\u5B9A\u4E49\u5373\u6570\u503C\uFF0C\u65E0\u53EF\u4E89\u53C2\u6570",
          model: "\u4EE3\u7406\u6A21\u578B\u7684\u8F93\u51FA\uFF0C\u4EC5\u5E8F\u5173\u7CFB\u53EF\u4FE1",
          semantic: "\u53EA\u80FD\u4EBA\u5224"
        },
        threshold: {
          standard: "\u53EF\u5F15\u7528\u89C4\u8303\uFF0C\u6539\u52A8\u9700\u6362\u5F15\u6587",
          convention: "\u884C\u4E1A\u60EF\u4F8B\uFF0C\u53EF\u8FA9\u62A4\u65E0\u5F3A\u5236\u529B",
          proposal: "\u672C\u9879\u76EE\u63D0\u6848\uFF0C\u53EA\u4FDD\u8BC1\u5185\u90E8\u4E00\u81F4"
        }
      },
      principles: {
        \u4EB2\u5BC6\u6027: "\u683C\u5F0F\u5854\xB7\u63A5\u8FD1\uFF0C\u540C\u7EC4\u8981\u8FD1\u3001\u5F02\u7EC4\u8981\u8FDC",
        \u5BF9\u6BD4: "\u8BE5\u8DF3\u51FA\u6765\u7684\u8981\u8DF3\u51FA\u6765\uFF0C\u5305\u62EC\u6587\u5B57\u4E0E\u5E95\u8272\u3001\u56FE\u5F62\u4E0E\u5E95\u8272",
        \u91CD\u590D\u4E0E\u4E00\u81F4\u6027: "\u540C\u7C7B\u4E1C\u897F\u957F\u5F97\u4E00\u6837\uFF0C\u4F53\u73B0\u4E3A\u5B57\u4F53\u65CF/\u5B57\u53F7/\u5B57\u91CD/\u95F4\u8DDD\u7684\u6863\u4F4D\u6536\u655B",
        \u5BF9\u9F50: "\u8FB9\u7F18\u843D\u5728\u540C\u4E00\u6839\u7EBF\u4E0A\uFF0C\u89C6\u7EBF\u4E0D\u7528\u91CD\u65B0\u627E\u8D77\u70B9",
        \u7F51\u683C: "\u5143\u7D20\u5171\u4EAB\u540C\u4E00\u5957\u5750\u6807\u9AA8\u67B6",
        "\u683C\u5F0F\u5854\xB7\u76F8\u4F3C": "\u5916\u89C2\u76F8\u4F3C\u5373\u540C\u7C7B",
        "\u683C\u5F0F\u5854\xB7\u95ED\u5408": "\u8FB9\u754C\u80FD\u88AB\u8865\u5168\uFF0C\u5BB9\u5668\u624D\u6210\u7ACB",
        "\u683C\u5F0F\u5854\xB7\u8FDE\u7EED": "\u89C6\u7EBF\u6CBF\u4E00\u6761\u8DEF\u5F84\u6D41\u52A8\uFF0C\u4E0D\u88AB\u6298\u65AD",
        \u5171\u540C\u533A\u57DF: "\u5171\u4EAB\u5E95\u8272/\u5BB9\u5668\u7684\u5143\u7D20\u88AB\u8BFB\u6210\u4E00\u7EC4",
        \u89C6\u89C9\u5C42\u6B21: "\u7B2C\u4E00\u773C\u843D\u5728\u6700\u91CD\u8981\u7684\u5730\u65B9\uFF0C\u4E14\u6709\u4E14\u53EA\u6709\u4E00\u4E2A\u7B2C\u4E00",
        \u8D1F\u7A7A\u95F4: "\u7559\u767D\u662F\u4E3B\u52A8\u7684\uFF0C\u4E0D\u662F\u5269\u4E0B\u7684",
        \u5E73\u8861: "\u89C6\u89C9\u91CD\u91CF\u4E0D\u5F80\u4E00\u8FB9\u5012",
        \u6BD4\u4F8B: "\u5927\u5C0F\u5173\u7CFB\u6709\u4F9D\u636E",
        \u7EDF\u4E00\u4E0E\u591A\u6837: "\u6574\u4F53\u6210\u7ACB\uFF0C\u5C40\u90E8\u6709\u53D8\u5316",
        \u4FE1\u606F\u5BC6\u5EA6: "\u5355\u4F4D\u9762\u79EF\u7684\u8BA4\u77E5\u8D1F\u8377\u53EF\u63A7",
        \u8FD0\u52A8\u4E0E\u8282\u594F: "\u52A8\u7684\u4F4D\u7F6E\u3001\u65B9\u5411\u3001\u5FEB\u6162\u6709\u7406\u7531",
        \u610F\u4E49: "\u5F62\u5F0F\u670D\u52A1\u4E8E\u529F\u80FD\uFF0C\u6CA1\u6709\u88C5\u9970\u6027\u5197\u4F59",
        \u53EF\u8BFB\u6027: "\u770B\u5F97\u6E05\u3001\u8BFB\u5F97\u5B8C\u3001\u4E0D\u4E32\u884C\uFF08\u5DE5\u7A0B\u515C\u5E95\uFF09",
        \u53EF\u7528\u6027: "\u70B9\u5F97\u5230\u3001\u6709\u53CD\u9988\u3001\u8BB0\u5F97\u4F4F\uFF08\u5DE5\u7A0B\u515C\u5E95\uFF09",
        \u4EA4\u4ED8\u5B8C\u6574\u6027: "\u8D44\u6E90\u5B8C\u597D\u3001\u6CA1\u6709\u88AB\u88C1\u3001\u6CA1\u6709\u7A7A\u5C4F\uFF08\u5DE5\u7A0B\u515C\u5E95\uFF09"
      },
      scope: {
        in: [
          "svg",
          "html",
          "png",
          "jpg",
          "design file export"
        ],
        out: [
          "video"
        ],
        note: "\u89C6\u9891\u8BC4\u5BA1\uFF08\u65F6\u5E8F/\u62BD\u5E27/\u97F3\u753B\uFF09\u6574\u5757\u505C\u7528\uFF0C\u76F8\u5173\u89C4\u5219\u6807 outOfScope\uFF0C\u4E0D\u8FDB\u5224\u5B9A\u4E5F\u4E0D\u8BA1\u5165\u8986\u76D6\u7387"
      }
    };
  }
});

// src/lib/review/rules.json
var rules_default;
var init_rules = __esm({
  "src/lib/review/rules.json"() {
    rules_default = {
      libraryVersion: 3,
      referenceCanvas: {
        width: 1920,
        height: 1080,
        note: "\u51E0\u4F55\u9608\u503C\u4E3A px@1080p\uFF0C\u5B9E\u9645\u6309 scale = min(W,H)/1080 \u7F29\u653E"
      },
      coveragePolicy: {
        rule: "\u6BCF\u6761\u5199\u4F5C\u89C4\u5219\u90FD\u5FC5\u987B\u6709\u53EF\u7B97\u6307\u6807\uFF08metric + gate\uFF09\u548C\u843D\u5730\u5B9E\u73B0\uFF1B\u6CA1\u6709 metric \u7684\u89C4\u5219\u4E0D\u7B97\u89C4\u5219",
        noMetric: "\u65E0 metric \u7684\u89C4\u5219\u53EA\u80FD\u8BB0 severity=human\uFF0C\u8FDB\u4EBA\u5BA1\u6E05\u5355\uFF0C\u4E0D\u8BA1\u5165\u901A\u8FC7\u7387",
        silent: "\u89C4\u5219\u5DF2\u5B9E\u73B0\u4F46\u672C\u6B21\u6CA1\u6709\u4EA7\u51FA\u8BB0\u5F55\u65F6\u8BB0 UNMEASURED\uFF0C\u4E0D\u5F97\u7B97 PASS\uFF1B\u62A5\u544A\u5FC5\u987B\u9010\u6761\u5217\u51FA\u72B6\u6001"
      },
      statusVocabulary: [
        "PASS",
        "WARN",
        "FAIL",
        "UNMEASURED",
        "NA",
        "DIAGNOSTIC"
      ],
      dimensions: {
        measure: "exact \u5B9A\u4E49\u5373\u6570\u503C / model \u4EE3\u7406\u6A21\u578B\uFF0C\u4EC5\u5E8F\u5173\u7CFB\u53EF\u4FE1 / semantic \u53EA\u80FD\u4EBA\u5224",
        threshold: "standard \u53EF\u5F15\u7528\u89C4\u8303\uFF0C\u6539\u52A8\u9700\u6362\u5F15\u6587 / convention \u884C\u4E1A\u60EF\u4F8B\uFF0C\u53EF\u8FA9\u62A4\u65E0\u5F3A\u5236\u529B / proposal \u672C\u9879\u76EE\u63D0\u6848\uFF0C\u6C38\u4E0D\u963B\u65AD",
        severity: "blocker \u503C\u5F97\u4FEE / warn \u53EF\u8BA8\u8BBA / info \u53C2\u8003",
        impact: "high \u9AD8\uFF08\u505A\u4E0D\u6210\uFF09/ medium \u4E2D\uFF08\u8BFB\u4E0D\u987A\uFF09/ low \u4F4E\uFF08\u4E0D\u7CBE\u81F4\uFF09\uFF1B\u53EA\u51B3\u5B9A\u6392\u5E8F\u4E0E\u5C55\u793A\u9884\u7B97\uFF0C\u4E0D\u51B3\u5B9A\u80FD\u4E0D\u80FD\u62E6",
        medium: "video / ui / print",
        status: "PASS/WARN/FAIL \u662F\u95F8\u95E8\u7ED3\u8BBA\uFF1BDIAGNOSTIC \u662F\u8BCA\u65AD\u8F93\u51FA\uFF0C\u4E0D\u53C2\u4E0E\u5224\u5B9A"
      },
      impactPolicy: {
        axis: "\u5F71\u54CD\u7A0B\u5EA6\uFF1A\u9AD8=\u505A\u4E0D\u6210 / \u4E2D=\u8BFB\u4E0D\u987A / \u4F4E=\u4E0D\u7CBE\u81F4\uFF1B\u4E0E\u95F8\u95E8\u6743\u9650\uFF08\u80FD\u4E0D\u80FD\u62E6\uFF09\u3001\u5A92\u4ECB\uFF08video/ui/print\uFF09\u76F8\u4E92\u72EC\u7ACB",
        labels: {
          high: "\u9AD8",
          medium: "\u4E2D",
          low: "\u4F4E"
        },
        byPrinciple: {
          \u53EF\u8BFB\u6027: "high",
          \u53EF\u7528\u6027: "high",
          \u4EA4\u4ED8\u5B8C\u6574\u6027: "high",
          \u5BF9\u6BD4: "high",
          \u4EB2\u5BC6\u6027: "medium",
          \u89C6\u89C9\u5C42\u6B21: "medium",
          \u5BF9\u9F50: "medium",
          \u7F51\u683C: "medium",
          "\u683C\u5F0F\u5854\xB7\u76F8\u4F3C": "medium",
          "\u683C\u5F0F\u5854\xB7\u95ED\u5408": "medium",
          "\u683C\u5F0F\u5854\xB7\u8FDE\u7EED": "medium",
          \u5171\u540C\u533A\u57DF: "medium",
          \u8D1F\u7A7A\u95F4: "medium",
          \u91CD\u590D\u4E0E\u4E00\u81F4\u6027: "medium",
          \u4FE1\u606F\u5BC6\u5EA6: "medium",
          \u8FD0\u52A8\u4E0E\u8282\u594F: "medium",
          \u7EDF\u4E00\u4E0E\u591A\u6837: "low",
          \u5E73\u8861: "low",
          \u6BD4\u4F8B: "low",
          \u610F\u4E49: "low"
        },
        override: {
          "SN-01": "low",
          "OR-01": "low",
          "PN-01": "low",
          "NS-02": "low",
          "TY-07": "medium",
          "TY-08": "medium"
        },
        fallback: "medium",
        order: [
          "high",
          "medium",
          "low"
        ],
        budget: {
          high: null,
          medium: 5,
          low: 0,
          elementsPerCard: 5,
          note: "\u9AD8\u5F71\u54CD\u4E0D\u6298\u53E0\uFF08\u4E00\u6761\u95EE\u9898\u90FD\u4E0D\u8BE5\u88AB\u85CF\uFF09\uFF1B\u4E2D\u5F71\u54CD\u6309\u89C4\u5219\u805A\u5408\u6210\u4E00\u5F20\u5361\uFF0C\u8D85\u8FC7 5 \u7C7B\u6298\u6210\u4E00\u884C\uFF1B\u4F4E\u5F71\u54CD\u53EA\u7ED9\u6761\u6570\u4E0E\u89C4\u5219 ID"
        },
        note: "\u5F71\u54CD\u7A0B\u5EA6\u53EA\u505A\u6392\u5E8F\u4E0E\u5C55\u793A\u9884\u7B97\uFF0C\u4E0D\u6539\u53D8 PASS/WARN/FAIL\uFF1A\u9AD8\u5F71\u54CD\u4E0D\u7B49\u4E8E\u80FD\u62E6\uFF0C\u4F4E\u5F71\u54CD\u4E5F\u4E0D\u7B49\u4E8E\u53EF\u5FFD\u7565\u3002\u5B8C\u6574\u8BB0\u5F55\u4ECD\u5728 findings[]\uFF0C\u6298\u53E0\u53EA\u53D1\u751F\u5728 view \u91CC"
      },
      rules: [
        {
          id: "QL-01",
          title: "\u6587\u672C\u6EA2\u51FA",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "overflow_px_1080",
          unit: "px@1080p",
          gate: {
            fail: {
              gt: 0.5
            }
          },
          minSamples: 1,
          requires: [
            "rendered_frame",
            "boxes"
          ],
          note: "\u6587\u5B57 ink \u6846\u8D85\u51FA\u5BB9\u5668\u6216\u753B\u5E03\uFF1B\u5FC5\u987B\u5728\u6E32\u67D3\u540E\u6D4B\uFF0Cfont-size \u5C5E\u6027\u4E0D\u80FD\u63A8\u5BFC\u6587\u672C\u5BBD\u5EA6",
          measure: "exact",
          threshold: "convention",
          citation: "\u6EA2\u51FA\u4E3A\u51E0\u4F55\u4E8B\u5B9E\uFF1B0.5px \u662F\u6297\u952F\u9F7F\u5BB9\u5DEE\uFF0C\u5C5E\u5DE5\u827A\u60EF\u4F8B",
          principle: "\u53EF\u8BFB\u6027",
          violation: "\u6587\u5B57\u8D85\u51FA\u5BB9\u5668\uFF0C\u8FB9\u7F18\u88AB\u5207\u65AD\uFF0C\u5F97\u8DF3\u8BFB\u624D\u80FD\u8865\u5168\u3002",
          needsPreciseBoxes: true,
          needsExactWidth: true
        },
        {
          id: "QL-02",
          title: "\u6587\u672C\u906E\u6321",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "occlusion_ratio",
          unit: "ratio",
          gate: {
            fail: {
              gt: 0.03
            },
            warn: {
              gt: 0.01
            }
          },
          minSamples: 1,
          requires: [
            "rendered_frame",
            "boxes"
          ],
          note: "\u6587\u672C\u88AB\u66F4\u9AD8 z \u4E14\u4E0D\u900F\u660E\uFF08opacity>=0.5\uFF09\u7684\u5143\u7D20\u8986\u76D6\u9762\u79EF\u5360\u6BD4\uFF1Bbbox \u76F8\u4EA4\u53EA\u7B97 WARN\uFF0C\u50CF\u7D20\u786E\u8BA4\u540E\u624D\u5347 FAIL",
          measure: "exact",
          threshold: "proposal",
          citation: "3%/1% \u4E3A\u63D0\u6848\uFF1B\u4E14 bbox \u76F8\u4EA4\u9700\u50CF\u7D20\u786E\u8BA4",
          principle: "\u53EF\u8BFB\u6027",
          violation: "\u6587\u5B57\u88AB\u538B\u4F4F\u4E00\u7247\u9762\u79EF\uFF0C\u7B14\u753B\u7F3A\u5931\uFF0C\u8BFB\u8D77\u6765\u8981\u731C\u3002",
          needsExactWidth: true
        },
        {
          id: "QL-03",
          title: "\u5B57\u53F7\u4E0B\u9650",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "font_size_ratio_short_side",
          unit: "ratio",
          gate: {
            fail: {
              lt: 0.022
            },
            warn: {
              lt: 0.035
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          gateUI: {
            metric: "font_size_px",
            gate: {
              fail: {
                lt: 12
              },
              warn: {
                lt: 14
              }
            }
          },
          note: "\u77ED\u8FB9\u767E\u5206\u6BD4\uFF081080 \u77ED\u8FB9 \u2192 pass 38px\uFF09\u662F\u5206\u8FA8\u7387\u65E0\u5173\u53E3\u5F84\uFF1B\u58F0\u660E --display-width \u65F6\u6539\u7528 gateUI \u7684 px \u53E3\u5F84\uFF0C\u6309\u6295\u653E\u5BBD\u5EA6\u6298\u7B97\uFF1A\u6709\u6548\u5B57\u53F7 = \u58F0\u660E\u5B57\u53F7 \xD7 \u6295\u653E\u5BBD\u5EA6 / \u753B\u5E03\u5BBD\u3002\u540C\u4E00\u5F20 1600 \u5BBD\u7684\u56FE\u6309 375 \u548C 800 \u6295\u653E\u4F1A\u5F97\u51FA\u4E0D\u540C\u7ED3\u8BBA\uFF0C\u62A5\u544A\u5FC5\u987B\u5199\u6E05\u7528\u4E86\u54EA\u4E2A\u5BBD\u5EA6",
          measure: "exact",
          threshold: "convention",
          citation: "\u951A\u70B9\u6765\u81EA WCAG \u5927\u5B57 24px\uFF0C\u6362\u7B97\u6210\u77ED\u8FB9\u6BD4\u4F8B\u662F\u60EF\u4F8B",
          principle: "\u53EF\u8BFB\u6027",
          violation: "\u6B63\u6587\u5B57\u53F7\u5728\u76EE\u6807\u5C3A\u5BF8\u4E0A\u6389\u5230\u770B\u4E0D\u6E05\uFF0C\u89C2\u4F17\u76F4\u63A5\u8DF3\u8FC7\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "QL-04",
          title: "\u884C\u9AD8",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "line_height_ratio",
          unit: "ratio",
          gate: {
            fail: {
              lt: 1.4
            },
            warn: {
              lt: 1.5
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          gateDisplay: {
            metric: "line_height_ratio_display",
            gate: {
              fail: {
                lt: 1.02
              },
              warn: {
                lt: 1.08
              }
            }
          },
          note: "line-height / font-size\u3002\u6B63\u6587\uFF08< 1.8\xD7 \u4E2D\u4F4D\u5B57\u53F7\uFF09\u6309 1.4/1.5\uFF1B\u5C55\u793A\u7EA7\u6807\u9898\u7684\u884C\u9AD8\u968F\u5B57\u53F7\u6536\u7F29\uFF0C56/64=1.14 \u662F\u6B63\u5E38\u6392\u7248\uFF0C\u5FC5\u987B\u8D70 gateDisplay \u7684 1.02/1.08\uFF0C\u5426\u5219\u4F1A\u628A\u5927\u6807\u9898\u5168\u5224\u6210\u8FC7\u7D27",
          measure: "exact",
          threshold: "convention",
          citation: "\u6392\u7248\u5DE5\u827A\uFF1A\u6B63\u6587\u884C\u9AD8 1.4\u20131.8\uFF1B\u5C55\u793A\u7EA7 1.02\u20131.2\uFF0C\u65E0\u5F3A\u5236\u89C4\u8303",
          principle: "\u53EF\u8BFB\u6027",
          violation: "\u4E2D\u6587\u884C\u9AD8\u8FC7\u7D27\uFF0C\u4E0A\u4E0B\u8D34\u5728\u4E00\u8D77\uFF0C\u626B\u8BFB\u4F1A\u4E32\u884C\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "QL-07",
          title: "\u8D44\u6E90\u5931\u6548",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "resource_status",
          unit: "enum",
          gate: {
            fail: {
              in: [
                404,
                "empty",
                "decode_error"
              ]
            }
          },
          minSamples: 1,
          requires: [
            "asset_scan"
          ],
          note: "href 404\u3001\u7A7A\u6587\u4EF6\u3001\u89E3\u7801\u5931\u8D25\uFF1B\u5B57\u4F53\u7F3A\u5931\u5355\u72EC\u8BB0 UNMEASURED \u800C\u4E0D\u662F PASS",
          measure: "exact",
          threshold: "standard",
          citation: "\u5B9A\u4E49\u6027\uFF1A\u8D44\u6E90\u4E0D\u53EF\u89E3\u7801\u5373\u4E0D\u5B58\u5728\uFF1B\u65E0\u9608\u503C\u53EF\u4E89",
          principle: "\u4EA4\u4ED8\u5B8C\u6574\u6027",
          violation: "\u8D44\u6E90 404 \u6216\u7A7A\u6587\u4EF6\uFF0C\u8FD9\u4E00\u5757\u5728\u6210\u7247\u91CC\u662F\u7A7A\u767D\u3002"
        },
        {
          id: "VS-01",
          title: "\u51FA\u753B / \u5B89\u5168\u533A",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "out_of_canvas_ratio",
          unit: "ratio",
          gate: {
            fail: {
              gt: 0
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          secondary: {
            metric: "out_of_safe_ratio",
            gate: {
              warn: {
                gt: 0
              }
            }
          },
          note: "\u88AB\u753B\u5E03\u88C1\u5207 \u2192 FAIL\uFF1B\u51FA\u5B89\u5168\u533A\uFF08\u9ED8\u8BA4\u5404\u8FB9 5% \u8F74\u957F\uFF0C\u5E73\u53F0\u5DF2\u77E5\u5219\u7528\u5E73\u53F0\u503C\uFF09\u2192 WARN\u3002\u5408\u5E76\u539F QL-06 \uFF5C \u51FA\u753B\u5224\u5B9A\u5E26 0.5px@1080p \u6297\u952F\u9F7F\u5BB9\u5DEE\uFF1A\u8D34\u8FB9 bbox \u7684\u6D6E\u70B9\u6B8B\u5DEE\u4E0D\u5F97\u5224 FAIL\uFF08\u66FE\u56E0\u6B64\u8BEF\u62A5 5 \u6761\uFF09\u3002\u6587\u5B57\u5BBD\u5EA6\u4E3A\u4F30\u8BA1\u503C\u65F6\uFF0C\u51FA\u753B\u5224\u5B9A\u53EA\u7ED9 WARN",
          measure: "exact",
          threshold: "standard",
          citation: "\u753B\u5E03\u5916\u5185\u5BB9\u4E0D\u53EF\u89C1\uFF08\u5B9A\u4E49\u6027\uFF09\uFF1B\u5B89\u5168\u533A 5% \u672C\u8EAB\u662F\u63D0\u6848\uFF0C\u53EA\u5224 WARN",
          principle: "\u4EA4\u4ED8\u5B8C\u6574\u6027",
          violation: "\u5143\u7D20\u88AB\u753B\u5E03\u88C1\u6389\u4E00\u90E8\u5206\uFF0C\u5E73\u53F0\u7AEF\u8FD8\u4F1A\u518D\u88C1\u4E00\u6B21\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "CT-02",
          title: "\u6587\u672C\u5BF9\u6BD4\u5EA6",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "wcag_contrast",
          unit: "ratio",
          gate: {
            fail: {
              lt: 4
            },
            warn: {
              lt: 4.5
            }
          },
          minSamples: 1,
          gateLarge: {
            fail: {
              lt: 2.5
            },
            warn: {
              lt: 3
            }
          },
          requires: [
            "rendered_frame",
            "boxes"
          ],
          note: "WCAG 2.2 \xA71.4.3\uFF1B\u5927\u5B57\u5B9A\u4E49\uFF1Aui \u7528 CSS px>=24\uFF08\u58F0\u660E --display-width \u65F6\u6309\u6295\u653E\u5BBD\u5EA6\u6298\u7B97\uFF09\uFF0C\u4F4D\u56FE/\u5370\u5237\u7528\u300E\u76F8\u5BF9\u6B63\u6587 >=1.8x \u4E2D\u4F4D\u6570\u300F\u3002\u5FC5\u987B\u5728\u6210\u7247\u4E0A\u6D4B\uFF0C\u5C5E\u6027\u8272\u4E0D\u80FD\u4EE3\u8868\u5C4F\u5E55\u8272\u3002\u53D6\u6837\u5148\u8150\u8680 1px \u53BB\u6389\u6297\u952F\u9F7F\u8FB9\u7F18\uFF0C\u518D\u53D6\u8FDC\u5C3E\u4E2D\u4F4D\u8272\uFF1B\u5426\u5219\u7EC6\u5B57\u4F1A\u88AB\u8FB9\u7F18\u50CF\u7D20\u62C9\u6210\u4E2D\u95F4\u7070\uFF0C13.4:1 \u62A5\u6210 3.2:1",
          measure: "exact",
          threshold: "standard",
          citation: "WCAG 2.2 \xA71.4.3 AA\uFF1A4.5:1\uFF0C\u5927\u5B57 3:1",
          principle: "\u5BF9\u6BD4",
          violation: "\u6587\u5B57\u4E0E\u5E95\u8272\u592A\u63A5\u8FD1\uFF0C\u5C0F\u5B57\u5728\u538B\u7F29\u540E\u57FA\u672C\u6D88\u5931\u3002"
        },
        {
          id: "DE-01",
          title: "\u6B7B\u5143\u7D20",
          severity: "blocker",
          medium: [
            "ui",
            "print"
          ],
          metric: "visible_frame_count",
          unit: "frames",
          gate: {
            fail: {
              lte: 0
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          note: "\u58F0\u660E\u5B58\u5728\u4F46\u5168\u7A0B\u4E0D\u53EF\u89C1/\u9762\u79EF 0/\u5B8C\u5168\u4E0D\u900F\u660E 0\u3002\u6CE8\u610F\u5165\u573A\u524D\u4E0D\u53EF\u89C1\u662F\u5408\u6CD5\u7684\uFF0C\u5224\u7684\u662F\u5168\u7A0B",
          measure: "exact",
          threshold: "standard",
          citation: "\u5B9A\u4E49\u6027\uFF1A\u5168\u7A0B\u96F6\u53EF\u89C1 = \u96F6\u4FE1\u606F",
          principle: "\u610F\u4E49",
          violation: "\u5143\u7D20\u58F0\u660E\u4E86\u5374\u5168\u7A0B\u4E0D\u53EF\u89C1\uFF0C\u5360\u4F4D\u4E0D\u51FA\u5185\u5BB9\u3002"
        },
        {
          id: "TM-01",
          title: "\u9605\u8BFB\u901F\u5EA6",
          severity: "blocker",
          medium: [
            "ui"
          ],
          metric: "cps",
          unit: "chars/s",
          gate: {
            fail: {
              gt: 9
            },
            warn: {
              gt: 7
            }
          },
          minSamples: 1,
          requires: [
            "timeline",
            "text_segments"
          ],
          gateLatin: {
            fail: {
              gt: 20
            },
            warn: {
              gt: 17
            }
          },
          note: "\u4E2D\u6587 5-7 \u5B57/\u79D2\u8212\u9002\u30019 \u4E3A\u4E0A\u9650\uFF1B\u897F\u6587 17-20\u3002\u6709\u65C1\u767D\u65F6\u53D6 max(\u9605\u8BFB, \u65C1\u767D) \u540E\u518D\u5224\uFF0C\u5141\u8BB8 +1 \u5BB9\u5DEE \uFF5C \u5F53\u524D scope=static\uFF0C\u672C\u6761\u505C\u7528",
          measure: "exact",
          threshold: "convention",
          citation: "\u5B57\u5E55\u5B9E\u8DF5 5\u20139 \u5B57/\u79D2\uFF1B\u65E0\u5F3A\u5236\u6807\u51C6\uFF0C\u4E2A\u4F53\u5DEE\u5F02\u5927",
          principle: "\u53EF\u8BFB\u6027",
          violation: "\u5B57\u6570\u8D85\u51FA\u505C\u7559\u65F6\u957F\uFF0C\u89C2\u4F17\u8BFB\u4E0D\u5B8C\u5C31\u88AB\u5207\u8D70\u3002",
          outOfScope: "video"
        },
        {
          id: "TM-04",
          title: "\u7269\u7406\u8D77\u70B9",
          severity: "blocker",
          medium: [
            "ui"
          ],
          metric: "start_scale",
          unit: "ratio",
          gate: {
            fail: {
              lte: 0.02
            }
          },
          minSamples: 1,
          requires: [
            "timeline"
          ],
          note: "\u7981\u6B62\u4ECE scale(0) \u8D77\uFF1B\u5EFA\u8BAE 0.9-0.97 + opacity\u3002transform-origin \u987B\u5728\u951A\u70B9\uFF08\u6309\u94AE/\u5361\u7247\u8FB9\u7F18\uFF09",
          measure: "exact",
          threshold: "convention",
          citation: "\u52A8\u6548\u5DE5\u827A\uFF1A\u7981 scale(0) \u662F\u901A\u884C\u505A\u6CD5",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u4ECE scale(0) \u8D77\uFF0C\u7269\u4F53\u51ED\u7A7A\u51FA\u73B0\uFF0C\u7269\u7406\u4E0A\u4E0D\u6210\u7ACB\u3002"
        },
        {
          id: "TM-10",
          title: "\u7A7A\u767D\u5E27",
          severity: "blocker",
          medium: [
            "ui"
          ],
          metric: "blank_frame_ratio",
          unit: "ratio",
          gate: {
            fail: {
              gt: 0.1
            },
            warn: {
              gt: 0.05
            }
          },
          minSamples: 1,
          requires: [
            "frames_sampled"
          ],
          note: "\u7A7A\u767D = \u58A8\u91CF < 0.5% \u4E14\u65E0\u6587\u672C\uFF1B\u6709\u610F\u7559\u767D\u53EA\u5141\u8BB8\u51FA\u73B0\u5728\u8F6C\u573A\u4E0E\u505C\u987F\uFF0C\u9700\u5728\u62A5\u544A\u91CC\u7ED9\u7406\u7531 \uFF5C \u5F53\u524D scope=static\uFF0C\u672C\u6761\u505C\u7528",
          measure: "exact",
          threshold: "proposal",
          citation: "10%/5% \u4E3A\u63D0\u6848\uFF1B\u5224\u7684\u662F\u300E\u65E0\u5185\u5BB9\u300F\u4E0D\u662F\u300E\u7559\u767D\u300F",
          principle: "\u4EA4\u4ED8\u5B8C\u6574\u6027",
          violation: "\u5927\u9762\u79EF\u6CA1\u6709\u5185\u5BB9\u7684\u5E27\uFF0C\u89C2\u4F17\u5728\u770B\u7A7A\u5C4F\u3002",
          outOfScope: "video"
        },
        {
          id: "FT-01",
          title: "\u89E6\u63A7\u76EE\u6807",
          severity: "blocker",
          medium: [
            "ui"
          ],
          metric: "target_size_px",
          unit: "px",
          gate: {
            fail: {
              lt: 44
            },
            warn: {
              lt: 48
            }
          },
          minSamples: 1,
          requires: [
            "interaction_map"
          ],
          note: "iOS HIG 44x44pt\u3001Material 48x48dp\u3002\u89C6\u9891\u5A92\u4ECB\u4E0D\u9002\u7528\uFF0Cmedium \u8FC7\u6EE4\u540E\u81EA\u52A8 NA",
          measure: "exact",
          threshold: "standard",
          citation: "Apple HIG 44\xD744pt\uFF1BMaterial 48\xD748dp",
          principle: "\u53EF\u7528\u6027",
          violation: "\u70B9\u51FB\u533A\u592A\u5C0F\uFF0C\u624B\u6307\u6309\u4E0D\u51C6\uFF0C\u8BEF\u89E6\u7387\u4E0A\u5347\u3002"
        },
        {
          id: "PE-01",
          title: "\u5371\u9669\u64CD\u4F5C\u9632\u62A4",
          severity: "blocker",
          medium: [
            "ui"
          ],
          metric: "guard_present",
          unit: "bool",
          gate: {
            fail: {
              eq: false
            }
          },
          minSamples: 1,
          requires: [
            "interaction_map"
          ],
          note: "\u5220\u9664/\u8986\u76D6/\u4ED8\u8D39\u7B49\u4E0D\u53EF\u9006\u64CD\u4F5C\u9700\u4E8C\u6B21\u786E\u8BA4\u6216\u9ED8\u8BA4\u7981\u7528",
          measure: "exact",
          threshold: "convention",
          citation: "\u9632\u9519\u662F\u901A\u884C\u542F\u53D1\u5F0F\uFF0C\u975E\u89C4\u8303\u6761\u6587",
          principle: "\u53EF\u7528\u6027",
          violation: "\u5371\u9669\u64CD\u4F5C\u6CA1\u6709\u786E\u8BA4\u6216\u9ED8\u8BA4\u7981\u7528\uFF0C\u8BEF\u89E6\u5373\u4E0D\u53EF\u9006\u3002"
        },
        {
          id: "SV-01",
          title: "\u72B6\u6001\u53CD\u9988",
          severity: "blocker",
          medium: [
            "ui"
          ],
          metric: "feedback_latency_ms",
          unit: "ms",
          gate: {
            fail: {
              gt: 100
            }
          },
          minSamples: 1,
          requires: [
            "interaction_map"
          ],
          note: "100ms \u5185\u51FA\u73B0\u53CD\u9988\u5143\u7D20\uFF1B\u8D85\u8FC7 1s \u9700 loading \u6001\u3002\u6162\u63A5\u53E3\u4E0D\u7B97\u8FDD\u89C4\uFF0C\u65E0\u53CD\u9988\u624D\u7B97",
          measure: "exact",
          threshold: "standard",
          citation: "Nielsen \u54CD\u5E94\u65F6\u95F4\u4E0A\u9650 0.1s",
          principle: "\u53EF\u7528\u6027",
          violation: "\u64CD\u4F5C\u540E\u6CA1\u6709\u5373\u65F6\u53CD\u9988\uFF0C\u7528\u6237\u4F1A\u91CD\u590D\u70B9\u3002"
        },
        {
          id: "AL-01",
          title: "\u5BF9\u9F50",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "align_dev_p90",
          unit: "px@1080p",
          gate: {
            warn: {
              gt: 6
            }
          },
          minSamples: 4,
          requires: [
            "boxes",
            "groups"
          ],
          note: "\u7EC4\u5185\u5DE6/\u4E2D/\u57FA\u7EBF\u805A\u7C7B\u7684\u7A33\u5065\u504F\u5DEE\uFF08p90\uFF09\uFF0C\u4E0D\u7528 std\uFF08\u5355\u4E2A\u79BB\u7FA4\u503C\u5C31\u5931\u6548\uFF09\u3002\u6837\u672C <4 \u8BB0 UNMEASURED",
          measure: "exact",
          threshold: "proposal",
          citation: "6px/2px \u4E0E p90 \u53E3\u5F84\u5747\u4E3A\u63D0\u6848",
          principle: "\u5BF9\u9F50",
          violation: "\u540C\u7EC4\u5143\u7D20\u8FB9\u7F18\u4E0D\u5728\u4E00\u6761\u7EBF\u4E0A\uFF0C\u89C6\u7EBF\u6BCF\u884C\u90FD\u8981\u91CD\u627E\u8D77\u70B9\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "AL-02",
          title: "\u89C4\u5219\u7EBF\u5B9A\u4F4D",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "rule_line_gap_delta_px",
          unit: "px@1080p",
          gate: {
            warn: {
              gt: 8
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          secondary: {
            metric: "rule_line_offset_spread",
            gate: {
              warn: {
                gt: 8
              }
            }
          },
          note: "\u5206\u9694\u7EBF\uFF08\u7EC6\u957F\u6A2A/\u7AD6\u7EBF\uFF09\u4E0A\u4E0B\u7559\u767D\u4E4B\u5DEE\uFF0C\u5168\u56FE\u53D6\u6700\u5927\u8005\uFF1B\u540C\u7C7B\u7EBF\u4E4B\u95F4\u7684\u4E0A\u7559\u767D\u6781\u5DEE >8px \u53E6\u62A5\u4E00\u6761\u3002\u5B9E\u6D4B\u9876\u90E8\u7EBF 31.6/72.4\u3001\u4E2D\u95F4\u7EBF 59.6/60.4\uFF0C\u6B64\u524D\u6CA1\u6709\u4EFB\u4F55\u89C4\u5219\u7BA1\u8FD9\u4E2A",
          measure: "exact",
          threshold: "proposal",
          citation: "8px \u4E3A\u63D0\u6848\uFF1A\u89C4\u5219\u7EBF\u5E94\u89C6\u89C9\u5C45\u4E2D\uFF0C\u5149\u5B66\u504F\u79FB\u5BB9\u5FCD 1\u20132px\uFF0C8px \u5DF2\u662F\u4E00\u8D34\u4E00\u6D6E",
          principle: "\u5BF9\u9F50",
          violation: "\u5206\u9694\u7EBF\u4E00\u4FA7\u8D34\u4F4F\u5185\u5BB9\u3001\u53E6\u4E00\u4FA7\u60AC\u7A7A\uFF0C\u8BFB\u8005\u4F1A\u628A\u7EBF\u8BFB\u6210\u4E0A\u9762\u5185\u5BB9\u7684\u5E95\u8FB9\u6216\u4E0B\u9762\u5185\u5BB9\u7684\u4E0B\u5212\u7EBF\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "PR-01",
          title: "\u4EB2\u5BC6\u6027",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "gap_ratio",
          unit: "ratio",
          gate: {
            warn: {
              lt: 1.2
            }
          },
          minSamples: 3,
          requires: [
            "boxes"
          ],
          note: "\u65E7\u7684\u805A\u7C7B\u53E3\u5F84\uFF1A\u6700\u8FD1\u90BB\u95F4\u8DDD\u4E00\u7EF4\u805A\u7C7B\u51FA\u4E24\u7C07\uFF0C\u6BD4 = \u7C07\u95F4 / \u7C07\u5185\u3002\u5DF2\u7531 GR-02 \u53D6\u4EE3\uFF0C\u672C\u7248\u4E0D\u518D\u5355\u72EC\u5224\u5B9A\uFF0C\u4FDD\u7559 ID \u4F9B\u65E7\u62A5\u544A\u6BD4\u5BF9\u2014\u2014\u805A\u7C7B\u5728 1.2 \u9644\u8FD1\u5206\u4E0D\u5F00\uFF0C\u6B63\u662F\u300C\u8DD1\u4E0D\u51FA\u6765\u4E5F\u4E0D\u62A5\u300D\u7684\u6765\u6E90",
          supersededBy: "GR-02",
          measure: "model",
          threshold: "proposal",
          citation: "1.2/1.5 \u4E3A\u63D0\u6848\uFF1B\u5206\u7EC4\u4F9D\u8D56\u805A\u7C7B\u6A21\u578B",
          principle: "\u4EB2\u5BC6\u6027",
          violation: "\u7EC4\u95F4\u95F4\u8DDD\u4E0D\u5927\u4E8E\u7EC4\u5185\u95F4\u8DDD\uFF0C\u4E24\u5757\u5185\u5BB9\u88AB\u8BFB\u6210\u4E00\u7EC4\u3002"
        },
        {
          id: "GR-02",
          title: "\u5206\u7EC4\u95F4\u8DDD\u6BD4",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "group_gap_ratio",
          unit: "ratio",
          gate: {
            warn: {
              lt: 1.8
            }
          },
          minSamples: 3,
          requires: [
            "boxes",
            "groups"
          ],
          note: "\u7EC4\u95F4\u7F1D / \u7EC4\u5185\u95F4\u8DDD\uFF1B\u7EC4\u95F4\u53D6\u6700\u7A84\u7684\u4E00\u6761\u7F1D\uFF08\u6700\u5F31\u5904\u51B3\u5B9A\u5206\u7EC4\uFF09\u3002\u5206\u7EC4\u6765\u81EA <g>/group/container\uFF1B\u7F3A\u5206\u7EC4\u58F0\u660E\u65F6\u8BB0 UNMEASURED\uFF0C\u4E0D\u9000\u56DE\u805A\u7C7B\uFF08\u805A\u7C7B\u5728 1.2 \u9644\u8FD1\u5206\u4E0D\u5F00\uFF09\u3002\u5B9E\u6D4B 0.77\u30011.23 \u7C98\u8FDE\uFF0C2.78 \u5206\u5F00\uFF0C1.8 \u662F\u5206\u754C",
          measure: "exact",
          threshold: "proposal",
          citation: "\u300E\u7EC4\u95F4\u660E\u663E\u5927\u4E8E\u7EC4\u5185\u300F\u662F\u683C\u5F0F\u5854\u63A5\u8FD1\u6027\u7684\u901A\u884C\u505A\u6CD5\uFF1B1.8 \u662F\u672C\u5E93\u5728\u771F\u5B9E\u6837\u672C\u4E0A\u6821\u51C6\u7684\u63D0\u6848\u503C\uFF0C\u4E0D\u662F\u89C4\u8303\u6570\u5B57",
          principle: "\u4EB2\u5BC6\u6027",
          violation: "\u7EC4\u95F4\u7F1D\u4E0D\u6BD4\u7EC4\u5185\u95F4\u8DDD\u5BBD\uFF0C\u4E24\u5757\u5185\u5BB9\u88AB\u8BFB\u6210\u4E00\u7EC4\uFF0C\u5206\u7EC4\u53EA\u80FD\u9760\u731C\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "GR-01",
          title: "\u7F51\u683C",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "grid_align_share",
          unit: "ratio",
          gate: {
            warn: {
              lt: 0.8
            }
          },
          minSamples: 5,
          requires: [
            "boxes"
          ],
          note: "\u5148\u4ECE\u5750\u6807 GCD/\u4E00\u7EF4\u805A\u7C7B\u63A8\u65AD\u7F51\u683C\uFF0C\u518D\u6D4B\u504F\u5DEE\uFF1B\u5BB9\u5DEE 0.5 \u4E2A\u7F51\u683C\u5355\u5143\uFF0C\u4E0D\u5199\u6B7B 1px",
          measure: "exact",
          threshold: "proposal",
          citation: "\u5BB9\u5DEE 0.5 \u5355\u5143\u4E3A\u63D0\u6848\uFF1B\u7F51\u683C\u9700\u5148\u63A8\u65AD",
          principle: "\u7F51\u683C",
          violation: "\u5143\u7D20\u4E0D\u5728\u540C\u4E00\u4E2A\u9AA8\u67B6\u91CC\uFF0C\u7248\u9762\u50CF\u968F\u624B\u6446\u7684\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "NS-02",
          title: "\u5185\u8FB9\u8DDD",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "padding_cv",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.35
            }
          },
          minSamples: 4,
          requires: [
            "boxes"
          ],
          note: "\u56DB\u8FB9 CV\uFF1B\u5149\u5B66\u5BF9\u9F50\uFF08\u5DE6\u8FB9\u9F50\u6587\u5B57\u3001\u53F3\u8FB9\u7559\u547C\u5438\uFF09\u662F\u5408\u6CD5\u4F8B\u5916\uFF0C\u6240\u4EE5\u53EA\u80FD WARN\uFF0C\u4E0D\u80FD\u963B\u65AD",
          measure: "exact",
          threshold: "proposal",
          citation: "CV 0.35 \u4E3A\u63D0\u6848\uFF0C\u5149\u5B66\u5BF9\u9F50\u662F\u5408\u6CD5\u4F8B\u5916",
          principle: "\u8D1F\u7A7A\u95F4",
          violation: "\u56DB\u8FB9\u5185\u8FB9\u8DDD\u5DEE\u5F97\u79BB\u8C31\uFF0C\u89C6\u89C9\u91CD\u5FC3\u6B6A\u5411\u4E00\u8FB9\u3002",
          needsPreciseBoxes: true
        },
        {
          id: "CT-01",
          title: "\u5C42\u7EA7\u843D\u5DEE",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "size_ratio_rank1_rank2",
          unit: "ratio",
          gate: {
            warn: {
              lt: 1.2
            }
          },
          minSamples: 2,
          requires: [
            "boxes",
            "roles"
          ],
          secondary: {
            metric: "size_ratio_rank1_body",
            gate: {
              warn: {
                lt: 1.5
              }
            }
          },
          note: "\u53EA\u7EA6\u675F\u9996\u4E24\u6863\u4E0E\u6700\u5927\u6863\u5BF9\u6B63\u6587\u4E24\u7AEF\uFF0C\u4E0D\u8981\u6C42\u6BCF\u5BF9\u76F8\u90BB\u6863\u90FD >=1.25\uFF08\u5426\u5219\u5B57\u53F7\u901A\u80C0\uFF09",
          measure: "exact",
          threshold: "proposal",
          citation: "1.2/1.5 \u4E3A\u63D0\u6848\uFF0C\u53EA\u7EA6\u675F\u4E24\u7AEF",
          principle: "\u89C6\u89C9\u5C42\u6B21",
          violation: "\u6807\u9898\u4E0E\u6B63\u6587\u51E0\u4E4E\u540C\u53F7\uFF0C\u4E3B\u6B21\u8BFB\u4E0D\u51FA\u6765\u3002"
        },
        {
          id: "VH-01",
          title: "\u5C42\u6B21\u6392\u540D",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "primary_rank",
          unit: "rank",
          gate: {
            warn: {
              gt: 1
            }
          },
          minSamples: 2,
          requires: [
            "boxes",
            "salience"
          ],
          note: "salience \u662F\u4EE3\u7406\u91CF\uFF08\u9762\u79EF^0.5 x \u5BF9\u6BD4\u5DEE x \u4F4D\u7F6E\u5148\u9A8C\uFF09\uFF0C\u53EA\u63D0\u793A\u4E0D\u963B\u65AD",
          measure: "model",
          threshold: "proposal",
          citation: "\u663E\u8457\u6027\u4E3A\u4EE3\u7406\u6A21\u578B\uFF0C\u53C2\u6570\u672A\u9A8C\u8BC1",
          principle: "\u89C6\u89C9\u5C42\u6B21",
          violation: "\u7B2C\u4E00\u773C\u843D\u5728\u88C5\u9970\u4E0A\uFF0C\u4E3B\u4FE1\u606F\u6392\u5728\u540E\u9762\u3002"
        },
        {
          id: "VH-02",
          title: "\u7126\u70B9\u552F\u4E00",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "high_salience_count",
          unit: "count",
          gate: {
            warn: {
              gt: 2
            }
          },
          minSamples: 1,
          requires: [
            "salience"
          ],
          note: "\u9996\u5C4F\u9AD8\u663E\u8457\u5143\u7D20 <=2",
          measure: "model",
          threshold: "proposal",
          citation: "\u9AD8\u663E\u8457 \u22642 \u4E3A\u63D0\u6848",
          principle: "\u89C6\u89C9\u5C42\u6B21",
          violation: "\u51E0\u4E2A\u5143\u7D20\u4E00\u6837\u62A2\u773C\uFF0C\u7B49\u4E8E\u6CA1\u6709\u91CD\u70B9\u3002"
        },
        {
          id: "BL-01",
          title: "\u5E73\u8861",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "weight_delta_ratio",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.15
            }
          },
          minSamples: 1,
          requires: [
            "salience"
          ],
          note: "\u5DE6\u53F3/\u4E0A\u4E0B\u89C6\u89C9\u91CD\u91CF\u77E9\u5DEE / \u603B\u91CD\uFF1B\u4EE3\u7406\u91CF",
          measure: "model",
          threshold: "proposal",
          citation: "0.15 \u4E3A\u63D0\u6848\uFF1B\u89C6\u89C9\u91CD\u91CF\u662F\u4EE3\u7406\u91CF",
          principle: "\u5E73\u8861",
          violation: "\u4E00\u4FA7\u89C6\u89C9\u91CD\u91CF\u660E\u663E\u504F\u5927\uFF0C\u753B\u9762\u91CD\u5FC3\u4E00\u76F4\u5F80\u90A3\u8FB9\u6ED1\u3002"
        },
        {
          id: "BL-02",
          title: "\u5BF9\u79F0",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "mirror_diff",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.03
            }
          },
          minSamples: 1,
          requires: [
            "rendered_frame"
          ],
          note: "\u4EC5\u5728\u610F\u56FE\u58F0\u660E\u4E3A\u5BF9\u79F0\u6784\u56FE\u65F6\u542F\u7528\uFF0C\u5426\u5219 NA",
          measure: "model",
          threshold: "proposal",
          citation: "0.03 \u4E3A\u63D0\u6848\uFF1B\u4EC5\u5728\u58F0\u660E\u5BF9\u79F0\u65F6\u542F\u7528",
          principle: "\u5E73\u8861",
          violation: "\u58F0\u79F0\u5BF9\u79F0\u4F46\u955C\u50CF\u6709\u504F\u5DEE\uFF0C\u770B\u8D77\u6765\u50CF\u6CA1\u5BF9\u9F50\u3002"
        },
        {
          id: "PS-01",
          title: "\u6BD4\u4F8B",
          severity: "info",
          medium: [
            "ui",
            "print"
          ],
          metric: "size_ratio_primary_secondary",
          unit: "ratio",
          gate: {
            warn: {
              lt: 1.5,
              gt: 3
            }
          },
          minSamples: 2,
          requires: [
            "boxes",
            "roles"
          ],
          note: "\u4E3B/\u6B21\u5C3A\u5BF8\u6BD4\u843D\u5728 1.5-3.0 \u4E4B\u5916\u53EA\u8BB0 info",
          measure: "exact",
          threshold: "proposal",
          citation: "1.5\u20133.0 \u4E3A\u63D0\u6848",
          principle: "\u6BD4\u4F8B",
          violation: "\u4E3B\u6B21\u5C3A\u5BF8\u5173\u7CFB\u5931\u8861\uFF0C\u5927\u5C0F\u5DEE\u5F97\u6CA1\u6709\u9053\u7406\u3002"
        },
        {
          id: "NS-01",
          title: "\u8D1F\u7A7A\u95F4",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "whitespace_ratio",
          unit: "ratio",
          gate: {
            warn: {
              lt: 0.3
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          note: "\u7559\u767D\u7387 = \u80CC\u666F\u8272\u50CF\u7D20\u5360\u6BD4\uFF08\u53D6\u81EA\u56DB\u8FB9\u73AF\u5E26\u7684\u4F17\u6570\u8272\uFF09\uFF0C\u4E0D\u662F\u300E1 \u2212 \u4E3B\u8272\u5360\u6BD4\u300F\u2014\u2014\u540E\u8005\u4F1A\u628A 93.9% \u7684\u7559\u767D\u7B97\u6210 6.1%\uFF0C\u628A\u6EE1\u7248\u5224\u6210\u5360\u6EE1\u3001\u628A\u7559\u767D\u5224\u6210\u6324\u3002\u6EE1\u7248\u4FE1\u606F\u56FE\u4E0D\u9002\u7528\uFF0C\u8BB0 NA",
          measure: "exact",
          threshold: "proposal",
          citation: "0.30 \u4E3A\u63D0\u6848\uFF0C\u6EE1\u7248\u4FE1\u606F\u56FE\u4E0D\u9002\u7528\uFF1B\u53E3\u5F84\u662F\u80CC\u666F\u5360\u6BD4\uFF0C\u4E0D\u662F\u4E3B\u8272\u5360\u6BD4",
          principle: "\u8D1F\u7A7A\u95F4",
          violation: "\u5185\u5BB9\u5360\u6EE1\u753B\u9762\uFF0C\u6CA1\u6709\u843D\u70B9\uFF0C\u6574\u4F53\u53D1\u95F7\u3002"
        },
        {
          id: "RP-01",
          title: "\u91CD\u590D\u4E00\u81F4\u6027",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "type_scale_levels",
          unit: "count",
          gate: {
            warn: {
              gt: 5
            }
          },
          minSamples: 3,
          requires: [
            "boxes"
          ],
          note: "\u5B57\u53F7\u6863\u4F4D\u6570\uFF1B\u4E0D\u7528 CV\uFF082 \u6863\u503C\u7684 CV \u662F\u566A\u58F0\uFF09",
          measure: "exact",
          threshold: "proposal",
          citation: "Web \u6392\u7248\u5B9E\u8DF5\uFF1A\u4E00\u4E2A\u754C\u9762 4\u20138 \u6863\u5B57\u53F7\uFF1BMaterial \u7528\u56FA\u5B9A type scale \u7EA6\u675F",
          principle: "\u91CD\u590D\u4E0E\u4E00\u81F4\u6027",
          violation: "\u5B57\u53F7\u5206\u4E86\u592A\u591A\u6863\uFF0C\u5206\u4E0D\u6E05\u54EA\u51E0\u6863\u662F\u540C\u4E00\u5C42\u3002"
        },
        {
          id: "TY-01",
          title: "\u5B57\u4F53\u7CFB\u7EDF",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "family_count",
          unit: "count",
          gate: {
            warn: {
              gt: 3
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          secondary: {
            metric: "weight_count",
            gate: {
              warn: {
                gt: 4
              }
            }
          },
          note: "\u5B57\u4F53\u65CF \u22643\u3001\u5B57\u91CD\u6863\u4F4D \u22644\uFF1B\u54C1\u724C\u89C4\u8303\u6709\u4F8B\u5916\u65F6\u5728\u62A5\u544A\u6CE8\u660E",
          measure: "exact",
          threshold: "convention",
          citation: "Apple HIG\uFF1A\u5C3D\u91CF\u51CF\u5C11\u5B57\u6837\u6570\u91CF\uFF1BWeb \u6392\u7248\u5B9E\u8DF5 \u22642\u20133 \u4E2A\u5B57\u4F53\u65CF",
          principle: "\u7EDF\u4E00\u4E0E\u591A\u6837",
          violation: "\u5B57\u4F53\u65CF\u6216\u5B57\u91CD\u592A\u591A\uFF0C\u50CF\u51E0\u4E2A\u9879\u76EE\u62FC\u8D77\u6765\u7684\u3002"
        },
        {
          id: "TY-02",
          title: "\u884C\u957F",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "chars_per_line",
          unit: "chars",
          gate: {
            warn: {
              gt: 45
            }
          },
          minSamples: 1,
          requires: [
            "boxes",
            "font_metrics"
          ],
          note: "\u4E2D\u6587 25-45 \u5B57/\u884C\uFF1B\u897F\u6587 65ch\u3002\u9700\u5B57\u4F53\u5EA6\u91CF\uFF0C\u7F3A\u5219 UNMEASURED",
          measure: "exact",
          threshold: "convention",
          citation: "\u884C\u957F\u60EF\u4F8B\uFF1A\u897F\u6587 65ch \u4E0A\u9650",
          principle: "\u53EF\u8BFB\u6027",
          violation: "\u6BCF\u884C\u5B57\u592A\u591A\uFF0C\u6362\u884C\u65F6\u5BB9\u6613\u4E32\u884C\u3002"
        },
        {
          id: "OR-01",
          title: "\u5B64\u884C",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "last_line_chars",
          unit: "chars",
          gate: {
            warn: {
              lte: 1
            }
          },
          minSamples: 1,
          requires: [
            "boxes",
            "line_breaks"
          ],
          note: "\u6BB5\u843D\u884C\u6570 >=3 \u4E14\u672B\u884C <=1 \u5B57",
          measure: "exact",
          threshold: "convention",
          citation: "\u6392\u7248\u5DE5\u827A\uFF1A\u5B64\u5B57\u89C4\u907F",
          principle: "\u53EF\u8BFB\u6027",
          violation: "\u6BB5\u843D\u672B\u884C\u53EA\u5269\u4E00\u4E2A\u5B57\uFF0C\u5B64\u96F6\u96F6\u6302\u5728\u4E0B\u9762\u3002"
        },
        {
          id: "CL-01",
          title: "\u8C03\u8272\u677F",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "palette_count",
          unit: "count",
          gate: {
            warn: {
              gt: 6
            }
          },
          minSamples: 1,
          requires: [
            "rendered_frame"
          ],
          secondary: {
            metric: "dominant_share",
            gate: {
              warn: {
                lt: 0.15
              }
            }
          },
          note: "\u9762\u79EF >0.5% \u7684\u4E3B\u8272\u79CD\u7C7B\uFF1B\u6700\u5927\u5360\u6BD4 <0.15 \u89C6\u4E3A\u65E0\u4E3B\u8272",
          measure: "exact",
          threshold: "proposal",
          citation: "\u4E3B\u8272 \u22646\u3001\u5360\u6BD4 \u22650.15 \u5747\u4E3A\u63D0\u6848",
          principle: "\u7EDF\u4E00\u4E0E\u591A\u6837",
          violation: "\u4E3B\u8272\u592A\u591A\u4E92\u76F8\u6253\u67B6\uFF0C\u6216\u6CA1\u6709\u4E3B\u8272\uFF0C\u6574\u4F53\u53D1\u82B1\u3002"
        },
        {
          id: "SN-01",
          title: "\u4FE1\u53F7\u566A\u97F3\u6BD4",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "decor_ratio",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.3
            }
          },
          minSamples: 1,
          requires: [
            "boxes",
            "roles"
          ],
          note: "\u4F9D\u8D56\u89D2\u8272\u6807\u6CE8\uFF0C\u6807\u6CE8\u7F3A\u5931\u65F6 UNMEASURED",
          measure: "model",
          threshold: "proposal",
          citation: "0.3 \u4E3A\u63D0\u6848\uFF1B\u4F9D\u8D56\u89D2\u8272\u6807\u6CE8",
          principle: "\u4FE1\u606F\u5BC6\u5EA6",
          violation: "\u88C5\u9970\u5360\u6BD4\u8FC7\u9AD8\uFF0C\u4FE1\u606F\u88AB\u566A\u97F3\u7A00\u91CA\u3002"
        },
        {
          id: "ML-01",
          title: "\u5206\u5757\u6570",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "chunk_count",
          unit: "count",
          gate: {
            warn: {
              gt: 9
            }
          },
          minSamples: 1,
          requires: [
            "boxes",
            "groups"
          ],
          note: "\u7ECF\u9A8C\u503C\uFF0C\u4E0D\u662F\u7C73\u52D2\u5B9A\u5F8B\uFF08\u539F\u6587 7\xB12 \u8BB2\u7684\u662F\u7EDD\u5BF9\u5224\u65AD\u8DE8\u5EA6\uFF09",
          measure: "model",
          threshold: "proposal",
          citation: "9 \u5757\u4E3A\u63D0\u6848\uFF1B\u5206\u7EC4\u672C\u8EAB\u4F9D\u8D56\u6A21\u578B",
          principle: "\u4FE1\u606F\u5BC6\u5EA6",
          violation: "\u4E00\u5C4F\u4FE1\u606F\u5757\u592A\u591A\uFF0C\u8BB0\u4E0D\u4F4F\u4E5F\u626B\u4E0D\u5B8C\u3002"
        },
        {
          id: "HK-01",
          title: "\u4E00\u7EA7\u9009\u9879\u6570",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "top_option_count",
          unit: "count",
          gate: {
            warn: {
              gt: 7
            }
          },
          minSamples: 1,
          requires: [
            "interaction_map"
          ],
          note: "\u5E0C\u514B\u5B9A\u5F8B\u662F\u51B3\u7B56\u65F6\u95F4\u7EA6 log2(n+1)\uFF0C<=7 \u662F\u8BBE\u8BA1\u7ECF\u9A8C\u503C",
          measure: "model",
          threshold: "proposal",
          citation: "7 \u4E3A\u63D0\u6848\uFF1B\u5E0C\u514B\u5B9A\u5F8B\u8BB2\u7684\u662F\u51B3\u7B56\u65F6\u95F4",
          principle: "\u4FE1\u606F\u5BC6\u5EA6",
          violation: "\u4E00\u7EA7\u9009\u9879\u8FC7\u591A\uFF0C\u9009\u4E4B\u524D\u5148\u5F97\u9010\u4E2A\u8BFB\u5B8C\u3002"
        },
        {
          id: "PN-01",
          title: "\u6392\u7248\u89C4\u8303",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "punct_violations",
          unit: "count",
          gate: {
            warn: {
              gt: 0
            }
          },
          minSamples: 1,
          requires: [
            "text_content"
          ],
          note: "\u4E2D\u6587\u53E5\u5185\u534A\u89D2\u6807\u70B9\uFF1B\u4E2D\u82F1\u6587\u4E4B\u95F4\u65E0\u95F4\u8DDD\u53EA\u8BB0 info",
          measure: "exact",
          threshold: "standard",
          citation: "GB/T 15834 \u6807\u70B9\u7B26\u53F7\u7528\u6CD5",
          principle: "\u53EF\u8BFB\u6027",
          violation: "\u4E2D\u6587\u91CC\u6DF7\u7740\u534A\u89D2\u6807\u70B9\uFF0C\u9605\u8BFB\u8282\u594F\u88AB\u78D5\u65AD\u3002"
        },
        {
          id: "SC-01",
          title: "\u5B57\u5E55\u89C4\u683C",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "caption_lines",
          unit: "lines",
          gate: {
            warn: {
              gt: 2
            }
          },
          minSamples: 1,
          requires: [
            "text_content",
            "boxes"
          ],
          secondary: {
            metric: "caption_chars_per_line",
            gate: {
              warn: {
                gt: 16
              }
            }
          },
          note: "\u7AD6\u5C4F 12-16 \u5B57/\u884C\uFF0C\u6A2A\u5C4F\u53EF\u5230 20\uFF1B\u8D85\u8FC7 2 \u884C\u9700\u62C6\u6BB5 \uFF5C \u5F53\u524D scope=static\uFF0C\u672C\u6761\u505C\u7528",
          measure: "exact",
          threshold: "convention",
          citation: "\u5B57\u5E55\u89C4\u683C\u60EF\u4F8B\uFF1A\u22642 \u884C",
          principle: "\u53EF\u8BFB\u6027",
          violation: "\u5B57\u5E55\u884C\u6570/\u5B57\u6570\u8D85\u9650\uFF0C\u5C4F\u5E55\u4E0B\u65B9\u88AB\u5B57\u5360\u6EE1\u3002",
          outOfScope: "video"
        },
        {
          id: "TM-02",
          title: "\u52A8\u753B\u65F6\u957F",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "duration_ms",
          unit: "ms",
          gate: {
            warn: {
              lt: 120,
              gt: 1500
            }
          },
          minSamples: 1,
          requires: [
            "timeline"
          ],
          note: "\u5165\u573A 200-800ms \u4E3A\u5E38\u6001\uFF1B>1.5s \u9700\u660E\u786E\u53D9\u4E8B\u7406\u7531",
          measure: "exact",
          threshold: "convention",
          citation: "\u52A8\u6548\u5DE5\u827A\uFF1A\u5165\u573A 200\u2013800ms \u4E3A\u5E38\u6001",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u5355\u4E2A\u52A8\u4F5C\u592A\u957F\u6216\u592A\u77ED\uFF0C\u89C2\u4F17\u5728\u7B49\u4E00\u4E2A\u5DF2\u7ECF\u770B\u61C2\u7684\u53D8\u5316\u3002"
        },
        {
          id: "TM-03",
          title: "\u7F13\u52A8",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "easing_class",
          unit: "enum",
          gate: {
            warn: {
              in: [
                "linear"
              ]
            }
          },
          minSamples: 1,
          requires: [
            "timeline"
          ],
          note: "\u5165\u573A\u7528 ease-out\uFF1B\u5300\u901F\u5165\u573A = WARN\u3002\u9000\u573A\u5300\u901F\u53EF\u63A5\u53D7",
          measure: "exact",
          threshold: "convention",
          citation: "\u52A8\u6548\u5DE5\u827A\uFF1A\u5165\u573A\u7528 ease-out \u662F\u901A\u884C\u505A\u6CD5",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u5300\u901F\u8D77\u505C\uFF0C\u52A8\u4F5C\u50CF\u673A\u5668\u5728\u52A8\uFF0C\u6CA1\u6709\u91CD\u91CF\u3002"
        },
        {
          id: "TM-05",
          title: "\u5E03\u5C40\u5C5E\u6027\u52A8\u753B",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "animated_layout_props",
          unit: "count",
          gate: {
            warn: {
              gt: 0
            }
          },
          minSamples: 1,
          requires: [
            "timeline"
          ],
          note: "\u52A8 width/height/x/y \u5728\u5B9E\u65F6\u5408\u6210\u91CC\u6389\u5E27\uFF1B\u79BB\u7EBF\u6E32\u67D3\u7BA1\u7EBF\u4E0D\u9002\u7528\uFF0Cmedium \u8FC7\u6EE4\u540E NA",
          measure: "exact",
          threshold: "convention",
          citation: "\u6027\u80FD\u60EF\u4F8B\uFF1B\u4EC5\u5BF9\u5B9E\u65F6\u5408\u6210\u6210\u7ACB",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u6539\u5E03\u5C40\u5C5E\u6027\u505A\u52A8\u753B\uFF0C\u5B9E\u65F6\u5408\u6210\u65F6\u4F1A\u6389\u5E27\u3002"
        },
        {
          id: "TM-07",
          title: "\u8282\u594F\u4E00\u81F4\u6027",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "duration_cv",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.3
            }
          },
          minSamples: 3,
          requires: [
            "timeline"
          ],
          note: "\u540C\u7C7B\u52A8\u753B\u65F6\u957F\u5206\u6563\u5EA6\uFF1B\u6837\u672C <3 \u8BB0 UNMEASURED",
          measure: "exact",
          threshold: "proposal",
          citation: "CV 0.3 \u4E3A\u63D0\u6848",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u540C\u7C7B\u52A8\u753B\u65F6\u957F\u5404\u4E0D\u76F8\u540C\uFF0C\u8282\u594F\u662F\u6563\u7684\u3002"
        },
        {
          id: "TM-08",
          title: "\u540C\u6B65\u6027",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "begin_offset_ms",
          unit: "ms",
          gate: {
            warn: {
              gt: 16
            }
          },
          minSamples: 2,
          requires: [
            "timeline"
          ],
          note: "\u534F\u540C\u52A8\u753B\u504F\u5DEE <=1 \u5E27(16ms)\uFF1B\u663E\u5F0F\u9519\u5CF0\uFF08>=3 \u4E2A\u4E0D\u540C\u504F\u79FB\uFF09\u89C6\u4E3A\u6709\u610F\uFF0C\u8BB0 PASS",
          measure: "exact",
          threshold: "convention",
          citation: "1 \u5E27=16.7ms \u662F\u7B97\u672F\uFF0C\u4F46\u300E\u5FC5\u987B\u540C\u6B65\u300F\u672C\u8EAB\u662F\u60EF\u4F8B",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u8BE5\u540C\u65F6\u53D1\u751F\u7684\u53D8\u5316\u6709\u504F\u79FB\uFF0C\u770B\u8D77\u6765\u50CF\u4E00\u4E2A\u5361\u4F4F\u4E86\u3002"
        },
        {
          id: "TM-09",
          title: "\u5BC6\u5EA6\u66F2\u7EBF",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "density_peak_ratio",
          unit: "ratio",
          gate: {
            warn: {
              gt: 2
            }
          },
          minSamples: 1,
          requires: [
            "timeline"
          ],
          note: "\u6BCF\u79D2\u5143\u7D20/\u5B57\u7B26\u91CF\u7684\u5CF0\u503C\u4E0D\u8D85\u5747\u503C 2 \u500D\uFF1B\u8FDE\u7EED\u65E0\u53D8\u5316 >3s \u5355\u72EC\u62A5 \uFF5C \u5F53\u524D scope=static\uFF0C\u672C\u6761\u505C\u7528",
          measure: "model",
          threshold: "proposal",
          citation: "\u5CF0\u503C 2 \u500D\u4E3A\u63D0\u6848\uFF1B\u5BC6\u5EA6\u662F\u4EE3\u7406\u91CF",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u67D0\u4E00\u79D2\u585E\u8FDB\u51E0\u500D\u5185\u5BB9\uFF0C\u53E6\u4E00\u6BB5\u957F\u65F6\u95F4\u4E0D\u52A8\u3002",
          outOfScope: "video"
        },
        {
          id: "KF-01",
          title: "\u5173\u952E\u5E27\u5BC6\u5EA6",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "keys_per_second",
          unit: "count",
          gate: {
            warn: {
              gt: 8
            }
          },
          minSamples: 1,
          requires: [
            "timeline"
          ],
          note: "\u6BCF\u5C5E\u6027\u6BCF\u79D2\u5173\u952E\u5E27\u6570\uFF1B\u8FC7\u5BC6=\u52A8\u4F5C\u7CCA\uFF0C\u4E14\u96BE\u4EE5\u7EF4\u62A4",
          measure: "exact",
          threshold: "proposal",
          citation: "8 keys/s \u4E3A\u63D0\u6848",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u5173\u952E\u5E27\u8FC7\u5BC6\uFF0C\u52A8\u4F5C\u7CCA\u6210\u4E00\u56E2\uFF0C\u4E5F\u6539\u4E0D\u52A8\u3002"
        },
        {
          id: "MZ-01",
          title: "\u7F13\u52A8\u4E00\u81F4\u6027",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "easing_families_per_element",
          unit: "count",
          gate: {
            warn: {
              gt: 1
            }
          },
          minSamples: 1,
          requires: [
            "timeline"
          ],
          note: "\u540C\u4E00\u5143\u7D20\u591A\u5C5E\u6027\u540C\u65F6\u52A8\u5374\u7528\u4E0D\u540C\u7F13\u52A8\u65CF\uFF0C\u4F1A\u4EA7\u751F\u62C9\u626F\u611F",
          measure: "exact",
          threshold: "proposal",
          citation: "\u300E\u540C\u5143\u7D20\u591A\u7F13\u52A8=\u62C9\u626F\u300F\u662F\u63A8\u6D4B",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u540C\u4E00\u5143\u7D20\u591A\u4E2A\u5C5E\u6027\u7528\u4E86\u4E0D\u540C\u7F13\u52A8\uFF0C\u52A8\u4F5C\u88AB\u62C9\u626F\u3002"
        },
        {
          id: "JIT-01",
          title: "\u4E9A\u50CF\u7D20\u6296\u52A8",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "jitter_px",
          unit: "px",
          gate: {
            warn: {
              lt: 1.5,
              gt: 0.3
            }
          },
          minSamples: 3,
          requires: [
            "timeline"
          ],
          note: "\u975E\u610F\u56FE\u4F4D\u79FB 0.3-1.5px \u7684\u5E27\u95F4\u6296\u52A8\uFF1B\u6A21\u677F\u6E32\u67D3\u5E38\u89C1",
          measure: "exact",
          threshold: "proposal",
          citation: "0.3\u20131.5px \u6296\u52A8\u5E26\u4E3A\u63D0\u6848",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u9759\u6B62\u5143\u7D20\u5728\u4E9A\u50CF\u7D20\u95F4\u6296\uFF0C\u753B\u9762\u4E00\u76F4\u5728\u98A4\u3002"
        },
        {
          id: "TS-01",
          title: "\u8F6C\u573A\u65F6\u957F",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "transition_ms",
          unit: "ms",
          gate: {
            warn: {
              gt: 1200
            }
          },
          minSamples: 1,
          requires: [
            "timeline"
          ],
          note: "150-600ms \u4E3A\u5E38\u6001\uFF1B>1.2s \u62D6\u8282\u594F\uFF0C\u786C\u5207\u4E0D\u8BBE\u4E0B\u9650 \uFF5C \u5F53\u524D scope=static\uFF0C\u672C\u6761\u505C\u7528",
          measure: "exact",
          threshold: "convention",
          citation: "\u8F6C\u573A\u65F6\u957F\u60EF\u4F8B 150\u2013600ms",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u8F6C\u573A\u8FC7\u957F\uFF0C\u8282\u594F\u88AB\u62D6\u4F4F\u3002",
          outOfScope: "video"
        },
        {
          id: "EF-01",
          title: "\u672B\u5E27\u53EF\u8BFB",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "tail_motion_ms",
          unit: "ms",
          gate: {
            warn: {
              gt: 300
            }
          },
          minSamples: 1,
          requires: [
            "timeline",
            "frames_sampled"
          ],
          note: "\u6700\u540E 300ms \u5185\u6587\u5B57\u4ECD\u5728\u52A8\uFF0C\u89C2\u611F\u50CF\u6CA1\u64AD\u5B8C \uFF5C \u5F53\u524D scope=static\uFF0C\u672C\u6761\u505C\u7528",
          measure: "exact",
          threshold: "proposal",
          citation: "300ms \u5C3E\u6BB5\u4E3A\u63D0\u6848",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u6700\u540E\u4E00\u523B\u8FD8\u5728\u52A8\uFF0C\u89C2\u611F\u50CF\u6CA1\u64AD\u5B8C\u3002",
          outOfScope: "video"
        },
        {
          id: "ASR-01",
          title: "\u97F3\u753B\u5BF9\u9F50",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "text_vs_vo_offset_ms",
          unit: "ms",
          gate: {
            warn: {
              gt: 400
            }
          },
          minSamples: 1,
          requires: [
            "asr",
            "timeline"
          ],
          note: "\u6587\u5B57\u51FA\u73B0\u65F6\u523B\u4E0E\u65C1\u767D\u5BF9\u5E94\u8BCD\u65F6\u95F4\u5DEE\uFF1B\u65E0 ASR \u65F6 UNMEASURED \uFF5C \u5F53\u524D scope=static\uFF0C\u672C\u6761\u505C\u7528",
          measure: "exact",
          threshold: "convention",
          citation: "\u97F3\u753B\u540C\u6B65\u5BB9\u5DEE\u60EF\u4F8B\uFF0C400ms \u4E3A\u5BBD\u677E\u6863",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u6587\u5B57\u4E0E\u65C1\u767D\u4E0D\u540C\u6B65\uFF0C\u50CF\u5BF9\u4E0D\u4E0A\u53E3\u578B\u3002",
          outOfScope: "video"
        },
        {
          id: "CT-03",
          title: "\u56FE\u5F62\u5BF9\u6BD4",
          severity: "warn",
          medium: [
            "ui"
          ],
          metric: "wcag_contrast_nontext",
          unit: "ratio",
          gate: {
            warn: {
              lt: 3
            }
          },
          minSamples: 1,
          requires: [
            "rendered_frame"
          ],
          note: "WCAG 2.2 \xA71.4.11 \u975E\u6587\u672C\u5BF9\u6BD4 3:1\uFF1B\u56FE\u6807\u3001\u8FB9\u6846\u3001\u56FE\u8868\u5143\u7D20",
          measure: "exact",
          threshold: "standard",
          citation: "WCAG 2.2 \xA71.4.11\uFF1A\u975E\u6587\u672C\u5BF9\u6BD4 3:1",
          principle: "\u5BF9\u6BD4",
          violation: "\u56FE\u6807/\u8FB9\u6846\u4E0E\u5E95\u8272\u592A\u63A5\u8FD1\uFF0C\u5F62\u72B6\u7CCA\u5728\u80CC\u666F\u91CC\u3002"
        },
        {
          id: "TM-06",
          title: "\u8BED\u4E49\u65B9\u5411",
          severity: "human",
          medium: [
            "ui"
          ],
          metric: null,
          gate: null,
          minSamples: 0,
          requires: [
            "timeline",
            "script"
          ],
          note: "\u4F4D\u79FB\u65B9\u5411\u4E0E\u56E0\u679C/\u6D41\u7A0B/\u65F6\u95F4\u987A\u5E8F\u662F\u5426\u4E00\u81F4\uFF1B\u53EA\u80FD\u4EBA\u5224\uFF0C\u4F46\u5FC5\u987B\u9010\u6761\u56DE\u7B54 \uFF5C \u5F53\u524D scope=static\uFF0C\u672C\u6761\u505C\u7528",
          measure: "semantic",
          threshold: "proposal",
          citation: "\u8BED\u4E49\u5224\u65AD\uFF0C\u4E0D\u8BBE\u6570\u503C",
          principle: "\u8FD0\u52A8\u4E0E\u8282\u594F",
          violation: "\u4F4D\u79FB\u65B9\u5411\u4E0E\u56E0\u679C/\u6D41\u7A0B\u76F8\u53CD\uFF0C\u628A\u987A\u5E8F\u8BB2\u53CD\u4E86\u3002",
          outOfScope: "video"
        },
        {
          id: "JK-01",
          title: "\u60EF\u4F8B\u53D6\u820D",
          severity: "human",
          medium: [
            "ui"
          ],
          metric: null,
          gate: null,
          minSamples: 0,
          requires: [
            "interaction_map"
          ],
          note: "\u504F\u79BB\u5E73\u53F0\u60EF\u4F8B\u8981\u6709\u964D\u4F4E\u7406\u89E3\u6210\u672C\u7684\u7406\u7531\uFF0C\u4E0D\u80FD\u53EA\u4E3A\u7279\u522B",
          measure: "semantic",
          threshold: "proposal",
          citation: "\u8BED\u4E49\u5224\u65AD\uFF0C\u4E0D\u8BBE\u6570\u503C",
          principle: "\u53EF\u7528\u6027",
          violation: "\u504F\u79BB\u5E73\u53F0\u60EF\u4F8B\u53C8\u6CA1\u6709\u7406\u7531\uFF0C\u7528\u6237\u5F97\u5148\u8BD5\u9519\u3002"
        },
        {
          id: "RC-01",
          title: "\u8BC6\u522B\u4F18\u4E8E\u56DE\u5FC6",
          severity: "human",
          medium: [
            "ui"
          ],
          metric: null,
          gate: null,
          minSamples: 0,
          requires: [
            "interaction_map"
          ],
          note: "\u8DE8\u5C4F\u5F15\u7528\u662F\u5426\u9700\u8981\u8BB0\u4F4F\u4E0A\u4E00\u5C4F\u7684\u5185\u5BB9",
          measure: "semantic",
          threshold: "proposal",
          citation: "\u8BED\u4E49\u5224\u65AD\uFF0C\u4E0D\u8BBE\u6570\u503C",
          principle: "\u53EF\u7528\u6027",
          violation: "\u8981\u8BB0\u4F4F\u4E0A\u4E00\u5C4F\u7684\u5185\u5BB9\u624D\u80FD\u7EE7\u7EED\uFF0C\u8BC6\u522B\u9000\u5316\u6210\u56DE\u5FC6\u3002"
        },
        {
          id: "ER-01",
          title: "\u9519\u8BEF\u63D0\u793A\u8D28\u91CF",
          severity: "human",
          medium: [
            "ui"
          ],
          metric: null,
          gate: null,
          minSamples: 0,
          requires: [
            "interaction_map"
          ],
          note: "\u662F\u5426\u7ED9\u51FA\u53EF\u6267\u884C\u7684\u4E0B\u4E00\u6B65\uFF1B\u53EA\u6709\u9519\u8BEF\u7801 = \u4E0D\u5408\u683C",
          measure: "semantic",
          threshold: "proposal",
          citation: "\u8BED\u4E49\u5224\u65AD\uFF0C\u4E0D\u8BBE\u6570\u503C",
          principle: "\u53EF\u7528\u6027",
          violation: "\u53EA\u7ED9\u9519\u8BEF\u7801\u4E0D\u7ED9\u4E0B\u4E00\u6B65\uFF0C\u7528\u6237\u4E0D\u77E5\u9053\u8BE5\u6539\u4EC0\u4E48\u3002"
        },
        {
          id: "GE-02",
          title: "\u683C\u5F0F\u5854\xB7\u76F8\u4F3C",
          principle: "\u683C\u5F0F\u5854\xB7\u76F8\u4F3C",
          measure: "exact",
          threshold: "convention",
          citation: "\u76F8\u4F3C\u6027\uFF1A\u5916\u89C2\u4E00\u81F4\u5373\u540C\u7C7B\uFF1B\u300E\u5B8C\u5168\u4E00\u81F4\u300F\u672C\u8EAB\u662F\u60EF\u4F8B\u5224\u65AD",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "style_variants_per_class",
          unit: "count",
          gate: {
            warn: {
              gt: 1
            }
          },
          minSamples: 2,
          requires: [
            "boxes",
            "style"
          ],
          violation: "\u540C\u7C7B\u5143\u7D20\u7684\u989C\u8272/\u5706\u89D2/\u5B57\u91CD\u4E0D\u4E00\u81F4\uFF0C\u8BFB\u8005\u4F1A\u5F53\u6210\u4E24\u79CD\u4E1C\u897F\u3002",
          note: "\u6309 role+kind \u5206\u7EC4\u6BD4\u8F83 style \u7B7E\u540D\uFF1Bboxes \u7F3A style \u5B57\u6BB5\u8BB0 UNMEASURED",
          needsPreciseBoxes: true
        },
        {
          id: "GE-03",
          title: "\u683C\u5F0F\u5854\xB7\u95ED\u5408",
          principle: "\u683C\u5F0F\u5854\xB7\u95ED\u5408",
          measure: "exact",
          threshold: "proposal",
          citation: "0.15 \u4E3A\u63D0\u6848\u503C\uFF1B\u95ED\u5408\u611F\u77E5\u672C\u8EAB\u662F\u683C\u5F0F\u5854\u4E8B\u5B9E",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "gap_ratio_of_perimeter",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.15
            }
          },
          minSamples: 1,
          requires: [
            "vector_paths"
          ],
          implemented: false,
          violation: "\u5BB9\u5668\u7F3A\u53E3\u8FC7\u5927\uFF0C\u8FB9\u754C\u8865\u4E0D\u5B8C\u6574\uFF0C\u5206\u7EC4\u5931\u6548\u3002",
          note: "\u9700\u8981\u8DEF\u5F84\u6570\u636E\uFF1B\u811A\u672C\u5C1A\u672A\u5B9E\u73B0\uFF0C\u5148\u4EBA\u5DE5\u770B",
          needsPreciseBoxes: true
        },
        {
          id: "GE-04",
          title: "\u683C\u5F0F\u5854\xB7\u8FDE\u7EED",
          principle: "\u683C\u5F0F\u5854\xB7\u8FDE\u7EED",
          measure: "exact",
          threshold: "proposal",
          citation: "30\xB0 \u4E3A\u63D0\u6848\u503C\uFF1B\u8FDE\u7EED\u6027\u672C\u8EAB\u662F\u683C\u5F0F\u5854\u4E8B\u5B9E",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "turn_angle_deg",
          unit: "deg",
          gate: {
            warn: {
              gt: 30
            }
          },
          minSamples: 3,
          requires: [
            "boxes"
          ],
          implemented: false,
          violation: "\u76F8\u90BB\u5143\u7D20\u8FDE\u7EBF\u6210\u6298\u7EBF\uFF0C\u89C6\u7EBF\u8D70\u5230\u4E00\u534A\u88AB\u5F39\u5F00\u3002",
          note: "\u9700\u8981\u5143\u7D20\u5E8F\u5217\u58F0\u660E\uFF1B\u811A\u672C\u5C1A\u672A\u5B9E\u73B0",
          needsPreciseBoxes: true
        },
        {
          id: "CR-01",
          title: "\u5171\u540C\u533A\u57DF",
          principle: "\u5171\u540C\u533A\u57DF",
          measure: "model",
          threshold: "proposal",
          citation: "\u5171\u540C\u533A\u57DF\u662F\u683C\u5F0F\u5854\u4E8B\u5B9E\uFF1B\u5224\u5B9A\u9608\u503C\u662F\u63D0\u6848",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "cross_container_group_ratio",
          unit: "ratio",
          gate: {
            warn: {
              gt: 0.3
            }
          },
          minSamples: 2,
          requires: [
            "boxes",
            "groups"
          ],
          implemented: false,
          violation: "\u540C\u7EC4\u5143\u7D20\u4E0D\u5728\u540C\u4E00\u5E95\u8272\u6216\u5BB9\u5668\u91CC\uFF0C\u5206\u7EC4\u53EA\u80FD\u9760\u731C\u3002",
          note: "\u4F9D\u8D56\u5206\u7EC4\u63A8\u65AD\uFF1B\u811A\u672C\u5C1A\u672A\u5B9E\u73B0",
          needsPreciseBoxes: true
        },
        {
          id: "SP-01",
          title: "\u95F4\u8DDD\u4F53\u7CFB",
          principle: "\u91CD\u590D\u4E0E\u4E00\u81F4\u6027",
          measure: "exact",
          threshold: "proposal",
          citation: "7 \u6863\u4E3A\u63D0\u6848\u503C\uFF1B\u95F4\u8DDD\u9636\u68AF\u662F\u5DE5\u827A\u60EF\u4F8B",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "spacing_scale_levels",
          unit: "count",
          gate: {
            warn: {
              gt: 7
            }
          },
          minSamples: 5,
          requires: [
            "boxes"
          ],
          violation: "\u95F4\u8DDD\u53D6\u503C\u592A\u591A\u592A\u788E\uFF0C\u770B\u8D77\u6765\u50CF\u968F\u624B\u62D6\u51FA\u6765\u7684\u3002",
          note: "\u7EDF\u8BA1\u540C\u8F74\u76F8\u90BB\u5143\u7D20\u95F4\u8DDD\u7684\u53D6\u503C\u6863\u6570",
          needsPreciseBoxes: true
        },
        {
          id: "SG-01",
          title: "\u610F\u4E49\uFF08\u5F62\u5F0F\u8FFD\u968F\u529F\u80FD\uFF09",
          principle: "\u610F\u4E49",
          measure: "semantic",
          threshold: "proposal",
          citation: "\u65E0\u9608\u503C\u53EF\u8BBE\uFF0C\u53EA\u80FD\u4EBA\u5224",
          severity: "human",
          medium: [
            "ui",
            "print"
          ],
          metric: null,
          gate: null,
          minSamples: 0,
          requires: [
            "intent"
          ],
          violation: "\u5143\u7D20\u4E0D\u627F\u8F7D\u4FE1\u606F\u3001\u7ED3\u6784\u6216\u60C5\u7EEA\uFF0C\u53BB\u6389\u6CA1\u6709\u635F\u5931\u3002",
          note: "\u5FC5\u987B\u9010\u4E2A\u5143\u7D20\u95EE\u300E\u53BB\u6389\u4F1A\u635F\u5931\u4EC0\u4E48\u300F"
        },
        {
          id: "TY-04",
          title: "\u9636\u68AF\u5916\u5B57\u53F7",
          principle: "\u91CD\u590D\u4E0E\u4E00\u81F4\u6027",
          measure: "exact",
          threshold: "convention",
          citation: "Material 3 \u8981\u6C42\u6240\u6709\u6587\u672C\u6620\u5C04\u5230\u9884\u5B9A\u4E49 type scale\uFF0C\u4E0D\u5141\u8BB8\u81EA\u9020\u5B57\u53F7",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "off_scale_sizes",
          unit: "count",
          gate: {
            warn: {
              gt: 0
            }
          },
          minSamples: 1,
          requires: [
            "boxes",
            "type_scale"
          ],
          violation: "\u51FA\u73B0\u4E86\u4E0D\u5728\u5B57\u53F7\u9636\u68AF\u91CC\u7684\u5B57\u53F7\uFF0C\u5C42\u7EA7\u53EA\u80FD\u4E34\u65F6\u5224\u65AD\uFF0C\u540C\u4E00\u5957\u7CFB\u7EDF\u91CC\u6CA1\u6CD5\u590D\u7528\u3002",
          note: "\u9700 --scale \u58F0\u660E\u9636\u68AF\uFF08\u5982 20,26,32,40,56\uFF09\uFF1B\u6CA1\u6709\u58F0\u660E\u65F6\u8BB0 UNMEASURED"
        },
        {
          id: "TY-05",
          title: "\u76F8\u90BB\u6863\u4F4D\u6BD4",
          principle: "\u89C6\u89C9\u5C42\u6B21",
          measure: "exact",
          threshold: "convention",
          citation: "\u6A21\u5757\u5316\u6BD4\u4F8B 1.125\u20131.25\uFF1BMaterial \u660E\u786E\u8981\u6C42\u5B57\u53F7\u5DEE\u5F02\u8981\u6709\u51B2\u51FB\u529B\u3001\u907F\u514D\u5FAE\u5C0F\u5DEE\u5F02",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "min_adjacent_ratio",
          unit: "ratio",
          gate: {
            warn: {
              lt: 1.2
            }
          },
          minSamples: 3,
          requires: [
            "boxes"
          ],
          violation: "\u76F8\u90BB\u4E24\u6863\u5B57\u53F7\u5DEE\u4E0D\u5230 1.2 \u500D\uFF0C\u8089\u773C\u5206\u4E0D\u51FA\u5C42\u7EA7\uFF0C\u7B49\u4E8E\u6CA1\u6709\u5C42\u7EA7\u3002",
          note: "\u53EA\u67E5\u9636\u68AF\u672C\u8EAB\uFF0C\u4E0D\u8981\u6C42\u6BCF\u5BF9\u5143\u7D20\u90FD\u4E0D\u540C"
        },
        {
          id: "TY-06",
          title: "\u5B57\u91CD\u6863\u4F4D",
          principle: "\u91CD\u590D\u4E0E\u4E00\u81F4\u6027",
          measure: "exact",
          threshold: "convention",
          citation: "Apple HIG\uFF1A\u5C3D\u91CF\u51CF\u5C11\u5B57\u6837\u6570\u91CF\uFF0C\u6DF7\u7528\u592A\u591A\u4F1A\u6A21\u7CCA\u5C42\u7EA7",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "weight_levels",
          unit: "count",
          gate: {
            warn: {
              gt: 3
            }
          },
          minSamples: 3,
          requires: [
            "boxes"
          ],
          violation: "\u5B57\u91CD\u7528\u4E86 4 \u6863\u4EE5\u4E0A\uFF0C\u7C97\u7EC6\u4E4B\u95F4\u7684\u5DEE\u522B\u5931\u53BB\u542B\u4E49\u3002",
          note: "\u4E0E TY-01\uFF08\u5B57\u4F53\u65CF\uFF09\u5E76\u5217\uFF0C\u5206\u522B\u7BA1\u65CF\u548C\u7C97\u7EC6"
        },
        {
          id: "TY-07",
          title: "\u957F\u6BB5\u843D\u5C45\u4E2D",
          principle: "\u53EF\u8BFB\u6027",
          measure: "exact",
          threshold: "convention",
          citation: "\u6392\u7248\u60EF\u4F8B\uFF1A\u6B63\u6587\u5DE6\u5BF9\u9F50\u63D0\u4F9B\u7A33\u5B9A\u9605\u8BFB\u951A\u70B9\uFF0C\u5C45\u4E2D\u9002\u5408\u77ED\u6807\u9898",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "centered_long_lines",
          unit: "count",
          gate: {
            warn: {
              gt: 0
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          violation: "\u8D85\u8FC7\u4E00\u884C\u7684\u6B63\u6587\u88AB\u5C45\u4E2D\uFF0C\u6BCF\u6362\u4E00\u884C\u89C6\u7EBF\u90FD\u8981\u91CD\u65B0\u627E\u8D77\u70B9\u3002",
          note: "\u5224\u5B9A\u6761\u4EF6\uFF1A\u5BF9\u9F50\u4E3A\u5C45\u4E2D\u4E14\u5B57\u7B26\u6570 > 30"
        },
        {
          id: "TY-08",
          title: "\u7EA4\u7EC6\u5B57\u91CD",
          principle: "\u53EF\u8BFB\u6027",
          measure: "exact",
          threshold: "convention",
          citation: "Apple HIG\uFF1A\u907F\u514D\u4F7F\u7528\u7EA4\u7EC6\u5B57\u91CD\uFF0C\u5C0F\u5B57\u53F7\u4E0B\u96BE\u4EE5\u770B\u6E05",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "thin_weight_small",
          unit: "count",
          gate: {
            warn: {
              gt: 0
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          violation: "\u5C0F\u5B57\u53F7\u914D 300 \u4EE5\u4E0B\u7684\u5B57\u91CD\uFF0C\u7B14\u753B\u7EC6\u5230\u53D1\u865A\uFF0C\u8FDC\u770B\u4F1A\u65AD\u3002",
          note: "\u5224\u5B9A\u6761\u4EF6\uFF1Afont-weight \u2264 300 \u4E14\u5B57\u53F7 < 24"
        },
        {
          id: "TY-09",
          title: "\u6BB5\u8DDD\u5927\u4E8E\u884C\u8DDD",
          principle: "\u4EB2\u5BC6\u6027",
          measure: "exact",
          threshold: "convention",
          citation: "\u6392\u7248\u60EF\u4F8B\uFF1A\u6BB5\u843D\u95F4\u8DDD\u5FC5\u987B\u660E\u663E\u5927\u4E8E\u884C\u95F4\u8DDD\uFF0C\u5426\u5219\u6BB5\u843D\u5931\u53BB\u8FB9\u754C",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "paragraph_gap_ratio",
          unit: "ratio",
          gate: {
            warn: {
              lt: 1.5
            }
          },
          minSamples: 2,
          requires: [
            "boxes",
            "paragraphs"
          ],
          violation: "\u6BB5\u843D\u95F4\u8DDD\u548C\u884C\u8DDD\u51E0\u4E4E\u4E00\u6837\uFF0C\u8BFB\u8005\u5206\u4E0D\u6E05\u662F\u6362\u884C\u8FD8\u662F\u6362\u6BB5\u3002",
          note: "\u9700\u8981\u6BB5\u843D\u5F52\u5C5E\u6807\u6CE8\uFF1B\u6CA1\u6709\u65F6\u8BB0 UNMEASURED"
        },
        {
          id: "TY-10",
          title: "\u5F3A\u8C03\u6837\u5F0F\u8FC7\u8F7D",
          principle: "\u89C6\u89C9\u5C42\u6B21",
          measure: "exact",
          threshold: "convention",
          citation: "\u6392\u7248\u60EF\u4F8B\uFF1A\u4E00\u5C4F\u5185\u7528\u5C3D\u7C97\u4F53\u3001\u659C\u4F53\u3001\u989C\u8272\u3001\u4E0B\u5212\u7EBF\uFF0C\u5C42\u7EA7\u4F1A\u4E92\u76F8\u62B5\u6D88",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "emphasis_variants",
          unit: "count",
          gate: {
            warn: {
              gt: 3
            }
          },
          minSamples: 3,
          requires: [
            "boxes"
          ],
          violation: "\u540C\u4E00\u5C4F\u91CC\u7528\u4E86\u56DB\u79CD\u4EE5\u4E0A\u5F3A\u8C03\u624B\u6BB5\uFF0C\u7B49\u4E8E\u8C01\u90FD\u4E0D\u7A81\u51FA\u3002",
          note: "\u7EDF\u8BA1\u5B57\u91CD\u2260400\u3001\u659C\u4F53\u3001\u975E\u4E3B\u8272\u3001\u4E0B\u5212\u7EBF\u7684\u7EC4\u5408\u7C7B\u578B"
        },
        {
          id: "TX-01",
          title: "\u6587\u5B57\u914D\u8272\u9884\u7B97",
          principle: "\u7EDF\u4E00\u4E0E\u591A\u6837",
          measure: "exact",
          threshold: "convention",
          citation: "\u914D\u8272\u5B9E\u8DF5\uFF1A\u4E2D\u6027\u6587\u5B57\u8272 \u22643\uFF08\u4E3B/\u6B21/\u8F85\uFF09\uFF0C\u5F3A\u8C03\u8272 \u22642\uFF1B\u5176\u4F59\u9760\u5B57\u53F7\u5B57\u91CD\u533A\u5206",
          severity: "warn",
          medium: [
            "ui",
            "print"
          ],
          metric: "text_color_count",
          unit: "count",
          gate: {
            warn: {
              gt: 3
            }
          },
          minSamples: 1,
          requires: [
            "boxes"
          ],
          violation: "\u6587\u5B57\u7528\u4E86\u592A\u591A\u989C\u8272\uFF0C\u8BFB\u8005\u4F1A\u4EE5\u4E3A\u5B83\u4EEC\u5206\u522B\u4EE3\u8868\u4E0D\u540C\u7684\u72B6\u6001\u3002",
          note: "\u6309\u9971\u548C\u5EA6\u5206\u4E24\u5C42\uFF1A\u4E2D\u6027\u8272\u7BA1\u5C42\u7EA7\uFF0C\u5F3A\u8C03\u8272\u7BA1\u8BED\u4E49\uFF1B\u4E24\u5C42\u90FD\u8D85\u624D\u7B97\u8FDD\u89C4",
          secondary: {
            metric: "text_accent_colors",
            gate: {
              warn: {
                gt: 2
              }
            }
          }
        }
      ],
      provenance: {
        measure: {
          exact: "\u5B9A\u4E49\u5373\u6570\u503C\uFF0C\u65E0\u53EF\u4E89\u53C2\u6570",
          model: "\u4EE3\u7406\u6A21\u578B\u7684\u8F93\u51FA\uFF0C\u4EC5\u5E8F\u5173\u7CFB\u53EF\u4FE1",
          semantic: "\u53EA\u80FD\u4EBA\u5224"
        },
        threshold: {
          standard: "\u53EF\u5F15\u7528\u89C4\u8303\uFF0C\u6539\u52A8\u9700\u6362\u5F15\u6587",
          convention: "\u884C\u4E1A\u60EF\u4F8B\uFF0C\u53EF\u8FA9\u62A4\u65E0\u5F3A\u5236\u529B",
          proposal: "\u672C\u9879\u76EE\u63D0\u6848\uFF0C\u53EA\u4FDD\u8BC1\u5185\u90E8\u4E00\u81F4"
        }
      },
      principles: {
        \u4EB2\u5BC6\u6027: "\u683C\u5F0F\u5854\xB7\u63A5\u8FD1\uFF0C\u540C\u7EC4\u8981\u8FD1\u3001\u5F02\u7EC4\u8981\u8FDC",
        \u5BF9\u6BD4: "\u8BE5\u8DF3\u51FA\u6765\u7684\u8981\u8DF3\u51FA\u6765\uFF0C\u5305\u62EC\u6587\u5B57\u4E0E\u5E95\u8272\u3001\u56FE\u5F62\u4E0E\u5E95\u8272",
        \u91CD\u590D\u4E0E\u4E00\u81F4\u6027: "\u540C\u7C7B\u4E1C\u897F\u957F\u5F97\u4E00\u6837\uFF0C\u4F53\u73B0\u4E3A\u5B57\u4F53\u65CF/\u5B57\u53F7/\u5B57\u91CD/\u95F4\u8DDD\u7684\u6863\u4F4D\u6536\u655B",
        \u5BF9\u9F50: "\u8FB9\u7F18\u843D\u5728\u540C\u4E00\u6839\u7EBF\u4E0A\uFF0C\u89C6\u7EBF\u4E0D\u7528\u91CD\u65B0\u627E\u8D77\u70B9",
        \u7F51\u683C: "\u5143\u7D20\u5171\u4EAB\u540C\u4E00\u5957\u5750\u6807\u9AA8\u67B6",
        "\u683C\u5F0F\u5854\xB7\u76F8\u4F3C": "\u5916\u89C2\u76F8\u4F3C\u5373\u540C\u7C7B",
        "\u683C\u5F0F\u5854\xB7\u95ED\u5408": "\u8FB9\u754C\u80FD\u88AB\u8865\u5168\uFF0C\u5BB9\u5668\u624D\u6210\u7ACB",
        "\u683C\u5F0F\u5854\xB7\u8FDE\u7EED": "\u89C6\u7EBF\u6CBF\u4E00\u6761\u8DEF\u5F84\u6D41\u52A8\uFF0C\u4E0D\u88AB\u6298\u65AD",
        \u5171\u540C\u533A\u57DF: "\u5171\u4EAB\u5E95\u8272/\u5BB9\u5668\u7684\u5143\u7D20\u88AB\u8BFB\u6210\u4E00\u7EC4",
        \u89C6\u89C9\u5C42\u6B21: "\u7B2C\u4E00\u773C\u843D\u5728\u6700\u91CD\u8981\u7684\u5730\u65B9\uFF0C\u4E14\u6709\u4E14\u53EA\u6709\u4E00\u4E2A\u7B2C\u4E00",
        \u8D1F\u7A7A\u95F4: "\u7559\u767D\u662F\u4E3B\u52A8\u7684\uFF0C\u4E0D\u662F\u5269\u4E0B\u7684",
        \u5E73\u8861: "\u89C6\u89C9\u91CD\u91CF\u4E0D\u5F80\u4E00\u8FB9\u5012",
        \u6BD4\u4F8B: "\u5927\u5C0F\u5173\u7CFB\u6709\u4F9D\u636E",
        \u7EDF\u4E00\u4E0E\u591A\u6837: "\u6574\u4F53\u6210\u7ACB\uFF0C\u5C40\u90E8\u6709\u53D8\u5316",
        \u4FE1\u606F\u5BC6\u5EA6: "\u5355\u4F4D\u9762\u79EF\u7684\u8BA4\u77E5\u8D1F\u8377\u53EF\u63A7",
        \u8FD0\u52A8\u4E0E\u8282\u594F: "\u52A8\u7684\u4F4D\u7F6E\u3001\u65B9\u5411\u3001\u5FEB\u6162\u6709\u7406\u7531",
        \u610F\u4E49: "\u5F62\u5F0F\u670D\u52A1\u4E8E\u529F\u80FD\uFF0C\u6CA1\u6709\u88C5\u9970\u6027\u5197\u4F59",
        \u53EF\u8BFB\u6027: "\u770B\u5F97\u6E05\u3001\u8BFB\u5F97\u5B8C\u3001\u4E0D\u4E32\u884C\uFF08\u5DE5\u7A0B\u515C\u5E95\uFF09",
        \u53EF\u7528\u6027: "\u70B9\u5F97\u5230\u3001\u6709\u53CD\u9988\u3001\u8BB0\u5F97\u4F4F\uFF08\u5DE5\u7A0B\u515C\u5E95\uFF09",
        \u4EA4\u4ED8\u5B8C\u6574\u6027: "\u8D44\u6E90\u5B8C\u597D\u3001\u6CA1\u6709\u88AB\u88C1\u3001\u6CA1\u6709\u7A7A\u5C4F\uFF08\u5DE5\u7A0B\u515C\u5E95\uFF09"
      },
      scope: {
        in: [
          "svg",
          "html",
          "png",
          "jpg",
          "design file export"
        ],
        out: [
          "video"
        ],
        note: "\u89C6\u9891\u8BC4\u5BA1\uFF08\u65F6\u5E8F/\u62BD\u5E27/\u97F3\u753B\uFF09\u6574\u5757\u505C\u7528\uFF0C\u76F8\u5173\u89C4\u5219\u6807 outOfScope\uFF0C\u4E0D\u8FDB\u5224\u5B9A\u4E5F\u4E0D\u8BA1\u5165\u8986\u76D6\u7387"
      }
    };
  }
});

// src/lib/review/rules.ts
function gateStatus(gate, value) {
  if (value === null || value === void 0) return "UNMEASURED";
  if (!gate) return "PASS";
  for (const level of ["fail", "warn"]) {
    const cond = gate[level];
    if (!cond) continue;
    for (const [op, threshold] of Object.entries(cond)) {
      const fn2 = OPS[op];
      if (!fn2) continue;
      try {
        if (fn2(value, threshold)) return level === "fail" ? "FAIL" : "WARN";
      } catch {
      }
    }
  }
  return "PASS";
}
function gatePower(rule) {
  if (!rule) return "warn";
  if (rule.threshold === "proposal") return "warn";
  if (rule.measure === "model" || rule.measure === "semantic") return "warn";
  if (rule.severity !== "blocker") return "warn";
  return "blocker";
}
function provenanceOf(rule) {
  if (!rule) return { measure: "exact", threshold: "proposal" };
  return { measure: rule.measure, threshold: rule.threshold, citation: rule.citation };
}
function impactOf(rule) {
  const policy = ruleset.impactPolicy;
  if (!rule) return policy.fallback || "medium";
  const override = policy.override?.[rule.id];
  if (override && override in IMPACT_ORDER) return override;
  const byPrinciple = policy.byPrinciple?.[rule.principle];
  return byPrinciple && byPrinciple in IMPACT_ORDER ? byPrinciple : policy.fallback || "medium";
}
function ruleAllowed(rule, medium) {
  if (!rule) return false;
  return (rule.medium || []).includes(medium);
}
function capLevel(level, power) {
  if (level === "FAIL" && power !== "blocker") return "WARN";
  return level;
}
function buildCoverage(args) {
  const { medium, findings, unmeasured, ran } = args;
  const naRules = args.naRules || {};
  const byRule = /* @__PURE__ */ new Map();
  for (const f2 of findings) {
    const list = byRule.get(f2.ruleId) || [];
    list.push(f2);
    byRule.set(f2.ruleId, list);
  }
  const um = /* @__PURE__ */ new Map();
  for (const u2 of unmeasured) {
    const list = um.get(u2.ruleId) || [];
    if (u2.reason) list.push(u2.reason);
    um.set(u2.ruleId, list);
  }
  const rows = [];
  for (const rule of ruleset.rules) {
    if (rule.outOfScope) continue;
    const row = {
      ruleId: rule.id,
      title: rule.title,
      principle: rule.principle,
      severity: rule.severity,
      measure: rule.measure,
      threshold: rule.threshold
    };
    if (rule.severity === "human" || rule.measure === "semantic") {
      row.status = "human";
      row.reason = "\u53EA\u80FD\u4EBA\u5BA1\uFF0C\u4E0D\u8FDB\u81EA\u52A8\u95F8\u95E8";
    } else if (naRules[rule.id]) {
      row.status = "na";
      row.reason = naRules[rule.id];
    } else if (!ruleAllowed(rule, medium)) {
      row.status = "na";
      row.reason = `medium=${medium} \u4E0D\u5728 ${JSON.stringify(rule.medium)}`;
    } else if (!IMPLEMENTED[rule.id]) {
      row.status = "not_implemented";
      row.reason = "\u89C4\u5219\u5E93\u6709\u3001\u8FD9\u4E2A\u8BC4\u5BA1\u5668\u6CA1\u6709\u5B9E\u73B0\u2014\u2014\u53EA\u80FD\u8FDB\u4EBA\u5BA1/\u5F85\u8865\uFF0C\u4E0D\u7B97\u901A\u8FC7";
    } else if (![...IMPLEMENTED[rule.id]].some((s2) => ran.has(s2))) {
      row.status = "not_run";
      row.reason = `\u9700\u8981 ${[...IMPLEMENTED[rule.id]].join("/")} \u6D4B\u91CF\uFF0C\u672C\u6B21\u6CA1\u8DD1`;
    } else {
      const hits = byRule.get(rule.id) || [];
      if (hits.length) {
        row.status = "measured";
        row.level = hits.map((h) => h.level).sort((a, b2) => LEVEL_ORDER[a] - LEVEL_ORDER[b2])[0];
        row.count = hits.length;
      } else if (um.has(rule.id)) {
        row.status = "unmeasured";
        row.reason = (um.get(rule.id) || []).filter(Boolean).join("\uFF1B") || "\u6D4B\u91CF\u6761\u4EF6\u4E0D\u6210\u7ACB";
      } else {
        row.status = "unmeasured";
        row.reason = "\u5DF2\u5B9E\u73B0\u4F46\u672C\u6B21\u6CA1\u6709\u4EA7\u51FA\u8BB0\u5F55\u2014\u2014\u6309\u7EAA\u5F8B\u8BB0\u672A\u6D4B\uFF0C\u4E0D\u5F97\u5F53 PASS";
      }
    }
    rows.push(row);
  }
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  const measured = counts.measured || 0;
  return {
    total: rows.length,
    counts,
    measured,
    notMeasured: Math.max(0, rows.length - measured - (counts.na || 0) - (counts.human || 0)),
    rules: rows
  };
}
var ruleset, fullRuleset, LIBRARY_VERSION, RULES, ACTIVE_IDS, IMPLEMENTED, IMPACT_ORDER, LEVEL_ORDER, IMPACT_LABELS, OPS;
var init_rules2 = __esm({
  "src/lib/review/rules.ts"() {
    init_rules_core();
    init_rules();
    ruleset = rules_core_default;
    fullRuleset = rules_default;
    LIBRARY_VERSION = ruleset.libraryVersion;
    RULES = {
      ...Object.fromEntries(fullRuleset.rules.map((r3) => [r3.id, r3])),
      ...Object.fromEntries(ruleset.rules.map((r3) => [r3.id, r3]))
    };
    ACTIVE_IDS = new Set(ruleset.rules.map((r3) => r3.id));
    IMPLEMENTED = {
      "QL-01": /* @__PURE__ */ new Set(["layout"]),
      "QL-02": /* @__PURE__ */ new Set(["layout"]),
      "QL-03": /* @__PURE__ */ new Set(["layout"]),
      "QL-07": /* @__PURE__ */ new Set(["media"]),
      "VS-01": /* @__PURE__ */ new Set(["layout"]),
      // DE-01 需要多帧采样才能说「全程不可见」，单帧评审不做，留在未实现里
      "AL-01": /* @__PURE__ */ new Set(["layout"]),
      "AL-02": /* @__PURE__ */ new Set(["layout"]),
      "GR-01": /* @__PURE__ */ new Set(["layout"]),
      "GR-02": /* @__PURE__ */ new Set(["layout"]),
      "CT-01": /* @__PURE__ */ new Set(["layout"]),
      "CT-02": /* @__PURE__ */ new Set(["contrast"]),
      "GE-02": /* @__PURE__ */ new Set(["layout"]),
      "SP-01": /* @__PURE__ */ new Set(["layout"]),
      "TY-01": /* @__PURE__ */ new Set(["layout"]),
      "TY-02": /* @__PURE__ */ new Set(["layout"]),
      "CORE-02": /* @__PURE__ */ new Set(["layout"]),
      "TY-04": /* @__PURE__ */ new Set(["layout"]),
      "TY-05": /* @__PURE__ */ new Set(["layout"]),
      "TY-06": /* @__PURE__ */ new Set(["layout"]),
      "TY-07": /* @__PURE__ */ new Set(["layout"]),
      "TY-08": /* @__PURE__ */ new Set(["layout"]),
      "RP-01": /* @__PURE__ */ new Set(["layout"]),
      "TX-01": /* @__PURE__ */ new Set(["layout"]),
      "CL-01": /* @__PURE__ */ new Set(["pixels"]),
      "NS-01": /* @__PURE__ */ new Set(["pixels"])
    };
    IMPACT_ORDER = { high: 0, medium: 1, low: 2 };
    LEVEL_ORDER = { FAIL: 0, WARN: 1, UNMEASURED: 2, PASS: 3 };
    IMPACT_LABELS = { high: "\u9AD8", medium: "\u4E2D", low: "\u4F4E" };
    OPS = {
      gt: (a, b2) => Number(a) > Number(b2),
      lt: (a, b2) => Number(a) < Number(b2),
      gte: (a, b2) => Number(a) >= Number(b2),
      lte: (a, b2) => Number(a) <= Number(b2),
      eq: (a, b2) => a === b2,
      in: (a, b2) => Array.isArray(b2) && b2.includes(a)
    };
  }
});

// src/lib/review/boxes.ts
function toUser(ctx, r3) {
  const x2 = (r3.left - ctx.originLeft) / ctx.scale;
  const y2 = (r3.top - ctx.originTop) / ctx.scale;
  const w2 = r3.width / ctx.scale;
  const h = r3.height / ctx.scale;
  return [round(x2), round(y2), round(w2), round(h)];
}
function dataUriImageSize(href) {
  const m2 = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i.exec(href);
  if (!m2) return null;
  let bin;
  try {
    bin = atob(m2[2].slice(0, 8192));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i3 = 0; i3 < bin.length; i3++) bytes[i3] = bin.charCodeAt(i3);
  if (m2[1].toLowerCase() === "png") {
    if (bytes.length < 24) return null;
    const w2 = bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19];
    const h = bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23];
    return w2 > 0 && h > 0 ? { w: w2, h } : null;
  }
  let i2 = 2;
  while (i2 + 9 < bytes.length) {
    if (bytes[i2] !== 255) {
      i2++;
      continue;
    }
    const marker = bytes[i2 + 1];
    if (marker >= 192 && marker <= 195) {
      const h = bytes[i2 + 5] << 8 | bytes[i2 + 6];
      const w2 = bytes[i2 + 7] << 8 | bytes[i2 + 8];
      return w2 > 0 && h > 0 ? { w: w2, h } : null;
    }
    const len2 = bytes[i2 + 2] << 8 | bytes[i2 + 3];
    i2 += 2 + len2;
  }
  return null;
}
function frameOf(el, textRect, ctx) {
  const parent = el.parentElement;
  if (!parent) return null;
  const boxes = [];
  for (const sibling of Array.from(parent.children)) {
    if (sibling === el) continue;
    const tag = localTag2(sibling);
    if (!SHAPE_TAGS2.has(tag)) continue;
    const r3 = sibling.getBoundingClientRect();
    if (r3.width < textRect.width * 0.35 || r3.height < textRect.height * 0.35) continue;
    boxes.push(toUser(ctx, r3));
  }
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b2) => b2[0]));
  const y0 = Math.min(...boxes.map((b2) => b2[1]));
  const x1 = Math.max(...boxes.map((b2) => b2[0] + b2[2]));
  const y1 = Math.max(...boxes.map((b2) => b2[1] + b2[3]));
  const frameArea = (x1 - x0) * (y1 - y0);
  const textArea = textRect.width / ctx.scale * (textRect.height / ctx.scale);
  if (frameArea < textArea * 0.5) return null;
  return [round(x0), round(y0), round(x1 - x0), round(y1 - y0)];
}
function groupIdOf(node) {
  const cached = groupIdCache.get(node);
  if (cached) return cached;
  const raw = node.getAttribute("data-group") || node.getAttribute("id");
  const cls = (node.getAttribute("class") || "").split(/\s+/).filter(Boolean)[0];
  const id2 = raw ? raw : `ace:${cls || node.localName || "g"}#${++groupSeq}`;
  groupIdCache.set(node, id2);
  return id2;
}
function findContainer(el, rect, ctx) {
  const area2 = Math.max(1, rect.width * rect.height);
  let node = el.parentElement;
  while (node && node !== ctx.snap.svg) {
    const r3 = node.getBoundingClientRect();
    if (r3.width >= rect.width && r3.height >= rect.height && r3.width * r3.height >= area2 * 1.25 + 4) {
      const id2 = groupIdOf(node);
      const box = toUser(ctx, r3);
      ctx.groupBoxes[id2] = box;
      return { id: id2, box };
    }
    node = node.parentElement;
  }
  return null;
}
function firstFamily(v2) {
  return String(v2 || "").split(",")[0].trim().replace(/^["']|["']$/g, "");
}
function weightOf(v2) {
  const map = { normal: 400, bold: 700, bolder: 700, lighter: 300 };
  const key = String(v2 || "").trim().toLowerCase();
  if (map[key]) return map[key];
  const n3 = parseFloat(key);
  return Number.isFinite(n3) ? n3 : 400;
}
function assignIds(snap3) {
  const map = /* @__PURE__ */ new Map();
  let counter = 0;
  const walk = (el, parentId) => {
    const tag = localTag2(el);
    if (!tag || SKIP_TAGS2.has(tag)) return;
    if (tag === "use" || tag === "foreignobject") return;
    const index = counter++;
    const id2 = parentId ? `${parentId}.${index}` : String(index);
    el.setAttribute("data-qv-id", id2);
    map.set(id2, el);
    if (getComputedStyle(el).display === "none") return;
    for (const child of Array.from(el.children)) walk(child, id2);
  };
  walk(snap3.svg);
  return map;
}
function extractBoxes(snap3) {
  if (!snap3.svg.querySelector("[data-qv-id]")) assignIds(snap3);
  const origin = snap3.svg.getBoundingClientRect();
  const ctx = {
    snap: snap3,
    originLeft: origin.left,
    originTop: origin.top,
    scale: snap3.unitScale || 1,
    counter: 0,
    elements: [],
    groupBoxes: {},
    notes: []
  };
  const brokenImages = [];
  const unresolvedImages = [];
  const walk = (el, containerId, groupId) => {
    const tag = localTag2(el);
    if (!tag || SKIP_TAGS2.has(tag)) return;
    if (tag === "use" || tag === "foreignobject") return;
    const id2 = el.getAttribute("data-qv-id");
    if (!id2) return;
    const cs3 = getComputedStyle(el);
    if (cs3.display === "none") return;
    let nextContainer = containerId;
    let nextGroup = groupId;
    if (tag === "svg" || tag === "g") {
      const explicit = el.getAttribute("data-group") || el.getAttribute("id") || el.getAttribute("class");
      if (tag === "g" && explicit) {
        const raw = el.getAttribute("data-group") || el.getAttribute("id");
        const cls2 = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean)[0];
        nextGroup = raw ? raw : `g:${cls2 || "group"}#${Object.keys(ctx.groupBoxes).length + 1}`;
        nextContainer = nextGroup;
        const rect2 = toUser(ctx, el.getBoundingClientRect());
        ctx.groupBoxes[nextGroup] = rect2;
      }
      for (const child of Array.from(el.children)) {
        walk(child, nextContainer, nextGroup);
      }
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && tag !== "text") return;
    const bbox = toUser(ctx, rect);
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean)[0];
    const role = cls || (tag === "image" ? "image" : tag === "text" ? "text" : "shape");
    const ownOpacity = Number.parseFloat(cs3.opacity || "1");
    const visible = isVisible(el, cs3);
    const kind = tag === "text" ? "text" : tag === "image" ? "image" : "shape";
    let imgSize = null;
    if (tag === "image") {
      const href = el.getAttribute("href") || el.getAttribute("xlink:href") || el.href?.baseVal || "";
      if (!href.trim()) brokenImages.push(id2);
      else if (!/^data:/i.test(href)) unresolvedImages.push(href);
      else imgSize = dataUriImageSize(href);
    }
    const out = {
      id: id2,
      tag,
      kind,
      bbox,
      z: ctx.elements.length,
      opacity: Number.isFinite(ownOpacity) ? ownOpacity : 1,
      role,
      container: nextContainer,
      group: nextGroup,
      style: { fill: cssColor(cs3.fill), stroke: cssColor(cs3.stroke), weight: cs3.fontWeight }
    };
    if (tag === "text") {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      const fontSize = Number.parseFloat(cs3.fontSize) / ctx.scale;
      out.text = text.slice(0, 200);
      out.charCount = text.replace(/\s/g, "").length;
      out.fontSize = Number.isFinite(fontSize) ? round(fontSize) : void 0;
      out.fontFamily = firstFamily(cs3.fontFamily);
      out.fontWeight = weightOf(cs3.fontWeight);
      out.fill = cssColor(cs3.fill);
      out.align = (cs3.textAnchor || "start").toLowerCase();
      out.lineHeight = explicitLineHeight(cs3, ctx.scale);
      const container = findContainer(el, rect, ctx);
      out.container = container?.id;
      const frame = frameOf(el, rect, ctx);
      if (frame) out.containerFrame = frame;
      out.visible = visible;
      ctx.elements.push(out);
      return;
    }
    if (tag === "image") {
      out.text = "image";
      if (imgSize) {
        out.imgW = imgSize.w;
        out.imgH = imgSize.h;
      }
    }
    out.visible = visible;
    ctx.elements.push(out);
  };
  for (const child of Array.from(snap3.svg.children)) {
    walk(child, void 0, void 0);
  }
  deriveLineHeights(ctx.elements);
  return { elements: ctx.elements, groupBoxes: ctx.groupBoxes, brokenImages, unresolvedImages, notes: ctx.notes };
}
function isVisible(el, cs3) {
  if (cs3.visibility === "hidden" || cs3.visibility === "collapse") return false;
  let node = el;
  while (node) {
    const style = getComputedStyle(node);
    if (style.display === "none" || Number.parseFloat(style.opacity || "1") < 0.01) return false;
    node = node.parentElement;
  }
  return true;
}
function cssColor(value) {
  if (!value || value === "none") return value || "none";
  const m2 = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value);
  if (m2) {
    const to2 = (v2) => Math.max(0, Math.min(255, Math.round(Number(v2)))).toString(16).padStart(2, "0");
    return ("#" + to2(m2[1]) + to2(m2[2]) + to2(m2[3])).toUpperCase();
  }
  return value.replace(/\s+/g, "");
}
function explicitLineHeight(cs3, scale2) {
  const raw = cs3.lineHeight;
  if (!raw || raw === "normal" || raw === "initial") return void 0;
  const m2 = /^([\d.]+)px$/.exec(raw);
  if (!m2) return void 0;
  const px = Number.parseFloat(m2[1]) / scale2;
  return Number.isFinite(px) && px > 0 ? round(px) : void 0;
}
function deriveLineHeights(elements) {
  const buckets = /* @__PURE__ */ new Map();
  for (const el of elements) {
    if (el.kind !== "text" || !el.fontSize || el.lineHeight) continue;
    const key = [el.container || "root", Math.round(el.fontSize * 2) / 2, el.align || "start"].join("|");
    const list = buckets.get(key) || [];
    list.push(el);
    buckets.set(key, list);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    list.sort((a, b2) => a.bbox[1] - b2.bbox[1]);
    const deltas = [];
    for (let i2 = 1; i2 < list.length; i2++) {
      const prev = list[i2 - 1];
      const cur = list[i2];
      const gap = cur.bbox[1] - prev.bbox[1];
      const fs6 = prev.fontSize || 0;
      if (gap >= fs6 && gap <= fs6 * 1.9) {
        const overlapX = Math.min(prev.bbox[0] + prev.bbox[2], cur.bbox[0] + cur.bbox[2]) - Math.max(prev.bbox[0], cur.bbox[0]);
        if (overlapX > 0.4 * Math.min(prev.bbox[2], cur.bbox[2])) deltas.push(gap);
      }
    }
    if (deltas.length < 1) continue;
    deltas.sort((a, b2) => a - b2);
    const median2 = deltas[Math.floor(deltas.length / 2)];
    for (const el of list) {
      el.lineHeight = round(median2);
      el.lineHeightSource = "baseline_delta";
    }
  }
}
var SKIP_TAGS2, localTag2, round, groupIdCache, groupSeq, SHAPE_TAGS2;
var init_boxes = __esm({
  "src/lib/review/boxes.ts"() {
    SKIP_TAGS2 = /* @__PURE__ */ new Set([
      "defs",
      "style",
      "title",
      "desc",
      "metadata",
      "clippath",
      "mask",
      "lineargradient",
      "radialgradient",
      "pattern",
      "filter",
      "symbol",
      "marker"
    ]);
    localTag2 = (el) => (el.localName || el.tagName || "").toLowerCase();
    round = (v2) => Math.round(v2 * 100) / 100;
    groupIdCache = /* @__PURE__ */ new WeakMap();
    groupSeq = 0;
    SHAPE_TAGS2 = /* @__PURE__ */ new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "image"]);
  }
});

// src/lib/review/snapshot.ts
function ensureRootSize(svg) {
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.display = "block";
  svg.style.overflow = "visible";
}
async function mountSnapshot(asset) {
  const width = asset.width > 0 ? asset.width : DEFAULT_W;
  const height = asset.height > 0 ? asset.height : DEFAULT_H;
  const host = document.createElement("div");
  host.setAttribute("data-qv-host", "1");
  host.style.cssText = [
    "position:fixed",
    "left:-200000px",
    "top:0",
    `width:${width}px`,
    `height:${height}px`,
    "pointer-events:none",
    "opacity:0",
    "contain:layout style",
    "z-index:-1"
  ].join(";");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = asset.svg;
  const svg = shadow.querySelector("svg");
  if (!svg) {
    throw new Error("\u8FD9\u4E0D\u662F\u53EF\u6E32\u67D3\u7684 SVG\uFF1A\u627E\u4E0D\u5230\u6839 <svg>");
  }
  ensureRootSize(svg);
  document.body.appendChild(host);
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
    }
  }
  await nextFrame();
  const animations = collectAnimations(svg, shadow);
  const finiteEnds = animations.map((a) => {
    const timing = a.effect?.getComputedTiming();
    if (!timing) return 0;
    const delay = Number(timing.delay) || 0;
    const dur = Number(timing.duration) || 0;
    const iterations = timing.iterations === Infinity ? 1 : Number(timing.iterations) || 1;
    return delay + dur * iterations;
  }).filter((v2) => Number.isFinite(v2) && v2 > 0);
  const duration = finiteEnds.length ? Math.max(...finiteEnds) / 1e3 : 0;
  const hasSmil = !!svg.querySelector("animate, animateTransform, animateMotion, set");
  let unitScale = 1;
  const rootRect = svg.getBoundingClientRect();
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0) unitScale = rootRect.width / vb.width;
  if (!Number.isFinite(unitScale) || unitScale <= 0) unitScale = 1;
  return {
    host,
    shadow,
    svg,
    width: vb && vb.width > 0 ? vb.width : width,
    height: vb && vb.height > 0 ? vb.height : height,
    unitScale,
    duration,
    animationCount: animations.length,
    hasSmil,
    staticSvg: "",
    dispose: () => {
      host.remove();
    }
  };
}
function collectAnimations(svg, shadow) {
  const out = /* @__PURE__ */ new Set();
  const push = (list) => {
    for (const a of list || []) out.add(a);
  };
  try {
    push(svg.getAnimations({ subtree: true }));
  } catch {
  }
  try {
    push(shadow.getAnimations?.());
  } catch {
  }
  try {
    push(document.getAnimations?.().filter((animation) => {
      const target = animation.effect?.target;
      return target instanceof Element && svg.contains(target);
    }));
  } catch {
  }
  return [...out];
}
function bakeStatic(snap3) {
  const clone = snap3.svg.cloneNode(true);
  const srcList = [snap3.svg, ...Array.from(snap3.svg.querySelectorAll("*"))];
  const dstList = [clone, ...Array.from(clone.querySelectorAll("*"))];
  const len2 = Math.min(srcList.length, dstList.length);
  for (let i2 = 0; i2 < len2; i2++) {
    const src = srcList[i2];
    const dst = dstList[i2];
    const computed = getComputedStyle(src);
    const parts = [];
    for (const prop of BAKE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (!value) continue;
      parts.push(`${prop}:${value}`);
    }
    parts.push("animation:none", "transition:none");
    dst.setAttribute("style", parts.join(";"));
    dst.removeAttribute("class");
  }
  clone.querySelectorAll("style").forEach((s2) => s2.remove());
  clone.setAttribute("width", String(snap3.width));
  clone.setAttribute("height", String(snap3.height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("xmlns:xlink")) {
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }
  return new XMLSerializer().serializeToString(clone);
}
async function rasterize(snap3, staticSvg) {
  const scale2 = Math.min(1, MAX_RASTER / Math.max(snap3.width, snap3.height));
  const w2 = Math.max(2, Math.round(snap3.width * scale2));
  const h = Math.max(2, Math.round(snap3.height * scale2));
  const blob = new Blob([staticSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "sync";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w2;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w2, h);
    const data = ctx.getImageData(0, 0, w2, h);
    return { canvas, ctx, image: data, width: w2, height: h, pixelScale: w2 / snap3.width };
  } catch (err) {
    return {
      canvas: null,
      ctx: null,
      image: null,
      width: w2,
      height: h,
      pixelScale: w2 / snap3.width,
      error: err?.message || "\u5149\u6805\u5316\u5931\u8D25"
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
var DEFAULT_W, DEFAULT_H, nextFrame, BAKE_PROPS, MAX_RASTER;
var init_snapshot = __esm({
  "src/lib/review/snapshot.ts"() {
    DEFAULT_W = 1920;
    DEFAULT_H = 1080;
    nextFrame = () => new Promise((r3) => requestAnimationFrame(() => r3()));
    BAKE_PROPS = [
      "fill",
      "fill-opacity",
      "fill-rule",
      "stroke",
      "stroke-opacity",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "stroke-dasharray",
      "stroke-dashoffset",
      "stroke-miterlimit",
      "opacity",
      "color",
      "display",
      "visibility",
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "font-variant",
      "letter-spacing",
      "word-spacing",
      "text-anchor",
      "dominant-baseline",
      "paint-order",
      "mix-blend-mode",
      "filter",
      "clip-path",
      "stop-color",
      "stop-opacity",
      "transform",
      "transform-origin",
      "transform-box",
      "vector-effect"
    ];
    MAX_RASTER = 1920;
  }
});

// src/lib/review/overrides.ts
function applyOverrides(snap3, overrides, idMap) {
  const notes = [];
  let applied = 0;
  let geometric = 0;
  if (!overrides) return { applied, geometric, notes };
  for (const [id2, patch] of Object.entries(overrides)) {
    const el = idMap.get(id2);
    if (!el || !patch) continue;
    const style = el.style;
    if (patch.fill !== void 0) {
      style.setProperty("fill", patch.fill === "none" ? "none" : patch.fill);
    }
    if (patch.stroke !== void 0) style.setProperty("stroke", patch.stroke === "none" ? "none" : patch.stroke);
    if (patch.strokeWidth !== void 0) style.setProperty("stroke-width", String(patch.strokeWidth));
    if (patch.opacity !== void 0) style.setProperty("opacity", String(patch.opacity));
    if (patch.fontSize !== void 0) style.setProperty("font-size", `${patch.fontSize}px`);
    if (patch.letterSpacing !== void 0) style.setProperty("letter-spacing", `${patch.letterSpacing}px`);
    if (patch.text !== void 0) el.textContent = patch.text;
    if (patch.cornerRadius !== void 0 && el.localName === "rect") {
      el.setAttribute("rx", String(patch.cornerRadius));
      el.setAttribute("ry", String(patch.cornerRadius));
    }
    if (patch.width !== void 0 && el.localName === "rect") el.setAttribute("width", String(patch.width));
    if (patch.height !== void 0 && el.localName === "rect") el.setAttribute("height", String(patch.height));
    const wantsGeom = patch.x !== void 0 || patch.y !== void 0 || patch.rotation !== void 0 || patch.scale !== void 0;
    if (wantsGeom) {
      const bbox = el.getBBox?.();
      const parts = [];
      if (bbox && (patch.x !== void 0 || patch.y !== void 0)) {
        const dx = (patch.x ?? bbox.x) - bbox.x;
        const dy = (patch.y ?? bbox.y) - bbox.y;
        parts.push(`translate(${round2(dx)}px, ${round2(dy)}px)`);
      }
      if (patch.rotation !== void 0 || patch.scale !== void 0) {
        parts.push(`rotate(${round2(patch.rotation ?? 0)}deg)`);
        parts.push(`scale(${round2(patch.scale ?? 1)})`);
      }
      if (parts.length) {
        style.setProperty("transform-box", "fill-box");
        style.setProperty("transform-origin", "center");
        style.setProperty("transform", parts.join(" "));
        geometric++;
      }
    }
    applied++;
  }
  if (geometric) notes.push(`\u8986\u76D6\uFF1A${geometric} \u5904\u4F4D\u79FB/\u65CB\u8F6C\u6309 CSS transform \u8FD1\u4F3C\u590D\u73B0\uFF0C\u53EF\u80FD\u4E0E\u753B\u5E03\u6709\u4E9A\u50CF\u7D20\u5DEE`);
  return { applied, geometric, notes };
}
var round2;
var init_overrides = __esm({
  "src/lib/review/overrides.ts"() {
    round2 = (v2) => Math.round(v2 * 100) / 100;
  }
});

// src/lib/review/layout.ts
function overlapArea(a, b2) {
  const dx = Math.min(a[0] + a[2], b2[0] + b2[2]) - Math.max(a[0], b2[0]);
  const dy = Math.min(a[1] + a[3], b2[1] + b2[3]) - Math.max(a[1], b2[1]);
  return Math.max(0, dx) * Math.max(0, dy);
}
function unionBBox(boxes) {
  const x0 = Math.min(...boxes.map((b2) => b2[0]));
  const y0 = Math.min(...boxes.map((b2) => b2[1]));
  const x1 = Math.max(...boxes.map((b2) => b2[0] + b2[2]));
  const y1 = Math.max(...boxes.map((b2) => b2[1] + b2[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}
function isRuleLine(el, W3, H2) {
  const b2 = bboxOf(el);
  if (b2[2] <= 0 || b2[3] <= 0) return false;
  const role = String(el.role || "").toLowerCase();
  if (/rule|divider|separator/.test(role)) return true;
  const thin = Math.min(b2[2], b2[3]) <= Math.max(2, 3e-3 * Math.min(W3, H2));
  const long = Math.max(b2[2], b2[3]) >= 0.25 * Math.max(W3, H2);
  return thin && long;
}
function horizontalOverlapShare(line, content) {
  const inter = Math.max(0, Math.min(line[0] + line[2], content[0] + content[2]) - Math.max(line[0], content[0]));
  return inter / Math.max(1e-6, content[2]);
}
function median(values) {
  if (!values.length) return 0;
  const s2 = [...values].sort((a, b2) => a - b2);
  const mid = Math.floor(s2.length / 2);
  return s2.length % 2 ? s2[mid] : (s2[mid - 1] + s2[mid]) / 2;
}
function pct(values, q3) {
  if (!values.length) return 0;
  const s2 = [...values].sort((a, b2) => a - b2);
  if (s2.length === 1) return s2[0];
  const pos = (s2.length - 1) * q3 / 100;
  const lo2 = Math.floor(pos);
  const hi3 = Math.ceil(pos);
  if (lo2 === hi3) return s2[lo2];
  return s2[lo2] + (s2[hi3] - s2[lo2]) * (pos - lo2);
}
function weightedMedianSize(texts) {
  const items = texts.filter((t2) => t2.fontSize).map((t2) => ({ size: t2.fontSize, weight: Math.max(1, t2.charCount || 1) }));
  if (!items.length) return null;
  items.sort((a, b2) => a.size - b2.size);
  const total = items.reduce((s2, it4) => s2 + it4.weight, 0);
  let acc = 0;
  for (const it4 of items) {
    acc += it4.weight;
    if (acc >= total / 2) return it4.size;
  }
  return items[items.length - 1].size;
}
function groupMembers(els, W3, H2, fallback = true) {
  const groups = /* @__PURE__ */ new Map();
  for (const e2 of els) {
    if (isRuleLine(e2, W3, H2) || isCanvasBg(e2, W3, H2)) continue;
    const gid = e2.group || e2.container || (fallback ? "canvas" : void 0);
    if (!gid) continue;
    const list = groups.get(gid) || [];
    list.push(e2);
    groups.set(gid, list);
  }
  return groups;
}
function measureLayout(input) {
  const { elements: els, groupBoxes, W: W3, H: H2, medium, displayWidth, scaleLadder } = input;
  const short = Math.min(W3, H2);
  const scale2 = short / 1080;
  const to1080 = (v2) => scale2 ? v2 / scale2 : v2;
  const out = [];
  const unmeasured = [];
  const texts = els.filter(isText);
  const textIds = new Set(texts.map((t2) => t2.id));
  const containers = /* @__PURE__ */ new Set();
  for (const el of texts) {
    const cid = el.container;
    const cb = el.containerFrame || (cid ? groupBoxes[cid] : void 0);
    if (!cid || !cb) continue;
    containers.add(cid);
    const b2 = bboxOf(el);
    const over = Math.max(0, cb[0] - b2[0], cb[1] - b2[1], b2[0] + b2[2] - (cb[0] + cb[2]), b2[1] + b2[3] - (cb[1] + cb[3]));
    const value = r2(to1080(over));
    out.push({
      ruleId: "QL-01",
      element: el.id,
      measured: value,
      unit: "px@1080p",
      status: gateStatus(RULES["QL-01"].gate, value),
      method: "over_vs_container",
      metric: "overflow_px",
      evidence: {
        overflowPx: r2(over),
        container: cid,
        containerBox: cb.map(r2),
        containerSource: el.containerFrame ? "sibling_shapes" : "group_box",
        bbox: b2.map(r2),
        text: (el.text || "").slice(0, 40)
      }
    });
  }
  if (!containers.size) {
    unmeasured.push({
      ruleId: "QL-01",
      reason: "\u6587\u5B57\u6CA1\u6709\u80FD\u88C5\u4E0B\u5B83\u7684\u5BB9\u5668\uFF08SVG \u4E0D\u4F1A\u81EA\u52A8\u88C1\u526A\uFF09\uFF0C\u6EA2\u51FA\u53EA\u4F1A\u53D1\u751F\u5728\u753B\u5E03\u5916\uFF0C\u5DF2\u7531 VS-01 \u5224"
    });
  }
  {
    const imgs = els.filter((e2) => e2.kind === "image" && e2.imgW && e2.imgH);
    if (!imgs.length) {
      unmeasured.push({ ruleId: "CORE-02", reason: "\u6CA1\u6709\u53EF\u8BFB\u539F\u59CB\u5C3A\u5BF8\u7684\u4F4D\u56FE\uFF08\u53EA\u652F\u6301 data URI \u7684 PNG/JPEG\uFF09" });
    } else {
      let worst = 0;
      let worstId = "";
      for (const e2 of imgs) {
        const b2 = bboxOf(e2);
        if (!b2[2] || !b2[3]) continue;
        const ratio = b2[2] / b2[3] / (e2.imgW / e2.imgH);
        const d2 = Math.abs(ratio - 1);
        if (d2 > worst) {
          worst = d2;
          worstId = e2.id;
        }
      }
      out.push({
        ruleId: "CORE-02",
        element: worstId || "canvas",
        measured: r2(worst),
        unit: "ratio",
        status: gateStatus(RULES["CORE-02"].gate, worst),
        method: "image_aspect",
        metric: "aspect_distortion",
        evidence: {
          worstId,
          distortion: r2(worst),
          samples: imgs.length,
          note: worst ? `\u6700\u5927\u5931\u771F ${(worst * 100).toFixed(1)}%` : "\u6240\u6709\u4F4D\u56FE\u6BD4\u4F8B\u6B63\u5E38"
        }
      });
    }
  }
  let occlusionSamples = 0;
  for (const el of texts) {
    if (!el.visible) continue;
    const b2 = bboxOf(el);
    if (area(b2) <= 0) continue;
    let worst = 0;
    let culprit;
    for (const other of els) {
      if (other.id === el.id) continue;
      if (textIds.has(other.id)) continue;
      if ((other.opacity ?? 1) < 0.5) continue;
      if ((other.z ?? 0) <= (el.z ?? 0)) continue;
      const ratio = overlapArea(b2, bboxOf(other)) / Math.max(1e-6, area(b2));
      if (ratio > worst) {
        worst = ratio;
        culprit = other.id;
      }
    }
    occlusionSamples++;
    const cappedWarn = gateStatus(RULES["QL-02"].gate, worst) === "FAIL";
    out.push({
      ruleId: "QL-02",
      element: el.id,
      measured: Math.round(worst * 1e4) / 1e4,
      unit: "ratio",
      // bbox 相交只是嫌疑：要像素确认才算 FAIL
      status: cappedWarn ? "WARN" : gateStatus(RULES["QL-02"].gate, worst),
      method: "bbox_geometry",
      metric: "occlusion_ratio",
      evidence: { coveredBy: culprit, method: "bbox", note: "bbox \u76F8\u4EA4\u53EA\u7B97 WARN\uFF0C\u50CF\u7D20\u786E\u8BA4\u540E\u624D\u5347 FAIL" }
    });
  }
  if (!occlusionSamples) {
    unmeasured.push({ ruleId: "QL-02", reason: "\u6CA1\u6709\u53EF\u89C1\u6587\u5B57\uFF0C\u65E0\u906E\u6321\u53EF\u5224" });
  }
  let ql03NeedsWidth = false;
  let ql03Count = 0;
  for (const el of texts) {
    const fs6 = el.fontSize;
    if (!fs6) continue;
    if (medium === "ui" && displayWidth) {
      const eff = fs6 * displayWidth / W3;
      ql03Count++;
      out.push({
        ruleId: "QL-03",
        element: el.id,
        measured: r2(eff),
        unit: "px",
        status: gateStatus(RULES["QL-03"].gateUI?.gate, eff),
        method: "effective_font_size",
        metric: "font_size_px",
        evidence: {
          declaredFontSize: r2(fs6),
          effectiveFontSize: r2(eff),
          displayWidth,
          basis: "display_width",
          text: (el.text || "").slice(0, 30)
        }
      });
    } else if (medium === "ui") {
      ql03NeedsWidth = true;
    } else {
      const ratio = fs6 / short;
      ql03Count++;
      out.push({
        ruleId: "QL-03",
        element: el.id,
        measured: Math.round(ratio * 1e4) / 1e4,
        unit: "ratio",
        status: gateStatus(RULES["QL-03"].gate, ratio),
        method: "font_size_ratio",
        metric: "font_size_ratio",
        evidence: { declaredFontSize: r2(fs6), basis: "short_side_ratio", shortSide: short }
      });
    }
  }
  if (!ql03Count) {
    unmeasured.push({
      ruleId: "QL-03",
      reason: ql03NeedsWidth ? "SVG \u7684\u753B\u5E03\u5355\u4F4D\u4E0D\u662F\u6295\u653E\u50CF\u7D20\uFF1A\u6CA1\u6709\u586B\u6295\u653E\u5BBD\u5EA6\uFF0C\u6309 375 \u8FD8\u662F 800 \u770B\u4F1A\u5F97\u51FA\u76F8\u53CD\u7ED3\u8BBA\uFF0C\u4E0D\u80FD\u5224" : "\u6CA1\u6709\u5B57\u53F7\u4FE1\u606F"
    });
  }
  const bodyRef = weightedMedianSize(texts);
  const lhSamples = texts.filter((t2) => t2.fontSize && t2.lineHeight);
  if (!lhSamples.length) {
    unmeasured.push({ ruleId: "QL-04", reason: "\u65E2\u6CA1\u6709 CSS line-height\uFF0C\u4E5F\u6CA1\u6709\u53EF\u63A8\u57FA\u7EBF\u95F4\u8DDD\u7684\u76F8\u90BB\u884C" });
  } else {
    const sizes = new Set(lhSamples.map((t2) => r2(t2.fontSize)));
    if (sizes.size < 2) {
      unmeasured.push({ ruleId: "QL-04", reason: "\u5168\u56FE\u53EA\u6709\u4E00\u6863\u5B57\u53F7\uFF0C\u5206\u4E0D\u51FA\u6B63\u6587\u4E0E\u5C55\u793A\u7EA7\uFF0C\u884C\u9AD8\u9608\u503C\u4E0D\u9002\u7528" });
    } else {
      const displayGate = RULES["QL-04"].gateDisplay?.gate;
      for (const el of lhSamples) {
        const ratio = el.lineHeight / el.fontSize;
        const display = !!bodyRef && el.fontSize >= 1.8 * bodyRef;
        const gate = display && displayGate ? displayGate : RULES["QL-04"].gate;
        out.push({
          ruleId: "QL-04",
          element: el.id,
          measured: Math.round(ratio * 1e4) / 1e4,
          unit: "ratio",
          status: gateStatus(gate, ratio),
          method: display ? "line_height_ratio_display" : "line_height_ratio",
          metric: display ? "line_height_ratio_display" : "line_height_ratio",
          evidence: {
            lineHeight: r2(el.lineHeight),
            fontSize: r2(el.fontSize),
            display,
            bodyRef: bodyRef ? r2(bodyRef) : null,
            source: el.lineHeightSource || "css"
          }
        });
      }
    }
  }
  let vsCount = 0;
  let bleedCount = 0;
  for (const el of els) {
    const b2 = bboxOf(el);
    if (area(b2) <= 0) continue;
    if (isCanvasBg(el, W3, H2)) continue;
    vsCount++;
    const outPx = Math.max(0, -b2[0], -b2[1], b2[0] + b2[2] - W3, b2[1] + b2[3] - H2);
    const tol = 0.5 * scale2;
    const covered = overlapArea(b2, [0, 0, W3, H2]);
    const ratio = outPx <= tol ? 0 : 1 - covered / Math.max(1e-6, area(b2));
    const value = Math.round(ratio * 1e4) / 1e4;
    const isContent = el.kind === "text" || el.kind === "image";
    let status = gateStatus(RULES["VS-01"].gate, value);
    if (!isContent) {
      status = value >= 0.98 ? "WARN" : "PASS";
      if (status === "WARN") bleedCount++;
    }
    out.push({
      ruleId: "VS-01",
      element: el.id,
      measured: value,
      unit: "ratio",
      status,
      method: "out_of_canvas",
      metric: "out_of_canvas",
      evidence: {
        outPx: r2(outPx),
        tolerancePx: r2(tol),
        bbox: b2.map(r2),
        canvas: [W3, H2],
        kind: el.kind,
        note: isContent ? "\u5185\u5BB9\u88AB\u753B\u5E03\u88C1\u6389" : status === "WARN" ? "\u6574\u4E2A\u5143\u7D20\u90FD\u5728\u753B\u5E03\u5916\uFF1A\u7B49\u4E8E\u6CA1\u753B" : "\u88C5\u9970\u56FE\u5F62\u51FA\u8840\uFF1A\u523B\u610F\u505A\u51FA\u753B\u53EF\u5FFD\u7565"
      }
    });
    if (value > 0) continue;
    const mx = 0.05 * W3;
    const my = 0.05 * H2;
    let outsideSafe = Math.min(b2[0] - mx, b2[1] - my, W3 - mx - (b2[0] + b2[2]), H2 - my - (b2[1] + b2[3]));
    if (isCanvasBg(el, W3, H2) || el.kind !== "text") outsideSafe = 0;
    const safeValue = r2(to1080(Math.max(0, -outsideSafe)));
    if (safeValue > Math.max(2, 0.01 * short)) {
      out.push({
        ruleId: "VS-01",
        element: el.id,
        measured: safeValue,
        unit: "px@1080p",
        status: "WARN",
        method: "safe_area_5pct",
        metric: "out_of_safe",
        evidence: { outsidePx: r2(Math.max(0, -outsideSafe)), bbox: b2.map(r2) }
      });
    }
  }
  if (!vsCount) unmeasured.push({ ruleId: "VS-01", reason: "\u6CA1\u6709\u5143\u7D20\uFF0C\u65E0\u51FA\u753B\u53EF\u5224" });
  const declaredGroups = groupMembers(els, W3, H2, false);
  const groups = groupMembers(els, W3, H2);
  if (declaredGroups.size < 2) {
    unmeasured.push({
      ruleId: "GR-02",
      reason: `\u5206\u7EC4\u53EA\u6709 ${declaredGroups.size} \u4E2A\uFF1A\u7D20\u6750\u91CC\u6CA1\u6709\u53EF\u8BC6\u522B\u7684 <g> \u5206\u7EC4\uFF0C\u7EC4\u95F4\u7F1D\u65E0\u4ECE\u6BD4\u8F83`
    });
  } else {
    const gb = /* @__PURE__ */ new Map();
    for (const [gid, members] of declaredGroups) gb.set(gid, unionBBox(members.map(bboxOf)));
    const seamsOn = (axis2) => {
      const ordered = [...gb.entries()].sort((a, b2) => a[1][axis2] - b2[1][axis2]);
      const res = [];
      for (let i2 = 1; i2 < ordered.length; i2++) {
        const [g1, b1] = ordered[i2 - 1];
        const [g2, b2] = ordered[i2];
        const gap = b2[axis2] - (b1[axis2] + b1[axis2 + 2]);
        if (gap > 0.5) res.push({ from: g1, to: g2, gap });
      }
      return res;
    };
    const sy = seamsOn(1);
    const sx = seamsOn(0);
    const useY = sy.length >= sx.length && sy.length > 0;
    const seams = useY ? sy : sx;
    const axis = useY ? 1 : 0;
    const within = [];
    for (const members of declaredGroups.values()) {
      const ms2 = [...members].sort((a, b2) => bboxOf(a)[axis] - bboxOf(b2)[axis]);
      for (let i2 = 1; i2 < ms2.length; i2++) {
        const ba2 = bboxOf(ms2[i2 - 1]);
        const bb = bboxOf(ms2[i2]);
        const gap = bb[axis] - (ba2[axis] + ba2[axis + 2]);
        if (gap >= 0.5 && gap <= 400 * scale2) within.push(gap);
      }
    }
    if (!seams.length) {
      unmeasured.push({ ruleId: "GR-02", reason: "\u7EC4\u95F4\u6CA1\u6709\u6B63\u95F4\u8DDD\uFF1A\u5404\u7EC4\u5728 x/y \u4E0A\u90FD\u91CD\u53E0\uFF0C\u65E0\u6CD5\u5224\u5206\u7EC4" });
    } else if (within.length < 2) {
      unmeasured.push({ ruleId: "GR-02", reason: `\u7EC4\u5185\u76F8\u90BB\u95F4\u8DDD\u6837\u672C ${within.length} < 2\uFF0C\u65E0\u6CD5\u7B97\u7EC4\u5185\u57FA\u51C6` });
    } else {
      const wmed = median(within);
      const value = r2(Math.min(...seams.map((s2) => s2.gap)) / wmed);
      out.push({
        ruleId: "GR-02",
        element: "canvas",
        measured: value,
        unit: "ratio",
        status: gateStatus(RULES["GR-02"].gate, value),
        method: "between_over_within",
        metric: "group_gap_ratio",
        evidence: {
          axis: axis === 1 ? "y" : "x",
          groups: declaredGroups.size,
          withinMedian: r2(wmed),
          withinSamples: within.length,
          betweenMin: r2(Math.min(...seams.map((s2) => s2.gap))),
          seams: seams.slice(0, 6).map((s2) => ({ ...s2, gap: r2(s2.gap) }))
        }
      });
    }
  }
  const ruleLines = els.filter((e2) => isRuleLine(e2, W3, H2));
  const hLines = ruleLines.filter((e2) => bboxOf(e2)[2] >= bboxOf(e2)[3] * 3);
  if (!hLines.length) {
    unmeasured.push({ ruleId: "AL-02", reason: "\u6CA1\u6709\u68C0\u6D4B\u5230\u6A2A\u5411\u5206\u9694\u7EBF\uFF08\u7EC6\u957F rect/line\uFF0C\u6216 role \u542B rule/divider\uFF09" });
  } else {
    const content = els.filter((e2) => !ruleLines.includes(e2) && !isCanvasBg(e2, W3, H2));
    const rows = [];
    for (const line of hLines) {
      const lb = bboxOf(line);
      const above = content.map(bboxOf).filter((b2) => horizontalOverlapShare(lb, b2) >= 0.5 && b2[1] + b2[3] <= lb[1] + 1);
      const below = content.map(bboxOf).filter((b2) => horizontalOverlapShare(lb, b2) >= 0.5 && b2[1] >= lb[1] + lb[3] - 1);
      if (!above.length || !below.length) continue;
      const gapAbove = lb[1] - Math.max(...above.map((b2) => b2[1] + b2[3]));
      const gapBelow = Math.min(...below.map((b2) => b2[1])) - (lb[1] + lb[3]);
      if (gapAbove < -1 || gapBelow < -1) continue;
      rows.push({ id: line.id, gapAbove, gapBelow, delta: Math.abs(gapAbove - gapBelow), bbox: lb });
    }
    if (!rows.length) {
      unmeasured.push({ ruleId: "AL-02", reason: `\u68C0\u6D4B\u5230 ${hLines.length} \u6761\u5206\u9694\u7EBF\uFF0C\u4F46\u6CA1\u6709\u4E00\u6761\u4E24\u4FA7\u90FD\u6709\u5185\u5BB9` });
    } else {
      const worst = rows.reduce((a, b2) => b2.delta > a.delta ? b2 : a, rows[0]);
      const value = r2(to1080(worst.delta));
      out.push({
        ruleId: "AL-02",
        element: worst.id,
        measured: value,
        unit: "px@1080p",
        status: gateStatus(RULES["AL-02"].gate, value),
        method: "rule_line_padding_delta",
        metric: "rule_line_gap_delta_px",
        evidence: {
          gapAbove: r2(worst.gapAbove),
          gapBelow: r2(worst.gapBelow),
          bbox: worst.bbox.map(r2),
          rows: rows.slice(0, 6).map((r3) => ({ id: r3.id, gapAbove: r2(r3.gapAbove), gapBelow: r2(r3.gapBelow) }))
        }
      });
    }
  }
  let alignSamples = 0;
  const alignRows = [];
  for (const [gid, members] of groups) {
    const groupTexts = members.filter((t2) => isText(t2) && (t2.charCount || 0) >= 3 && (t2.align === "start" || !t2.align));
    if (groupTexts.length < 4) continue;
    const lefts = groupTexts.map((t2) => bboxOf(t2)[0]);
    const columns = [];
    for (const v2 of [...lefts].sort((a, b2) => a - b2)) {
      const last = columns[columns.length - 1];
      if (!last || v2 - last[last.length - 1] > 2) columns.push([v2]);
      else last.push(v2);
    }
    let worst = null;
    for (const col of columns) {
      if (col.length < 3) continue;
      const anchor = median(col);
      const devs = col.map((v2) => Math.abs(v2 - anchor));
      const p90 = to1080(pct(devs, 90));
      if (!worst || p90 > worst.p90) worst = { anchor: r2(anchor), p90: r2(p90), samples: col.length };
    }
    if (!worst) continue;
    alignSamples += worst.samples;
    alignRows.push({ group: gid, ...worst });
  }
  if (alignSamples < 4) {
    unmeasured.push({
      ruleId: "AL-01",
      reason: texts.length ? `\u53EF\u7528\u4E8E\u5BF9\u9F50\u7684\u6587\u5B57\u53EA\u6709 ${alignSamples} \u4E2A\uFF1A\u9010\u5B57\u62C6\u7684\u5355\u5B57\u4E0E\u5C45\u4E2D/\u53F3\u5BF9\u9F50\u7684\u6587\u5B57\u4E0D\u53C2\u4E0E\u5DE6\u8FB9\u7F18\u5224\u5B9A` : "\u6CA1\u6709\u6587\u5B57\u5143\u7D20\uFF0C\u5BF9\u9F50\u4E0D\u53EF\u5224"
    });
  } else {
    for (const row of alignRows) {
      out.push({
        ruleId: "AL-01",
        element: row.group,
        measured: row.p90,
        unit: "px@1080p",
        status: gateStatus(RULES["AL-01"].gate, row.p90),
        method: "left_edge_p90",
        metric: "align_dev_p90",
        evidence: { anchor: row.anchor, samples: row.samples }
      });
    }
  }
  const gridItems = els.filter((e2) => !isCanvasBg(e2, W3, H2));
  if (gridItems.length < 5) {
    unmeasured.push({ ruleId: "GR-01", reason: `\u5143\u7D20 ${gridItems.length} < 5\uFF0C\u7F51\u683C\u4E0D\u53EF\u63A8\u65AD` });
  } else {
    const cluster = (vals) => {
      const outv = [];
      for (const v2 of [...vals].sort((a, b2) => a - b2)) {
        if (!outv.length || v2 - outv[outv.length - 1] > 1) outv.push(v2);
      }
      return outv;
    };
    const gcd = (a, b2) => b2 ? gcd(b2, a % b2) : a;
    const unitOf = (vals) => {
      const centers = cluster(vals);
      const deltas = centers.slice(1).map((v2, i2) => v2 - centers[i2]).filter((d2) => d2 > 1);
      const ints = deltas.map((d2) => Math.round(d2));
      if (deltas.length && deltas.every((d2, i2) => Math.abs(d2 - ints[i2]) <= 0.75)) {
        let g2 = 0;
        for (const i2 of ints) g2 = gcd(g2, i2);
        if (g2 >= 4 && g2 <= 160) return g2;
      }
      const candidates = [...new Set(deltas.filter((d2) => d2 >= 4 && d2 <= 160).map((d2) => Math.round(d2 * 100) / 100))].sort(
        (a, b2) => a - b2
      );
      for (const cand of candidates) {
        const tol = Math.max(0.5, Math.min(2, 0.05 * cand));
        const share = vals.filter((v2) => Math.abs(v2 - Math.round(v2 / cand) * cand) <= tol).length / vals.length;
        if (share >= 0.8) return cand;
      }
      return null;
    };
    const units = [unitOf(gridItems.map((e2) => bboxOf(e2)[0])), unitOf(gridItems.map((e2) => bboxOf(e2)[1]))].filter(
      (u2) => typeof u2 === "number"
    );
    if (!units.length) {
      unmeasured.push({ ruleId: "GR-01", reason: "\u5750\u6807\u6CA1\u6709\u7A33\u5B9A\u7684\u516C\u7EA6\u6570\u6216\u91CD\u590D\u5355\u5143\uFF0C\u7F51\u683C\u4E0D\u53EF\u63A8\u65AD\uFF08\u4E0D\u9000\u56DE 1px \u5BB9\u5DEE\uFF09" });
    } else {
      const unit = Math.max(...units);
      const tol = Math.max(0.5, Math.min(2, 0.05 * unit));
      const on2 = gridItems.filter((e2) => {
        const b2 = bboxOf(e2);
        return Math.abs(b2[0] - Math.round(b2[0] / unit) * unit) <= tol || Math.abs(b2[1] - Math.round(b2[1] / unit) * unit) <= tol;
      });
      const share = Math.round(on2.length / gridItems.length * 1e3) / 1e3;
      out.push({
        ruleId: "GR-01",
        element: "canvas",
        measured: share,
        unit: "ratio",
        status: gateStatus(RULES["GR-01"].gate, share),
        method: "grid_unit_share",
        metric: "grid_align_share",
        evidence: {
          unit: r2(unit),
          samples: gridItems.length,
          aligned: on2.length,
          tolerance: r2(tol),
          offGrid: gridItems.filter((e2) => !on2.includes(e2)).slice(0, 6).map((e2) => e2.id)
        }
      });
    }
  }
  const sizeList = [...new Set(texts.filter((t2) => t2.fontSize).map((t2) => r2(t2.fontSize)))].sort((a, b2) => b2 - a);
  if (sizeList.length < 2) {
    unmeasured.push({ ruleId: "CT-01", reason: "\u5B57\u53F7\u6863\u4F4D < 2\uFF0C\u5C42\u7EA7\u4E0D\u53EF\u5224" });
  } else {
    const body = bodyRef || median(texts.filter((t2) => t2.fontSize).map((t2) => t2.fontSize));
    const r12 = sizeList[1] ? r2(sizeList[0] / sizeList[1]) : 0;
    const rmb = body ? r2(sizeList[0] / body) : 0;
    out.push({
      ruleId: "CT-01",
      element: "canvas",
      measured: r12,
      unit: "ratio",
      status: gateStatus(RULES["CT-01"].gate, r12),
      method: "rank1_over_rank2",
      metric: "size_ratio_rank1_rank2",
      evidence: { sizes: sizeList, body: r2(body) }
    });
    const sub = RULES["CT-01"].secondary;
    if (sub?.gate) {
      out.push({
        ruleId: "CT-01",
        element: "canvas",
        measured: rmb,
        unit: "ratio",
        status: gateStatus(sub.gate, rmb),
        method: "rank1_over_body",
        metric: "size_ratio_rank1_body",
        evidence: { sizes: sizeList, body: r2(body) }
      });
    }
  }
  const placeholders = /* @__PURE__ */ new Set(["text", "rect", "line", "circle", "ellipse", "polygon", "polyline", "shape", "g", "group", "", "none", "image"]);
  const sigs = /* @__PURE__ */ new Map();
  for (const el of els) {
    if (!el.style || !el.id) continue;
    const role = String(el.role || "").toLowerCase();
    if (placeholders.has(role)) continue;
    const key = role;
    const sig = JSON.stringify([el.style.fill, el.style.weight, el.kind]);
    const buckets = sigs.get(key) || /* @__PURE__ */ new Map();
    const list = buckets.get(sig) || [];
    list.push(el.id);
    buckets.set(sig, list);
    sigs.set(key, buckets);
  }
  if (!sigs.size) {
    unmeasured.push({ ruleId: "GE-02", reason: "\u6CA1\u6709 class \u6807\u6CE8\uFF1A\u5206\u4E0D\u51FA\u300C\u540C\u7C7B\u300D\uFF0C\u4E0D\u80FD\u6BD4\u8F83\u5916\u89C2" });
  } else {
    let emitted = 0;
    for (const [role, buckets] of sigs) {
      if (buckets.size < 2) continue;
      const sizes = [...buckets.values()].map((ids) => ids.length);
      if (Math.max(...sizes) < 2) continue;
      const biggest = [...buckets.values()].sort((a, b2) => b2.length - a.length)[0];
      const outliers = [...buckets.values()].filter((ids) => ids !== biggest).flat();
      out.push({
        ruleId: "GE-02",
        element: outliers.slice(0, 4).join(", "),
        measured: buckets.size,
        unit: "count",
        status: "WARN",
        method: "style_signature",
        evidence: { class: role, majority: biggest.slice(0, 4), variants: buckets.size, all: outliers.slice(0, 8) }
      });
      emitted++;
    }
    if (!emitted) {
      out.push({
        ruleId: "GE-02",
        element: "canvas",
        measured: 1,
        unit: "count",
        status: gateStatus(RULES["GE-02"].gate, 1),
        method: "style_signature",
        evidence: { note: "\u540C\u7C7B\u5143\u7D20\u5916\u89C2\u4E00\u81F4" }
      });
    }
  }
  const sortedX = [...els].filter((e2) => area(bboxOf(e2)) > 0).sort((a, b2) => bboxOf(a)[0] - bboxOf(b2)[0]);
  const gaps = [];
  for (let i2 = 1; i2 < sortedX.length; i2++) {
    const ba2 = bboxOf(sortedX[i2 - 1]);
    const bb = bboxOf(sortedX[i2]);
    const gap = Math.round(bb[0] - (ba2[0] + ba2[2]));
    if (gap >= 1 && gap <= 400) gaps.push(gap);
  }
  {
    const groups2 = groupMembers(els, W3, H2, false);
    let offBand = 0;
    let samples = 0;
    const detail = [];
    for (const [gid, list] of groups2) {
      if (list.length < 3) continue;
      const sorted = [...list].sort((a, b2) => bboxOf(a)[0] - bboxOf(b2)[0]);
      const local = [];
      for (let i2 = 1; i2 < sorted.length; i2++) {
        const ba2 = bboxOf(sorted[i2 - 1]);
        const bb = bboxOf(sorted[i2]);
        const g2 = Math.round(bb[0] - (ba2[0] + ba2[2]));
        if (g2 >= 0 && g2 <= 400) local.push(g2);
      }
      if (local.length < 2) continue;
      samples += local.length;
      const bands = local.map((v2) => Math.max(0, Math.round(v2 / 8)));
      const freq = /* @__PURE__ */ new Map();
      for (const b2 of bands) freq.set(b2, (freq.get(b2) || 0) + 1);
      const mode = [...freq.entries()].sort((a, b2) => b2[1] - a[1] || a[0] - b2[0])[0][0];
      const k2 = bands.filter((b2) => b2 !== mode).length;
      if (k2 > 0) {
        offBand += k2;
        detail.push({ group: gid, gaps: local.slice(0, 8), modePx: mode * 8 });
      }
    }
    if (samples < 3) {
      unmeasured.push({ ruleId: "SP-01", reason: `\u7EC4\u5185\u76F8\u90BB\u95F4\u8DDD\u6837\u672C ${samples} < 3` });
    } else {
      out.push({
        ruleId: "SP-01",
        element: "spacing",
        measured: offBand,
        unit: "count",
        status: gateStatus(RULES["SP-01"].gate, offBand),
        method: "group_gap_band",
        metric: "spacing_off_band",
        evidence: { offBand, samples, groups: detail.slice(0, 5) }
      });
    }
  }
  if (!texts.length) {
    for (const rid of ["TY-01", "TY-04", "TY-05", "TY-06", "TY-07", "TY-08", "RP-01", "TX-01"]) {
      unmeasured.push({ ruleId: rid, reason: "\u6CA1\u6709\u6587\u5B57\u5143\u7D20\uFF0C\u5B57\u4F53\u7CFB\u7EDF\u89C4\u5219\u4E0D\u9002\u7528" });
    }
  } else {
    const fams = new Set(texts.map((t2) => t2.fontFamily).filter(Boolean));
    const sizes = [...new Set(texts.filter((t2) => t2.fontSize).map((t2) => r2(t2.fontSize)))].sort((a, b2) => a - b2);
    const weights = new Set(texts.map((t2) => Math.round(t2.fontWeight || 400)));
    const colors = new Set(texts.map((t2) => String(t2.fill || "").toUpperCase()).filter((c) => c && c !== "NONE"));
    const pushCanvas = (ruleId, value, unit, method, evidence, gate = RULES[ruleId].gate) => {
      out.push({ ruleId, element: "canvas", measured: value, unit, status: gateStatus(gate, value), method, evidence });
    };
    {
      const sizeLevels = sizes.length;
      const weightLevels = weights.size;
      const famCount = fams.size;
      const overSize = Math.max(0, sizeLevels - 5);
      const overWeight = Math.max(0, weightLevels - 3);
      const measured = Math.max(overSize, overWeight);
      out.push({
        ruleId: "TY-01",
        element: "canvas",
        measured,
        unit: "count",
        status: gateStatus(RULES["TY-01"].gate, measured),
        method: "type_budget",
        metric: "type_budget_over",
        evidence: {
          families: famCount,
          familyList: [...fams].sort().slice(0, 6),
          sizeLevels,
          weightLevels,
          overSize,
          overWeight,
          sizes,
          weights: [...weights].sort((a, b2) => a - b2),
          note: [
            `\u5B57\u53F7 ${sizeLevels} \u6863${overSize ? `\uFF08\u8D85 ${overSize}\uFF09` : ""}\uFF1A${sizes.join(" / ")}`,
            `\u5B57\u91CD ${weightLevels} \u6863${overWeight ? `\uFF08\u8D85 ${overWeight}\uFF09` : ""}\uFF1A${[...weights].sort((a, b2) => a - b2).join(" / ")}`,
            `\u5B57\u65CF ${famCount}`
          ].join(" \xB7 ")
        }
      });
    }
    {
      const DEFAULT_ROLES = /* @__PURE__ */ new Set(["text", "shape", "image", "group", "other"]);
      const roleOf = (e2) => e2.role && !DEFAULT_ROLES.has(e2.role) ? e2.role : "";
      const peers = els.filter((e2) => roleOf(e2) && !isRuleLine(e2, W3, H2) && !isCanvasBg(e2, W3, H2));
      if (peers.length < 2) {
        unmeasured.push({ ruleId: "RP-01", reason: "\u5143\u7D20\u6CA1\u6709 class \u6216 role\uFF0C\u5206\u4E0D\u51FA\u300C\u540C\u7C7B\u300D\uFF0C\u4E0D\u5224\u5B9A" });
      } else {
        const byRole = /* @__PURE__ */ new Map();
        for (const e2 of peers) {
          const key = roleOf(e2);
          const list = byRole.get(key) || [];
          list.push(e2);
          byRole.set(key, list);
        }
        let deviants = 0;
        const detail = [];
        for (const [role, arr] of byRole) {
          if (arr.length < 2) continue;
          const sig = (e2) => e2.kind === "text" ? [r2(e2.fontSize || 0), Math.round(e2.fontWeight || 400), String(e2.fill || "").toUpperCase()].join("|") : [Math.round(bboxOf(e2)[2]), Math.round(bboxOf(e2)[3]), String(e2.fill || "").toUpperCase()].join("|");
          const counts = /* @__PURE__ */ new Map();
          for (const e2 of arr) {
            const key = sig(e2);
            counts.set(key, (counts.get(key) || 0) + 1);
          }
          if (counts.size <= 1) continue;
          deviants += arr.length - Math.max(...counts.values());
          detail.push({ role, kind: arr[0].kind, variants: counts.size, size: arr.length });
        }
        out.push({
          ruleId: "RP-01",
          element: "canvas",
          measured: deviants,
          unit: "count",
          status: gateStatus(RULES["RP-01"].gate, deviants),
          method: "peer_signature",
          metric: "peer_deviants",
          evidence: { deviants, roles: detail.slice(0, 6) }
        });
      }
    }
    const ratios = sizes.slice(1).map((v2, i2) => Math.round(v2 / sizes[i2] * 100) / 100);
    if (ratios.length) pushCanvas("TY-05", Math.min(...ratios), "ratio", "min_adjacent_ratio", { ratios });
    else unmeasured.push({ ruleId: "TY-05", reason: "\u5B57\u53F7\u6863\u4F4D < 2\uFF0C\u76F8\u90BB\u6BD4\u4E0D\u53EF\u7B97" });
    pushCanvas("TY-06", weights.size, "count", "weight_levels", { weights: [...weights].sort((a, b2) => a - b2) });
    {
      const rows = texts.filter((t2) => (t2.charCount || (t2.text || "").length) > 0);
      if (!rows.length) {
        unmeasured.push({ ruleId: "TY-02", reason: "\u6CA1\u6709\u53EF\u6D4B\u7684\u6587\u5B57\u5185\u5BB9" });
      } else {
        let worst = 0;
        let worstId = "";
        let worstChars = 0;
        let worstLimit = 0;
        for (const t2 of rows) {
          const content = t2.text || "";
          const cjkShare = (content.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length / Math.max(1, content.length);
          const limit = cjkShare > 0.3 ? 40 : 80;
          const chars = t2.charCount || content.length;
          const ratio = chars / limit;
          if (ratio > worst) {
            worst = ratio;
            worstId = t2.id;
            worstChars = chars;
            worstLimit = limit;
          }
        }
        out.push({
          ruleId: "TY-02",
          element: worstId || "canvas",
          measured: r2(worst),
          unit: "ratio",
          status: gateStatus(RULES["TY-02"].gate, worst),
          method: "chars_per_line",
          metric: "line_length_ratio",
          evidence: {
            worstId,
            ratio: r2(worst),
            chars: worstChars,
            limit: worstLimit,
            note: `\u6700\u957F\u4E00\u884C ${worstChars} \u5B57\uFF0C\u4E0A\u9650 ${worstLimit}\uFF08CJK 40 / \u5176\u4ED6 80\uFF09`
          }
        });
      }
    }
    const sat = (c) => {
      const m2 = /^#([0-9a-f]{6})$/i.exec(c);
      if (!m2) return 0;
      const r3 = parseInt(m2[1].slice(0, 2), 16);
      const g2 = parseInt(m2[1].slice(2, 4), 16);
      const b2 = parseInt(m2[1].slice(4, 6), 16);
      return (Math.max(r3, g2, b2) - Math.min(r3, g2, b2)) / 255;
    };
    const lum = (c) => {
      const m2 = /^#([0-9a-f]{6})$/i.exec(c);
      if (!m2) return 0;
      const ch2 = (v2) => {
        const s2 = v2 / 255;
        return s2 <= 0.04045 ? s2 / 12.92 : ((s2 + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch2(parseInt(m2[1].slice(0, 2), 16)) + 0.7152 * ch2(parseInt(m2[1].slice(2, 4), 16)) + 0.0722 * ch2(parseInt(m2[1].slice(4, 6), 16));
    };
    const colorList = [...colors];
    const hexOnly = colorList.filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    if (!hexOnly.length) {
      unmeasured.push({ ruleId: "TX-01", reason: "\u6587\u5B57\u989C\u8272\u4E0D\u662F\u5341\u516D\u8FDB\u5236\uFF08\u53EF\u80FD\u662F\u6E10\u53D8\u6216 currentColor\uFF09\uFF0C\u6CA1\u6709\u53EF\u89E3\u6790\u7684\u586B\u5145\u8272" });
    } else {
      const neutral = hexOnly.filter((c) => sat(c) < 0.2 && lum(c) < 0.75).sort();
      const accent = hexOnly.filter((c) => sat(c) >= 0.2).sort();
      const inverted = hexOnly.filter((c) => lum(c) >= 0.75).sort();
      pushCanvas("TX-01", neutral.length, "count", "text_neutral_colors", { colors: neutral, inverted, accent });
      const sub = RULES["TX-01"].secondary;
      if (sub?.gate) pushCanvas("TX-01", accent.length, "count", "text_accent_colors", { colors: accent }, sub.gate);
    }
    const centered = texts.filter((t2) => (t2.align === "middle" || t2.align === "center") && (t2.charCount || 0) > 30);
    out.push({
      ruleId: "TY-07",
      element: centered.slice(0, 4).map((t2) => t2.id).join(", ") || "canvas",
      measured: centered.length,
      unit: "count",
      status: gateStatus(RULES["TY-07"].gate, centered.length),
      method: "centered_long_text",
      evidence: { ids: centered.slice(0, 8).map((t2) => t2.id) }
    });
    const thin = texts.filter((t2) => (t2.fontWeight || 400) <= 300 && (t2.fontSize || 99) < 24);
    out.push({
      ruleId: "TY-08",
      element: thin.slice(0, 4).map((t2) => t2.id).join(", ") || "canvas",
      measured: thin.length,
      unit: "count",
      status: gateStatus(RULES["TY-08"].gate, thin.length),
      method: "thin_weight_small",
      evidence: { ids: thin.slice(0, 8).map((t2) => ({ id: t2.id, fontSize: r2(t2.fontSize || 0) })) }
    });
    if (!scaleLadder?.length) {
      unmeasured.push({ ruleId: "TY-04", reason: "\u6CA1\u6709\u586B\u5199\u5B57\u53F7\u9636\u68AF\uFF0C\u65E0\u6CD5\u5224\u65AD\u9636\u68AF\u5916\u5B57\u53F7" });
    } else {
      const off = texts.filter((t2) => t2.fontSize && !scaleLadder.some((v2) => Math.abs(t2.fontSize - v2) < 0.6));
      out.push({
        ruleId: "TY-04",
        element: off.slice(0, 4).map((t2) => t2.id).join(", ") || "none",
        measured: off.length,
        unit: "count",
        status: gateStatus(RULES["TY-04"].gate, off.length),
        method: "off_scale_sizes",
        evidence: { ladder: [...scaleLadder].sort((a, b2) => a - b2), off: off.slice(0, 8).map((t2) => ({ id: t2.id, fontSize: r2(t2.fontSize) })) }
      });
    }
  }
  return { findings: out, unmeasured };
}
var bboxOf, area, isText, isCanvasBg, r2;
var init_layout = __esm({
  "src/lib/review/layout.ts"() {
    init_rules2();
    bboxOf = (el) => el.bbox;
    area = (b2) => b2[2] * b2[3];
    isText = (el) => el.kind === "text" || !!(el.text && el.fontSize);
    isCanvasBg = (el, W3, H2) => area(bboxOf(el)) >= 0.9 * W3 * H2;
    r2 = (v2) => Math.round(v2 * 100) / 100;
  }
});

// src/lib/review/pixels.ts
function contrastRatio(fg, bg) {
  const a = relLum(fg);
  const b2 = relLum(bg);
  const hi3 = Math.max(a, b2);
  const lo2 = Math.min(a, b2);
  return (hi3 + 0.05) / (lo2 + 0.05);
}
function medianRgb(px) {
  if (!px.length) return [0, 0, 0];
  const med = (i2) => {
    const vals = px.map((p2) => p2[i2]).sort((a, b2) => a - b2);
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
  };
  return [med(0), med(1), med(2)];
}
function modeColor(px) {
  if (!px.length) return null;
  const bins = /* @__PURE__ */ new Map();
  for (const p2 of px) {
    const k2 = p2[0] >> 3 << 10 | p2[1] >> 3 << 5 | p2[2] >> 3;
    const list = bins.get(k2) || [];
    list.push(p2);
    bins.set(k2, list);
  }
  let best = [];
  for (const list of bins.values()) if (list.length > best.length) best = list;
  return best.length ? medianRgb(best) : null;
}
function secondMode(px, bg) {
  const bl = relLum(bg);
  const bins = /* @__PURE__ */ new Map();
  for (const p2 of px) {
    if (Math.abs(relLum(p2) - bl) <= 0.02) continue;
    const k2 = p2[0] >> 3 << 10 | p2[1] >> 3 << 5 | p2[2] >> 3;
    const list = bins.get(k2) || [];
    list.push(p2);
    bins.set(k2, list);
  }
  let best = [];
  for (const list of bins.values()) if (list.length > best.length) best = list;
  if (!best.length) return null;
  return { color: medianRgb(best), share: best.length / px.length };
}
function ringPixels(px, w2, h, inset) {
  let t2 = inset ?? Math.max(1, Math.round(0.06 * Math.min(w2, h)));
  t2 = Math.max(1, Math.min(t2, Math.max(1, Math.floor(Math.min(w2, h) / 2))));
  const ring = [];
  for (let y2 = 0; y2 < h; y2++) {
    for (let x2 = 0; x2 < w2; x2++) {
      if (x2 < t2 || x2 >= w2 - t2 || y2 < t2 || y2 >= h - t2) ring.push(px[y2 * w2 + x2]);
    }
  }
  return ring;
}
function inkRatio(px, bgLum, tol = 0.15) {
  if (!px.length) return 0;
  let ink = 0;
  for (const p2 of px) if (Math.abs(relLum(p2) - bgLum) > tol) ink++;
  return ink / px.length;
}
function pickBg(px, w2, h) {
  const ring = modeColor(ringPixels(px, w2, h));
  const box = modeColor(px);
  for (const cand of [ring, box]) {
    if (!cand) continue;
    const ratio = inkRatio(px, relLum(cand));
    if (ratio >= 0.01 && ratio <= 0.5) return cand;
  }
  return ring || box;
}
function erode(mask, w2, h) {
  if (w2 < 3 || h < 3) return new Array(mask.length).fill(false);
  const out = new Array(mask.length).fill(false);
  for (let y2 = 1; y2 < h - 1; y2++) {
    for (let x2 = 1; x2 < w2 - 1; x2++) {
      const i2 = y2 * w2 + x2;
      if (mask[i2] && mask[i2 - 1] && mask[i2 + 1] && mask[i2 - w2] && mask[i2 + w2] && mask[i2 - w2 - 1] && mask[i2 - w2 + 1] && mask[i2 + w2 - 1] && mask[i2 + w2 + 1]) {
        out[i2] = true;
      }
    }
  }
  return out;
}
function coreIndexes(px, bg, w2, h) {
  const bl = relLum(bg);
  const dist = px.map((p2) => Math.abs(relLum(p2) - bl));
  const mask = dist.map((d2) => d2 > 0.15);
  const ink = mask.filter(Boolean).length / Math.max(1, mask.length);
  if (ink < 5e-3 || ink > 0.6) return null;
  const eroded = erode(mask, w2, h);
  let sel = eroded.map((v2, i2) => v2 ? i2 : -1).filter((i2) => i2 >= 0);
  let method = "eroded_core";
  if (sel.length < 12) {
    const cand = dist.filter((_2, i2) => mask[i2]).sort((a, b2) => a - b2);
    const cut = cand.length ? cand[Math.floor(0.9 * (cand.length - 1))] : 1;
    sel = dist.map((d2, i2) => mask[i2] && d2 >= cut ? i2 : -1).filter((i2) => i2 >= 0);
    method = "far_tail";
  }
  if (sel.length < 8) return null;
  return { sel, ink, method };
}
function sampleContrast(raster, bbox, fineCells = true) {
  if (!raster.image) return null;
  const s2 = raster.pixelScale;
  let x2 = Math.round(bbox[0] * s2);
  let y2 = Math.round(bbox[1] * s2);
  let w2 = Math.round(bbox[2] * s2);
  let h = Math.round(bbox[3] * s2);
  if (w2 <= 2 || h <= 2) return null;
  w2 = Math.min(w2, raster.width - x2);
  h = Math.min(h, raster.height - y2);
  if (x2 < 0) {
    w2 += x2;
    x2 = 0;
  }
  if (y2 < 0) {
    h += y2;
    y2 = 0;
  }
  if (w2 <= 2 || h <= 2) return null;
  const data = raster.image.data;
  const px = new Array(w2 * h);
  for (let j3 = 0; j3 < h; j3++) {
    for (let i2 = 0; i2 < w2; i2++) {
      const o2 = ((y2 + j3) * raster.width + (x2 + i2)) * 4;
      const a = data[o2 + 3] / 255;
      px[j3 * w2 + i2] = [
        data[o2] * a + 255 * (1 - a),
        data[o2 + 1] * a + 255 * (1 - a),
        data[o2 + 2] * a + 255 * (1 - a)
      ];
    }
  }
  const bg = pickBg(px, w2, h);
  if (!bg) return null;
  const core = coreIndexes(px, bg, w2, h);
  if (!core) {
    const alt = secondMode(px, bg);
    if (alt && alt.share >= 0.02) {
      const ratio2 = contrastRatio(alt.color, bg);
      return {
        ratio: Math.round(ratio2 * 100) / 100,
        regionWorst: Math.round(ratio2 * 100) / 100,
        fg: hex(alt.color),
        bg: hex(bg),
        inkRatio: Math.round(alt.share * 1e4) / 1e4,
        samples: Math.round(alt.share * px.length),
        sampling: "low_contrast_mode",
        regionMethod: "whole_box"
      };
    }
    let minL = 1;
    let maxL = 0;
    for (const p2 of px) {
      const l2 = relLum(p2);
      if (l2 < minL) minL = l2;
      if (l2 > maxL) maxL = l2;
    }
    if (maxL - minL <= 0.02) {
      return {
        ratio: 1,
        regionWorst: 1,
        fg: hex(bg),
        bg: hex(bg),
        inkRatio: 0,
        samples: 0,
        sampling: "no_ink",
        regionMethod: "no_ink"
      };
    }
    return null;
  }
  const fg = medianRgb(core.sel.map((i2) => px[i2]));
  const ratio = contrastRatio(fg, bg);
  let worst = ratio;
  let regionMethod = "whole_box";
  if (fineCells) {
    regionMethod = "cells_3x3";
  }
  for (let gy = 0; fineCells && gy < 3; gy++) {
    for (let gx = 0; fineCells && gx < 3; gx++) {
      const x0 = gx * w2 / 3;
      const x1 = (gx + 1) * w2 / 3;
      const y0 = gy * h / 3;
      const y1 = (gy + 1) * h / 3;
      const ids = core.sel.filter((i2) => {
        const cx = i2 % w2;
        const cy = Math.floor(i2 / w2);
        return cx >= x0 && cx < x1 && cy >= y0 && cy < y1;
      });
      if (ids.length < 8) continue;
      worst = Math.min(worst, contrastRatio(medianRgb(ids.map((i2) => px[i2])), bg));
    }
  }
  return {
    ratio: Math.round(ratio * 100) / 100,
    regionWorst: Math.round(worst * 100) / 100,
    regionMethod,
    fg: hex(fg),
    bg: hex(bg),
    inkRatio: Math.round(core.ink * 1e4) / 1e4,
    samples: core.sel.length,
    sampling: core.method
  };
}
function measureContrast(input) {
  const out = [];
  const unmeasured = [];
  const { texts, raster, W: W3, medium, displayWidth } = input;
  if (!raster || !raster.image) {
    unmeasured.push({
      ruleId: "CT-02",
      reason: raster?.error ? `\u753B\u9762\u5149\u6805\u5316\u5931\u8D25\uFF08${raster.error}\uFF09\uFF0C\u6CA1\u6709\u50CF\u7D20\u53EF\u53D6\u6837` : "\u753B\u9762\u5149\u6805\u5316\u5931\u8D25\uFF0C\u6CA1\u6709\u50CF\u7D20\u53EF\u53D6\u6837"
    });
    return { findings: out, unmeasured };
  }
  const weighted = texts.filter((t2) => (t2.fontSize || 0) > 0).map((t2) => ({ size: t2.fontSize, weight: Math.max(1, t2.charCount || 1) })).sort((a, b2) => a.size - b2.size);
  let medianFs = null;
  if (weighted.length) {
    const total = weighted.reduce((s2, it4) => s2 + it4.weight, 0);
    let acc = 0;
    for (const it4 of weighted) {
      acc += it4.weight;
      if (acc >= total / 2) {
        medianFs = it4.size;
        break;
      }
    }
  }
  const rule = RULES["CT-02"];
  let measured = 0;
  for (const el of texts) {
    if (!el.visible || (el.opacity ?? 1) < 0.05) continue;
    const sample = sampleContrast(raster, el.bbox, (el.fontSize || 0) >= 24);
    if (!sample) continue;
    measured++;
    const fs6 = el.fontSize || 0;
    const large = medium === "ui" && displayWidth ? fs6 * displayWidth / W3 >= 24 : medium === "ui" ? fs6 >= 24 : medianFs ? fs6 >= 1.8 * medianFs : false;
    const gate = large ? rule.gateLarge || rule.gate : rule.gate;
    const status = gateStatus(gate, sample.regionWorst);
    out.push({
      ruleId: "CT-02",
      element: el.id,
      measured: sample.regionWorst,
      unit: "ratio",
      status,
      method: "pixel_contrast@3x3_worst",
      metric: "contrast_ratio",
      evidence: {
        ...sample,
        note: sample.sampling === "no_ink" ? "\u6574\u5757\u6587\u5B57\u4E0E\u5E95\u8272\u51E0\u4E4E\u540C\u8272\uFF1A\u5B57\u5F62\u6CA1\u753B\u51FA\u6765\uFF0C\u6216\u989C\u8272\u8D34\u4F4F\u4E86\u80CC\u666F" : sample.sampling === "low_contrast_mode" ? "\u5B57\u8272\u4E0E\u5E95\u8272\u592A\u63A5\u8FD1\uFF0C\u53D6\u7684\u662F\u5E95\u8272\u4E4B\u5916\u5360\u6BD4\u6700\u9AD8\u7684\u90A3\u7C07\u989C\u8272" : void 0,
        bbox: el.bbox.map((v2) => Math.round(v2 * 100) / 100),
        fontSize: Math.round(fs6 * 10) / 10,
        large,
        text: (el.text || "").slice(0, 30),
        compositedOn: "#FFFFFF"
      }
    });
  }
  if (!measured) {
    unmeasured.push({ ruleId: "CT-02", reason: "\u6CA1\u6709\u53EF\u6D4B\u6587\u672C\uFF1A\u7F3A\u5B57\u53F7\u3001\u627E\u4E0D\u5230\u5B57\u5F62\u6838\u5FC3\uFF0C\u6216\u80CC\u666F\u8FC7\u4E8E\u590D\u6742" });
  }
  return { findings: out, unmeasured };
}
function measurePixels(raster) {
  const out = [];
  const data = raster.image.data;
  const W3 = raster.width;
  const H2 = raster.height;
  const n3 = W3 * H2;
  const step = Math.max(1, Math.floor(Math.sqrt(n3 / 4e5)));
  const gw = Math.ceil(W3 / step);
  const gh2 = Math.ceil(H2 / step);
  const hist = /* @__PURE__ */ new Map();
  const px = new Array(gw * gh2);
  for (let j3 = 0; j3 < gh2; j3++) {
    const y2 = Math.min(H2 - 1, j3 * step);
    for (let i2 = 0; i2 < gw; i2++) {
      const x2 = Math.min(W3 - 1, i2 * step);
      const o2 = (y2 * W3 + x2) * 4;
      const a = data[o2 + 3] / 255;
      const r3 = data[o2] * a + 255 * (1 - a);
      const g2 = data[o2 + 1] * a + 255 * (1 - a);
      const b2 = data[o2 + 2] * a + 255 * (1 - a);
      px[j3 * gw + i2] = [r3, g2, b2];
      const k2 = r3 >> 4 << 8 | g2 >> 4 << 4 | b2 >> 4;
      const rec = hist.get(k2) || { count: 0, r: 0, g: 0, b: 0 };
      rec.count++;
      rec.r += r3;
      rec.g += g2;
      rec.b += b2;
      hist.set(k2, rec);
    }
  }
  const total = px.length || 1;
  const ranked = [...hist.entries()].sort((a, b2) => b2[1].count - a[1].count);
  const rep = (rec) => [
    rec.r / Math.max(1, rec.count),
    rec.g / Math.max(1, rec.count),
    rec.b / Math.max(1, rec.count)
  ];
  const dominantShare = ranked.length ? ranked[0][1].count / total : 0;
  const palette = ranked.filter(([, rec]) => rec.count / total > 5e-3).map(([, rec]) => hex(rep(rec)));
  const cl = RULES["CL-01"];
  const paletteCount = palette.length;
  out.push({
    ruleId: "CL-01",
    element: "canvas",
    measured: paletteCount,
    unit: "count",
    status: gateStatus(cl.gate, paletteCount),
    method: "quantized_palette@0.5%",
    metric: "palette_count",
    evidence: { palette: palette.slice(0, 8) }
  });
  if (cl.secondary?.gate) {
    const share = Math.round(dominantShare * 1e3) / 1e3;
    out.push({
      ruleId: "CL-01",
      element: "canvas",
      measured: share,
      unit: "ratio",
      status: gateStatus(cl.secondary.gate, share),
      method: "dominant_share",
      metric: "dominant_share",
      evidence: { dominant: hex(rep(ranked[0]?.[1] || { count: 1, r: 0, g: 0, b: 0 })) }
    });
  }
  const ring = ringPixels(px, gw, gh2, Math.max(1, Math.round(0.02 * Math.min(gw, gh2))));
  const bg = modeColor(ring) || modeColor(px) || [255, 255, 255];
  const tol = 12;
  let same = 0;
  for (const p2 of px) {
    if (Math.max(Math.abs(p2[0] - bg[0]), Math.abs(p2[1] - bg[1]), Math.abs(p2[2] - bg[2])) <= tol) same++;
  }
  const whitespace = same / total;
  out.push({
    ruleId: "NS-01",
    element: "canvas",
    measured: Math.round(whitespace * 1e3) / 1e3,
    unit: "ratio",
    status: gateStatus(RULES["NS-01"].gate, whitespace),
    method: "background_share",
    metric: "whitespace_ratio",
    evidence: { bg: hex(bg), inkShare: Math.round((1 - whitespace) * 1e3) / 1e3, tolerance: tol }
  });
  return { findings: out, palette, dominant: hex(rep(ranked[0]?.[1] || { count: 1, r: 0, g: 0, b: 0 })), whitespace };
}
var channel, relLum, hex;
var init_pixels = __esm({
  "src/lib/review/pixels.ts"() {
    init_rules2();
    channel = (c) => {
      const s2 = c / 255;
      return s2 <= 0.04045 ? s2 / 12.92 : ((s2 + 0.055) / 1.055) ** 2.4;
    };
    relLum = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    hex = (rgb) => "#" + rgb.map((v2) => Math.max(0, Math.min(255, Math.round(v2))).toString(16).padStart(2, "0")).join("").toUpperCase();
  }
});

// src/lib/review/findings.ts
function makeFinding(raw, seq) {
  const rule = RULES[raw.ruleId];
  const power = gatePower(rule);
  const level = capLevel(raw.status, power);
  const finding = {
    id: `F-${String(seq).padStart(3, "0")}`,
    ruleId: raw.ruleId,
    title: rule?.title || raw.ruleId,
    principle: rule?.principle || "\u672A\u5F52\u7C7B",
    violation: METRIC_VIOLATION[raw.metric || raw.method] || rule?.violation || "",
    impact: impactOf(rule),
    level,
    measured: raw.measured,
    unit: raw.unit,
    metric: raw.metric || raw.method,
    method: raw.method,
    element: raw.element,
    evidence: raw.evidence || {},
    provenance: provenanceOf(rule),
    gatePower: power,
    fix: null
  };
  if (level === "FAIL" && raw.status === "FAIL" && power !== "blocker") {
    finding.capped = "gate_power_downgraded";
  }
  const fix = raw.fix !== void 0 ? raw.fix : defaultFix(finding);
  if (fix) finding.fix = fix;
  else finding.fixReason = "\u8FD9\u6761\u89C4\u5219\u53EA\u8D1F\u8D23\u6307\u51FA\u95EE\u9898\uFF1A\u6539\u6CD5\u53D6\u51B3\u4E8E\u7248\u5F0F\u610F\u56FE\uFF0C\u4E0D\u80FD\u7531\u9608\u503C\u53CD\u63A8";
  return finding;
}
function defaultFix(f2) {
  const ev = f2.evidence || {};
  switch (f2.ruleId) {
    case "QL-01":
      return `${f2.element} \u7684\u6587\u672C\u8D85\u51FA\u5BB9\u5668 ${n(ev.overflowPx, 1)}px\uFF1A\u6539\u5C0F\u5B57\u53F7\u6216\u52A0\u5BBD\u5BB9\u5668\uFF0C\u628A \u300C${String(ev.text || "").slice(0, 12)}\u300D \u6536\u56DE\u8FB9\u754C\u5185`;
    case "QL-03": {
      const min = ev.basis === "display_width" ? 14 : 0.022;
      const unit = ev.basis === "display_width" ? "px" : "\uFF08\u77ED\u8FB9\u6BD4\uFF09";
      return `\u628A ${f2.element} \u7684\u5B57\u53F7\u4ECE ${n(ev.effectiveFontSize ?? ev.declaredFontSize, 1)}${unit} \u63D0\u5230 ${min}${unit} \u4EE5\u4E0A\uFF0C\u6216\u6362\u66F4\u77ED\u7684\u6587\u6848`;
    }
    case "QL-04":
      return `\u628A ${f2.element} \u7684\u884C\u9AD8\u4ECE ${n(f2.measured)} \u6539\u6210 ${ev.display ? 1.08 : 1.5} \u500D\u5B57\u53F7\uFF08\u7EA6 ${Math.round(Number(ev.fontSize || 0) * (ev.display ? 1.08 : 1.5))}px\uFF09`;
    case "QL-02":
      return `\u628A\u538B\u5728 ${f2.element} \u4E0A\u7684\u5143\u7D20\u632A\u5F00\u6216\u964D\u5230 opacity 0.5 \u4EE5\u4E0B\uFF1A\u906E\u6321\u6BD4\u4F8B ${n(f2.measured)}`;
    case "VS-01":
      return `\u628A ${f2.element} \u79FB\u56DE\u753B\u5E03\u5185\uFF1A\u5916\u4FA7\u8D85\u51FA ${n(ev.outPx ?? ev.outsidePx, 1)}px`;
    case "CT-02":
      return `\u628A ${f2.element} \u7684\u6587\u5B57\u8272\u4ECE ${String(ev.fg)} \u8C03\u6DF1/\u8C03\u6D45\uFF0C\u4E0E\u5E95\u8272 ${String(ev.bg)} \u8FBE\u5230 4.5:1 \u4EE5\u4E0A\uFF08\u5B9E\u6D4B ${n(f2.measured)}:1\uFF09`;
    case "AL-01":
      return `\u628A\u8FD9\u4E00\u7EC4\u7684\u5DE6\u8FB9\u7F18\u5BF9\u9F50\u5230 ${n(ev.anchor, 1)}px\uFF1Ap90 \u504F\u5DEE ${n(f2.measured, 1)}px`;
    case "AL-02":
      return `\u628A ${f2.element} \u4E24\u4FA7\u7559\u767D\u8C03\u6210\u76F8\u7B49\uFF1A\u4E0A ${n(ev.gapAbove, 1)}px / \u4E0B ${n(ev.gapBelow, 1)}px`;
    case "GR-01":
      return `\u628A\u5143\u7D20\u8D77\u70B9\u5BF9\u9F50\u5230 ${n(ev.unit, 1)}px \u7684\u7F51\u683C\uFF1A\u5F53\u524D ${n(f2.measured, 2)} \u7684\u5143\u7D20\u5728\u683C\u4E0A`;
    case "GR-02":
      return `\u628A\u7EC4\u95F4\u7F1D\u4ECE ${n(ev.betweenMin, 1)}px \u62C9\u5230\u7EC4\u5185\u4E2D\u4F4D ${n(ev.withinMedian, 1)}px \u7684 1.8 \u500D\u4EE5\u4E0A`;
    case "CT-01":
      return `\u628A\u4E00\u7EA7\u6807\u9898\u4E0E\u7B2C\u4E8C\u6863\u7684\u5B57\u53F7\u6BD4\u4ECE ${n(f2.measured)} \u62C9\u5230 1.2 \u500D\u4EE5\u4E0A\uFF08\u5F53\u524D ${ev.sizes?.join(" / ") || ""}\uFF09`;
    case "TY-05":
      return `\u76F8\u90BB\u4E24\u6863\u5B57\u53F7\u62C9\u5F00\u5230 1.2 \u500D\u4EE5\u4E0A\uFF1A\u5F53\u524D\u6863\u4F4D ${ev.ratios?.join(" / ") || ""}`;
    case "TY-04":
      return `\u628A\u9636\u68AF\u5916\u5B57\u53F7 ${ev.off?.join(", ") || ""} \u6539\u56DE\u9636\u68AF ${ev.ladder?.join(", ") || ""}`;
    case "TY-07":
      return `\u628A ${f2.element} \u7684\u957F\u6BB5\u843D\u6539\u6210\u5DE6\u5BF9\u9F50\uFF1A\u5F53\u524D text-anchor=middle \u4E14\u8D85\u8FC7 30 \u5B57`;
    case "TY-08":
      return `\u628A ${f2.element} \u7684\u5B57\u91CD\u4ECE 300 \u4EE5\u4E0B\u63D0\u5230 400\uFF1A\u5B57\u53F7 ${n(ev.fontSize, 1)}px \u672C\u6765\u5C31\u5C0F`;
    case "SP-01":
      return `\u628A\u540C\u7EC4\u95F4\u8DDD\u6536\u5230\u540C\u4E00\u6863\uFF1A\u5F53\u524D\u6709 ${n(f2.measured, 0)} \u5904\u8DE8\u6863\uFF08${ev.groups?.slice(0, 2).map((g2) => `${g2.gaps.join("/")} \u2192 \u76EE\u6807 ${g2.modePx}`).join("\uFF1B") || ""}\uFF09`;
    case "TY-06":
      return `\u628A\u5B57\u91CD\u6863\u4F4D\u6536\u5230 3 \u6863\u4EE5\u5185\uFF1A\u5F53\u524D ${ev.weights?.join(", ") || ""}`;
    case "RP-01": {
      const roles = ev.roles || [];
      const first = roles[0];
      return first ? `\u628A ${n(f2.measured, 0)} \u4E2A\u504F\u79BB\u5B9E\u4F8B\u5BF9\u9F50\u5230\u540C\u7C7B\uFF1A\u300C${first.role}\u300D\u8FD9\u4E00\u7EC4\u6709 ${first.variants} \u79CD\u5916\u89C2\uFF08\u5171 ${first.size} \u4E2A\uFF09` : `\u628A\u540C\u7C7B\u5B9E\u4F8B\u7684\u5916\u89C2\u7EDF\u4E00\uFF1A\u5F53\u524D\u6709 ${n(f2.measured, 0)} \u4E2A\u504F\u79BB`;
    }
    case "TX-01":
      return `\u628A\u4E2D\u6027\u6587\u5B57\u8272\u6536\u5230 ${3} \u79CD\u4EE5\u5185\uFF1A\u5F53\u524D ${ev.colors?.join(", ") || ""}`;
    case "CL-01":
      return `\u628A\u53EF\u8FA8\u989C\u8272\u6536\u5230 4 \u4E2A\u4EE5\u5185\uFF1A\u5F53\u524D ${n(f2.measured, 0)} \u4E2A\uFF08${ev.palette?.slice(0, 6).join(", ") || ""}\uFF09`;
    case "NS-01":
      return `\u7ED9\u5185\u5BB9\u7559\u51FA\u8FB9\u8DDD\uFF1A\u80CC\u666F\u5360\u6BD4 ${n(f2.measured, 2)}\uFF0C\u76EE\u6807 0.3 \u4EE5\u4E0A`;
    case "QL-07":
      return `\u7ED9 ${f2.element} \u8865\u4E0A\u53EF\u7528\u7684\u56FE\u7247\u5730\u5740\uFF1A\u5F53\u524D\u662F\u7A7A\u5F15\u7528\u6216\u65E0\u6CD5\u89E3\u7801`;
    case "GE-02":
      return `\u628A ${f2.element} \u7684\u6837\u5F0F\u7B7E\u540D\u6539\u6210\u4E0E\u540C\u7C7B\u4E00\u81F4\uFF1A\u5F53\u524D\u8FD9\u4E00\u7EC4\u51FA\u73B0 ${n(ev.variants, 0)} \u79CD\u5199\u6CD5`;
    default:
      return null;
  }
}
function sortFindings(findings) {
  const impactRank = { high: 0, medium: 1, low: 2 };
  const levelRank2 = { FAIL: 0, WARN: 1, UNMEASURED: 2, PASS: 3 };
  return [...findings].sort(
    (a, b2) => impactRank[a.impact] - impactRank[b2.impact] || levelRank2[a.level] - levelRank2[b2.level] || a.ruleId.localeCompare(b2.ruleId) || String(a.element).localeCompare(String(b2.element))
  );
}
var METRIC_VIOLATION, n;
var init_findings = __esm({
  "src/lib/review/findings.ts"() {
    init_rules2();
    METRIC_VIOLATION = {
      out_of_safe: "\u5185\u5BB9\u79BB\u753B\u9762\u8FB9\u7F18\u592A\u8FD1\uFF0C\u5E73\u53F0\u4E8C\u6B21\u88C1\u5207\u6216\u64AD\u653E\u5668\u5B89\u5168\u8FB9\u4F1A\u628A\u5B83\u5207\u6389\u3002",
      size_ratio_rank1_body: "\u6807\u9898\u548C\u6B63\u6587\u7684\u5B57\u53F7\u5DEE\u4E0D\u5230 1.5 \u500D\uFF0C\u4E3B\u6B21\u8BFB\u4E0D\u51FA\u6765\u3002",
      text_accent_colors: "\u5F3A\u8C03\u8272\u7528\u5F97\u592A\u591A\uFF0C\u8BFB\u8005\u770B\u4E0D\u51FA\u54EA\u4E00\u79CD\u624D\u4EE3\u8868\u91CD\u70B9\u3002",
      dominant_share: "\u6CA1\u6709\u4E3B\u8272\uFF1A\u6BCF\u79CD\u989C\u8272\u7684\u9762\u79EF\u5DEE\u4E0D\u591A\uFF0C\u753B\u9762\u53D1\u82B1\u3002",
      rule_line_offset_spread: "\u540C\u7C7B\u5206\u9694\u7EBF\u7684\u4E0A\u7559\u767D\u4E0D\u4E00\u81F4\uFF0C\u8BFB\u6570\u65F6\u884C\u8DDD\u5FFD\u5BBD\u5FFD\u7A84\u3002"
    };
    n = (v2, digits = 2) => {
      const num3 = Number(v2);
      return Number.isFinite(num3) ? Number(num3.toFixed(digits)) : null;
    };
  }
});

// src/lib/review/hash.ts
function reviewInputHash(asset, options = {}) {
  const canonical = (value) => JSON.stringify(
    value,
    (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item
  );
  return hashOf([
    "studio-frame-v2",
    asset.svg,
    String(asset.width),
    String(asset.height),
    canonical(asset.groups || []),
    canonical(asset.layouts || {}),
    canonical(asset.overrides || {}),
    canonical(options)
  ]);
}
function hashOf(parts) {
  let h = 2166136261;
  const text = parts.join("\0");
  for (let i2 = 0; i2 < text.length; i2++) {
    h ^= text.charCodeAt(i2);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
var init_hash = __esm({
  "src/lib/review/hash.ts"() {
  }
});

// node_modules/.pnpm/@leafer+core@2.3.3/node_modules/@leafer/core/lib/core.esm.min.js
function s(t2) {
  return void 0 === t2;
}
function i(t2) {
  return null == t2;
}
function r(t2) {
  return "string" == typeof t2;
}
function o(t2) {
  return "number" == typeof t2;
}
function d(t2) {
  return t2 && "object" == typeof t2;
}
function u(t2) {
  return "{}" === JSON.stringify(t2);
}
function A(t2) {
  return Math.round(Math.random() * t2);
}
function Y() {
  return { x: 0, y: 0 };
}
function X() {
  return { x: 0, y: 0, width: 0, height: 0 };
}
function z2() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}
function G() {
  return Object.assign(Object.assign(Object.assign({}, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), { x: 0, y: 0, width: 0, height: 0 }), { scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 });
}
function Bt(t2) {
  return r(t2) ? bt[wt[t2]] : t2;
}
function ie(t2) {
  return t2 ? r(t2) && (t2 = [t2]) : t2 = [], t2;
}
function me(t2, e2, s2, i2) {
  var r3, n3 = arguments.length, o2 = n3 < 3 ? e2 : null === i2 ? i2 = Object.getOwnPropertyDescriptor(e2, s2) : i2;
  if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o2 = Reflect.decorate(t2, e2, s2, i2);
  else for (var a = t2.length - 1; a >= 0; a--) (r3 = t2[a]) && (o2 = (n3 < 3 ? r3(o2) : n3 > 3 ? r3(e2, s2, o2) : r3(e2, s2)) || o2);
  return n3 > 3 && o2 && Object.defineProperty(e2, s2, o2), o2;
}
function xe(t2, e2, s2, i2) {
  return new (s2 || (s2 = Promise))(function(r3, n3) {
    function o2(t3) {
      try {
        h(i2.next(t3));
      } catch (t4) {
        n3(t4);
      }
    }
    function a(t3) {
      try {
        h(i2.throw(t3));
      } catch (t4) {
        n3(t4);
      }
    }
    function h(t3) {
      var e3;
      t3.done ? r3(t3.value) : (e3 = t3.value, e3 instanceof s2 ? e3 : new s2(function(t4) {
        t4(e3);
      })).then(o2, a);
    }
    h((i2 = i2.apply(t2, e2 || [])).next());
  });
}
function we(t2) {
  return (e2, s2) => {
    t2 || (t2 = s2);
    const i2 = { get() {
      return this.context[t2];
    }, set(e3) {
      this.context[t2] = e3;
    } };
    "strokeCap" === s2 && (i2.set = function(e3) {
      this.context[t2] = "none" === e3 ? "butt" : e3;
    }), Object.defineProperty(e2, s2, i2);
  };
}
function ve() {
  return (t2, e2) => {
    be.push(e2);
  };
}
function Ri(t2, e2) {
  Li[t2] && Oi.repeat(t2), Li[t2] = e2;
}
function Gr(t2) {
  return new qi(t2);
}
function Zr(t2) {
  !(function(t3) {
    t3 && !t3.roundRect && (t3.roundRect = function(t4, e2, s2, i2, r3) {
      Jr(this, t4, e2, s2, i2, r3);
    });
  })(t2);
}
function pn(t2, e2, s2, i2) {
  i2 || (s2.configurable = s2.enumerable = true), Object.defineProperty(t2, e2, s2);
}
function fn(t2, e2) {
  return Object.getOwnPropertyDescriptor(t2, e2);
}
function gn(t2, e2) {
  const s2 = "_" + t2;
  return { get() {
    const t3 = this[s2];
    return null == t3 ? e2 : t3;
  }, set(t3) {
    this[s2] = t3;
  } };
}
function yn(t2, e2) {
  return (s2, i2) => xn(s2, i2, t2, e2 && e2(i2));
}
function mn(t2) {
  return t2;
}
function xn(t2, e2, s2, i2) {
  const r3 = { get() {
    return this.__getAttr(e2);
  }, set(t3) {
    this.__setAttr(e2, t3);
  } };
  pn(t2, e2, Object.assign(r3, i2 || {})), $n(t2, e2, s2);
}
function wn(t2) {
  return yn(t2);
}
function bn(t2, e2) {
  return yn(t2, (t3) => ({ set(s2) {
    this.__setAttr(t3, s2, e2) && (this.__layout.matrixChanged || this.__layout.matrixChange());
  } }));
}
function vn(t2, e2) {
  return yn(t2, (t3) => ({ set(s2) {
    this.__setAttr(t3, s2, e2) && (this.__layout.matrixChanged || this.__layout.matrixChange(), this.__scrollWorld || (this.__scrollWorld = {}));
  } }));
}
function Bn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    this.__setAttr(t3, e2) && (this.__hasAutoLayout = !!(this.origin || this.around || this.flow), this.__local || this.__layout.createLocal(), Pn(this));
  } }));
}
function Cn(t2, e2) {
  return yn(t2, (t3) => ({ set(s2) {
    this.__setAttr(t3, s2, e2) && (this.__layout.scaleChanged || this.__layout.scaleChange());
  } }));
}
function kn(t2, e2) {
  return yn(t2, (t3) => ({ set(s2) {
    this.__setAttr(t3, s2, e2) && (this.__layout.rotationChanged || this.__layout.rotationChange());
  } }));
}
function On(t2, e2) {
  return yn(t2, (t3) => ({ set(s2) {
    this.__setAttr(t3, s2, e2) && Pn(this);
  } }));
}
function Tn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    this.__setAttr(t3, e2) && (Pn(this), this.__.__removeNaturalSize());
  } }));
}
function Pn(t2) {
  t2.__layout.boxChanged || t2.__layout.boxChange(), t2.__hasAutoLayout && (t2.__layout.matrixChanged || t2.__layout.matrixChange());
}
function Sn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    const s2 = this.__;
    2 !== s2.__pathInputed && (s2.__pathInputed = e2 ? 1 : 0), e2 || (s2.__pathForRender = void 0), this.__setAttr(t3, e2), Pn(this);
  } }));
}
function Rn(t2, e2) {
  return yn(t2, (t3) => ({ set(s2) {
    this.__setAttr(t3, s2) && (In(this), e2 && (this.__.__useStroke = true));
  } }));
}
function In(t2) {
  t2.__layout.strokeChanged || t2.__layout.strokeChange(), t2.__.__useArrow && Pn(t2);
}
function Mn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    this.__setAttr(t3, e2), this.__layout.renderChanged || this.__layout.renderChange();
  } }));
}
function An(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    this.__setAttr(t3, e2) && Wn(this);
  } }));
}
function Wn(t2) {
  t2.__layout.surfaceChanged || t2.__layout.surfaceChange();
}
function Nn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    if (this.__setAttr(t3, e2)) {
      const t4 = this.__;
      _.stintSet(t4, "__useDim", t4.dim || t4.bright || t4.dimskip);
    }
  } }));
}
function Dn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    this.__setAttr(t3, e2) && (this.__layout.opacityChanged || this.__layout.opacityChange()), this.mask && Xn(this);
  } }));
}
function Yn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    const s2 = this.visible;
    if (true === s2 && 0 === e2) {
      if (this.animationOut) return this.__runAnimation("out", () => zn(this, t3, e2, s2));
    } else 0 === s2 && true === e2 && this.animation && this.__runAnimation("in");
    zn(this, t3, e2, s2), this.mask && Xn(this);
  } }));
}
function Xn(t2) {
  const { parent: e2 } = t2;
  if (e2) {
    const { __hasMask: t3 } = e2;
    e2.__updateMask(), t3 !== e2.__hasMask && e2.forceUpdate();
  }
}
function zn(t2, e2, s2, i2) {
  t2.__setAttr(e2, s2) && (t2.__layout.opacityChanged || t2.__layout.opacityChange(), 0 !== i2 && 0 !== s2 || Pn(t2));
}
function Fn(t2) {
  t2.__layout.childrenSortChange(), t2.__.flow && t2.__layout.boxChange();
}
function Un(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    this.__setAttr(t3, e2) && this.waitParentChange(Fn);
  } }));
}
function jn(t2) {
  t2.__updateMask();
}
function Vn(t2, e2) {
  return yn(t2, (t3) => ({ set(s2) {
    this.__setAttr(t3, s2) && (this.__layout.boxChanged || this.__layout.boxChange(), e2 ? this.__updateMask() : this.waitParentChange(jn));
  } }));
}
function qn(t2) {
  t2.__updateEraser();
}
function Hn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    this.__setAttr(t3, e2) && this.waitParentChange(qn);
  } }));
}
function Gn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    this.__setAttr(t3, e2) && (this.__layout.hitCanvasChanged = true, this.leafer && this.leafer.updateCursor());
  } }));
}
function Qn(t2) {
  return yn(t2, (t3) => ({ set(e2) {
    this.__setAttr(t3, e2), this.leafer && this.leafer.updateCursor();
  } }));
}
function Jn(t2) {
  return (e2, s2) => {
    pn(e2, "__DataProcessor", { get: () => t2 });
  };
}
function $n(t2, e2, i2) {
  const r3 = t2.__DataProcessor.prototype, n3 = "_" + e2, o2 = (function(t3) {
    return "set" + t3.charAt(0).toUpperCase() + t3.slice(1);
  })(e2), a = gn(e2, i2);
  if (s(i2)) a.get = function() {
    return this[n3];
  };
  else if ("function" == typeof i2) a.get = function() {
    const t3 = this[n3];
    return null == t3 ? i2(this.__leaf) : t3;
  };
  else if (d(i2)) {
    const t3 = u(i2);
    a.get = function() {
      const e3 = this[n3];
      return null == e3 ? this[n3] = t3 ? {} : _.clone(i2) : e3;
    };
  }
  const h = t2.isBranchLeaf;
  "width" === e2 ? a.get = function() {
    const t3 = this[n3];
    if (null == t3) {
      const t4 = this, e3 = t4.__naturalWidth, s2 = t4.__leaf;
      return !i2 || s2.pathInputed ? s2.boxBounds.width : e3 ? t4._height && t4.__useNaturalRatio ? t4._height * e3 / t4.__naturalHeight : e3 : h && s2.children.length ? s2.boxBounds.width : i2;
    }
    return t3;
  } : "height" === e2 && (a.get = function() {
    const t3 = this[n3];
    if (null == t3) {
      const t4 = this, e3 = t4.__naturalHeight, s2 = t4.__leaf;
      return !i2 || s2.pathInputed ? s2.boxBounds.height : e3 ? t4._width && t4.__useNaturalRatio ? t4._width * e3 / t4.__naturalWidth : e3 : h && s2.children.length ? s2.boxBounds.height : i2;
    }
    return t3;
  });
  let l2, c = r3;
  for (; !l2 && c; ) l2 = fn(c, e2), c = c.__proto__;
  l2 && l2.set && (a.set = l2.set), r3[o2] && (a.set = r3[o2], delete r3[o2]), pn(r3, e2, a);
}
function so(t2) {
  return (e2, s2) => {
    to.push({ name: e2.constructor.name + "." + s2, run: () => {
      e2[s2] = t2;
    } });
  };
}
function io() {
  return (t2) => {
    ro();
  };
}
function ro(t2) {
  to.length && (to.forEach((e2) => {
    t2 && Kn.error(e2.name, "\u9700\u5728Class\u4E0A\u88C5\u9970@rewriteAble()"), e2.run();
  }), to.length = 0);
}
function no(t2, e2) {
  return (s2) => {
    var i2;
    (t2.prototype ? (i2 = t2.prototype, Object.getOwnPropertyNames(i2)) : Object.keys(t2)).forEach((i3) => {
      if (!(eo.includes(i3) || e2 && e2.includes(i3))) if (t2.prototype) {
        const e3 = fn(t2.prototype, i3);
        e3 && Object.defineProperty(s2.prototype, i3, e3);
      } else s2.prototype[i3] = t2[i3];
    });
  };
}
function oo() {
  return (t2) => {
    ue.register(t2);
  };
}
function ao() {
  return (t2) => {
    fe.register(t2);
  };
}
function bo(t2) {
  return t2 && t2.config.trackChanges;
}
function Po(t2, e2) {
  return t2.updateLayout(), t2.parent ? at.tempToInnerOf(e2, t2.parent.scrollWorldTransform) : e2;
}
function Ro(t2, e2) {
  return e2 || (Lo = 0), t2.__.mask && (Lo = 1), Lo < 0 ? null : (Lo && (Lo = -1), true);
}
function wa(t2, e2, s2) {
  if (e2) {
    const { __captureMap: e3 } = t2;
    return e3 || (s2 ? t2.__captureMap = {} : ma);
  }
  {
    const { __bubbleMap: e3 } = t2;
    return e3 || (s2 ? t2.__bubbleMap = {} : ma);
  }
}
var t, e, n2, l, _, p, f, g, y, m, x, w, b, v, B, C, k, O, T, P, S, L, R, I, E, M, W, N, D, F, U, j, V, q, H, Q, J, Z, $, K, tt, et, st, it, rt, nt, ot, at, ht, lt, dt, ct, ut, _t, pt, ft, gt, yt, mt, xt, wt, bt, vt, Ct, kt, Ot, Tt, Pt, St, Lt, Rt, It, Et, Mt, At, Wt, Nt, Dt, Yt, Xt, zt, Ft, Ut, jt, Vt, qt, Ht, Gt, Qt, Jt, Zt, $t, Kt, te, ee, se, re, ne, oe, ae, he, le, de, ce, ue, _e, pe, fe, ge, ye, be, Be, Ce, ke, Oe, Te, Pe, Se, Le, Re, Ie, Ee, Me, Ae, We, Ne, De, Ye, Xe, ze, Fe, Ue, je, Ve, qe, He, Ge, Qe, Je, Ze, $e, Ke, ts, es, ss, is, rs, ns, os, as, hs, ls, ds, cs, us, _s, ps, fs2, gs, ys, ms, xs, ws, bs, vs, Bs, Cs, ks, Os, Ts, Ps, Ss, Ls, Rs, Is, Es, Ms, As, Ws, Ns, Ds, Ys, Xs, zs, Fs, Us, js, Vs, qs, Hs, Gs, Qs, Js, Zs, $s, Ks, ti, ei, si, ii, ri, ni, oi, ai, hi, li, di, ci, ui, _i, pi, fi, gi, yi, mi, xi, wi, bi, vi, Bi, Ci, ki, Oi, Ti, Pi, Si, Li, Ii, Ei, Mi, Ai, Wi, Ni, Di, Yi, Xi, zi, Fi, Ui, ji, Vi, qi, Hi, Gi, Qi, Ji, Zi, $i, Ki, tr, er, sr, ir, rr, nr, or, ar, hr, lr, dr, cr, ur, _r, pr, fr, gr, yr, mr, xr, wr, br, vr, Br, Cr, kr, Or, Tr, Pr, Sr, Lr, Rr, Ir, Er, Mr, Ar, Wr, Nr, Dr, Yr, Xr, zr, Fr, Ur, jr, Vr, qr, Hr, Qr, Jr, $r, Kr, tn, en, sn, rn, nn, on, an, hn, ln, dn, cn, Ln, En, Kn, to, eo, ho, lo, co, uo, _o, po, fo, go, yo, mo, xo, wo, vo, Bo, Co, ko, Oo, To, So, Lo, Io, Eo, Mo, Ao, Wo, No, Do, Yo, Xo, zo, Fo, Uo, jo, Vo, qo, Ho, Go, Qo, Jo, Zo, $o, Ko, ta, ea, sa, ia, ra, na, oa, aa, ha, la, da, ca, ua, _a, pa, fa, ga, ya, ma, xa, ba, va, Ba, Ca, ka, Oa, Ta, Pa, Sa, La, Ra, Ia, Ea, Ma, Aa, Wa, Na, Da, Ya, Xa, za, Fa, Ua, ja, Va, qa, Ha, Ga, Qa, Ja, Za, $a, Ka, th, eh, sh, ih, rh, nh, oh, ah, hh, lh, dh, ch, uh, _h, ph, fh, gh, yh, mh, xh, wh, bh, vh, Bh, Ch, kh, Oh, Th, Ph, Sh, Lh, Rh, Ih, Eh, Mh, Ah, Wh;
var init_core_esm_min = __esm({
  "node_modules/.pnpm/@leafer+core@2.3.3/node_modules/@leafer/core/lib/core.esm.min.js"() {
    !(function(t2) {
      t2[t2.No = 0] = "No", t2[t2.Yes = 1] = "Yes", t2[t2.NoAndSkip = 2] = "NoAndSkip", t2[t2.YesAndSkip = 3] = "YesAndSkip";
    })(t || (t = {}));
    e = {};
    ({ isFinite: n2 } = Number);
    ({ isArray: l } = Array);
    _ = { default: (t2, e2) => (p(e2, t2), p(t2, e2), t2), assign(t2, e2, s2) {
      let i2;
      Object.keys(e2).forEach((r3) => {
        var n3, o2;
        if (i2 = e2[r3], (null == i2 ? void 0 : i2.constructor) === Object && (null === (n3 = t2[r3]) || void 0 === n3 ? void 0 : n3.constructor) === Object) return p(t2[r3], e2[r3], s2 && s2[r3]);
        s2 && r3 in s2 ? (null === (o2 = s2[r3]) || void 0 === o2 ? void 0 : o2.constructor) === Object && p(t2[r3] = {}, e2[r3], s2[r3]) : t2[r3] = e2[r3];
      });
    }, copyAttrs: (t2, e2, i2) => (i2.forEach((i3) => {
      s(e2[i3]) || (t2[i3] = e2[i3]);
    }), t2), clone: (t2) => JSON.parse(JSON.stringify(t2)), toMap(t2) {
      const e2 = {};
      for (let s2 = 0, i2 = t2.length; s2 < i2; s2++) e2[t2[s2]] = true;
      return e2;
    }, stintSet(t2, e2, s2) {
      s2 || (s2 = void 0), t2[e2] !== s2 && (t2[e2] = s2);
    } };
    ({ assign: p } = _);
    f = class {
      get __useNaturalRatio() {
        return true;
      }
      get __isLinePath() {
        const { path: t2 } = this;
        return t2 && 6 === t2.length && 1 === t2[0];
      }
      get __usePathBox() {
        return this.__pathInputed;
      }
      get __blendMode() {
        if (this.eraser && "path" !== this.eraser) return "destination-out";
        const { blendMode: t2 } = this;
        return "pass-through" === t2 ? null : t2;
      }
      constructor(t2) {
        this.__leaf = t2;
      }
      __get(t2) {
        if (this.__input) {
          const e2 = this.__input[t2];
          if (!s(e2)) return e2;
        }
        return this[t2];
      }
      __getData() {
        const t2 = { tag: this.__leaf.tag }, { __input: e2 } = this;
        let i2;
        for (let r3 in this) "_" !== r3[0] && (i2 = e2 ? e2[r3] : void 0, t2[r3] = s(i2) ? this[r3] : i2);
        return t2;
      }
      __setInput(t2, e2) {
        this.__input || (this.__input = {}), this.__input[t2] = e2;
      }
      __getInput(t2) {
        if (this.__input) {
          const e2 = this.__input[t2];
          if (!s(e2)) return e2;
        }
        if ("path" !== t2 || this.__pathInputed) return this["_" + t2];
      }
      __removeInput(t2) {
        this.__input && !s(this.__input[t2]) && (this.__input[t2] = void 0);
      }
      __getInputData(t2, e2) {
        const i2 = {};
        if (t2) if (l(t2)) for (let e3 of t2) i2[e3] = this.__getInput(e3);
        else for (let e3 in t2) i2[e3] = this.__getInput(e3);
        else {
          let t3, e3, { __input: r3 } = this;
          i2.tag = this.__leaf.tag;
          for (let n3 in this) if ("_" !== n3[0] && (t3 = this["_" + n3], !s(t3))) {
            if ("path" === n3 && !this.__pathInputed) continue;
            e3 = r3 ? r3[n3] : void 0, i2[n3] = s(e3) ? t3 : e3;
          }
        }
        if (e2 && e2.matrix) {
          const { a: t3, b: e3, c: s2, d: r3, e: n3, f: o2 } = this.__leaf.__localMatrix;
          i2.matrix = { a: t3, b: e3, c: s2, d: r3, e: n3, f: o2 };
        }
        return i2;
      }
      __setMiddle(t2, e2) {
        this.__middle || (this.__middle = {}), this.__middle[t2] = e2;
      }
      __getMiddle(t2) {
        return this.__middle && this.__middle[t2];
      }
      __checkSingle() {
        const t2 = this;
        if ("pass-through" === t2.blendMode) {
          const e2 = this.__leaf;
          t2.opacity < 1 && (e2.isBranch || t2.__hasMultiPaint) || e2.__hasEraser || t2.eraser || t2.filter ? t2.__single = true : t2.__single && (t2.__single = false);
        } else t2.__single = true;
      }
      __removeNaturalSize() {
        this.__naturalWidth = this.__naturalHeight = void 0;
      }
      destroy() {
        this.__input = this.__middle = null, this.__complexData && this.__complexData.destroy();
      }
    };
    g = { RUNTIME: "runtime", LEAF: "leaf", TASK: "task", CANVAS: "canvas", IMAGE: "image", types: {}, create(t2) {
      const { types: e2 } = y;
      return e2[t2] ? e2[t2]++ : (e2[t2] = 1, 0);
    } };
    y = g;
    ({ max: b } = Math);
    v = [0, 0, 0, 0];
    B = { zero: [...v], tempFour: v, set: (t2, e2, s2, i2, r3) => (void 0 === s2 && (s2 = i2 = r3 = e2), t2[0] = e2, t2[1] = s2, t2[2] = i2, t2[3] = r3, t2), setTemp: (t2, e2, s2, i2) => C(v, t2, e2, s2, i2), toTempAB(t2, e2, s2) {
      w = s2 ? o(t2) ? e2 : t2 : [], o(t2) ? (m = O(t2), x = e2) : o(e2) ? (m = t2, x = O(e2)) : (m = t2, x = e2), 4 !== m.length && (m = k(m)), 4 !== x.length && (x = k(x));
    }, get(t2, e2) {
      let i2;
      if (!o(t2)) switch (t2.length) {
        case 4:
          i2 = s(e2) ? t2 : [...t2];
          break;
        case 2:
          i2 = [t2[0], t2[1], t2[0], t2[1]];
          break;
        case 3:
          i2 = [t2[0], t2[1], t2[2], t2[1]];
          break;
        case 1:
          t2 = t2[0];
          break;
        default:
          t2 = 0;
      }
      if (i2 || (i2 = [t2, t2, t2, t2]), !s(e2)) for (let t3 = 0; t3 < 4; t3++) i2[t3] > e2 && (i2[t3] = e2);
      return i2;
    }, max: (t2, e2, s2) => o(t2) && o(e2) ? b(t2, e2) : (T(t2, e2, s2), C(w, b(m[0], x[0]), b(m[1], x[1]), b(m[2], x[2]), b(m[3], x[3]))), add: (t2, e2, s2) => o(t2) && o(e2) ? t2 + e2 : (T(t2, e2, s2), C(w, m[0] + x[0], m[1] + x[1], m[2] + x[2], m[3] + x[3])), swapAndScale(t2, e2, s2, i2) {
      if (o(t2)) return e2 === s2 ? t2 * e2 : [t2 * s2, t2 * e2];
      const r3 = i2 ? t2 : [], [n3, a, h, l2] = 4 === t2.length ? t2 : k(t2);
      return C(r3, h * s2, l2 * e2, n3 * s2, a * e2);
    } };
    ({ set: C, get: k, setTemp: O, toTempAB: T } = B);
    ({ round: P, pow: S, max: L, floor: R, PI: I } = Math);
    E = {};
    M = { within: (t2, e2, i2) => (d(e2) && (i2 = e2.max, e2 = e2.min), !s(e2) && t2 < e2 && (t2 = e2), !s(i2) && t2 > i2 && (t2 = i2), t2), fourNumber: B.get, formatRotation: (t2, e2) => (t2 %= 360, e2 ? t2 < 0 && (t2 += 360) : (t2 > 180 && (t2 -= 360), t2 < -180 && (t2 += 360)), M.float(t2)), getGapRotation(t2, e2, s2 = 0) {
      let i2 = t2 + s2;
      if (e2 > 1) {
        const t3 = Math.abs(i2 % e2);
        (t3 < 1 || t3 > e2 - 1) && (i2 = Math.round(i2 / e2) * e2);
      }
      return i2 - s2;
    }, float(t2, e2) {
      const i2 = s(e2) ? 1e12 : S(10, e2);
      return -0 === (t2 = P(t2 * i2) / i2) ? 0 : t2;
    }, sign: (t2) => t2 < 0 ? -1 : 1, getScaleData(t2, e2, s2, i2) {
      if (i2 || (i2 = {}), e2) {
        const t3 = (o(e2) ? e2 : e2.width || 0) / s2.width, r3 = (o(e2) ? e2 : e2.height || 0) / s2.height;
        i2.scaleX = t3 || r3 || 1, i2.scaleY = r3 || t3 || 1;
      } else t2 && M.assignScale(i2, t2);
      return i2;
    }, getScaleFixedData(t2, e2, s2, i2, r3) {
      let { scaleX: n3, scaleY: a } = t2;
      if ((i2 || e2) && (n3 < 0 && (n3 = -n3), a < 0 && (a = -a)), e2) if (true === e2) n3 = a = s2 ? 1 : 1 / n3;
      else {
        let t3;
        o(e2) ? t3 = e2 : "zoom-in" === e2 && (t3 = 1), t3 && (n3 = a = n3 > t3 || a > t3 ? s2 ? 1 : 1 / n3 : s2 ? 1 : 1 / t3);
      }
      return E.scaleX = n3, E.scaleY = a, E;
    }, assignScale(t2, e2) {
      o(e2) ? t2.scaleX = t2.scaleY = e2 : (t2.scaleX = e2.x, t2.scaleY = e2.y);
    }, getFloorScale: (t2, e2 = 1) => L(R(t2), e2) / t2, randInt: A, randColor: (t2) => `rgba(${A(255)},${A(255)},${A(255)},${t2 || 1})` };
    W = I / 180;
    N = 2 * I;
    D = I / 2;
    ({ sin: F, cos: U, acos: j, sqrt: V } = Math);
    ({ float: q } = M);
    H = {};
    Q = { defaultMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, defaultWorld: G(), tempMatrix: {}, set(t2, e2 = 1, s2 = 0, i2 = 0, r3 = 1, n3 = 0, o2 = 0) {
      t2.a = e2, t2.b = s2, t2.c = i2, t2.d = r3, t2.e = n3, t2.f = o2;
    }, get: z2, getWorld: G, copy(t2, e2) {
      t2.a = e2.a, t2.b = e2.b, t2.c = e2.c, t2.d = e2.d, t2.e = e2.e, t2.f = e2.f;
    }, translate(t2, e2, s2) {
      t2.e += e2, t2.f += s2;
    }, translateInner(t2, e2, s2, i2) {
      t2.e += t2.a * e2 + t2.c * s2, t2.f += t2.b * e2 + t2.d * s2, i2 && (t2.e -= e2, t2.f -= s2);
    }, scale(t2, e2, s2 = e2) {
      t2.a *= e2, t2.b *= e2, t2.c *= s2, t2.d *= s2;
    }, pixelScale(t2, e2, s2) {
      s2 || (s2 = t2), s2.a = t2.a * e2, s2.b = t2.b * e2, s2.c = t2.c * e2, s2.d = t2.d * e2, s2.e = t2.e * e2, s2.f = t2.f * e2;
    }, scaleOfOuter(t2, e2, s2, i2) {
      J.toInnerPoint(t2, e2, H), J.scaleOfInner(t2, H, s2, i2);
    }, scaleOfInner(t2, e2, s2, i2 = s2) {
      J.translateInner(t2, e2.x, e2.y), J.scale(t2, s2, i2), J.translateInner(t2, -e2.x, -e2.y);
    }, rotate(t2, e2) {
      const { a: s2, b: i2, c: r3, d: n3 } = t2, o2 = U(e2 *= W), a = F(e2);
      t2.a = s2 * o2 - i2 * a, t2.b = s2 * a + i2 * o2, t2.c = r3 * o2 - n3 * a, t2.d = r3 * a + n3 * o2;
    }, rotateOfOuter(t2, e2, s2) {
      J.toInnerPoint(t2, e2, H), J.rotateOfInner(t2, H, s2);
    }, rotateOfInner(t2, e2, s2) {
      J.translateInner(t2, e2.x, e2.y), J.rotate(t2, s2), J.translateInner(t2, -e2.x, -e2.y);
    }, skew(t2, e2, s2) {
      const { a: i2, b: r3, c: n3, d: o2 } = t2;
      s2 && (s2 *= W, t2.a = i2 + n3 * s2, t2.b = r3 + o2 * s2), e2 && (e2 *= W, t2.c = n3 + i2 * e2, t2.d = o2 + r3 * e2);
    }, skewOfOuter(t2, e2, s2, i2) {
      J.toInnerPoint(t2, e2, H), J.skewOfInner(t2, H, s2, i2);
    }, skewOfInner(t2, e2, s2, i2 = 0) {
      J.translateInner(t2, e2.x, e2.y), J.skew(t2, s2, i2), J.translateInner(t2, -e2.x, -e2.y);
    }, multiply(t2, e2) {
      const { a: s2, b: i2, c: r3, d: n3, e: o2, f: a } = t2;
      t2.a = e2.a * s2 + e2.b * r3, t2.b = e2.a * i2 + e2.b * n3, t2.c = e2.c * s2 + e2.d * r3, t2.d = e2.c * i2 + e2.d * n3, t2.e = e2.e * s2 + e2.f * r3 + o2, t2.f = e2.e * i2 + e2.f * n3 + a;
    }, multiplyParent(t2, e2, i2, r3, n3) {
      const { e: o2, f: a } = t2;
      if (i2 || (i2 = t2), s(r3) && (r3 = 1 !== t2.a || t2.b || t2.c || 1 !== t2.d), r3) {
        const { a: s2, b: r4, c: o3, d: a2 } = t2;
        i2.a = s2 * e2.a + r4 * e2.c, i2.b = s2 * e2.b + r4 * e2.d, i2.c = o3 * e2.a + a2 * e2.c, i2.d = o3 * e2.b + a2 * e2.d, n3 && (i2.scaleX = e2.scaleX * n3.scaleX, i2.scaleY = e2.scaleY * n3.scaleY);
      } else i2.a = e2.a, i2.b = e2.b, i2.c = e2.c, i2.d = e2.d, n3 && (i2.scaleX = e2.scaleX, i2.scaleY = e2.scaleY);
      i2.e = o2 * e2.a + a * e2.c + e2.e, i2.f = o2 * e2.b + a * e2.d + e2.f;
    }, divide(t2, e2) {
      J.multiply(t2, J.tempInvert(e2));
    }, divideParent(t2, e2) {
      J.multiplyParent(t2, J.tempInvert(e2));
    }, tempInvert(t2) {
      const { tempMatrix: e2 } = J;
      return J.copy(e2, t2), J.invert(e2), e2;
    }, invert(t2) {
      const { a: e2, b: s2, c: i2, d: r3, e: n3, f: o2 } = t2;
      if (s2 || i2) {
        const a = 1 / (e2 * r3 - s2 * i2);
        t2.a = r3 * a, t2.b = -s2 * a, t2.c = -i2 * a, t2.d = e2 * a, t2.e = -(n3 * r3 - o2 * i2) * a, t2.f = -(o2 * e2 - n3 * s2) * a;
      } else if (1 === e2 && 1 === r3) t2.e = -n3, t2.f = -o2;
      else {
        const s3 = 1 / (e2 * r3);
        t2.a = r3 * s3, t2.d = e2 * s3, t2.e = -n3 * r3 * s3, t2.f = -o2 * e2 * s3;
      }
    }, toOuterPoint(t2, e2, s2, i2) {
      const { x: r3, y: n3 } = e2;
      s2 || (s2 = e2), s2.x = r3 * t2.a + n3 * t2.c, s2.y = r3 * t2.b + n3 * t2.d, i2 || (s2.x += t2.e, s2.y += t2.f);
    }, toInnerPoint(t2, e2, s2, i2) {
      const { a: r3, b: n3, c: o2, d: a } = t2, h = 1 / (r3 * a - n3 * o2), { x: l2, y: d2 } = e2;
      if (s2 || (s2 = e2), s2.x = (l2 * a - d2 * o2) * h, s2.y = (d2 * r3 - l2 * n3) * h, !i2) {
        const { e: e3, f: i3 } = t2;
        s2.x -= (e3 * a - i3 * o2) * h, s2.y -= (i3 * r3 - e3 * n3) * h;
      }
    }, setLayout(t2, e2, i2, r3, n3) {
      const { x: o2, y: a, scaleX: h, scaleY: l2 } = e2;
      if (s(n3) && (n3 = e2.rotation || e2.skewX || e2.skewY), n3) {
        const { rotation: s2, skewX: i3, skewY: r4 } = e2, n4 = s2 * W, o3 = U(n4), a2 = F(n4);
        if (i3 || r4) {
          const e3 = i3 * W, s3 = r4 * W;
          t2.a = (o3 + s3 * -a2) * h, t2.b = (a2 + s3 * o3) * h, t2.c = (e3 * o3 - a2) * l2, t2.d = (o3 + e3 * a2) * l2;
        } else t2.a = o3 * h, t2.b = a2 * h, t2.c = -a2 * l2, t2.d = o3 * l2;
      } else t2.a = h, t2.b = 0, t2.c = 0, t2.d = l2;
      t2.e = o2, t2.f = a, (i2 = i2 || r3) && J.translateInner(t2, -i2.x, -i2.y, !r3);
    }, getLayout(t2, e2, s2, i2) {
      const { a: r3, b: n3, c: o2, d: a, e: h, f: l2 } = t2;
      let d2, c, u2, _2, p2, f2 = h, g2 = l2;
      if (n3 || o2) {
        const t3 = r3 * a - n3 * o2;
        if (o2 && !i2) {
          d2 = V(r3 * r3 + n3 * n3), c = t3 / d2;
          const e4 = r3 / d2;
          u2 = n3 > 0 ? j(e4) : -j(e4);
        } else {
          c = V(o2 * o2 + a * a), d2 = t3 / c;
          const e4 = o2 / c;
          u2 = D - (a > 0 ? j(-e4) : -j(e4));
        }
        const e3 = q(U(u2)), s3 = F(u2);
        d2 = q(d2), c = q(c), _2 = e3 ? q((o2 / c + s3) / e3 / W, 9) : 0, p2 = e3 ? q((n3 / d2 - s3) / e3 / W, 9) : 0, u2 = q(u2 / W);
      } else d2 = r3, c = a, u2 = _2 = p2 = 0;
      return (e2 = s2 || e2) && (f2 += e2.x * r3 + e2.y * o2, g2 += e2.x * n3 + e2.y * a, s2 || (f2 -= e2.x, g2 -= e2.y)), { x: f2, y: g2, scaleX: d2, scaleY: c, rotation: u2, skewX: _2, skewY: p2 };
    }, withScale(t2, e2, s2 = e2) {
      const i2 = t2;
      if (!e2 || !s2) {
        const { a: i3, b: r3, c: n3, d: o2 } = t2;
        r3 || n3 ? s2 = (i3 * o2 - r3 * n3) / (e2 = V(i3 * i3 + r3 * r3)) : (e2 = i3, s2 = o2);
      }
      return i2.scaleX = e2, i2.scaleY = s2, i2;
    }, reset(t2) {
      J.set(t2);
    } };
    J = Q;
    ({ float: Z } = M);
    ({ toInnerPoint: $, toOuterPoint: K } = Q);
    ({ sin: tt, cos: et, abs: st, sqrt: it, atan2: rt, min: nt, round: ot } = Math);
    at = { defaultPoint: { x: 0, y: 0 }, tempPoint: {}, tempRadiusPoint: {}, set(t2, e2 = 0, s2 = 0) {
      t2.x = e2, t2.y = s2;
    }, setRadius(t2, e2, i2) {
      t2.radiusX = e2, t2.radiusY = s(i2) ? e2 : i2;
    }, copy(t2, e2) {
      t2.x = e2.x, t2.y = e2.y;
    }, copyFrom(t2, e2, s2) {
      t2.x = e2, t2.y = s2;
    }, round(t2, e2) {
      t2.x = e2 ? ot(t2.x - 0.5) + 0.5 : ot(t2.x), t2.y = e2 ? ot(t2.y - 0.5) + 0.5 : ot(t2.y);
    }, move(t2, e2, s2) {
      d(e2) ? (t2.x += e2.x, t2.y += e2.y) : (t2.x += e2, t2.y += s2);
    }, scale(t2, e2, s2 = e2) {
      t2.x && (t2.x *= e2), t2.y && (t2.y *= s2);
    }, scaleOf(t2, e2, s2, i2 = s2) {
      t2.x += (t2.x - e2.x) * (s2 - 1), t2.y += (t2.y - e2.y) * (i2 - 1);
    }, rotate(t2, e2, s2, i2 = 1, r3 = 1) {
      s2 || (s2 = ht.defaultPoint);
      const n3 = et(e2 *= W), o2 = tt(e2), a = (t2.x - s2.x) / i2, h = (t2.y - s2.y) / r3;
      t2.x = s2.x + (a * n3 - h * o2) * i2, t2.y = s2.y + (a * o2 + h * n3) * r3;
    }, tempToInnerOf(t2, e2) {
      const { tempPoint: s2 } = ht;
      return dt(s2, t2), $(e2, s2, s2), s2;
    }, tempToOuterOf(t2, e2) {
      const { tempPoint: s2 } = ht;
      return dt(s2, t2), K(e2, s2, s2), s2;
    }, tempToInnerRadiusPointOf(t2, e2) {
      const { tempRadiusPoint: s2 } = ht;
      return dt(s2, t2), ht.toInnerRadiusPointOf(t2, e2, s2), s2;
    }, copyRadiusPoint: (t2, e2, s2, i2) => (dt(t2, e2), ct(t2, s2, i2), t2), toInnerRadiusPointOf(t2, e2, s2) {
      s2 || (s2 = t2), $(e2, t2, s2), s2.radiusX = Math.abs(t2.radiusX / e2.scaleX), s2.radiusY = Math.abs(t2.radiusY / e2.scaleY);
    }, toInnerOf(t2, e2, s2) {
      $(e2, t2, s2);
    }, toOuterOf(t2, e2, s2) {
      K(e2, t2, s2);
    }, toVertical(t2, e2, s2, i2) {
      const r3 = e2 * W;
      t2.x += -Math.sin(r3) * s2, t2.y += Math.cos(r3) * s2;
    }, getCenter: (t2, e2) => ({ x: t2.x + (e2.x - t2.x) / 2, y: t2.y + (e2.y - t2.y) / 2 }), getCenterX: (t2, e2) => t2 + (e2 - t2) / 2, getCenterY: (t2, e2) => t2 + (e2 - t2) / 2, getDistance: (t2, e2) => lt(t2.x, t2.y, e2.x, e2.y), getDistanceFrom(t2, e2, s2, i2) {
      const r3 = st(s2 - t2), n3 = st(i2 - e2);
      return it(r3 * r3 + n3 * n3);
    }, getMinDistanceFrom: (t2, e2, s2, i2, r3, n3) => nt(lt(t2, e2, s2, i2), lt(s2, i2, r3, n3)), getAngle: (t2, e2, s2, i2) => ut(t2, e2, s2, i2) / W, getRotation: (t2, e2, s2, i2) => (i2 || (i2 = e2), ht.getRadianFrom(t2.x, t2.y, e2.x, e2.y, s2.x, s2.y, i2.x, i2.y) / W), getRadianFrom(t2, e2, i2, r3, n3, o2, a, h) {
      s(a) && (a = i2, h = r3);
      const l2 = t2 - i2, d2 = e2 - r3, c = n3 - a, u2 = o2 - h;
      return Math.atan2(l2 * u2 - d2 * c, l2 * c + d2 * u2);
    }, getAtan2: (t2, e2, s2 = 1, i2 = 1) => rt((e2.y - t2.y) / i2, (e2.x - t2.x) / s2), getDistancePoint(t2, e2, s2, i2, r3) {
      const n3 = ut(t2, e2);
      return r3 && (t2 = e2), i2 || (e2 = {}), e2.x = t2.x + et(n3) * s2, e2.y = t2.y + tt(n3) * s2, e2;
    }, toNumberPoints(t2) {
      let e2 = t2;
      return d(t2[0]) && (e2 = [], t2.forEach((t3) => e2.push(t3.x, t3.y))), e2;
    }, isSame: (t2, e2, s2) => s2 ? t2.x === e2.x && t2.y === e2.y : Z(t2.x) === Z(e2.x) && Z(t2.y) === Z(e2.y), reset(t2) {
      t2.x = t2.y = 0;
    } };
    ht = at;
    ({ getDistanceFrom: lt, copy: dt, setRadius: ct, getAtan2: ut } = ht);
    _t = class __t {
      constructor(t2, e2) {
        this.set(t2, e2);
      }
      set(t2, e2) {
        return d(t2) ? at.copy(this, t2) : at.set(this, t2, e2), this;
      }
      get() {
        const { x: t2, y: e2 } = this;
        return { x: t2, y: e2 };
      }
      clone() {
        return new __t(this);
      }
      move(t2, e2) {
        return at.move(this, t2, e2), this;
      }
      scale(t2, e2) {
        return at.scale(this, t2, e2), this;
      }
      scaleOf(t2, e2, s2) {
        return at.scaleOf(this, t2, e2, s2), this;
      }
      rotate(t2, e2, s2, i2) {
        return at.rotate(this, t2, e2, s2, i2), this;
      }
      rotateOf(t2, e2, s2, i2) {
        return at.rotate(this, e2, t2, s2, i2), this;
      }
      getRotation(t2, e2, s2) {
        return at.getRotation(this, t2, e2, s2);
      }
      toInnerOf(t2, e2) {
        return at.toInnerOf(this, t2, e2), this;
      }
      toOuterOf(t2, e2) {
        return at.toOuterOf(this, t2, e2), this;
      }
      getCenter(t2) {
        return new __t(at.getCenter(this, t2));
      }
      getDistance(t2) {
        return at.getDistance(this, t2);
      }
      getDistancePoint(t2, e2, s2, i2) {
        return new __t(at.getDistancePoint(this, t2, e2, s2, i2));
      }
      getAngle(t2, e2, s2) {
        return at.getAngle(this, t2, e2, s2);
      }
      getAtan2(t2, e2, s2) {
        return at.getAtan2(this, t2, e2, s2);
      }
      isSame(t2, e2) {
        return at.isSame(this, t2, e2);
      }
      reset() {
        return at.reset(this), this;
      }
    };
    pt = new _t();
    ft = class _ft {
      constructor(t2, e2, s2, i2, r3, n3) {
        this.set(t2, e2, s2, i2, r3, n3);
      }
      set(t2, e2, s2, i2, r3, n3) {
        return d(t2) ? Q.copy(this, t2) : Q.set(this, t2, e2, s2, i2, r3, n3), this;
      }
      setWith(t2) {
        return Q.copy(this, t2), this.scaleX = t2.scaleX, this.scaleY = t2.scaleY, this;
      }
      get() {
        const { a: t2, b: e2, c: s2, d: i2, e: r3, f: n3 } = this;
        return { a: t2, b: e2, c: s2, d: i2, e: r3, f: n3 };
      }
      clone() {
        return new _ft(this);
      }
      translate(t2, e2) {
        return Q.translate(this, t2, e2), this;
      }
      translateInner(t2, e2) {
        return Q.translateInner(this, t2, e2), this;
      }
      scale(t2, e2) {
        return Q.scale(this, t2, e2), this;
      }
      scaleWith(t2, e2) {
        return Q.scale(this, t2, e2), this.scaleX *= t2, this.scaleY *= e2 || t2, this;
      }
      pixelScale(t2) {
        return Q.pixelScale(this, t2), this;
      }
      scaleOfOuter(t2, e2, s2) {
        return Q.scaleOfOuter(this, t2, e2, s2), this;
      }
      scaleOfInner(t2, e2, s2) {
        return Q.scaleOfInner(this, t2, e2, s2), this;
      }
      rotate(t2) {
        return Q.rotate(this, t2), this;
      }
      rotateOfOuter(t2, e2) {
        return Q.rotateOfOuter(this, t2, e2), this;
      }
      rotateOfInner(t2, e2) {
        return Q.rotateOfInner(this, t2, e2), this;
      }
      skew(t2, e2) {
        return Q.skew(this, t2, e2), this;
      }
      skewOfOuter(t2, e2, s2) {
        return Q.skewOfOuter(this, t2, e2, s2), this;
      }
      skewOfInner(t2, e2, s2) {
        return Q.skewOfInner(this, t2, e2, s2), this;
      }
      multiply(t2) {
        return Q.multiply(this, t2), this;
      }
      multiplyParent(t2) {
        return Q.multiplyParent(this, t2), this;
      }
      divide(t2) {
        return Q.divide(this, t2), this;
      }
      divideParent(t2) {
        return Q.divideParent(this, t2), this;
      }
      invert() {
        return Q.invert(this), this;
      }
      invertWith() {
        return Q.invert(this), this.scaleX = 1 / this.scaleX, this.scaleY = 1 / this.scaleY, this;
      }
      toOuterPoint(t2, e2, s2) {
        Q.toOuterPoint(this, t2, e2, s2);
      }
      toInnerPoint(t2, e2, s2) {
        Q.toInnerPoint(this, t2, e2, s2);
      }
      setLayout(t2, e2, s2) {
        return Q.setLayout(this, t2, e2, s2), this;
      }
      getLayout(t2, e2, s2) {
        return Q.getLayout(this, t2, e2, s2);
      }
      withScale(t2, e2) {
        return Q.withScale(this, t2, e2);
      }
      reset() {
        return Q.reset(this), this;
      }
    };
    gt = new ft();
    yt = { tempPointBounds: {}, setPoint(t2, e2, s2) {
      t2.minX = t2.maxX = e2, t2.minY = t2.maxY = s2;
    }, addPoint(t2, e2, s2) {
      t2.minX = e2 < t2.minX ? e2 : t2.minX, t2.minY = s2 < t2.minY ? s2 : t2.minY, t2.maxX = e2 > t2.maxX ? e2 : t2.maxX, t2.maxY = s2 > t2.maxY ? s2 : t2.maxY;
    }, addBounds(t2, e2, s2, i2, r3) {
      mt(t2, e2, s2), mt(t2, e2 + i2, s2 + r3);
    }, copy(t2, e2) {
      t2.minX = e2.minX, t2.minY = e2.minY, t2.maxX = e2.maxX, t2.maxY = e2.maxY;
    }, addPointBounds(t2, e2) {
      t2.minX = e2.minX < t2.minX ? e2.minX : t2.minX, t2.minY = e2.minY < t2.minY ? e2.minY : t2.minY, t2.maxX = e2.maxX > t2.maxX ? e2.maxX : t2.maxX, t2.maxY = e2.maxY > t2.maxY ? e2.maxY : t2.maxY;
    }, toBounds(t2, e2) {
      e2.x = t2.minX, e2.y = t2.minY, e2.width = t2.maxX - t2.minX, e2.height = t2.maxY - t2.minY;
    } };
    ({ addPoint: mt } = yt);
    !(function(t2) {
      t2[t2.top = 0] = "top", t2[t2.right = 1] = "right", t2[t2.bottom = 2] = "bottom", t2[t2.left = 3] = "left";
    })(xt || (xt = {})), (function(t2) {
      t2[t2.topLeft = 0] = "topLeft", t2[t2.top = 1] = "top", t2[t2.topRight = 2] = "topRight", t2[t2.right = 3] = "right", t2[t2.bottomRight = 4] = "bottomRight", t2[t2.bottom = 5] = "bottom", t2[t2.bottomLeft = 6] = "bottomLeft", t2[t2.left = 7] = "left", t2[t2.center = 8] = "center", t2[t2["top-left"] = 0] = "top-left", t2[t2["top-right"] = 2] = "top-right", t2[t2["bottom-right"] = 4] = "bottom-right", t2[t2["bottom-left"] = 6] = "bottom-left";
    })(wt || (wt = {}));
    bt = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 1, y: 1 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }];
    bt.forEach((t2) => t2.type = "percent");
    vt = { directionData: bt, tempPoint: {}, get: Bt, toPoint(t2, e2, s2, i2, r3, n3) {
      const o2 = Bt(t2);
      s2.x = o2.x, s2.y = o2.y, "percent" === o2.type && (s2.x *= e2.width, s2.y *= e2.height, r3 && (n3 || (s2.x -= r3.x, s2.y -= r3.y), o2.x && (s2.x -= 1 === o2.x ? r3.width : 0.5 === o2.x ? o2.x * r3.width : 0), o2.y && (s2.y -= 1 === o2.y ? r3.height : 0.5 === o2.y ? o2.y * r3.height : 0))), i2 || (s2.x += e2.x, s2.y += e2.y);
    }, getPoint: (t2, e2, s2, i2 = true) => (s2 || (s2 = {}), vt.toPoint(t2, e2, s2, i2), s2) };
    ({ toPoint: Ct } = vt);
    kt = { toPoint(t2, e2, s2, i2, r3, n3) {
      Ct(t2, s2, i2, r3, e2, n3);
    } };
    ({ tempPointBounds: Ot, setPoint: Tt, addPoint: Pt, toBounds: St } = yt);
    ({ toOuterPoint: Lt } = Q);
    ({ float: Rt, fourNumber: It } = M);
    ({ floor: Et, ceil: Mt } = Math);
    Yt = {};
    Xt = {};
    zt = {};
    Ft = { tempBounds: zt, set(t2, e2 = 0, s2 = 0, i2 = 0, r3 = 0) {
      t2.x = e2, t2.y = s2, t2.width = i2, t2.height = r3;
    }, copy(t2, e2) {
      t2.x = e2.x, t2.y = e2.y, t2.width = e2.width, t2.height = e2.height;
    }, copyAndSpread(t2, e2, s2, i2, r3) {
      const { x: n3, y: o2, width: a, height: h } = e2;
      if (l(s2)) {
        const e3 = It(s2);
        i2 ? Ut.set(t2, n3 + e3[3], o2 + e3[0], a - e3[1] - e3[3], h - e3[2] - e3[0]) : Ut.set(t2, n3 - e3[3], o2 - e3[0], a + e3[1] + e3[3], h + e3[2] + e3[0]);
      } else i2 && (s2 = -s2), Ut.set(t2, n3 - s2, o2 - s2, a + 2 * s2, h + 2 * s2);
      r3 && ("width" === r3 ? (t2.y = o2, t2.height = h) : (t2.x = n3, t2.width = a));
    }, minX: (t2) => t2.width > 0 ? t2.x : t2.x + t2.width, minY: (t2) => t2.height > 0 ? t2.y : t2.y + t2.height, maxX: (t2) => t2.width > 0 ? t2.x + t2.width : t2.x, maxY: (t2) => t2.height > 0 ? t2.y + t2.height : t2.y, move(t2, e2, s2) {
      t2.x += e2, t2.y += s2;
    }, scroll(t2, e2) {
      t2.x += e2.scrollX, t2.y += e2.scrollY;
    }, getByMove: (t2, e2, s2) => (t2 = Object.assign({}, t2), Ut.move(t2, e2, s2), t2), toOffsetOutBounds(t2, e2, s2) {
      e2 ? Vt(e2, t2) : e2 = t2, s2 || (s2 = t2), e2.offsetX = Ut.maxX(s2), e2.offsetY = Ut.maxY(s2), Ut.move(e2, -e2.offsetX, -e2.offsetY);
    }, scale(t2, e2, s2 = e2, i2) {
      i2 || at.scale(t2, e2, s2), t2.width *= e2, t2.height *= s2;
    }, scaleOf(t2, e2, s2, i2 = s2) {
      at.scaleOf(t2, e2, s2, i2), t2.width *= s2, t2.height *= i2;
    }, tempToOuterOf: (t2, e2) => (Ut.copy(zt, t2), Ut.toOuterOf(zt, e2), zt), getOuterOf: (t2, e2) => (t2 = Object.assign({}, t2), Ut.toOuterOf(t2, e2), t2), toOuterOf(t2, e2, s2) {
      if (s2 || (s2 = t2), 0 === e2.b && 0 === e2.c) {
        const { a: i2, d: r3, e: n3, f: o2 } = e2;
        i2 > 0 ? (s2.width = t2.width * i2, s2.x = n3 + t2.x * i2) : (s2.width = t2.width * -i2, s2.x = n3 + t2.x * i2 - s2.width), r3 > 0 ? (s2.height = t2.height * r3, s2.y = o2 + t2.y * r3) : (s2.height = t2.height * -r3, s2.y = o2 + t2.y * r3 - s2.height);
      } else Yt.x = t2.x, Yt.y = t2.y, Lt(e2, Yt, Xt), Tt(Ot, Xt.x, Xt.y), Yt.x = t2.x + t2.width, Lt(e2, Yt, Xt), Pt(Ot, Xt.x, Xt.y), Yt.y = t2.y + t2.height, Lt(e2, Yt, Xt), Pt(Ot, Xt.x, Xt.y), Yt.x = t2.x, Lt(e2, Yt, Xt), Pt(Ot, Xt.x, Xt.y), St(Ot, s2);
    }, toInnerOf(t2, e2, s2) {
      s2 || (s2 = t2), Ut.move(s2, -e2.e, -e2.f), Ut.scale(s2, 1 / e2.a, 1 / e2.d);
    }, getFitMatrix(t2, e2, s2 = 1) {
      const i2 = Math.min(s2, Ut.getFitScale(t2, e2));
      return new ft(i2, 0, 0, i2, -e2.x * i2, -e2.y * i2);
    }, getFitScale(t2, e2, s2) {
      const i2 = t2.width / e2.width, r3 = t2.height / e2.height;
      return s2 ? Math.max(i2, r3) : Math.min(i2, r3);
    }, put(t2, e2, s2 = "center", i2 = 1, n3 = true, o2) {
      o2 || (o2 = e2), r(i2) && (i2 = Ut.getFitScale(t2, e2, "cover" === i2)), zt.width = n3 ? e2.width *= i2 : e2.width * i2, zt.height = n3 ? e2.height *= i2 : e2.height * i2, kt.toPoint(s2, zt, t2, o2, true, true);
    }, getSpread(t2, e2, s2) {
      const i2 = {};
      return Ut.copyAndSpread(i2, t2, e2, false, s2), i2;
    }, spread(t2, e2, s2) {
      Ut.copyAndSpread(t2, t2, e2, false, s2);
    }, shrink(t2, e2, s2) {
      Ut.copyAndSpread(t2, t2, e2, true, s2);
    }, ceil(t2) {
      const { x: e2, y: s2 } = t2;
      t2.x = Et(t2.x), t2.y = Et(t2.y), t2.width = e2 > t2.x ? Mt(t2.width + e2 - t2.x) : Mt(t2.width), t2.height = s2 > t2.y ? Mt(t2.height + s2 - t2.y) : Mt(t2.height);
    }, unsign(t2) {
      t2.width < 0 && (t2.x += t2.width, t2.width = -t2.width), t2.height < 0 && (t2.y += t2.height, t2.height = -t2.height);
    }, float(t2, e2) {
      t2.x = Rt(t2.x, e2), t2.y = Rt(t2.y, e2), t2.width = Rt(t2.width, e2), t2.height = Rt(t2.height, e2);
    }, add(t2, e2, s2) {
      At = t2.x + t2.width, Wt = t2.y + t2.height, Nt = e2.x, Dt = e2.y, s2 || (Nt += e2.width, Dt += e2.height), At = At > Nt ? At : Nt, Wt = Wt > Dt ? Wt : Dt, t2.x = t2.x < e2.x ? t2.x : e2.x, t2.y = t2.y < e2.y ? t2.y : e2.y, t2.width = At - t2.x, t2.height = Wt - t2.y;
    }, addList(t2, e2) {
      Ut.setListWithFn(t2, e2, void 0, true);
    }, setList(t2, e2, s2 = false) {
      Ut.setListWithFn(t2, e2, void 0, s2);
    }, addListWithFn(t2, e2, s2) {
      Ut.setListWithFn(t2, e2, s2, true);
    }, setListWithFn(t2, e2, s2, i2 = false) {
      let r3, n3 = true;
      for (let o2 = 0, a = e2.length; o2 < a; o2++) r3 = s2 ? s2(e2[o2], o2) : e2[o2], r3 && (r3.width || r3.height) && (n3 ? (n3 = false, i2 || Vt(t2, r3)) : jt(t2, r3));
      n3 && Ut.reset(t2);
    }, setPoints(t2, e2) {
      e2.forEach((t3, e3) => 0 === e3 ? Tt(Ot, t3.x, t3.y) : Pt(Ot, t3.x, t3.y)), St(Ot, t2);
    }, setPoint(t2, e2) {
      Ut.set(t2, e2.x, e2.y);
    }, addPoint(t2, e2) {
      jt(t2, e2, true);
    }, getPoints(t2) {
      const { x: e2, y: s2, width: i2, height: r3 } = t2;
      return [{ x: e2, y: s2 }, { x: e2 + i2, y: s2 }, { x: e2 + i2, y: s2 + r3 }, { x: e2, y: s2 + r3 }];
    }, getPoint: (t2, e2, s2 = false, i2) => vt.getPoint(e2, t2, i2, s2), hitRadiusPoint: (t2, e2, s2) => (s2 && (e2 = at.tempToInnerRadiusPointOf(e2, s2)), e2.x >= t2.x - e2.radiusX && e2.x <= t2.x + t2.width + e2.radiusX && e2.y >= t2.y - e2.radiusY && e2.y <= t2.y + t2.height + e2.radiusY), hitPoint: (t2, e2, s2) => (s2 && (e2 = at.tempToInnerOf(e2, s2)), e2.x >= t2.x && e2.x <= t2.x + t2.width && e2.y >= t2.y && e2.y <= t2.y + t2.height), hit: (t2, e2, s2) => (s2 && (e2 = Ut.tempToOuterOf(e2, s2)), !(t2.y + t2.height < e2.y || e2.y + e2.height < t2.y || t2.x + t2.width < e2.x || e2.x + e2.width < t2.x)), includes: (t2, e2, s2) => (s2 && (e2 = Ut.tempToOuterOf(e2, s2)), t2.x <= e2.x && t2.y <= e2.y && t2.x + t2.width >= e2.x + e2.width && t2.y + t2.height >= e2.y + e2.height), getIntersectData(t2, e2, s2) {
      if (s2 && (e2 = Ut.tempToOuterOf(e2, s2)), !Ut.hit(t2, e2)) return { x: 0, y: 0, width: 0, height: 0 };
      let { x: i2, y: r3, width: n3, height: o2 } = e2;
      return At = i2 + n3, Wt = r3 + o2, Nt = t2.x + t2.width, Dt = t2.y + t2.height, i2 = i2 > t2.x ? i2 : t2.x, r3 = r3 > t2.y ? r3 : t2.y, At = At < Nt ? At : Nt, Wt = Wt < Dt ? Wt : Dt, n3 = At - i2, o2 = Wt - r3, { x: i2, y: r3, width: n3, height: o2 };
    }, intersect(t2, e2, s2) {
      Ut.copy(t2, Ut.getIntersectData(t2, e2, s2));
    }, isSame: (t2, e2) => t2.x === e2.x && t2.y === e2.y && t2.width === e2.width && t2.height === e2.height, isEmpty: (t2) => 0 === t2.x && 0 === t2.y && 0 === t2.width && 0 === t2.height, hasSize: (t2) => t2.width && t2.height, reset(t2) {
      Ut.set(t2);
    } };
    Ut = Ft;
    ({ add: jt, copy: Vt } = Ut);
    qt = class _qt {
      get minX() {
        return Ft.minX(this);
      }
      get minY() {
        return Ft.minY(this);
      }
      get maxX() {
        return Ft.maxX(this);
      }
      get maxY() {
        return Ft.maxY(this);
      }
      constructor(t2, e2, s2, i2) {
        this.set(t2, e2, s2, i2);
      }
      set(t2, e2, s2, i2) {
        return d(t2) ? Ft.copy(this, t2) : Ft.set(this, t2, e2, s2, i2), this;
      }
      get() {
        const { x: t2, y: e2, width: s2, height: i2 } = this;
        return { x: t2, y: e2, width: s2, height: i2 };
      }
      clone() {
        return new _qt(this);
      }
      move(t2, e2) {
        return Ft.move(this, t2, e2), this;
      }
      scale(t2, e2, s2) {
        return Ft.scale(this, t2, e2, s2), this;
      }
      scaleOf(t2, e2, s2) {
        return Ft.scaleOf(this, t2, e2, s2), this;
      }
      toOuterOf(t2, e2) {
        return Ft.toOuterOf(this, t2, e2), this;
      }
      toInnerOf(t2, e2) {
        return Ft.toInnerOf(this, t2, e2), this;
      }
      getFitMatrix(t2, e2) {
        return Ft.getFitMatrix(this, t2, e2);
      }
      put(t2, e2, s2) {
        Ft.put(this, t2, e2, s2);
      }
      spread(t2, e2) {
        return Ft.spread(this, t2, e2), this;
      }
      shrink(t2, e2) {
        return Ft.shrink(this, t2, e2), this;
      }
      ceil() {
        return Ft.ceil(this), this;
      }
      unsign() {
        return Ft.unsign(this), this;
      }
      float(t2) {
        return Ft.float(this, t2), this;
      }
      add(t2) {
        return Ft.add(this, t2), this;
      }
      addList(t2) {
        return Ft.setList(this, t2, true), this;
      }
      setList(t2) {
        return Ft.setList(this, t2), this;
      }
      addListWithFn(t2, e2) {
        return Ft.setListWithFn(this, t2, e2, true), this;
      }
      setListWithFn(t2, e2) {
        return Ft.setListWithFn(this, t2, e2), this;
      }
      setPoint(t2) {
        return Ft.setPoint(this, t2), this;
      }
      setPoints(t2) {
        return Ft.setPoints(this, t2), this;
      }
      addPoint(t2) {
        return Ft.addPoint(this, t2), this;
      }
      getPoints() {
        return Ft.getPoints(this);
      }
      getPoint(t2, e2, s2) {
        return Ft.getPoint(this, t2, e2, s2);
      }
      hitPoint(t2, e2) {
        return Ft.hitPoint(this, t2, e2);
      }
      hitRadiusPoint(t2, e2) {
        return Ft.hitRadiusPoint(this, t2, e2);
      }
      hit(t2, e2) {
        return Ft.hit(this, t2, e2);
      }
      includes(t2, e2) {
        return Ft.includes(this, t2, e2);
      }
      intersect(t2, e2) {
        return Ft.intersect(this, t2, e2), this;
      }
      getIntersect(t2, e2) {
        return new _qt(Ft.getIntersectData(this, t2, e2));
      }
      isSame(t2) {
        return Ft.isSame(this, t2);
      }
      isEmpty() {
        return Ft.isEmpty(this);
      }
      reset() {
        Ft.reset(this);
      }
    };
    Ht = new qt();
    Gt = class {
      constructor(t2, e2, s2, i2, r3, n3) {
        d(t2) ? this.copy(t2) : this.set(t2, e2, s2, i2, r3, n3);
      }
      set(t2 = 0, e2 = 0, s2 = 0, i2 = 0, r3 = 0, n3 = 0) {
        this.top = t2, this.right = e2, this.bottom = s2, this.left = i2, this.width = r3, this.height = n3;
      }
      copy(t2) {
        const { top: e2, right: s2, bottom: i2, left: r3, width: n3, height: o2 } = t2;
        this.set(e2, s2, i2, r3, n3, o2);
      }
      getBoundsFrom(t2) {
        const { top: e2, right: s2, bottom: i2, left: r3, width: n3, height: o2 } = this;
        return new qt(r3, e2, n3 || t2.width - r3 - s2, o2 || t2.height - e2 - i2);
      }
    };
    Qt = { number: (t2, e2) => d(t2) ? "percent" === t2.type ? t2.value * e2 : t2.value : t2 };
    Jt = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, ".": 1, e: 1, E: 1 };
    ({ floor: Zt, max: $t } = Math);
    Kt = { toURL(t2, e2) {
      let s2 = encodeURIComponent(t2);
      return "text" === e2 ? s2 = "data:text/plain;charset=utf-8," + s2 : "svg" === e2 && (s2 = "data:image/svg+xml," + s2), s2;
    }, image: { hitCanvasSize: 100, maxCacheSize: 4096e3, maxPatternSize: 8847360, crossOrigin: "anonymous", isLarge: (t2, e2, s2, i2) => t2.width * t2.height * (e2 ? e2 * s2 : 1) > (i2 || te.maxCacheSize), isSuperLarge: (t2, e2, s2) => te.isLarge(t2, e2, s2, te.maxPatternSize), getRealURL(t2) {
      const { prefix: e2, suffix: s2 } = te;
      return !s2 || t2.startsWith("data:") || t2.startsWith("blob:") || (t2 += (t2.includes("?") ? "&" : "?") + s2), e2 && "/" === t2[0] && (t2 = e2 + t2), t2;
    }, resize(t2, e2, s2, i2, r3, n3, o2, a, h, l2) {
      const d2 = $t(Zt(e2 + (i2 || 0)), 1), c = $t(Zt(s2 + (r3 || 0)), 1);
      let u2, _2, p2;
      l2 && (p2 = Qt.number(l2.offset, "x" === l2.type ? e2 : s2)) && ("x" === l2.type ? u2 = true : _2 = true);
      const f2 = Kt.origin.createCanvas(_2 ? 2 * d2 : d2, u2 ? 2 * c : c), g2 = f2.getContext("2d");
      if (a && (g2.globalAlpha = a), g2.imageSmoothingEnabled = false !== o2, te.canUse(t2)) {
        if (n3) {
          const i3 = e2 / n3.width, r4 = s2 / n3.height;
          g2.setTransform(i3, 0, 0, r4, -n3.x * i3, -n3.y * r4), g2.drawImage(t2, 0, 0, t2.width, t2.height);
        } else g2.drawImage(t2, 0, 0, e2, s2);
        p2 && (g2.drawImage(f2, 0, 0, d2, c, u2 ? p2 - d2 : d2, u2 ? c : p2 - c, d2, c), g2.drawImage(f2, 0, 0, d2, c, u2 ? p2 : d2, u2 ? c : p2, d2, c));
      }
      return f2;
    }, canUse: (t2) => t2 && t2.width && !t2.__closed, setPatternTransform(t2, e2, s2) {
      try {
        e2 && t2.setTransform && (t2.setTransform(e2), e2 = void 0);
      } catch (t3) {
      }
      s2 && _.stintSet(s2, "transform", e2);
    } } };
    ({ image: te } = Kt);
    ({ randColor: ee } = M);
    se = class _se {
      constructor(t2) {
        this.repeatMap = {}, this.name = t2;
      }
      static get(t2) {
        return new _se(t2);
      }
      static set filter(t2) {
        this.filterList = ie(t2);
      }
      static set exclude(t2) {
        this.excludeList = ie(t2);
      }
      static drawRepaint(t2, e2) {
        const s2 = ee();
        t2.fillWorld(e2, s2.replace("1)", ".1)")), t2.strokeWorld(e2, s2);
      }
      static drawBounds(t2, e2, s2) {
        const i2 = "hit" === _se.showBounds, r3 = t2.__nowWorld, n3 = ee();
        i2 && (e2.setWorld(r3), t2.__drawHitPath(e2), e2.fillStyle = n3.replace("1)", ".2)"), e2.fill()), e2.resetTransform(), e2.setStroke(n3, 2), i2 ? e2.stroke() : e2.strokeWorld(r3, n3);
      }
      log(...t2) {
        if (re.enable) {
          if (re.filterList.length && re.filterList.every((t3) => t3 !== this.name)) return;
          if (re.excludeList.length && re.excludeList.some((t3) => t3 === this.name)) return;
          console.log("%c" + this.name, "color:#21ae62", ...t2);
        }
      }
      tip(...t2) {
        re.enable && this.warn(...t2);
      }
      warn(...t2) {
        re.showWarn && console.warn(this.name, ...t2);
      }
      repeat(t2, ...e2) {
        this.repeatMap[t2] || (this.warn("repeat:" + t2, ...e2), this.repeatMap[t2] = true);
      }
      error(...t2) {
        try {
          throw new Error();
        } catch (e2) {
          console.error(this.name, ...t2, e2);
        }
      }
    };
    se.filterList = [], se.excludeList = [], se.showWarn = true;
    re = se;
    ne = se.get("RunTime");
    oe = { currentId: 0, currentName: "", idMap: {}, nameMap: {}, nameToIdMap: {}, start(t2, e2) {
      const s2 = g.create(g.RUNTIME);
      return ae.currentId = ae.idMap[s2] = e2 ? performance.now() : Date.now(), ae.currentName = ae.nameMap[s2] = t2, ae.nameToIdMap[t2] = s2, s2;
    }, end(t2, e2) {
      const s2 = ae.idMap[t2], i2 = ae.nameMap[t2], r3 = e2 ? (performance.now() - s2) / 1e3 : Date.now() - s2;
      ae.idMap[t2] = ae.nameMap[t2] = ae.nameToIdMap[i2] = void 0, ne.log(i2, r3, "ms");
    }, endOfName(t2, e2) {
      const i2 = ae.nameToIdMap[t2];
      s(i2) || ae.end(i2, e2);
    } };
    ae = oe;
    he = [];
    le = { list: {}, add(t2, ...e2) {
      this.list[t2] = true, he.push(...e2);
    }, has(t2, e2) {
      const s2 = this.list[t2];
      return !s2 && e2 && this.need(t2), s2;
    }, need(t2) {
      console.error("please install and import plugin: " + (t2.includes("-x") ? "" : "@leafer-in/") + t2);
    } };
    setTimeout(() => he.forEach((t2) => le.has(t2, true)));
    de = { editor: (t2) => le.need("editor") };
    ce = se.get("UICreator");
    ue = { list: {}, register(t2) {
      const { __tag: e2 } = t2.prototype;
      _e[e2] && ce.repeat(e2), _e[e2] = t2;
    }, get(t2, e2, i2, r3, n3, o2) {
      if (!_e[t2]) return void ce.warn("not register " + t2);
      const a = new _e[t2](e2);
      return s(i2) || (a.x = i2, r3 && (a.y = r3), n3 && (a.width = n3), o2 && (a.height = o2)), a;
    } };
    ({ list: _e } = ue);
    pe = se.get("EventCreator");
    fe = { nameList: {}, register(t2) {
      let e2;
      Object.keys(t2).forEach((s2) => {
        e2 = t2[s2], r(e2) && (ge[e2] && pe.repeat(e2), ge[e2] = t2);
      });
    }, changeName(t2, e2) {
      const s2 = ge[t2];
      if (s2) {
        const i2 = Object.keys(s2).find((e3) => s2[e3] === t2);
        i2 && (s2[i2] = e2, ge[e2] = s2);
      }
    }, has(t2) {
      return !!this.nameList[t2];
    }, get: (t2, ...e2) => new ge[t2](...e2) };
    ({ nameList: ge } = fe);
    ye = class {
      constructor() {
        this.list = [];
      }
      add(t2) {
        t2.manager = this, this.list.push(t2);
      }
      get(t2) {
        let e2;
        const { list: s2 } = this;
        for (let i3 = 0, r3 = s2.length; i3 < r3; i3++) if (e2 = s2[i3], e2.recycled && e2.isSameSize(t2)) return e2.recycled = false, e2.manager || (e2.manager = this), e2;
        const i2 = de.canvas(t2);
        return this.add(i2), i2;
      }
      recycle(t2) {
        t2.recycled = true;
      }
      clearRecycled() {
        let t2;
        const e2 = [];
        for (let s2 = 0, i2 = this.list.length; s2 < i2; s2++) t2 = this.list[s2], t2.recycled ? t2.destroy() : e2.push(t2);
        this.list = e2;
      }
      clear() {
        this.list.forEach((t2) => {
          t2.destroy();
        }), this.list.length = 0;
      }
      destroy() {
        this.clear();
      }
    };
    be = [];
    Be = [];
    Ce = class {
      set blendMode(t2) {
        "normal" === t2 && (t2 = "source-over"), this.context.globalCompositeOperation = t2;
      }
      get blendMode() {
        return this.context.globalCompositeOperation;
      }
      set dashPattern(t2) {
        this.context.setLineDash(t2 || Be);
      }
      get dashPattern() {
        return this.context.getLineDash();
      }
      __bindContext() {
        let t2;
        be.forEach((e2) => {
          t2 = this.context[e2], t2 && (this[e2] = t2.bind(this.context));
        }), this.textBaseline = "alphabetic";
      }
      setTransform(t2, e2, s2, i2, r3, n3) {
      }
      resetTransform() {
      }
      getTransform() {
      }
      save() {
      }
      restore() {
      }
      transform(t2, e2, s2, i2, r3, n3) {
        d(t2) ? this.context.transform(t2.a, t2.b, t2.c, t2.d, t2.e, t2.f) : this.context.transform(t2, e2, s2, i2, r3, n3);
      }
      translate(t2, e2) {
      }
      scale(t2, e2) {
      }
      rotate(t2) {
      }
      fill(t2, e2) {
      }
      stroke(t2) {
      }
      clip(t2, e2) {
      }
      fillRect(t2, e2, s2, i2) {
      }
      strokeRect(t2, e2, s2, i2) {
      }
      clearRect(t2, e2, s2, i2) {
      }
      drawImage(t2, e2, s2, i2, r3, n3, o2, a, h) {
        switch (arguments.length) {
          case 9:
            if (e2 < 0) {
              const t3 = -e2 / i2 * a;
              i2 += e2, e2 = 0, n3 += t3, a -= t3;
            }
            if (s2 < 0) {
              const t3 = -s2 / r3 * h;
              r3 += s2, s2 = 0, o2 += t3, h -= t3;
            }
            this.context.drawImage(t2, e2, s2, i2, r3, n3, o2, a, h);
            break;
          case 5:
            this.context.drawImage(t2, e2, s2, i2, r3);
            break;
          case 3:
            this.context.drawImage(t2, e2, s2);
        }
      }
      beginPath() {
      }
      moveTo(t2, e2) {
      }
      lineTo(t2, e2) {
      }
      bezierCurveTo(t2, e2, s2, i2, r3, n3) {
      }
      quadraticCurveTo(t2, e2, s2, i2) {
      }
      closePath() {
      }
      arc(t2, e2, s2, i2, r3, n3) {
      }
      arcTo(t2, e2, s2, i2, r3) {
      }
      ellipse(t2, e2, s2, i2, r3, n3, o2, a) {
      }
      rect(t2, e2, s2, i2) {
      }
      roundRect(t2, e2, s2, i2, r3) {
      }
      createConicGradient(t2, e2, s2) {
      }
      createLinearGradient(t2, e2, s2, i2) {
      }
      createPattern(t2, e2) {
      }
      createRadialGradient(t2, e2, s2, i2, r3, n3) {
      }
      fillText(t2, e2, s2, i2) {
      }
      measureText(t2) {
      }
      strokeText(t2, e2, s2, i2) {
      }
      destroy() {
        this.context = null;
      }
    };
    me([we("imageSmoothingEnabled")], Ce.prototype, "smooth", void 0), me([we("imageSmoothingQuality")], Ce.prototype, "smoothLevel", void 0), me([we("globalAlpha")], Ce.prototype, "opacity", void 0), me([we()], Ce.prototype, "fillStyle", void 0), me([we()], Ce.prototype, "strokeStyle", void 0), me([we("lineWidth")], Ce.prototype, "strokeWidth", void 0), me([we("lineCap")], Ce.prototype, "strokeCap", void 0), me([we("lineJoin")], Ce.prototype, "strokeJoin", void 0), me([we("lineDashOffset")], Ce.prototype, "dashOffset", void 0), me([we()], Ce.prototype, "miterLimit", void 0), me([we()], Ce.prototype, "shadowBlur", void 0), me([we()], Ce.prototype, "shadowColor", void 0), me([we()], Ce.prototype, "shadowOffsetX", void 0), me([we()], Ce.prototype, "shadowOffsetY", void 0), me([we()], Ce.prototype, "filter", void 0), me([we()], Ce.prototype, "font", void 0), me([we()], Ce.prototype, "fontKerning", void 0), me([we()], Ce.prototype, "fontStretch", void 0), me([we()], Ce.prototype, "fontVariantCaps", void 0), me([we()], Ce.prototype, "textAlign", void 0), me([we()], Ce.prototype, "textBaseline", void 0), me([we()], Ce.prototype, "textRendering", void 0), me([we()], Ce.prototype, "wordSpacing", void 0), me([we()], Ce.prototype, "letterSpacing", void 0), me([we()], Ce.prototype, "direction", void 0), me([ve()], Ce.prototype, "setTransform", null), me([ve()], Ce.prototype, "resetTransform", null), me([ve()], Ce.prototype, "getTransform", null), me([ve()], Ce.prototype, "save", null), me([ve()], Ce.prototype, "restore", null), me([ve()], Ce.prototype, "translate", null), me([ve()], Ce.prototype, "scale", null), me([ve()], Ce.prototype, "rotate", null), me([ve()], Ce.prototype, "fill", null), me([ve()], Ce.prototype, "stroke", null), me([ve()], Ce.prototype, "clip", null), me([ve()], Ce.prototype, "fillRect", null), me([ve()], Ce.prototype, "strokeRect", null), me([ve()], Ce.prototype, "clearRect", null), me([ve()], Ce.prototype, "beginPath", null), me([ve()], Ce.prototype, "moveTo", null), me([ve()], Ce.prototype, "lineTo", null), me([ve()], Ce.prototype, "bezierCurveTo", null), me([ve()], Ce.prototype, "quadraticCurveTo", null), me([ve()], Ce.prototype, "closePath", null), me([ve()], Ce.prototype, "arc", null), me([ve()], Ce.prototype, "arcTo", null), me([ve()], Ce.prototype, "ellipse", null), me([ve()], Ce.prototype, "rect", null), me([ve()], Ce.prototype, "roundRect", null), me([ve()], Ce.prototype, "createConicGradient", null), me([ve()], Ce.prototype, "createLinearGradient", null), me([ve()], Ce.prototype, "createPattern", null), me([ve()], Ce.prototype, "createRadialGradient", null), me([ve()], Ce.prototype, "fillText", null), me([ve()], Ce.prototype, "measureText", null), me([ve()], Ce.prototype, "strokeText", null);
    ({ copy: ke, multiplyParent: Oe, pixelScale: Te } = Q);
    ({ round: Pe } = Math);
    Se = new qt();
    Le = new qt();
    Re = { width: 1, height: 1, pixelRatio: 1 };
    Ie = ["width", "height", "pixelRatio"];
    Ee = class extends Ce {
      get width() {
        return this.size.width;
      }
      get height() {
        return this.size.height;
      }
      get pixelRatio() {
        return this.size.pixelRatio;
      }
      get pixelWidth() {
        return this.width * this.pixelRatio || 0;
      }
      get pixelHeight() {
        return this.height * this.pixelRatio || 0;
      }
      get pixelSnap() {
        return this.config.pixelSnap;
      }
      set pixelSnap(t2) {
        this.config.pixelSnap = t2;
      }
      get allowBackgroundColor() {
        return this.view && this.parentView;
      }
      constructor(t2, e2) {
        super(), this.size = {}, this.worldTransform = {}, t2 || (t2 = Re), this.manager = e2, this.innerId = g.create(g.CANVAS);
        const { width: s2, height: i2, pixelRatio: r3 } = t2;
        this.autoLayout = !s2 || !i2, this.size.pixelRatio = r3 || Kt.devicePixelRatio, this.config = t2, this.init();
      }
      init() {
      }
      __createContext() {
        const { view: t2 } = this, { contextSettings: e2 } = this.config;
        this.context = e2 ? t2.getContext("2d", e2) : t2.getContext("2d"), this.__bindContext();
      }
      export(t2, e2) {
      }
      toBlob(t2, e2) {
      }
      toDataURL(t2, e2) {
      }
      saveAs(t2, e2) {
      }
      resize(t2, e2 = true) {
        if (this.isSameSize(t2)) return;
        let s2;
        this.context && !this.unreal && e2 && this.width && (s2 = this.getSameCanvas(), s2.copyWorld(this));
        const i2 = this.size;
        _.copyAttrs(i2, t2, Ie), Ie.forEach((t3) => i2[t3] || (i2[t3] = 1)), this.bounds = new qt(0, 0, this.width, this.height), this.updateViewSize(), this.updateClientBounds(), this.context && (this.smooth = this.config.smooth, !this.unreal && s2 && (this.clearWorld(s2.bounds), this.copyWorld(s2), s2.recycle()));
      }
      updateViewSize() {
      }
      updateClientBounds() {
      }
      getClientBounds(t2) {
        return t2 && this.updateClientBounds(), this.clientBounds || this.bounds;
      }
      startAutoLayout(t2, e2) {
      }
      stopAutoLayout() {
      }
      setCursor(t2) {
      }
      setWorld(t2, e2) {
        const { pixelRatio: s2, pixelSnap: i2 } = this, r3 = this.worldTransform;
        e2 && Oe(t2, e2, r3), Te(t2, s2, r3), i2 && !t2.ignorePixelSnap && (t2.half && t2.half * s2 % 2 ? (r3.e = Pe(r3.e - 0.5) + 0.5, r3.f = Pe(r3.f - 0.5) + 0.5) : (r3.e = Pe(r3.e), r3.f = Pe(r3.f))), this.setTransform(r3.a, r3.b, r3.c, r3.d, r3.e, r3.f);
      }
      useWorldTransform(t2) {
        t2 && (this.worldTransform = t2);
        const e2 = this.worldTransform;
        e2 && this.setTransform(e2.a, e2.b, e2.c, e2.d, e2.e, e2.f);
      }
      setStroke(t2, e2, s2, i2) {
        e2 && (this.strokeWidth = e2), t2 && (this.strokeStyle = t2), s2 && this.setStrokeOptions(s2, i2);
      }
      setStrokeOptions(t2, e2) {
        let { strokeCap: i2, strokeJoin: r3, dashPattern: n3, dashOffset: o2, miterLimit: a } = t2;
        e2 && (e2.strokeCap && (i2 = e2.strokeCap), e2.strokeJoin && (r3 = e2.strokeJoin), s(e2.dashPattern) || (n3 = e2.dashPattern), s(e2.dashOffset) || (o2 = e2.dashOffset), e2.miterLimit && (a = e2.miterLimit)), this.strokeCap = i2, this.strokeJoin = r3, this.dashPattern = n3, this.dashOffset = o2, this.miterLimit = a;
      }
      saveBlendMode(t2) {
        this.savedBlendMode = this.blendMode, this.blendMode = t2;
      }
      restoreBlendMode() {
        this.blendMode = this.savedBlendMode;
      }
      hitFill(t2, e2) {
        return true;
      }
      hitStroke(t2, e2) {
        return true;
      }
      hitPixel(t2, e2, s2 = 1) {
        return true;
      }
      setWorldShadow(t2, e2, s2, i2) {
        const { pixelRatio: r3 } = this;
        this.shadowOffsetX = t2 * r3, this.shadowOffsetY = e2 * r3, this.shadowBlur = s2 * r3, this.shadowColor = i2 || "black";
      }
      setWorldBlur(t2) {
        const { pixelRatio: e2 } = this;
        this.filter = `blur(${t2 * e2}px)`;
      }
      copyWorld(t2, e2, s2, i2, r3) {
        i2 && (this.blendMode = i2), e2 ? (this.setTempPixelBounds(e2, r3), s2 ? (this.setTempPixelBounds2(s2, r3), s2 = Le) : s2 = Se, this.drawImage(t2.view, Se.x, Se.y, Se.width, Se.height, s2.x, s2.y, s2.width, s2.height)) : this.drawImage(t2.view, 0, 0), i2 && (this.blendMode = "source-over");
      }
      copyWorldToInner(t2, e2, s2, i2, r3) {
        e2.b || e2.c ? (this.save(), this.resetTransform(), this.copyWorld(t2, e2, Ft.tempToOuterOf(s2, e2), i2, r3), this.restore()) : (i2 && (this.blendMode = i2), this.setTempPixelBounds(e2, r3), this.drawImage(t2.view, Se.x, Se.y, Se.width, Se.height, s2.x, s2.y, s2.width, s2.height), i2 && (this.blendMode = "source-over"));
      }
      copyWorldByReset(t2, e2, s2, i2, r3, n3) {
        this.resetTransform(), this.copyWorld(t2, e2, s2, i2, n3), r3 || this.useWorldTransform();
      }
      useGrayscaleAlpha(t2) {
        if (this.setTempPixelBounds(t2, true, true), !Se.width || !Se.height) return;
        let e2, s2;
        const { context: i2 } = this, r3 = i2.getImageData(Se.x, Se.y, Se.width, Se.height), { data: n3 } = r3;
        for (let t3 = 0, i3 = n3.length; t3 < i3; t3 += 4) s2 = 0.299 * n3[t3] + 0.587 * n3[t3 + 1] + 0.114 * n3[t3 + 2], (e2 = n3[t3 + 3]) && (n3[t3 + 3] = 255 === e2 ? s2 : e2 * (s2 / 255));
        i2.putImageData(r3, Se.x, Se.y);
      }
      useMask(t2, e2, s2) {
        this.copyWorld(t2, e2, s2, "destination-in");
      }
      useEraser(t2, e2, s2) {
        this.copyWorld(t2, e2, s2, "destination-out");
      }
      fillWorld(t2, e2, s2, i2) {
        s2 && (this.blendMode = s2), this.fillStyle = e2, this.setTempPixelBounds(t2, i2), this.fillRect(Se.x, Se.y, Se.width, Se.height), s2 && (this.blendMode = "source-over");
      }
      strokeWorld(t2, e2, s2, i2) {
        s2 && (this.blendMode = s2), this.strokeStyle = e2, this.setTempPixelBounds(t2, i2), this.strokeRect(Se.x, Se.y, Se.width, Se.height), s2 && (this.blendMode = "source-over");
      }
      clipWorld(t2, e2 = true) {
        this.beginPath(), this.setTempPixelBounds(t2, e2), this.rect(Se.x, Se.y, Se.width, Se.height), this.clip();
      }
      clipUI(t2) {
        t2.windingRule ? this.clip(t2.windingRule) : this.clip();
      }
      clearWorld(t2, e2 = true) {
        this.setTempPixelBounds(t2, e2), this.clearRect(Se.x, Se.y, Se.width, Se.height);
      }
      clear() {
        const { pixelRatio: t2 } = this;
        this.clearRect(0, 0, this.width * t2 + 2, this.height * t2 + 2);
      }
      setTempPixelBounds(t2, e2, s2) {
        this.copyToPixelBounds(Se, t2, e2, s2);
      }
      setTempPixelBounds2(t2, e2, s2) {
        this.copyToPixelBounds(Le, t2, e2, s2);
      }
      copyToPixelBounds(t2, e2, s2, i2) {
        t2.set(e2), i2 && t2.intersect(this.bounds), t2.scale(this.pixelRatio), s2 && t2.ceil();
      }
      isSameSize(t2) {
        return this.width === t2.width && this.height === t2.height && (!t2.pixelRatio || this.pixelRatio === t2.pixelRatio);
      }
      getSameCanvas(t2, e2) {
        const { size: s2, pixelSnap: i2 } = this, r3 = this.manager ? this.manager.get(s2) : de.canvas(Object.assign({}, s2));
        return r3.save(), t2 && (ke(r3.worldTransform, this.worldTransform), r3.useWorldTransform()), e2 && (r3.smooth = this.smooth), r3.pixelSnap !== i2 && (r3.pixelSnap = i2), r3;
      }
      recycle(t2) {
        this.recycled || (this.restore(), t2 ? this.clearWorld(t2) : this.clear(), this.manager ? this.manager.recycle(this) : this.destroy());
      }
      updateRender(t2) {
      }
      unrealCanvas() {
      }
      destroy() {
        this.manager = this.view = this.parentView = null;
      }
    };
    Me = { creator: {}, parse(t2, e2) {
    }, convertToCanvasData(t2, e2) {
    } };
    Ae = { N: 21, D: 22, X: 23, G: 24, F: 25, O: 26, P: 27, U: 28 };
    We = Object.assign({ M: 1, m: 10, L: 2, l: 20, H: 3, h: 30, V: 4, v: 40, C: 5, c: 50, S: 6, s: 60, Q: 7, q: 70, T: 8, t: 80, A: 9, a: 90, Z: 11, z: 11, R: 12 }, Ae);
    Ne = { M: 3, m: 3, L: 3, l: 3, H: 2, h: 2, V: 2, v: 2, C: 7, c: 7, S: 5, s: 5, Q: 5, q: 5, T: 3, t: 3, A: 8, a: 8, Z: 1, z: 1, N: 5, D: 9, X: 6, G: 9, F: 5, O: 7, P: 4, U: 6 };
    De = { m: 10, l: 20, H: 3, h: 30, V: 4, v: 40, c: 50, S: 6, s: 60, q: 70, T: 8, t: 80, A: 9, a: 90 };
    Ye = Object.assign(Object.assign({}, De), Ae);
    Xe = We;
    ze = {};
    for (let t2 in Xe) ze[Xe[t2]] = t2;
    Fe = {};
    for (let t2 in Xe) Fe[Xe[t2]] = Ne[t2];
    Ue = { drawRoundRect(t2, e2, s2, i2, r3, n3) {
      const o2 = M.fourNumber(n3, Math.min(i2 / 2, r3 / 2)), a = e2 + i2, h = s2 + r3;
      o2[0] ? t2.moveTo(e2 + o2[0], s2) : t2.moveTo(e2, s2), o2[1] ? t2.arcTo(a, s2, a, h, o2[1]) : t2.lineTo(a, s2), o2[2] ? t2.arcTo(a, h, e2, h, o2[2]) : t2.lineTo(a, h), o2[3] ? t2.arcTo(e2, h, e2, s2, o2[3]) : t2.lineTo(e2, h), o2[0] ? t2.arcTo(e2, s2, a, s2, o2[0]) : t2.lineTo(e2, s2);
    } };
    ({ sin: je, cos: Ve, hypot: qe, atan2: He, ceil: Ge, abs: Qe, PI: Je, sqrt: Ze, pow: $e } = Math);
    ({ setPoint: Ke, addPoint: ts } = yt);
    ({ set: es, toNumberPoints: ss } = at);
    ({ M: is, L: rs, C: ns, Q: os, Z: as } = We);
    hs = {};
    ls = { points(t2, e2, s2, i2) {
      let r3 = ss(e2);
      if (t2.push(is, r3[0], r3[1]), s2 && r3.length > 5) {
        let e3, n3, o2, a, h, l2, d2, c, u2, _2, p2, f2, g2, y2, m2, x2 = r3.length;
        const w2 = true === s2 ? 0.5 : s2;
        i2 && (r3 = [r3[x2 - 2], r3[x2 - 1], ...r3, r3[0], r3[1], r3[2], r3[3]], x2 = r3.length);
        for (let s3 = 2; s3 < x2 - 2; s3 += 2) e3 = r3[s3 - 2], n3 = r3[s3 - 1], o2 = r3[s3], a = r3[s3 + 1], h = r3[s3 + 2], l2 = r3[s3 + 3], p2 = o2 - e3, f2 = a - n3, g2 = Ze($e(p2, 2) + $e(f2, 2)), y2 = Ze($e(h - o2, 2) + $e(l2 - a, 2)), (g2 || y2) && (m2 = g2 + y2, g2 = w2 * g2 / m2, y2 = w2 * y2 / m2, h -= e3, l2 -= n3, d2 = o2 - g2 * h, c = a - g2 * l2, 2 === s3 ? i2 || t2.push(os, d2, c, o2, a) : (p2 || f2) && t2.push(ns, u2, _2, d2, c, o2, a), u2 = o2 + y2 * h, _2 = a + y2 * l2);
        i2 || t2.push(os, u2, _2, r3[x2 - 2], r3[x2 - 1]);
      } else for (let e3 = 2, s3 = r3.length; e3 < s3; e3 += 2) t2.push(rs, r3[e3], r3[e3 + 1]);
      i2 && t2.push(as);
    }, rect(t2, e2, s2, i2, r3) {
      Me.creator.path = t2, Me.creator.moveTo(e2, s2).lineTo(e2 + i2, s2).lineTo(e2 + i2, s2 + r3).lineTo(e2, s2 + r3).lineTo(e2, s2);
    }, roundRect(t2, e2, s2, i2, r3, n3) {
      Me.creator.path = [], Ue.drawRoundRect(Me.creator, e2, s2, i2, r3, n3), t2.push(...Me.convertToCanvasData(Me.creator.path, true));
    }, arcTo(t2, e2, s2, i2, r3, n3, o2, a, h, l2, d2) {
      const c = i2 - e2, u2 = r3 - s2, _2 = n3 - i2, p2 = o2 - r3;
      let f2 = He(u2, c), g2 = He(p2, _2);
      const y2 = qe(c, u2), m2 = qe(_2, p2);
      let x2 = g2 - f2;
      if (x2 < 0 && (x2 += N), y2 < 1e-12 || m2 < 1e-12 || x2 < 1e-12 || Qe(x2 - Je) < 1e-12) return t2 && t2.push(rs, i2, r3), h && (Ke(h, e2, s2), ts(h, i2, r3)), d2 && es(d2, e2, s2), void (l2 && es(l2, i2, r3));
      const w2 = c * p2 - _2 * u2 < 0, b2 = w2 ? -1 : 1, v2 = a / Ve(x2 / 2), B2 = i2 + v2 * Ve(f2 + x2 / 2 + D * b2), C2 = r3 + v2 * je(f2 + x2 / 2 + D * b2);
      return f2 -= D * b2, g2 -= D * b2, us(t2, B2, C2, a, a, 0, f2 / W, g2 / W, w2, h, l2, d2);
    }, arc: (t2, e2, s2, i2, r3, n3, o2, a, h, l2) => us(t2, e2, s2, i2, i2, 0, r3, n3, o2, a, h, l2), ellipse(t2, e2, s2, i2, r3, n3, o2, a, h, l2, d2, c) {
      const u2 = n3 * W, _2 = je(u2), p2 = Ve(u2);
      let f2 = o2 * W, g2 = a * W;
      f2 > Je && (f2 -= N), g2 < 0 && (g2 += N);
      let y2 = g2 - f2;
      if (y2 < 0 ? y2 += N : y2 > N && (y2 -= N), h) {
        360 === Qe(a - o2) ? y2 = -N : y2 -= N;
      }
      const m2 = Ge(Qe(y2 / D)), x2 = y2 / m2, w2 = je(x2 / 4), b2 = 8 / 3 * w2 * w2 / je(x2 / 2);
      g2 = f2 + x2;
      let v2, B2, C2, k2, O2, T2, P2, S2, L2 = Ve(f2), R2 = je(f2), I3 = C2 = p2 * i2 * L2 - _2 * r3 * R2, E2 = k2 = _2 * i2 * L2 + p2 * r3 * R2, M2 = e2 + C2, A2 = s2 + k2;
      t2 && t2.push(t2.length ? rs : is, M2, A2), l2 && Ke(l2, M2, A2), c && es(c, M2, A2);
      for (let n4 = 0; n4 < m2; n4++) v2 = Ve(g2), B2 = je(g2), C2 = p2 * i2 * v2 - _2 * r3 * B2, k2 = _2 * i2 * v2 + p2 * r3 * B2, O2 = e2 + I3 - b2 * (p2 * i2 * R2 + _2 * r3 * L2), T2 = s2 + E2 - b2 * (_2 * i2 * R2 - p2 * r3 * L2), P2 = e2 + C2 + b2 * (p2 * i2 * B2 + _2 * r3 * v2), S2 = s2 + k2 + b2 * (_2 * i2 * B2 - p2 * r3 * v2), t2 && t2.push(ns, O2, T2, P2, S2, e2 + C2, s2 + k2), l2 && cs(e2 + I3, s2 + E2, O2, T2, P2, S2, e2 + C2, s2 + k2, l2, true), I3 = C2, E2 = k2, L2 = v2, R2 = B2, f2 = g2, g2 += x2;
      d2 && es(d2, e2 + C2, s2 + k2);
    }, quadraticCurveTo(t2, e2, s2, i2, r3, n3, o2) {
      t2.push(ns, (e2 + 2 * i2) / 3, (s2 + 2 * r3) / 3, (n3 + 2 * i2) / 3, (o2 + 2 * r3) / 3, n3, o2);
    }, toTwoPointBoundsByQuadraticCurve(t2, e2, s2, i2, r3, n3, o2, a) {
      cs(t2, e2, (t2 + 2 * s2) / 3, (e2 + 2 * i2) / 3, (r3 + 2 * s2) / 3, (n3 + 2 * i2) / 3, r3, n3, o2, a);
    }, toTwoPointBounds(t2, e2, s2, i2, r3, n3, o2, a, h, l2) {
      const d2 = [];
      let c, u2, _2, p2, f2, g2, y2, m2, x2 = t2, w2 = s2, b2 = r3, v2 = o2;
      for (let t3 = 0; t3 < 2; ++t3) if (1 == t3 && (x2 = e2, w2 = i2, b2 = n3, v2 = a), c = -3 * x2 + 9 * w2 - 9 * b2 + 3 * v2, u2 = 6 * x2 - 12 * w2 + 6 * b2, _2 = 3 * w2 - 3 * x2, Math.abs(c) < 1e-12) {
        if (Math.abs(u2) < 1e-12) continue;
        p2 = -_2 / u2, 0 < p2 && p2 < 1 && d2.push(p2);
      } else y2 = u2 * u2 - 4 * _2 * c, m2 = Math.sqrt(y2), y2 < 0 || (f2 = (-u2 + m2) / (2 * c), 0 < f2 && f2 < 1 && d2.push(f2), g2 = (-u2 - m2) / (2 * c), 0 < g2 && g2 < 1 && d2.push(g2));
      l2 ? ts(h, t2, e2) : Ke(h, t2, e2), ts(h, o2, a);
      for (let l3 = 0, c2 = d2.length; l3 < c2; l3++) ds(d2[l3], t2, e2, s2, i2, r3, n3, o2, a, hs), ts(h, hs.x, hs.y);
    }, getPointAndSet(t2, e2, s2, i2, r3, n3, o2, a, h, l2) {
      const d2 = 1 - t2, c = d2 * d2 * d2, u2 = 3 * d2 * d2 * t2, _2 = 3 * d2 * t2 * t2, p2 = t2 * t2 * t2;
      l2.x = c * e2 + u2 * i2 + _2 * n3 + p2 * a, l2.y = c * s2 + u2 * r3 + _2 * o2 + p2 * h;
    }, getPoint(t2, e2, s2, i2, r3, n3, o2, a, h) {
      const l2 = {};
      return ds(t2, e2, s2, i2, r3, n3, o2, a, h, l2), l2;
    }, getDerivative(t2, e2, s2, i2, r3) {
      const n3 = 1 - t2;
      return 3 * n3 * n3 * (s2 - e2) + 6 * n3 * t2 * (i2 - s2) + 3 * t2 * t2 * (r3 - i2);
    }, cut(t2, e2, s2, i2, r3, n3, o2, a, h) {
      if (t2 <= 0) return { left: null, right: [i2, r3, n3, o2, a, h] };
      if (t2 >= 1) return { left: [i2, r3, n3, o2, a, h], right: null };
      const l2 = 1 - t2, d2 = e2 * l2 + i2 * t2, c = s2 * l2 + r3 * t2, u2 = i2 * l2 + n3 * t2, _2 = r3 * l2 + o2 * t2, p2 = n3 * l2 + a * t2, f2 = o2 * l2 + h * t2, g2 = d2 * l2 + u2 * t2, y2 = c * l2 + _2 * t2, m2 = u2 * l2 + p2 * t2, x2 = _2 * l2 + f2 * t2;
      return { left: [d2, c, g2, y2, g2 * l2 + m2 * t2, y2 * l2 + x2 * t2], right: [m2, x2, p2, f2, a, h] };
    } };
    ({ getPointAndSet: ds, toTwoPointBounds: cs, ellipse: us } = ls);
    ({ sin: _s, cos: ps, sqrt: fs2, atan2: gs } = Math);
    ({ ellipse: ys } = ls);
    ms = { ellipticalArc(t2, e2, s2, i2, r3, n3, o2, a, h, l2, d2) {
      const c = (h - e2) / 2, u2 = (l2 - s2) / 2, _2 = n3 * W, p2 = _s(_2), f2 = ps(_2), g2 = -f2 * c - p2 * u2, y2 = -f2 * u2 + p2 * c, m2 = i2 * i2, x2 = r3 * r3, w2 = y2 * y2, b2 = g2 * g2, v2 = m2 * x2 - m2 * w2 - x2 * b2;
      let B2 = 0;
      if (v2 < 0) {
        const t3 = fs2(1 - v2 / (m2 * x2));
        i2 *= t3, r3 *= t3;
      } else B2 = (o2 === a ? -1 : 1) * fs2(v2 / (m2 * w2 + x2 * b2));
      const C2 = B2 * i2 * y2 / r3, k2 = -B2 * r3 * g2 / i2, O2 = gs((y2 - k2) / r3, (g2 - C2) / i2), T2 = gs((-y2 - k2) / r3, (-g2 - C2) / i2);
      let P2 = T2 - O2;
      0 === a && P2 > 0 ? P2 -= N : 1 === a && P2 < 0 && (P2 += N);
      const S2 = e2 + c + f2 * C2 - p2 * k2, L2 = s2 + u2 + p2 * C2 + f2 * k2, R2 = P2 < 0 ? 1 : 0;
      d2 || Kt.ellipseToCurve ? ys(t2, S2, L2, i2, r3, n3, O2 / W, T2 / W, R2) : i2 !== r3 || n3 ? t2.push(We.G, S2, L2, i2, r3, n3, O2 / W, T2 / W, R2) : t2.push(We.O, S2, L2, i2, O2 / W, T2 / W, R2);
    } };
    xs = { toCommand: (t2) => [], toNode: (t2, e2) => [] };
    ({ M: ws, m: bs, L: vs, l: Bs, H: Cs, h: ks, V: Os, v: Ts, C: Ps, c: Ss, S: Ls, s: Rs, Q: Is, q: Es, T: Ms, t: As, A: Ws, a: Ns, Z: Ds, z: Ys, N: Xs, D: zs, X: Fs, G: Us, F: js, O: Vs, P: qs, U: Hs } = We);
    ({ rect: Gs, roundRect: Qs, arcTo: Js, arc: Zs, ellipse: $s, quadraticCurveTo: Ks } = ls);
    ({ ellipticalArc: ti } = ms);
    ei = se.get("PathConvert");
    si = {};
    ii = { current: { dot: 0 }, stringify(t2, e2) {
      let s2, i2, r3, n3 = 0, o2 = t2.length, a = "";
      for (; n3 < o2; ) {
        i2 = t2[n3], s2 = Fe[i2], a += i2 === r3 ? " " : ze[i2];
        for (let i3 = 1; i3 < s2; i3++) a += M.float(t2[n3 + i3], e2), i3 === s2 - 1 || (a += " ");
        r3 = i2, n3 += s2;
      }
      return a;
    }, parse(t2, e2) {
      let s2, i2, r3, n3 = "";
      const o2 = [], a = e2 ? Ye : De;
      for (let e3 = 0, h = t2.length; e3 < h; e3++) i2 = t2[e3], Jt[i2] ? ("." === i2 && (ri.dot && (ni(o2, n3), n3 = ""), ri.dot++), "0" === n3 && "." !== i2 && (ni(o2, n3), n3 = ""), n3 += i2) : We[i2] ? (n3 && (ni(o2, n3), n3 = ""), ri.name = We[i2], ri.length = Ne[i2], ri.index = 0, ni(o2, ri.name), "m" === i2 ? ri.name = We.l : "M" === i2 && (ri.name = We.L), !s2 && a[i2] && (s2 = true)) : "-" === i2 || "+" === i2 ? "e" === r3 || "E" === r3 ? n3 += i2 : (n3 && ni(o2, n3), n3 = i2) : n3 && (ni(o2, n3), n3 = ""), r3 = i2;
      return n3 && ni(o2, n3), s2 ? ii.toCanvasData(o2, e2) : o2;
    }, toCanvasData(t2, e2) {
      let s2, i2, r3, n3, o2, a = 0, h = 0, l2 = 0, d2 = 0, c = 0, u2 = 0, _2 = 0, p2 = t2.length;
      const f2 = [];
      for (; _2 < p2; ) {
        switch (r3 = t2[_2], r3) {
          case bs:
            t2[_2 + 1] += a, t2[_2 + 2] += h;
          case ws:
            a = c = t2[_2 + 1], h = u2 = t2[_2 + 2], f2.push(ws, a, h), _2 += 3;
            break;
          case ks:
            t2[_2 + 1] += a;
          case Cs:
            a = t2[_2 + 1], f2.push(vs, a, h), _2 += 2;
            break;
          case Ts:
            t2[_2 + 1] += h;
          case Os:
            h = t2[_2 + 1], f2.push(vs, a, h), _2 += 2;
            break;
          case Bs:
            t2[_2 + 1] += a, t2[_2 + 2] += h;
          case vs:
            a = t2[_2 + 1], h = t2[_2 + 2], f2.push(vs, a, h), _2 += 3;
            break;
          case Rs:
            t2[_2 + 1] += a, t2[_2 + 2] += h, t2[_2 + 3] += a, t2[_2 + 4] += h, r3 = Ls;
          case Ls:
            o2 = n3 === Ps || n3 === Ls, l2 = o2 ? 2 * a - s2 : a, d2 = o2 ? 2 * h - i2 : h, s2 = t2[_2 + 1], i2 = t2[_2 + 2], a = t2[_2 + 3], h = t2[_2 + 4], f2.push(Ps, l2, d2, s2, i2, a, h), _2 += 5;
            break;
          case Ss:
            t2[_2 + 1] += a, t2[_2 + 2] += h, t2[_2 + 3] += a, t2[_2 + 4] += h, t2[_2 + 5] += a, t2[_2 + 6] += h, r3 = Ps;
          case Ps:
            s2 = t2[_2 + 3], i2 = t2[_2 + 4], a = t2[_2 + 5], h = t2[_2 + 6], f2.push(Ps, t2[_2 + 1], t2[_2 + 2], s2, i2, a, h), _2 += 7;
            break;
          case As:
            t2[_2 + 1] += a, t2[_2 + 2] += h, r3 = Ms;
          case Ms:
            o2 = n3 === Is || n3 === Ms, s2 = o2 ? 2 * a - s2 : a, i2 = o2 ? 2 * h - i2 : h, e2 ? Ks(f2, a, h, s2, i2, t2[_2 + 1], t2[_2 + 2]) : f2.push(Is, s2, i2, t2[_2 + 1], t2[_2 + 2]), a = t2[_2 + 1], h = t2[_2 + 2], _2 += 3;
            break;
          case Es:
            t2[_2 + 1] += a, t2[_2 + 2] += h, t2[_2 + 3] += a, t2[_2 + 4] += h, r3 = Is;
          case Is:
            s2 = t2[_2 + 1], i2 = t2[_2 + 2], e2 ? Ks(f2, a, h, s2, i2, t2[_2 + 3], t2[_2 + 4]) : f2.push(Is, s2, i2, t2[_2 + 3], t2[_2 + 4]), a = t2[_2 + 3], h = t2[_2 + 4], _2 += 5;
            break;
          case Ns:
            t2[_2 + 6] += a, t2[_2 + 7] += h;
          case Ws:
            ti(f2, a, h, t2[_2 + 1], t2[_2 + 2], t2[_2 + 3], t2[_2 + 4], t2[_2 + 5], t2[_2 + 6], t2[_2 + 7], e2), a = t2[_2 + 6], h = t2[_2 + 7], _2 += 8;
            break;
          case Ys:
          case Ds:
            f2.push(Ds), a = c, h = u2, _2++;
            break;
          case Xs:
            a = t2[_2 + 1], h = t2[_2 + 2], e2 ? Gs(f2, a, h, t2[_2 + 3], t2[_2 + 4]) : oi(f2, t2, _2, 5), _2 += 5;
            break;
          case zs:
            a = t2[_2 + 1], h = t2[_2 + 2], e2 ? Qs(f2, a, h, t2[_2 + 3], t2[_2 + 4], [t2[_2 + 5], t2[_2 + 6], t2[_2 + 7], t2[_2 + 8]]) : oi(f2, t2, _2, 9), _2 += 9;
            break;
          case Fs:
            a = t2[_2 + 1], h = t2[_2 + 2], e2 ? Qs(f2, a, h, t2[_2 + 3], t2[_2 + 4], t2[_2 + 5]) : oi(f2, t2, _2, 6), _2 += 6;
            break;
          case Us:
            $s(e2 ? f2 : oi(f2, t2, _2, 9), t2[_2 + 1], t2[_2 + 2], t2[_2 + 3], t2[_2 + 4], t2[_2 + 5], t2[_2 + 6], t2[_2 + 7], t2[_2 + 8], null, si), a = si.x, h = si.y, _2 += 9;
            break;
          case js:
            e2 ? $s(f2, t2[_2 + 1], t2[_2 + 2], t2[_2 + 3], t2[_2 + 4], 0, 0, 360, false) : oi(f2, t2, _2, 5), a = t2[_2 + 1] + t2[_2 + 3], h = t2[_2 + 2], _2 += 5;
            break;
          case Vs:
            Zs(e2 ? f2 : oi(f2, t2, _2, 7), t2[_2 + 1], t2[_2 + 2], t2[_2 + 3], t2[_2 + 4], t2[_2 + 5], t2[_2 + 6], null, si), a = si.x, h = si.y, _2 += 7;
            break;
          case qs:
            e2 ? Zs(f2, t2[_2 + 1], t2[_2 + 2], t2[_2 + 3], 0, 360, false) : oi(f2, t2, _2, 4), a = t2[_2 + 1] + t2[_2 + 3], h = t2[_2 + 2], _2 += 4;
            break;
          case Hs:
            Js(e2 ? f2 : oi(f2, t2, _2, 6), a, h, t2[_2 + 1], t2[_2 + 2], t2[_2 + 3], t2[_2 + 4], t2[_2 + 5], null, si), a = si.x, h = si.y, _2 += 6;
            break;
          default:
            return ei.error(`command: ${r3} [index:${_2}]`, t2), f2;
        }
        n3 = r3;
      }
      return f2;
    }, objectToCanvasData(t2) {
      if (t2[0].name.length > 1) return xs.toCommand(t2);
      {
        const e2 = [];
        return t2.forEach((t3) => {
          switch (t3.name) {
            case "M":
              e2.push(ws, t3.x, t3.y);
              break;
            case "L":
              e2.push(vs, t3.x, t3.y);
              break;
            case "C":
              e2.push(Ps, t3.x1, t3.y1, t3.x2, t3.y2, t3.x, t3.y);
              break;
            case "Q":
              e2.push(Is, t3.x1, t3.y1, t3.x, t3.y);
              break;
            case "Z":
              e2.push(Ds);
          }
        }), e2;
      }
    }, copyData(t2, e2, s2, i2) {
      for (let r3 = s2, n3 = s2 + i2; r3 < n3; r3++) t2.push(e2[r3]);
    }, pushData(t2, e2) {
      ri.index === ri.length && (ri.index = 1, t2.push(ri.name)), t2.push(Number(e2)), ri.index++, ri.dot = 0;
    } };
    ({ current: ri, pushData: ni, copyData: oi } = ii);
    ({ M: ai, L: hi, C: li, Q: di, Z: ci, N: ui, D: _i, X: pi, G: fi, F: gi, O: yi, P: mi, U: xi } = We);
    ({ getMinDistanceFrom: wi, getRadianFrom: bi } = at);
    ({ tan: vi, min: Bi, abs: Ci } = Math);
    ki = {};
    Oi = se.get("PointsCurve");
    Ti = { pointsCurveList: {}, beginPath(t2) {
      t2.length = 0;
    }, moveTo(t2, e2, s2) {
      t2.push(ai, e2, s2);
    }, lineTo(t2, e2, s2) {
      t2.push(hi, e2, s2);
    }, bezierCurveTo(t2, e2, s2, i2, r3, n3, o2) {
      t2.push(li, e2, s2, i2, r3, n3, o2);
    }, quadraticCurveTo(t2, e2, s2, i2, r3) {
      t2.push(di, e2, s2, i2, r3);
    }, closePath(t2) {
      t2.push(ci);
    }, rect(t2, e2, s2, i2, r3) {
      t2.push(ui, e2, s2, i2, r3);
    }, roundRect(t2, e2, s2, i2, r3, n3) {
      if (o(n3)) t2.push(pi, e2, s2, i2, r3, n3);
      else {
        const o2 = M.fourNumber(n3);
        o2 ? t2.push(_i, e2, s2, i2, r3, ...o2) : t2.push(ui, e2, s2, i2, r3);
      }
    }, ellipse(t2, e2, s2, r3, n3, o2, a, h, l2) {
      if (r3 === n3) return Si(t2, e2, s2, r3, a, h, l2);
      i(o2) ? t2.push(gi, e2, s2, r3, n3) : (i(a) && (a = 0), i(h) && (h = 360), t2.push(fi, e2, s2, r3, n3, o2, a, h, l2 ? 1 : 0));
    }, arc(t2, e2, s2, r3, n3, o2, a) {
      i(n3) ? t2.push(mi, e2, s2, r3) : (i(n3) && (n3 = 0), i(o2) && (o2 = 360), t2.push(yi, e2, s2, r3, n3, o2, a ? 1 : 0));
    }, arcTo(t2, e2, i2, r3, n3, o2, a, h, l2) {
      if (!s(a)) {
        const t3 = wi(a, h, e2, i2, r3, n3) / (l2 ? 1 : 2);
        o2 = Bi(o2, Bi(t3, t3 * Ci(vi(bi(a, h, e2, i2, r3, n3) / 2))));
      }
      t2.push(xi, e2, i2, r3, n3, o2);
    }, drawEllipse(t2, e2, s2, r3, n3, o2, a, h, l2) {
      ls.ellipse(null, e2, s2, r3, n3, i(o2) ? 0 : o2, i(a) ? 0 : a, i(h) ? 360 : h, l2, null, null, ki), t2.push(ai, ki.x, ki.y), Pi(t2, e2, s2, r3, n3, o2, a, h, l2);
    }, drawArc(t2, e2, s2, r3, n3, o2, a) {
      ls.arc(null, e2, s2, r3, i(n3) ? 0 : n3, i(o2) ? 360 : o2, a, null, null, ki), t2.push(ai, ki.x, ki.y), Si(t2, e2, s2, r3, n3, o2, a);
    }, drawPoints(t2, e2, s2, i2, r3) {
      let n3 = "Q";
      d(s2) && (n3 = s2.type, s2 = s2.value), Li[n3] || (Oi.warn("not found:", n3), n3 = "Q"), Li[n3](t2, e2, s2, i2, r3);
    } };
    ({ ellipse: Pi, arc: Si, pointsCurveList: Li } = Ti);
    Ri("Q", ls.points);
    ({ moveTo: Ii, lineTo: Ei, quadraticCurveTo: Mi, bezierCurveTo: Ai, closePath: Wi, beginPath: Ni, rect: Di, roundRect: Yi, ellipse: Xi, arc: zi, arcTo: Fi, drawEllipse: Ui, drawArc: ji, drawPoints: Vi } = Ti);
    qi = class {
      set path(t2) {
        this.__path = t2;
      }
      get path() {
        return this.__path;
      }
      constructor(t2) {
        this.set(t2);
      }
      set(t2) {
        return this.__path = t2 ? r(t2) ? Me.parse(t2) : t2 : [], this;
      }
      beginPath() {
        return Ni(this.__path), this.paint(), this;
      }
      moveTo(t2, e2) {
        return Ii(this.__path, t2, e2), this.paint(), this;
      }
      lineTo(t2, e2) {
        return Ei(this.__path, t2, e2), this.paint(), this;
      }
      bezierCurveTo(t2, e2, s2, i2, r3, n3) {
        return Ai(this.__path, t2, e2, s2, i2, r3, n3), this.paint(), this;
      }
      quadraticCurveTo(t2, e2, s2, i2) {
        return Mi(this.__path, t2, e2, s2, i2), this.paint(), this;
      }
      closePath() {
        return Wi(this.__path), this.paint(), this;
      }
      rect(t2, e2, s2, i2) {
        return Di(this.__path, t2, e2, s2, i2), this.paint(), this;
      }
      roundRect(t2, e2, s2, i2, r3) {
        return Yi(this.__path, t2, e2, s2, i2, r3), this.paint(), this;
      }
      ellipse(t2, e2, s2, i2, r3, n3, o2, a) {
        return Xi(this.__path, t2, e2, s2, i2, r3, n3, o2, a), this.paint(), this;
      }
      arc(t2, e2, s2, i2, r3, n3) {
        return zi(this.__path, t2, e2, s2, i2, r3, n3), this.paint(), this;
      }
      arcTo(t2, e2, s2, i2, r3) {
        return Fi(this.__path, t2, e2, s2, i2, r3), this.paint(), this;
      }
      drawEllipse(t2, e2, s2, i2, r3, n3, o2, a) {
        return Ui(this.__path, t2, e2, s2, i2, r3, n3, o2, a), this.paint(), this;
      }
      drawArc(t2, e2, s2, i2, r3, n3) {
        return ji(this.__path, t2, e2, s2, i2, r3, n3), this.paint(), this;
      }
      drawPoints(t2, e2, s2) {
        return Vi(this.__path, t2, e2, s2), this.paint(), this;
      }
      clearPath() {
        return this.beginPath();
      }
      paint() {
      }
    };
    ({ M: Hi, L: Gi, C: Qi, Q: Ji, Z: Zi, N: $i, D: Ki, X: tr, G: er, F: sr, O: ir, P: rr, U: nr } = We);
    or = se.get("PathDrawer");
    ar = { drawPathByData(t2, e2) {
      if (!e2) return;
      let s2, i2 = 0, r3 = e2.length;
      for (; i2 < r3; ) switch (s2 = e2[i2], s2) {
        case Hi:
          t2.moveTo(e2[i2 + 1], e2[i2 + 2]), i2 += 3;
          break;
        case Gi:
          t2.lineTo(e2[i2 + 1], e2[i2 + 2]), i2 += 3;
          break;
        case Qi:
          t2.bezierCurveTo(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], e2[i2 + 4], e2[i2 + 5], e2[i2 + 6]), i2 += 7;
          break;
        case Ji:
          t2.quadraticCurveTo(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], e2[i2 + 4]), i2 += 5;
          break;
        case Zi:
          t2.closePath(), i2 += 1;
          break;
        case $i:
          t2.rect(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], e2[i2 + 4]), i2 += 5;
          break;
        case Ki:
          t2.roundRect(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], e2[i2 + 4], [e2[i2 + 5], e2[i2 + 6], e2[i2 + 7], e2[i2 + 8]]), i2 += 9;
          break;
        case tr:
          t2.roundRect(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], e2[i2 + 4], e2[i2 + 5]), i2 += 6;
          break;
        case er:
          t2.ellipse(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], e2[i2 + 4], e2[i2 + 5] * W, e2[i2 + 6] * W, e2[i2 + 7] * W, e2[i2 + 8]), i2 += 9;
          break;
        case sr:
          t2.ellipse(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], e2[i2 + 4], 0, 0, N, false), i2 += 5;
          break;
        case ir:
          t2.arc(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], e2[i2 + 4] * W, e2[i2 + 5] * W, e2[i2 + 6]), i2 += 7;
          break;
        case rr:
          t2.arc(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], 0, N, false), i2 += 4;
          break;
        case nr:
          t2.arcTo(e2[i2 + 1], e2[i2 + 2], e2[i2 + 3], e2[i2 + 4], e2[i2 + 5]), i2 += 6;
          break;
        default:
          return void or.error(`command: ${s2} [index:${i2}]`, e2);
      }
    }, drawPathByPoints(t2, e2, s2) {
    } };
    ({ M: hr, L: lr, C: dr, Q: cr, Z: ur, N: _r, D: pr, X: fr, G: gr, F: yr, O: mr, P: xr, U: wr } = We);
    ({ toTwoPointBounds: br, toTwoPointBoundsByQuadraticCurve: vr, arcTo: Br, arc: Cr, ellipse: kr } = ls);
    ({ addPointBounds: Or, copy: Tr, addPoint: Pr, setPoint: Sr, addBounds: Lr, toBounds: Rr } = yt);
    Ir = se.get("PathBounds");
    Wr = {};
    Nr = {};
    Dr = {};
    Yr = { toBounds(t2, e2) {
      Yr.toTwoPointBounds(t2, Nr), Rr(Nr, e2);
    }, toTwoPointBounds(t2, e2) {
      if (!t2 || !t2.length) return Sr(e2, 0, 0);
      let s2, i2, r3, n3, o2, a = 0, h = 0, l2 = 0;
      const d2 = t2.length;
      for (; a < d2; ) switch (o2 = t2[a], 0 === a && (o2 === ur || o2 === dr || o2 === cr ? Sr(e2, h, l2) : Sr(e2, t2[a + 1], t2[a + 2])), o2) {
        case hr:
        case lr:
          h = t2[a + 1], l2 = t2[a + 2], Pr(e2, h, l2), a += 3;
          break;
        case dr:
          r3 = t2[a + 5], n3 = t2[a + 6], br(h, l2, t2[a + 1], t2[a + 2], t2[a + 3], t2[a + 4], r3, n3, Wr), Or(e2, Wr), h = r3, l2 = n3, a += 7;
          break;
        case cr:
          s2 = t2[a + 1], i2 = t2[a + 2], r3 = t2[a + 3], n3 = t2[a + 4], vr(h, l2, s2, i2, r3, n3, Wr), Or(e2, Wr), h = r3, l2 = n3, a += 5;
          break;
        case ur:
          a += 1;
          break;
        case _r:
          h = t2[a + 1], l2 = t2[a + 2], Lr(e2, h, l2, t2[a + 3], t2[a + 4]), a += 5;
          break;
        case pr:
        case fr:
          h = t2[a + 1], l2 = t2[a + 2], Lr(e2, h, l2, t2[a + 3], t2[a + 4]), a += o2 === pr ? 9 : 6;
          break;
        case gr:
          kr(null, t2[a + 1], t2[a + 2], t2[a + 3], t2[a + 4], t2[a + 5], t2[a + 6], t2[a + 7], t2[a + 8], Wr, Dr), 0 === a ? Tr(e2, Wr) : Or(e2, Wr), h = Dr.x, l2 = Dr.y, a += 9;
          break;
        case yr:
          h = t2[a + 1], l2 = t2[a + 2], Mr = t2[a + 3], Ar = t2[a + 4], Lr(e2, h - Mr, l2 - Ar, 2 * Mr, 2 * Ar), h += Mr, a += 5;
          break;
        case mr:
          Cr(null, t2[a + 1], t2[a + 2], t2[a + 3], t2[a + 4], t2[a + 5], t2[a + 6], Wr, Dr), 0 === a ? Tr(e2, Wr) : Or(e2, Wr), h = Dr.x, l2 = Dr.y, a += 7;
          break;
        case xr:
          h = t2[a + 1], l2 = t2[a + 2], Er = t2[a + 3], Lr(e2, h - Er, l2 - Er, 2 * Er, 2 * Er), h += Er, a += 4;
          break;
        case wr:
          Br(null, h, l2, t2[a + 1], t2[a + 2], t2[a + 3], t2[a + 4], t2[a + 5], Wr, Dr), 0 === a ? Tr(e2, Wr) : Or(e2, Wr), h = Dr.x, l2 = Dr.y, a += 6;
          break;
        default:
          return void Ir.error(`command: ${o2} [index:${a}]`, t2);
      }
    } };
    ({ M: Xr, L: zr, Z: Fr } = We);
    ({ getCenterX: Ur, getCenterY: jr } = at);
    ({ arcTo: Vr } = Ti);
    ({ float: qr } = M);
    Hr = { smooth(t2, e2, s2) {
      let i2, r3, n3, o2, a, h, d2 = 0, c = 0, u2 = 0, _2 = 0, p2 = 0, f2 = 0, g2 = 0, y2 = 0, m2 = 0;
      l(e2) && (e2 = e2[0] || 0);
      const x2 = t2.length, w2 = 9 === x2, b2 = [];
      for (; d2 < x2; ) {
        switch (i2 = t2[d2], i2) {
          case Xr:
            h = b2.length, h && r3 !== Fr && (b2[o2] = _2, b2[a] = p2), _2 = y2 = t2[d2 + 1], p2 = m2 = t2[d2 + 2], d2 += 3, t2[d2] === zr ? (f2 = t2[d2 + 1], g2 = t2[d2 + 2], w2 ? b2.push(Xr, _2, p2) : b2.push(Xr, Ur(_2, f2), jr(p2, g2))) : b2.push(Xr, _2, p2), o2 = h + 1, a = h + 2;
            break;
          case zr:
            switch (c = t2[d2 + 1], u2 = t2[d2 + 2], d2 += 3, t2[d2]) {
              case zr:
                Vr(b2, c, u2, t2[d2 + 1], t2[d2 + 2], e2, y2, m2, w2);
                break;
              case Fr:
                qr(c) === qr(_2) && qr(u2) === qr(p2) ? (c = y2, u2 = m2) : Vr(b2, c, u2, _2, p2, e2, y2, m2, w2);
                break;
              default:
                b2.push(zr, c, u2);
            }
            y2 = c, m2 = u2;
            break;
          case Fr:
            r3 !== Fr && (Vr(b2, _2, p2, f2, g2, e2, y2, m2, w2), b2.push(Fr)), d2 += 1;
            break;
          default:
            n3 = Fe[i2];
            for (let e3 = 0; e3 < n3; e3++) b2.push(t2[d2 + e3]);
            d2 += n3;
        }
        r3 = i2;
      }
      return i2 !== Fr && (b2[o2] = _2, b2[a] = p2), b2;
    } };
    Qr = Gr();
    Me.creator = Gr(), Me.parse = ii.parse, Me.convertToCanvasData = ii.toCanvasData;
    ({ drawRoundRect: Jr } = Ue);
    $r = { alphaPixelTypes: ["png", "webp", "svg"], upperCaseTypeMap: {}, mimeType: (t2, e2 = "image") => !t2 || t2.startsWith(e2) ? t2 : ("jpg" === t2 && (t2 = "jpeg"), e2 + "/" + t2), fileType(t2) {
      const e2 = t2.split(".");
      return e2[e2.length - 1];
    }, isOpaqueImage(t2) {
      const e2 = Kr.fileType(t2);
      return ["jpg", "jpeg"].some((t3) => t3 === e2);
    }, getExportOptions(t2) {
      switch (typeof t2) {
        case "object":
          return t2;
        case "number":
          return { quality: t2 };
        case "boolean":
          return { blob: t2 };
        default:
          return {};
      }
    } };
    Kr = $r;
    Kr.mineType = Kr.mimeType, Kr.alphaPixelTypes.forEach((t2) => Kr.upperCaseTypeMap[t2] = t2.toUpperCase());
    tn = se.get("TaskProcessor");
    en = class {
      constructor(t2) {
        this.parallel = true, this.time = 1, this.id = g.create(g.TASK), this.task = t2;
      }
      run() {
        return xe(this, void 0, void 0, function* () {
          try {
            if (this.isComplete || this.runing) return;
            if (this.runing = true, this.canUse && !this.canUse()) return this.cancel();
            this.task && (yield this.task());
          } catch (t2) {
            tn.error(t2);
          }
        });
      }
      complete() {
        this.isComplete = true, this.parent = this.task = this.canUse = null;
      }
      cancel() {
        this.isCancel = true, this.complete();
      }
    };
    sn = class {
      get total() {
        return this.list.length + this.delayNumber;
      }
      get finishedIndex() {
        return this.isComplete ? 0 : this.index + this.parallelSuccessNumber;
      }
      get remain() {
        return this.isComplete ? this.total : this.total - this.finishedIndex;
      }
      get percent() {
        const { total: t2 } = this;
        let e2 = 0, s2 = 0;
        for (let i2 = 0; i2 < t2; i2++) i2 <= this.finishedIndex ? (s2 += this.list[i2].time, i2 === this.finishedIndex && (e2 = s2)) : e2 += this.list[i2].time;
        return this.isComplete ? 1 : s2 / e2;
      }
      constructor(t2) {
        this.config = { parallel: 6 }, this.list = [], this.running = false, this.isComplete = true, this.index = 0, this.delayNumber = 0, t2 && _.assign(this.config, t2), this.empty();
      }
      add(t2, e2, i2) {
        let r3, n3, a, h;
        const l2 = new en(t2);
        return l2.parent = this, o(e2) ? h = e2 : e2 && (n3 = e2.parallel, r3 = e2.start, a = e2.time, h = e2.delay, i2 || (i2 = e2.canUse)), a && (l2.time = a), false === n3 && (l2.parallel = false), i2 && (l2.canUse = i2), s(h) ? this.push(l2, r3) : (this.delayNumber++, setTimeout(() => {
          this.delayNumber && (this.delayNumber--, this.push(l2, r3));
        }, h)), this.isComplete = false, l2;
      }
      push(t2, e2) {
        this.list.push(t2), false === e2 || this.timer || (this.timer = setTimeout(() => this.start()));
      }
      empty() {
        this.index = 0, this.parallelSuccessNumber = 0, this.list = [], this.parallelList = [], this.delayNumber = 0;
      }
      start() {
        this.running || (this.running = true, this.isComplete = false, this.run());
      }
      pause() {
        clearTimeout(this.timer), this.timer = null, this.running = false;
      }
      resume() {
        this.start();
      }
      skip() {
        this.index++, this.resume();
      }
      stop() {
        this.isComplete = true, this.list.forEach((t2) => {
          t2.isComplete || t2.run();
        }), this.pause(), this.empty();
      }
      run() {
        this.running && (this.setParallelList(), this.parallelList.length > 1 ? this.runParallelTasks() : this.remain ? this.runTask() : this.onComplete());
      }
      runTask() {
        const t2 = this.list[this.index];
        t2 ? t2.run().then(() => {
          this.onTask(t2), this.index++, t2.isCancel ? this.runTask() : this.nextTask();
        }).catch((t3) => {
          this.onError(t3);
        }) : this.timer = setTimeout(() => this.nextTask());
      }
      runParallelTasks() {
        this.parallelList.forEach((t2) => this.runParallelTask(t2));
      }
      runParallelTask(t2) {
        t2.run().then(() => {
          this.onTask(t2), this.fillParallelTask();
        }).catch((t3) => {
          this.onParallelError(t3);
        });
      }
      nextTask() {
        this.total === this.finishedIndex ? this.onComplete() : this.timer = setTimeout(() => this.run());
      }
      setParallelList() {
        let t2;
        const { config: e2, list: s2, index: i2 } = this;
        this.parallelList = [], this.parallelSuccessNumber = 0;
        let r3 = i2 + e2.parallel;
        if (r3 > s2.length && (r3 = s2.length), e2.parallel > 1) for (let e3 = i2; e3 < r3 && (t2 = s2[e3], t2.parallel); e3++) this.parallelList.push(t2);
      }
      fillParallelTask() {
        let t2;
        const e2 = this.parallelList;
        this.parallelSuccessNumber++, e2.pop();
        const s2 = e2.length, i2 = this.finishedIndex + s2;
        if (e2.length) {
          if (!this.running) return;
          i2 < this.total && (t2 = this.list[i2], t2 && t2.parallel && (e2.push(t2), this.runParallelTask(t2)));
        } else this.index += this.parallelSuccessNumber, this.parallelSuccessNumber = 0, this.nextTask();
      }
      onComplete() {
        this.stop(), this.config.onComplete && this.config.onComplete();
      }
      onTask(t2) {
        t2.complete(), this.config.onTask && this.config.onTask();
      }
      onParallelError(t2) {
        this.parallelList.forEach((t3) => {
          t3.parallel = false;
        }), this.parallelList.length = 0, this.parallelSuccessNumber = 0, this.onError(t2);
      }
      onError(t2) {
        this.pause(), this.config.onError && this.config.onError(t2);
      }
      destroy() {
        this.stop();
      }
    };
    rn = se.get("Resource");
    nn = { tasker: new sn(), queue: new sn({ parallel: 1 }), map: {}, get isComplete() {
      return on.tasker.isComplete;
    }, set(t2, e2) {
      on.map[t2] && rn.repeat(t2), on.map[t2] = e2;
    }, get: (t2) => on.map[t2], remove(t2) {
      const e2 = on.map[t2];
      e2 && (e2.destroy && e2.destroy(), delete on.map[t2]);
    }, loadImage(t2, e2) {
      return new Promise((s2, i2) => {
        const r3 = this.setImage(t2, t2, e2);
        r3.load(() => s2(r3), (t3) => i2(t3));
      });
    }, setImage(t2, e2, s2) {
      let i2;
      return r(e2) ? i2 = { url: e2 } : e2.url || (i2 = { url: t2, view: e2 }), i2 && (s2 && (i2.format = s2), e2 = de.image(i2)), on.set(t2, e2), e2;
    }, loadFilm(t2, e2) {
    }, loadVideo(t2, e2) {
    }, destroy() {
      on.map = {};
    } };
    on = nn;
    an = { maxRecycled: 10, recycledList: [], patternTasker: nn.queue, get(t2, e2) {
      let s2 = nn.get(t2.url);
      return s2 || nn.set(t2.url, s2 = de[e2 || "image"](t2)), s2.use++, s2;
    }, recycle(t2) {
      t2.parent && (t2 = t2.parent), t2.use--, setTimeout(() => {
        t2.use || (Kt.image.isLarge(t2) ? t2.url && nn.remove(t2.url) : (t2.clearLevels(), hn.recycledList.push(t2)));
      });
    }, recyclePaint(t2) {
      hn.recycle(t2.image);
    }, clearRecycled(t2) {
      const e2 = hn.recycledList;
      (e2.length > hn.maxRecycled || t2) && (e2.forEach((e3) => (!e3.use || t2) && e3.url && nn.remove(e3.url)), e2.length = 0);
    }, clearLevels() {
    }, hasAlphaPixel: (t2) => $r.alphaPixelTypes.some((e2) => hn.isFormat(e2, t2)), isFormat(t2, e2) {
      if (e2.format) return e2.format === t2;
      const { url: s2 } = e2;
      if (s2.startsWith("data:")) {
        if (s2.startsWith("data:" + $r.mimeType(t2))) return true;
      } else {
        if (s2.includes("." + t2) || s2.includes("." + $r.upperCaseTypeMap[t2])) return true;
        if ("png" === t2 && !s2.includes(".")) return true;
      }
      return false;
    }, destroy() {
      this.clearRecycled(true);
    } };
    hn = an;
    ({ IMAGE: ln, create: dn } = g);
    cn = class {
      get tag() {
        return "Image";
      }
      get url() {
        return this.config.url;
      }
      get crossOrigin() {
        const { crossOrigin: t2 } = this.config;
        return s(t2) ? Kt.image.crossOrigin : t2;
      }
      get completed() {
        return this.ready || !!this.error;
      }
      constructor(t2) {
        if (this.use = 0, this.waitComplete = [], this.innerId = dn(ln), this.config = t2 || (t2 = { url: "" }), t2.view) {
          const { view: e2 } = t2;
          this.setView(e2.config ? e2.view : e2);
        }
        an.isFormat("svg", t2) && (this.isSVG = true), an.hasAlphaPixel(t2) && (this.hasAlphaPixel = true);
      }
      load(t2, e2, s2) {
        return this.loading || (this.loading = true, nn.tasker.add(() => xe(this, void 0, void 0, function* () {
          return yield Kt.origin["load" + this.tag](this.getLoadUrl(s2), this.crossOrigin, this).then((t3) => {
            s2 && this.setThumbView(t3), this.setView(t3);
          }).catch((t3) => {
            this.error = t3, this.onComplete(false);
          });
        }))), this.waitComplete.push(t2, e2), this.waitComplete.length - 2;
      }
      unload(t2, e2) {
        const s2 = this.waitComplete;
        if (e2) {
          const e3 = s2[t2 + 1];
          e3 && e3({ type: "stop" });
        }
        s2[t2] = s2[t2 + 1] = void 0;
      }
      setView(t2) {
        this.ready = true, this.width || (this.width = t2.width, this.height = t2.height, this.view = t2), this.onComplete(true);
      }
      onComplete(t2) {
        let e2;
        this.waitComplete.forEach((s2, i2) => {
          e2 = i2 % 2, s2 && (t2 ? e2 || s2(this) : e2 && s2(this.error));
        }), this.waitComplete.length = 0, this.loading = false;
      }
      getFull(t2) {
        return this.view;
      }
      getCanvas(t2, e2, s2, i2, r3, n3, o2, a) {
        if (t2 || (t2 = this.width), e2 || (e2 = this.height), this.cache) {
          let { params: t3, data: e3 } = this.cache;
          for (let s3 in t3) if (t3[s3] !== arguments[s3]) {
            e3 = null;
            break;
          }
          if (e3) return e3;
        }
        const h = Kt.image.resize(this.view, t2, e2, r3, n3, void 0, o2, s2, i2, a);
        return this.cache = this.use > 1 ? { data: h, params: arguments } : null, h;
      }
      getPattern(t2, e2, s2, i2) {
        const r3 = Kt.canvas.createPattern(t2, e2);
        return Kt.image.setPatternTransform(r3, s2, i2), r3;
      }
      render(t2, e2, s2, i2, r3, n3, o2, a, h) {
        t2.drawImage(this.view, e2, s2, i2, r3);
      }
      getLoadUrl(t2) {
        return this.url;
      }
      setThumbView(t2) {
      }
      getThumbSize(t2) {
      }
      getMinLevel() {
      }
      getLevelData(t2, e2, s2) {
      }
      clearLevels(t2) {
      }
      destroyFilter() {
      }
      destroy() {
        this.clearLevels(), this.destroyFilter();
        const { view: t2 } = this;
        t2 && t2.close && t2.close(), this.config = { url: "" }, this.cache = this.view = null, this.waitComplete.length = 0;
      }
    };
    Ln = On;
    En = Rn;
    Kn = new se("rewrite");
    to = [];
    eo = ["destroy", "constructor"];
    setTimeout(() => ro(true));
    ({ copy: ho, toInnerPoint: lo, toOuterPoint: co, scaleOfOuter: uo, rotateOfOuter: _o, skewOfOuter: po, multiplyParent: fo, divideParent: go, getLayout: yo } = Q);
    mo = {};
    ({ round: xo } = Math);
    wo = { updateAllMatrix(t2, e2, s2) {
      if (e2 && t2.__hasAutoLayout && t2.__layout.matrixChanged && (s2 = true), Co(t2, e2, s2), t2.isBranch) {
        const { children: i2 } = t2;
        for (let t3 = 0, r3 = i2.length; t3 < r3; t3++) Bo(i2[t3], e2, s2);
      }
    }, updateMatrix(t2, e2, s2) {
      const i2 = t2.__layout;
      e2 ? s2 && (i2.waitAutoLayout = true, t2.__hasAutoLayout && (i2.matrixChanged = false)) : i2.waitAutoLayout && (i2.waitAutoLayout = false), i2.matrixChanged && t2.__updateLocalMatrix(), i2.waitAutoLayout || t2.__updateWorldMatrix();
    }, updateBounds(t2, e2) {
      const s2 = t2.__layout;
      s2.boundsChanged && t2.__updateLocalBounds(), e2 && (s2.resized = void 0), s2.waitAutoLayout || t2.__updateWorldBounds();
    }, updateAllWorldOpacity(t2) {
      if (t2.__updateWorldOpacity(), t2.isBranch) {
        const { children: e2 } = t2;
        for (let t3 = 0, s2 = e2.length; t3 < s2; t3++) ko(e2[t3]);
      }
    }, updateChange(t2) {
      const e2 = t2.__layout;
      e2.stateStyleChanged && t2.updateState(), e2.opacityChanged && ko(t2), t2.__updateChange(), e2.surfaceChanged && (t2.__hasComplex && vo.updateComplex(t2), e2.surfaceChanged = false);
    }, updateAllChange(t2) {
      if (To(t2), t2.isBranch) {
        const { children: e2 } = t2;
        for (let t3 = 0, s2 = e2.length; t3 < s2; t3++) Oo(e2[t3]);
      }
    }, worldHittable(t2) {
      for (; t2; ) {
        if (!t2.__.hittable) return false;
        t2 = t2.parent;
      }
      return true;
    }, draggable: (t2) => (t2.draggable || t2.editable) && t2.hitSelf && !t2.locked, copyCanvasByWorld(t2, e2, s2, i2, r3, n3) {
      i2 || (i2 = t2.__nowWorld), t2.__worldFlipped || Kt.fullImageShadow ? e2.copyWorldByReset(s2, i2, t2.__nowWorld, r3, n3) : e2.copyWorldToInner(s2, i2, t2.__layout.renderBounds, r3);
    }, clip(t2, e2, s2) {
      t2.__worldOpacity && (e2.setWorld(t2.__nowWorld = t2.__getNowWorld(s2)), t2.__drawRenderPath(e2), e2.clipUI(t2));
    }, renderComplex(t2, e2, s2) {
    }, updateComplex(t2) {
    }, checkComplex(t2) {
    }, updateFlowLayout(t2) {
    }, listenPositionNode(t2) {
    }, updatePositionLayout(t2) {
    }, moveWorld(t2, e2, s2 = 0, i2, r3) {
      const n3 = d(e2) ? Object.assign({}, e2) : { x: e2, y: s2 };
      i2 ? co(t2.localTransform, n3, n3, true) : t2.parent && lo(t2.parent.scrollWorldTransform, n3, n3, true), vo.moveLocal(t2, n3.x, n3.y, r3);
    }, moveLocal(t2, e2, s2 = 0, i2) {
      d(e2) && (s2 = e2.y, e2 = e2.x), e2 += t2.x, s2 += t2.y, t2.leafer && t2.leafer.config.pointSnap && (e2 = xo(e2), s2 = xo(s2)), i2 ? t2.animate({ x: e2, y: s2 }, i2) : (t2.x = e2, t2.y = s2);
    }, zoomOfWorld(t2, e2, s2, i2, r3, n3, o2) {
      vo.zoomOfLocal(t2, Po(t2, e2), s2, i2, r3, n3, o2);
    }, zoomOfLocal(t2, e2, s2, i2 = s2, r3, n3, a) {
      const h = t2.__localMatrix;
      if (o(i2) || (i2 && (n3 = i2), i2 = s2), ho(mo, h), uo(mo, e2, s2, i2), vo.hasHighPosition(t2)) vo.setTransform(t2, mo, r3, n3, a);
      else {
        const e3 = t2.x + mo.e - h.e, o2 = t2.y + mo.f - h.f;
        n3 && !r3 ? t2.animate({ x: e3, y: o2, scaleX: t2.scaleX * s2, scaleY: t2.scaleY * i2 }, n3) : (t2.x = e3, t2.y = o2, t2.scaleResize(s2, i2, true !== r3, a));
      }
    }, rotateOfWorld(t2, e2, s2, i2) {
      vo.rotateOfLocal(t2, Po(t2, e2), s2, i2);
    }, rotateOfLocal(t2, e2, s2, i2) {
      const r3 = t2.__localMatrix;
      ho(mo, r3), _o(mo, e2, s2), vo.hasHighPosition(t2) ? vo.setTransform(t2, mo, false, i2) : t2.set({ x: t2.x + mo.e - r3.e, y: t2.y + mo.f - r3.f, rotation: M.formatRotation(t2.rotation + s2) }, i2);
    }, skewOfWorld(t2, e2, s2, i2, r3, n3) {
      vo.skewOfLocal(t2, Po(t2, e2), s2, i2, r3, n3);
    }, skewOfLocal(t2, e2, s2, i2 = 0, r3, n3) {
      ho(mo, t2.__localMatrix), po(mo, e2, s2, i2), vo.setTransform(t2, mo, r3, n3);
    }, transformWorld(t2, e2, s2, i2, r3) {
      ho(mo, t2.worldTransform), fo(mo, e2), t2.parent && go(mo, t2.parent.scrollWorldTransform), vo.setTransform(t2, mo, s2, i2, r3);
    }, transform(t2, e2, s2, i2, r3) {
      ho(mo, t2.localTransform), fo(mo, e2), vo.setTransform(t2, mo, s2, i2, r3);
    }, setTransform(t2, e2, s2, i2, r3) {
      const n3 = t2.__, o2 = n3.origin && vo.getInnerOrigin(t2, n3.origin), a = yo(e2, o2, n3.around && vo.getInnerOrigin(t2, n3.around));
      if (vo.hasOffset(t2) && (a.x -= n3.offsetX, a.y -= n3.offsetY), s2) {
        const e3 = a.scaleX / t2.scaleX, s3 = a.scaleY / t2.scaleY;
        if (delete a.scaleX, delete a.scaleY, o2) {
          Ft.scale(t2.boxBounds, Math.abs(e3), Math.abs(s3));
          const i3 = vo.getInnerOrigin(t2, n3.origin);
          at.move(a, o2.x - i3.x, o2.y - i3.y);
        }
        t2.set(a), t2.scaleResize(e3, s3, false, r3);
      } else t2.set(a, i2);
    }, getFlipTransform(t2, e2) {
      const s2 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, i2 = "x" === e2 ? 1 : -1;
      return uo(s2, vo.getLocalOrigin(t2, "center"), -1 * i2, 1 * i2), s2;
    }, getLocalOrigin: (t2, e2) => at.tempToOuterOf(vo.getInnerOrigin(t2, e2), t2.localTransform), getInnerOrigin(t2, e2) {
      const s2 = {};
      return vt.toPoint(e2, t2.boxBounds, s2), s2;
    }, getRelativeWorld: (t2, e2, s2) => (ho(mo, t2.worldTransform), go(mo, e2.scrollWorldTransform), s2 ? mo : Object.assign({}, mo)), updateScaleFixedWorld(t2) {
    }, updateOuterBounds(t2) {
    }, cacheId(t2) {
    }, drop(t2, e2, s2, i2) {
      t2.setTransform(vo.getRelativeWorld(t2, e2, true), i2), e2.add(t2, s2);
    }, hasHighPosition: (t2) => t2.origin || t2.around || vo.hasOffset(t2), hasOffset: (t2) => t2.offsetX || t2.offsetY, hasParent(t2, e2, s2) {
      if (!e2) return false;
      for (; t2; ) {
        if (e2 === t2) return true;
        if (s2 && t2.__level === s2) return;
        t2 = t2.parent;
      }
    }, animateMove(t2, e2, s2 = 0.3, i2) {
      if (e2.x || e2.y) {
        if (Math.abs(e2.x) < 1 && Math.abs(e2.y) < 1) t2.move(e2);
        else {
          const r3 = e2.x * s2, n3 = e2.y * s2;
          e2.x -= r3, e2.y -= n3, t2.move(r3, n3), Kt.requestRender(() => vo.animateMove(t2, e2, s2, i2));
        }
        i2 && i2();
      }
    } };
    vo = wo;
    ({ updateAllMatrix: Bo, updateMatrix: Co, updateAllWorldOpacity: ko, updateAllChange: Oo, updateChange: To } = vo);
    So = { worldBounds: (t2) => t2.__world, localBoxBounds: (t2) => t2.__.eraser || 0 === t2.__.visible ? null : t2.__local || t2.__layout, localStrokeBounds: (t2) => t2.__.eraser || 0 === t2.__.visible ? null : t2.__layout.localStrokeBounds, localRenderBounds(t2) {
      const { __: e2, __layout: s2 } = t2;
      return e2.eraser || 0 === e2.visible ? null : s2.localOuterBounds || s2.localRenderBounds;
    }, maskLocalBoxBounds: (t2, e2) => Ro(t2, e2) && t2.__localBoxBounds, maskLocalStrokeBounds: (t2, e2) => Ro(t2, e2) && t2.__layout.localStrokeBounds, maskLocalRenderBounds(t2, e2) {
      const { __layout: s2 } = t2;
      return Ro(t2, e2) && (s2.localOuterBounds || s2.localRenderBounds);
    }, excludeRenderBounds: (t2, e2) => !(!e2.bounds || e2.bounds.hit(t2.__world, e2.matrix)) || !(!e2.hideBounds || !e2.hideBounds.includes(t2.__world, e2.matrix)) };
    ({ updateBounds: Io } = wo);
    Eo = { sort: (t2, e2) => t2.__.zIndex === e2.__.zIndex ? t2.__tempNumber - e2.__tempNumber : t2.__.zIndex - e2.__.zIndex, zIndex(t2, e2, s2) {
      const { children: i2 } = t2, r3 = i2[s2 - 1], n3 = i2[s2];
      r3 && n3 ? (e2.zIndex < r3.zIndex || e2.zIndex > n3.zIndex) && (e2.zIndex = (r3.zIndex + n3.zIndex) / 2) : r3 ? e2.zIndex < r3.zIndex && (e2.zIndex = r3.zIndex + 1) : n3 && e2.zIndex > n3.zIndex && (e2.zIndex = n3.zIndex - 1);
    }, pushAllChildBranch(t2, e2) {
      if (t2.__tempNumber = 1, t2.__.__childBranchNumber) {
        const { children: s2 } = t2;
        for (let i2 = 0, r3 = s2.length; i2 < r3; i2++) (t2 = s2[i2]).isBranch && (t2.__tempNumber = 1, e2.add(t2), Mo(t2, e2));
      }
    }, pushAllParent(t2, e2) {
      const { keys: i2 } = e2;
      if (i2) for (; t2.parent && s(i2[t2.parent.innerId]); ) e2.add(t2.parent), t2 = t2.parent;
      else for (; t2.parent; ) e2.add(t2.parent), t2 = t2.parent;
    }, pushAllBranchStack(t2, e2) {
      let s2 = e2.length;
      const { children: i2 } = t2;
      for (let t3 = 0, s3 = i2.length; t3 < s3; t3++) i2[t3].isBranch && e2.push(i2[t3]);
      for (let t3 = s2, i3 = e2.length; t3 < i3; t3++) Ao(e2[t3], e2);
    }, updateBounds(t2, e2) {
      const s2 = [t2];
      Ao(t2, s2), Wo(s2, e2);
    }, updateBoundsByBranchStack(t2, e2) {
      let s2, i2;
      for (let r3 = t2.length - 1; r3 > -1; r3--) {
        s2 = t2[r3], i2 = s2.children;
        for (let t3 = 0, e3 = i2.length; t3 < e3; t3++) Io(i2[t3]);
        e2 && e2 === s2 || Io(s2);
      }
    }, move(t2, e2, s2) {
      let i2;
      const { children: r3 } = t2;
      for (let n3 = 0, o2 = r3.length; n3 < o2; n3++) i2 = (t2 = r3[n3]).__world, i2.e += e2, i2.f += s2, i2.x += e2, i2.y += s2, t2.isBranch && No(t2, e2, s2);
    }, scale(t2, e2, s2, i2, r3, n3, o2) {
      let a;
      const { children: h } = t2, l2 = i2 - 1, d2 = r3 - 1;
      for (let c = 0, u2 = h.length; c < u2; c++) a = (t2 = h[c]).__world, a.a *= i2, a.d *= r3, (a.b || a.c) && (a.b *= i2, a.c *= r3), a.e === a.x && a.f === a.y ? (a.x = a.e += (a.e - n3) * l2 + e2, a.y = a.f += (a.f - o2) * d2 + s2) : (a.e += (a.e - n3) * l2 + e2, a.f += (a.f - o2) * d2 + s2, a.x += (a.x - n3) * l2 + e2, a.y += (a.y - o2) * d2 + s2), a.width *= i2, a.height *= r3, a.scaleX *= i2, a.scaleY *= r3, t2.isBranch && Do(t2, e2, s2, i2, r3, n3, o2);
    } };
    ({ pushAllChildBranch: Mo, pushAllBranchStack: Ao, updateBoundsByBranchStack: Wo, move: No, scale: Do } = Eo);
    Yo = { run(t2) {
      if (t2 && t2.length) {
        const e2 = t2.length;
        for (let s2 = 0; s2 < e2; s2++) t2[s2]();
        t2.length === e2 ? t2.length = 0 : t2.splice(0, e2);
      }
    } };
    ({ getRelativeWorld: Xo, updateBounds: zo } = wo);
    ({ toOuterOf: Fo, getPoints: Uo, copy: jo } = Ft);
    Vo = "_localContentBounds";
    qo = "_worldContentBounds";
    Ho = "_worldBoxBounds";
    Go = "_worldStrokeBounds";
    Qo = class {
      get contentBounds() {
        return this._contentBounds || this.boxBounds;
      }
      set contentBounds(t2) {
        this._contentBounds = t2;
      }
      get strokeBounds() {
        return this._strokeBounds || this.boxBounds;
      }
      get renderBounds() {
        return this._renderBounds || this.boxBounds;
      }
      set renderBounds(t2) {
        this._renderBounds = t2;
      }
      get localContentBounds() {
        return Fo(this.contentBounds, this.leaf.__localMatrix, this[Vo] || (this[Vo] = {})), this[Vo];
      }
      get localStrokeBounds() {
        return this._localStrokeBounds || this;
      }
      get localRenderBounds() {
        return this._localRenderBounds || this;
      }
      get worldContentBounds() {
        return Fo(this.contentBounds, this.leaf.__world, this[qo] || (this[qo] = {})), this[qo];
      }
      get worldBoxBounds() {
        return Fo(this.boxBounds, this.leaf.__world, this[Ho] || (this[Ho] = {})), this[Ho];
      }
      get worldStrokeBounds() {
        return Fo(this.strokeBounds, this.leaf.__world, this[Go] || (this[Go] = {})), this[Go];
      }
      get a() {
        return 1;
      }
      get b() {
        return 0;
      }
      get c() {
        return 0;
      }
      get d() {
        return 1;
      }
      get e() {
        return this.leaf.__.x;
      }
      get f() {
        return this.leaf.__.y;
      }
      get x() {
        return this.e + this.boxBounds.x;
      }
      get y() {
        return this.f + this.boxBounds.y;
      }
      get width() {
        return this.boxBounds.width;
      }
      get height() {
        return this.boxBounds.height;
      }
      constructor(t2) {
        this.leaf = t2, this.leaf.__local && (this._localRenderBounds = this._localStrokeBounds = this.leaf.__local), t2.__world && (this.boxBounds = { x: 0, y: 0, width: 0, height: 0 }, this.boxChange(), this.matrixChange());
      }
      createLocal() {
        const t2 = this.leaf.__local = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, x: 0, y: 0, width: 0, height: 0 };
        this._localStrokeBounds || (this._localStrokeBounds = t2), this._localRenderBounds || (this._localRenderBounds = t2);
      }
      update() {
        const { leaf: t2 } = this, { leafer: e2 } = t2;
        if (t2.isApp) return zo(t2);
        if (e2) e2.ready ? e2.watcher.changed && e2.layouter.layout() : e2.start();
        else {
          let e3 = t2;
          for (; e3.parent && !e3.parent.leafer; ) e3 = e3.parent;
          const s2 = e3;
          if (s2.__fullLayouting) return;
          s2.__fullLayouting = true, Kt.layout(s2), delete s2.__fullLayouting;
        }
      }
      getTransform(t2 = "world") {
        this.update();
        const { leaf: e2 } = this;
        switch (t2) {
          case "world":
            return e2.__world;
          case "local":
            return e2.__localMatrix;
          case "inner":
            return Q.defaultMatrix;
          case "page":
            t2 = e2.zoomLayer;
          default:
            return Xo(e2, t2);
        }
      }
      getBounds(t2, e2 = "world") {
        switch (this.update(), e2) {
          case "world":
            return this.getWorldBounds(t2);
          case "local":
            return this.getLocalBounds(t2);
          case "inner":
            return this.getInnerBounds(t2);
          case "page":
            e2 = this.leaf.zoomLayer;
          default:
            return new qt(this.getInnerBounds(t2)).toOuterOf(this.getTransform(e2));
        }
      }
      getInnerBounds(t2 = "box") {
        switch (t2) {
          case "render":
            return this.renderBounds;
          case "content":
            if (this.contentBounds) return this.contentBounds;
          case "box":
            return this.boxBounds;
          case "stroke":
            return this.strokeBounds;
        }
      }
      getLocalBounds(t2 = "box") {
        switch (t2) {
          case "render":
            return this.localRenderBounds;
          case "stroke":
            return this.localStrokeBounds;
          case "content":
            if (this.contentBounds) return this.localContentBounds;
          case "box":
            return this.leaf.__localBoxBounds;
        }
      }
      getWorldBounds(t2 = "box") {
        switch (t2) {
          case "render":
            return this.leaf.__world;
          case "stroke":
            return this.worldStrokeBounds;
          case "content":
            if (this.contentBounds) return this.worldContentBounds;
          case "box":
            return this.worldBoxBounds;
        }
      }
      getLayoutBounds(t2, e2 = "world", s2) {
        const { leaf: i2 } = this;
        let r3, n3, o2, a = this.getInnerBounds(t2);
        switch (e2) {
          case "world":
            r3 = i2.getWorldPoint(a), n3 = i2.__world;
            break;
          case "local":
            const { scaleX: t3, scaleY: s3, rotation: h, skewX: l2, skewY: d2 } = i2.__;
            o2 = { scaleX: t3, scaleY: s3, rotation: h, skewX: l2, skewY: d2 }, r3 = i2.getLocalPointByInner(a);
            break;
          case "inner":
            r3 = a, n3 = Q.defaultMatrix;
            break;
          case "page":
            e2 = i2.zoomLayer;
          default:
            r3 = i2.getWorldPoint(a, e2), n3 = Xo(i2, e2, true);
        }
        if (o2 || (o2 = Q.getLayout(n3)), jo(o2, a), at.copy(o2, r3), s2) {
          const { scaleX: t3, scaleY: e3 } = o2, s3 = Math.abs(t3), i3 = Math.abs(e3);
          1 === s3 && 1 === i3 || (o2.scaleX /= s3, o2.scaleY /= i3, o2.width *= s3, o2.height *= i3);
        }
        return o2;
      }
      getLayoutPoints(t2, e2 = "world") {
        const { leaf: i2 } = this, r3 = Uo(this.getInnerBounds(t2));
        let n3;
        switch (e2) {
          case "world":
            n3 = null;
            break;
          case "local":
            n3 = i2.parent;
            break;
          case "inner":
            break;
          case "page":
            e2 = i2.zoomLayer;
          default:
            n3 = e2;
        }
        return s(n3) || r3.forEach((t3) => i2.innerToWorld(t3, null, false, n3)), r3;
      }
      shrinkContent() {
        const { x: t2, y: e2, width: s2, height: i2 } = this.boxBounds;
        this._contentBounds = { x: t2, y: e2, width: s2, height: i2 };
      }
      spreadStroke() {
        const { x: t2, y: e2, width: s2, height: i2 } = this.strokeBounds;
        this._strokeBounds = { x: t2, y: e2, width: s2, height: i2 }, this._localStrokeBounds = { x: t2, y: e2, width: s2, height: i2 }, this.renderSpread || this.spreadRenderCancel();
      }
      spreadRender() {
        const { x: t2, y: e2, width: s2, height: i2 } = this.renderBounds;
        this._renderBounds = { x: t2, y: e2, width: s2, height: i2 }, this._localRenderBounds = { x: t2, y: e2, width: s2, height: i2 };
      }
      shrinkContentCancel() {
        this._contentBounds = void 0;
      }
      spreadStrokeCancel() {
        const t2 = this.renderBounds === this.strokeBounds;
        this._strokeBounds = this.boxBounds, this._localStrokeBounds = this.leaf.__localBoxBounds, t2 && this.spreadRenderCancel();
      }
      spreadRenderCancel() {
        this._renderBounds = this._strokeBounds, this._localRenderBounds = this._localStrokeBounds;
      }
      boxChange() {
        this.boxChanged = true, this.localBoxChanged ? this.boundsChanged || (this.boundsChanged = true) : this.localBoxChange(), this.hitCanvasChanged = true;
      }
      localBoxChange() {
        this.localBoxChanged = true, this.boundsChanged = true;
      }
      strokeChange() {
        this.strokeChanged = true, this.strokeSpread || (this.strokeSpread = 1), this.boundsChanged = true, this.hitCanvasChanged = true;
      }
      renderChange() {
        this.renderChanged = true, this.renderSpread || (this.renderSpread = 1), this.boundsChanged = true, this.hitCanvasChanged = true;
      }
      scaleChange() {
        this.scaleChanged = true, this._scaleOrRotationChange();
      }
      rotationChange() {
        this.rotationChanged = true, this.affectRotation = true, this._scaleOrRotationChange();
      }
      _scaleOrRotationChange() {
        this.affectScaleOrRotation = true, this.matrixChange(), this.leaf.__local || this.createLocal();
      }
      matrixChange() {
        this.matrixChanged = true, this.localBoxChanged ? this.boundsChanged || (this.boundsChanged = true) : this.localBoxChange();
      }
      surfaceChange() {
        this.surfaceChanged = true;
      }
      opacityChange() {
        this.opacityChanged = true;
      }
      childrenSortChange() {
        this.childrenSortChanged || (this.childrenSortChanged = this.affectChildrenSort = true, this.leaf.forceUpdate("surface"));
      }
      destroy() {
      }
    };
    Jo = class {
      constructor(t2, e2) {
        this.bubbles = false, this.type = t2, e2 && (this.target = e2);
      }
      stopDefault() {
        this.isStopDefault = true, this.origin && Kt.event.stopDefault(this.origin);
      }
      stopNow() {
        this.isStopNow = true, this.isStop = true, this.origin && Kt.event.stopNow(this.origin);
      }
      stop() {
        this.isStop = true, this.origin && Kt.event.stop(this.origin);
      }
    };
    Zo = class extends Jo {
      constructor(t2, e2, s2) {
        super(t2, e2), this.parent = s2, this.child = e2;
      }
    };
    Zo.ADD = "child.add", Zo.REMOVE = "child.remove", Zo.CREATED = "created", Zo.MOUNTED = "mounted", Zo.UNMOUNTED = "unmounted", Zo.DESTROY = "destroy";
    $o = "property.scroll";
    Ko = class extends Jo {
      constructor(t2, e2, s2, i2, r3) {
        super(t2, e2), this.attrName = s2, this.oldValue = i2, this.newValue = r3;
      }
    };
    Ko.CHANGE = "property.change", Ko.LEAFER_CHANGE = "property.leafer_change", Ko.SCROLL = $o;
    ta = { scrollX: $o, scrollY: $o };
    ea = class extends Jo {
      constructor(t2, e2) {
        super(t2), Object.assign(this, e2);
      }
    };
    ea.LOAD = "image.load", ea.LOADED = "image.loaded", ea.ERROR = "image.error";
    sa = class extends Jo {
      static checkHas(t2, e2, s2) {
        "on" === s2 ? e2 === oa ? t2.__hasWorldEvent = true : t2.__hasLocalEvent = true : (t2.__hasLocalEvent = t2.hasEvent(ia) || t2.hasEvent(ra) || t2.hasEvent(na), t2.__hasWorldEvent = t2.hasEvent(oa));
      }
      static emitLocal(t2) {
        if (t2.leaferIsReady) {
          const { resized: e2 } = t2.__layout;
          "local" !== e2 && (t2.emit(ia, t2), "inner" === e2 && t2.emit(ra, t2)), t2.emit(na, t2);
        }
      }
      static emitWorld(t2) {
        t2.leaferIsReady && t2.emit(oa, t2);
      }
    };
    sa.RESIZE = "bounds.resize", sa.INNER = "bounds.inner", sa.LOCAL = "bounds.local", sa.WORLD = "bounds.world";
    ({ RESIZE: ia, INNER: ra, LOCAL: na, WORLD: oa } = sa);
    aa = {};
    [ia, ra, na, oa].forEach((t2) => aa[t2] = 1);
    ha = class _ha extends Jo {
      get bigger() {
        if (!this.old) return true;
        const { width: t2, height: e2 } = this.old;
        return this.width >= t2 && this.height >= e2;
      }
      get smaller() {
        return !this.bigger;
      }
      get samePixelRatio() {
        return !this.old || this.pixelRatio === this.old.pixelRatio;
      }
      constructor(t2, e2) {
        d(t2) ? (super(_ha.RESIZE), Object.assign(this, t2)) : super(t2), this.old = e2;
      }
      static isResizing(t2) {
        return this.resizingKeys && !s(this.resizingKeys[t2.innerId]);
      }
    };
    ha.RESIZE = "resize";
    la = class extends Jo {
      constructor(t2, e2) {
        super(t2), this.data = e2;
      }
    };
    la.REQUEST = "watch.request", la.DATA = "watch.data";
    da = class extends Jo {
      constructor(t2, e2, s2) {
        super(t2), e2 && (this.data = e2, this.times = s2);
      }
    };
    da.REQUEST = "layout.request", da.START = "layout.start", da.BEFORE = "layout.before", da.LAYOUT = "layout", da.AFTER = "layout.after", da.AGAIN = "layout.again", da.END = "layout.end";
    ca = class extends Jo {
      constructor(t2, e2, s2, i2) {
        super(t2), e2 && (this.times = e2), s2 && (this.renderBounds = s2, this.renderOptions = i2);
      }
    };
    ca.REQUEST = "render.request", ca.CHILD_START = "render.child_start", ca.CHILD_END = "render.child_end", ca.START = "render.start", ca.BEFORE = "render.before", ca.RENDER = "render", ca.AFTER = "render.after", ca.AGAIN = "render.again", ca.END = "render.end", ca.NEXT = "render.next";
    ua = class extends Jo {
    };
    ua.START = "leafer.start", ua.BEFORE_READY = "leafer.before_ready", ua.READY = "leafer.ready", ua.AFTER_READY = "leafer.after_ready", ua.VIEW_READY = "leafer.view_ready", ua.VIEW_COMPLETED = "leafer.view_completed", ua.STOP = "leafer.stop", ua.RESTART = "leafer.restart", ua.END = "leafer.end", ua.UPDATE_MODE = "leafer.update_mode", ua.TRANSFORM = "leafer.transform", ua.MOVE = "leafer.move", ua.SCALE = "leafer.scale", ua.ROTATE = "leafer.rotate", ua.SKEW = "leafer.skew";
    ({ MOVE: _a, SCALE: pa, ROTATE: fa, SKEW: ga } = ua);
    ya = { x: _a, y: _a, scaleX: pa, scaleY: pa, rotation: fa, skewX: ga, skewY: ga };
    ma = {};
    xa = class {
      set event(t2) {
        this.on(t2);
      }
      on(t2, e2, s2) {
        if (!e2) {
          let e3;
          if (l(t2)) t2.forEach((t3) => this.on(t3[0], t3[1], t3[2]));
          else for (let s3 in t2) l(e3 = t2[s3]) ? this.on(s3, e3[0], e3[1]) : this.on(s3, e3);
          return;
        }
        let i2, n3, o2;
        s2 && ("once" === s2 ? n3 = true : "boolean" == typeof s2 ? i2 = s2 : (i2 = s2.capture, n3 = s2.once));
        const a = wa(this, i2, true), h = r(t2) ? t2.split(" ") : t2, d2 = n3 ? { listener: e2, once: n3 } : { listener: e2 };
        h.forEach((t3) => {
          t3 && (o2 = a[t3], o2 ? -1 === o2.findIndex((t4) => t4.listener === e2) && o2.push(d2) : a[t3] = [d2], aa[t3] && sa.checkHas(this, t3, "on"));
        });
      }
      off(t2, e2, s2) {
        if (t2) {
          const i2 = r(t2) ? t2.split(" ") : t2;
          if (e2) {
            let t3, r3, n3;
            s2 && (t3 = "boolean" == typeof s2 ? s2 : "once" !== s2 && s2.capture);
            const o2 = wa(this, t3);
            i2.forEach((t4) => {
              t4 && (r3 = o2[t4], r3 && (n3 = r3.findIndex((t5) => t5.listener === e2), n3 > -1 && r3.splice(n3, 1), r3.length || delete o2[t4], aa[t4] && sa.checkHas(this, t4, "off")));
            });
          } else {
            const { __bubbleMap: t3, __captureMap: e3 } = this;
            i2.forEach((s3) => {
              t3 && delete t3[s3], e3 && delete e3[s3];
            });
          }
        } else this.__bubbleMap = this.__captureMap = void 0;
      }
      on_(t2, e2, s2, i2) {
        return e2 ? this.on(t2, s2 ? e2 = e2.bind(s2) : e2, i2) : l(t2) && t2.forEach((t3) => this.on(t3[0], t3[2] ? t3[1] = t3[1].bind(t3[2]) : t3[1], t3[3])), { type: t2, current: this, listener: e2, options: i2 };
      }
      off_(t2) {
        if (!t2) return;
        const e2 = l(t2) ? t2 : [t2];
        e2.forEach((t3) => {
          t3 && (t3.listener ? t3.current.off(t3.type, t3.listener, t3.options) : l(t3.type) && t3.type.forEach((e3) => t3.current.off(e3[0], e3[1], e3[3])));
        }), e2.length = 0;
      }
      once(t2, e2, s2, i2) {
        if (!e2) return l(t2) && t2.forEach((t3) => this.once(t3[0], t3[1], t3[2], t3[3]));
        d(s2) ? e2 = e2.bind(s2) : i2 = s2, this.on(t2, e2, { once: true, capture: i2 });
      }
      emit(t2, e2, s2) {
        !e2 && fe.has(t2) && (e2 = fe.get(t2, { type: t2, target: this, current: this }));
        const i2 = wa(this, s2)[t2];
        if (i2) {
          let r3;
          for (let n3 = 0, o2 = i2.length; n3 < o2 && !((r3 = i2[n3]) && (r3.listener(e2), r3.once && (this.off(t2, r3.listener, s2), n3--, o2--), e2 && e2.isStopNow)); n3++) ;
        }
        this.syncEventer && this.syncEventer.emitEvent(e2, s2);
      }
      emitEvent(t2, e2) {
        t2.current = this, this.emit(t2.type, t2, e2);
      }
      hasEvent(t2, e2) {
        if (this.syncEventer && this.syncEventer.hasEvent(t2, e2)) return true;
        const { __bubbleMap: i2, __captureMap: r3 } = this, n3 = i2 && i2[t2], o2 = r3 && r3[t2];
        return !!(s(e2) ? n3 || o2 : e2 ? o2 : n3);
      }
      destroy() {
        this.__captureMap = this.__bubbleMap = this.syncEventer = null;
      }
    };
    ({ on: ba, on_: va, off: Ba, off_: Ca, once: ka, emit: Oa, emitEvent: Ta, hasEvent: Pa, destroy: Sa } = xa.prototype);
    La = { on: ba, on_: va, off: Ba, off_: Ca, once: ka, emit: Oa, emitEvent: Ta, hasEvent: Pa, destroyEventer: Sa };
    Ra = se.get("setAttr");
    Ia = { __setAttr(t2, e2, i2) {
      if (this.leaferIsCreated) {
        const r3 = this.__.__getInput(t2);
        if (!i2 || n2(e2) || s(e2) || (Ra.warn(this.innerName, t2, e2), e2 = void 0), d(e2) || r3 !== e2) {
          if (this.__realSetAttr(t2, e2), this.isLeafer) {
            this.emitEvent(new Ko(Ko.LEAFER_CHANGE, this, t2, r3, e2));
            const s3 = ya[t2];
            s3 && (this.emitEvent(new ua(s3, this)), this.emitEvent(new ua(ua.TRANSFORM, this)));
          }
          this.emitPropertyEvent(Ko.CHANGE, t2, r3, e2);
          const s2 = ta[t2];
          return s2 && this.emitPropertyEvent(s2, t2, r3, e2), true;
        }
        return false;
      }
      return this.__realSetAttr(t2, e2), true;
    }, emitPropertyEvent(t2, e2, s2, i2) {
      const { leafer: r3 } = this;
      if (bo(r3) || r3.zoomLayer === this) {
        const n3 = new Ko(t2, this, e2, s2, i2);
        this.isLeafer || this.hasEvent(t2) && this.emitEvent(n3), r3.emitEvent(n3);
      } else r3.watcher.add(this);
    }, __realSetAttr(t2, e2) {
      const i2 = this.__;
      i2[t2] = e2, this.__proxyData && this.setProxyAttr(t2, e2), i2.normalStyle && (this.lockNormalStyle || s(i2.normalStyle[t2]) || (i2.normalStyle[t2] = e2));
    }, __getAttr(t2) {
      return this.__proxyData ? this.getProxyAttr(t2) : this.__.__get(t2);
    } };
    ({ setLayout: Ea, multiplyParent: Ma, translateInner: Aa, defaultWorld: Wa } = Q);
    ({ toPoint: Na, tempPoint: Da } = vt);
    Ya = { __updateWorldMatrix() {
      const { parent: t2, __layout: e2, __world: s2, __scrollWorld: i2, __: r3 } = this;
      Ma(this.__local || e2, t2 ? t2.__scrollWorld || t2.__world : Wa, s2, !!e2.affectScaleOrRotation, r3), i2 && Aa(Object.assign(i2, s2), r3.scrollX, r3.scrollY), e2.scaleFixed && wo.updateScaleFixedWorld(this);
    }, __updateLocalMatrix() {
      if (this.__local) {
        const t2 = this.__layout, e2 = this.__local, s2 = this.__;
        t2.affectScaleOrRotation && (t2.scaleChanged && (t2.resized || (t2.resized = "scale")) || t2.rotationChanged) && (Ea(e2, s2, null, null, t2.affectRotation), t2.scaleChanged = t2.rotationChanged = void 0), e2.e = s2.x + s2.offsetX, e2.f = s2.y + s2.offsetY, (s2.around || s2.origin) && (Na(s2.around || s2.origin, t2.boxBounds, Da), Aa(e2, -Da.x, -Da.y, !s2.around));
      }
      this.__layout.matrixChanged = void 0;
    } };
    ({ updateMatrix: Xa, updateAllMatrix: za } = wo);
    ({ updateBounds: Fa } = Eo);
    ({ toOuterOf: Ua, copyAndSpread: ja, copy: Va } = Ft);
    ({ toBounds: qa } = Yr);
    Ha = { __updateWorldBounds() {
      const { __layout: t2, __world: e2 } = this;
      Ua(t2.renderBounds, e2, e2), this.__hasComplex && wo.checkComplex(this), t2.resized && ("inner" === t2.resized && this.__onUpdateSize(), this.__hasLocalEvent && sa.emitLocal(this), t2.resized = void 0), this.__hasWorldEvent && sa.emitWorld(this);
    }, __updateLocalBounds() {
      const t2 = this.__layout, e2 = this.__;
      t2.boxChanged && (e2.__pathInputed || this.__updatePath(), this.__updateRenderPath(), this.__updateBoxBounds(), t2.resized = "inner"), t2.localBoxChanged && (this.__local && (this.__updateLocalBoxBounds(), e2.__usePositionNode && wo.listenPositionNode(this)), t2.localBoxChanged = void 0, t2.strokeSpread && !t2.strokeChanged && (t2.strokeChanged = !!t2.boxChanged || 2), t2.renderSpread && !t2.renderChanged && (t2.renderChanged = !!t2.boxChanged || 2), this.parent && this.parent.__layout.boxChange()), t2.boxChanged = void 0, t2.strokeChanged && (2 === t2.strokeChanged ? this.__updateLocalStrokeBounds() : (t2.strokeSpread = this.__updateStrokeSpread(), t2.strokeSpread ? (t2.strokeBounds === t2.boxBounds && t2.spreadStroke(), this.__updateStrokeBounds(), this.__updateLocalStrokeBounds()) : t2.spreadStrokeCancel(), t2.resized = "inner", (t2.renderSpread || t2.strokeSpread !== t2.strokeBoxSpread) && (t2.renderChanged = true)), t2.strokeChanged = void 0, this.parent && this.parent.__layout.strokeChange()), t2.renderChanged && (2 === t2.renderChanged ? this.__updateLocalRenderBounds() : (t2.renderSpread = this.__updateRenderSpread(), t2.renderSpread ? (t2.renderBounds !== t2.boxBounds && t2.renderBounds !== t2.strokeBounds || t2.spreadRender(), this.__updateRenderBounds(), this.__updateLocalRenderBounds()) : t2.spreadRenderCancel()), t2.renderChanged = void 0, this.parent && this.parent.__layout.renderChange()), t2.outerScale && wo.updateOuterBounds(this), t2.resized || (t2.resized = "local"), t2.boundsChanged = void 0;
    }, __updateLocalBoxBounds() {
      this.__hasMotionPath && this.__updateMotionPath(), this.__hasPosition && wo.updatePositionLayout(this), this.__hasAutoLayout && this.__updateAutoLayout(), Ua(this.__layout.boxBounds, this.__local, this.__local);
    }, __updateLocalStrokeBounds() {
      Ua(this.__layout.strokeBounds, this.__localMatrix, this.__layout.localStrokeBounds);
    }, __updateLocalRenderBounds() {
      Ua(this.__layout.renderBounds, this.__localMatrix, this.__layout.localRenderBounds);
    }, __updateBoxBounds(t2, e2) {
      const s2 = this.__layout.boxBounds, i2 = this.__;
      i2.__usePathBox ? qa(i2.path, s2) : (s2.x = 0, s2.y = 0, s2.width = i2.width, s2.height = i2.height);
    }, __updateAutoLayout() {
      this.__layout.matrixChanged = true, this.isBranch ? (this.__extraUpdate(), this.__.flow ? wo.updateFlowLayout(this) : (za(this), Fa(this, this))) : Xa(this);
    }, __updateNaturalSize() {
      const { __: t2, __layout: e2 } = this;
      t2.__naturalWidth = e2.boxBounds.width, t2.__naturalHeight = e2.boxBounds.height;
    }, __updateStrokeBounds(t2) {
      const e2 = this.__layout;
      ja(e2.strokeBounds, e2.boxBounds, e2.strokeBoxSpread);
    }, __updateRenderBounds(t2) {
      const e2 = this.__layout, { renderSpread: s2 } = e2;
      o(s2) && s2 <= 0 ? Va(e2.renderBounds, e2.strokeBounds) : ja(e2.renderBounds, e2.boxBounds, s2);
    } };
    Ga = { __render(t2, e2) {
      if (e2.shape) return this.__renderShape(t2, e2);
      if ((!e2.cellList || e2.cellList.has(this)) && this.__worldOpacity) {
        const s2 = this.__;
        if (s2.bright && !e2.topRendering) return e2.topList.add(this);
        if (t2.setWorld(this.__nowWorld = this.__getNowWorld(e2)), t2.opacity = e2.ignoreOpacity ? 1 : e2.dimOpacity && !s2.dimskip ? s2.opacity * e2.dimOpacity : s2.opacity, this.__.__single) {
          if ("path" === s2.eraser) return this.__renderEraser(t2, e2);
          const i2 = t2.getSameCanvas(true, true);
          this.__draw(i2, e2, t2), wo.copyCanvasByWorld(this, t2, i2, this.__nowWorld, s2.__blendMode, true), i2.recycle(this.__nowWorld);
        } else this.__draw(t2, e2);
        se.showBounds && se.drawBounds(this, t2, e2);
      }
    }, __renderShape(t2, e2) {
      this.__worldOpacity && (t2.setWorld(this.__nowWorld = this.__getNowWorld(e2)), this.__drawShape(t2, e2));
    }, __clip(t2, e2) {
      wo.clip(this, t2, e2);
    }, __updateWorldOpacity() {
      this.__worldOpacity = this.__.visible ? this.parent ? this.parent.__worldOpacity * this.__.opacity : this.__.opacity : 0, this.__layout.opacityChanged && (this.__layout.opacityChanged = false);
    } };
    ({ excludeRenderBounds: Qa } = So);
    ({ hasSize: Ja } = Ft);
    Za = { __updateChange() {
      this.__layout.childrenSortChanged && this.__updateSortChildren(), this.__.__checkSingle();
    }, __render(t2, e2) {
      const s2 = this.__nowWorld = this.__getNowWorld(e2);
      if (this.__worldOpacity && Ja(s2)) {
        const i2 = this.__;
        if (i2.__useDim) {
          if (i2.bright && !e2.topRendering) return e2.topList.add(this);
          i2.dim ? e2.dimOpacity = true === i2.dim ? 0.2 : i2.dim : i2.dimskip && e2.dimOpacity && (e2.dimOpacity = 0);
        }
        if (i2.__single && !this.isBranchLeaf) {
          if ("path" === i2.eraser) return this.__renderEraser(t2, e2);
          const r3 = t2.getSameCanvas(false, true);
          this.__renderBranch(r3, e2), t2.opacity = e2.ignoreOpacity ? 1 : e2.dimOpacity ? i2.opacity * e2.dimOpacity : i2.opacity, t2.copyWorldByReset(r3, s2, s2, i2.__blendMode, true), r3.recycle(s2);
        } else this.__renderBranch(t2, e2);
      }
    }, __renderBranch(t2, e2) {
      if (this.__hasMask) this.__renderMask(t2, e2);
      else {
        let s2;
        const { children: i2 } = this;
        for (let r3 = 0, n3 = i2.length; r3 < n3; r3++) s2 = i2[r3], Qa(s2, e2) || (s2.__hasComplex ? wo.renderComplex(s2, t2, e2) : s2.__render(t2, e2));
        0 === this.__hasMask && this.__rerenderMask(t2, e2);
      }
    }, __clip(t2, e2) {
      if (this.__worldOpacity) {
        const { children: s2 } = this;
        for (let i2 = 0, r3 = s2.length; i2 < r3; i2++) Qa(s2[i2], e2) || s2[i2].__clip(t2, e2);
      }
    } };
    ({ LEAF: $a, create: Ka } = g);
    ({ stintSet: th } = _);
    ({ toInnerPoint: eh, toOuterPoint: sh, multiplyParent: ih } = Q);
    ({ toOuterOf: rh } = Ft);
    ({ copy: nh, move: oh } = at);
    ({ getScaleFixedData: ah } = M);
    ({ moveLocal: hh, zoomOfLocal: lh, rotateOfLocal: dh, skewOfLocal: ch, moveWorld: uh, zoomOfWorld: _h, rotateOfWorld: ph, skewOfWorld: fh, transform: gh, transformWorld: yh, setTransform: mh, getFlipTransform: xh, getLocalOrigin: wh, getRelativeWorld: bh, drop: vh } = wo);
    Bh = class {
      get tag() {
        return this.__tag;
      }
      set tag(t2) {
      }
      get __tag() {
        return "Leaf";
      }
      get innerName() {
        return this.__.name || this.tag + this.innerId;
      }
      get __DataProcessor() {
        return f;
      }
      get __LayoutProcessor() {
        return Qo;
      }
      get leaferIsCreated() {
        return this.leafer && this.leafer.created;
      }
      get leaferIsReady() {
        return this.leafer && this.leafer.ready;
      }
      get isLeafer() {
        return false;
      }
      get isFrame() {
        return false;
      }
      get isBranch() {
        return false;
      }
      get isBranchLeaf() {
        return false;
      }
      get __localMatrix() {
        return this.__local || this.__layout;
      }
      get __localBoxBounds() {
        return this.__local || this.__layout;
      }
      get worldTransform() {
        return this.__layout.getTransform("world");
      }
      get localTransform() {
        return this.__layout.getTransform("local");
      }
      get scrollWorldTransform() {
        return this.updateLayout(), this.__scrollWorld || this.__world;
      }
      get boxBounds() {
        return this.getBounds("box", "inner");
      }
      get renderBounds() {
        return this.getBounds("render", "inner");
      }
      get worldBoxBounds() {
        return this.getBounds("box");
      }
      get worldStrokeBounds() {
        return this.getBounds("stroke");
      }
      get worldRenderBounds() {
        return this.getBounds("render");
      }
      get worldOpacity() {
        return this.updateLayout(), this.__worldOpacity;
      }
      get __worldFlipped() {
        return this.__world.scaleX < 0 || this.__world.scaleY < 0;
      }
      get __onlyHitMask() {
        return this.__hasMask && !this.__.hitChildren;
      }
      get __ignoreHitWorld() {
        return (this.__hasMask || this.__hasEraser) && this.__.hitChildren;
      }
      get __inLazyBounds() {
        return this.leaferIsCreated && this.leafer.lazyBounds.hit(this.__world);
      }
      get pathInputed() {
        return this.__.__pathInputed;
      }
      set event(t2) {
        this.on(t2);
      }
      constructor(t2) {
        this.innerId = Ka($a), this.reset(t2), this.__bubbleMap && this.__emitLifeEvent(Zo.CREATED);
      }
      reset(t2) {
        this.leafer && this.leafer.forceRender(this.__world), 0 !== t2 && (this.__world = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, x: 0, y: 0, width: 0, height: 0, scaleX: 1, scaleY: 1 }, null !== t2 && (this.__local = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, x: 0, y: 0, width: 0, height: 0 })), this.__worldOpacity = 1, this.__ = new this.__DataProcessor(this), this.__layout = new this.__LayoutProcessor(this), this.__level && this.resetCustom(), t2 && (t2.__ && (t2 = t2.toJSON()), t2.children ? this.set(t2) : Object.assign(this, t2));
      }
      resetCustom() {
        this.__hasMask = this.__hasEraser = null, this.forceUpdate();
      }
      waitParentChange(t2) {
        this.__parentChange || (this.__parentChange = []), this.__parentChange.includes(t2) || this.__parentChange.push(t2), this.parent && t2(this.parent, this);
      }
      waitParent(t2, e2) {
        e2 && (t2 = t2.bind(e2)), this.parent ? t2() : this.on(Zo.ADD, t2, "once");
      }
      waitLeafer(t2, e2) {
        e2 && (t2 = t2.bind(e2)), this.leafer ? t2() : this.on(Zo.MOUNTED, t2, "once");
      }
      nextRender(t2, e2, s2) {
        this.leafer ? this.leafer.nextRender(t2, e2, s2) : this.waitLeafer(() => this.leafer.nextRender(t2, e2, s2));
      }
      removeNextRender(t2) {
        this.nextRender(t2, null, "off");
      }
      __bindLeafer(t2) {
        if (this.isLeafer && null !== t2 && (t2 = this), this.leafer && !t2 && this.leafer.leafs--, this.leafer = t2, t2 ? (t2.leafs++, this.__level = this.parent ? this.parent.__level + 1 : 1, this.animation && this.__runAnimation("in"), this.__bubbleMap && this.__emitLifeEvent(Zo.MOUNTED), t2.cacheId && wo.cacheId(this)) : this.__emitLifeEvent(Zo.UNMOUNTED), this.isBranch) {
          const { children: e2 } = this;
          for (let s2 = 0, i2 = e2.length; s2 < i2; s2++) e2[s2].__bindLeafer(t2);
        }
      }
      __bindFrame(t2) {
        if (this.frame = t2, this.isBranch) {
          const { children: e2 } = this;
          for (let s2 = 0, i2 = e2.length; s2 < i2; s2++) e2[s2].__bindFrame(t2);
        }
      }
      setAttr(t2, e2) {
        this[t2] = e2;
      }
      getAttr(t2) {
        return this[t2];
      }
      getComputedAttr(t2) {
        return this.__[t2];
      }
      toJSON(t2) {
        return t2 && this.__layout.update(), this.__.__getInputData(null, t2);
      }
      toString(t2) {
        return JSON.stringify(this.toJSON(t2));
      }
      scaleResize(t2, e2 = t2, s2, i2) {
        this.scaleX *= t2, this.scaleY *= e2;
      }
      updateLayout() {
        this.__layout.update();
      }
      forceUpdate(t2) {
        let e2;
        if (this.__hasComplex && wo.updateComplex(this), t2 && "bounds" !== t2 ? "surface" === t2 ? (Wn(this), e2 = true) : "stroke" === t2 && (In(this), e2 = true) : (Pn(this), e2 = true), e2) {
          const { leafer: t3 } = this;
          return t3 && t3.watcher && t3.watcher.__onAttrChange({ target: this });
        }
        const i2 = this.__.__getInput(t2);
        this.__[t2] = s(i2) ? null : void 0, this[t2] = i2;
      }
      forceRender(t2, e2) {
        this.forceUpdate("surface");
      }
      __extraUpdate() {
        this.leaferIsReady && this.leafer.layouter.addExtra(this);
      }
      __updateEraser() {
        this.__hasEraser = this.children.some((t2) => t2.__.eraser);
      }
      __renderEraser(t2, e2) {
        t2.save(), this.__clip(t2, e2);
        const { renderBounds: s2 } = this.__layout;
        t2.clearRect(s2.x, s2.y, s2.width, s2.height), t2.restore();
      }
      __updateMask() {
        const t2 = this.children.some((t3) => t3.__.mask && t3.__.visible && t3.__.opacity);
        this.__hasMask = this.__.maskskip ? t2 && 0 : t2;
      }
      __getNowWorld(t2) {
        if (t2.matrix) {
          this.__cameraWorld || (this.__cameraWorld = {});
          const e2 = this.__cameraWorld, s2 = this.__world;
          return ih(s2, t2.matrix, e2, void 0, s2), rh(this.__layout.renderBounds, e2, e2), th(e2, "half", s2.half), th(e2, "ignorePixelSnap", s2.ignorePixelSnap), e2;
        }
        return this.__world;
      }
      getClampRenderScale() {
        let { scaleX: t2 } = this.__nowWorld || this.__world;
        return t2 < 0 && (t2 = -t2), t2 > 1 ? t2 : 1;
      }
      getRenderScaleData(t2, e2, s2 = true) {
        return ah(an.patternLocked ? this.__world : this.__nowWorld || this.__world, e2, s2, t2);
      }
      getTransform(t2) {
        return this.__layout.getTransform(t2 || "local");
      }
      getBounds(t2, e2) {
        return this.__layout.getBounds(t2, e2);
      }
      getLayoutBounds(t2, e2, s2) {
        return this.__layout.getLayoutBounds(t2, e2, s2);
      }
      getLayoutPoints(t2, e2) {
        return this.__layout.getLayoutPoints(t2, e2);
      }
      getWorldBounds(t2, e2, s2) {
        const i2 = e2 ? bh(this, e2) : this.worldTransform, r3 = s2 ? t2 : {};
        return rh(t2, i2, r3), r3;
      }
      worldToLocal(t2, e2, s2, i2) {
        this.parent ? this.parent.worldToInner(t2, e2, s2, i2) : e2 && nh(e2, t2);
      }
      localToWorld(t2, e2, s2, i2) {
        this.parent ? this.parent.innerToWorld(t2, e2, s2, i2) : e2 && nh(e2, t2);
      }
      worldToInner(t2, e2, s2, i2) {
        i2 && (i2.innerToWorld(t2, e2, s2), t2 = e2 || t2), eh(this.worldTransform, t2, e2, s2);
      }
      innerToWorld(t2, e2, s2, i2) {
        sh(this.worldTransform, t2, e2, s2), i2 && i2.worldToInner(e2 || t2, null, s2);
      }
      getBoxPoint(t2, e2, s2, i2) {
        const r3 = this.getInnerPoint(t2, e2, s2, i2);
        return s2 ? r3 : this.getBoxPointByInner(r3, null, null, true);
      }
      getBoxPointByInner(t2, e2, s2, i2) {
        const r3 = i2 ? t2 : Object.assign({}, t2), { x: n3, y: o2 } = this.boxBounds;
        return oh(r3, -n3, -o2), r3;
      }
      getInnerPoint(t2, e2, s2, i2) {
        const r3 = i2 ? t2 : {};
        return this.worldToInner(t2, r3, s2, e2), r3;
      }
      getInnerPointByBox(t2, e2, s2, i2) {
        const r3 = i2 ? t2 : Object.assign({}, t2), { x: n3, y: o2 } = this.boxBounds;
        return oh(r3, n3, o2), r3;
      }
      getInnerPointByLocal(t2, e2, s2, i2) {
        return this.getInnerPoint(t2, this.parent, s2, i2);
      }
      getLocalPoint(t2, e2, s2, i2) {
        const r3 = i2 ? t2 : {};
        return this.worldToLocal(t2, r3, s2, e2), r3;
      }
      getLocalPointByInner(t2, e2, s2, i2) {
        return this.getWorldPoint(t2, this.parent, s2, i2);
      }
      getPagePoint(t2, e2, s2, i2) {
        return (this.leafer ? this.leafer.zoomLayer : this).getInnerPoint(t2, e2, s2, i2);
      }
      getWorldPoint(t2, e2, s2, i2) {
        const r3 = i2 ? t2 : {};
        return this.innerToWorld(t2, r3, s2, e2), r3;
      }
      getWorldPointByBox(t2, e2, s2, i2) {
        return this.getWorldPoint(this.getInnerPointByBox(t2, null, null, i2), e2, s2, true);
      }
      getWorldPointByLocal(t2, e2, s2, i2) {
        const r3 = i2 ? t2 : {};
        return this.localToWorld(t2, r3, s2, e2), r3;
      }
      getWorldPointByPage(t2, e2, s2, i2) {
        return (this.leafer ? this.leafer.zoomLayer : this).getWorldPoint(t2, e2, s2, i2);
      }
      setTransform(t2, e2, s2, i2) {
        mh(this, t2, e2, s2, i2);
      }
      transform(t2, e2, s2, i2) {
        gh(this, t2, e2, s2, i2);
      }
      move(t2, e2, s2) {
        hh(this, t2, e2, s2);
      }
      moveInner(t2, e2, s2) {
        uh(this, t2, e2, true, s2);
      }
      scaleOf(t2, e2, s2, i2, r3, n3) {
        lh(this, wh(this, t2), e2, s2, i2, r3, n3);
      }
      rotateOf(t2, e2, s2) {
        dh(this, wh(this, t2), e2, s2);
      }
      skewOf(t2, e2, s2, i2, r3) {
        ch(this, wh(this, t2), e2, s2, i2, r3);
      }
      transformWorld(t2, e2, s2, i2) {
        yh(this, t2, e2, s2, i2);
      }
      moveWorld(t2, e2, s2) {
        uh(this, t2, e2, false, s2);
      }
      scaleOfWorld(t2, e2, s2, i2, r3, n3) {
        _h(this, t2, e2, s2, i2, r3, n3);
      }
      rotateOfWorld(t2, e2) {
        ph(this, t2, e2);
      }
      skewOfWorld(t2, e2, s2, i2, r3) {
        fh(this, t2, e2, s2, i2, r3);
      }
      flip(t2, e2) {
        gh(this, xh(this, t2), false, e2);
      }
      remove(t2, e2) {
        this.parent && this.parent.remove(this, e2);
      }
      dropTo(t2, e2, s2) {
        vh(this, t2, e2, s2);
      }
      static changeAttr(t2, e2, s2) {
        s2 ? this.addAttr(t2, e2, s2) : $n(this.prototype, t2, e2);
      }
      static addAttr(t2, e2, s2, i2) {
        s2 || (s2 = On), s2(e2, i2)(this.prototype, t2);
      }
      __emitLifeEvent(t2) {
        this.hasEvent(t2) && this.emitEvent(new Zo(t2, this, this.parent));
      }
      destroy() {
        this.destroyed || (this.parent && this.remove(), this.children && this.clear(), this.__emitLifeEvent(Zo.DESTROY), this.__.destroy(), this.__layout.destroy(), this.destroyEventer(), this.destroyed = true);
      }
    };
    Bh = me([no(Ia), no(Ya), no(Ha), no(La), no(Ga)], Bh);
    ({ setListWithFn: Ch } = Ft);
    ({ sort: kh } = Eo);
    ({ localBoxBounds: Oh, localStrokeBounds: Th, localRenderBounds: Ph, maskLocalBoxBounds: Sh, maskLocalStrokeBounds: Lh, maskLocalRenderBounds: Rh } = So);
    Ih = new se("Branch");
    Eh = class extends Bh {
      __updateStrokeSpread() {
        const { children: t2 } = this;
        for (let e2 = 0, s2 = t2.length; e2 < s2; e2++) if (t2[e2].__layout.strokeSpread) return 1;
        return 0;
      }
      __updateRenderSpread() {
        let t2;
        const { children: e2 } = this;
        for (let s2 = 0, i2 = e2.length; s2 < i2; s2++) if (t2 = e2[s2].__layout, t2.renderSpread || t2.localOuterBounds) return 1;
        return 0;
      }
      __updateBoxBounds(t2, e2) {
        Ch(e2 || this.__layout.boxBounds, this.children, this.__hasMask ? Sh : Oh);
      }
      __updateStrokeBounds(t2) {
        Ch(t2 || this.__layout.strokeBounds, this.children, this.__hasMask ? Lh : Th);
      }
      __updateRenderBounds(t2) {
        Ch(t2 || this.__layout.renderBounds, this.children, this.__hasMask ? Rh : Ph);
      }
      __updateSortChildren() {
        let t2;
        const { children: e2 } = this;
        if (e2.length > 1) {
          for (let s2 = 0, i2 = e2.length; s2 < i2; s2++) e2[s2].__tempNumber = s2, e2[s2].__.zIndex && (t2 = true);
          e2.sort(kh), this.__layout.affectChildrenSort = t2;
        }
        this.__layout.childrenSortChanged = false;
      }
      add(t2, e2) {
        if (t2 === this || t2.destroyed) return Ih.warn("add self or destroyed");
        const i2 = s(e2);
        if (!t2.__) {
          if (l(t2)) return t2.forEach((t3) => {
            this.add(t3, e2), i2 || e2++;
          });
          if (!(t2 = ue.get(t2.tag, t2))) return;
        }
        t2.parent && t2.parent.remove(t2), t2.parent = this, i2 ? this.children.push(t2) : (Eo.zIndex(this, t2, e2), this.children.splice(e2, 0, t2)), t2.isBranch && (this.__.__childBranchNumber = (this.__.__childBranchNumber || 0) + 1);
        const r3 = t2.__layout;
        r3.boxChanged || r3.boxChange(), r3.matrixChanged || r3.matrixChange(), t2.__parentChange && t2.__parentChange.forEach((e3) => e3(this, t2)), t2.__bubbleMap && t2.__emitLifeEvent(Zo.ADD), this.frame && t2.__bindFrame(this.frame), this.leafer && (t2.__bindLeafer(this.leafer), this.leafer.created && this.__emitChildEvent(Zo.ADD, t2)), this.__layout.affectChildrenSort && this.__layout.childrenSortChange();
      }
      addMany(...t2) {
        this.add(t2);
      }
      remove(t2, e2) {
        t2 ? t2.__ ? t2.animationOut ? t2.__runAnimation("out", () => this.__remove(t2, e2)) : this.__remove(t2, e2) : this.find(t2).forEach((t3) => this.remove(t3, e2)) : s(t2) && super.remove(null, e2);
      }
      removeAll(t2) {
        const { children: e2 } = this;
        e2.length && (this.children = [], this.__preRemove(), this.__.__childBranchNumber = 0, e2.forEach((e3) => {
          this.__realRemoveChild(e3), t2 && e3.destroy();
        }));
      }
      clear() {
        this.removeAll(true);
      }
      __remove(t2, e2) {
        const s2 = this.children.indexOf(t2);
        s2 > -1 && (this.children.splice(s2, 1), t2.isBranch && (this.__.__childBranchNumber = (this.__.__childBranchNumber || 1) - 1), this.__preRemove(), this.__realRemoveChild(t2), e2 && t2.destroy());
      }
      __preRemove() {
        this.__hasMask && this.__updateMask(), this.__hasEraser && this.__updateEraser(), this.__layout.boxChange(), this.__layout.affectChildrenSort && this.__layout.childrenSortChange();
      }
      __realRemoveChild(t2) {
        t2.__emitLifeEvent(Zo.REMOVE), t2.parent = null, this.leafer && (t2.__bindLeafer(null), this.leafer.created && (this.__emitChildEvent(Zo.REMOVE, t2), this.leafer.hitCanvasManager && this.leafer.hitCanvasManager.clear())), t2.frame && !t2.isFrame && t2.__bindFrame(null);
      }
      __emitChildEvent(t2, e2) {
        const { leafer: s2 } = this;
        if (bo(s2) || s2.zoomLayer === this) {
          const i2 = new Zo(t2, e2, this);
          this.hasEvent(t2) && !this.isLeafer && this.emitEvent(i2), s2.emitEvent(i2);
        } else s2.watcher.addChild(e2, this, t2);
      }
    };
    Eh = me([no(Za)], Eh);
    Mh = class _Mh {
      get length() {
        return this.list.length;
      }
      constructor(t2) {
        this.reset(), t2 && (l(t2) ? this.addList(t2) : this.add(t2));
      }
      has(t2) {
        return t2 && !s(this.keys[t2.innerId]);
      }
      indexAt(t2) {
        return this.list[t2];
      }
      indexOf(t2) {
        const e2 = this.keys[t2.innerId];
        return s(e2) ? -1 : e2;
      }
      add(t2) {
        const { list: e2, keys: i2 } = this;
        s(i2[t2.innerId]) && (e2.push(t2), i2[t2.innerId] = e2.length - 1);
      }
      addAt(t2, e2 = 0) {
        const { keys: i2 } = this;
        if (s(i2[t2.innerId])) {
          const { list: s2 } = this;
          for (let t3 = e2, r3 = s2.length; t3 < r3; t3++) i2[s2[t3].innerId]++;
          0 === e2 ? s2.unshift(t2) : (e2 > s2.length && (e2 = s2.length), s2.splice(e2, 0, t2)), i2[t2.innerId] = e2;
        }
      }
      addList(t2) {
        for (let e2 = 0; e2 < t2.length; e2++) this.add(t2[e2]);
      }
      remove(t2) {
        const { list: e2 } = this;
        let i2;
        for (let r3 = 0, n3 = e2.length; r3 < n3; r3++) s(i2) ? e2[r3].innerId === t2.innerId && (i2 = r3, delete this.keys[t2.innerId]) : this.keys[e2[r3].innerId] = r3 - 1;
        s(i2) || e2.splice(i2, 1);
      }
      sort(t2) {
        const { list: e2 } = this;
        t2 ? e2.sort((t3, e3) => e3.__level - t3.__level) : e2.sort((t3, e3) => t3.__level - e3.__level);
      }
      forEach(t2) {
        this.list.forEach(t2);
      }
      clone() {
        const t2 = new _Mh();
        return t2.list = [...this.list], t2.keys = Object.assign({}, this.keys), t2;
      }
      update() {
        this.keys = {};
        const { list: t2, keys: e2 } = this;
        for (let s2 = 0, i2 = t2.length; s2 < i2; s2++) e2[t2[s2].innerId] = s2;
      }
      reset() {
        this.list = [], this.keys = {};
      }
      destroy() {
        this.reset();
      }
    };
    Ah = class {
      get length() {
        return this._length;
      }
      constructor(t2) {
        this._length = 0, this.reset(), t2 && (l(t2) ? this.addList(t2) : this.add(t2));
      }
      has(t2) {
        return !s(this.keys[t2.innerId]);
      }
      without(t2) {
        return s(this.keys[t2.innerId]);
      }
      sort(t2) {
        const { levels: e2 } = this;
        t2 ? e2.sort((t3, e3) => e3 - t3) : e2.sort((t3, e3) => t3 - e3);
      }
      addList(t2) {
        t2.forEach((t3) => {
          this.add(t3);
        });
      }
      add(t2) {
        const { keys: e2, levelMap: s2 } = this;
        e2[t2.innerId] || (e2[t2.innerId] = 1, s2[t2.__level] ? s2[t2.__level].push(t2) : (s2[t2.__level] = [t2], this.levels.push(t2.__level)), this._length++);
      }
      forEach(t2) {
        let e2;
        this.levels.forEach((s2) => {
          e2 = this.levelMap[s2];
          for (let s3 = 0, i2 = e2.length; s3 < i2; s3++) t2(e2[s3]);
        });
      }
      reset() {
        this.levelMap = {}, this.keys = {}, this.levels = [], this._length = 0;
      }
      destroy() {
        this.levelMap = null;
      }
    };
    Wh = "2.3.3";
    if ("undefined" != typeof globalThis) {
      const t2 = globalThis.Leafer || (globalThis.Leafer = {});
      t2.version = Wh, t2.Plugin = le;
    }
  }
});

// node_modules/.pnpm/@leafer-ui+draw@2.3.3/node_modules/@leafer-ui/draw/lib/draw.esm.min.js
function mt2(t2, e2, i2, s2) {
  var o2, r3 = arguments.length, a = r3 < 3 ? e2 : null === s2 ? s2 = Object.getOwnPropertyDescriptor(e2, i2) : s2;
  if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) a = Reflect.decorate(t2, e2, i2, s2);
  else for (var n3 = t2.length - 1; n3 >= 0; n3--) (o2 = t2[n3]) && (a = (r3 < 3 ? o2(a) : r3 > 3 ? o2(e2, i2, a) : o2(e2, i2)) || a);
  return r3 > 3 && a && Object.defineProperty(e2, i2, a), a;
}
function kt2(t2) {
  return yn(t2, (t3) => mn({ set(e2) {
    this.__setAttr(t3, e2), e2 && (this.__.__useEffect = true);
    const i2 = this.__layout;
    i2.renderChanged || i2.renderChange(), i2.surfaceChange();
  } }));
}
function Rt2(t2) {
  return yn(t2, (t3) => mn({ set(e2) {
    this.__setAttr(t3, e2), this.__layout.boxChanged || this.__layout.boxChange(), this.__updateSize();
  } }));
}
function At2() {
  return (e2, i2) => {
    const s2 = "_" + i2;
    pn(e2, i2, { set(t2) {
      this.isLeafer && (this[s2] = t2);
    }, get() {
      return this.isApp ? this.tree.zoomLayer : this.isLeafer ? this[s2] || this : this.leafer && this.leafer.zoomLayer;
    } });
  };
}
function Bt2() {
  return (e2, i2) => {
    pn(e2, i2, { set(t2) {
    }, get() {
      return this;
    } });
  };
}
function jt2(t2, e2, i2) {
  t2.__setInput(e2, i2), l(i2) ? (i2.some((t3) => false === t3.visible) && (i2 = i2.filter((t3) => false !== t3.visible)), i2.length || (i2 = void 0)) : i2 = i2 && false !== i2.visible ? [i2] : void 0, t2["_" + e2] = i2;
}
function ce2(t2, e2, i2) {
  const { fill: s2, stroke: o2, __drawAfterFill: r3, __fillAfterStroke: a } = t2.__;
  t2.__drawRenderPath(e2), a && It2.stroke(o2, t2, e2, i2), s2 && It2.fill(s2, t2, e2, i2), r3 && t2.__drawAfterFill(e2, i2), o2 && !a && It2.stroke(o2, t2, e2, i2);
}
var Ct2, Pt2, Ft2, Wt2, It2, Dt2, Et2, Tt2, Lt2, zt2, Mt2, Nt2, Ht2, Vt2, Yt2, Ut2, Xt2, Jt2, Gt2, $t2, qt2, Kt2, Qt2, Zt2, te2, ee2, ie2, se2, oe2, re2, ae2, ne2, _e2, he2, de2, le2, pe2, ue2, ge2, ye2, ve2, fe2, we2, xe2, Se2, me2, ke2, Re2, Ae2, Be2, be2, Ce2, Pe2, Fe2, We2, Ie2, De2, Ee2, Te2, Le2, ze2, Me2, Oe2, Ne2, He2, Ve2, Ye2, Ue2, Xe2, Je2, je2, Ge2, $e2, qe2, Ke2, Qe2, Ze2, ti2, ei2, ii2, si2, oi2, ri2, ai2, ni2, _i2, di2, li2, pi2, ui2, ci2, gi2, yi2, vi2;
var init_draw_esm_min = __esm({
  "node_modules/.pnpm/@leafer-ui+draw@2.3.3/node_modules/@leafer-ui/draw/lib/draw.esm.min.js"() {
    init_core_esm_min();
    init_core_esm_min();
    Ct2 = {};
    Pt2 = { hasTransparent: function(t2) {
      if (!t2 || 7 === t2.length || 4 === t2.length) return false;
      if ("transparent" === t2) return true;
      const e2 = t2[0];
      if ("#" === e2) switch (t2.length) {
        case 5:
          return "f" !== t2[4] && "F" !== t2[4];
        case 9:
          return "f" !== t2[7] && "F" !== t2[7] || "f" !== t2[8] && "F" !== t2[8];
      }
      else if (("r" === e2 || "h" === e2) && "a" === t2[3]) {
        const e3 = t2.lastIndexOf(",");
        if (e3 > -1) return parseFloat(t2.slice(e3 + 1)) < 1;
      }
      return false;
    } };
    Ft2 = Qt;
    Wt2 = {};
    It2 = {};
    Dt2 = {};
    Et2 = {};
    Tt2 = {};
    Lt2 = { apply() {
      le.need("filter");
    } };
    zt2 = {};
    Mt2 = { setStyleName: () => le.need("state"), set: () => le.need("state") };
    ({ parse: Nt2, objectToCanvasData: Ht2 } = ii);
    ({ stintSet: Vt2 } = _);
    ({ hasTransparent: Yt2 } = Pt2);
    Ut2 = { originPaint: {} };
    Xt2 = se.get("UIData");
    Jt2 = class extends f {
      get scale() {
        const { scaleX: t2, scaleY: e2 } = this;
        return t2 !== e2 ? { x: t2, y: e2 } : t2;
      }
      get __strokeWidth() {
        return this.__getRealStrokeWidth();
      }
      get __maxStrokeWidth() {
        const t2 = this, e2 = t2.__hasStrokeSides || t2.strokeWidth;
        return t2.__hasMultiStrokeStyle ? Math.max(t2.__hasMultiStrokeStyle, e2) : e2;
      }
      get __hasMultiPaint() {
        const t2 = this;
        return t2.fill && this.__useStroke || t2.__isFills && t2.fill.length > 1 || t2.__isStrokes && t2.stroke.length > 1 || t2.__useEffect;
      }
      get __clipAfterFill() {
        const t2 = this;
        return t2.cornerRadius || t2.innerShadow || t2.__pathInputed;
      }
      get __hasSurface() {
        return this.fill || this.stroke;
      }
      get __autoWidth() {
        return null == this._width;
      }
      get __autoHeight() {
        return null == this._height;
      }
      get __autoSide() {
        return null == this._width || null == this._height;
      }
      get __autoSize() {
        return null == this._width && null == this._height;
      }
      setVisible(t2) {
        this._visible = t2;
        const { leafer: e2 } = this.__leaf;
        e2 && (e2.watcher.hasVisible = true);
      }
      setWidth(t2) {
        t2 < 0 ? (this._width = -t2, this.__leaf.scaleX *= -1, Xt2.warn("width < 0, instead -scaleX ", this)) : this._width = t2;
      }
      setHeight(t2) {
        t2 < 0 ? (this._height = -t2, this.__leaf.scaleY *= -1, Xt2.warn("height < 0, instead -scaleY", this)) : this._height = t2;
      }
      setFill(t2) {
        this.__naturalWidth && this.__removeNaturalSize(), r(t2) || !t2 ? (Vt2(this, "__isTransparentFill", Yt2(t2)), this.__isFills && this.__removePaint("fill", true), this._fill = t2) : d(t2) && this.__setPaint("fill", t2);
      }
      setStroke(t2) {
        r(t2) || !t2 ? (Vt2(this, "__isTransparentStroke", Yt2(t2)), this.__isStrokes && this.__removePaint("stroke", true), this._stroke = t2) : d(t2) && this.__setPaint("stroke", t2);
      }
      setPath(t2) {
        const e2 = r(t2);
        e2 || t2 && d(t2[0]) ? (this.__setInput("path", t2), this._path = e2 ? Nt2(t2, this.__useArrow) : Ht2(t2)) : (this.__input && this.__removeInput("path"), this._path = t2);
      }
      setShadow(t2) {
        jt2(this, "shadow", t2);
      }
      setInnerShadow(t2) {
        jt2(this, "innerShadow", t2);
      }
      setFilter(t2) {
        jt2(this, "filter", t2);
      }
      __computePaint() {
        const { fill: t2, stroke: e2 } = this.__input;
        t2 && It2.compute("fill", this.__leaf), e2 && It2.compute("stroke", this.__leaf), this.__needComputePaint = void 0;
      }
      __getRealStrokeWidth(t2) {
        let { strokeWidth: e2, strokeScaleFixed: i2 } = this;
        if (t2 && (t2.strokeWidth && (e2 = t2.strokeWidth), s(t2.strokeScaleFixed) || (i2 = t2.strokeScaleFixed)), i2) {
          const { scaleX: t3 } = this.__leaf.getRenderScaleData(true, i2, false);
          if (1 !== t3) return e2 * t3;
        }
        return e2;
      }
      __checkComplex() {
        const t2 = this;
        Vt2(t2, "__complex", t2.__isFills || t2.__isStrokes || t2.cornerRadius || t2.__useEffect);
      }
      __setPaint(t2, e2) {
        this.__setInput(t2, e2);
        const i2 = this.__leaf.__layout;
        i2.boxChanged || i2.boxChange(), l(e2) && !e2.length ? this.__removePaint(t2) : "fill" === t2 ? (this.__isFills = true, this._fill || (this._fill = Ut2)) : (this.__isStrokes = true, this._stroke || (this._stroke = Ut2));
      }
      __removePaint(t2, e2) {
        e2 && this.__removeInput(t2), Dt2.recycleImage(t2, this), "fill" === t2 ? (Vt2(this, "__isAlphaPixelFill", void 0), this._fill = this.__isFills = void 0) : (Vt2(this, "__isAlphaPixelStroke", void 0), Vt2(this, "__hasMultiStrokeStyle", void 0), this._stroke = this.__isStrokes = void 0);
      }
    };
    Gt2 = class extends Jt2 {
    };
    $t2 = class extends Gt2 {
      get __boxStroke() {
        return !this.__pathInputed;
      }
      get __drawAfterFill() {
        return this.__single || this.__clipAfterFill;
      }
      get __clipAfterFill() {
        const t2 = this;
        return "show" !== t2.overflow && t2.__leaf.children.length && (t2.__leaf.isOverflow || super.__clipAfterFill);
      }
    };
    qt2 = class extends Gt2 {
      __getInputData(t2, e2) {
        const i2 = super.__getInputData(t2, e2);
        return Ie.forEach((t3) => delete i2[t3]), i2;
      }
    };
    Kt2 = class extends $t2 {
    };
    Qt2 = class extends Jt2 {
      get __usePathBox() {
        return this.points || this.__pathInputed;
      }
    };
    Zt2 = class extends Jt2 {
      get __boxStroke() {
        return !this.__pathInputed;
      }
    };
    te2 = class extends Jt2 {
      get __boxStroke() {
        return !this.__pathInputed;
      }
    };
    ee2 = class extends Jt2 {
      get __usePathBox() {
        return this.points || this.__pathInputed;
      }
    };
    ie2 = class extends Jt2 {
    };
    se2 = class extends Jt2 {
      get __pathInputed() {
        return 2;
      }
    };
    oe2 = class extends Gt2 {
    };
    re2 = { thin: 100, "extra-light": 200, light: 300, normal: 400, medium: 500, "semi-bold": 600, bold: 700, "extra-bold": 800, black: 900 };
    ae2 = class extends Jt2 {
      get __useNaturalRatio() {
        return false;
      }
      setFontWeight(t2) {
        r(t2) ? (this.__setInput("fontWeight", t2), t2 = re2[t2] || 400) : this.__input && this.__removeInput("fontWeight"), this._fontWeight = t2;
      }
      setBoxStyle(t2) {
        let e2 = this.__leaf, i2 = e2.__box;
        if (t2) {
          const { boxStyle: s2 } = this;
          if (i2) for (let t3 in s2) i2[t3] = void 0;
          else i2 = e2.__box = ue.get("Rect", 0);
          const o2 = e2.__layout, r3 = i2.__layout;
          s2 || (i2.parent = e2, i2.__world = e2.__world, r3.boxBounds = o2.boxBounds), i2.set(t2), r3.strokeChanged && o2.strokeChange();
        } else i2 && (e2.__box = i2.parent = null, i2.destroy());
        this._boxStyle = t2;
      }
      __getInputData(t2, e2) {
        const i2 = super.__getInputData(t2, e2);
        return i2.textEditing && delete i2.textEditing, i2;
      }
    };
    ne2 = class extends Zt2 {
      get __urlType() {
        return "image";
      }
      setUrl(t2) {
        this.__setImageFill(t2), this._url = t2;
      }
      __setImageFill(t2) {
        this.fill = t2 ? { type: this.__urlType, mode: "stretch", url: t2 } : void 0;
      }
      __getData() {
        const t2 = super.__getData();
        return t2.url && delete t2.fill, t2;
      }
      __getInputData(t2, e2) {
        const i2 = super.__getInputData(t2, e2);
        return i2.url && delete i2.fill, i2;
      }
    };
    _e2 = class extends Zt2 {
      get __isCanvas() {
        return true;
      }
      get __drawAfterFill() {
        return true;
      }
      __getInputData(t2, e2) {
        const i2 = super.__getInputData(t2, e2);
        return i2.url = this.__leaf.canvas.toDataURL("image/png"), i2;
      }
    };
    ({ max: he2, add: de2 } = B);
    le2 = { __updateStrokeSpread() {
      let t2 = 0, e2 = 0;
      const i2 = this.__, { strokeAlign: s2, __maxStrokeWidth: o2 } = i2, r3 = this.__box;
      if ((i2.stroke || "all" === i2.hitStroke) && o2 && "inside" !== s2 && (e2 = t2 = "center" === s2 ? o2 / 2 : o2, !i2.__boxStroke || i2.__useArrow)) {
        const e3 = i2.__isLinePath ? 0 : ("miter" === i2.strokeJoin ? 10 : 1) * t2, s3 = "none" === i2.strokeCap ? 0 : o2;
        t2 += Math.max(e3, s3);
      }
      return i2.__useArrow && (t2 += 5 * o2), r3 && (t2 = he2(t2, r3.__layout.strokeSpread = r3.__updateStrokeSpread()), e2 = Math.max(e2, r3.__layout.strokeBoxSpread)), this.__layout.strokeBoxSpread = e2, t2;
    }, __updateRenderSpread() {
      let t2 = 0;
      const { shadow: e2, innerShadow: i2, blur: s2, backgroundBlur: o2, filter: r3, renderSpread: a } = this.__, { strokeSpread: n3 } = this.__layout, _2 = this.__box;
      e2 && (t2 = Tt2.getShadowRenderSpread(this, e2)), s2 && (t2 = he2(t2, s2)), r3 && (t2 = de2(t2, Lt2.getSpread(r3))), a && (t2 = de2(t2, a)), n3 && (t2 = de2(t2, n3));
      let h = t2;
      return i2 && (h = he2(h, Tt2.getInnerShadowSpread(this, i2))), o2 && (h = he2(h, o2)), this.__layout.renderShapeSpread = h, _2 ? he2(_2.__updateRenderSpread(), t2) : t2;
    } };
    ({ stintSet: pe2 } = _);
    ue2 = { __updateChange() {
      const t2 = this.__;
      if (t2.__useStroke) {
        const e2 = t2.__useStroke = !(!t2.stroke || !t2.strokeWidth);
        pe2(this.__world, "half", e2 && "center" === t2.strokeAlign && t2.strokeWidth % 2), pe2(t2, "__fillAfterStroke", e2 && "outside" === t2.strokeAlign && t2.fill && !t2.__isTransparentFill);
      }
      if (t2.__useEffect) {
        const { shadow: e2, fill: i2, stroke: s2 } = t2, o2 = t2.innerShadow || t2.blur || t2.backgroundBlur || t2.filter;
        pe2(t2, "__isFastShadow", e2 && !o2 && e2.length < 2 && !e2[0].spread && !Tt2.isTransformShadow(e2[0]) && !(e2[0].blendMode && "pass-through" !== e2[0].blendMode) && i2 && !t2.__isTransparentFill && !(l(i2) && i2.length > 1) && (this.useFastShadow || !s2 || s2 && "inside" === t2.strokeAlign)), t2.__useEffect = !(!e2 && !o2);
      }
      t2.__checkSingle(), t2.__checkComplex();
    }, __drawFast(t2, e2) {
      ce2(this, t2, e2);
    }, __draw(t2, e2, i2) {
      const s2 = this.__;
      if (s2.__complex) {
        s2.__needComputePaint && s2.__computePaint();
        const { fill: o2, stroke: r3, __drawAfterFill: a, __fillAfterStroke: n3, __isFastShadow: _2 } = s2;
        if (this.__drawRenderPath(t2), s2.__useEffect && !_2) {
          const _3 = It2.shape(this, t2, e2);
          this.__nowWorld = this.__getNowWorld(e2);
          const { shadow: h, innerShadow: d2, filter: l2 } = s2;
          h && Tt2.shadow(this, t2, _3), n3 && (s2.__isStrokes ? It2.strokes(r3, this, t2, e2) : It2.stroke(r3, this, t2, e2)), o2 && (s2.__isFills ? It2.fills(o2, this, t2, e2) : It2.fill(o2, this, t2, e2)), a && this.__drawAfterFill(t2, e2), d2 && Tt2.innerShadow(this, t2, _3), r3 && !n3 && (s2.__isStrokes ? It2.strokes(r3, this, t2, e2) : It2.stroke(r3, this, t2, e2)), l2 && Lt2.apply(l2, this, this.__nowWorld, t2, i2, _3), _3.worldCanvas && _3.worldCanvas.recycle(), _3.canvas.recycle();
        } else {
          if (n3 && (s2.__isStrokes ? It2.strokes(r3, this, t2, e2) : It2.stroke(r3, this, t2, e2)), _2) {
            const e3 = s2.shadow[0], { scaleX: i3, scaleY: o3 } = this.getRenderScaleData(true, e3.scaleFixed);
            t2.save(), t2.setWorldShadow(e3.x * i3, e3.y * o3, e3.blur * i3, Pt2.string(e3.color));
          }
          o2 && (s2.__isFills ? It2.fills(o2, this, t2, e2) : It2.fill(o2, this, t2, e2)), _2 && t2.restore(), a && this.__drawAfterFill(t2, e2), r3 && !n3 && (s2.__isStrokes ? It2.strokes(r3, this, t2, e2) : It2.stroke(r3, this, t2, e2));
        }
      } else s2.__pathForRender ? ce2(this, t2, e2) : this.__drawFast(t2, e2);
    }, __drawShape(t2, e2) {
      this.__drawRenderPath(t2);
      const i2 = this.__, { fill: s2, stroke: o2 } = i2;
      s2 && !e2.ignoreFill && (i2.__isAlphaPixelFill ? It2.fills(s2, this, t2, e2) : It2.fill("#000000", this, t2, e2)), i2.__isCanvas && this.__drawAfterFill(t2, e2), o2 && !e2.ignoreStroke && (i2.__isAlphaPixelStroke ? It2.strokes(o2, this, t2, e2) : It2.stroke("#000000", this, t2, e2));
    }, __drawAfterFill(t2, e2) {
      this.__.__clipAfterFill ? (t2.save(), t2.clipUI(this), this.__drawContent(t2, e2), t2.restore()) : this.__drawContent(t2, e2);
    } };
    ge2 = { __drawFast(t2, e2) {
      let { x: i2, y: s2, width: o2, height: r3 } = this.__layout.boxBounds;
      const { fill: a, stroke: n3, __drawAfterFill: _2 } = this.__;
      if (a && (t2.fillStyle = a, t2.fillRect(i2, s2, o2, r3)), _2 && this.__drawAfterFill(t2, e2), n3) {
        const { strokeAlign: a2, __strokeWidth: _3 } = this.__;
        if (!_3) return;
        t2.setStroke(n3, _3, this.__);
        const h = _3 / 2;
        switch (a2) {
          case "center":
            t2.strokeRect(0, 0, o2, r3);
            break;
          case "inside":
            o2 -= _3, r3 -= _3, o2 < 0 || r3 < 0 ? (t2.save(), this.__clip(t2, e2), t2.strokeRect(i2 + h, s2 + h, o2, r3), t2.restore()) : t2.strokeRect(i2 + h, s2 + h, o2, r3);
            break;
          case "outside":
            t2.strokeRect(i2 - h, s2 - h, o2 + _3, r3 + _3);
        }
      }
    } };
    ve2 = ye2 = class extends Bh {
      get app() {
        return this.leafer && this.leafer.app;
      }
      set strokeWidthFixed(t2) {
        this.strokeScaleFixed = t2;
      }
      get strokeWidthFixed() {
        return this.strokeScaleFixed;
      }
      set scale(t2) {
        M.assignScale(this, t2);
      }
      get scale() {
        return this.__.scale;
      }
      get isAutoWidth() {
        const t2 = this.__;
        return t2.__autoWidth || t2.autoWidth;
      }
      get isAutoHeight() {
        const t2 = this.__;
        return t2.__autoHeight || t2.autoHeight;
      }
      get pen() {
        const { path: t2 } = this.__;
        return Qr.set(this.path = t2 || []), t2 || this.__drawPathByBox(Qr), Qr;
      }
      set(t2, e2) {
        t2 && Object.assign(this, t2);
      }
      get(t2) {
        return r(t2) ? this.__.__getInput(t2) : this.__.__getInputData(t2);
      }
      find(t2, e2) {
        return le.need("find");
      }
      findTag(t2) {
        return this.find({ tag: t2 });
      }
      findOne(t2, e2) {
        return le.need("find");
      }
      findId(t2) {
        return this.findOne({ id: t2 });
      }
      getPath(t2, e2) {
        this.__layout.update();
        let i2 = e2 ? this.__.__pathForRender : this.__.path;
        return i2 || (Qr.set(i2 = []), this.__drawPathByBox(Qr, "box", !e2)), t2 ? ii.toCanvasData(i2, true) : i2;
      }
      getPathString(t2, e2, i2) {
        return ii.stringify(this.getPath(t2, e2), i2);
      }
      asPath(t2, e2) {
        this.path = this.getPath(t2, e2);
      }
      load() {
        this.__.__computePaint();
      }
      __onUpdateSize() {
        if (this.__.__input) {
          const t2 = this.__;
          !t2.lazy || this.__inLazyBounds || zt2.running ? t2.__computePaint() : t2.__needComputePaint = true;
        }
      }
      __updatePath() {
      }
      __updateRenderPath(t2) {
        const e2 = this.__;
        e2.path ? (e2.__pathForRender = e2.cornerRadius || e2.path.radius ? Hr.smooth(e2.path, e2.cornerRadius, e2.cornerSmoothing) : e2.path, e2.__useArrow && Wt2.addArrows(this, t2)) : e2.__pathForRender && (e2.__pathForRender = void 0);
      }
      __drawRenderPath(t2) {
        const e2 = this.__;
        t2.beginPath(), e2.__useArrow && Wt2.updateArrow(this), this.__drawPathByData(t2, e2.__pathForRender);
      }
      __drawPath(t2) {
        const e2 = this.__;
        t2.beginPath(), e2.__usePointsMode ? ar.drawPathByPoints(t2, e2.points, e2.closed) : this.__drawPathByData(t2, e2.path, true);
      }
      __drawPathByData(t2, e2, i2) {
        e2 ? ar.drawPathByData(t2, e2) : this.__drawPathByBox(t2, "box", i2);
      }
      __drawPathByBox(t2, e2 = "box", i2) {
        const { x: s2, y: o2, width: r3, height: a } = this.__layout[e2 + "Bounds"];
        if (this.__.cornerRadius && !i2) {
          const { cornerRadius: e3 } = this.__;
          t2.roundRect(s2, o2, r3, a, o(e3) ? [e3] : e3);
        } else t2.rect(s2, o2, r3, a);
        t2.closePath();
      }
      drawImagePlaceholder(t2, e2, i2) {
        It2.fill(this.__.placeholderColor, this, e2, i2);
      }
      animate(t2, e2, i2, s2) {
        return this.set(t2), le.need("animate");
      }
      killAnimate(t2, e2) {
      }
      export(t2, e2) {
        return le.need("export");
      }
      syncExport(t2, e2) {
        return le.need("export");
      }
      clone(t2) {
        const e2 = _.clone(this.toJSON());
        return t2 && Object.assign(e2, t2), ye2.one(e2);
      }
      static one(t2, e2, i2, s2, o2) {
        return ue.get(t2.tag || this.prototype.__tag, t2, e2, i2, s2, o2);
      }
      static registerUI() {
        oo()(this);
      }
      static registerData(t2) {
        Jn(t2)(this.prototype);
      }
      static setEditConfig(t2) {
      }
      static setEditOuter(t2) {
      }
      static setEditInner(t2) {
      }
      destroy() {
        this.__.__willDestroy = true, this.fill = this.stroke = null, this.__animate && this.killAnimate(), super.destroy();
      }
    };
    mt2([Jn(Jt2)], ve2.prototype, "__", void 0), mt2([At2()], ve2.prototype, "zoomLayer", void 0), mt2([wn("")], ve2.prototype, "id", void 0), mt2([wn("")], ve2.prototype, "name", void 0), mt2([wn("")], ve2.prototype, "className", void 0), mt2([An("pass-through")], ve2.prototype, "blendMode", void 0), mt2([Dn(1)], ve2.prototype, "opacity", void 0), mt2([Yn(true)], ve2.prototype, "visible", void 0), mt2([An(false)], ve2.prototype, "locked", void 0), mt2([Nn(false)], ve2.prototype, "dim", void 0), mt2([Nn(false)], ve2.prototype, "dimskip", void 0), mt2([Un(0)], ve2.prototype, "zIndex", void 0), mt2([Vn(false)], ve2.prototype, "mask", void 0), mt2([Hn(false)], ve2.prototype, "eraser", void 0), mt2([bn(0, true)], ve2.prototype, "x", void 0), mt2([bn(0, true)], ve2.prototype, "y", void 0), mt2([On(100, true)], ve2.prototype, "width", void 0), mt2([On(100, true)], ve2.prototype, "height", void 0), mt2([Cn(1, true)], ve2.prototype, "scaleX", void 0), mt2([Cn(1, true)], ve2.prototype, "scaleY", void 0), mt2([kn(0, true)], ve2.prototype, "rotation", void 0), mt2([kn(0, true)], ve2.prototype, "skewX", void 0), mt2([kn(0, true)], ve2.prototype, "skewY", void 0), mt2([bn(0, true)], ve2.prototype, "offsetX", void 0), mt2([bn(0, true)], ve2.prototype, "offsetY", void 0), mt2([vn(0, true)], ve2.prototype, "scrollX", void 0), mt2([vn(0, true)], ve2.prototype, "scrollY", void 0), mt2([Bn()], ve2.prototype, "origin", void 0), mt2([Bn()], ve2.prototype, "around", void 0), mt2([wn(false)], ve2.prototype, "lazy", void 0), mt2([Tn(1)], ve2.prototype, "pixelRatio", void 0), mt2([Mn(0)], ve2.prototype, "renderSpread", void 0), mt2([Sn()], ve2.prototype, "path", void 0), mt2([Ln()], ve2.prototype, "windingRule", void 0), mt2([Ln(true)], ve2.prototype, "closed", void 0), mt2([On(0)], ve2.prototype, "padding", void 0), mt2([On(false)], ve2.prototype, "lockRatio", void 0), mt2([On()], ve2.prototype, "widthRange", void 0), mt2([On()], ve2.prototype, "heightRange", void 0), mt2([wn(false)], ve2.prototype, "draggable", void 0), mt2([wn()], ve2.prototype, "dragBounds", void 0), mt2([wn("auto")], ve2.prototype, "dragBoundsType", void 0), mt2([wn(false)], ve2.prototype, "editable", void 0), mt2([Gn(true)], ve2.prototype, "hittable", void 0), mt2([Gn()], ve2.prototype, "hitThrough", void 0), mt2([Gn("path")], ve2.prototype, "hitFill", void 0), mt2([En("path")], ve2.prototype, "hitStroke", void 0), mt2([Gn(false)], ve2.prototype, "hitBox", void 0), mt2([Gn(true)], ve2.prototype, "hitChildren", void 0), mt2([Gn(true)], ve2.prototype, "hitSelf", void 0), mt2([Gn()], ve2.prototype, "hitRadius", void 0), mt2([Qn("")], ve2.prototype, "cursor", void 0), mt2([An()], ve2.prototype, "fill", void 0), mt2([En(void 0, true)], ve2.prototype, "stroke", void 0), mt2([En("inside")], ve2.prototype, "strokeAlign", void 0), mt2([En(1, true)], ve2.prototype, "strokeWidth", void 0), mt2([En(false)], ve2.prototype, "strokeScaleFixed", void 0), mt2([En("none")], ve2.prototype, "strokeCap", void 0), mt2([En("miter")], ve2.prototype, "strokeJoin", void 0), mt2([En()], ve2.prototype, "dashPattern", void 0), mt2([En(0)], ve2.prototype, "dashOffset", void 0), mt2([En(10)], ve2.prototype, "miterLimit", void 0), mt2([Ln(0)], ve2.prototype, "cornerRadius", void 0), mt2([Ln()], ve2.prototype, "cornerSmoothing", void 0), mt2([kt2()], ve2.prototype, "shadow", void 0), mt2([kt2()], ve2.prototype, "innerShadow", void 0), mt2([kt2()], ve2.prototype, "blur", void 0), mt2([kt2()], ve2.prototype, "backgroundBlur", void 0), mt2([kt2()], ve2.prototype, "grayscale", void 0), mt2([kt2()], ve2.prototype, "filter", void 0), mt2([An()], ve2.prototype, "placeholderColor", void 0), mt2([wn(100)], ve2.prototype, "placeholderDelay", void 0), mt2([wn({})], ve2.prototype, "data", void 0), ve2 = ye2 = mt2([no(le2), no(ue2), io()], ve2);
    fe2 = class extends ve2 {
      get __tag() {
        return "Group";
      }
      get isBranch() {
        return true;
      }
      reset(t2) {
        this.__setBranch(), super.reset(t2);
      }
      __setBranch() {
        this.children || (this.children = []);
      }
      set(t2, e2) {
        if (t2) if (t2.children) {
          const { children: i2 } = t2;
          delete t2.children, this.children ? this.clear() : this.__setBranch(), super.set(t2, e2), i2.forEach((t3) => this.add(t3)), t2.children = i2;
        } else super.set(t2, e2);
      }
      toJSON(t2) {
        const e2 = super.toJSON(t2);
        if (!this.childlessJSON) {
          const i2 = e2.children = [];
          this.children.forEach((e3) => e3.skipJSON || i2.push(e3.toJSON(t2)));
        }
        return e2;
      }
      addAt(t2, e2) {
        this.add(t2, e2);
      }
      addAfter(t2, e2) {
        this.add(t2, this.children.indexOf(e2) + 1);
      }
      addBefore(t2, e2) {
        this.add(t2, this.children.indexOf(e2));
      }
    };
    mt2([Jn(Gt2)], fe2.prototype, "__", void 0), mt2([On(0)], fe2.prototype, "width", void 0), mt2([On(0)], fe2.prototype, "height", void 0), fe2 = mt2([no(Eh), oo()], fe2);
    xe2 = se.get("Leafer");
    Se2 = we2 = class extends fe2 {
      get __tag() {
        return "Leafer";
      }
      get isApp() {
        return false;
      }
      get app() {
        return this.parent || this;
      }
      get isLeafer() {
        return true;
      }
      get imageReady() {
        return this.viewReady && nn.isComplete;
      }
      get layoutLocked() {
        return !this.layouter.running;
      }
      get view() {
        return this.canvas && this.canvas.view;
      }
      get FPS() {
        return this.renderer ? this.renderer.FPS : 60;
      }
      get cursorPoint() {
        return this.interaction && this.interaction.hoverData || { x: this.width / 2, y: this.height / 2 };
      }
      get clientBounds() {
        return this.canvas && this.canvas.getClientBounds(true) || X();
      }
      constructor(t2, e2) {
        super(e2), this.config = { start: true, hittable: true, smooth: true, trackChanges: true, lazySpeard: 100 }, this.leafs = 0, this.__eventIds = [], this.__controllers = [], this.__readyWait = [], this.__viewReadyWait = [], this.__viewCompletedWait = [], this.__nextRenderWait = [], this.userConfig = t2, t2 && (t2.view || t2.width) && this.init(t2), we2.list.add(this);
      }
      init(t2, e2) {
        if (this.canvas) return;
        let i2;
        const { config: s2 } = this;
        this.__setLeafer(this), e2 && (this.parentApp = e2, this.__bindApp(e2), i2 = e2.running), t2 && (this.parent = e2, this.initType(t2.type), this.parent = void 0, _.assign(s2, t2));
        const o2 = this.canvas = de.canvas(s2);
        this.__controllers.push(this.renderer = de.renderer(this, o2, s2), this.watcher = de.watcher(this, s2), this.layouter = de.layouter(this, s2)), this.isApp && this.__setApp(), this.__checkAutoLayout(), e2 || (this.selector = de.selector(this), this.interaction = de.interaction(this, o2, this.selector, s2), this.interaction && (this.__controllers.unshift(this.interaction), this.hitCanvasManager = de.hitCanvasManager()), this.canvasManager = new ye(), i2 = s2.start), this.hittable = s2.hittable, this.fill = s2.fill, this.canvasManager.add(o2), this.__listenEvents(), i2 && (this.__startTimer = setTimeout(this.start.bind(this))), Yo.run(this.__initWait), this.onInit();
      }
      onInit() {
      }
      initType(t2) {
      }
      set(t2, e2) {
        this.waitInit(() => {
          super.set(t2, e2);
        });
      }
      start() {
        clearTimeout(this.__startTimer), !this.running && this.canvas && (this.running = true, this.ready ? this.emitLeafer(ua.RESTART) : this.emitLeafer(ua.START), this.__controllers.forEach((t2) => t2.start()), this.isApp || this.renderer.render());
      }
      stop() {
        clearTimeout(this.__startTimer), this.running && this.canvas && (this.__controllers.forEach((t2) => t2.stop()), this.running = false, this.emitLeafer(ua.STOP));
      }
      unlockLayout(t2 = true) {
        this.layouter.start(), t2 && this.updateLayout();
      }
      lockLayout(t2 = true) {
        t2 && this.updateLayout(), this.layouter.stop();
      }
      resize(t2) {
        const e2 = _.copyAttrs({}, t2, Ie);
        Object.keys(e2).forEach((t3) => this[t3] = e2[t3]);
      }
      forceRender(t2, e2) {
        const { renderer: i2 } = this;
        i2 && (i2.addBlock(t2 ? new qt(t2) : this.canvas.bounds), this.viewReady && (e2 ? i2.render() : i2.update()));
      }
      requestRender(t2 = false) {
        this.renderer && this.renderer.update(t2);
      }
      updateCursor(t2) {
        const e2 = this.interaction;
        e2 && (t2 ? e2.setCursor(t2) : e2.updateCursor());
      }
      updateLazyBounds() {
        this.lazyBounds = this.canvas.bounds.clone().spread(this.config.lazySpeard);
      }
      __doResize(t2) {
        const { canvas: e2 } = this;
        if (!e2 || e2.isSameSize(t2)) return;
        const i2 = _.copyAttrs({}, this.canvas, Ie);
        e2.resize(t2), this.updateLazyBounds(), this.__onResize(new ha(t2, i2));
      }
      __onResize(t2) {
        this.emitEvent(t2), _.copyAttrs(this.__, t2, Ie), setTimeout(() => {
          this.canvasManager && this.canvasManager.clearRecycled();
        }, 0);
      }
      __setApp() {
      }
      __bindApp(t2) {
        this.selector = t2.selector, this.interaction = t2.interaction, this.canvasManager = t2.canvasManager, this.hitCanvasManager = t2.hitCanvasManager;
      }
      __setLeafer(t2) {
        this.leafer = t2, this.__level = 1;
      }
      __checkAutoLayout() {
        const { config: t2, parentApp: e2 } = this;
        e2 || (t2.width && t2.height || (this.autoLayout = new Gt(t2)), this.canvas.startAutoLayout(this.autoLayout, this.__onResize.bind(this)));
      }
      __setAttr(t2, e2) {
        return this.canvas && (Ie.includes(t2) ? this.__changeCanvasSize(t2, e2) : "fill" === t2 ? this.__changeFill(e2) : "hittable" === t2 ? this.parent || (this.canvas.hittable = e2) : "zIndex" === t2 ? (this.canvas.zIndex = e2, setTimeout(() => this.parent && this.parent.__updateSortChildren())) : "mode" === t2 && this.emit(ua.UPDATE_MODE, { mode: e2 })), super.__setAttr(t2, e2);
      }
      __getAttr(t2) {
        return this.canvas && Ie.includes(t2) ? this.canvas[t2] : super.__getAttr(t2);
      }
      __changeCanvasSize(t2, e2) {
        const { config: i2, canvas: s2 } = this, o2 = _.copyAttrs({}, s2, Ie);
        o2[t2] = i2[t2] = e2, i2.width && i2.height ? s2.stopAutoLayout() : this.__checkAutoLayout(), this.__doResize(o2);
      }
      __changeFill(t2) {
        this.config.fill = t2, this.canvas.allowBackgroundColor ? this.canvas.backgroundColor = t2 : this.forceRender();
      }
      __onCreated() {
        this.created = true;
      }
      __onReady() {
        this.ready = true, this.emitLeafer(ua.BEFORE_READY), this.emitLeafer(ua.READY), this.emitLeafer(ua.AFTER_READY), Yo.run(this.__readyWait);
      }
      __onViewReady() {
        this.viewReady || (this.viewReady = true, this.emitLeafer(ua.VIEW_READY), Yo.run(this.__viewReadyWait));
      }
      __onLayoutEnd() {
        const { grow: t2, width: e2, height: i2 } = this.config;
        if (t2) {
          let { width: s2, height: o2, pixelRatio: r3 } = this;
          const a = "box" === t2 ? this.worldBoxBounds : this.__world;
          e2 || (s2 = Math.max(1, a.x + a.width)), i2 || (o2 = Math.max(1, a.y + a.height)), this.__doResize({ width: s2, height: o2, pixelRatio: r3 });
        }
        this.ready || this.__onReady();
      }
      __onNextRender() {
        if (this.viewReady) {
          Yo.run(this.__nextRenderWait);
          const { imageReady: t2 } = this;
          t2 && !this.viewCompleted && this.__checkViewCompleted(), t2 || (this.viewCompleted = false, this.requestRender());
        } else this.requestRender();
      }
      __checkViewCompleted(t2 = true) {
        this.nextRender(() => {
          this.imageReady && (t2 && this.emitLeafer(ua.VIEW_COMPLETED), Yo.run(this.__viewCompletedWait), this.viewCompleted = true);
        });
      }
      __onWatchData() {
        this.watcher.childrenChanged && this.interaction && this.nextRender(() => this.interaction.updateCursor());
      }
      waitInit(t2, e2) {
        e2 && (t2 = t2.bind(e2)), this.__initWait || (this.__initWait = []), this.canvas ? t2() : this.__initWait.push(t2);
      }
      waitReady(t2, e2) {
        e2 && (t2 = t2.bind(e2)), this.ready ? t2() : this.__readyWait.push(t2);
      }
      waitViewReady(t2, e2) {
        e2 && (t2 = t2.bind(e2)), this.viewReady ? t2() : this.__viewReadyWait.push(t2);
      }
      waitViewCompleted(t2, e2) {
        e2 && (t2 = t2.bind(e2)), this.__viewCompletedWait.push(t2), this.viewCompleted ? this.__checkViewCompleted(false) : this.running || this.start();
      }
      nextRender(t2, e2, i2) {
        e2 && (t2 = t2.bind(e2));
        const s2 = this.__nextRenderWait;
        if (i2) {
          for (let e3 = 0; e3 < s2.length; e3++) if (s2[e3] === t2) {
            s2.splice(e3, 1);
            break;
          }
        } else s2.push(t2);
        this.requestRender();
      }
      zoom(t2, e2, i2, s2) {
        return le.need("view");
      }
      getValidMove(t2, e2, i2) {
        return { x: t2, y: e2 };
      }
      getValidScale(t2) {
        return t2;
      }
      getWorldPointByClient(t2, e2) {
        return this.interaction && this.interaction.getLocal(t2, e2);
      }
      getPagePointByClient(t2, e2) {
        return this.getPagePoint(this.getWorldPointByClient(t2, e2));
      }
      getClientPointByWorld(t2) {
        const { x: e2, y: i2 } = this.clientBounds;
        return { x: e2 + t2.x, y: i2 + t2.y };
      }
      updateClientBounds() {
        this.canvas && this.canvas.updateClientBounds();
      }
      receiveEvent(t2) {
      }
      emitLeafer(t2) {
        this.emitEvent(new ua(t2, this));
      }
      __listenEvents() {
        const t2 = oe.start("FirstCreate " + this.innerName);
        this.once([[ua.START, () => oe.end(t2)], [da.START, this.updateLazyBounds, this], [ca.START, this.__onCreated, this], [ca.END, this.__onViewReady, this]]), this.__eventIds.push(this.on_([[la.DATA, this.__onWatchData, this], [da.END, this.__onLayoutEnd, this], [ca.NEXT, this.__onNextRender, this]]));
      }
      __removeListenEvents() {
        this.off_(this.__eventIds);
      }
      destroy(t2) {
        const e2 = () => {
          if (!this.destroyed) {
            we2.list.remove(this);
            try {
              this.stop(), this.emitLeafer(ua.END), this.__removeListenEvents(), this.__controllers.forEach((t3) => !(this.parent && t3 === this.interaction) && t3.destroy()), this.__controllers.length = 0, this.parent || (this.selector && this.selector.destroy(), this.hitCanvasManager && this.hitCanvasManager.destroy(), this.canvasManager && this.canvasManager.destroy()), this.canvas && this.canvas.destroy(), this.config.view = this.parentApp = null, this.userConfig && (this.userConfig.view = null), super.destroy(), setTimeout(() => {
                an.clearRecycled();
              }, 100);
            } catch (t3) {
              xe2.error(t3);
            }
          }
        };
        t2 ? e2() : setTimeout(e2);
      }
    };
    Se2.list = new Mh(), mt2([Jn(qt2)], Se2.prototype, "__", void 0), mt2([On()], Se2.prototype, "pixelRatio", void 0), mt2([wn("normal")], Se2.prototype, "mode", void 0), Se2 = we2 = mt2([oo()], Se2);
    me2 = class extends ve2 {
      get __tag() {
        return "Rect";
      }
    };
    mt2([Jn(Zt2)], me2.prototype, "__", void 0), me2 = mt2([no(ge2), io(), oo()], me2);
    ({ add: ke2, includes: Re2, scroll: Ae2 } = Ft);
    Be2 = me2.prototype;
    be2 = fe2.prototype;
    Ce2 = class extends fe2 {
      get __tag() {
        return "Box";
      }
      get isBranchLeaf() {
        return true;
      }
      get __useSelfBox() {
        return this.pathInputed;
      }
      constructor(t2) {
        super(t2), this.__layout.renderChanged || this.__layout.renderChange();
      }
      __updateStrokeSpread() {
        return 0;
      }
      __updateRectRenderSpread() {
        return 0;
      }
      __updateRenderSpread() {
        return this.__updateRectRenderSpread() || -1;
      }
      __updateRectBoxBounds() {
      }
      __updateBoxBounds(t2) {
        if (this.children.length && !this.__useSelfBox) {
          const t3 = this.__;
          if (t3.__autoSide) {
            t3.__hasSurface && this.__extraUpdate(), super.__updateBoxBounds();
            const { boxBounds: e2 } = this.__layout;
            t3.__autoSize || (t3.__autoWidth ? (e2.width += e2.x, e2.x = 0, e2.height = t3.height, e2.y = 0) : (e2.height += e2.y, e2.y = 0, e2.width = t3.width, e2.x = 0)), this.__updateNaturalSize();
          } else this.__updateRectBoxBounds();
        } else this.__updateRectBoxBounds();
      }
      __updateStrokeBounds() {
      }
      __updateRenderBounds() {
        let t2, e2;
        if (this.children.length) {
          const i2 = this.__, s2 = this.__layout, { renderBounds: o2, boxBounds: r3 } = s2, { overflow: a } = i2, n3 = s2.childrenRenderBounds || (s2.childrenRenderBounds = X());
          super.__updateRenderBounds(n3), (e2 = a && a.includes("scroll")) && (ke2(n3, r3), Ae2(n3, i2)), this.__updateRectRenderBounds(), t2 = !Re2(r3, n3), t2 && "show" === a && ke2(o2, n3);
        } else this.__updateRectRenderBounds();
        _.stintSet(this, "isOverflow", t2), this.__checkScroll(e2);
      }
      __updateRectRenderBounds() {
      }
      __checkScroll(t2) {
      }
      __updateRectChange() {
      }
      __updateChange() {
        super.__updateChange(), this.__updateRectChange();
      }
      __renderRect(t2, e2) {
      }
      __renderGroup(t2, e2) {
      }
      __render(t2, e2) {
        this.__.__drawAfterFill ? this.__renderRect(t2, e2) : (this.__renderRect(t2, e2), this.children.length && this.__renderGroup(t2, e2)), this.hasScroller && this.scroller.__render(t2, e2);
      }
      __drawContent(t2, e2) {
        this.__renderGroup(t2, e2), (this.__.__useStroke || this.__.__useEffect) && (t2.setWorld(this.__nowWorld), this.__drawRenderPath(t2));
      }
    };
    mt2([Jn($t2)], Ce2.prototype, "__", void 0), mt2([On(100)], Ce2.prototype, "width", void 0), mt2([On(100)], Ce2.prototype, "height", void 0), mt2([wn(false)], Ce2.prototype, "resizeChildren", void 0), mt2([Mn("show")], Ce2.prototype, "overflow", void 0), mt2([so(Be2.__updateStrokeSpread)], Ce2.prototype, "__updateStrokeSpread", null), mt2([so(Be2.__updateRenderSpread)], Ce2.prototype, "__updateRectRenderSpread", null), mt2([so(Be2.__updateBoxBounds)], Ce2.prototype, "__updateRectBoxBounds", null), mt2([so(Be2.__updateStrokeBounds)], Ce2.prototype, "__updateStrokeBounds", null), mt2([so(Be2.__updateRenderBounds)], Ce2.prototype, "__updateRectRenderBounds", null), mt2([so(Be2.__updateChange)], Ce2.prototype, "__updateRectChange", null), mt2([so(Be2.__render)], Ce2.prototype, "__renderRect", null), mt2([so(be2.__render)], Ce2.prototype, "__renderGroup", null), Ce2 = mt2([io(), oo()], Ce2);
    Pe2 = class extends Ce2 {
      get __tag() {
        return "Frame";
      }
      get isFrame() {
        return true;
      }
    };
    mt2([Bt2()], Pe2.prototype, "frame", void 0), mt2([Jn(Kt2)], Pe2.prototype, "__", void 0), mt2([An("#FFFFFF")], Pe2.prototype, "fill", void 0), mt2([Mn("hide")], Pe2.prototype, "overflow", void 0), Pe2 = mt2([oo()], Pe2);
    ({ moveTo: Fe2, closePath: We2, ellipse: Ie2 } = Ti);
    ({ tempPoint: De2, set: Ee2, rotate: Te2 } = at);
    ({ abs: Le2 } = Math);
    ze2 = {};
    Me2 = class extends ve2 {
      get __tag() {
        return "Ellipse";
      }
      __updatePath() {
        const t2 = this.__, { width: e2, height: i2, innerRadius: s2, startAngle: o2, endAngle: r3, closed: a } = t2, n3 = e2 / 2, _2 = i2 / 2, h = t2.path = [];
        let d2, l2, p2;
        if ((o2 || r3) && (l2 = true), l2 && (p2 = 360 === Le2(r3 - o2)), s2) {
          const t3 = s2 < 1 || a, e3 = n3 * s2, i3 = _2 * s2;
          l2 ? (Ie2(h, n3, _2, n3, _2, 0, o2, r3), t3 ? (p2 && (We2(h), Ee2(De2, n3 + e3, _2), Ee2(ze2, n3, _2), Te2(De2, r3, ze2, n3, _2), Fe2(h, De2.x, De2.y)), Ie2(h, n3, _2, e3, i3, 0, r3, o2, true)) : p2 || (d2 = true)) : (Ie2(h, n3, _2, n3, _2), t3 && (We2(h), Fe2(h, n3 + e3, _2), Ie2(h, n3, _2, e3, i3, 0, 360, 0, true)));
        } else l2 ? (p2 || (a || (d2 = true), d2 || Fe2(h, n3, _2)), Ie2(h, n3, _2, n3, _2, 0, o2, r3)) : Ie2(h, n3, _2, n3, _2);
        d2 || We2(h), (Kt.ellipseToCurve || t2.__useArrow || t2.cornerRadius) && (t2.path = this.getPath(true));
      }
    };
    mt2([Jn(te2)], Me2.prototype, "__", void 0), mt2([Ln(0)], Me2.prototype, "innerRadius", void 0), mt2([Ln(0)], Me2.prototype, "startAngle", void 0), mt2([Ln(0)], Me2.prototype, "endAngle", void 0), Me2 = mt2([oo()], Me2);
    ({ sin: Oe2, cos: Ne2, PI: He2 } = Math);
    ({ moveTo: Ve2, lineTo: Ye2, closePath: Ue2, drawPoints: Xe2 } = Ti);
    Je2 = class extends ve2 {
      get __tag() {
        return "Polygon";
      }
      get isPointsMode() {
        return this.points && !this.pathInputed;
      }
      __updatePath() {
        const t2 = this.__, e2 = t2.path = [];
        if (t2.points) Xe2(e2, t2.points, t2.curve, t2.closed, t2);
        else {
          const { width: i2, height: s2, sides: o2, startAngle: r3 } = t2, a = i2 / 2, n3 = s2 / 2;
          let _2, h = 0;
          r3 ? (h = r3 * W, Ve2(e2, a + a * Oe2(h), n3 - n3 * Ne2(h))) : Ve2(e2, a, 0);
          for (let t3 = 1; t3 < o2; t3++) _2 = 2 * t3 * He2 / o2 + h, Ye2(e2, a + a * Oe2(_2), n3 - n3 * Ne2(_2));
          Ue2(e2);
        }
      }
    };
    mt2([Jn(ee2)], Je2.prototype, "__", void 0), mt2([Ln(3)], Je2.prototype, "sides", void 0), mt2([Ln(0)], Je2.prototype, "startAngle", void 0), mt2([Ln()], Je2.prototype, "points", void 0), mt2([Ln(0)], Je2.prototype, "curve", void 0), Je2 = mt2([io(), oo()], Je2);
    ({ sin: je2, cos: Ge2, PI: $e2 } = Math);
    ({ moveTo: qe2, lineTo: Ke2, closePath: Qe2 } = Ti);
    Ze2 = class extends ve2 {
      get __tag() {
        return "Star";
      }
      __updatePath() {
        const { width: t2, height: e2, corners: i2, innerRadius: s2, startAngle: o2 } = this.__, r3 = t2 / 2, a = e2 / 2, n3 = this.__.path = [];
        let _2, h = 0;
        o2 ? (h = o2 * W, qe2(n3, r3 + r3 * je2(h), a - a * Ge2(h))) : qe2(n3, r3, 0);
        for (let t3 = 1; t3 < 2 * i2; t3++) _2 = t3 * $e2 / i2 + h, Ke2(n3, r3 + (t3 % 2 == 0 ? r3 : r3 * s2) * je2(_2), a - (t3 % 2 == 0 ? a : a * s2) * Ge2(_2));
        Qe2(n3);
      }
    };
    mt2([Jn(ie2)], Ze2.prototype, "__", void 0), mt2([Ln(5)], Ze2.prototype, "corners", void 0), mt2([Ln(0.382)], Ze2.prototype, "innerRadius", void 0), mt2([Ln(0)], Ze2.prototype, "startAngle", void 0), Ze2 = mt2([oo()], Ze2);
    ({ moveTo: ti2, lineTo: ei2, drawPoints: ii2 } = Ti);
    ({ rotate: si2, getAngle: oi2, getDistance: ri2, defaultPoint: ai2 } = at);
    ni2 = class extends ve2 {
      get __tag() {
        return "Line";
      }
      get isPointsMode() {
        return this.points && !this.pathInputed;
      }
      get toPoint() {
        const { width: t2, rotation: e2 } = this.__, i2 = Y();
        return t2 && (i2.x = t2), e2 && si2(i2, e2), i2;
      }
      set toPoint(t2) {
        this.width = ri2(ai2, t2), this.rotation = oi2(ai2, t2), this.height && (this.height = 0);
      }
      __updatePath() {
        const t2 = this.__, e2 = t2.path = [];
        t2.points ? ii2(e2, t2.points, t2.curve, t2.closed, t2) : (ti2(e2, 0, 0), ei2(e2, this.width, 0));
      }
    };
    mt2([Jn(Qt2)], ni2.prototype, "__", void 0), mt2([Rn("center")], ni2.prototype, "strokeAlign", void 0), mt2([On(0)], ni2.prototype, "height", void 0), mt2([Ln()], ni2.prototype, "points", void 0), mt2([Ln(0)], ni2.prototype, "curve", void 0), mt2([Ln(false)], ni2.prototype, "closed", void 0), ni2 = mt2([oo()], ni2);
    _i2 = class extends me2 {
      get __tag() {
        return "Image";
      }
      get ready() {
        const { image: t2 } = this;
        return t2 && t2.ready;
      }
      get image() {
        const { fill: t2 } = this.__;
        return l(t2) && t2[0].image;
      }
    };
    mt2([Jn(ne2)], _i2.prototype, "__", void 0), mt2([On("")], _i2.prototype, "url", void 0), _i2 = mt2([oo()], _i2);
    di2 = class extends me2 {
      get __tag() {
        return "Canvas";
      }
      get context() {
        return this.canvas.context;
      }
      get ready() {
        return !this.url;
      }
      constructor(t2) {
        super(t2), this.canvas = de.canvas(this.__), t2 && t2.url && this.drawImage(t2.url);
      }
      drawImage(t2) {
        new cn({ url: t2 }).load((t3) => {
          this.context.drawImage(t3.view, 0, 0), this.url = void 0, this.paint(), this.emitEvent(new ea(ea.LOADED, { image: t3 }));
        });
      }
      draw(t2, e2, i2, s2) {
        const o2 = new ft(t2.worldTransform).invert(), r3 = new ft();
        e2 && r3.translate(e2.x, e2.y), i2 && (o(i2) ? r3.scale(i2) : r3.scale(i2.x, i2.y)), s2 && r3.rotate(s2), o2.multiplyParent(r3), t2.__render(this.canvas, { matrix: o2.withScale() }), this.paint();
      }
      paint() {
        this.forceRender();
      }
      __drawContent(t2, e2) {
        const { width: i2, height: s2 } = this.__, { view: o2 } = this.canvas;
        t2.drawImage(o2, 0, 0, o2.width, o2.height, 0, 0, i2, s2);
      }
      __updateSize() {
        const { canvas: t2 } = this;
        if (t2) {
          const { smooth: e2, safeResize: i2 } = this.__;
          t2.resize(this.__, i2), t2.smooth !== e2 && (t2.smooth = e2);
        }
      }
      destroy() {
        this.canvas && (this.canvas.destroy(), this.canvas = null), super.destroy();
      }
    };
    mt2([Jn(_e2)], di2.prototype, "__", void 0), mt2([Rt2(100)], di2.prototype, "width", void 0), mt2([Rt2(100)], di2.prototype, "height", void 0), mt2([Rt2(1)], di2.prototype, "pixelRatio", void 0), mt2([Rt2(true)], di2.prototype, "smooth", void 0), mt2([wn(false)], di2.prototype, "safeResize", void 0), mt2([Rt2()], di2.prototype, "contextSettings", void 0), di2 = mt2([oo()], di2);
    ({ copyAndSpread: li2, includes: pi2, setList: ui2 } = Ft);
    ({ stintSet: ci2 } = _);
    gi2 = class extends ve2 {
      get __tag() {
        return "Text";
      }
      get textDrawData() {
        return this.updateLayout(), this.__.__textDrawData;
      }
      __updateTextDrawData() {
        const t2 = this.__, { lineHeight: e2, letterSpacing: i2, wordSpacing: s2, fontFamily: o2, fontSize: r3, fontWeight: a, italic: n3, textCase: _2, textOverflow: h, padding: d2, width: l2, height: p2 } = t2;
        t2.__lineHeight = Ft2.number(e2, r3), t2.__letterSpacing = Ft2.number(i2, r3), t2.__wordSpacing = Ft2.number(s2, r3), t2.__baseLine = t2.__lineHeight - (t2.__lineHeight - 0.7 * r3) / 2, t2.__font = `${n3 ? "italic " : ""}${"small-caps" === _2 ? "small-caps " : ""}${"normal" !== a ? a + " " : ""}${r3 || 12}px ${o2 || "caption"}`, ci2(t2, "__padding", d2 && M.fourNumber(d2)), ci2(t2, "__clipText", "show" !== h && !t2.__autoSize), ci2(t2, "__isCharMode", l2 || p2 || t2.__letterSpacing || t2.__wordSpacing || t2.motionText || "none" !== _2), t2.__textDrawData = Ct2.getDrawData((t2.__isPlacehold = t2.placeholder && "" === t2.text) ? t2.placeholder : t2.text, this.__);
      }
      __updateBoxBounds() {
        const t2 = this.__, e2 = this.__layout, { fontSize: i2, italic: s2, padding: o2, __autoWidth: r3, __autoHeight: a } = t2;
        this.__updateTextDrawData();
        const { bounds: _2 } = t2.__textDrawData, h = e2.boxBounds;
        if (e2.contentBounds = _2, t2.__lineHeight < i2 && (e2.renderChanged = true), r3 || a) {
          if (h.x = r3 ? _2.x : 0, h.y = a ? _2.y : 0, h.width = r3 ? _2.width : t2.width, h.height = a ? _2.height : t2.height, o2) {
            const [e3, i3, s3, o3] = t2.__padding;
            r3 && (h.x -= o3, h.width += i3 + o3), a && (h.y -= e3, h.height += s3 + e3);
          }
          this.__updateNaturalSize();
        } else super.__updateBoxBounds();
        s2 && (h.width += 0.16 * i2), _.stintSet(this, "isOverflow", !pi2(h, _2) && !t2.motionText), this.isOverflow ? (ui2(t2.__textBoxBounds = {}, [h, _2]), e2.renderChanged = true) : t2.__textBoxBounds = h;
      }
      __updateRenderSpread() {
        let t2 = super.__updateRenderSpread();
        t2 || (t2 = this.isOverflow ? 1 : 0);
        const { __lineHeight: e2, fontSize: i2 } = this.__;
        return e2 < i2 && (t2 = B.max(t2, (i2 - e2) / 2)), t2;
      }
      __updateRenderBounds() {
        const { renderBounds: t2, renderSpread: e2 } = this.__layout;
        li2(t2, this.__.__textBoxBounds, e2), this.__box && (this.__box.__layout.renderBounds = t2);
      }
      __updateChange() {
        super.__updateChange();
        const t2 = this.__box;
        t2 && (t2.__onUpdateSize(), t2.__updateChange());
      }
      __drawRenderPath(t2) {
        t2.font = this.__.__font;
      }
      __draw(t2, e2, i2) {
        const s2 = this.__box;
        s2 && (s2.__nowWorld = this.__nowWorld, s2.__draw(t2, e2, i2)), this.textEditing && !e2.exporting || super.__draw(t2, e2, i2);
      }
      __drawShape(t2, e2) {
        e2.shape && this.__box && this.__box.__drawShape(t2, e2), super.__drawShape(t2, e2);
      }
      destroy() {
        this.boxStyle && (this.boxStyle = null), super.destroy();
      }
    };
    mt2([Jn(ae2)], gi2.prototype, "__", void 0), mt2([On(0)], gi2.prototype, "width", void 0), mt2([On(0)], gi2.prototype, "height", void 0), mt2([An()], gi2.prototype, "boxStyle", void 0), mt2([wn(false)], gi2.prototype, "resizeFontSize", void 0), mt2([An("#000000")], gi2.prototype, "fill", void 0), mt2([Rn("outside")], gi2.prototype, "strokeAlign", void 0), mt2([Gn("all")], gi2.prototype, "hitFill", void 0), mt2([On("")], gi2.prototype, "text", void 0), mt2([On("")], gi2.prototype, "placeholder", void 0), mt2([On("caption")], gi2.prototype, "fontFamily", void 0), mt2([On(12)], gi2.prototype, "fontSize", void 0), mt2([On("normal")], gi2.prototype, "fontWeight", void 0), mt2([On(false)], gi2.prototype, "italic", void 0), mt2([On("none")], gi2.prototype, "textCase", void 0), mt2([On("none")], gi2.prototype, "textDecoration", void 0), mt2([On(0)], gi2.prototype, "letterSpacing", void 0), mt2([On(0)], gi2.prototype, "wordSpacing", void 0), mt2([On({ type: "percent", value: 1.5 })], gi2.prototype, "lineHeight", void 0), mt2([On(0)], gi2.prototype, "paraIndent", void 0), mt2([On(0)], gi2.prototype, "paraSpacing", void 0), mt2([On("x")], gi2.prototype, "writingMode", void 0), mt2([On("left")], gi2.prototype, "textAlign", void 0), mt2([On("top")], gi2.prototype, "verticalAlign", void 0), mt2([On(true)], gi2.prototype, "autoSizeAlign", void 0), mt2([On("normal")], gi2.prototype, "textWrap", void 0), mt2([On("show")], gi2.prototype, "textOverflow", void 0), mt2([An(false)], gi2.prototype, "textEditing", void 0), gi2 = mt2([oo()], gi2);
    yi2 = class extends ve2 {
      get __tag() {
        return "Path";
      }
    };
    mt2([Jn(se2)], yi2.prototype, "__", void 0), mt2([Rn("center")], yi2.prototype, "strokeAlign", void 0), yi2 = mt2([oo()], yi2);
    vi2 = class extends fe2 {
      get __tag() {
        return "Pen";
      }
      setStyle(t2) {
        const e2 = this.pathElement = new yi2(t2);
        return this.pathStyle = t2, this.__path = e2.path || (e2.path = []), this.add(e2), this;
      }
      paint() {
        const { pathElement: t2 } = this;
        t2.__layout.boxChanged || t2.forceUpdate("path");
      }
    };
    mt2([Jn(oe2)], vi2.prototype, "__", void 0), mt2([(e2, i2) => {
      pn(e2, i2, { get() {
        return this.__path;
      } });
    }], vi2.prototype, "path", void 0), vi2 = mt2([no(qi, ["set", "path", "paint"]), oo()], vi2);
  }
});

// node_modules/.pnpm/@leafer-ui+core@2.3.3/node_modules/@leafer-ui/core/lib/core.esm.min.js
function I2(t2, e2, i2, s2) {
  var a, n3 = arguments.length, r3 = n3 < 3 ? e2 : null === s2 ? s2 = Object.getOwnPropertyDescriptor(e2, i2) : s2;
  if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) r3 = Reflect.decorate(t2, e2, i2, s2);
  else for (var h = t2.length - 1; h >= 0; h--) (a = t2[h]) && (r3 = (n3 < 3 ? a(r3) : n3 > 3 ? a(e2, i2, r3) : a(e2, i2)) || r3);
  return n3 > 3 && r3 && Object.defineProperty(e2, i2, r3), r3;
}
function xt2(t2, e2, i2, s2, a) {
  if (wt2.some((t3) => e2.startsWith(t3)) && t2.__.hitChildren && !Ot2(t2, a)) {
    let n3;
    for (let r3 = 0, h = t2.children.length; r3 < h; r3++) n3 = t2.children[r3], !i2.path.has(n3) && n3.__.hittable && Tt3(n3, e2, i2, s2, a);
  }
}
function Tt3(t2, i2, s2, a, n3) {
  if (t2.destroyed) return false;
  if (t2.__.hitSelf && !Ot2(t2, n3) && (Mt2.updateEventStyle && !a && Mt2.updateEventStyle(t2, i2), t2.hasEvent(i2, a))) {
    s2.phase = a ? 1 : t2 === s2.target ? 2 : 3;
    const e2 = fe.get(i2, s2);
    if (t2.emitEvent(e2, a), e2.isStop) return true;
  }
  return false;
}
function Ot2(t2, e2) {
  return e2 && e2.has(t2);
}
var N2, F2, W2, K2, V2, U2, j2, X2, Y2, z3, G2, Z2, q2, J2, Q2, $2, tt2, et2, it2, at2, nt2, ht2, ot2, dt2, lt2, ct2, ut2, pt2, _t2, mt3, vt2, ft2, yt2, Dt3, Et3, Pt3, wt2, Lt3, Rt3, Ct3, bt2, Mt3, St2, At3, Bt3, kt3, Ht3, It3, Nt3, Ft3, Wt3, Kt3, Vt3, Ut3, jt3, Xt3, Yt3;
var init_core_esm_min2 = __esm({
  "node_modules/.pnpm/@leafer-ui+core@2.3.3/node_modules/@leafer-ui/core/lib/core.esm.min.js"() {
    init_draw_esm_min();
    init_draw_esm_min();
    init_core_esm_min();
    N2 = class extends Se2 {
      get __tag() {
        return "App";
      }
      get isApp() {
        return true;
      }
      constructor(t2, e2) {
        super(t2, e2);
      }
      init(t2, e2) {
        if (super.init(t2, e2), t2) {
          const { ground: e3, tree: i2, sky: s2, editor: a } = t2;
          e3 && (this.ground = this.addLeafer(e3)), (i2 || a) && (this.tree = this.addLeafer(i2 || { type: t2.type || "design" })), (s2 || a) && (this.sky = this.addLeafer(s2)), a && de.editor(a, this);
        }
      }
      __setApp() {
        const { canvas: t2 } = this, { realCanvas: e2, view: i2 } = this.config;
        e2 || i2 === this.canvas.view || !t2.parentView ? this.realCanvas = true : t2.unrealCanvas(), this.leafer = this, this.watcher.disable(), this.layouter.disable();
      }
      __updateLocalBounds() {
        this.forEach((t2) => t2.updateLayout()), super.__updateLocalBounds();
      }
      start() {
        super.start(), this.forEach((t2) => t2.start());
      }
      stop() {
        this.forEach((t2) => t2.stop()), super.stop();
      }
      unlockLayout() {
        super.unlockLayout(), this.forEach((t2) => t2.unlockLayout());
      }
      lockLayout() {
        super.lockLayout(), this.forEach((t2) => t2.lockLayout());
      }
      forceRender(t2, e2) {
        this.forEach((i2) => i2.forceRender(t2, e2));
      }
      addLeafer(e2) {
        const i2 = new Se2(e2);
        return this.add(i2), i2;
      }
      add(t2, e2) {
        if (!t2.view) {
          if (this.realCanvas && !this.canvas.bounds) return void setTimeout(() => this.add(t2, e2), 10);
          t2.init(this.__getChildConfig(t2.userConfig), this);
        }
        super.add(t2, e2), s(e2) || (t2.canvas.childIndex = e2), this.__listenChildEvents(t2);
      }
      forEach(t2) {
        this.children.forEach(t2);
      }
      __onCreated() {
        this.created = this.children.every((t2) => t2.created);
      }
      __onReady() {
        this.children.every((t2) => t2.ready) && super.__onReady();
      }
      __onViewReady() {
        this.children.every((t2) => t2.viewReady) && super.__onViewReady();
      }
      __onChildRenderEnd(t2) {
        this.renderer.addBlock(t2.renderBounds), this.viewReady && this.renderer.update();
      }
      __render(t2, e2) {
        t2.context && this.forEach((i2) => e2.matrix ? i2.__render(t2, e2) : t2.copyWorld(i2.canvas, e2.bounds, void 0, void 0, true));
      }
      __onResize(t2) {
        this.forEach((e2) => e2.resize(t2)), super.__onResize(t2);
      }
      updateLayout() {
        this.forEach((t2) => t2.updateLayout());
      }
      __getChildConfig(t2) {
        const e2 = Object.assign({}, this.config);
        return e2.hittable = e2.realCanvas = void 0, t2 && _.assign(e2, t2), this.autoLayout && _.copyAttrs(e2, this, Ie), e2.view = this.realCanvas ? void 0 : this.view, e2.fill = void 0, e2;
      }
      __listenChildEvents(t2) {
        t2.once([[da.END, this.__onReady, this], [ca.START, this.__onCreated, this], [ca.END, this.__onViewReady, this]]), this.realCanvas && this.__eventIds.push(t2.on_(ca.END, this.__onChildRenderEnd, this));
      }
    };
    N2 = I2([oo()], N2);
    F2 = {};
    W2 = { isHoldSpaceKey: () => W2.isHold("Space"), isHold: (t2) => F2[t2], isHoldKeys: (t2, e2) => e2 ? t2(e2) : void 0, setDownCode(t2) {
      F2[t2] || (F2[t2] = true);
    }, setUpCode(t2) {
      F2[t2] = false;
    } };
    K2 = { LEFT: 1, RIGHT: 2, MIDDLE: 4, defaultLeft(t2) {
      t2.buttons || (t2.buttons = 1);
    }, left: (t2) => 1 === t2.buttons, right: (t2) => 2 === t2.buttons, middle: (t2) => 4 === t2.buttons };
    V2 = class extends Jo {
      get spaceKey() {
        return W2.isHoldSpaceKey();
      }
      get left() {
        return K2.left(this);
      }
      get right() {
        return K2.right(this);
      }
      get middle() {
        return K2.middle(this);
      }
      constructor(t2) {
        super(t2.type), this.bubbles = true, Object.assign(this, t2);
      }
      isHoldKeys(t2) {
        return W2.isHoldKeys(t2, this);
      }
      getBoxPoint(t2) {
        return (t2 || this.current).getBoxPoint(this);
      }
      getInnerPoint(t2) {
        return (t2 || this.current).getInnerPoint(this);
      }
      getLocalPoint(t2) {
        return (t2 || this.current).getLocalPoint(this);
      }
      getPagePoint() {
        return this.current.getPagePoint(this);
      }
      getInner(t2) {
        return this.getInnerPoint(t2);
      }
      getLocal(t2) {
        return this.getLocalPoint(t2);
      }
      getPage() {
        return this.getPagePoint();
      }
      static changeName(t2, e2) {
        fe.changeName(t2, e2);
      }
    };
    ({ min: U2, max: j2, abs: X2 } = Math);
    ({ float: Y2, sign: z3 } = M);
    ({ minX: G2, maxX: Z2, minY: q2, maxY: J2 } = Ft);
    Q2 = new qt();
    $2 = new qt();
    tt2 = { limitMove(t2, e2) {
      const { dragBounds: i2, dragBoundsType: s2 } = t2;
      i2 && et2.getValidMove(t2.__localBoxBounds, et2.getDragBounds(t2), s2, e2, true), et2.axisMove(t2, e2);
    }, limitScaleOf(t2, e2, i2, s2) {
      const { dragBounds: a, dragBoundsType: n3 } = t2;
      a && et2.getValidScaleOf(t2.__localBoxBounds, et2.getDragBounds(t2), n3, t2.getLocalPointByInner(t2.getInnerPointByBox(e2)), i2, s2, true);
    }, axisMove(t2, e2) {
      const { draggable: i2 } = t2;
      "x" === i2 && (e2.y = 0), "y" === i2 && (e2.x = 0);
    }, getDragBounds(t2) {
      const { dragBounds: e2 } = t2;
      return "parent" === e2 ? t2.parent.boxBounds : e2;
    }, isInnerMode: (t2, e2, i2, s2) => "inner" === i2 || "auto" === i2 && Y2(t2[s2]) > Y2(e2[s2]), getValidMove(t2, e2, i2, s2, a) {
      const n3 = t2.x + s2.x, r3 = t2.y + s2.y, h = n3 + t2.width, o2 = r3 + t2.height, d2 = e2.x + e2.width, g2 = e2.y + e2.height;
      return a || (s2 = Object.assign({}, s2)), et2.isInnerMode(t2, e2, i2, "width") ? n3 > e2.x ? s2.x += e2.x - n3 : h < d2 && (s2.x += d2 - h) : n3 < e2.x ? s2.x += e2.x - n3 : h > d2 && (s2.x += d2 - h), et2.isInnerMode(t2, e2, i2, "height") ? r3 > e2.y ? s2.y += e2.y - r3 : o2 < g2 && (s2.y += g2 - o2) : r3 < e2.y ? s2.y += e2.y - r3 : o2 > g2 && (s2.y += g2 - o2), s2.x = Y2(s2.x), s2.y = Y2(s2.y), s2;
    }, getValidScaleOf(t2, e2, i2, s2, a, n3, r3) {
      r3 || (a = Object.assign({}, a)), $2.set(e2), Q2.set(t2).scaleOf(s2, a.x, a.y);
      const h = Y2((s2.x - t2.x) / t2.width), o2 = Y2(1 - h), d2 = Y2((s2.y - t2.y) / t2.height), g2 = Y2(1 - d2);
      let l2, c, u2, p2, _2 = 1, m2 = 1;
      return et2.isInnerMode(t2, e2, i2, "width") ? (a.x < 0 && Q2.scaleOf(s2, _2 = 1 / a.x, 1), u2 = Y2(Q2.minX - $2.minX), p2 = Y2($2.maxX - Q2.maxX), l2 = h && u2 > 0 ? 1 + u2 / (h * Q2.width) : 1, c = o2 && p2 > 0 ? 1 + p2 / (o2 * Q2.width) : 1, _2 *= j2(l2, c)) : (a.x < 0 && ((Y2(G2(t2) - G2(e2), 2) <= 0 || Y2(Z2(e2) - Z2(t2), 2) <= 0) && (Q2.scaleOf(s2, _2 = 1 / a.x, 1), Q2.width > 1 && (_2 *= 1 / Q2.width, Q2.width = 1)), Q2.unsign()), u2 = Y2($2.minX - Q2.minX), p2 = Y2(Q2.maxX - $2.maxX), l2 = h && u2 > 0 ? 1 - u2 / (h * Q2.width) : 1, c = o2 && p2 > 0 ? 1 - p2 / (o2 * Q2.width) : 1, _2 *= U2(l2, c)), et2.isInnerMode(t2, e2, i2, "height") ? (a.y < 0 && Q2.scaleOf(s2, 1, m2 = 1 / a.y), u2 = Y2(Q2.minY - $2.minY), p2 = Y2($2.maxY - Q2.maxY), l2 = d2 && u2 > 0 ? 1 + u2 / (d2 * Q2.height) : 1, c = g2 && p2 > 0 ? 1 + p2 / (g2 * Q2.height) : 1, m2 *= j2(l2, c), n3 && (l2 = j2(X2(_2), X2(m2)), _2 = z3(_2) * l2, m2 = z3(m2) * l2)) : (a.y < 0 && ((Y2(q2(t2) - q2(e2), 2) <= 0 || Y2(J2(e2) - J2(t2), 2) <= 0) && (Q2.scaleOf(s2, 1, m2 = 1 / a.y), Q2.height > 1 && (m2 *= 1 / Q2.height, Q2.height = 1)), Q2.unsign()), u2 = Y2($2.minY - Q2.minY), p2 = Y2(Q2.maxY - $2.maxY), l2 = d2 && u2 > 0 ? 1 - u2 / (d2 * Q2.height) : 1, c = g2 && p2 > 0 ? 1 - p2 / (g2 * Q2.height) : 1, m2 *= U2(l2, c)), a.x *= n2(_2) ? _2 : 1, a.y *= n2(m2) ? m2 : 1, a;
    } };
    et2 = tt2;
    it2 = class extends V2 {
    };
    it2.POINTER = "pointer", it2.BEFORE_DOWN = "pointer.before_down", it2.BEFORE_MOVE = "pointer.before_move", it2.BEFORE_UP = "pointer.before_up", it2.DOWN = "pointer.down", it2.MOVE = "pointer.move", it2.UP = "pointer.up", it2.OVER = "pointer.over", it2.OUT = "pointer.out", it2.ENTER = "pointer.enter", it2.LEAVE = "pointer.leave", it2.TAP = "tap", it2.DOUBLE_TAP = "double_tap", it2.CLICK = "click", it2.DOUBLE_CLICK = "double_click", it2.LONG_PRESS = "long_press", it2.LONG_TAP = "long_tap", it2.MENU = "pointer.menu", it2.MENU_TAP = "pointer.menu_tap", it2 = I2([ao()], it2);
    at2 = {};
    nt2 = class extends it2 {
      static setList(t2) {
        this.list = t2 instanceof Mh ? t2 : new Mh(t2);
      }
      static setData(t2) {
        this.data = t2;
      }
      static getValidMove(t2, e2, i2, s2 = true) {
        const a = t2.getLocalPoint(i2, null, true);
        return at.move(a, e2.x - t2.x, e2.y - t2.y), s2 && this.limitMove(t2, a), tt2.axisMove(t2, a), a;
      }
      static limitMove(t2, e2) {
        tt2.limitMove(t2, e2);
      }
      getPageMove(t2) {
        return this.assignMove(t2), this.current.getPagePoint(at2, null, true);
      }
      getInnerMove(t2, e2) {
        return t2 || (t2 = this.current), this.assignMove(e2), t2.getInnerPoint(at2, null, true);
      }
      getLocalMove(t2, e2) {
        return t2 || (t2 = this.current), this.assignMove(e2), t2.getLocalPoint(at2, null, true);
      }
      getPageTotal() {
        return this.getPageMove(true);
      }
      getInnerTotal(t2) {
        return this.getInnerMove(t2, true);
      }
      getLocalTotal(t2) {
        return this.getLocalMove(t2, true);
      }
      getPageBounds() {
        const t2 = this.getPageTotal(), e2 = this.getPagePoint(), i2 = {};
        return Ft.set(i2, e2.x - t2.x, e2.y - t2.y, t2.x, t2.y), Ft.unsign(i2), i2;
      }
      assignMove(t2) {
        at2.x = t2 ? this.totalX : this.moveX, at2.y = t2 ? this.totalY : this.moveY;
      }
    };
    nt2.BEFORE_DRAG = "drag.before_drag", nt2.START = "drag.start", nt2.DRAG = "drag", nt2.END = "drag.end", nt2.OVER = "drag.over", nt2.OUT = "drag.out", nt2.ENTER = "drag.enter", nt2.LEAVE = "drag.leave", nt2.ANIMATE = "drag.animate", nt2 = I2([ao()], nt2);
    ht2 = class extends it2 {
      static setList(t2) {
        nt2.setList(t2);
      }
      static setData(t2) {
        nt2.setData(t2);
      }
    };
    ht2.DROP = "drop", ht2 = I2([ao()], ht2);
    ot2 = class extends nt2 {
    };
    ot2.BEFORE_MOVE = "move.before_move", ot2.START = "move.start", ot2.MOVE = "move", ot2.DRAG_ANIMATE = "move.drag_animate", ot2.END = "move.end", ot2.PULL_DOWN = "move.pull_down", ot2.REACH_BOTTOM = "move.reach_bottom", ot2 = I2([ao()], ot2);
    dt2 = class extends V2 {
    };
    dt2 = I2([ao()], dt2);
    lt2 = class extends it2 {
    };
    lt2.BEFORE_ROTATE = "rotate.before_rotate", lt2.START = "rotate.start", lt2.ROTATE = "rotate", lt2.END = "rotate.end", lt2 = I2([ao()], lt2);
    ct2 = class extends nt2 {
    };
    ct2.SWIPE = "swipe", ct2.LEFT = "swipe.left", ct2.RIGHT = "swipe.right", ct2.UP = "swipe.up", ct2.DOWN = "swipe.down", ct2 = I2([ao()], ct2);
    ut2 = class extends it2 {
    };
    ut2.BEFORE_ZOOM = "zoom.before_zoom", ut2.START = "zoom.start", ut2.ZOOM = "zoom", ut2.END = "zoom.end", ut2 = I2([ao()], ut2);
    pt2 = class extends V2 {
    };
    pt2.BEFORE_DOWN = "key.before_down", pt2.BEFORE_UP = "key.before_up", pt2.DOWN = "key.down", pt2.HOLD = "key.hold", pt2.UP = "key.up", pt2 = I2([ao()], pt2);
    _t2 = { getDragEventData: (t2, e2, i2) => Object.assign(Object.assign({}, i2), { x: i2.x, y: i2.y, moveX: i2.x - e2.x, moveY: i2.y - e2.y, totalX: i2.x - t2.x, totalY: i2.y - t2.y }), getDropEventData: (t2, e2, i2) => Object.assign(Object.assign({}, t2), { list: e2, data: i2 }), getSwipeDirection: (t2) => t2 < -45 && t2 > -135 ? ct2.UP : t2 > 45 && t2 < 135 ? ct2.DOWN : t2 <= 45 && t2 >= -45 ? ct2.RIGHT : ct2.LEFT, getSwipeEventData: (t2, e2, i2) => Object.assign(Object.assign({}, i2), { moveX: e2.moveX, moveY: e2.moveY, totalX: i2.x - t2.x, totalY: i2.y - t2.y, type: mt3.getSwipeDirection(at.getAngle(t2, i2)) }), getBase(t2) {
      const e2 = 1 === t2.button ? 4 : t2.button;
      return { altKey: t2.altKey, ctrlKey: t2.ctrlKey, shiftKey: t2.shiftKey, metaKey: t2.metaKey, time: Date.now(), buttons: s(t2.buttons) ? 1 : 0 === t2.buttons ? e2 : t2.buttons, origin: t2 };
    }, pathHasEventType(t2, e2) {
      const { list: i2 } = t2;
      for (let t3 = 0, s2 = i2.length; t3 < s2; t3++) if (i2[t3].hasEvent(e2)) return true;
      return false;
    }, filterPathByEventType(t2, e2) {
      const i2 = new Mh(), { list: s2 } = t2;
      for (let t3 = 0, a = s2.length; t3 < a; t3++) s2[t3].hasEvent(e2) && i2.add(s2[t3]);
      return i2;
    }, pathCanDrag: (t2) => t2 && t2.list.some((t3) => wo.draggable(t3) || !t3.isLeafer && t3.hasEvent(nt2.DRAG)), pathHasOutside: (t2) => t2 && t2.list.some((t3) => t3.isOutside) };
    mt3 = _t2;
    vt2 = new Mh();
    ({ getDragEventData: ft2, getDropEventData: yt2, getSwipeEventData: Dt3 } = _t2);
    Et3 = class {
      constructor(t2) {
        this.dragDataList = [], this.interaction = t2;
      }
      setDragData(t2) {
        this.animateWait && this.dragEndReal(), this.downData = this.interaction.downData, this.dragData = ft2(t2, t2, t2), this.canAnimate = this.canDragOut = true;
      }
      getList(t2, e2) {
        const { proxy: i2 } = this.interaction.selector, s2 = i2 && i2.list.length, a = nt2.list || this.draggableList || vt2;
        return this.dragging && (s2 ? t2 ? vt2 : new Mh(e2 ? [...i2.list, ...i2.dragHoverExclude] : i2.list) : a);
      }
      checkDrag(t2, e2) {
        const { interaction: i2 } = this;
        if (this.moving && t2.buttons < 1) return this.canAnimate = false, void i2.pointerCancel();
        !this.moving && e2 && (this.moving = i2.canMove(this.downData) || i2.isHoldRightKey || i2.isMobileDragEmpty) && (this.dragData.moveType = "drag", i2.emit(ot2.START, this.dragData)), this.moving || this.dragStart(t2, e2), this.drag(t2);
      }
      dragStart(t2, e2) {
        this.dragging || (this.dragging = e2 && K2.left(t2), this.dragging && (this.interaction.emit(nt2.START, this.dragData), this.getDraggableList(this.dragData.path), this.setDragStartPoints(this.realDraggableList = this.getList(true))));
      }
      setDragStartPoints(t2) {
        this.dragStartPoints = {}, t2.forEach((t3) => this.dragStartPoints[t3.innerId] = { x: t3.x, y: t3.y });
      }
      getDraggableList(t2) {
        let e2;
        for (let i2 = 0, s2 = t2.length; i2 < s2; i2++) if (e2 = t2.list[i2], wo.draggable(e2)) {
          this.draggableList = new Mh(e2);
          break;
        }
      }
      drag(t2) {
        const { interaction: e2, dragData: i2, downData: s2 } = this, { path: a, throughPath: n3 } = s2;
        this.dragData = ft2(s2, i2, t2), n3 && (this.dragData.throughPath = n3), this.dragData.path = a, this.dragDataList.push(this.dragData), this.moving ? (t2.moving = true, this.dragData.moveType = "drag", e2.emit(ot2.BEFORE_MOVE, this.dragData), e2.emit(ot2.MOVE, this.dragData)) : this.dragging && (t2.dragging = true, this.dragReal(), e2.emit(nt2.BEFORE_DRAG, this.dragData), e2.emit(nt2.DRAG, this.dragData));
      }
      dragReal(t2) {
        const { interaction: e2 } = this, { running: i2 } = e2, s2 = this.realDraggableList;
        if (s2.length && i2) {
          const { totalX: i3, totalY: a } = this.dragData, { dragLimitAnimate: n3 } = e2.p, r3 = !n3 || !!t2;
          s2.forEach((e3) => {
            if (e3.draggable) {
              const s3 = r(e3.draggable), h = nt2.getValidMove(e3, this.dragStartPoints[e3.innerId], { x: i3, y: a }, r3 || s3);
              n3 && !s3 && t2 ? wo.animateMove(e3, h, o(n3) ? n3 : 0.3, () => e3.emit(nt2.ANIMATE)) : e3.move(h);
            }
          });
        }
      }
      dragOverOrOut(t2) {
        const { interaction: e2 } = this, { dragOverPath: i2 } = this, { path: s2 } = t2;
        this.dragOverPath = s2, i2 ? s2.indexAt(0) !== i2.indexAt(0) && (e2.emit(nt2.OUT, t2, i2), e2.emit(nt2.OVER, t2, s2)) : e2.emit(nt2.OVER, t2, s2);
      }
      dragEnterOrLeave(t2) {
        const { interaction: e2 } = this, { dragEnterPath: i2 } = this, { path: s2 } = t2;
        e2.emit(nt2.LEAVE, t2, i2, s2), e2.emit(nt2.ENTER, t2, s2, i2), this.dragEnterPath = s2;
      }
      dragEnd(t2) {
        (this.dragging || this.moving) && (setTimeout(() => this.interaction.pointerMove(t2)), this.checkDragEndAnimate(t2) || this.dragEndReal(t2));
      }
      dragEndReal(t2) {
        const { interaction: e2, downData: i2, dragData: s2 } = this;
        t2 || (t2 = s2);
        const { path: a, throughPath: n3 } = i2, r3 = ft2(i2, t2, t2);
        if (n3 && (r3.throughPath = n3), r3.path = a, this.moving && (this.moving = false, r3.moveType = "drag", e2.emit(ot2.END, r3)), this.dragging) {
          const a2 = this.getList();
          this.dragging = false, e2.p.dragLimitAnimate && this.dragReal(true), e2.emit(nt2.END, r3), this.swipe(t2, i2, s2, r3), this.drop(t2, a2, this.dragEnterPath);
        }
        this.autoMoveCancel(), this.dragReset(), this.animate(null, "off");
      }
      swipe(t2, e2, i2, s2) {
        const { interaction: a } = this;
        if (at.getDistance(e2, t2) > a.config.pointer.swipeDistance) {
          const t3 = Dt3(e2, i2, s2);
          this.interaction.emit(t3.type, t3);
        }
      }
      drop(t2, e2, i2) {
        const s2 = yt2(t2, e2, nt2.data);
        s2.path = i2, this.interaction.emit(ht2.DROP, s2), this.interaction.emit(nt2.LEAVE, t2, i2);
      }
      dragReset() {
        nt2.list = nt2.data = this.draggableList = this.dragData = this.downData = this.dragOverPath = this.dragEnterPath = null, this.dragDataList = [];
      }
      checkDragEndAnimate(t2, e2) {
        return false;
      }
      animate(t2, e2) {
      }
      stopAnimate() {
      }
      checkDragOut(t2) {
      }
      autoMoveOnDragOut(t2) {
      }
      autoMoveCancel() {
      }
      destroy() {
        this.dragReset();
      }
    };
    Pt3 = se.get("emit");
    wt2 = ["move", "zoom", "rotate", "key"];
    Lt3 = { wheel: { zoomSpeed: 0.5, moveSpeed: 0.5, rotateSpeed: 0.5, delta: { x: 20, y: 8 } }, pointer: { type: "pointer", snap: true, hitRadius: 5, tapTime: 120, longPressTime: 800, transformTime: 500, hover: true, dragHover: true, dragDistance: 2, swipeDistance: 20 }, touch: { preventDefault: "auto" }, multiTouch: {}, move: { autoDistance: 2 }, zoom: {}, cursor: true, keyEvent: true };
    ({ pathHasEventType: Rt3, pathCanDrag: Ct3, pathHasOutside: bt2 } = _t2);
    Mt3 = class {
      get dragging() {
        return this.dragger.dragging;
      }
      get transforming() {
        return this.transformer.transforming;
      }
      get moveMode() {
        return true === this.m.drag || this.isHoldSpaceKey || this.isHoldMiddleKey || this.isHoldRightKey && this.dragger.moving || this.isDragEmpty;
      }
      get canHover() {
        return this.p.hover && !this.config.mobile;
      }
      get isDragEmpty() {
        return this.m.dragEmpty && this.isRootPath(this.hoverData) && (!this.downData || this.isRootPath(this.downData));
      }
      get isMobileDragEmpty() {
        return this.m.dragEmpty && !this.canHover && this.downData && this.isTreePath(this.downData);
      }
      get isHoldMiddleKey() {
        return this.m.holdMiddleKey && this.downData && K2.middle(this.downData);
      }
      get isHoldRightKey() {
        return this.m.holdRightKey && this.downData && K2.right(this.downData);
      }
      get isHoldSpaceKey() {
        return this.m.holdSpaceKey && W2.isHoldSpaceKey();
      }
      get m() {
        return this.config.move;
      }
      get p() {
        return this.config.pointer;
      }
      get hitRadius() {
        return this.p.hitRadius;
      }
      constructor(t2, e2, i2, s2) {
        this.config = _.clone(Lt3), this.tapCount = 0, this.downKeyMap = {}, this.target = t2, this.canvas = e2, this.selector = i2, this.defaultPath = new Mh(t2), this.createTransformer(), this.dragger = new Et3(this), s2 && (this.config = _.default(s2, this.config)), this.__listenEvents();
      }
      start() {
        this.running = true;
      }
      stop() {
        this.running = false;
      }
      receive(t2) {
      }
      pointerDown(t2, e2) {
        t2 || (t2 = this.hoverData), t2 && (K2.defaultLeft(t2), this.updateDownData(t2), this.checkPath(t2, e2), this.downTime = Date.now(), this.emit(it2.BEFORE_DOWN, t2), t2.path.needUpdate && this.updateDownData(t2), this.emit(it2.DOWN, t2), K2.left(t2) && (this.tapWait(), this.longPressWait(t2)), this.waitRightTap = K2.right(t2), this.dragger.setDragData(t2), this.isHoldRightKey || this.updateCursor(t2));
      }
      pointerMove(t2) {
        if (t2 || (t2 = this.hoverData), !t2) return;
        const { downData: e2 } = this;
        e2 && K2.defaultLeft(t2);
        (this.canvas.bounds.hitPoint(t2) || e2) && (this.pointerMoveReal(t2), e2 && this.dragger.checkDragOut(t2));
      }
      pointerMoveReal(t2) {
        if (this.emit(it2.BEFORE_MOVE, t2, this.defaultPath), this.downData) {
          const e2 = at.getDistance(this.downData, t2) > this.p.dragDistance;
          e2 && (this.pointerWaitCancel(), this.waitRightTap = false), this.dragger.checkDrag(t2, e2);
        }
        this.dragger.moving || (this.updateHoverData(t2), this.checkPath(t2), this.emit(it2.MOVE, t2), this.pointerHover(t2), this.dragging && (this.dragger.dragOverOrOut(t2), this.dragger.dragEnterOrLeave(t2))), this.updateCursor(this.downData || t2);
      }
      pointerUp(t2) {
        const { downData: e2 } = this;
        if (t2 || (t2 = e2), !e2) return;
        K2.defaultLeft(t2), t2.multiTouch = e2.multiTouch, this.findPath(t2);
        const i2 = Object.assign(Object.assign({}, t2), { path: t2.path.clone() });
        t2.path.addList(e2.path.list), this.checkPath(t2), this.downData = null, this.emit(it2.BEFORE_UP, t2), this.emit(it2.UP, t2), this.touchLeave(t2), t2.isCancel || (this.tap(t2), this.menuTap(t2)), this.dragger.dragEnd(t2), this.updateCursor(i2);
      }
      pointerCancel() {
        const t2 = Object.assign({}, this.dragger.dragData);
        t2.isCancel = true, this.pointerUp(t2);
      }
      menu(t2) {
        this.findPath(t2), this.emit(it2.MENU, t2), this.waitMenuTap = true, !this.downData && this.waitRightTap && this.menuTap(t2);
      }
      menuTap(t2) {
        this.waitRightTap && this.waitMenuTap && (this.emit(it2.MENU_TAP, t2), this.waitRightTap = this.waitMenuTap = false);
      }
      createTransformer() {
      }
      move(t2) {
      }
      zoom(t2) {
      }
      rotate(t2) {
      }
      transformEnd() {
      }
      wheel(t2) {
      }
      multiTouch(t2, e2) {
      }
      keyDown(t2) {
        if (!this.config.keyEvent) return;
        this.emit(pt2.BEFORE_DOWN, t2, this.defaultPath);
        const { code: e2 } = t2;
        this.downKeyMap[e2] || (this.downKeyMap[e2] = true, W2.setDownCode(e2), this.emit(pt2.HOLD, t2, this.defaultPath), this.moveMode && (this.cancelHover(), this.updateCursor())), this.emit(pt2.DOWN, t2, this.defaultPath);
      }
      keyUp(t2) {
        if (!this.config.keyEvent) return;
        this.emit(pt2.BEFORE_UP, t2, this.defaultPath);
        const { code: e2 } = t2;
        this.downKeyMap[e2] = false, W2.setUpCode(e2), this.emit(pt2.UP, t2, this.defaultPath), "grab" === this.cursor && this.updateCursor();
      }
      pointerHover(t2) {
        !this.canHover || this.dragging && !this.p.dragHover || (t2.path || (t2.path = new Mh()), this.pointerOverOrOut(t2), this.pointerEnterOrLeave(t2));
      }
      pointerOverOrOut(t2) {
        const { path: e2 } = t2, { overPath: i2 } = this;
        this.overPath = e2, i2 ? e2.indexAt(0) !== i2.indexAt(0) && (this.emit(it2.OUT, t2, i2), this.emit(it2.OVER, t2, e2)) : this.emit(it2.OVER, t2, e2);
      }
      pointerEnterOrLeave(t2) {
        let { path: e2 } = t2;
        this.downData && !this.moveMode && (e2 = e2.clone(), this.downData.path.forEach((t3) => e2.add(t3)));
        const { enterPath: i2 } = this;
        this.enterPath = e2, this.emit(it2.LEAVE, t2, i2, e2), this.emit(it2.ENTER, t2, e2, i2);
      }
      touchLeave(t2) {
        "touch" === t2.pointerType && this.enterPath && (this.emit(it2.LEAVE, t2), this.dragger.dragging && this.emit(ht2.LEAVE, t2));
      }
      tap(t2) {
        const { pointer: e2 } = this.config, i2 = this.longTap(t2);
        if (!e2.tapMore && i2) return;
        if (!this.waitTap) return;
        e2.tapMore && this.emitTap(t2);
        const s2 = Date.now() - this.downTime, a = [it2.DOUBLE_TAP, it2.DOUBLE_CLICK].some((e3) => Rt3(t2.path, e3));
        s2 < e2.tapTime + 50 && a ? (this.tapCount++, 2 === this.tapCount ? (this.tapWaitCancel(), this.emitDoubleTap(t2)) : (clearTimeout(this.tapTimer), this.tapTimer = setTimeout(() => {
          e2.tapMore || (this.tapWaitCancel(), this.emitTap(t2));
        }, e2.tapTime))) : e2.tapMore || (this.tapWaitCancel(), this.emitTap(t2));
      }
      findPath(t2, e2) {
        const { hitRadius: i2, through: s2 } = this.p, { bottomList: a, target: n3 } = this;
        Kt.backgrounder || t2.origin || n3 && n3.updateLayout();
        const r3 = this.selector.getByPoint(t2, i2, Object.assign({ bottomList: a, name: t2.type }, e2 || { through: s2 }));
        return r3.throughPath && (t2.throughPath = r3.throughPath), t2.path = r3.path, r3.path;
      }
      isRootPath(t2) {
        return t2 && t2.path.list[0].isLeafer;
      }
      isTreePath(t2) {
        const e2 = this.target.app;
        return !(!e2 || !e2.isApp) && (e2.editor && !t2.path.has(e2.editor) && t2.path.has(e2.tree) && !t2.target.syncEventer);
      }
      checkPath(t2, e2) {
        (e2 || this.moveMode && !bt2(t2.path)) && (t2.path = this.defaultPath);
      }
      canMove(t2) {
        return t2 && (this.moveMode || "auto" === this.m.drag && !Ct3(t2.path)) && !bt2(t2.path);
      }
      isDrag(t2) {
        return this.dragger.getList().has(t2);
      }
      isPress(t2) {
        return this.downData && this.downData.path.has(t2);
      }
      isHover(t2) {
        return this.enterPath && this.enterPath.has(t2);
      }
      isFocus(t2) {
        return this.focusData === t2;
      }
      cancelHover() {
        const { hoverData: t2 } = this;
        t2 && (t2.path = this.defaultPath, this.pointerHover(t2));
      }
      stopDragAnimate() {
        this.dragger.stopAnimate();
      }
      replaceDownTarget(t2) {
        const { downData: e2 } = this;
        if (e2 && t2) {
          const { path: i2 } = e2;
          i2.remove(i2.list[0]), i2.addAt(t2, 0);
        }
      }
      updateDownData(t2, e2, i2) {
        const { downData: s2 } = this;
        !t2 && s2 && (t2 = s2), t2 && (this.findPath(t2, e2), i2 && s2 && t2.path.addList(s2.path.list), this.downData = t2);
      }
      updateHoverData(t2) {
        t2 || (t2 = this.hoverData), t2 && (this.findPath(t2, { exclude: this.dragger.getList(false, true), name: it2.MOVE }), this.hoverData = t2);
      }
      updateCursor(t2) {
        if (!this.config.cursor || !this.canHover) return;
        if (t2 || (this.updateHoverData(), t2 = this.downData || this.hoverData), this.dragger.moving) return this.setCursor("grabbing");
        if (this.canMove(t2)) return this.setCursor(this.downData ? "grabbing" : "grab");
        if (!t2) return;
        let e2, i2;
        const { path: s2 } = t2;
        for (let t3 = 0, a = s2.length; t3 < a && (e2 = s2.list[t3], i2 = e2.syncEventer && e2.syncEventer.cursor || e2.cursor, !i2); t3++) ;
        this.setCursor(i2);
      }
      setCursor(t2) {
        this.cursor = t2;
      }
      getLocal(t2, e2) {
        const i2 = this.canvas.getClientBounds(e2), s2 = { x: t2.clientX - i2.x, y: t2.clientY - i2.y }, { bounds: a } = this.canvas;
        return s2.x *= a.width / i2.width, s2.y *= a.height / i2.height, this.p.snap && at.round(s2), s2;
      }
      emitTap(t2) {
        this.emit(it2.TAP, t2), this.emit(it2.CLICK, t2);
      }
      emitDoubleTap(t2) {
        this.emit(it2.DOUBLE_TAP, t2), this.emit(it2.DOUBLE_CLICK, t2);
      }
      pointerWaitCancel() {
        this.tapWaitCancel(), this.longPressWaitCancel();
      }
      tapWait() {
        clearTimeout(this.tapTimer), this.waitTap = true;
      }
      tapWaitCancel() {
        this.waitTap && (clearTimeout(this.tapTimer), this.waitTap = false, this.tapCount = 0);
      }
      longPressWait(t2) {
        clearTimeout(this.longPressTimer), this.longPressTimer = setTimeout(() => {
          this.longPressed = true, this.emit(it2.LONG_PRESS, t2);
        }, this.p.longPressTime);
      }
      longTap(t2) {
        let e2;
        return this.longPressed && (this.emit(it2.LONG_TAP, t2), (Rt3(t2.path, it2.LONG_TAP) || Rt3(t2.path, it2.LONG_PRESS)) && (e2 = true)), this.longPressWaitCancel(), e2;
      }
      longPressWaitCancel() {
        this.longPressTimer && (clearTimeout(this.longPressTimer), this.longPressed = false);
      }
      __onResize() {
        const { dragOut: t2 } = this.m;
        this.shrinkCanvasBounds = new qt(this.canvas.bounds), this.shrinkCanvasBounds.spread(-(o(t2) ? t2 : 2));
      }
      __listenEvents() {
        const { target: t2 } = this;
        this.__eventIds = [t2.on_(ha.RESIZE, this.__onResize, this)], t2.once(ua.READY, () => this.__onResize());
      }
      __removeListenEvents() {
        this.target.off_(this.__eventIds), this.__eventIds.length = 0;
      }
      emit(t2, e2, i2, s2) {
        this.running && (function(t3, e3, i3, s3) {
          if (!i3 && !e3.path) return;
          let a;
          e3.type = t3, i3 ? e3 = Object.assign(Object.assign({}, e3), { path: i3 }) : i3 = e3.path, e3.target = i3.indexAt(0);
          try {
            for (let n3 = i3.length - 1; n3 > -1; n3--) {
              if (a = i3.list[n3], Tt3(a, t3, e3, true, s3)) return;
              a.isApp && xt2(a, t3, e3, true, s3);
            }
            for (let n3 = 0, r3 = i3.length; n3 < r3; n3++) if (a = i3.list[n3], a.isApp && xt2(a, t3, e3, false, s3), Tt3(a, t3, e3, false, s3)) return;
          } catch (t4) {
            Pt3.error(t4);
          }
        })(t2, e2, i2, s2);
      }
      destroy() {
        this.__eventIds.length && (this.stop(), this.__removeListenEvents(), this.dragger.destroy(), this.transformer && this.transformer.destroy(), this.downData = this.overPath = this.enterPath = null);
      }
    };
    St2 = class {
      static set(t2, e2) {
        this.custom[t2] = e2;
      }
      static get(t2) {
        return this.custom[t2];
      }
    };
    St2.custom = {};
    At3 = class extends ye {
      constructor() {
        super(...arguments), this.maxTotal = 1e3, this.pathList = new Mh(), this.pixelList = new Mh();
      }
      getPixelType(t2, e2) {
        return this.__autoClear(), this.pixelList.add(t2), de.hitCanvas(e2);
      }
      getPathType(t2) {
        return this.__autoClear(), this.pathList.add(t2), de.hitCanvas();
      }
      clearImageType() {
        this.__clearLeafList(this.pixelList);
      }
      clearPathType() {
        this.__clearLeafList(this.pathList);
      }
      __clearLeafList(t2) {
        t2.length && (t2.forEach((t3) => {
          t3.__hitCanvas && (t3.__hitCanvas.destroy(), t3.__hitCanvas = null);
        }), t2.reset());
      }
      __autoClear() {
        this.pathList.length + this.pixelList.length > this.maxTotal && this.clear();
      }
      clear() {
        this.clearPathType(), this.clearImageType();
      }
    };
    Kt.getSelector = function(t2) {
      return t2.leafer ? t2.leafer.selector : Kt.selector || (Kt.selector = de.selector());
    };
    ({ toInnerRadiusPointOf: Bt3, copyRadiusPoint: kt3 } = at);
    ({ hitRadiusPoint: Ht3, hitPoint: It3 } = Ft);
    Nt3 = {};
    Ft3 = {};
    Wt3 = Bh.prototype;
    Wt3.hit = function(t2, e2 = 0) {
      this.updateLayout(), kt3(Ft3, t2, e2);
      const i2 = this.__world;
      return !!(e2 ? Ht3(i2, Ft3) : It3(i2, Ft3)) && (this.isBranch ? Kt.getSelector(this).hitPoint(Object.assign({}, Ft3), e2, { target: this }) : this.__hitWorld(Ft3));
    }, Wt3.__hitWorld = function(t2, e2) {
      const i2 = this.__;
      if (!i2.hitSelf) return false;
      const s2 = this.__world, a = this.__layout, n3 = s2.width < 10 && s2.height < 10;
      if (i2.hitRadius && (kt3(Nt3, t2, i2.hitRadius), t2 = Nt3), Bt3(t2, s2, Nt3), i2.hitBox || n3) {
        if (Ft.hitRadiusPoint(a.boxBounds, Nt3)) return true;
        if (n3) return false;
      }
      return !a.hitCanvasChanged && this.__hitCanvas || (this.__updateHitCanvas(), a.boundsChanged || (a.hitCanvasChanged = false)), this.__hit(Nt3, e2);
    }, Wt3.__hitFill = function(t2) {
      const e2 = this.__hitCanvas;
      return e2 && e2.hitFill(t2, this.__.windingRule);
    }, Wt3.__hitStroke = function(t2, e2) {
      const i2 = this.__hitCanvas;
      return i2 && i2.hitStroke(t2, e2);
    }, Wt3.__hitPixel = function(t2) {
      const e2 = this.__hitCanvas;
      return e2 && e2.hitPixel(t2, this.__layout.renderBounds, e2.hitScale);
    }, Wt3.__drawHitPath = function(t2) {
      t2 && this.__drawRenderPath(t2);
    };
    Kt3 = new ft();
    Vt3 = ve2.prototype;
    Vt3.__updateHitCanvas = function() {
      this.__box && this.__box.__updateHitCanvas();
      const { hitCanvasManager: t2 } = this.leafer || this.parent && this.parent.leafer || {};
      if (!t2) return;
      const e2 = this.__, i2 = (e2.__isAlphaPixelFill || e2.__isCanvas) && "pixel" === e2.hitFill, s2 = e2.__isAlphaPixelStroke && "pixel" === e2.hitStroke, a = i2 || s2;
      this.__hitCanvas || (this.__hitCanvas = a ? t2.getPixelType(this, { contextSettings: { willReadFrequently: true } }) : t2.getPathType(this));
      const n3 = this.__hitCanvas;
      if (a) {
        const { renderBounds: t3 } = this.__layout, a2 = Kt.image.hitCanvasSize, r3 = n3.hitScale = Ht.set(0, 0, a2, a2).getFitMatrix(t3).a, { x: h, y: o2, width: d2, height: g2 } = Ht.set(t3).scale(r3);
        n3.resize({ width: d2, height: g2, pixelRatio: 1 }), n3.clear(), an.patternLocked = true, this.__renderShape(n3, { matrix: Kt3.setWith(this.__world).scaleWith(1 / r3).invertWith().translate(-h, -o2), snapshot: true, ignoreFill: !i2, ignoreStroke: !s2 }), an.patternLocked = false, n3.resetTransform(), e2.__isHitPixel = true;
      } else e2.__isHitPixel && (e2.__isHitPixel = false);
      this.__drawHitPath(n3), n3.setStrokeOptions(e2);
    }, Vt3.__hit = function(t2, e2) {
      if (this.__box && this.__box.__hit(t2)) return true;
      const i2 = this.__;
      if (i2.__isHitPixel && this.__hitPixel(t2)) return true;
      const { hitFill: s2 } = i2, a = (i2.fill || i2.__isCanvas) && ("path" === s2 || "pixel" === s2 && !(i2.__isAlphaPixelFill || i2.__isCanvas)) || "all" === s2 || e2;
      if (a && this.__hitFill(t2)) return true;
      const { hitStroke: n3, strokeScaleFixed: r3 } = i2, h = i2.__maxStrokeWidth * (r3 ? this.getRenderScaleData(true, r3, false).scaleX : 1), o2 = i2.stroke && ("path" === n3 || "pixel" === n3 && !i2.__isAlphaPixelStroke) || "all" === n3;
      if (!a && !o2) return false;
      const d2 = 2 * t2.radiusX;
      let g2 = d2, { strokeAlign: l2 } = i2;
      if (i2.motionText && (g2 += i2.fontSize / 2, l2 = "center"), o2) switch (l2) {
        case "inside":
          if (g2 += 2 * h, !a && this.__hitFill(t2) && this.__hitStroke(t2, g2)) return true;
          g2 = d2;
          break;
        case "center":
          g2 += h;
          break;
        case "outside":
          if (g2 += 2 * h, !a) {
            if (!this.__hitFill(t2) && this.__hitStroke(t2, g2)) return true;
            g2 = d2;
          }
      }
      return !!g2 && this.__hitStroke(t2, g2);
    };
    Ut3 = ve2.prototype;
    jt3 = me2.prototype;
    Xt3 = Ce2.prototype;
    jt3.__updateHitCanvas = Xt3.__updateHitCanvas = function() {
      this.stroke || this.cornerRadius || (this.fill || this.__.__isCanvas) && "pixel" === this.hitFill || "all" === this.hitStroke ? Ut3.__updateHitCanvas.call(this) : this.__hitCanvas && (this.__hitCanvas = null);
    }, jt3.__hitFill = Xt3.__hitFill = function(t2) {
      return this.__hitCanvas ? Ut3.__hitFill.call(this, t2) : Ft.hitRadiusPoint(this.__layout.boxBounds, t2);
    }, gi2.prototype.__drawHitPath = function(t2) {
      const e2 = this.__, { __lineHeight: i2, fontSize: s2, __baseLine: a, __letterSpacing: n3, __textDrawData: r3 } = e2;
      t2.beginPath(), e2.motionText ? this.__drawPathByData(t2, e2.__pathForMotionText) : n3 < 0 ? this.__drawPathByBox(t2) : r3.rows.forEach((e3) => t2.rect(e3.x, e3.y - a, e3.width, i2 < s2 ? s2 : i2));
    }, fe2.prototype.pick = function(t2, e2) {
      return e2 || (e2 = e), this.updateLayout(), Kt.getSelector(this).getByPoint(t2, e2.hitRadius || 0, Object.assign(Object.assign({}, e2), { target: this }));
    };
    Yt3 = Ee.prototype;
    Yt3.hitFill = function(t2, e2) {
      return e2 ? this.context.isPointInPath(t2.x, t2.y, e2) : this.context.isPointInPath(t2.x, t2.y);
    }, Yt3.hitStroke = function(t2, e2) {
      return this.strokeWidth = e2, this.context.isPointInStroke(t2.x, t2.y);
    }, Yt3.hitPixel = function(t2, e2, i2 = 1) {
      let { x: s2, y: a, radiusX: n3, radiusY: r3 } = t2;
      e2 && (s2 -= e2.x, a -= e2.y), Ht.set(s2 - n3, a - r3, 2 * n3, 2 * r3).scale(i2).ceil();
      const { data: h } = this.context.getImageData(Ht.x, Ht.y, Ht.width || 1, Ht.height || 1);
      for (let t3 = 0, e3 = h.length; t3 < e3; t3 += 4) if (h[t3 + 3] > 0) return true;
      return h[3] > 0;
    };
  }
});

// node_modules/.pnpm/leafer-ui@2.3.3/node_modules/leafer-ui/dist/web.esm.min.js
function tt3(t2, e2, i2, s2) {
  return new (i2 || (i2 = Promise))(function(n3, o2) {
    function r3(t3) {
      try {
        h(s2.next(t3));
      } catch (t4) {
        o2(t4);
      }
    }
    function a(t3) {
      try {
        h(s2.throw(t3));
      } catch (t4) {
        o2(t4);
      }
    }
    function h(t3) {
      var e3;
      t3.done ? n3(t3.value) : (e3 = t3.value, e3 instanceof i2 ? e3 : new i2(function(t4) {
        t4(e3);
      })).then(r3, a);
    }
    h((s2 = s2.apply(t2, e2 || [])).next());
  });
}
function st2(t2, e2) {
  Kt.origin = { createCanvas(t3, e3) {
    const i2 = document.createElement("canvas");
    return i2.width = t3, i2.height = e3, i2;
  }, canvasToDataURL: (t3, e3, i2) => {
    const s2 = $r.mimeType(e3), n3 = t3.toDataURL(s2, i2);
    return "image/bmp" === s2 ? n3.replace("image/png;", "image/bmp;") : n3;
  }, canvasToBolb: (t3, e3, i2) => new Promise((s2) => t3.toBlob(s2, $r.mimeType(e3), i2)), canvasSaveAs: (t3, e3, s2) => {
    const n3 = t3.toDataURL($r.mimeType($r.fileType(e3)), s2);
    return Kt.origin.download(n3, e3);
  }, download(t3, e3) {
    return tt3(this, void 0, void 0, function* () {
      let i2 = document.createElement("a");
      i2.href = t3, i2.download = e3, document.body.appendChild(i2), i2.click(), document.body.removeChild(i2);
    });
  }, loadImage: (t3, e3, s2) => new Promise((s3, n3) => {
    const o2 = new Kt.origin.Image();
    e3 && (o2.setAttribute("crossOrigin", e3), o2.crossOrigin = e3), o2.onload = () => {
      s3(o2);
    }, o2.onerror = (t4) => {
      n3(t4);
    }, o2.src = Kt.image.getRealURL(t3);
  }), loadContent(t3) {
    return tt3(this, arguments, void 0, function* (t4, e3 = "text") {
      const i2 = yield fetch(t4);
      if (!i2.ok) throw new Error(`${i2.status}`);
      return yield i2[e3]();
    });
  }, Image, PointerEvent, DragEvent }, Kt.event = { stopDefault(t3) {
    t3.preventDefault();
  }, stopNow(t3) {
    t3.stopImmediatePropagation();
  }, stop(t3) {
    t3.stopPropagation();
  } }, Kt.canvas = de.canvas(), Kt.conicGradientSupport = !!Kt.canvas.context.createConicGradient;
}
function ut3(t2, e2) {
  e2.add(t2), ct3(t2, e2);
}
function Rt4(t2, e2, i2, s2) {
  t2.__.__font ? It2.fillText(t2, e2, i2, s2) : t2.__.windingRule ? e2.fill(t2.__.windingRule) : e2.fill();
}
function Mt4(t2, e2, i2, s2, n3) {
  const o2 = i2.__;
  d(t2) ? It2.drawStrokesStyle(t2, e2, false, i2, s2, n3) : (s2.setStroke(t2, o2.__strokeWidth * e2, o2), s2.stroke()), o2.__useArrow && It2.strokeArrow(t2, i2, s2, n3);
}
function Ct4(t2, e2, i2, s2, n3) {
  const o2 = i2.__;
  d(t2) ? It2.drawStrokesStyle(t2, e2, true, i2, s2, n3) : (s2.setStroke(t2, o2.__strokeWidth * e2, o2), It2.drawTextStroke(i2, s2, n3));
}
function At4(t2, e2, i2, s2, n3) {
  const o2 = s2.getSameCanvas(true, true);
  o2.font = i2.__.__font, Ct4(t2, 2, i2, o2, n3), o2.blendMode = "outside" === e2 ? "destination-out" : "destination-in", It2.fillText(i2, o2, n3), o2.blendMode = "normal", wo.copyCanvasByWorld(i2, s2, o2), o2.recycle(i2.__nowWorld);
}
function Vt4(t2, e2, i2) {
  if (!d(e2) || false === e2.visible || 0 === e2.opacity) return;
  let n3, o2;
  const { boxBounds: a } = i2.__layout, { type: h } = e2;
  switch (h) {
    case "image":
    case "film":
    case "video":
      if (!e2.url) return;
      o2 = Yt4 && Yt4[e2.url], n3 = Dt2.image(i2, t2, e2, a, o2), "image" !== h && Dt2[h](n3, o2);
      break;
    case "linear":
      n3 = Et2.linearGradient(e2, a);
      break;
    case "radial":
      n3 = Et2.radialGradient(e2, a);
      break;
    case "angular":
      n3 = Et2.conicGradient(e2, a);
      break;
    case "solid":
      const { color: s2, opacity: l2 } = e2;
      n3 = { type: h, style: Pt2.string(s2, l2) };
      break;
    default:
      s(e2.r) || (n3 = { type: "solid", style: Pt2.string(e2) });
  }
  if (n3 && (n3.originPaint = e2, r(n3.style) && Xt4(n3.style) && (n3.isTransparent = true), e2.style)) {
    if (0 === e2.style.strokeWidth) return;
    n3.strokeStyle = e2.style;
  }
  return n3;
}
function Qt3(t2, e2, i2, s2, n3, o2) {
  let r3 = true;
  const a = t2.__;
  if ("fill" !== e2 || a.__naturalWidth || (a.__naturalWidth = s2.width / a.pixelRatio, a.__naturalHeight = s2.height / a.pixelRatio, a.__autoSide && (t2.forceUpdate(), wo.updateBounds(t2, true), t2.__layout.boundsChanged = true, t2.__proxyData && (t2.setProxyAttr("width", a.width), t2.setProxyAttr("height", a.height)), r3 = false)), "brush" === i2.mode && Dt2.brush(t2, e2, n3), !n3.data) {
    Dt2.createData(n3, s2, i2, o2);
    const { transform: t3 } = n3.data, { opacity: e3 } = i2, r4 = (t3 && !t3.onlyScale || a.path || a.cornerRadius) && !n3.brush;
    (r4 || e3 && e3 < 1 || i2.blendMode) && (n3.complex = !r4 || 2);
  }
  return i2.filter && Dt2.applyFilter(n3, s2, i2.filter, t2), r3;
}
function $t3(t2, e2) {
  te3(t2, ea.LOAD, e2);
}
function Zt3(t2, e2) {
  te3(t2, ea.LOADED, e2);
}
function Jt3(t2, e2, i2) {
  e2.error = i2, t2.forceUpdate("surface"), te3(t2, ea.ERROR, e2);
}
function te3(t2, e2, i2) {
  t2.hasEvent(e2) && t2.emitEvent(new ea(e2, i2));
}
function ee3(t2, e2) {
  const { leafer: i2 } = t2;
  i2 && i2.viewReady && (i2.renderer.ignore = e2);
}
function ae3(t2, e2, i2, n3) {
  const o2 = r(t2) || n3 ? (n3 ? i2 - n3 * e2 : i2 % e2) / ((n3 || Math.floor(i2 / e2)) - 1) : t2;
  return "auto" === t2 && o2 < 0 ? 0 : o2;
}
function ve3(t2, e2, i2, s2, n3, o2, r3, a) {
  r3 && we3(t2, r3), a && me3(t2, a.x, a.y), n3 && _e3(t2, n3, o2), fe3(t2, e2.x + i2, e2.y + s2);
}
function Re3(t2, e2, i2, n3) {
  if (i2) {
    let o2, r3, a, h;
    for (let t3 = 0, l2 = i2.length; t3 < l2; t3++) o2 = i2[t3], r(o2) ? (a = t3 / (l2 - 1), r3 = Pt2.string(o2, n3)) : (a = o2.offset, r3 = Pt2.string(o2.color, n3)), e2.addColorStop(a, r3), !h && ke3(r3) && (h = true);
    h && (t2.isTransparent = true);
  }
}
function ze3(t2, e2, i2, s2, n3) {
  let o2;
  const { width: r3, height: a } = t2;
  if (r3 !== a || s2) {
    const t3 = Me3(e2, i2);
    o2 = Ae3(), n3 ? (Oe3(o2, e2, r3 / a * (s2 || 1), 1), De3(o2, e2, t3 + 90)) : (Oe3(o2, e2, 1, r3 / a * (s2 || 1)), De3(o2, e2, t3));
  }
  return o2;
}
function Je3(t2, e2) {
  let i2, s2, n3, o2, r3 = 0, a = 0, h = 0, l2 = 0;
  return e2.forEach((t3) => {
    i2 = t3.x || 0, s2 = t3.y || 0, o2 = 1.5 * (t3.blur || 0), n3 = Ke3(t3.spread || 0), r3 = qe3(r3, n3 + o2 - s2), a = qe3(a, n3 + o2 + i2), h = qe3(h, n3 + o2 + s2), l2 = qe3(l2, n3 + o2 - i2);
  }), r3 === a && a === h && h === l2 ? r3 : [r3, a, h, l2];
}
function ti3(t2, e2, s2) {
  const { shapeBounds: n3 } = s2;
  let o2, r3;
  Kt.fullImageShadow ? (Ve3(Qe3, t2.bounds), He3(Qe3, e2.x - n3.x, e2.y - n3.y), o2 = t2.bounds, r3 = Qe3) : (o2 = n3, r3 = e2), t2.copyWorld(s2.canvas, o2, r3);
}
function ai3(t2, e2, i2, s2, n3, o2, r3, a) {
  switch (e2) {
    case "grayscale":
      ri3 || (ri3 = true, n3.useGrayscaleAlpha(t2.__nowWorld));
    case "alpha":
      !(function(t3, e3, i3, s3, n4, o3) {
        const r4 = t3.__nowWorld;
        i3.resetTransform(), i3.opacity = 1, i3.useMask(s3, r4), o3 && s3.recycle(r4);
        li3(t3, e3, i3, 1, n4, o3);
      })(t2, i2, s2, n3, r3, a);
      break;
    case "opacity-path":
      li3(t2, i2, s2, o2, r3, a);
      break;
    case "path":
      a && i2.restore();
  }
}
function hi2(t2) {
  return t2.getSameCanvas(false, true);
}
function li3(t2, e2, i2, s2, n3, o2) {
  const r3 = t2.__nowWorld;
  e2.resetTransform(), e2.opacity = s2, e2.copyWorld(i2, r3, void 0, n3), o2 ? i2.recycle(r3) : i2.clearWorld(r3);
}
function fi2(t2) {
  const e2 = {};
  return t2.split("").forEach((t3) => e2[t3] = true), e2;
}
function Li2(t2) {
  return pi3[t2] ? yi3 : mi2[t2] ? Bi2 : gi3[t2] ? bi2 : _i3[t2] ? Si2 : wi2[t2] ? Ti2 : ui3.test(t2) ? xi2 : yi3;
}
function Ei2(t2, e2, i2) {
  switch (e2) {
    case "title":
      return i2 ? t2.toUpperCase() : t2;
    case "upper":
      return t2.toUpperCase();
    case "lower":
      return t2.toLowerCase();
    default:
      return t2;
  }
}
function ts2(t2, e2) {
  Xi2 && !Gi2 && (Gi2 = Xi2), Wi2.data.push({ char: t2, width: e2 }), Fi2 += e2;
}
function es2(t2) {
  t2 && (zi2 += t2, Wi2.addWidth = t2), zi2 += Fi2, Wi2.width = Fi2, Ii2.words.push(Wi2), Wi2 = { data: [] }, Fi2 = 0;
}
function is2() {
  Ki2 && (Qi2.paraNumber++, Ii2.paraStart = true, Ki2 = false), Xi2 && (Ii2.startCharSize = Gi2, Ii2.endCharSize = Xi2, Gi2 = 0), Ii2.width = zi2, $i2.width ? Pi2(Ii2) : Zi2 && ss2(), Ji2.push(Ii2), Ii2 = { words: [] }, zi2 = 0;
}
function ss2() {
  zi2 > (Qi2.maxWidth || 0) && (Qi2.maxWidth = zi2);
}
function hs2(t2, e2, i2) {
  const { bounds: s2, rows: n3 } = t2;
  s2[e2] += i2;
  for (let t3 = 0; t3 < n3.length; t3++) n3[t3][e2] += i2;
}
var J3, et3, it3, nt3, ot3, rt2, at3, ht3, lt3, ct3, dt3, ft3, pt3, gt2, _t3, wt3, mt4, vt3, yt3, xt3, bt3, St3, Tt4, Bt4, Lt4, kt4, Et4, Pt4, Dt4, Ot3, Wt4, It4, Ft4, zt3, jt4, Ut4, Yt4, Gt3, Xt4, Ht4, Nt4, qt3, Kt4, ie3, se3, ne3, oe3, re3, he3, le3, ce3, de3, ue3, fe3, pe3, ge3, _e3, we3, me3, ye3, xe3, be3, Se3, Te3, Be3, Le3, ke3, Ee3, Pe3, Me3, Ce3, Ae3, De3, Oe3, We3, Ie3, Fe3, je3, Ue3, Ye3, Ge3, Xe3, Ve3, He3, Ne3, qe3, Ke3, Qe3, $e3, Ze3, ei3, ii3, si3, ni3, oi3, ri3, ci3, di3, ui3, pi3, gi3, _i3, wi2, mi2, vi3, yi3, xi2, bi2, Si2, Ti2, Bi2, ki2, Pi2, Ri2, Mi2, Ci2, Ai2, Di2, Oi2, Wi2, Ii2, Fi2, zi2, ji2, Ui2, Yi2, Gi2, Xi2, Vi2, Hi2, Ni2, qi2, Ki2, Qi2, $i2, Zi2, Ji2, ns2, os2, rs2, as2, ls2, cs2;
var init_web_esm_min = __esm({
  "node_modules/.pnpm/leafer-ui@2.3.3/node_modules/leafer-ui/dist/web.esm.min.js"() {
    init_core_esm_min();
    init_core_esm_min();
    init_core_esm_min();
    init_core_esm_min2();
    init_core_esm_min2();
    init_draw_esm_min();
    !(function(t2) {
      t2[t2.none = 1] = "none", t2[t2.free = 2] = "free", t2[t2.mirrorAngle = 3] = "mirrorAngle", t2[t2.mirror = 4] = "mirror";
    })(J3 || (J3 = {})), "function" == typeof SuppressedError && SuppressedError;
    et3 = se.get("LeaferCanvas");
    it3 = class extends Ee {
      set zIndex(t2) {
        const { style: e2 } = this.view;
        e2.zIndex = t2, this.setAbsolute(this.view);
      }
      set childIndex(t2) {
        const { view: e2, parentView: i2 } = this;
        if (e2 && i2) {
          const s2 = i2.children[t2];
          s2 ? (this.setAbsolute(s2), i2.insertBefore(e2, s2)) : i2.appendChild(s2);
        }
      }
      init() {
        const { config: t2 } = this, e2 = t2.view || t2.canvas;
        e2 ? this.__createViewFrom(e2) : this.__createView();
        const { style: s2 } = this.view;
        if (s2.display || (s2.display = "block"), this.parentView = this.view.parentElement, this.parentView) {
          const t3 = this.parentView.style;
          t3.webkitUserSelect = t3.userSelect = "none", this.view.classList.add("leafer-canvas-view");
        }
        Kt.syncDomFont && !this.parentView && (s2.display = "none", document.body && document.body.appendChild(this.view)), this.__createContext(), this.autoLayout || this.resize(t2);
      }
      set backgroundColor(t2) {
        this.view.style.backgroundColor = t2;
      }
      get backgroundColor() {
        return this.view.style.backgroundColor;
      }
      set hittable(t2) {
        this.view.style.pointerEvents = t2 ? "auto" : "none";
      }
      get hittable() {
        return "none" !== this.view.style.pointerEvents;
      }
      __createView() {
        this.view = document.createElement("canvas");
      }
      __createViewFrom(t2) {
        let e2 = r(t2) ? document.getElementById(t2) : t2;
        if (e2) if (e2 instanceof HTMLCanvasElement) this.view = e2;
        else {
          let t3 = e2;
          if (e2 === window || e2 === document) {
            const e3 = document.createElement("div"), { style: i3 } = e3;
            i3.position = "absolute", i3.top = i3.bottom = i3.left = i3.right = "0px", document.body.appendChild(e3), t3 = e3;
          }
          this.__createView();
          const i2 = this.view;
          t3.hasChildNodes() && (this.setAbsolute(i2), t3.style.position || (t3.style.position = "relative")), t3.appendChild(i2);
        }
        else et3.error(`no id: ${t2}`), this.__createView();
      }
      setAbsolute(t2) {
        const { style: e2 } = t2;
        e2.position = "absolute", e2.top = e2.left = "0px";
      }
      updateViewSize() {
        const { width: t2, height: e2, pixelRatio: i2 } = this, { style: s2 } = this.view;
        s2.width = t2 + "px", s2.height = e2 + "px", this.unreal || (this.view.width = Math.ceil(t2 * i2), this.view.height = Math.ceil(e2 * i2));
      }
      updateClientBounds() {
        this.view.parentElement && (this.clientBounds = this.view.getBoundingClientRect());
      }
      startAutoLayout(t2, e2) {
        if (this.resizeListener = e2, t2) {
          if (this.autoBounds = t2, this.resizeObserver) return;
          try {
            this.resizeObserver = new ResizeObserver((t4) => {
              this.updateClientBounds();
              for (const e3 of t4) this.checkAutoBounds(e3.contentRect);
            });
            const t3 = this.parentView;
            t3 ? (this.resizeObserver.observe(t3), this.checkAutoBounds(t3.getBoundingClientRect())) : (this.checkAutoBounds(this.view), et3.warn("no parent"));
          } catch (t3) {
            this.imitateResizeObserver();
          }
          this.stopListenPixelRatio();
        } else this.listenPixelRatio(), this.unreal && this.updateViewSize();
      }
      imitateResizeObserver() {
        this.autoLayout && (this.parentView && this.checkAutoBounds(this.parentView.getBoundingClientRect()), Kt.requestRender(this.imitateResizeObserver.bind(this)));
      }
      listenPixelRatio() {
        this.windowListener || window.addEventListener("resize", this.windowListener = () => {
          const t2 = Kt.devicePixelRatio;
          if (!this.config.pixelRatio && this.pixelRatio !== t2) {
            const { width: e2, height: i2 } = this;
            this.emitResize({ width: e2, height: i2, pixelRatio: t2 });
          }
        });
      }
      stopListenPixelRatio() {
        this.windowListener && (window.removeEventListener("resize", this.windowListener), this.windowListener = null);
      }
      checkAutoBounds(t2) {
        const e2 = this.view, { x: s2, y: n3, width: o2, height: r3 } = this.autoBounds.getBoundsFrom(t2), a = { width: o2, height: r3, pixelRatio: this.config.pixelRatio ? this.pixelRatio : Kt.devicePixelRatio };
        if (!this.isSameSize(a)) {
          const { style: t3 } = e2;
          t3.marginLeft = s2 + "px", t3.marginTop = n3 + "px", this.emitResize(a);
        }
      }
      stopAutoLayout() {
        this.autoLayout = false, this.resizeObserver && this.resizeObserver.disconnect(), this.resizeListener = this.resizeObserver = null;
      }
      emitResize(t2) {
        const e2 = {};
        _.copyAttrs(e2, this, Ie), this.resize(t2), this.resizeListener && !s(this.width) && this.resizeListener(new ha(t2, e2));
      }
      unrealCanvas() {
        if (!this.unreal && this.parentView) {
          let t2 = this.view;
          t2 && t2.remove(), t2 = this.view = document.createElement("div"), this.parentView.appendChild(this.view), t2.classList.add("leafer-app-view"), this.unreal = true;
        }
      }
      destroy() {
        const { view: t2 } = this;
        t2 && (this.stopAutoLayout(), this.stopListenPixelRatio(), t2.parentElement && t2.remove(), super.destroy());
      }
    };
    Zr(CanvasRenderingContext2D.prototype), Zr(Path2D.prototype), Object.assign(de, { canvas: (t2, e2) => new it3(t2, e2), image: (t2) => new cn(t2) }), Kt.name = "web", Kt.isMobile = "ontouchstart" in window, Kt.requestRender = function(t2) {
      window.requestAnimationFrame(t2);
    }, pn(Kt, "devicePixelRatio", { get: () => devicePixelRatio });
    ({ userAgent: nt3 } = navigator);
    nt3.indexOf("Firefox") > -1 ? (Kt.intWheelDeltaY = true, Kt.syncDomFont = true) : (/iPhone|iPad|iPod/.test(navigator.userAgent) || /Macintosh/.test(navigator.userAgent) && /Version\/[\d.]+.*Safari/.test(navigator.userAgent)) && (Kt.fullImageShadow = true), nt3.indexOf("Windows") > -1 ? (Kt.os = "Windows", Kt.intWheelDeltaY = true) : nt3.indexOf("Mac") > -1 ? Kt.os = "Mac" : nt3.indexOf("Linux") > -1 && (Kt.os = "Linux");
    ot3 = class {
      get childrenChanged() {
        return this.hasAdd || this.hasRemove || this.hasVisible;
      }
      get updatedList() {
        if (this.hasRemove && this.config.usePartLayout) {
          const t2 = new Mh();
          return this.__updatedList.list.forEach((e2) => {
            e2.leafer && t2.add(e2);
          }), t2;
        }
        return this.__updatedList;
      }
      constructor(t2, e2) {
        this.totalTimes = 0, this.changed = 0, this.config = {}, this.__updatedList = new Mh(), this.target = t2, e2 && (this.config = _.default(e2, this.config)), this.__listenEvents();
      }
      start() {
        this.disabled || (this.running = true);
      }
      stop() {
        this.running = false;
      }
      disable() {
        this.stop(), this.__removeListenEvents(), this.disabled = true;
      }
      update() {
        this.changed < 100 && (this.changed++, this.running && this.target.emit(ca.REQUEST));
      }
      __onAttrChange(t2) {
        this.add(t2.target);
      }
      add(t2) {
        this.config.usePartLayout && this.__updatedList.add(t2), this.update();
      }
      addChild(t2, e2, i2) {
        this.config.usePartLayout && (i2 === Zo.ADD ? (this.hasAdd = true, this.__pushChild(t2)) : (this.hasRemove = true, this.__updatedList.add(e2))), this.update();
      }
      __onChildEvent(t2) {
        this.addChild(t2.child, t2.parent, t2.type);
      }
      __pushChild(t2) {
        this.__updatedList.add(t2), t2.isBranch && this.__loopChildren(t2);
      }
      __loopChildren(t2) {
        const { children: e2 } = t2;
        for (let t3 = 0, i2 = e2.length; t3 < i2; t3++) this.__pushChild(e2[t3]);
      }
      __onRquestData() {
        this.target.emitEvent(new la(la.DATA, { updatedList: this.updatedList })), this.__updatedList = new Mh(), this.totalTimes++, this.hasVisible = this.hasRemove = this.hasAdd = false, this.changed = 0;
      }
      __listenEvents() {
        this.__eventIds = [this.target.on_([[Ko.CHANGE, this.__onAttrChange, this], [[Zo.ADD, Zo.REMOVE], this.__onChildEvent, this], [la.REQUEST, this.__onRquestData, this]])];
      }
      __removeListenEvents() {
        this.target.off_(this.__eventIds);
      }
      destroy() {
        this.target && (this.stop(), this.__removeListenEvents(), this.target = this.__updatedList = null);
      }
    };
    ({ updateAllMatrix: rt2, updateBounds: at3, updateChange: ht3 } = wo);
    ({ pushAllChildBranch: lt3, pushAllParent: ct3 } = Eo);
    dt3 = { updateMatrix(t2, e2) {
      let i2, s2, n3 = 0;
      const { list: o2 } = t2;
      for (; n3 < o2.length; ) i2 = o2[n3], s2 = i2.__layout, e2.without(i2) && !s2.proxyZoom && (s2.matrixChanged ? (rt2(i2, true), i2.isBranch && lt3(i2, e2), ut3(i2, e2)) : s2.boundsChanged && (i2.isBranch && (i2.__tempNumber = 0), ut3(i2, e2))), n3++;
    }, updateBounds(t2) {
      let e2, i2, s2, n3, o2 = 0;
      const { levels: r3, levelMap: a } = t2;
      for (t2.sort(true); o2 < r3.length; ) {
        e2 = r3[o2], i2 = a[e2];
        for (let t3 = 0, e3 = i2.length; t3 < e3; t3++) {
          if (s2 = i2[t3], s2.isBranch && s2.__tempNumber) {
            n3 = s2.children;
            for (let t4 = 0, e4 = n3.length; t4 < e4; t4++) n3[t4].isBranch || at3(n3[t4]);
          }
          at3(s2);
        }
        o2++;
      }
    }, updateChange(t2) {
      t2.list.forEach(ht3);
    }, push: ut3 };
    ({ worldBounds: ft3 } = So);
    pt3 = class {
      constructor(t2) {
        this.updatedBounds = new qt(), this.beforeBounds = new qt(), this.afterBounds = new qt(), l(t2) && (t2 = new Mh(t2)), this.updatedList = t2;
      }
      setBefore() {
        this.beforeBounds.setListWithFn(this.updatedList.list, ft3);
      }
      setAfter() {
        this.afterBounds.setListWithFn(this.updatedList.list, ft3), this.updatedBounds.setList([this.beforeBounds, this.afterBounds]);
      }
      merge(t2) {
        this.updatedList.addList(t2.updatedList.list), this.beforeBounds.add(t2.beforeBounds), this.afterBounds.add(t2.afterBounds), this.updatedBounds.add(t2.updatedBounds);
      }
      destroy() {
        this.updatedList = null;
      }
    };
    ({ updateAllMatrix: gt2, updateAllChange: _t3 } = wo);
    wt3 = se.get("Layouter");
    mt4 = class _mt {
      constructor(t2, e2) {
        this.totalTimes = 0, this.config = { usePartLayout: true }, this.__levelList = new Ah(), this.target = t2, e2 && (this.config = _.default(e2, this.config)), this.__listenEvents();
      }
      start() {
        this.disabled || (this.running = true);
      }
      stop() {
        this.running = false;
      }
      disable() {
        this.stop(), this.__removeListenEvents(), this.disabled = true;
      }
      layout() {
        if (this.layouting || !this.running) return;
        const { target: t2 } = this;
        this.times = 0;
        try {
          t2.emit(da.START), this.layoutOnce(), t2.emitEvent(new da(da.END, this.layoutedBlocks, this.times));
        } catch (t3) {
          wt3.error(t3);
        }
        this.layoutedBlocks = null;
      }
      layoutAgain() {
        this.layouting ? this.waitAgain = true : this.layoutOnce();
      }
      layoutOnce() {
        return this.layouting ? wt3.warn("layouting") : this.times > 3 ? wt3.warn("layout max times") : (this.times++, this.totalTimes++, this.layouting = true, this.target.emit(la.REQUEST), this.totalTimes > 1 && this.config.usePartLayout ? this.partLayout() : this.fullLayout(), this.layouting = false, void (this.waitAgain && (this.waitAgain = false, this.layoutOnce())));
      }
      partLayout() {
        var t2;
        if (!(null === (t2 = this.__updatedList) || void 0 === t2 ? void 0 : t2.length)) return;
        const e2 = oe.start("PartLayout"), { target: i2, __updatedList: s2 } = this, { BEFORE: n3, LAYOUT: o2, AFTER: r3 } = da, a = this.getBlocks(s2);
        a.forEach((t3) => t3.setBefore()), i2.emitEvent(new da(n3, a, this.times)), this.extraBlock = null, s2.sort(), dt3.updateMatrix(s2, this.__levelList), dt3.updateBounds(this.__levelList), dt3.updateChange(s2), this.extraBlock && a.push(this.extraBlock), a.forEach((t3) => t3.setAfter()), i2.emitEvent(new da(o2, a, this.times)), i2.emitEvent(new da(r3, a, this.times)), this.addBlocks(a), this.__levelList.reset(), this.__updatedList = null, oe.end(e2);
      }
      fullLayout() {
        const t2 = oe.start("FullLayout"), { target: e2 } = this, { BEFORE: i2, LAYOUT: s2, AFTER: n3 } = da, o2 = this.getBlocks(new Mh(e2));
        e2.emitEvent(new da(i2, o2, this.times)), _mt.fullLayout(e2), o2.forEach((t3) => {
          t3.setAfter();
        }), e2.emitEvent(new da(s2, o2, this.times)), e2.emitEvent(new da(n3, o2, this.times)), this.addBlocks(o2), oe.end(t2);
      }
      static fullLayout(t2) {
        gt2(t2, true), t2.isBranch ? Eo.updateBounds(t2) : wo.updateBounds(t2), _t3(t2);
      }
      addExtra(t2, e2) {
        if (!this.__updatedList.has(t2)) {
          const { updatedList: i2, beforeBounds: s2 } = this.extraBlock || (this.extraBlock = new pt3([]));
          if (i2.length ? s2.add(t2.__world) : s2.set(t2.__world), i2.add(t2), e2) {
            const e3 = this.__levelList;
            dt3.push(t2, e3), e3.sort(true);
          }
        }
      }
      createBlock(t2) {
        return new pt3(t2);
      }
      getBlocks(t2) {
        return [this.createBlock(t2)];
      }
      addBlocks(t2) {
        this.layoutedBlocks ? this.layoutedBlocks.push(...t2) : this.layoutedBlocks = t2;
      }
      __onReceiveWatchData(t2) {
        this.__updatedList = t2.data.updatedList;
      }
      __listenEvents() {
        this.__eventIds = [this.target.on_([[da.REQUEST, this.layout, this], [da.AGAIN, this.layoutAgain, this], [la.DATA, this.__onReceiveWatchData, this]])];
      }
      __removeListenEvents() {
        this.target.off_(this.__eventIds);
      }
      destroy() {
        this.target && (this.stop(), this.__removeListenEvents(), this.target = this.config = null);
      }
    };
    vt3 = se.get("Renderer");
    yt3 = class _yt {
      get needFill() {
        return !(this.canvas.allowBackgroundColor || !this.config.fill);
      }
      constructor(t2, e2, i2) {
        this.FPS = 60, this.totalTimes = 0, this.times = 0, this.config = { usePartRender: true, ceilPartPixel: true, maxFPS: 120 }, this.frames = [], this.target = t2, this.canvas = e2, i2 && (this.config = _.default(i2, this.config)), this.__listenEvents();
      }
      start() {
        this.running = true, this.update(false);
      }
      stop() {
        this.running = false;
      }
      update(t2 = true) {
        this.changed || (this.changed = t2), this.requestTime || this.__requestRender();
      }
      requestLayout() {
        this.target.emit(da.REQUEST);
      }
      checkRender() {
        if (this.running) {
          const { target: t2 } = this;
          t2.isApp && (t2.emit(ca.CHILD_START, t2), t2.children.forEach((t3) => {
            t3.renderer.FPS = this.FPS, t3.renderer.checkRender();
          }), t2.emit(ca.CHILD_END, t2)), this.changed && this.canvas.view && this.render(), this.target.emit(ca.NEXT);
        }
      }
      render(t2) {
        if (!this.running || !this.canvas.view) return this.update();
        const { target: e2 } = this;
        this.times = 0, this.totalBounds = new qt(), vt3.log(e2.innerName, "--->");
        try {
          this.emitRender(ca.START), this.renderOnce(t2), this.emitRender(ca.END, this.totalBounds), an.clearRecycled();
        } catch (t3) {
          this.rendering = false, vt3.error(t3);
        }
        vt3.log("-------------|");
      }
      renderAgain() {
        this.rendering ? this.waitAgain = true : this.renderOnce();
      }
      renderOnce(t2) {
        if (this.rendering) return vt3.warn("rendering");
        if (this.times > 3) return vt3.warn("render max times");
        if (this.times++, this.totalTimes++, this.rendering = true, this.changed = false, this.renderBounds = new qt(), this.renderOptions = {}, t2) this.emitRender(ca.BEFORE), t2();
        else {
          if (this.requestLayout(), this.ignore) return void (this.ignore = this.rendering = false);
          this.emitRender(ca.BEFORE), this.config.usePartRender && this.totalTimes > 1 ? this.partRender() : this.fullRender();
        }
        this.emitRender(ca.RENDER, this.renderBounds, this.renderOptions), this.emitRender(ca.AFTER, this.renderBounds, this.renderOptions), this.updateBlocks = null, this.rendering = false, this.waitAgain && (this.waitAgain = false, this.renderOnce());
      }
      partRender() {
        const { canvas: t2, updateBlocks: e2 } = this;
        e2 && (this.mergeBlocks(), e2.forEach((e3) => {
          t2.bounds.hit(e3) && !e3.isEmpty() && this.clipRender(e3);
        }));
      }
      clipRender(t2) {
        const e2 = oe.start("PartRender"), { canvas: i2 } = this, s2 = t2.getIntersect(i2.bounds), n3 = new qt(s2);
        i2.save(), s2.spread(_yt.clipSpread).ceil();
        const { ceilPartPixel: o2 } = this.config;
        i2.clipWorld(s2, o2), i2.clearWorld(s2, o2), this.__render(s2, n3), i2.restore(), oe.end(e2);
      }
      fullRender() {
        const t2 = oe.start("FullRender"), { canvas: e2 } = this;
        e2.save(), e2.clear(), this.__render(e2.bounds), e2.restore(), oe.end(t2);
      }
      __render(e2, s2) {
        const { canvas: n3, target: o2 } = this, r3 = e2.includes(o2.__world), a = r3 ? { includes: r3 } : { bounds: e2, includes: r3 };
        this.needFill && n3.fillWorld(e2, this.config.fill), se.showRepaint && se.drawRepaint(n3, e2), this.config.useCellRender && (a.cellList = this.getCellList()), Kt.render(o2, n3, a), this.renderBounds = s2 = s2 || e2, this.renderOptions = a, this.totalBounds.isEmpty() ? this.totalBounds = s2 : this.totalBounds.add(s2), n3.updateRender(s2);
      }
      getCellList() {
      }
      addBlock(t2, e2) {
        this.updateBlocks || (this.updateBlocks = []), this.updateBlocks.push(t2);
      }
      mergeBlocks() {
        const { updateBlocks: t2 } = this;
        if (t2) {
          const e2 = new qt();
          e2.setList(t2), t2.length = 0, t2.push(e2);
        }
      }
      __requestRender() {
        const t2 = this.target;
        if (this.requestTime || !t2) return;
        if (t2.parentApp) return t2.parentApp.requestRender(false);
        this.requestTime = this.frameTime || Date.now();
        const e2 = () => {
          const t3 = 1e3 / ((this.frameTime = Date.now()) - this.requestTime), { maxFPS: s2 } = this.config;
          if (s2 && t3 > s2) return Kt.requestRender(e2);
          const { frames: n3 } = this;
          n3.length > 30 && n3.shift(), n3.push(t3), this.FPS = Math.round(n3.reduce((t4, e3) => t4 + e3, 0) / n3.length), this.requestTime = 0, this.checkRender();
        };
        Kt.requestRender(e2);
      }
      __onResize(t2) {
        if (!this.canvas.unreal) {
          if (t2.bigger || !t2.samePixelRatio) {
            const { width: e2, height: i2 } = t2.old;
            if (!new qt(0, 0, e2, i2).includes(this.target.__world) || this.needFill || !t2.samePixelRatio) return this.addBlock(this.canvas.bounds), void this.target.forceUpdate("surface");
          }
          this.addBlock(new qt(0, 0, 1, 1)), this.update();
        }
      }
      __onLayoutEnd(t2) {
        t2.data && t2.data.map((t3) => {
          let e2;
          const { updatedList: i2 } = t3;
          i2 && i2.list.some((t4) => (e2 = !t4.__world.width || !t4.__world.height, e2 && (t4.isLeafer || vt3.tip(t4.innerName, ": empty"), e2 = !t4.isBranch || t4.isBranchLeaf), e2)), this.addBlock(e2 ? this.canvas.bounds : t3.updatedBounds, i2);
        });
      }
      emitRender(t2, e2, i2) {
        this.target.emitEvent(new ca(t2, this.times, e2, i2));
      }
      __listenEvents() {
        this.__eventIds = [this.target.on_([[ca.REQUEST, this.update, this], [da.END, this.__onLayoutEnd, this], [ca.AGAIN, this.renderAgain, this], [ha.RESIZE, this.__onResize, this]])];
      }
      __removeListenEvents() {
        this.target.off_(this.__eventIds);
      }
      destroy() {
        this.target && (this.stop(), this.__removeListenEvents(), this.config = {}, this.target = this.canvas = null);
      }
    };
    yt3.clipSpread = 10;
    xt3 = {};
    ({ copyRadiusPoint: bt3 } = at);
    ({ hitRadiusPoint: St3 } = Ft);
    Tt4 = class {
      constructor(t2, e2) {
        this.target = t2, this.selector = e2;
      }
      getByPoint(t2, e2, i2) {
        e2 || (e2 = 0), i2 || (i2 = {});
        const s2 = i2.through || false, n3 = i2.ignoreHittable || false, o2 = i2.target || this.target;
        this.exclude = i2.exclude || null, this.point = { x: t2.x, y: t2.y, radiusX: e2, radiusY: e2 }, this.findList = new Mh(i2.findList), i2.findList || this.hitBranch(o2.isBranchLeaf ? { children: [o2] } : o2);
        const { list: r3 } = this.findList, a = this.getBestMatchLeaf(r3, i2.bottomList, n3, !!i2.findList), h = n3 ? this.getPath(a) : this.getHitablePath(a);
        return this.clear(), s2 ? { path: h, target: a, throughPath: r3.length ? this.getThroughPath(r3) : h } : { path: h, target: a };
      }
      hitPoint(t2, e2, i2) {
        return !!this.getByPoint(t2, e2, i2).target;
      }
      getBestMatchLeaf(t2, e2, i2, s2) {
        const n3 = this.findList = new Mh();
        if (t2.length) {
          let e3;
          const { x: s3, y: o2 } = this.point, r3 = { x: s3, y: o2, radiusX: 0, radiusY: 0 };
          for (let s4 = 0, o3 = t2.length; s4 < o3; s4++) if (e3 = t2[s4], (i2 || wo.worldHittable(e3)) && (this.hitChild(e3, e3.hitThrough ? this.point : r3, e3.mask && e3.parent && e3.parent.__onlyHitMask), n3.length)) {
            if (e3.isBranchLeaf && t2.some((t3) => t3 !== e3 && wo.hasParent(t3, e3))) {
              n3.reset();
              break;
            }
            return n3.list[0];
          }
        }
        if (e2) {
          for (let t3 = 0, i3 = e2.length; t3 < i3; t3++) if (this.hitChild(e2[t3].target, this.point, void 0, e2[t3].proxy), n3.length) return n3.list[0];
        }
        return s2 ? null : i2 ? t2[0] : t2.find((t3) => wo.worldHittable(t3));
      }
      getPath(t2) {
        const e2 = new Mh(), i2 = [], { target: s2 } = this;
        for (; t2 && (t2.syncEventer && i2.push(t2.syncEventer), e2.add(t2), (t2 = t2.parent) !== s2); ) ;
        return i2.length && i2.forEach((t3) => {
          for (; t3 && (t3.__.hittable && e2.add(t3), (t3 = t3.parent) !== s2); ) ;
        }), s2 && e2.add(s2), e2;
      }
      getHitablePath(t2) {
        const e2 = this.getPath(t2 && t2.hittable ? t2 : null);
        let i2, s2 = new Mh();
        for (let t3 = e2.list.length - 1; t3 > -1 && (i2 = e2.list[t3], i2.__.hittable) && (s2.addAt(i2, 0), i2.__.hitChildren && (!i2.isLeafer || "draw" !== i2.mode)); t3--) ;
        return s2;
      }
      getThroughPath(t2) {
        const e2 = new Mh(), i2 = [];
        for (let e3 = t2.length - 1; e3 > -1; e3--) i2.push(this.getPath(t2[e3]));
        let s2, n3, o2;
        for (let t3 = 0, r3 = i2.length; t3 < r3; t3++) {
          s2 = i2[t3], n3 = i2[t3 + 1];
          for (let t4 = 0, i3 = s2.length; t4 < i3 && (o2 = s2.list[t4], !n3 || !n3.has(o2)); t4++) e2.add(o2);
        }
        return e2;
      }
      hitBranch(t2) {
        this.eachFind(t2.children, t2.__onlyHitMask);
      }
      eachFind(t2, e2) {
        let i2, s2, n3;
        const { point: o2 } = this;
        for (let r3 = t2.length - 1; r3 > -1; r3--) if (i2 = t2[r3], n3 = i2.__, n3.visible && (!e2 || n3.mask)) if (s2 = St3(i2.__world, n3.hitRadius ? bt3(xt3, o2, n3.hitRadius) : o2), i2.isBranch) {
          if (s2 || i2.__ignoreHitWorld) {
            if (i2.isBranchLeaf && n3.__clipAfterFill && !i2.__hitWorld(o2, true)) continue;
            i2.topChildren && this.eachFind(i2.topChildren, false), this.eachFind(i2.children, i2.__onlyHitMask), i2.isBranchLeaf && this.hitChild(i2, o2, e2);
          }
        } else s2 && this.hitChild(i2, o2, e2);
      }
      hitChild(t2, e2, i2, s2) {
        if ((!this.exclude || !this.exclude.has(t2)) && t2.__hitWorld(e2, !(!i2 || "path" !== t2.mask) || void 0)) {
          const { parent: i3, mask: n3 } = t2;
          if (i3 && i3.__hasMask && n3 && "clipping" !== n3 && "clipping-path" !== n3 && !i3.children.some((t3) => !t3.mask && this.isHitLeaf(t3, e2))) return;
          const o2 = s2 || t2, { hitThrough: r3 } = t2, { findList: a } = this;
          if (r3) {
            const e3 = a.list.findIndex((e4) => "parent" === r3 ? wo.hasParent(e4.parent, t2.parent) : e4[r3] === t2[r3]);
            if (e3 > 0) return a.addAt(o2, e3);
          }
          a.add(o2);
        }
      }
      isHitLeaf(t2, e2) {
        if (t2.isBranch) {
          const { findList: e3 } = this, i2 = e3.length;
          this.eachFind([t2], false);
          const s2 = e3.length - i2;
          for (let t3 = 0; t3 < s2; t3++) e3.remove(e3.indexAt(e3.length - 1));
          return !!s2;
        }
        return t2.__hitWorld(e2);
      }
      clear() {
        this.point = null, this.findList = null, this.exclude = null;
      }
      destroy() {
        this.clear();
      }
    };
    Bt4 = class {
      constructor(t2, e2) {
        this.config = {}, e2 && (this.config = _.default(e2, this.config)), this.picker = new Tt4(this.target = t2, this), this.finder = de.finder && de.finder(t2, this.config);
      }
      getByPoint(t2, e2, s2) {
        const { target: n3, picker: o2 } = this;
        return Kt.backgrounder && n3 && n3.updateLayout(), o2.getByPoint(t2, e2, s2);
      }
      hitPoint(t2, e2, i2) {
        return this.picker.hitPoint(t2, e2, i2);
      }
      getBy(t2, e2, i2, s2) {
        return this.finder ? this.finder.getBy(t2, e2, i2, s2) : le.need("find");
      }
      destroy() {
        this.picker.destroy(), this.finder && this.finder.destroy();
      }
    };
    Object.assign(de, { watcher: (t2, e2) => new ot3(t2, e2), layouter: (t2, e2) => new mt4(t2, e2), renderer: (t2, e2, i2) => new yt3(t2, e2, i2), selector: (t2, e2) => new Bt4(t2, e2) }), Kt.layout = mt4.fullLayout, Kt.render = function(t2, e2, i2) {
      const s2 = Object.assign(Object.assign({}, i2), { topRendering: true });
      i2.topList = new Mh(), t2.__render(e2, i2), i2.topList.length && i2.topList.forEach((t3) => {
        const { parent: i3 } = t3;
        i3 && i3.isBranchLeaf && "show" !== i3.overflow ? (e2.save(), wo.clip(i3, e2, s2), t3.__render(e2, s2), e2.restore()) : t3.__render(e2, s2);
      });
    };
    Lt4 = { convert(t2, e2) {
      const i2 = _t2.getBase(t2), { x: s2, y: n3 } = e2, o2 = Object.assign(Object.assign({}, i2), { x: s2, y: n3, width: t2.width, height: t2.height, pointerType: t2.pointerType, pressure: t2.pressure });
      return "pen" === o2.pointerType && (o2.tangentialPressure = t2.tangentialPressure, o2.tiltX = t2.tiltX, o2.tiltY = t2.tiltY, o2.twist = t2.twist), o2;
    }, convertMouse(t2, e2) {
      const i2 = _t2.getBase(t2), { x: s2, y: n3 } = e2;
      return Object.assign(Object.assign({}, i2), { x: s2, y: n3, width: 1, height: 1, pointerType: "mouse", pressure: 0.5 });
    }, convertTouch(t2, e2) {
      const i2 = Lt4.getTouch(t2), s2 = _t2.getBase(t2), { x: n3, y: o2 } = e2;
      return Object.assign(Object.assign({}, s2), { x: n3, y: o2, width: 1, height: 1, pointerType: "touch", multiTouch: t2.touches.length > 1, pressure: i2.force });
    }, getTouch: (t2) => t2.targetTouches[0] || t2.changedTouches[0] };
    kt4 = { convert(t2) {
      const e2 = _t2.getBase(t2);
      return Object.assign(Object.assign({}, e2), { code: t2.code, key: t2.key });
    } };
    ({ pathCanDrag: Et4 } = _t2);
    Pt4 = class extends Mt3 {
      get windowTarget() {
        const { view: t2 } = this;
        return t2 && t2.ownerDocument || window;
      }
      get notPointer() {
        const { p: t2 } = this;
        return "pointer" !== t2.type || t2.touch || this.useMultiTouch;
      }
      get notTouch() {
        const { p: t2 } = this;
        return "mouse" === t2.type || this.usePointer;
      }
      get notMouse() {
        return this.usePointer || this.useTouch;
      }
      __listenEvents() {
        super.__listenEvents();
        const t2 = this.view = this.canvas.view;
        this.viewEvents = { pointerdown: this.onPointerDown, mousedown: this.onMouseDown, touchstart: this.onTouchStart, pointerleave: this.onPointerLeave, contextmenu: this.onContextMenu, wheel: this.onWheel, gesturestart: this.onGesturestart, gesturechange: this.onGesturechange, gestureend: this.onGestureend }, this.windowEvents = { pointermove: this.onPointerMove, pointerup: this.onPointerUp, pointercancel: this.onPointerCancel, mousemove: this.onMouseMove, mouseup: this.onMouseUp, touchmove: this.onTouchMove, touchend: this.onTouchEnd, touchcancel: this.onTouchCancel, keydown: this.onKeyDown, keyup: this.onKeyUp, scroll: this.onScroll };
        const { viewEvents: e2, windowEvents: i2 } = this;
        for (let i3 in e2) e2[i3] = e2[i3].bind(this), t2.addEventListener(i3, e2[i3]);
        for (let t3 in i2) i2[t3] = i2[t3].bind(this), this.windowTarget.addEventListener(t3, i2[t3]);
      }
      __removeListenEvents() {
        super.__removeListenEvents();
        const { viewEvents: t2, windowEvents: e2 } = this;
        for (let e3 in t2) this.view.removeEventListener(e3, t2[e3]), this.viewEvents = {};
        for (let t3 in e2) this.windowTarget.removeEventListener(t3, e2[t3]), this.windowEvents = {};
      }
      getTouches(t2) {
        const e2 = [];
        for (let i2 = 0, s2 = t2.length; i2 < s2; i2++) e2.push(t2[i2]);
        return e2;
      }
      preventDefaultPointer(t2) {
        const { pointer: e2 } = this.config;
        e2.preventDefault && t2.preventDefault();
      }
      preventDefaultWheel(t2) {
        const { wheel: e2 } = this.config;
        e2.preventDefault && t2.preventDefault();
      }
      preventWindowPointer(t2) {
        return !this.downData && t2.target !== this.view && (!this.config.shadowDOM || !t2.composedPath || !t2.composedPath().includes(this.view));
      }
      onKeyDown(t2) {
        this.keyDown(kt4.convert(t2));
      }
      onKeyUp(t2) {
        this.keyUp(kt4.convert(t2));
      }
      onContextMenu(t2) {
        this.config.pointer.preventDefaultMenu && t2.preventDefault(), this.menu(Lt4.convert(t2, this.getLocal(t2)));
      }
      onScroll() {
        this.canvas.updateClientBounds();
      }
      onPointerDown(t2) {
        this.preventDefaultPointer(t2), this.notPointer || (this.usePointer || (this.usePointer = true), this.pointerDown(Lt4.convert(t2, this.getLocal(t2))));
      }
      onPointerMove(t2, e2) {
        if (this.notPointer || this.preventWindowPointer(t2)) return;
        this.usePointer || (this.usePointer = true);
        const i2 = Lt4.convert(t2, this.getLocal(t2, true));
        e2 ? this.pointerHover(i2) : this.pointerMove(i2);
      }
      onPointerLeave(t2) {
        this.onPointerMove(t2, true);
      }
      onPointerUp(t2) {
        this.downData && this.preventDefaultPointer(t2), this.notPointer || this.preventWindowPointer(t2) || this.pointerUp(Lt4.convert(t2, this.getLocal(t2)));
      }
      onPointerCancel() {
        this.useMultiTouch || this.pointerCancel();
      }
      onMouseDown(t2) {
        this.preventDefaultPointer(t2), this.notMouse || this.pointerDown(Lt4.convertMouse(t2, this.getLocal(t2)));
      }
      onMouseMove(t2) {
        this.notMouse || this.preventWindowPointer(t2) || this.pointerMove(Lt4.convertMouse(t2, this.getLocal(t2, true)));
      }
      onMouseUp(t2) {
        this.downData && this.preventDefaultPointer(t2), this.notMouse || this.preventWindowPointer(t2) || this.pointerUp(Lt4.convertMouse(t2, this.getLocal(t2)));
      }
      onMouseCancel() {
        this.notMouse || this.pointerCancel();
      }
      onTouchStart(t2) {
        const e2 = Lt4.getTouch(t2), i2 = this.getLocal(e2, true), { preventDefault: s2 } = this.config.touch;
        (true === s2 || "auto" === s2 && Et4(this.findPath(i2))) && t2.preventDefault(), this.multiTouchStart(t2), this.notTouch || (this.touchTimer && (window.clearTimeout(this.touchTimer), this.touchTimer = 0), this.useTouch = true, this.pointerDown(Lt4.convertTouch(t2, i2)));
      }
      onTouchMove(t2) {
        if (this.multiTouchMove(t2), this.notTouch || this.preventWindowPointer(t2)) return;
        const e2 = Lt4.getTouch(t2);
        this.pointerMove(Lt4.convertTouch(t2, this.getLocal(e2)));
      }
      onTouchEnd(t2) {
        if (this.multiTouchEnd(), this.notTouch || this.preventWindowPointer(t2)) return;
        this.touchTimer && clearTimeout(this.touchTimer), this.touchTimer = setTimeout(() => {
          this.useTouch = false;
        }, 500);
        const e2 = Lt4.getTouch(t2);
        this.pointerUp(Lt4.convertTouch(t2, this.getLocal(e2)));
      }
      onTouchCancel() {
        this.notTouch || this.pointerCancel();
      }
      multiTouchStart(t2) {
        this.useMultiTouch = t2.touches.length > 1, this.touches = this.useMultiTouch ? this.getTouches(t2.touches) : void 0, this.useMultiTouch && this.pointerCancel();
      }
      multiTouchMove(t2) {
        if (this.useMultiTouch && t2.touches.length > 1) {
          const e2 = this.getTouches(t2.touches), i2 = this.getKeepTouchList(this.touches, e2);
          i2.length > 1 && (this.multiTouch(_t2.getBase(t2), i2), this.touches = e2);
        }
      }
      multiTouchEnd() {
        this.touches = null, this.useMultiTouch = false, this.transformEnd();
      }
      getKeepTouchList(t2, e2) {
        let i2;
        const s2 = [];
        return t2.forEach((t3) => {
          i2 = e2.find((e3) => e3.identifier === t3.identifier), i2 && s2.push({ from: this.getLocal(t3), to: this.getLocal(i2) });
        }), s2;
      }
      getLocalTouchs(t2) {
        return t2.map((t3) => this.getLocal(t3));
      }
      onWheel(t2) {
        this.preventDefaultWheel(t2), this.wheel(Object.assign(Object.assign(Object.assign({}, _t2.getBase(t2)), this.getLocal(t2)), { deltaX: t2.deltaX, deltaY: t2.deltaY }));
      }
      onGesturestart(t2) {
        this.useMultiTouch || (this.preventDefaultWheel(t2), this.lastGestureScale = 1, this.lastGestureRotation = 0);
      }
      onGesturechange(t2) {
        if (this.useMultiTouch) return;
        this.preventDefaultWheel(t2);
        const e2 = _t2.getBase(t2);
        Object.assign(e2, this.getLocal(t2));
        const i2 = t2.scale / this.lastGestureScale, s2 = (t2.rotation - this.lastGestureRotation) / Math.PI * 180 * (M.within(this.config.wheel.rotateSpeed, 0, 1) / 4 + 0.1);
        this.zoom(Object.assign(Object.assign({}, e2), { scale: i2 * i2 })), this.rotate(Object.assign(Object.assign({}, e2), { rotation: s2 })), this.lastGestureScale = t2.scale, this.lastGestureRotation = t2.rotation;
      }
      onGestureend(t2) {
        this.useMultiTouch || (this.preventDefaultWheel(t2), this.transformEnd());
      }
      setCursor(t2) {
        super.setCursor(t2);
        const e2 = [];
        this.eachCursor(t2, e2), d(e2[e2.length - 1]) && e2.push("default"), this.canvas.view.style.cursor = e2.map((t3) => d(t3) ? `url(${t3.url}) ${t3.x || 0} ${t3.y || 0}` : t3).join(",");
      }
      eachCursor(t2, e2, i2 = 0) {
        if (i2++, l(t2)) t2.forEach((t3) => this.eachCursor(t3, e2, i2));
        else {
          const n3 = r(t2) && St2.get(t2);
          n3 && i2 < 2 ? this.eachCursor(n3, e2, i2) : e2.push(t2);
        }
      }
      destroy() {
        this.view && (super.destroy(), this.view = this.touches = null);
      }
    };
    ({ getSpread: Dt4, copyAndSpread: Ot3, toOuterOf: Wt4, getOuterOf: It4, getByMove: Ft4, move: zt3, getIntersectData: jt4 } = Ft);
    Ut4 = {};
    ({ stintSet: Gt3 } = _);
    ({ hasTransparent: Xt4 } = Pt2);
    Ht4 = { compute: function(t2, e2) {
      const i2 = e2.__, s2 = [];
      let n3, o2, r3, a = i2.__input[t2];
      l(a) || (a = [a]), Yt4 = Dt2.recycleImage(t2, i2);
      for (let i3, n4 = 0, o3 = a.length; n4 < o3; n4++) (i3 = Vt4(t2, a[n4], e2)) && (s2.push(i3), i3.strokeStyle && (r3 || (r3 = 1), i3.strokeStyle.strokeWidth && (r3 = Math.max(r3, i3.strokeStyle.strokeWidth))));
      s2.length ? (i2["_" + t2] = s2, s2.every((t3) => t3.isTransparent) && (s2.some((t3) => t3.image) && (n3 = true), o2 = true), "fill" === t2 ? (Gt3(i2, "__isAlphaPixelFill", n3), Gt3(i2, "__isTransparentFill", o2)) : (Gt3(i2, "__isAlphaPixelStroke", n3), Gt3(i2, "__isTransparentStroke", o2), Gt3(i2, "__hasMultiStrokeStyle", r3))) : (i2.__removePaint(t2, false), i2["_" + t2] = ""), Yt4 = void 0;
    }, fill: function(t2, e2, i2, s2) {
      i2.fillStyle = t2, Rt4(e2, i2, s2);
    }, fills: function(t2, e2, i2, s2) {
      let n3, o2, r3;
      for (let a = 0, h = t2.length; a < h; a++) {
        if (n3 = t2[a], o2 = n3.originPaint, n3.image) {
          if (r3 ? r3++ : r3 = 1, Dt2.checkImage(n3, !e2.__.__font, e2, i2, s2)) continue;
          if (!n3.style) {
            1 === r3 && n3.image.isPlacehold && e2.drawImagePlaceholder(n3, i2, s2);
            continue;
          }
        }
        if (i2.fillStyle = n3.style, n3.transform || o2.scaleFixed) {
          if (i2.save(), n3.transform && i2.transform(n3.transform), o2.scaleFixed) {
            const { scaleX: t3, scaleY: s3 } = e2.getRenderScaleData(true, o2.scaleFixed, false);
            1 !== t3 && i2.scale(t3, s3);
          }
          o2.blendMode && (i2.blendMode = o2.blendMode), Rt4(e2, i2, s2, true), i2.restore();
        } else o2.blendMode ? (i2.saveBlendMode(o2.blendMode), Rt4(e2, i2, s2), i2.restoreBlendMode()) : Rt4(e2, i2, s2);
      }
    }, fillPathOrText: Rt4, fillText: function(t2, e2, i2, s2) {
      const n3 = t2.__;
      let o2;
      if (n3.__isPlacehold && n3.placeholderColor && (e2.fillStyle = n3.placeholderColor), s2 && (o2 = e2, (e2 = e2.getSameCanvas(true, true)).font = t2.__.__font, e2.fillStyle = "#000"), t2.motionText) It2.fillMotionText(t2, e2, i2);
      else {
        let t3;
        const { rows: i3, decorationY: s3 } = n3.__textDrawData;
        for (let s4 = 0, n4 = i3.length; s4 < n4; s4++) t3 = i3[s4], t3.text ? e2.fillText(t3.text, t3.x, t3.y) : t3.data && t3.data.forEach((i4) => {
          e2.fillText(i4.char, i4.x, t3.y);
        });
        if (s3) {
          const { decorationColor: t4, decorationHeight: o3 } = n3.__textDrawData;
          t4 && (e2.fillStyle = t4), i3.forEach((t5) => s3.forEach((i4) => e2.fillRect(t5.x, t5.y + i4, t5.width, o3)));
        }
      }
      s2 && (e2.beginPath(), t2.__drawPathByBox(e2, "render"), e2.fillStyle = o2.fillStyle, e2.setTransform(o2.getTransform()), e2.blendMode = "source-in", e2.fill(), o2.copyWorldByReset(e2, t2.__nowWorld), e2.recycle(t2.__nowWorld));
    }, stroke: function(t2, e2, i2, s2) {
      const n3 = e2.__;
      if (n3.__strokeWidth) if (n3.__font) It2.strokeText(t2, e2, i2, s2);
      else if (n3.__pathForStroke) It2.fillStroke(t2, e2, i2, s2);
      else switch (n3.strokeAlign) {
        case "center":
          Mt4(t2, 1, e2, i2, s2);
          break;
        case "inside":
          !(function(t3, e3, i3, s3) {
            i3.save(), i3.clipUI(e3), Mt4(t3, 2, e3, i3, s3), i3.restore();
          })(t2, e2, i2, s2);
          break;
        case "outside":
          !(function(t3, e3, i3, s3) {
            const n4 = e3.__;
            if (n4.__fillAfterStroke) Mt4(t3, 2, e3, i3, s3);
            else {
              const { renderBounds: o2 } = e3.__layout, r3 = i3.getSameCanvas(true, true);
              e3.__drawRenderPath(r3), Mt4(t3, 2, e3, r3, s3), r3.clipUI(n4), r3.clearWorld(o2), wo.copyCanvasByWorld(e3, i3, r3), r3.recycle(e3.__nowWorld);
            }
          })(t2, e2, i2, s2);
      }
    }, strokes: function(t2, e2, i2, s2) {
      It2.stroke(t2, e2, i2, s2);
    }, strokeText: function(t2, e2, i2, s2) {
      switch (e2.__.strokeAlign) {
        case "center":
          Ct4(t2, 1, e2, i2, s2);
          break;
        case "inside":
          At4(t2, "inside", e2, i2, s2);
          break;
        case "outside":
          e2.__.__fillAfterStroke ? Ct4(t2, 2, e2, i2, s2) : At4(t2, "outside", e2, i2, s2);
      }
    }, drawTextStroke: function(t2, e2, i2) {
      let s2, n3 = t2.__.__textDrawData;
      const { rows: o2, decorationY: r3 } = n3;
      for (let t3 = 0, i3 = o2.length; t3 < i3; t3++) s2 = o2[t3], s2.text ? e2.strokeText(s2.text, s2.x, s2.y) : s2.data && s2.data.forEach((t4) => {
        e2.strokeText(t4.char, t4.x, s2.y);
      });
      if (r3) {
        const { decorationHeight: t3 } = n3;
        o2.forEach((i3) => r3.forEach((s3) => e2.strokeRect(i3.x, i3.y + s3, i3.width, t3)));
      }
    }, drawStrokesStyle: function(t2, e2, i2, s2, n3, o2) {
      let r3;
      const a = s2.__, { __hasMultiStrokeStyle: h } = a;
      h || n3.setStroke(void 0, a.__strokeWidth * e2, a);
      for (let l2 = 0, c = t2.length; l2 < c; l2++) if (r3 = t2[l2], (!r3.image || !Dt2.checkImage(r3, false, s2, n3, o2)) && r3.style) {
        if (h) {
          const { strokeStyle: t3 } = r3;
          t3 ? n3.setStroke(r3.style, a.__getRealStrokeWidth(t3) * e2, a, t3) : n3.setStroke(r3.style, a.__strokeWidth * e2, a);
        } else n3.strokeStyle = r3.style;
        r3.originPaint.blendMode ? (n3.saveBlendMode(r3.originPaint.blendMode), i2 ? It2.drawTextStroke(s2, n3, o2) : n3.stroke(), n3.restoreBlendMode()) : i2 ? It2.drawTextStroke(s2, n3, o2) : n3.stroke();
      }
    }, shape: function(t2, e2, s2) {
      const n3 = e2.getSameCanvas(), o2 = e2.bounds, r3 = t2.__nowWorld, a = t2.__layout, h = t2.__nowWorldShapeBounds || (t2.__nowWorldShapeBounds = {});
      let l2, c, d2, u2, f2, p2;
      Wt4(a.strokeSpread ? (Ot3(Ut4, a.boxBounds, a.strokeSpread), Ut4) : a.boxBounds, r3, h);
      let { scaleX: g2, scaleY: _2 } = t2.getRenderScaleData(true);
      if (o2.includes(h)) p2 = n3, l2 = f2 = h, c = r3;
      else {
        let n4;
        if (Kt.fullImageShadow) n4 = h;
        else {
          const t3 = a.renderShapeSpread ? Dt4(o2, B.swapAndScale(a.renderShapeSpread, g2, _2)) : o2;
          n4 = jt4(t3, h);
        }
        u2 = o2.getFitMatrix(n4);
        let { a: w2, d: m2 } = u2;
        u2.a < 1 && (p2 = e2.getSameCanvas(), t2.__renderShape(p2, s2), g2 *= w2, _2 *= m2), f2 = It4(h, u2), l2 = Ft4(f2, -u2.e, -u2.f), c = It4(r3, u2), zt3(c, -u2.e, -u2.f);
        const v2 = s2.matrix;
        v2 ? (d2 = new ft(u2), d2.multiply(v2), w2 *= v2.scaleX, m2 *= v2.scaleY) : d2 = u2, d2.withScale(w2, m2), s2 = Object.assign(Object.assign({}, s2), { matrix: d2 });
      }
      return t2.__renderShape(n3, s2), { canvas: n3, matrix: d2, fitMatrix: u2, bounds: l2, renderBounds: c, worldCanvas: p2, shapeBounds: f2, scaleX: g2, scaleY: _2 };
    } };
    qt3 = new qt();
    ({ isSame: Kt4 } = Ft);
    ({ get: ie3, translate: se3 } = Q);
    ne3 = new qt();
    oe3 = {};
    re3 = {};
    he3 = {};
    le3 = z2();
    ({ get: ce3, set: de3, rotateOfOuter: ue3, translate: fe3, scaleOfOuter: pe3, multiplyParent: ge3, scale: _e3, rotate: we3, skew: me3 } = Q);
    ({ get: ye3, scale: xe3, copy: be3 } = Q);
    ({ getFloorScale: Se3 } = M);
    ({ abs: Te3 } = Math);
    Be3 = { image: function(t2, e2, i2, s2, n3) {
      let o2, r3;
      const a = an.get(i2, i2.type), h = !n3;
      return Nt4 && i2 === Nt4.paint && Kt4(s2, Nt4.boxBounds) ? o2 = Nt4.leafPaint : (o2 = { type: i2.type, image: a }, a.hasAlphaPixel && (o2.isTransparent = true), Nt4 = a.use > 1 ? { leafPaint: o2, paint: i2, boxBounds: qt3.set(s2) } : null), (h || a.loading) && (r3 = { image: a, attrName: e2, attrValue: i2 }), a.ready ? (Qt3(t2, e2, i2, a, o2, s2), h && ($t3(t2, r3), Zt3(t2, r3))) : a.error ? h && Jt3(t2, r3, a.error) : (h && (ee3(t2, true), $t3(t2, r3)), o2.loadId = a.load(() => {
        ee3(t2, false), t2.destroyed || (Qt3(t2, e2, i2, a, o2, s2) && (a.hasAlphaPixel && (t2.__layout.hitCanvasChanged = true), t2.forceUpdate("surface")), Zt3(t2, r3)), o2.loadId = void 0;
      }, (e3) => {
        ee3(t2, false), Jt3(t2, r3, e3), o2.loadId = void 0;
      }, i2.lod && a.getThumbSize(i2.lod)), t2.placeholderColor && (t2.placeholderDelay ? setTimeout(() => {
        a.ready || (a.isPlacehold = true, t2.forceUpdate("surface"));
      }, t2.placeholderDelay) : a.isPlacehold = true)), o2;
    }, checkImage: function(t2, e2, s2, n3, o2) {
      const { scaleX: r3, scaleY: a } = Dt2.getImageRenderScaleData(t2, s2, n3, o2), h = t2.film ? t2.nowIndex : r3 + "-" + a, { image: l2, brush: c, data: d2, originPaint: u2 } = t2, { exporting: f2, snapshot: p2 } = o2;
      if (!d2 || t2.patternId === h && !f2 || p2) {
        if (!c || !t2.style) return false;
      } else if (e2 && (d2.repeat ? e2 = false : u2.changeful || t2.film || "miniapp" === Kt.name || f2 || (e2 = Kt.image.isLarge(l2, r3, a) || l2.width * r3 > 8096 || l2.height * a > 8096)), e2) s2.__.__isFastShadow && (n3.fillStyle = t2.style || "#000", n3.fill());
      else if (!t2.style || u2.sync || f2 ? Dt2.createPattern(t2, s2, n3, o2) : Dt2.createPatternTask(t2, s2, n3, o2), !c || !t2.style) return false;
      return Dt2.drawImage(t2, r3, a, s2, n3, o2), true;
    }, drawImage: function(t2, e2, i2, s2, n3, o2) {
      const { data: r3, image: a, brush: h, complex: l2 } = t2;
      let { width: c, height: d2 } = a, u2 = h || a;
      if (l2) {
        const { blendMode: o3, opacity: a2 } = t2.originPaint, { transform: h2 } = r3;
        n3.save(), 2 === l2 && n3.clipUI(s2), o3 && (n3.blendMode = o3), a2 && (n3.opacity *= a2), h2 && n3.transform(h2), u2.render(n3, 0, 0, c, d2, s2, t2, e2, i2), n3.restore();
      } else r3.scaleX && (c *= r3.scaleX, d2 *= r3.scaleY), u2.render(n3, 0, 0, c, d2, s2, t2, e2, i2);
    }, getImageRenderScaleData: function(t2, e2, i2, s2) {
      const n3 = e2.getRenderScaleData(true, t2.originPaint.scaleFixed), { data: o2 } = t2;
      if (t2.brush && Dt2.addBrushScale(n3, t2, e2), i2) {
        const { pixelRatio: t3 } = i2;
        n3.scaleX *= t3, n3.scaleY *= t3;
      }
      return o2 && o2.scaleX && (n3.scaleX *= Math.abs(o2.scaleX), n3.scaleY *= Math.abs(o2.scaleY)), n3;
    }, recycleImage: function(t2, e2) {
      const i2 = e2["_" + t2];
      if (l(i2)) {
        let s2, n3, o2, r3, a;
        const h = e2.__leaf;
        for (let l2 = 0, c = i2.length; l2 < c; l2++) s2 = i2[l2], n3 = s2.image, a = n3 && n3.url, a && (o2 || (o2 = {}), o2[a] = s2, an.recyclePaint(s2), s2.brush && Dt2.recycleBrush(s2, h), e2.__willDestroy && n3.parent && Dt2.recycleFilter(n3, h), n3.loading && (r3 || (r3 = e2.__input && e2.__input[t2] || [], l(r3) || (r3 = [r3])), n3.unload(i2[l2].loadId, !r3.some((t3) => t3.url === a))));
        return o2;
      }
      return null;
    }, createPatternTask: function(t2, e2, i2, s2) {
      t2.patternTask || (t2.patternTask = an.patternTasker.add(() => tt3(this, void 0, void 0, function* () {
        Dt2.createPattern(t2, e2, i2, s2), e2.forceUpdate("surface");
      }), 0, () => (t2.patternTask = null, i2.bounds.hit(e2.__nowWorld))));
    }, createPattern: function(t2, e2, s2, n3) {
      let { scaleX: o2, scaleY: r3 } = Dt2.getImageRenderScaleData(t2, e2, s2, n3), a = t2.film ? t2.nowIndex : o2 + "-" + r3;
      if (t2.patternId !== a && !e2.destroyed && (!Kt.image.isLarge(t2.image, o2, r3) || t2.data.repeat)) {
        const { image: h, brush: l2, data: c } = t2, { transform: d2, gap: u2 } = c, f2 = Dt2.getPatternFixScale(t2, o2, r3);
        let p2, g2, _2, { width: w2, height: m2 } = h, { opacity: v2 } = t2.originPaint;
        (l2 || 1 === v2) && (v2 = void 0), f2 && (o2 *= f2, r3 *= f2), w2 *= o2, m2 *= r3, u2 && !l2 && (g2 = u2.x * o2 / Te3(c.scaleX || 1), _2 = u2.y * r3 / Te3(c.scaleY || 1)), (d2 || 1 !== o2 || 1 !== r3) && (o2 *= Se3(w2 + (g2 || 0)), r3 *= Se3(m2 + (_2 || 0)), p2 = ye3(), d2 && be3(p2, d2), xe3(p2, 1 / o2, 1 / r3));
        const y2 = h.getCanvas(w2, m2, v2, void 0, g2, _2, e2.leafer && e2.leafer.config.smooth, c.interlace);
        l2 ? (t2.style = y2, Dt2.cacheBrush(t2, e2, s2, n3)) : t2.style = h.getPattern(y2, c.repeat || Kt.origin.noRepeat || "no-repeat", p2, t2), t2.patternId = a;
      }
    }, getPatternFixScale: function(t2, e2, s2) {
      const { image: n3 } = t2;
      let o2, r3 = Kt.image.maxPatternSize, a = n3.width * n3.height;
      return n3.isSVG ? e2 > 1 && (o2 = Math.ceil(e2) / e2) : r3 > a && (r3 = a), (a *= e2 * s2) > r3 && (o2 = Math.sqrt(r3 / a)), o2;
    }, createData: function(t2, e2, i2, s2) {
      t2.data = Dt2.getPatternData(i2, s2, e2);
    }, getPatternData: function(t2, e2, i2) {
      t2.padding && (e2 = ne3.set(e2).shrink(t2.padding)), "strench" === t2.mode && (t2.mode = "stretch");
      const { width: n3, height: o2 } = i2, { mode: r3, align: a, offset: h, scale: l2, size: c, rotation: d2, skew: u2, clipSize: f2, repeat: p2, gap: g2, interlace: _2 } = t2, w2 = e2.width === n3 && e2.height === o2, m2 = { mode: r3 }, v2 = "center" !== a && (d2 || 0) % 180 == 90;
      let y2, x2;
      switch (Ft.set(re3, 0, 0, v2 ? o2 : n3, v2 ? n3 : o2), r3 && "cover" !== r3 && "fit" !== r3 ? ((l2 || c) && (M.getScaleData(l2, c, i2, oe3), y2 = oe3.scaleX, x2 = oe3.scaleY), (a || g2 || p2) && (y2 && Ft.scale(re3, y2, x2, true), a && kt.toPoint(a, re3, e2, re3, true, true))) : w2 && !d2 || (y2 = x2 = Ft.getFitScale(e2, re3, "fit" !== r3), Ft.put(e2, i2, a, y2, false, re3), Ft.scale(re3, y2, x2, true)), h && at.move(re3, h), r3) {
        case "stretch":
          w2 ? y2 && (y2 = x2 = void 0) : (y2 = e2.width / n3, x2 = e2.height / o2, Dt2.stretchMode(m2, e2, y2, x2));
          break;
        case "normal":
        case "clip":
          if (re3.x || re3.y || y2 || f2 || d2 || u2) {
            let t3, i4;
            f2 && (t3 = e2.width / f2.width, i4 = e2.height / f2.height), Dt2.clipMode(m2, e2, re3.x, re3.y, y2, x2, d2, u2, t3, i4), t3 && (y2 = y2 ? y2 * t3 : t3, x2 = x2 ? x2 * i4 : i4);
          }
          break;
        case "repeat":
          (!w2 || y2 || d2 || u2) && Dt2.repeatMode(m2, e2, n3, o2, re3.x, re3.y, y2, x2, d2, u2, a, t2.freeTransform);
        case "brush":
          p2 || (m2.repeat = "repeat");
          const i3 = d(p2);
          (g2 || i3) && (m2.gap = (function(t3, e3, i4, s2, n4) {
            let o3, r4;
            d(t3) ? (o3 = t3.x, r4 = t3.y) : o3 = r4 = t3;
            return { x: ae3(o3, i4, n4.width, e3 && e3.x), y: ae3(r4, s2, n4.height, e3 && e3.y) };
          })(g2, i3 && p2, re3.width, re3.height, e2));
          break;
        default:
          y2 && Dt2.fillOrFitMode(m2, e2, re3.x, re3.y, y2, x2, d2);
      }
      return m2.transform || "brush" === r3 || (e2.x || e2.y) && se3(m2.transform = ie3(), e2.x, e2.y), y2 && (m2.scaleX = y2, m2.scaleY = x2), p2 && (m2.repeat = r(p2) ? "x" === p2 ? "repeat-x" : "repeat-y" : "repeat"), _2 && (m2.interlace = o(_2) || "percent" === _2.type ? { type: "x", offset: _2 } : _2), m2;
    }, stretchMode: function(t2, e2, i2, s2) {
      const n3 = ce3(), { x: o2, y: r3 } = e2;
      o2 || r3 ? fe3(n3, o2, r3) : i2 > 0 && s2 > 0 && (n3.onlyScale = true), _e3(n3, i2, s2), t2.transform = n3;
    }, fillOrFitMode: function(t2, e2, i2, s2, n3, o2, r3) {
      const a = ce3();
      fe3(a, e2.x + i2, e2.y + s2), _e3(a, n3, o2), r3 && ue3(a, { x: e2.x + e2.width / 2, y: e2.y + e2.height / 2 }, r3), t2.transform = a;
    }, clipMode: function(t2, e2, i2, s2, n3, o2, r3, a, h, l2) {
      const c = ce3();
      ve3(c, e2, i2, s2, n3, o2, r3, a), h && (r3 || a ? (de3(le3), pe3(le3, e2, h, l2), ge3(c, le3)) : pe3(c, e2, h, l2)), t2.transform = c;
    }, repeatMode: function(t2, e2, i2, s2, n3, o2, r3, a, h, l2, c, d2) {
      const u2 = ce3();
      if (d2) ve3(u2, e2, n3, o2, r3, a, h, l2);
      else {
        if (h) if ("center" === c) ue3(u2, { x: i2 / 2, y: s2 / 2 }, h);
        else switch (we3(u2, h), h) {
          case 90:
            fe3(u2, s2, 0);
            break;
          case 180:
            fe3(u2, i2, s2);
            break;
          case 270:
            fe3(u2, 0, i2);
        }
        he3.x = e2.x + n3, he3.y = e2.y + o2, fe3(u2, he3.x, he3.y), r3 && pe3(u2, he3, r3, a);
      }
      t2.transform = u2;
    } };
    ({ toPoint: Le3 } = vt);
    ({ hasTransparent: ke3 } = Pt2);
    Ee3 = {};
    Pe3 = {};
    ({ getAngle: Me3, getDistance: Ce3 } = at);
    ({ get: Ae3, rotateOfOuter: De3, scaleOfOuter: Oe3 } = Q);
    ({ toPoint: We3 } = vt);
    Ie3 = {};
    Fe3 = {};
    ({ getDistance: je3 } = at);
    ({ toPoint: Ue3 } = vt);
    Ye3 = {};
    Ge3 = {};
    Xe3 = { linearGradient: function(t2, e2) {
      let { from: s2, to: n3, type: o2, opacity: r3 } = t2;
      Le3(s2 || "top", e2, Ee3), Le3(n3 || "bottom", e2, Pe3);
      const a = Kt.canvas.createLinearGradient(Ee3.x, Ee3.y, Pe3.x, Pe3.y), h = { type: o2, style: a };
      return Re3(h, a, t2.stops, r3), h;
    }, radialGradient: function(t2, e2) {
      let { from: s2, to: n3, type: o2, opacity: r3, stretch: a } = t2;
      We3(s2 || "center", e2, Ie3), We3(n3 || "bottom", e2, Fe3);
      const h = Kt.canvas.createRadialGradient(Ie3.x, Ie3.y, 0, Ie3.x, Ie3.y, Ce3(Ie3, Fe3)), l2 = { type: o2, style: h };
      Re3(l2, h, t2.stops, r3);
      const c = ze3(e2, Ie3, Fe3, a, true);
      return c && (l2.transform = c), l2;
    }, conicGradient: function(t2, e2) {
      let { from: s2, to: n3, type: o2, opacity: r3, rotation: a, stretch: h } = t2;
      Ue3(s2 || "center", e2, Ye3), Ue3(n3 || "bottom", e2, Ge3);
      const l2 = Kt.conicGradientSupport ? Kt.canvas.createConicGradient(a ? a * W : 0, Ye3.x, Ye3.y) : Kt.canvas.createRadialGradient(Ye3.x, Ye3.y, 0, Ye3.x, Ye3.y, je3(Ye3, Ge3)), c = { type: o2, style: l2 };
      Re3(c, l2, t2.stops, r3);
      const d2 = ze3(e2, Ye3, Ge3, h || 1, Kt.conicGradientRotate90);
      return d2 && (c.transform = d2), c;
    }, getTransform: ze3 };
    ({ copy: Ve3, move: He3, toOffsetOutBounds: Ne3 } = Ft);
    ({ max: qe3, abs: Ke3 } = Math);
    Qe3 = {};
    $e3 = new ft();
    Ze3 = {};
    ({ toOffsetOutBounds: ei3 } = Ft);
    ii3 = {};
    si3 = Je3;
    ni3 = { shadow: function(t2, e2, i2) {
      let s2, n3;
      const { __nowWorld: o2 } = t2, { shadow: r3 } = t2.__, { worldCanvas: a, bounds: h, renderBounds: l2, shapeBounds: c, scaleX: d2, scaleY: u2 } = i2, f2 = e2.getSameCanvas(), p2 = r3.length - 1;
      Ne3(h, Ze3, l2), r3.forEach((r4, g2) => {
        let _2 = 1;
        if (r4.scaleFixed) {
          const t3 = Math.abs(o2.scaleX);
          t3 > 1 && (_2 = 1 / t3);
        }
        f2.setWorldShadow(Ze3.offsetX + (r4.x || 0) * d2 * _2, Ze3.offsetY + (r4.y || 0) * u2 * _2, (r4.blur || 0) * d2 * _2, Pt2.string(r4.color)), n3 = Tt2.getShadowTransform(t2, f2, i2, r4, Ze3, _2), n3 && f2.setTransform(n3), ti3(f2, Ze3, i2), n3 && f2.resetTransform(), s2 = l2, r4.box && (f2.restore(), f2.save(), a && (f2.copyWorld(f2, l2, o2, "copy"), s2 = o2), a ? f2.copyWorld(a, o2, o2, "destination-out") : f2.copyWorld(i2.canvas, c, h, "destination-out")), wo.copyCanvasByWorld(t2, e2, f2, s2, r4.blendMode), p2 && g2 < p2 && f2.clearWorld(s2);
      }), f2.recycle(s2);
    }, innerShadow: function(t2, e2, i2) {
      let s2, n3;
      const { __nowWorld: o2 } = t2, { innerShadow: r3 } = t2.__, { worldCanvas: a, bounds: h, renderBounds: l2, shapeBounds: c, scaleX: d2, scaleY: u2 } = i2, f2 = e2.getSameCanvas(), p2 = r3.length - 1;
      ei3(h, ii3, l2), r3.forEach((r4, g2) => {
        let _2 = 1;
        if (r4.scaleFixed) {
          const t3 = Math.abs(o2.scaleX);
          t3 > 1 && (_2 = 1 / t3);
        }
        f2.save(), f2.setWorldShadow(ii3.offsetX + (r4.x || 0) * d2 * _2, ii3.offsetY + (r4.y || 0) * u2 * _2, (r4.blur || 0) * d2 * _2), n3 = Tt2.getShadowTransform(t2, f2, i2, r4, ii3, _2, true), n3 && f2.setTransform(n3), ti3(f2, ii3, i2), f2.restore(), a ? (f2.copyWorld(f2, l2, o2, "copy"), f2.copyWorld(a, o2, o2, "source-out"), s2 = o2) : (f2.copyWorld(i2.canvas, c, h, "source-out"), s2 = l2), f2.fillWorld(s2, Pt2.string(r4.color), "source-in"), wo.copyCanvasByWorld(t2, e2, f2, s2, r4.blendMode), p2 && g2 < p2 && f2.clearWorld(s2);
      }), f2.recycle(s2);
    }, blur: function(t2, e2, i2) {
      const { blur: s2 } = t2.__;
      i2.setWorldBlur(s2 * t2.__nowWorld.a), i2.copyWorldToInner(e2, t2.__nowWorld, t2.__layout.renderBounds), i2.filter = "none";
    }, backgroundBlur: function(t2, e2, i2) {
    }, getShadowRenderSpread: Je3, getShadowTransform: function(t2, e2, i2, s2, n3, o2, r3) {
      if (s2.spread) {
        const i3 = 2 * s2.spread * o2 * (r3 ? -1 : 1), { width: a, height: h } = t2.__layout.strokeBounds;
        return $e3.set().scaleOfOuter({ x: (n3.x + n3.width / 2) * e2.pixelRatio, y: (n3.y + n3.height / 2) * e2.pixelRatio }, 1 + i3 / a, 1 + i3 / h), $e3;
      }
    }, isTransformShadow(t2) {
    }, getInnerShadowSpread: si3 };
    ({ excludeRenderBounds: oi3 } = So);
    fe2.prototype.__renderMask = function(t2, e2) {
      let i2, s2, n3, o2, r3, a;
      const { children: h } = this;
      for (let l2 = 0, c = h.length; l2 < c; l2++) {
        if (i2 = h[l2], a = i2.__.mask, a) {
          r3 && (ai3(this, r3, t2, n3, s2, o2, void 0, true), s2 = n3 = null), "clipping" !== a && "clipping-path" !== a || oi3(i2, e2) || i2.__render(t2, e2), o2 = i2.__.opacity, ri3 = false, "path" === a || "clipping-path" === a ? (o2 < 1 ? (r3 = "opacity-path", n3 || (n3 = hi2(t2))) : (r3 = "path", t2.save()), i2.__clip(n3 || t2, e2)) : (r3 = "grayscale" === a ? "grayscale" : "alpha", s2 || (s2 = hi2(t2)), n3 || (n3 = hi2(t2)), i2.__render(s2, e2));
          continue;
        }
        const c2 = 1 === o2 && i2.__.__blendMode;
        c2 && ai3(this, r3, t2, n3, s2, o2, void 0, false), oi3(i2, e2) || i2.__render(n3 || t2, e2), c2 && ai3(this, r3, t2, n3, s2, o2, c2, false);
      }
      ai3(this, r3, t2, n3, s2, o2, void 0, true);
    };
    ci3 = `>)]}%!?,.:;'"\u300B\uFF09\u300D\u3009\u300F\u3017\u3011\u3015\uFF5D\u2510\uFF1E\u2019\u201D\uFF01\uFF1F\uFF0C\u3001\u3002\uFF1A\uFF1B\u2030`;
    di3 = ci3 + "_#~&*+\\=|\u226E\u226F\u2248\u2260\uFF1D\u2026";
    ui3 = new RegExp([[19968, 40959], [13312, 19903], [131072, 173791], [173824, 177983], [177984, 178207], [178208, 183983], [183984, 191471], [196608, 201551], [201552, 205743], [11904, 12031], [12032, 12255], [12272, 12287], [12288, 12351], [4352, 4607], [12352, 12447], [12448, 12543], [12544, 12591], [12592, 12687], [12688, 12703], [12704, 12735], [12784, 12799], [12736, 12783], [12800, 13055], [13056, 13311], [63744, 64255], [65072, 65103], [127488, 127743], [194560, 195103]].map(([t2, e2]) => `[\\u{${t2.toString(16)}}-\\u{${e2.toString(16)}}]`).join("|"), "u");
    pi3 = fi2("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz");
    gi3 = fi2(`{[(<'"\u300A\uFF08\u300C\u3008\u300E\u3016\u3010\u3014\uFF5B\u250C\uFF1C\u2018\u201C\uFF1D\xA5\uFFE5\uFF04\u20AC\xA3\uFFE1\xA2\uFFE0`);
    _i3 = fi2(ci3);
    wi2 = fi2(di3);
    mi2 = fi2("- \u2014\uFF0F\uFF5E\uFF5C\u2506\xB7");
    !(function(t2) {
      t2[t2.Letter = 0] = "Letter", t2[t2.Single = 1] = "Single", t2[t2.Before = 2] = "Before", t2[t2.After = 3] = "After", t2[t2.Symbol = 4] = "Symbol", t2[t2.Break = 5] = "Break";
    })(vi3 || (vi3 = {}));
    ({ Letter: yi3, Single: xi2, Before: bi2, After: Si2, Symbol: Ti2, Break: Bi2 } = vi3);
    ki2 = { trimRight(t2) {
      const { words: e2 } = t2;
      let i2, s2 = 0, n3 = e2.length;
      for (let o2 = n3 - 1; o2 > -1 && (i2 = e2[o2].data[0], " " === i2.char); o2--) s2++, t2.width -= i2.width;
      s2 && e2.splice(n3 - s2, s2);
    } };
    ({ trimRight: Pi2 } = ki2);
    ({ Letter: Ri2, Single: Mi2, Before: Ci2, After: Ai2, Symbol: Di2, Break: Oi2 } = vi3);
    Ji2 = [];
    ({ top: ns2, right: os2, bottom: rs2, left: as2 } = xt);
    ls2 = { getDrawData: function(t2, e2) {
      r(t2) || (t2 = String(t2));
      let n3 = 0, o2 = 0, r3 = e2.__getInput("width") || 0, a = e2.__getInput("height") || 0;
      const { __padding: h } = e2;
      e2.motionText && (r3 = a = 0), h && (r3 ? (n3 = h[as2], r3 -= h[os2] + h[as2], !r3 && (r3 = 0.01)) : e2.autoSizeAlign || (n3 = h[as2]), a ? (o2 = h[ns2], a -= h[ns2] + h[rs2], !a && (a = 0.01)) : e2.autoSizeAlign || (o2 = h[ns2]));
      const l2 = { bounds: { x: n3, y: o2, width: r3, height: a }, rows: [], paraNumber: 0, font: Kt.canvas.font = e2.__font };
      return (function(t3, e3, s2) {
        Qi2 = t3, Ji2 = t3.rows, $i2 = t3.bounds, Zi2 = !$i2.width && !s2.autoSizeAlign;
        const { paraIndent: n4, textCase: o3 } = s2, { canvas: r4 } = Kt, { width: a2 } = $i2;
        if (s2.__isCharMode) {
          const t4 = "none" !== s2.textWrap, i2 = "break" === s2.textWrap, h2 = s2.__letterSpacing, l3 = s2.__wordSpacing;
          Ki2 = true, Hi2 = null, Gi2 = Yi2 = Xi2 = Fi2 = zi2 = 0, Wi2 = { data: [] }, Ii2 = { words: [] };
          for (let s3 = 0, c = (e3 = [...e3]).length; s3 < c; s3++) Ui2 = e3[s3], "\n" === Ui2 ? (Fi2 && es2(), Ii2.paraEnd = true, is2(), Ki2 = true) : (Vi2 = Li2(Ui2), Vi2 === Ri2 && "none" !== o3 && (Ui2 = Ei2(Ui2, o3, !Fi2)), Yi2 = r4.measureText(Ui2).width, h2 && (h2 < 0 && (Xi2 = Yi2), Yi2 += h2), Ni2 = Vi2 === Mi2 && (Hi2 === Mi2 || Hi2 === Ri2) || Hi2 === Mi2 && Vi2 !== Ai2, qi2 = !(Vi2 !== Ci2 && Vi2 !== Mi2 || Hi2 !== Di2 && Hi2 !== Ai2), ji2 = Ki2 && n4 ? a2 - n4 : a2, t4 && a2 && zi2 + Fi2 + Yi2 > ji2 && (i2 ? (Fi2 && es2(), zi2 && is2()) : (qi2 || (qi2 = Vi2 === Ri2 && Hi2 == Ai2), Ni2 || qi2 || Vi2 === Oi2 || Vi2 === Ci2 || Vi2 === Mi2 || Fi2 + Yi2 > ji2 ? (Fi2 && es2(), zi2 && is2()) : zi2 && is2())), " " === Ui2 && true !== Ki2 && zi2 + Fi2 === 0 || (Vi2 === Oi2 ? (" " === Ui2 && Fi2 && es2(l3), ts2(Ui2, Yi2), es2()) : Ni2 || qi2 ? (Fi2 && es2(l3), ts2(Ui2, Yi2)) : ts2(Ui2, Yi2)), Hi2 = Vi2);
          Fi2 && es2(), zi2 && is2(), Ji2.length > 0 && (Ji2[Ji2.length - 1].paraEnd = true);
        } else e3.split("\n").forEach((t4) => {
          Qi2.paraNumber++, zi2 = r4.measureText(t4).width, Ji2.push({ x: n4 || 0, text: t4, width: zi2, paraStart: true }), Zi2 && ss2();
        });
      })(l2, t2, e2), h && (function(t3, e3, i2, s2, n4) {
        if (!s2 && i2.autoSizeAlign) switch (i2.textAlign) {
          case "left":
            hs2(e3, "x", t3[as2]);
            break;
          case "right":
            hs2(e3, "x", -t3[os2]);
        }
        if (!n4 && i2.autoSizeAlign) switch (i2.verticalAlign) {
          case "top":
            hs2(e3, "y", t3[ns2]);
            break;
          case "bottom":
            hs2(e3, "y", -t3[rs2]);
        }
      })(h, l2, e2, r3, a), (function(t3, e3) {
        const { rows: i2, bounds: s2 } = t3, n4 = i2.length, { __lineHeight: o3, __baseLine: r4, __letterSpacing: a2, __clipText: h2, textAlign: l3, verticalAlign: c, paraSpacing: d2, autoSizeAlign: u2 } = e3;
        let { x: f2, y: p2, width: g2, height: _2 } = s2, w2 = o3 * n4 + (d2 ? d2 * (t3.paraNumber - 1) : 0), m2 = r4;
        if (h2 && w2 > _2) w2 = Math.max(e3.__autoHeight ? w2 : _2, o3), n4 > 1 && (t3.overflow = n4);
        else if (_2 || u2) switch (c) {
          case "middle":
            p2 += (_2 - w2) / 2;
            break;
          case "bottom":
            p2 += _2 - w2;
        }
        m2 += p2;
        let v2, y2, x2, b2 = g2 || u2 ? g2 : t3.maxWidth;
        for (let r5 = 0, c2 = n4; r5 < c2; r5++) {
          if (v2 = i2[r5], v2.x = f2, v2.width < g2 || v2.width > g2 && !h2) switch (l3) {
            case "center":
              v2.x += (b2 - v2.width) / 2;
              break;
            case "right":
              v2.x += b2 - v2.width;
          }
          v2.paraStart && d2 && r5 > 0 && (m2 += d2), v2.y = m2, m2 += o3, t3.overflow > r5 && m2 > w2 && (v2.isOverflow = true, t3.overflow = r5 + 1), y2 = v2.x, x2 = v2.width, a2 < 0 && (v2.width < 0 ? (x2 = -v2.width + e3.fontSize + a2, y2 -= x2, x2 += e3.fontSize) : x2 -= a2), y2 < s2.x && (s2.x = y2), x2 > s2.width && (s2.width = x2), h2 && g2 && g2 < x2 && (v2.isOverflow = true, t3.overflow || (t3.overflow = i2.length));
        }
        s2.y = p2, s2.height = w2;
      })(l2, e2), e2.__isCharMode && (function(t3, e3, i2) {
        const { rows: s2 } = t3, { textAlign: n4, paraIndent: o3 } = e3, r4 = e3.__letterSpacing || e3.motionText, a2 = e3.__wordSpacing, h2 = i2 && n4.includes("both"), l3 = h2 || i2 && n4.includes("justify"), c = l3 && n4.includes("letter");
        let d2, u2, f2, p2, g2, _2, w2, m2, v2, y2;
        s2.forEach((t4) => {
          t4.words && (g2 = o3 && t4.paraStart ? o3 : 0, m2 = t4.words.length, l3 && (y2 = !t4.paraEnd || h2, u2 = i2 - t4.width - g2, c ? p2 = u2 / (t4.words.reduce((t5, e4) => t5 + e4.data.length, 0) - 1) : f2 = m2 > 1 ? u2 / (m2 - 1) : 0), _2 = r4 || t4.isOverflow || c ? 0 : f2 || a2 ? 1 : 2, t4.isOverflow && !r4 && (t4.textMode = true), 2 === _2 ? (t4.x += g2, (function(t5) {
            t5.text = "", t5.words.forEach((e4) => {
              e4.data.forEach((e5) => {
                t5.text += e5.char;
              });
            });
          })(t4)) : (t4.x += g2, d2 = t4.x, t4.data = [], t4.words.forEach((e4, i3) => {
            1 === _2 ? (w2 = { char: "", x: d2 }, d2 = (function(t5, e5, i4) {
              return t5.forEach((t6) => {
                i4.char += t6.char, e5 += t6.width;
              }), e5;
            })(e4.data, d2, w2), (t4.isOverflow || " " !== w2.char) && t4.data.push(w2)) : d2 = (function(t5, e5, i4, s3, n5) {
              return t5.forEach((t6) => {
                (s3 || " " !== t6.char) && (t6.x = e5, i4.push(t6)), e5 += t6.width, n5 && (e5 += n5);
              }), e5;
            })(e4.data, d2, t4.data, t4.isOverflow, y2 && p2), e4.addWidth && (d2 += e4.addWidth), y2 && (v2 = i3 === m2 - 1, f2 ? v2 || (d2 += f2, t4.width += f2) : p2 && (t4.width += p2 * (e4.data.length - (v2 ? 1 : 0))));
          })), t4.words = null);
        });
      })(l2, e2, r3), l2.overflow && (function(t3, e3, s2, n4) {
        const { rows: o3, overflow: r4 } = t3;
        let { textOverflow: a2 } = e3;
        if (r4 && o3.splice(r4), n4 && a2 && "show" !== a2) {
          let t4, h2;
          "hide" === a2 ? a2 = "" : "ellipsis" === a2 && (a2 = "...");
          const l3 = a2 ? Kt.canvas.measureText(a2).width : 0, c = s2 + n4 - l3;
          ("none" === e3.textWrap ? o3 : [o3[r4 - 1]]).forEach((e4) => {
            if (e4.isOverflow && e4.data) {
              let i2 = e4.data.length - 1;
              for (let s3 = i2; s3 > -1 && (t4 = e4.data[s3], h2 = t4.x + t4.width, !(s3 === i2 && h2 < c)); s3--) {
                if (h2 < c && " " !== t4.char || !s3) {
                  e4.data.splice(s3 + 1), e4.width -= t4.width;
                  break;
                }
                e4.width -= t4.width;
              }
              e4.width += l3, e4.data.push({ char: a2, x: h2 }), e4.textMode && (function(t5) {
                t5.text = "", t5.data.forEach((e5) => {
                  t5.text += e5.char;
                }), t5.data = null;
              })(e4);
            }
          });
        }
      })(l2, e2, n3, r3), "none" !== e2.textDecoration && (function(t3, e3) {
        let i2, s2 = 0;
        const { fontSize: n4, textDecoration: o3 } = e3;
        switch (t3.decorationHeight = n4 / 11, d(o3) ? (i2 = o3.type, o3.color && (t3.decorationColor = Pt2.string(o3.color)), o3.offset && (s2 = Math.min(0.3 * n4, Math.max(o3.offset, 0.15 * -n4)))) : i2 = o3, i2) {
          case "under":
            t3.decorationY = [0.15 * n4 + s2];
            break;
          case "delete":
            t3.decorationY = [0.35 * -n4];
            break;
          case "under-delete":
            t3.decorationY = [0.15 * n4 + s2, 0.35 * -n4];
        }
      })(l2, e2), l2;
    } };
    cs2 = { string: function(t2, e2) {
      if (!t2) return "#000";
      const i2 = o(e2) && e2 < 1;
      if (r(t2)) {
        if (!i2 || !Pt2.object) return t2;
        t2 = Pt2.object(t2);
      }
      let n3 = s(t2.a) ? 1 : t2.a;
      i2 && (n3 *= e2);
      const o2 = t2.r + "," + t2.g + "," + t2.b;
      return 1 === n3 ? "rgb(" + o2 + ")" : "rgba(" + o2 + "," + n3 + ")";
    } };
    Object.assign(Ct2, ls2), Object.assign(Pt2, cs2), Object.assign(It2, Ht4), Object.assign(Dt2, Be3), Object.assign(Et2, Xe3), Object.assign(Tt2, ni3), Object.assign(de, { interaction: (t2, e2, i2, s2) => new Pt4(t2, e2, i2, s2), hitCanvas: (t2, e2) => new it3(t2, e2), hitCanvasManager: () => new At3() }), st2();
  }
});

// src/lib/matrix.ts
function mul(m1, m2) {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f
  };
}
function translate(tx, ty) {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}
function scale(sx, sy = sx) {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}
function rotate(deg) {
  const r3 = deg * Math.PI / 180;
  const cos = Math.cos(r3);
  const sin = Math.sin(r3);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}
function skewX(deg) {
  return { a: 1, b: 0, c: Math.tan(deg * Math.PI / 180), d: 1, e: 0, f: 0 };
}
function skewY(deg) {
  return { a: 1, b: Math.tan(deg * Math.PI / 180), c: 0, d: 1, e: 0, f: 0 };
}
function apply(m2, x2, y2) {
  return { x: m2.a * x2 + m2.c * y2 + m2.e, y: m2.b * x2 + m2.d * y2 + m2.f };
}
function pivotMatrix(m2, px, py) {
  return mul(mul(translate(px, py), m2), translate(-px, -py));
}
function parseArgs(str2) {
  return (str2.match(new RegExp(NUM, "g")) || []).map(Number);
}
function parseSvgTransform(value) {
  let m2 = { ...IDENTITY };
  const re4 = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let hit;
  while (hit = re4.exec(value)) {
    const fn2 = hit[1].toLowerCase();
    const a = parseArgs(hit[2]);
    switch (fn2) {
      case "matrix":
        if (a.length >= 6) m2 = mul(m2, { a: a[0], b: a[1], c: a[2], d: a[3], e: a[4], f: a[5] });
        break;
      case "translate":
        m2 = mul(m2, translate(a[0] || 0, a[1] ?? 0));
        break;
      case "scale":
        m2 = mul(m2, scale(a[0] ?? 1, a[1] ?? a[0] ?? 1));
        break;
      case "rotate":
        if (a.length >= 3) m2 = mul(m2, pivotMatrix(rotate(a[0]), a[1], a[2]));
        else m2 = mul(m2, rotate(a[0] || 0));
        break;
      case "skewx":
        m2 = mul(m2, skewX(a[0] || 0));
        break;
      case "skewy":
        m2 = mul(m2, skewY(a[0] || 0));
        break;
    }
  }
  return m2;
}
function parseCssTransform(value, boxW = 0, boxH = 0) {
  let m2 = { ...IDENTITY };
  const re4 = /([a-zA-Z0-9]+)\s*\(([^)]*)\)/g;
  let hit;
  while (hit = re4.exec(value)) {
    const fn2 = hit[1].toLowerCase();
    const raw = hit[2].split(/[,\s]+/).filter(Boolean);
    const nums = raw.map((v2) => v2.endsWith("%") ? parseFloat(v2) / 100 * 1 : parseFloat(v2));
    const pct2 = raw.map((v2) => v2.endsWith("%"));
    switch (fn2) {
      case "translate":
        m2 = mul(m2, translate((pct2[0] ? nums[0] * boxW : nums[0]) || 0, (pct2[1] ? nums[1] * boxH : nums[1]) || 0));
        break;
      case "translatex":
        m2 = mul(m2, translate(pct2[0] ? nums[0] * boxW : nums[0], 0));
        break;
      case "translatey":
        m2 = mul(m2, translate(0, pct2[0] ? nums[0] * boxH : nums[0]));
        break;
      case "translate3d":
        m2 = mul(m2, translate((pct2[0] ? nums[0] * boxW : nums[0]) || 0, (pct2[1] ? nums[1] * boxH : nums[1]) || 0));
        break;
      case "scale":
        m2 = mul(m2, scale(nums[0] ?? 1, nums[1] ?? nums[0] ?? 1));
        break;
      case "scalex":
        m2 = mul(m2, scale(nums[0] ?? 1, 1));
        break;
      case "scaley":
        m2 = mul(m2, scale(1, nums[0] ?? 1));
        break;
      case "scale3d":
        m2 = mul(m2, scale(nums[0] ?? 1, nums[1] ?? nums[0] ?? 1));
        break;
      case "rotate":
      case "rotatez":
        m2 = mul(m2, rotate(nums[0] || 0));
        break;
      case "skewx":
        m2 = mul(m2, skewX(nums[0] || 0));
        break;
      case "skewy":
        m2 = mul(m2, skewY(nums[0] || 0));
        break;
      case "matrix":
        if (nums.length >= 6) m2 = mul(m2, { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] });
        break;
    }
  }
  return m2;
}
var IDENTITY, NUM;
var init_matrix = __esm({
  "src/lib/matrix.ts"() {
    IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
  }
});

// src/lib/convert.ts
function len(value, percentBase = 0) {
  if (!value) return 0;
  const v2 = value.trim();
  if (v2.endsWith("%")) return parseFloat(v2) / 100 * percentBase;
  if (v2.endsWith("em")) return (parseFloat(v2) || 0) * (percentBase || 16);
  if (v2.endsWith("rem")) return (parseFloat(v2) || 0) * 16;
  if (SVG_LENGTH_RE.test(v2)) return parseFloat(v2);
  return parseFloat(v2) || 0;
}
function normFamily(family) {
  if (!family) return "PingFang SC, Microsoft YaHei, sans-serif";
  return family.split(",").map((f2) => {
    const t2 = f2.trim().replace(/^["']|["']$/g, "");
    if (!t2) return "";
    return /[\s]/.test(t2) ? `"${t2}"` : t2;
  }).filter(Boolean).join(", ");
}
function mapFontWeight(w2) {
  if (!w2) return "normal";
  if (w2 === "bold") return "bold";
  if (w2 === "bolder") return 700;
  if (w2 === "lighter") return 300;
  const n3 = parseInt(w2, 10);
  return Number.isFinite(n3) ? n3 : "normal";
}
function solidColor(color, alpha = 1) {
  const c = parseColor(color);
  c.a *= alpha;
  return rgbaString(c);
}
function toPaint(value, opacity, doc, bbox, currentColor, warnings) {
  if (!value) return void 0;
  const v2 = value.trim();
  if (!v2 || v2 === "none") return void 0;
  if (v2 === "currentColor") return solidColor(currentColor, opacity);
  if (v2.startsWith("url(")) {
    const id2 = v2.replace(/url\(["']?#?|["']?\)/g, "").trim();
    const def = doc.gradients[id2];
    if (!def) {
      if (!warnings.some((w2) => w2.includes(`#${id2}`))) warnings.push(`\u6E10\u53D8 #${id2} \u672A\u627E\u5230\uFF0C\u5DF2\u8DF3\u8FC7`);
      return void 0;
    }
    return gradientToPaint(def, bbox, opacity);
  }
  if (v2.startsWith("#")) return solidColor(v2, opacity);
  if (/^(rgb|hsl)/.test(v2)) return solidColor(v2, opacity);
  if (/^[a-z]+$/i.test(v2)) return solidColor(v2, opacity);
  return v2;
}
function gradientToPaint(def, bbox, opacity) {
  const w2 = bbox.width || 1;
  const h = bbox.height || 1;
  const fx = def.units === "objectBoundingBox" ? (v2) => v2 : (v2) => (v2 - bbox.x) / w2;
  const fy = def.units === "objectBoundingBox" ? (v2) => v2 : (v2) => (v2 - bbox.y) / h;
  const stops = def.stops.map((s2) => {
    const c = parseColor(s2.color);
    c.a *= s2.opacity;
    return { offset: s2.offset, color: rgbaString(c) };
  });
  if (!stops.length) return void 0;
  if (def.type === "linear") {
    return {
      type: "linear",
      from: { type: "percent", x: fx(def.x1), y: fy(def.y1) },
      to: { type: "percent", x: fx(def.x2), y: fy(def.y2) },
      stops,
      opacity: opacity < 1 ? opacity : void 0
    };
  }
  return {
    type: "radial",
    from: { type: "percent", x: fx(def.cx), y: fy(def.cy) },
    to: { type: "percent", x: fx(def.cx) + def.r * (def.units === "objectBoundingBox" ? 1 : 1), y: fy(def.cy) },
    stops,
    opacity: opacity < 1 ? opacity : void 0
  };
}
function pointsToPath(points, close) {
  const nums = (points.match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number);
  let d2 = "";
  for (let i2 = 0; i2 < nums.length; i2 += 2) {
    d2 += `${i2 === 0 ? "M" : "L"}${nums[i2]} ${nums[i2 + 1] ?? 0} `;
  }
  return close ? d2 + "Z" : d2;
}
function convertSvg(doc, asset) {
  const warnings = [...doc.warnings];
  const elements = /* @__PURE__ */ new Map();
  const order = [];
  const content = new fe2({ name: "svg-root" });
  content.width = doc.width;
  content.height = doc.height;
  const [vx, vy, vw, vh2] = doc.viewBox;
  const sx = vw ? doc.width / vw : 1;
  const sy = vh2 ? doc.height / vh2 : 1;
  if (vx || vy || Math.abs(sx - 1) > 1e-6 || Math.abs(sy - 1) > 1e-6) {
    content.setTransform({ a: sx, b: 0, c: 0, d: sy, e: -vx * sx, f: -vy * sy }, false);
  }
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  const bboxOf2 = (el) => {
    const s2 = el.style;
    const t2 = el.tag;
    if (t2 === "rect") {
      const x2 = len(s2["x"]);
      const y2 = len(s2["y"]);
      return { x: x2, y: y2, width: len(s2["width"]), height: len(s2["height"]) };
    }
    if (t2 === "circle") {
      const r3 = len(s2["r"]);
      return { x: len(s2["cx"]) - r3, y: len(s2["cy"]) - r3, width: r3 * 2, height: r3 * 2 };
    }
    if (t2 === "ellipse") {
      const rx = len(s2["rx"]);
      const ry = len(s2["ry"]);
      return { x: len(s2["cx"]) - rx, y: len(s2["cy"]) - ry, width: rx * 2, height: ry * 2 };
    }
    if (t2 === "line" || t2 === "polyline" || t2 === "polygon") {
      const raw = t2 === "line" ? `${s2["x1"]},${s2["y1"]} ${s2["x2"]},${s2["y2"]}` : s2["points"] || "";
      const nums = (raw.match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number);
      const xs2 = [];
      const ys2 = [];
      for (let i2 = 0; i2 < nums.length; i2 += 2) {
        xs2.push(nums[i2]);
        ys2.push(nums[i2 + 1] ?? 0);
      }
      if (!xs2.length) return { x: 0, y: 0, width: 0, height: 0 };
      const minX = Math.min(...xs2);
      const maxX = Math.max(...xs2);
      const minY = Math.min(...ys2);
      const maxY = Math.max(...ys2);
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    if (t2 === "text") {
      const fontSize = len(s2["font-size"], 16) || 16;
      const text = (el.dom.textContent || "").trim();
      const family = normFamily(s2["font-family"]);
      const weight = mapFontWeight(s2["font-weight"]);
      const spacing = len(s2["letter-spacing"], fontSize) || 0;
      const chars = [...text].length;
      let width = 0;
      if (mctx) {
        mctx.font = `${weight} ${fontSize}px ${family}`;
        width = mctx.measureText(text).width;
      }
      width += spacing * Math.max(0, chars - 1);
      const anchor = s2["text-anchor"] || "start";
      const x2 = len(s2["x"]) - (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
      const lineHeight = fontSize * 1.2;
      const baseline = s2["dominant-baseline"] || "";
      const baselineShift = baseline === "middle" || baseline === "central" ? -fontSize * 0.6 : baseline === "hanging" || baseline === "text-before-edge" ? -fontSize * 0.2 : 0;
      return {
        x: x2,
        y: len(s2["y"]) - lineHeight * 0.95 + baselineShift,
        width: Math.max(width, 1),
        height: lineHeight
      };
    }
    if (t2 === "image") {
      return { x: len(s2["x"]), y: len(s2["y"]), width: Math.max(1, len(s2["width"])), height: Math.max(1, len(s2["height"])) };
    }
    if (t2 === "path") {
      const tmp = new yi2({ path: s2["d"] || "" });
      const b2 = tmp.getBounds("box", "local");
      return { x: b2.x, y: b2.y, width: Math.max(b2.width, 1), height: Math.max(b2.height, 1) };
    }
    return { x: 0, y: 0, width: 1, height: 1 };
  };
  const build = (el, parent) => {
    const style = el.style;
    const ownTransform = style["transform"] ? parseSvgTransform(style["transform"]) : { ...IDENTITY };
    const opacity = clamp01(parseFloat(style["opacity"] ?? "1"));
    const blend = style["mix-blend-mode"] ? BLEND[style["mix-blend-mode"].trim()] : void 0;
    const currentColor = style["color"] || "#000000";
    if (el.tag === "g" || el.kind === "group") {
      const group = new fe2({ name: `svg:${el.id}` });
      group.opacity = opacity;
      if (blend) group.blendMode = blend;
      group.setTransform(ownTransform, false);
      parent.add(group);
      const converted2 = {
        el,
        node: group,
        wrapper: group,
        baseMatrix: ownTransform,
        baseStyle: { strokeWidth: 0, opacity },
        originPoint: { x: 0.5, y: 0.5 },
        bbox: { x: 0, y: 0, width: doc.width, height: doc.height },
        children: []
      };
      elements.set(el.id, converted2);
      order.push(converted2);
      el.children.forEach((child) => {
        const c = build(child, group);
        if (c) converted2.children.push(c);
      });
      return converted2;
    }
    const bbox = bboxOf2(el);
    const isText2 = el.tag === "text";
    const fontSize = isText2 ? len(style["font-size"], 16) || 16 : void 0;
    const strokeWidth = len(style["stroke-width"], 1) || 0;
    const fillOpacity = clamp01(parseFloat(style["fill-opacity"] ?? "1"));
    const strokeOpacity = clamp01(parseFloat(style["stroke-opacity"] ?? "1"));
    const fill = toPaint(style["fill"], fillOpacity, doc, bbox, currentColor, warnings);
    const stroke = toPaint(style["stroke"], strokeOpacity, doc, bbox, currentColor, warnings);
    const dashPattern = style["stroke-dasharray"] ? (style["stroke-dasharray"].match(/[\d.]+/g) || []).map(Number) : void 0;
    const wrapper = new fe2({ name: `svgw:${el.id}` });
    parent.add(wrapper);
    let node;
    if (isText2) {
      const rawText = collectText(el.dom);
      const family = normFamily(style["font-family"]);
      const weight = mapFontWeight(style["font-weight"]);
      const letterSpacing = len(style["letter-spacing"], fontSize) || 0;
      const anchor = style["text-anchor"] || "start";
      const lineHeight = fontSize * 1.2;
      const textNode = new gi2({
        x: bbox.x,
        y: bbox.y,
        text: rawText,
        fontFamily: family,
        fontSize,
        fontWeight: weight,
        italic: style["font-style"] === "italic",
        letterSpacing,
        lineHeight,
        fill,
        opacity: 1,
        textAlign: anchor === "middle" ? "center" : anchor === "end" ? "right" : "left",
        textWrap: "none",
        width: Math.max(bbox.width, 1)
      });
      node = textNode;
    } else if (el.tag === "image") {
      const href = el.dom.getAttribute("href") || el.dom.getAttribute("xlink:href") || "";
      node = new _i2({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height, url: href });
    } else {
      let shape;
      switch (el.tag) {
        case "rect": {
          const rx = len(style["rx"], bbox.width / 2);
          const ry = len(style["ry"], bbox.height / 2);
          shape = new me2({
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            cornerRadius: Math.min(rx, ry) || 0
          });
          break;
        }
        case "circle":
        case "ellipse":
          shape = new Me2({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height });
          break;
        case "line":
          shape = new yi2({ path: `M${len(style["x1"])} ${len(style["y1"])} L${len(style["x2"])} ${len(style["y2"])}`, fill: void 0 });
          break;
        case "polyline":
          shape = new yi2({ path: pointsToPath(style["points"] || "", false) });
          break;
        case "polygon":
          shape = new yi2({ path: pointsToPath(style["points"] || "", true) });
          break;
        case "path":
          shape = new yi2({ path: style["d"] || "" });
          break;
        default:
          warnings.push(`\u672A\u652F\u6301\u7684\u6807\u7B7E <${el.tag}>`);
          wrapper.remove();
          return null;
      }
      node = shape;
      node.fill = fill;
      node.stroke = stroke;
      if (stroke) {
        ;
        node.strokeWidth = strokeWidth;
        node.strokeAlign = "center";
        if (dashPattern && dashPattern.length) node.dashPattern = dashPattern;
        if (style["stroke-dashoffset"]) node.dashOffset = len(style["stroke-dashoffset"]);
        const cap = style["stroke-linecap"];
        if (cap === "round" || cap === "square") node.strokeCap = cap;
        const join = style["stroke-linejoin"];
        if (join === "round" || join === "bevel") node.strokeJoin = join;
      }
    }
    ;
    node.opacity = opacity;
    if (blend) node.blendMode = blend;
    node.name = `svg:${el.id}`;
    if (style["filter"]) {
      const id2 = style["filter"].replace(/url\(["']?#?|["']?\)/g, "").trim();
      const def = doc.filters[id2];
      if (def?.blur) node.blur = def.blur;
      if (def?.unsupported?.length) warnings.push(`\u6EE4\u955C #${id2} \u542B ${def.unsupported.join("/")}\uFF0C\u5DF2\u964D\u7EA7\u4E3A\u6A21\u7CCA`);
    }
    wrapper.add(node);
    if (!isTransformIdentity(ownTransform)) wrapper.setTransform(ownTransform, false);
    const converted = {
      el,
      node,
      wrapper,
      baseMatrix: ownTransform,
      baseStyle: {
        fill,
        stroke,
        strokeWidth,
        opacity,
        dashPattern,
        dashOffset: style["stroke-dashoffset"] ? len(style["stroke-dashoffset"]) : void 0,
        cornerRadius: el.tag === "rect" ? Math.min(len(style["rx"], bbox.width / 2), len(style["ry"], bbox.height / 2)) || 0 : void 0,
        fontSize,
        width: node.width ?? bbox.width,
        height: node.height ?? bbox.height,
        letterSpacing: isText2 ? len(style["letter-spacing"], fontSize) || 0 : void 0,
        text: isText2 ? collectText(el.dom) : void 0
      },
      originPoint: { x: 0.5, y: 0.5 },
      bbox,
      children: []
    };
    elements.set(el.id, converted);
    order.push(converted);
    if (!isText2) {
      el.children.forEach((child) => {
        if (child.kind === "other") return;
        const c = build(child, wrapper);
        if (c) converted.children.push(c);
      });
    }
    return converted;
  };
  doc.root.children.forEach((child) => {
    build(child, content);
  });
  applyOverrides2(elements, asset);
  return {
    content,
    width: doc.width,
    height: doc.height,
    elements,
    order,
    unsupported: Array.from(new Set(warnings))
  };
}
function elementBaseMatrix(el) {
  const base = el.overrideMatrix ?? el.baseMatrix;
  const o2 = el.layoutOffset;
  if (!o2 || !o2.x && !o2.y) return base;
  return mul(translate(o2.x, o2.y), base);
}
function collectText(dom) {
  return (dom.textContent || "").replace(/\s+/g, " ").trim();
}
function isTransformIdentity(m2) {
  return m2.a === 1 && m2.b === 0 && m2.c === 0 && m2.d === 1 && m2.e === 0 && m2.f === 0;
}
function clamp01(v2) {
  if (!Number.isFinite(v2)) return 1;
  return Math.min(1, Math.max(0, v2));
}
function applyOverrides2(elements, asset) {
  Object.entries(asset.overrides || {}).forEach(([elId, patch]) => {
    const el = elements.get(elId);
    if (!el) return;
    applyPatch(el, patch, true);
  });
}
function applyPatch(converted, patch, silent = false) {
  const node = converted.node;
  if (patch.fill !== void 0) {
    node.fill = patch.fill === "none" ? void 0 : patch.fill;
    converted.baseStyle.fill = node.fill;
  }
  if (patch.stroke !== void 0) {
    node.stroke = patch.stroke === "none" ? void 0 : patch.stroke;
    converted.baseStyle.stroke = node.stroke;
  }
  if (patch.strokeWidth !== void 0) {
    node.strokeWidth = patch.strokeWidth;
    converted.baseStyle.strokeWidth = patch.strokeWidth;
  }
  if (patch.opacity !== void 0) {
    node.opacity = patch.opacity;
    converted.baseStyle.opacity = patch.opacity;
  }
  if (patch.cornerRadius !== void 0 && node.cornerRadius !== void 0) node.cornerRadius = patch.cornerRadius;
  if (patch.fontSize !== void 0) {
    node.fontSize = patch.fontSize;
    converted.baseStyle.fontSize = patch.fontSize;
  }
  if (patch.letterSpacing !== void 0) {
    node.letterSpacing = patch.letterSpacing;
    converted.baseStyle.letterSpacing = patch.letterSpacing;
  }
  if (patch.width !== void 0) {
    node.width = patch.width;
    converted.baseStyle.width = patch.width;
  }
  if (patch.height !== void 0) {
    node.height = patch.height;
    converted.baseStyle.height = patch.height;
  }
  if (patch.text !== void 0) node.text = patch.text;
  if (patch.rotation !== void 0 || patch.scale !== void 0 || patch.x !== void 0 || patch.y !== void 0) {
    let m2 = converted.baseMatrix;
    if (patch.x !== void 0 || patch.y !== void 0) {
      const dx = patch.x === void 0 ? 0 : patch.x - converted.bbox.x;
      const dy = patch.y === void 0 ? 0 : patch.y - converted.bbox.y;
      m2 = mul(translate(dx, dy), m2);
    }
    if (patch.rotation !== void 0 || patch.scale !== void 0) {
      const cx = converted.bbox.x + converted.bbox.width / 2;
      const cy = converted.bbox.y + converted.bbox.height / 2;
      m2 = mul(m2, pivotMatrix(parseCssTransform(`rotate(${patch.rotation ?? 0}deg) scale(${patch.scale ?? 1})`), cx, cy));
    }
    converted.overrideMatrix = m2;
    converted.wrapper.setTransform(elementBaseMatrix(converted), false);
  }
}
var SVG_LENGTH_RE, BLEND;
var init_convert = __esm({
  "src/lib/convert.ts"() {
    init_web_esm_min();
    init_matrix();
    init_css();
    SVG_LENGTH_RE = /^-?[\d.]+(px|em|ex|pt|pc|cm|mm|in|%)?$/;
    BLEND = {
      normal: "normal",
      multiply: "multiply",
      screen: "screen",
      overlay: "overlay",
      darken: "darken",
      lighten: "lighten",
      "color-dodge": "color-dodge",
      "color-burn": "color-burn",
      "hard-light": "hard-light",
      "soft-light": "soft-light",
      difference: "difference",
      exclusion: "exclusion",
      hue: "hue",
      saturation: "saturation",
      color: "color",
      luminosity: "luminosity"
    };
  }
});

// src/lib/layout/engine.ts
function solveLayout(items, specIn = {}) {
  const spec = { ...DEFAULT_LAYOUT, ...specIn };
  const pad = Math.max(0, spec.padding || 0);
  const gap = Math.max(0, spec.gap || 0);
  const rowGap = Math.max(0, specIn.rowGap ?? specIn.gap ?? gap);
  const innerW = spec.width ? Math.max(0, spec.width - pad * 2) : 0;
  const size2 = (item) => ({
    w: Math.max(1, Math.min(item.fixedWidth ?? item.width, spec.maxWidth ?? Infinity)),
    h: Math.max(1, item.fixedHeight ?? item.height)
  });
  if (spec.mode === "free") {
    const boxes2 = items.map((item) => {
      const { w: w2, h } = size2(item);
      return { id: item.id, x: item.x ?? 0, y: item.y ?? 0, width: w2, height: h };
    });
    return { boxes: boxes2, ...extent(boxes2) };
  }
  if (spec.mode === "grid") return solveGrid(items, spec, size2, pad, gap, rowGap, innerW);
  const horizontal = spec.mode === "row";
  const lines = [];
  let current = [];
  let mainUsed = 0;
  for (const item of items) {
    const { w: w2, h } = size2(item);
    const mainSize = horizontal ? w2 : h;
    const nextMain = current.length ? mainUsed + gap + mainSize : mainSize;
    if (spec.wrap && spec.width && horizontal && nextMain > innerW && current.length) {
      lines.push(buildLine(current, mainUsed, size2, horizontal));
      current = [];
      mainUsed = 0;
    }
    current.push(item);
    mainUsed = current.length === 1 ? mainSize : mainUsed + gap + mainSize;
  }
  if (current.length) lines.push(buildLine(current, mainUsed, size2, horizontal));
  const boxes = [];
  let crossPos = pad;
  for (const line of lines) {
    const lineMain = line.main;
    const free = horizontal ? innerW - lineMain : 0;
    let offset = 0;
    let extraGap = 0;
    if (free > 0) {
      if (spec.justify === "center") offset = free / 2;
      else if (spec.justify === "end") offset = free;
      else if (spec.justify === "between" && line.items.length > 1) extraGap = free / (line.items.length - 1);
    }
    let cursor = pad + offset;
    for (const item of line.items) {
      const { w: w2, h } = size2(item);
      const crossSize = horizontal ? h : w2;
      const mainSize = horizontal ? w2 : h;
      const crossContainer = horizontal ? line.cross : Math.max(innerW, line.cross);
      const crossOffset = alignOffset(crossContainer, crossSize, spec[horizontal ? "alignY" : "alignX"]);
      if (horizontal) {
        boxes.push({ id: item.id, x: cursor, y: crossPos + crossOffset, width: w2, height: h });
      } else {
        boxes.push({ id: item.id, x: crossPos + crossOffset, y: cursor, width: w2, height: h });
      }
      cursor += mainSize + gap + extraGap;
    }
    crossPos += line.cross + rowGap;
  }
  const contentW = Math.max(spec.width ?? 0, Math.max(pad, ...boxes.map((b2) => b2.x + b2.width)) + pad);
  const contentH = Math.max(pad, ...boxes.map((b2) => b2.y + b2.height)) + pad;
  return { boxes, width: contentW, height: contentH };
}
function buildLine(items, main2, size2, horizontal) {
  const cross = Math.max(0, ...items.map((i2) => horizontal ? size2(i2).h : size2(i2).w));
  return { items, main: main2, cross };
}
function alignOffset(containerSize, itemSize, align2) {
  switch (align2) {
    case "center":
      return (containerSize - itemSize) / 2;
    case "end":
      return containerSize - itemSize;
    case "stretch":
    case "start":
    default:
      return 0;
  }
}
function solveGrid(items, spec, size2, pad, gap, rowGap, innerW) {
  const cols = Math.max(1, Math.floor(spec.cols || 1));
  const maxItemW = Math.max(1, ...items.map((i2) => size2(i2).w));
  const colW = Math.max(maxItemW, (innerW - gap * (cols - 1)) / cols);
  const rows = Math.ceil(items.length / cols);
  const rowHeights = [];
  for (let r3 = 0; r3 < rows; r3++) {
    const slice = items.slice(r3 * cols, r3 * cols + cols);
    rowHeights.push(Math.max(1, ...slice.map((i2) => size2(i2).h)));
  }
  const boxes = items.map((item, i2) => {
    const { w: w2, h } = size2(item);
    const col = i2 % cols;
    const row = Math.floor(i2 / cols);
    const cellX = pad + col * (colW + gap);
    const cellY = pad + rowHeights.slice(0, row).reduce((s2, v2) => s2 + v2 + rowGap, 0);
    return {
      id: item.id,
      x: cellX + alignOffset(colW, w2, spec.alignX),
      y: cellY + alignOffset(rowHeights[row], h, spec.alignY),
      width: w2,
      height: h
    };
  });
  const width = pad * 2 + cols * colW + gap * (cols - 1);
  const height = pad * 2 + rowHeights.reduce((s2, v2) => s2 + v2, 0) + rowGap * Math.max(0, rows - 1);
  return { boxes, width, height };
}
function extent(boxes) {
  const width = Math.max(0, ...boxes.map((b2) => b2.x + b2.width));
  const height = Math.max(0, ...boxes.map((b2) => b2.y + b2.height));
  return { width, height };
}
var init_engine = __esm({
  "src/lib/layout/engine.ts"() {
    init_types();
  }
});

// src/lib/layout/apply.ts
function measureChild(child) {
  const bounds = child.wrapper.getBounds("box", "inner");
  const matrix = child.overrideMatrix ?? child.baseMatrix;
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height]
  ].map(([x2, y2]) => apply(matrix, x2, y2));
  const xs2 = corners.map((point) => point.x);
  const ys2 = corners.map((point) => point.y);
  return {
    id: child.el.id,
    x: Math.min(...xs2),
    y: Math.min(...ys2),
    width: Math.max(1, Math.max(...xs2) - Math.min(...xs2)),
    height: Math.max(1, Math.max(...ys2) - Math.min(...ys2))
  };
}
function layoutContainer(container, spec) {
  const measured = container.children.map(measureChild);
  const x2 = Math.min(...measured.map((item) => item.x));
  const y2 = Math.min(...measured.map((item) => item.y));
  const items = measured.map((item) => ({ ...item, x: item.x - x2, y: item.y - y2 }));
  const result = solveLayout(items, { ...spec, maxWidth: null });
  result.boxes.forEach((box, index) => {
    const child = container.children[index];
    child.layoutOffset = { x: box.x - items[index].x, y: box.y - items[index].y };
    child.wrapper.setTransform(elementBaseMatrix(child), false);
  });
  return result;
}
function applyAssetLayouts(converted, layouts) {
  const results = /* @__PURE__ */ new Map();
  if (!layouts || !Object.keys(layouts).length) return results;
  for (const container of [...converted.order].reverse()) {
    const spec = layouts[container.el.id];
    if (spec && container.children.length) results.set(container.el.id, layoutContainer(container, spec));
  }
  return results;
}
var init_apply = __esm({
  "src/lib/layout/apply.ts"() {
    init_matrix();
    init_convert();
    init_engine();
  }
});

// node_modules/.pnpm/gsap@3.15.0/node_modules/gsap/gsap-core.js
function _assertThisInitialized(self) {
  if (self === void 0) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }
  return self;
}
function _inheritsLoose(subClass, superClass) {
  subClass.prototype = Object.create(superClass.prototype);
  subClass.prototype.constructor = subClass;
  subClass.__proto__ = superClass;
}
var _config, _defaults, _suppressOverwrites, _reverting, _context, _bigNum, _tinyNum, _2PI, _HALF_PI, _gsID, _sqrt, _cos, _sin, _isString, _isFunction, _isNumber, _isUndefined, _isObject, _isNotFalse, _windowExists, _isFuncOrString, _isTypedArray, _isArray, _randomExp, _commaDelimExp, _strictNumExp, _numExp, _numWithUnitExp, _complexStringNumExp, _relExp, _delimitedValueExp, _unitExp, _globalTimeline, _win, _coreInitted, _doc, _globals, _installScope, _coreReady, _install, _missingPlugin, _warn, _addGlobal, _emptyFunc, _startAtRevertConfig, _revertConfigNoKill, _revertConfig, _reservedProps, _lazyTweens, _lazyLookup, _lastRenderedFrame, _plugins, _effects, _nextGCFrame, _harnessPlugins, _callbackNames, _harness, _getCache, _getProperty, _forEachName, _round, _roundPrecise, _parseRelative, _arrayContainsAny, _lazyRender, _isRevertWorthy, _lazySafeRender, _numericIfPossible, _passThrough, _setDefaults, _setKeyframeDefaults, _merge, _mergeDeep, _copyExcluding, _inheritDefaults, _arraysMatch, _addLinkedListItem, _removeLinkedListItem, _removeFromParent, _uncache, _recacheAncestors, _rewindStartAt, _hasNoPausedAncestors, _elapsedCycleDuration, _animationCycle, _parentToChildTotalTime, _setEnd, _alignPlayhead, _postAddChecks, _addToTimeline, _scrollTrigger, _attemptInitTween, _parentPlayheadIsBeforeStart, _isFromOrFromStart, _renderZeroDurationTween, _findNextPauseTween, _setDuration, _onUpdateTotalDuration, _zeroPosition, _parsePosition, _createTweenType, _conditionalReturn, _clamp, getUnit, clamp, _slice, _isArrayLike, _flatten, toArray, selector, shuffle, distribute, _roundModifier, snap, random, pipe, unitize, normalize, _wrapArray, wrap, wrapYoyo, _replaceRandom, mapRange, interpolate, _getLabelInDirection, _callback, _interrupt, _quickTween, _registerPluginQueue, _createPlugin, _255, _colorLookup, _hue, splitColor, _colorOrderData, _formatColors, _colorExp, _hslExp, _colorStringFilter, _tickerActive, _ticker, _wake, _easeMap, _customEaseExp, _quotesExp, _parseObjectInString, _valueInParentheses, _configEaseFromString, _invertEase, _parseEase, _insertEase, _easeInOutFromOut, _configElastic, _configBack, GSCache, Animation, Timeline, _addComplexStringPropTween, _addPropTween, _processVars, _checkPlugin, _overwritingTween, _forceAllPropTweens, _initTween, _updatePropTweens, _addAliasesToVars, _parseKeyframe, _parseFuncOrString, _staggerTweenProps, _staggerPropsToSkip, Tween, _setterPlain, _setterFunc, _setterFuncWithParam, _setterAttribute, _getSetter, _renderPlain, _renderBoolean, _renderComplexString, _renderPropTweens, _addPluginModifier, _killPropTweensOf, _setterWithModifier, _sortPropTweensByPriority, PropTween, _media, _listeners, _emptyArray, _lastMediaTime, _contextID, _dispatch, _onMediaChange, Context, MatchMedia, _gsap, _getPluginPropTween, _addModifiers, _buildModifierPlugin, gsap, Power0, Power1, Power2, Power3, Power4, Linear, Quad, Cubic, Quart, Quint, Strong, Elastic, Back, SteppedEase, Bounce, Sine, Expo, Circ;
var init_gsap_core = __esm({
  "node_modules/.pnpm/gsap@3.15.0/node_modules/gsap/gsap-core.js"() {
    _config = {
      autoSleep: 120,
      force3D: "auto",
      nullTargetWarn: 1,
      units: {
        lineHeight: ""
      }
    };
    _defaults = {
      duration: 0.5,
      overwrite: false,
      delay: 0
    };
    _bigNum = 1e8;
    _tinyNum = 1 / _bigNum;
    _2PI = Math.PI * 2;
    _HALF_PI = _2PI / 4;
    _gsID = 0;
    _sqrt = Math.sqrt;
    _cos = Math.cos;
    _sin = Math.sin;
    _isString = function _isString2(value) {
      return typeof value === "string";
    };
    _isFunction = function _isFunction2(value) {
      return typeof value === "function";
    };
    _isNumber = function _isNumber2(value) {
      return typeof value === "number";
    };
    _isUndefined = function _isUndefined2(value) {
      return typeof value === "undefined";
    };
    _isObject = function _isObject2(value) {
      return typeof value === "object";
    };
    _isNotFalse = function _isNotFalse2(value) {
      return value !== false;
    };
    _windowExists = function _windowExists2() {
      return typeof window !== "undefined";
    };
    _isFuncOrString = function _isFuncOrString2(value) {
      return _isFunction(value) || _isString(value);
    };
    _isTypedArray = typeof ArrayBuffer === "function" && ArrayBuffer.isView || function() {
    };
    _isArray = Array.isArray;
    _randomExp = /random\([^)]+\)/g;
    _commaDelimExp = /,\s*/g;
    _strictNumExp = /(?:-?\.?\d|\.)+/gi;
    _numExp = /[-+=.]*\d+[.e\-+]*\d*[e\-+]*\d*/g;
    _numWithUnitExp = /[-+=.]*\d+[.e-]*\d*[a-z%]*/g;
    _complexStringNumExp = /[-+=.]*\d+\.?\d*(?:e-|e\+)?\d*/gi;
    _relExp = /[+-]=-?[.\d]+/;
    _delimitedValueExp = /[^,'"\[\]\s]+/gi;
    _unitExp = /^[+\-=e\s\d]*\d+[.\d]*([a-z]*|%)\s*$/i;
    _globals = {};
    _installScope = {};
    _install = function _install2(scope) {
      return (_installScope = _merge(scope, _globals)) && gsap;
    };
    _missingPlugin = function _missingPlugin2(property, value) {
      return console.warn("Invalid property", property, "set to", value, "Missing plugin? gsap.registerPlugin()");
    };
    _warn = function _warn2(message, suppress) {
      return !suppress && console.warn(message);
    };
    _addGlobal = function _addGlobal2(name, obj) {
      return name && (_globals[name] = obj) && _installScope && (_installScope[name] = obj) || _globals;
    };
    _emptyFunc = function _emptyFunc2() {
      return 0;
    };
    _startAtRevertConfig = {
      suppressEvents: true,
      isStart: true,
      kill: false
    };
    _revertConfigNoKill = {
      suppressEvents: true,
      kill: false
    };
    _revertConfig = {
      suppressEvents: true
    };
    _reservedProps = {};
    _lazyTweens = [];
    _lazyLookup = {};
    _plugins = {};
    _effects = {};
    _nextGCFrame = 30;
    _harnessPlugins = [];
    _callbackNames = "";
    _harness = function _harness2(targets) {
      var target = targets[0], harnessPlugin, i2;
      _isObject(target) || _isFunction(target) || (targets = [targets]);
      if (!(harnessPlugin = (target._gsap || {}).harness)) {
        i2 = _harnessPlugins.length;
        while (i2-- && !_harnessPlugins[i2].targetTest(target)) {
        }
        harnessPlugin = _harnessPlugins[i2];
      }
      i2 = targets.length;
      while (i2--) {
        targets[i2] && (targets[i2]._gsap || (targets[i2]._gsap = new GSCache(targets[i2], harnessPlugin))) || targets.splice(i2, 1);
      }
      return targets;
    };
    _getCache = function _getCache2(target) {
      return target._gsap || _harness(toArray(target))[0]._gsap;
    };
    _getProperty = function _getProperty2(target, property, v2) {
      return (v2 = target[property]) && _isFunction(v2) ? target[property]() : _isUndefined(v2) && target.getAttribute && target.getAttribute(property) || v2;
    };
    _forEachName = function _forEachName2(names, func) {
      return (names = names.split(",")).forEach(func) || names;
    };
    _round = function _round2(value) {
      return Math.round(value * 1e5) / 1e5 || 0;
    };
    _roundPrecise = function _roundPrecise2(value) {
      return Math.round(value * 1e7) / 1e7 || 0;
    };
    _parseRelative = function _parseRelative2(start, value) {
      var operator = value.charAt(0), end = parseFloat(value.substr(2));
      start = parseFloat(start);
      return operator === "+" ? start + end : operator === "-" ? start - end : operator === "*" ? start * end : start / end;
    };
    _arrayContainsAny = function _arrayContainsAny2(toSearch, toFind) {
      var l2 = toFind.length, i2 = 0;
      for (; toSearch.indexOf(toFind[i2]) < 0 && ++i2 < l2; ) {
      }
      return i2 < l2;
    };
    _lazyRender = function _lazyRender2() {
      var l2 = _lazyTweens.length, a = _lazyTweens.slice(0), i2, tween;
      _lazyLookup = {};
      _lazyTweens.length = 0;
      for (i2 = 0; i2 < l2; i2++) {
        tween = a[i2];
        tween && tween._lazy && (tween.render(tween._lazy[0], tween._lazy[1], true)._lazy = 0);
      }
    };
    _isRevertWorthy = function _isRevertWorthy2(animation) {
      return !!(animation._initted || animation._startAt || animation.add);
    };
    _lazySafeRender = function _lazySafeRender2(animation, time, suppressEvents, force) {
      _lazyTweens.length && !_reverting && _lazyRender();
      animation.render(time, suppressEvents, force || !!(_reverting && time < 0 && _isRevertWorthy(animation)));
      _lazyTweens.length && !_reverting && _lazyRender();
    };
    _numericIfPossible = function _numericIfPossible2(value) {
      var n3 = parseFloat(value);
      return (n3 || n3 === 0) && (value + "").match(_delimitedValueExp).length < 2 ? n3 : _isString(value) ? value.trim() : value;
    };
    _passThrough = function _passThrough2(p2) {
      return p2;
    };
    _setDefaults = function _setDefaults2(obj, defaults2) {
      for (var p2 in defaults2) {
        p2 in obj || (obj[p2] = defaults2[p2]);
      }
      return obj;
    };
    _setKeyframeDefaults = function _setKeyframeDefaults2(excludeDuration) {
      return function(obj, defaults2) {
        for (var p2 in defaults2) {
          p2 in obj || p2 === "duration" && excludeDuration || p2 === "ease" || (obj[p2] = defaults2[p2]);
        }
      };
    };
    _merge = function _merge2(base, toMerge) {
      for (var p2 in toMerge) {
        base[p2] = toMerge[p2];
      }
      return base;
    };
    _mergeDeep = function _mergeDeep2(base, toMerge) {
      for (var p2 in toMerge) {
        p2 !== "__proto__" && p2 !== "constructor" && p2 !== "prototype" && (base[p2] = _isObject(toMerge[p2]) ? _mergeDeep2(base[p2] || (base[p2] = {}), toMerge[p2]) : toMerge[p2]);
      }
      return base;
    };
    _copyExcluding = function _copyExcluding2(obj, excluding) {
      var copy = {}, p2;
      for (p2 in obj) {
        p2 in excluding || (copy[p2] = obj[p2]);
      }
      return copy;
    };
    _inheritDefaults = function _inheritDefaults2(vars) {
      var parent = vars.parent || _globalTimeline, func = vars.keyframes ? _setKeyframeDefaults(_isArray(vars.keyframes)) : _setDefaults;
      if (_isNotFalse(vars.inherit)) {
        while (parent) {
          func(vars, parent.vars.defaults);
          parent = parent.parent || parent._dp;
        }
      }
      return vars;
    };
    _arraysMatch = function _arraysMatch2(a1, a2) {
      var i2 = a1.length, match = i2 === a2.length;
      while (match && i2-- && a1[i2] === a2[i2]) {
      }
      return i2 < 0;
    };
    _addLinkedListItem = function _addLinkedListItem2(parent, child, firstProp, lastProp, sortBy) {
      if (firstProp === void 0) {
        firstProp = "_first";
      }
      if (lastProp === void 0) {
        lastProp = "_last";
      }
      var prev = parent[lastProp], t2;
      if (sortBy) {
        t2 = child[sortBy];
        while (prev && prev[sortBy] > t2) {
          prev = prev._prev;
        }
      }
      if (prev) {
        child._next = prev._next;
        prev._next = child;
      } else {
        child._next = parent[firstProp];
        parent[firstProp] = child;
      }
      if (child._next) {
        child._next._prev = child;
      } else {
        parent[lastProp] = child;
      }
      child._prev = prev;
      child.parent = child._dp = parent;
      return child;
    };
    _removeLinkedListItem = function _removeLinkedListItem2(parent, child, firstProp, lastProp) {
      if (firstProp === void 0) {
        firstProp = "_first";
      }
      if (lastProp === void 0) {
        lastProp = "_last";
      }
      var prev = child._prev, next = child._next;
      if (prev) {
        prev._next = next;
      } else if (parent[firstProp] === child) {
        parent[firstProp] = next;
      }
      if (next) {
        next._prev = prev;
      } else if (parent[lastProp] === child) {
        parent[lastProp] = prev;
      }
      child._next = child._prev = child.parent = null;
    };
    _removeFromParent = function _removeFromParent2(child, onlyIfParentHasAutoRemove) {
      child.parent && (!onlyIfParentHasAutoRemove || child.parent.autoRemoveChildren) && child.parent.remove && child.parent.remove(child);
      child._act = 0;
    };
    _uncache = function _uncache2(animation, child) {
      if (animation && (!child || child._end > animation._dur || child._start < 0)) {
        var a = animation;
        while (a) {
          a._dirty = 1;
          a = a.parent;
        }
      }
      return animation;
    };
    _recacheAncestors = function _recacheAncestors2(animation) {
      var parent = animation.parent;
      while (parent && parent.parent) {
        parent._dirty = 1;
        parent.totalDuration();
        parent = parent.parent;
      }
      return animation;
    };
    _rewindStartAt = function _rewindStartAt2(tween, totalTime, suppressEvents, force) {
      return tween._startAt && (_reverting ? tween._startAt.revert(_revertConfigNoKill) : tween.vars.immediateRender && !tween.vars.autoRevert || tween._startAt.render(totalTime, true, force));
    };
    _hasNoPausedAncestors = function _hasNoPausedAncestors2(animation) {
      return !animation || animation._ts && _hasNoPausedAncestors2(animation.parent);
    };
    _elapsedCycleDuration = function _elapsedCycleDuration2(animation) {
      return animation._repeat ? _animationCycle(animation._tTime, animation = animation.duration() + animation._rDelay) * animation : 0;
    };
    _animationCycle = function _animationCycle2(tTime, cycleDuration) {
      var whole = Math.floor(tTime = _roundPrecise(tTime / cycleDuration));
      return tTime && whole === tTime ? whole - 1 : whole;
    };
    _parentToChildTotalTime = function _parentToChildTotalTime2(parentTime, child) {
      return (parentTime - child._start) * child._ts + (child._ts >= 0 ? 0 : child._dirty ? child.totalDuration() : child._tDur);
    };
    _setEnd = function _setEnd2(animation) {
      return animation._end = _roundPrecise(animation._start + (animation._tDur / Math.abs(animation._ts || animation._rts || _tinyNum) || 0));
    };
    _alignPlayhead = function _alignPlayhead2(animation, totalTime) {
      var parent = animation._dp;
      if (parent && parent.smoothChildTiming && animation._ts) {
        animation._start = _roundPrecise(parent._time - (animation._ts > 0 ? totalTime / animation._ts : ((animation._dirty ? animation.totalDuration() : animation._tDur) - totalTime) / -animation._ts));
        _setEnd(animation);
        parent._dirty || _uncache(parent, animation);
      }
      return animation;
    };
    _postAddChecks = function _postAddChecks2(timeline2, child) {
      var t2;
      if (child._time || !child._dur && child._initted || child._start < timeline2._time && (child._dur || !child.add)) {
        t2 = _parentToChildTotalTime(timeline2.rawTime(), child);
        if (!child._dur || _clamp(0, child.totalDuration(), t2) - child._tTime > _tinyNum) {
          child.render(t2, true);
        }
      }
      if (_uncache(timeline2, child)._dp && timeline2._initted && timeline2._time >= timeline2._dur && timeline2._ts) {
        if (timeline2._dur < timeline2.duration()) {
          t2 = timeline2;
          while (t2._dp) {
            t2.rawTime() >= 0 && t2.totalTime(t2._tTime);
            t2 = t2._dp;
          }
        }
        timeline2._zTime = -_tinyNum;
      }
    };
    _addToTimeline = function _addToTimeline2(timeline2, child, position, skipChecks) {
      child.parent && _removeFromParent(child);
      child._start = _roundPrecise((_isNumber(position) ? position : position || timeline2 !== _globalTimeline ? _parsePosition(timeline2, position, child) : timeline2._time) + child._delay);
      child._end = _roundPrecise(child._start + (child.totalDuration() / Math.abs(child.timeScale()) || 0));
      _addLinkedListItem(timeline2, child, "_first", "_last", timeline2._sort ? "_start" : 0);
      _isFromOrFromStart(child) || (timeline2._recent = child);
      skipChecks || _postAddChecks(timeline2, child);
      timeline2._ts < 0 && _alignPlayhead(timeline2, timeline2._tTime);
      return timeline2;
    };
    _scrollTrigger = function _scrollTrigger2(animation, trigger) {
      return (_globals.ScrollTrigger || _missingPlugin("scrollTrigger", trigger)) && _globals.ScrollTrigger.create(trigger, animation);
    };
    _attemptInitTween = function _attemptInitTween2(tween, time, force, suppressEvents, tTime) {
      _initTween(tween, time, tTime);
      if (!tween._initted) {
        return 1;
      }
      if (!force && tween._pt && !_reverting && (tween._dur && tween.vars.lazy !== false || !tween._dur && tween.vars.lazy) && _lastRenderedFrame !== _ticker.frame) {
        _lazyTweens.push(tween);
        tween._lazy = [tTime, suppressEvents];
        return 1;
      }
    };
    _parentPlayheadIsBeforeStart = function _parentPlayheadIsBeforeStart2(_ref) {
      var parent = _ref.parent;
      return parent && parent._ts && parent._initted && !parent._lock && (parent.rawTime() < 0 || _parentPlayheadIsBeforeStart2(parent));
    };
    _isFromOrFromStart = function _isFromOrFromStart2(_ref2) {
      var data = _ref2.data;
      return data === "isFromStart" || data === "isStart";
    };
    _renderZeroDurationTween = function _renderZeroDurationTween2(tween, totalTime, suppressEvents, force) {
      var prevRatio = tween.ratio, ratio = totalTime < 0 || !totalTime && (!tween._start && _parentPlayheadIsBeforeStart(tween) && !(!tween._initted && _isFromOrFromStart(tween)) || (tween._ts < 0 || tween._dp._ts < 0) && !_isFromOrFromStart(tween)) ? 0 : 1, repeatDelay = tween._rDelay, tTime = 0, pt4, iteration, prevIteration;
      if (repeatDelay && tween._repeat) {
        tTime = _clamp(0, tween._tDur, totalTime);
        iteration = _animationCycle(tTime, repeatDelay);
        tween._yoyo && iteration & 1 && (ratio = 1 - ratio);
        if (iteration !== _animationCycle(tween._tTime, repeatDelay)) {
          prevRatio = 1 - ratio;
          tween.vars.repeatRefresh && tween._initted && tween.invalidate();
        }
      }
      if (ratio !== prevRatio || _reverting || force || tween._zTime === _tinyNum || !totalTime && tween._zTime) {
        if (!tween._initted && _attemptInitTween(tween, totalTime, force, suppressEvents, tTime)) {
          return;
        }
        prevIteration = tween._zTime;
        tween._zTime = totalTime || (suppressEvents ? _tinyNum : 0);
        suppressEvents || (suppressEvents = totalTime && !prevIteration);
        tween.ratio = ratio;
        tween._from && (ratio = 1 - ratio);
        tween._time = 0;
        tween._tTime = tTime;
        pt4 = tween._pt;
        while (pt4) {
          pt4.r(ratio, pt4.d);
          pt4 = pt4._next;
        }
        totalTime < 0 && _rewindStartAt(tween, totalTime, suppressEvents, true);
        tween._onUpdate && !suppressEvents && _callback(tween, "onUpdate");
        tTime && tween._repeat && !suppressEvents && tween.parent && _callback(tween, "onRepeat");
        if ((totalTime >= tween._tDur || totalTime < 0) && tween.ratio === ratio) {
          ratio && _removeFromParent(tween, 1);
          if (!suppressEvents && !_reverting) {
            _callback(tween, ratio ? "onComplete" : "onReverseComplete", true);
            tween._prom && tween._prom();
          }
        }
      } else if (!tween._zTime) {
        tween._zTime = totalTime;
      }
    };
    _findNextPauseTween = function _findNextPauseTween2(animation, prevTime, time) {
      var child;
      if (time > prevTime) {
        child = animation._first;
        while (child && child._start <= time) {
          if (child.data === "isPause" && child._start > prevTime) {
            return child;
          }
          child = child._next;
        }
      } else {
        child = animation._last;
        while (child && child._start >= time) {
          if (child.data === "isPause" && child._start < prevTime) {
            return child;
          }
          child = child._prev;
        }
      }
    };
    _setDuration = function _setDuration2(animation, duration, skipUncache, leavePlayhead) {
      var repeat = animation._repeat, dur = _roundPrecise(duration) || 0, totalProgress = animation._tTime / animation._tDur;
      totalProgress && !leavePlayhead && (animation._time *= dur / animation._dur);
      animation._dur = dur;
      animation._tDur = !repeat ? dur : repeat < 0 ? 1e10 : _roundPrecise(dur * (repeat + 1) + animation._rDelay * repeat);
      totalProgress > 0 && !leavePlayhead && _alignPlayhead(animation, animation._tTime = animation._tDur * totalProgress);
      animation.parent && _setEnd(animation);
      skipUncache || _uncache(animation.parent, animation);
      return animation;
    };
    _onUpdateTotalDuration = function _onUpdateTotalDuration2(animation) {
      return animation instanceof Timeline ? _uncache(animation) : _setDuration(animation, animation._dur);
    };
    _zeroPosition = {
      _start: 0,
      endTime: _emptyFunc,
      totalDuration: _emptyFunc
    };
    _parsePosition = function _parsePosition2(animation, position, percentAnimation) {
      var labels = animation.labels, recent = animation._recent || _zeroPosition, clippedDuration = animation.duration() >= _bigNum ? recent.endTime(false) : animation._dur, i2, offset, isPercent;
      if (_isString(position) && (isNaN(position) || position in labels)) {
        offset = position.charAt(0);
        isPercent = position.substr(-1) === "%";
        i2 = position.indexOf("=");
        if (offset === "<" || offset === ">") {
          i2 >= 0 && (position = position.replace(/=/, ""));
          return (offset === "<" ? recent._start : recent.endTime(recent._repeat >= 0)) + (parseFloat(position.substr(1)) || 0) * (isPercent ? (i2 < 0 ? recent : percentAnimation).totalDuration() / 100 : 1);
        }
        if (i2 < 0) {
          position in labels || (labels[position] = clippedDuration);
          return labels[position];
        }
        offset = parseFloat(position.charAt(i2 - 1) + position.substr(i2 + 1));
        if (isPercent && percentAnimation) {
          offset = offset / 100 * (_isArray(percentAnimation) ? percentAnimation[0] : percentAnimation).totalDuration();
        }
        return i2 > 1 ? _parsePosition2(animation, position.substr(0, i2 - 1), percentAnimation) + offset : clippedDuration + offset;
      }
      return position == null ? clippedDuration : +position;
    };
    _createTweenType = function _createTweenType2(type, params, timeline2) {
      var isLegacy = _isNumber(params[1]), varsIndex = (isLegacy ? 2 : 1) + (type < 2 ? 0 : 1), vars = params[varsIndex], irVars, parent;
      isLegacy && (vars.duration = params[1]);
      vars.parent = timeline2;
      if (type) {
        irVars = vars;
        parent = timeline2;
        while (parent && !("immediateRender" in irVars)) {
          irVars = parent.vars.defaults || {};
          parent = _isNotFalse(parent.vars.inherit) && parent.parent;
        }
        vars.immediateRender = _isNotFalse(irVars.immediateRender);
        type < 2 ? vars.runBackwards = 1 : vars.startAt = params[varsIndex - 1];
      }
      return new Tween(params[0], vars, params[varsIndex + 1]);
    };
    _conditionalReturn = function _conditionalReturn2(value, func) {
      return value || value === 0 ? func(value) : func;
    };
    _clamp = function _clamp2(min, max, value) {
      return value < min ? min : value > max ? max : value;
    };
    getUnit = function getUnit2(value, v2) {
      return !_isString(value) || !(v2 = _unitExp.exec(value)) ? "" : v2[1];
    };
    clamp = function clamp2(min, max, value) {
      return _conditionalReturn(value, function(v2) {
        return _clamp(min, max, v2);
      });
    };
    _slice = [].slice;
    _isArrayLike = function _isArrayLike2(value, nonEmpty) {
      return value && _isObject(value) && "length" in value && (!nonEmpty && !value.length || value.length - 1 in value && _isObject(value[0])) && !value.nodeType && value !== _win;
    };
    _flatten = function _flatten2(ar2, leaveStrings, accumulator) {
      if (accumulator === void 0) {
        accumulator = [];
      }
      return ar2.forEach(function(value) {
        var _accumulator;
        return _isString(value) && !leaveStrings || _isArrayLike(value, 1) ? (_accumulator = accumulator).push.apply(_accumulator, toArray(value)) : accumulator.push(value);
      }) || accumulator;
    };
    toArray = function toArray2(value, scope, leaveStrings) {
      return _context && !scope && _context.selector ? _context.selector(value) : _isString(value) && !leaveStrings && (_coreInitted || !_wake()) ? _slice.call((scope || _doc).querySelectorAll(value), 0) : _isArray(value) ? _flatten(value, leaveStrings) : _isArrayLike(value) ? _slice.call(value, 0) : value ? [value] : [];
    };
    selector = function selector2(value) {
      value = toArray(value)[0] || _warn("Invalid scope") || {};
      return function(v2) {
        var el = value.current || value.nativeElement || value;
        return toArray(v2, el.querySelectorAll ? el : el === value ? _warn("Invalid scope") || _doc.createElement("div") : value);
      };
    };
    shuffle = function shuffle2(a) {
      return a.sort(function() {
        return 0.5 - Math.random();
      });
    };
    distribute = function distribute2(v2) {
      if (_isFunction(v2)) {
        return v2;
      }
      var vars = _isObject(v2) ? v2 : {
        each: v2
      }, ease = _parseEase(vars.ease), from = vars.from || 0, base = parseFloat(vars.base) || 0, cache = {}, isDecimal = from > 0 && from < 1, ratios = isNaN(from) || isDecimal, axis = vars.axis, ratioX = from, ratioY = from;
      if (_isString(from)) {
        ratioX = ratioY = {
          center: 0.5,
          edges: 0.5,
          end: 1
        }[from] || 0;
      } else if (!isDecimal && ratios) {
        ratioX = from[0];
        ratioY = from[1];
      }
      return function(i2, target, a) {
        var l2 = (a || vars).length, distances = cache[l2], originX, originY, x2, y2, d2, j3, max, min, wrapAt;
        if (!distances) {
          wrapAt = vars.grid === "auto" ? 0 : (vars.grid || [1, _bigNum])[1];
          if (!wrapAt) {
            max = -_bigNum;
            while (max < (max = a[wrapAt++].getBoundingClientRect().left) && wrapAt < l2) {
            }
            wrapAt < l2 && wrapAt--;
          }
          distances = cache[l2] = [];
          originX = ratios ? Math.min(wrapAt, l2) * ratioX - 0.5 : from % wrapAt;
          originY = wrapAt === _bigNum ? 0 : ratios ? l2 * ratioY / wrapAt - 0.5 : from / wrapAt | 0;
          max = 0;
          min = _bigNum;
          for (j3 = 0; j3 < l2; j3++) {
            x2 = j3 % wrapAt - originX;
            y2 = originY - (j3 / wrapAt | 0);
            distances[j3] = d2 = !axis ? _sqrt(x2 * x2 + y2 * y2) : Math.abs(axis === "y" ? y2 : x2);
            d2 > max && (max = d2);
            d2 < min && (min = d2);
          }
          from === "random" && shuffle(distances);
          distances.max = max - min;
          distances.min = min;
          distances.v = l2 = (parseFloat(vars.amount) || parseFloat(vars.each) * (wrapAt > l2 ? l2 - 1 : !axis ? Math.max(wrapAt, l2 / wrapAt) : axis === "y" ? l2 / wrapAt : wrapAt) || 0) * (from === "edges" ? -1 : 1);
          distances.b = l2 < 0 ? base - l2 : base;
          distances.u = getUnit(vars.amount || vars.each) || 0;
          ease = ease && l2 < 0 ? _invertEase(ease) : ease;
        }
        l2 = (distances[i2] - distances.min) / distances.max || 0;
        return _roundPrecise(distances.b + (ease ? ease(l2) : l2) * distances.v) + distances.u;
      };
    };
    _roundModifier = function _roundModifier2(v2) {
      var p2 = Math.pow(10, ((v2 + "").split(".")[1] || "").length);
      return function(raw) {
        var n3 = _roundPrecise(Math.round(parseFloat(raw) / v2) * v2 * p2);
        return (n3 - n3 % 1) / p2 + (_isNumber(raw) ? 0 : getUnit(raw));
      };
    };
    snap = function snap2(snapTo, value) {
      var isArray = _isArray(snapTo), radius, is2D;
      if (!isArray && _isObject(snapTo)) {
        radius = isArray = snapTo.radius || _bigNum;
        if (snapTo.values) {
          snapTo = toArray(snapTo.values);
          if (is2D = !_isNumber(snapTo[0])) {
            radius *= radius;
          }
        } else {
          snapTo = _roundModifier(snapTo.increment);
        }
      }
      return _conditionalReturn(value, !isArray ? _roundModifier(snapTo) : _isFunction(snapTo) ? function(raw) {
        is2D = snapTo(raw);
        return Math.abs(is2D - raw) <= radius ? is2D : raw;
      } : function(raw) {
        var x2 = parseFloat(is2D ? raw.x : raw), y2 = parseFloat(is2D ? raw.y : 0), min = _bigNum, closest = 0, i2 = snapTo.length, dx, dy;
        while (i2--) {
          if (is2D) {
            dx = snapTo[i2].x - x2;
            dy = snapTo[i2].y - y2;
            dx = dx * dx + dy * dy;
          } else {
            dx = Math.abs(snapTo[i2] - x2);
          }
          if (dx < min) {
            min = dx;
            closest = i2;
          }
        }
        closest = !radius || min <= radius ? snapTo[closest] : raw;
        return is2D || closest === raw || _isNumber(raw) ? closest : closest + getUnit(raw);
      });
    };
    random = function random2(min, max, roundingIncrement, returnFunction) {
      return _conditionalReturn(_isArray(min) ? !max : roundingIncrement === true ? !!(roundingIncrement = 0) : !returnFunction, function() {
        return _isArray(min) ? min[~~(Math.random() * min.length)] : (roundingIncrement = roundingIncrement || 1e-5) && (returnFunction = roundingIncrement < 1 ? Math.pow(10, (roundingIncrement + "").length - 2) : 1) && Math.floor(Math.round((min - roundingIncrement / 2 + Math.random() * (max - min + roundingIncrement * 0.99)) / roundingIncrement) * roundingIncrement * returnFunction) / returnFunction;
      });
    };
    pipe = function pipe2() {
      for (var _len = arguments.length, functions = new Array(_len), _key = 0; _key < _len; _key++) {
        functions[_key] = arguments[_key];
      }
      return function(value) {
        return functions.reduce(function(v2, f2) {
          return f2(v2);
        }, value);
      };
    };
    unitize = function unitize2(func, unit) {
      return function(value) {
        return func(parseFloat(value)) + (unit || getUnit(value));
      };
    };
    normalize = function normalize2(min, max, value) {
      return mapRange(min, max, 0, 1, value);
    };
    _wrapArray = function _wrapArray2(a, wrapper, value) {
      return _conditionalReturn(value, function(index) {
        return a[~~wrapper(index)];
      });
    };
    wrap = function wrap2(min, max, value) {
      var range = max - min;
      return _isArray(min) ? _wrapArray(min, wrap2(0, min.length), max) : _conditionalReturn(value, function(value2) {
        return (range + (value2 - min) % range) % range + min;
      });
    };
    wrapYoyo = function wrapYoyo2(min, max, value) {
      var range = max - min, total = range * 2;
      return _isArray(min) ? _wrapArray(min, wrapYoyo2(0, min.length - 1), max) : _conditionalReturn(value, function(value2) {
        value2 = (total + (value2 - min) % total) % total || 0;
        return min + (value2 > range ? total - value2 : value2);
      });
    };
    _replaceRandom = function _replaceRandom2(s2) {
      return s2.replace(_randomExp, function(match) {
        var arIndex = match.indexOf("[") + 1, values = match.substring(arIndex || 7, arIndex ? match.indexOf("]") : match.length - 1).split(_commaDelimExp);
        return random(arIndex ? values : +values[0], arIndex ? 0 : +values[1], +values[2] || 1e-5);
      });
    };
    mapRange = function mapRange2(inMin, inMax, outMin, outMax, value) {
      var inRange = inMax - inMin, outRange = outMax - outMin;
      return _conditionalReturn(value, function(value2) {
        return outMin + ((value2 - inMin) / inRange * outRange || 0);
      });
    };
    interpolate = function interpolate2(start, end, progress, mutate) {
      var func = isNaN(start + end) ? 0 : function(p3) {
        return (1 - p3) * start + p3 * end;
      };
      if (!func) {
        var isString = _isString(start), master = {}, p2, i2, interpolators, l2, il;
        progress === true && (mutate = 1) && (progress = null);
        if (isString) {
          start = {
            p: start
          };
          end = {
            p: end
          };
        } else if (_isArray(start) && !_isArray(end)) {
          interpolators = [];
          l2 = start.length;
          il = l2 - 2;
          for (i2 = 1; i2 < l2; i2++) {
            interpolators.push(interpolate2(start[i2 - 1], start[i2]));
          }
          l2--;
          func = function func2(p3) {
            p3 *= l2;
            var i3 = Math.min(il, ~~p3);
            return interpolators[i3](p3 - i3);
          };
          progress = end;
        } else if (!mutate) {
          start = _merge(_isArray(start) ? [] : {}, start);
        }
        if (!interpolators) {
          for (p2 in end) {
            _addPropTween.call(master, start, p2, "get", end[p2]);
          }
          func = function func2(p3) {
            return _renderPropTweens(p3, master) || (isString ? start.p : start);
          };
        }
      }
      return _conditionalReturn(progress, func);
    };
    _getLabelInDirection = function _getLabelInDirection2(timeline2, fromTime, backward) {
      var labels = timeline2.labels, min = _bigNum, p2, distance, label;
      for (p2 in labels) {
        distance = labels[p2] - fromTime;
        if (distance < 0 === !!backward && distance && min > (distance = Math.abs(distance))) {
          label = p2;
          min = distance;
        }
      }
      return label;
    };
    _callback = function _callback2(animation, type, executeLazyFirst) {
      var v2 = animation.vars, callback = v2[type], prevContext = _context, context3 = animation._ctx, params, scope, result;
      if (!callback) {
        return;
      }
      params = v2[type + "Params"];
      scope = v2.callbackScope || animation;
      executeLazyFirst && _lazyTweens.length && _lazyRender();
      context3 && (_context = context3);
      result = params ? callback.apply(scope, params) : callback.call(scope);
      _context = prevContext;
      return result;
    };
    _interrupt = function _interrupt2(animation) {
      _removeFromParent(animation);
      animation.scrollTrigger && animation.scrollTrigger.kill(!!_reverting);
      animation.progress() < 1 && _callback(animation, "onInterrupt");
      return animation;
    };
    _registerPluginQueue = [];
    _createPlugin = function _createPlugin2(config3) {
      if (!config3) return;
      config3 = !config3.name && config3["default"] || config3;
      if (_windowExists() || config3.headless) {
        var name = config3.name, isFunc = _isFunction(config3), Plugin = name && !isFunc && config3.init ? function() {
          this._props = [];
        } : config3, instanceDefaults = {
          init: _emptyFunc,
          render: _renderPropTweens,
          add: _addPropTween,
          kill: _killPropTweensOf,
          modifier: _addPluginModifier,
          rawVars: 0
        }, statics = {
          targetTest: 0,
          get: 0,
          getSetter: _getSetter,
          aliases: {},
          register: 0
        };
        _wake();
        if (config3 !== Plugin) {
          if (_plugins[name]) {
            return;
          }
          _setDefaults(Plugin, _setDefaults(_copyExcluding(config3, instanceDefaults), statics));
          _merge(Plugin.prototype, _merge(instanceDefaults, _copyExcluding(config3, statics)));
          _plugins[Plugin.prop = name] = Plugin;
          if (config3.targetTest) {
            _harnessPlugins.push(Plugin);
            _reservedProps[name] = 1;
          }
          name = (name === "css" ? "CSS" : name.charAt(0).toUpperCase() + name.substr(1)) + "Plugin";
        }
        _addGlobal(name, Plugin);
        config3.register && config3.register(gsap, Plugin, PropTween);
      } else {
        _registerPluginQueue.push(config3);
      }
    };
    _255 = 255;
    _colorLookup = {
      aqua: [0, _255, _255],
      lime: [0, _255, 0],
      silver: [192, 192, 192],
      black: [0, 0, 0],
      maroon: [128, 0, 0],
      teal: [0, 128, 128],
      blue: [0, 0, _255],
      navy: [0, 0, 128],
      white: [_255, _255, _255],
      olive: [128, 128, 0],
      yellow: [_255, _255, 0],
      orange: [_255, 165, 0],
      gray: [128, 128, 128],
      purple: [128, 0, 128],
      green: [0, 128, 0],
      red: [_255, 0, 0],
      pink: [_255, 192, 203],
      cyan: [0, _255, _255],
      transparent: [_255, _255, _255, 0]
    };
    _hue = function _hue2(h, m1, m2) {
      h += h < 0 ? 1 : h > 1 ? -1 : 0;
      return (h * 6 < 1 ? m1 + (m2 - m1) * h * 6 : h < 0.5 ? m2 : h * 3 < 2 ? m1 + (m2 - m1) * (2 / 3 - h) * 6 : m1) * _255 + 0.5 | 0;
    };
    splitColor = function splitColor2(v2, toHSL, forceAlpha) {
      var a = !v2 ? _colorLookup.black : _isNumber(v2) ? [v2 >> 16, v2 >> 8 & _255, v2 & _255] : 0, r3, g2, b2, h, s2, l2, max, min, d2, wasHSL;
      if (!a) {
        if (v2.substr(-1) === ",") {
          v2 = v2.substr(0, v2.length - 1);
        }
        if (_colorLookup[v2]) {
          a = _colorLookup[v2];
        } else if (v2.charAt(0) === "#") {
          if (v2.length < 6) {
            r3 = v2.charAt(1);
            g2 = v2.charAt(2);
            b2 = v2.charAt(3);
            v2 = "#" + r3 + r3 + g2 + g2 + b2 + b2 + (v2.length === 5 ? v2.charAt(4) + v2.charAt(4) : "");
          }
          if (v2.length === 9) {
            a = parseInt(v2.substr(1, 6), 16);
            return [a >> 16, a >> 8 & _255, a & _255, parseInt(v2.substr(7), 16) / 255];
          }
          v2 = parseInt(v2.substr(1), 16);
          a = [v2 >> 16, v2 >> 8 & _255, v2 & _255];
        } else if (v2.substr(0, 3) === "hsl") {
          a = wasHSL = v2.match(_strictNumExp);
          if (!toHSL) {
            h = +a[0] % 360 / 360;
            s2 = +a[1] / 100;
            l2 = +a[2] / 100;
            g2 = l2 <= 0.5 ? l2 * (s2 + 1) : l2 + s2 - l2 * s2;
            r3 = l2 * 2 - g2;
            a.length > 3 && (a[3] *= 1);
            a[0] = _hue(h + 1 / 3, r3, g2);
            a[1] = _hue(h, r3, g2);
            a[2] = _hue(h - 1 / 3, r3, g2);
          } else if (~v2.indexOf("=")) {
            a = v2.match(_numExp);
            forceAlpha && a.length < 4 && (a[3] = 1);
            return a;
          }
        } else {
          a = v2.match(_strictNumExp) || _colorLookup.transparent;
        }
        a = a.map(Number);
      }
      if (toHSL && !wasHSL) {
        r3 = a[0] / _255;
        g2 = a[1] / _255;
        b2 = a[2] / _255;
        max = Math.max(r3, g2, b2);
        min = Math.min(r3, g2, b2);
        l2 = (max + min) / 2;
        if (max === min) {
          h = s2 = 0;
        } else {
          d2 = max - min;
          s2 = l2 > 0.5 ? d2 / (2 - max - min) : d2 / (max + min);
          h = max === r3 ? (g2 - b2) / d2 + (g2 < b2 ? 6 : 0) : max === g2 ? (b2 - r3) / d2 + 2 : (r3 - g2) / d2 + 4;
          h *= 60;
        }
        a[0] = ~~(h + 0.5);
        a[1] = ~~(s2 * 100 + 0.5);
        a[2] = ~~(l2 * 100 + 0.5);
      }
      forceAlpha && a.length < 4 && (a[3] = 1);
      return a;
    };
    _colorOrderData = function _colorOrderData2(v2) {
      var values = [], c = [], i2 = -1;
      v2.split(_colorExp).forEach(function(v3) {
        var a = v3.match(_numWithUnitExp) || [];
        values.push.apply(values, a);
        c.push(i2 += a.length + 1);
      });
      values.c = c;
      return values;
    };
    _formatColors = function _formatColors2(s2, toHSL, orderMatchData) {
      var result = "", colors = (s2 + result).match(_colorExp), type = toHSL ? "hsla(" : "rgba(", i2 = 0, c, shell, d2, l2;
      if (!colors) {
        return s2;
      }
      colors = colors.map(function(color) {
        return (color = splitColor(color, toHSL, 1)) && type + (toHSL ? color[0] + "," + color[1] + "%," + color[2] + "%," + color[3] : color.join(",")) + ")";
      });
      if (orderMatchData) {
        d2 = _colorOrderData(s2);
        c = orderMatchData.c;
        if (c.join(result) !== d2.c.join(result)) {
          shell = s2.replace(_colorExp, "1").split(_numWithUnitExp);
          l2 = shell.length - 1;
          for (; i2 < l2; i2++) {
            result += shell[i2] + (~c.indexOf(i2) ? colors.shift() || type + "0,0,0,0)" : (d2.length ? d2 : colors.length ? colors : orderMatchData).shift());
          }
        }
      }
      if (!shell) {
        shell = s2.split(_colorExp);
        l2 = shell.length - 1;
        for (; i2 < l2; i2++) {
          result += shell[i2] + colors[i2];
        }
      }
      return result + shell[l2];
    };
    _colorExp = (function() {
      var s2 = "(?:\\b(?:(?:rgb|rgba|hsl|hsla)\\(.+?\\))|\\B#(?:[0-9a-f]{3,4}){1,2}\\b", p2;
      for (p2 in _colorLookup) {
        s2 += "|" + p2 + "\\b";
      }
      return new RegExp(s2 + ")", "gi");
    })();
    _hslExp = /hsl[a]?\(/;
    _colorStringFilter = function _colorStringFilter2(a) {
      var combined = a.join(" "), toHSL;
      _colorExp.lastIndex = 0;
      if (_colorExp.test(combined)) {
        toHSL = _hslExp.test(combined);
        a[1] = _formatColors(a[1], toHSL);
        a[0] = _formatColors(a[0], toHSL, _colorOrderData(a[1]));
        return true;
      }
    };
    _ticker = (function() {
      var _getTime = Date.now, _lagThreshold = 500, _adjustedLag = 33, _startTime = _getTime(), _lastUpdate = _startTime, _gap = 1e3 / 240, _nextTime = _gap, _listeners2 = [], _id, _req, _raf, _self, _delta, _i4, _tick = function _tick2(v2) {
        var elapsed = _getTime() - _lastUpdate, manual = v2 === true, overlap, dispatch, time, frame;
        (elapsed > _lagThreshold || elapsed < 0) && (_startTime += elapsed - _adjustedLag);
        _lastUpdate += elapsed;
        time = _lastUpdate - _startTime;
        overlap = time - _nextTime;
        if (overlap > 0 || manual) {
          frame = ++_self.frame;
          _delta = time - _self.time * 1e3;
          _self.time = time = time / 1e3;
          _nextTime += overlap + (overlap >= _gap ? 4 : _gap - overlap);
          dispatch = 1;
        }
        manual || (_id = _req(_tick2));
        if (dispatch) {
          for (_i4 = 0; _i4 < _listeners2.length; _i4++) {
            _listeners2[_i4](time, _delta, frame, v2);
          }
        }
      };
      _self = {
        time: 0,
        frame: 0,
        tick: function tick() {
          _tick(true);
        },
        deltaRatio: function deltaRatio(fps) {
          return _delta / (1e3 / (fps || 60));
        },
        wake: function wake() {
          if (_coreReady) {
            if (!_coreInitted && _windowExists()) {
              _win = _coreInitted = window;
              _doc = _win.document || {};
              _globals.gsap = gsap;
              (_win.gsapVersions || (_win.gsapVersions = [])).push(gsap.version);
              _install(_installScope || _win.GreenSockGlobals || !_win.gsap && _win || {});
              _registerPluginQueue.forEach(_createPlugin);
            }
            _raf = typeof requestAnimationFrame !== "undefined" && requestAnimationFrame;
            _id && _self.sleep();
            _req = _raf || function(f2) {
              return setTimeout(f2, _nextTime - _self.time * 1e3 + 1 | 0);
            };
            _tickerActive = 1;
            _tick(2);
          }
        },
        sleep: function sleep3() {
          (_raf ? cancelAnimationFrame : clearTimeout)(_id);
          _tickerActive = 0;
          _req = _emptyFunc;
        },
        lagSmoothing: function lagSmoothing(threshold, adjustedLag) {
          _lagThreshold = threshold || Infinity;
          _adjustedLag = Math.min(adjustedLag || 33, _lagThreshold);
        },
        fps: function fps(_fps) {
          _gap = 1e3 / (_fps || 240);
          _nextTime = _self.time * 1e3 + _gap;
        },
        add: function add(callback, once, prioritize) {
          var func = once ? function(t2, d2, f2, v2) {
            callback(t2, d2, f2, v2);
            _self.remove(func);
          } : callback;
          _self.remove(callback);
          _listeners2[prioritize ? "unshift" : "push"](func);
          _wake();
          return func;
        },
        remove: function remove(callback, i2) {
          ~(i2 = _listeners2.indexOf(callback)) && _listeners2.splice(i2, 1) && _i4 >= i2 && _i4--;
        },
        _listeners: _listeners2
      };
      return _self;
    })();
    _wake = function _wake2() {
      return !_tickerActive && _ticker.wake();
    };
    _easeMap = {};
    _customEaseExp = /^[\d.\-M][\d.\-,\s]/;
    _quotesExp = /["']/g;
    _parseObjectInString = function _parseObjectInString2(value) {
      var obj = {}, split = value.substr(1, value.length - 3).split(":"), key = split[0], i2 = 1, l2 = split.length, index, val, parsedVal;
      for (; i2 < l2; i2++) {
        val = split[i2];
        index = i2 !== l2 - 1 ? val.lastIndexOf(",") : val.length;
        parsedVal = val.substr(0, index);
        obj[key] = isNaN(parsedVal) ? parsedVal.replace(_quotesExp, "").trim() : +parsedVal;
        key = val.substr(index + 1).trim();
      }
      return obj;
    };
    _valueInParentheses = function _valueInParentheses2(value) {
      var open = value.indexOf("(") + 1, close = value.indexOf(")"), nested = value.indexOf("(", open);
      return value.substring(open, ~nested && nested < close ? value.indexOf(")", close + 1) : close);
    };
    _configEaseFromString = function _configEaseFromString2(name) {
      var split = (name + "").split("("), ease = _easeMap[split[0]];
      return ease && split.length > 1 && ease.config ? ease.config.apply(null, ~name.indexOf("{") ? [_parseObjectInString(split[1])] : _valueInParentheses(name).split(",").map(_numericIfPossible)) : _easeMap._CE && _customEaseExp.test(name) ? _easeMap._CE("", name) : ease;
    };
    _invertEase = function _invertEase2(ease) {
      return function(p2) {
        return 1 - ease(1 - p2);
      };
    };
    _parseEase = function _parseEase2(ease, defaultEase) {
      return !ease ? defaultEase : (_isFunction(ease) ? ease : _easeMap[ease] || _configEaseFromString(ease)) || defaultEase;
    };
    _insertEase = function _insertEase2(names, easeIn, easeOut, easeInOut) {
      if (easeOut === void 0) {
        easeOut = function easeOut2(p2) {
          return 1 - easeIn(1 - p2);
        };
      }
      if (easeInOut === void 0) {
        easeInOut = function easeInOut2(p2) {
          return p2 < 0.5 ? easeIn(p2 * 2) / 2 : 1 - easeIn((1 - p2) * 2) / 2;
        };
      }
      var ease = {
        easeIn,
        easeOut,
        easeInOut
      }, lowercaseName;
      _forEachName(names, function(name) {
        _easeMap[name] = _globals[name] = ease;
        _easeMap[lowercaseName = name.toLowerCase()] = easeOut;
        for (var p2 in ease) {
          _easeMap[lowercaseName + (p2 === "easeIn" ? ".in" : p2 === "easeOut" ? ".out" : ".inOut")] = _easeMap[name + "." + p2] = ease[p2];
        }
      });
      return ease;
    };
    _easeInOutFromOut = function _easeInOutFromOut2(easeOut) {
      return function(p2) {
        return p2 < 0.5 ? (1 - easeOut(1 - p2 * 2)) / 2 : 0.5 + easeOut((p2 - 0.5) * 2) / 2;
      };
    };
    _configElastic = function _configElastic2(type, amplitude, period) {
      var p1 = amplitude >= 1 ? amplitude : 1, p2 = (period || (type ? 0.3 : 0.45)) / (amplitude < 1 ? amplitude : 1), p3 = p2 / _2PI * (Math.asin(1 / p1) || 0), easeOut = function easeOut2(p4) {
        return p4 === 1 ? 1 : p1 * Math.pow(2, -10 * p4) * _sin((p4 - p3) * p2) + 1;
      }, ease = type === "out" ? easeOut : type === "in" ? function(p4) {
        return 1 - easeOut(1 - p4);
      } : _easeInOutFromOut(easeOut);
      p2 = _2PI / p2;
      ease.config = function(amplitude2, period2) {
        return _configElastic2(type, amplitude2, period2);
      };
      return ease;
    };
    _configBack = function _configBack2(type, overshoot) {
      if (overshoot === void 0) {
        overshoot = 1.70158;
      }
      var easeOut = function easeOut2(p2) {
        return p2 ? --p2 * p2 * ((overshoot + 1) * p2 + overshoot) + 1 : 0;
      }, ease = type === "out" ? easeOut : type === "in" ? function(p2) {
        return 1 - easeOut(1 - p2);
      } : _easeInOutFromOut(easeOut);
      ease.config = function(overshoot2) {
        return _configBack2(type, overshoot2);
      };
      return ease;
    };
    _forEachName("Linear,Quad,Cubic,Quart,Quint,Strong", function(name, i2) {
      var power = i2 < 5 ? i2 + 1 : i2;
      _insertEase(name + ",Power" + (power - 1), i2 ? function(p2) {
        return Math.pow(p2, power);
      } : function(p2) {
        return p2;
      }, function(p2) {
        return 1 - Math.pow(1 - p2, power);
      }, function(p2) {
        return p2 < 0.5 ? Math.pow(p2 * 2, power) / 2 : 1 - Math.pow((1 - p2) * 2, power) / 2;
      });
    });
    _easeMap.Linear.easeNone = _easeMap.none = _easeMap.Linear.easeIn;
    _insertEase("Elastic", _configElastic("in"), _configElastic("out"), _configElastic());
    (function(n3, c) {
      var n1 = 1 / c, n22 = 2 * n1, n32 = 2.5 * n1, easeOut = function easeOut2(p2) {
        return p2 < n1 ? n3 * p2 * p2 : p2 < n22 ? n3 * Math.pow(p2 - 1.5 / c, 2) + 0.75 : p2 < n32 ? n3 * (p2 -= 2.25 / c) * p2 + 0.9375 : n3 * Math.pow(p2 - 2.625 / c, 2) + 0.984375;
      };
      _insertEase("Bounce", function(p2) {
        return 1 - easeOut(1 - p2);
      }, easeOut);
    })(7.5625, 2.75);
    _insertEase("Expo", function(p2) {
      return Math.pow(2, 10 * (p2 - 1)) * p2 + p2 * p2 * p2 * p2 * p2 * p2 * (1 - p2);
    });
    _insertEase("Circ", function(p2) {
      return -(_sqrt(1 - p2 * p2) - 1);
    });
    _insertEase("Sine", function(p2) {
      return p2 === 1 ? 1 : -_cos(p2 * _HALF_PI) + 1;
    });
    _insertEase("Back", _configBack("in"), _configBack("out"), _configBack());
    _easeMap.SteppedEase = _easeMap.steps = _globals.SteppedEase = {
      config: function config(steps, immediateStart) {
        if (steps === void 0) {
          steps = 1;
        }
        var p1 = 1 / steps, p2 = steps + (immediateStart ? 0 : 1), p3 = immediateStart ? 1 : 0, max = 1 - _tinyNum;
        return function(p4) {
          return ((p2 * _clamp(0, max, p4) | 0) + p3) * p1;
        };
      }
    };
    _defaults.ease = _easeMap["quad.out"];
    _forEachName("onComplete,onUpdate,onStart,onRepeat,onReverseComplete,onInterrupt", function(name) {
      return _callbackNames += name + "," + name + "Params,";
    });
    GSCache = function GSCache2(target, harness) {
      this.id = _gsID++;
      target._gsap = this;
      this.target = target;
      this.harness = harness;
      this.get = harness ? harness.get : _getProperty;
      this.set = harness ? harness.getSetter : _getSetter;
    };
    Animation = /* @__PURE__ */ (function() {
      function Animation2(vars) {
        this.vars = vars;
        this._delay = +vars.delay || 0;
        if (this._repeat = vars.repeat === Infinity ? -2 : vars.repeat || 0) {
          this._rDelay = vars.repeatDelay || 0;
          this._yoyo = !!vars.yoyo || !!vars.yoyoEase;
        }
        this._ts = 1;
        _setDuration(this, +vars.duration, 1, 1);
        this.data = vars.data;
        if (_context) {
          this._ctx = _context;
          _context.data.push(this);
        }
        _tickerActive || _ticker.wake();
      }
      var _proto = Animation2.prototype;
      _proto.delay = function delay(value) {
        if (value || value === 0) {
          this.parent && this.parent.smoothChildTiming && this.startTime(this._start + value - this._delay);
          this._delay = value;
          return this;
        }
        return this._delay;
      };
      _proto.duration = function duration(value) {
        return arguments.length ? this.totalDuration(this._repeat > 0 ? value + (value + this._rDelay) * this._repeat : value) : this.totalDuration() && this._dur;
      };
      _proto.totalDuration = function totalDuration(value) {
        if (!arguments.length) {
          return this._tDur;
        }
        this._dirty = 0;
        return _setDuration(this, this._repeat < 0 ? value : (value - this._repeat * this._rDelay) / (this._repeat + 1));
      };
      _proto.totalTime = function totalTime(_totalTime, suppressEvents) {
        _wake();
        if (!arguments.length) {
          return this._tTime;
        }
        var parent = this._dp;
        if (parent && parent.smoothChildTiming && this._ts) {
          _alignPlayhead(this, _totalTime);
          !parent._dp || parent.parent || _postAddChecks(parent, this);
          while (parent && parent.parent) {
            if (parent.parent._time !== parent._start + (parent._ts >= 0 ? parent._tTime / parent._ts : (parent.totalDuration() - parent._tTime) / -parent._ts)) {
              parent.totalTime(parent._tTime, true);
            }
            parent = parent.parent;
          }
          if (!this.parent && this._dp.autoRemoveChildren && (this._ts > 0 && _totalTime < this._tDur || this._ts < 0 && _totalTime > 0 || !this._tDur && !_totalTime)) {
            _addToTimeline(this._dp, this, this._start - this._delay);
          }
        }
        if (this._tTime !== _totalTime || !this._dur && !suppressEvents || this._initted && Math.abs(this._zTime) === _tinyNum || !this._initted && this._dur && _totalTime || !_totalTime && !this._initted && (this.add || this._ptLookup)) {
          this._ts || (this._pTime = _totalTime);
          _lazySafeRender(this, _totalTime, suppressEvents);
        }
        return this;
      };
      _proto.time = function time(value, suppressEvents) {
        return arguments.length ? this.totalTime(Math.min(this.totalDuration(), value + _elapsedCycleDuration(this)) % (this._dur + this._rDelay) || (value ? this._dur : 0), suppressEvents) : this._time;
      };
      _proto.totalProgress = function totalProgress(value, suppressEvents) {
        return arguments.length ? this.totalTime(this.totalDuration() * value, suppressEvents) : this.totalDuration() ? Math.min(1, this._tTime / this._tDur) : this.rawTime() >= 0 && this._initted ? 1 : 0;
      };
      _proto.progress = function progress(value, suppressEvents) {
        return arguments.length ? this.totalTime(this.duration() * (this._yoyo && !(this.iteration() & 1) ? 1 - value : value) + _elapsedCycleDuration(this), suppressEvents) : this.duration() ? Math.min(1, this._time / this._dur) : this.rawTime() > 0 ? 1 : 0;
      };
      _proto.iteration = function iteration(value, suppressEvents) {
        var cycleDuration = this.duration() + this._rDelay;
        return arguments.length ? this.totalTime(this._time + (value - 1) * cycleDuration, suppressEvents) : this._repeat ? _animationCycle(this._tTime, cycleDuration) + 1 : 1;
      };
      _proto.timeScale = function timeScale(value, suppressEvents) {
        if (!arguments.length) {
          return this._rts === -_tinyNum ? 0 : this._rts;
        }
        if (this._rts === value) {
          return this;
        }
        var tTime = this.parent && this._ts ? _parentToChildTotalTime(this.parent._time, this) : this._tTime;
        this._rts = +value || 0;
        this._ts = this._ps || value === -_tinyNum ? 0 : this._rts;
        this.totalTime(_clamp(-Math.abs(this._delay), this.totalDuration(), tTime), suppressEvents !== false);
        _setEnd(this);
        return _recacheAncestors(this);
      };
      _proto.paused = function paused(value) {
        if (!arguments.length) {
          return this._ps;
        }
        if (this._ps !== value) {
          this._ps = value;
          if (value) {
            this._pTime = this._tTime || Math.max(-this._delay, this.rawTime());
            this._ts = this._act = 0;
          } else {
            _wake();
            this._ts = this._rts;
            this.totalTime(this.parent && !this.parent.smoothChildTiming ? this.rawTime() : this._tTime || this._pTime, this.progress() === 1 && Math.abs(this._zTime) !== _tinyNum && (this._tTime -= _tinyNum));
          }
        }
        return this;
      };
      _proto.startTime = function startTime(value) {
        if (arguments.length) {
          this._start = _roundPrecise(value);
          var parent = this.parent || this._dp;
          parent && (parent._sort || !this.parent) && _addToTimeline(parent, this, this._start - this._delay);
          return this;
        }
        return this._start;
      };
      _proto.endTime = function endTime(includeRepeats) {
        return this._start + (_isNotFalse(includeRepeats) ? this.totalDuration() : this.duration()) / Math.abs(this._ts || 1);
      };
      _proto.rawTime = function rawTime(wrapRepeats) {
        var parent = this.parent || this._dp;
        return !parent ? this._tTime : wrapRepeats && (!this._ts || this._repeat && this._time && this.totalProgress() < 1) ? this._tTime % (this._dur + this._rDelay) : !this._ts ? this._tTime : _parentToChildTotalTime(parent.rawTime(wrapRepeats), this);
      };
      _proto.revert = function revert(config3) {
        if (config3 === void 0) {
          config3 = _revertConfig;
        }
        var prevIsReverting = _reverting;
        _reverting = config3;
        if (_isRevertWorthy(this)) {
          this.timeline && this.timeline.revert(config3);
          this.totalTime(-0.01, config3.suppressEvents);
        }
        this.data !== "nested" && config3.kill !== false && this.kill();
        _reverting = prevIsReverting;
        return this;
      };
      _proto.globalTime = function globalTime(rawTime) {
        var animation = this, time = arguments.length ? rawTime : animation.rawTime();
        while (animation) {
          time = animation._start + time / (Math.abs(animation._ts) || 1);
          animation = animation._dp;
        }
        return !this.parent && this._sat ? this._sat.globalTime(rawTime) : time;
      };
      _proto.repeat = function repeat(value) {
        if (arguments.length) {
          this._repeat = value === Infinity ? -2 : value;
          return _onUpdateTotalDuration(this);
        }
        return this._repeat === -2 ? Infinity : this._repeat;
      };
      _proto.repeatDelay = function repeatDelay(value) {
        if (arguments.length) {
          var time = this._time;
          this._rDelay = value;
          _onUpdateTotalDuration(this);
          return time ? this.time(time) : this;
        }
        return this._rDelay;
      };
      _proto.yoyo = function yoyo(value) {
        if (arguments.length) {
          this._yoyo = value;
          return this;
        }
        return this._yoyo;
      };
      _proto.seek = function seek(position, suppressEvents) {
        return this.totalTime(_parsePosition(this, position), _isNotFalse(suppressEvents));
      };
      _proto.restart = function restart(includeDelay, suppressEvents) {
        this.play().totalTime(includeDelay ? -this._delay : 0, _isNotFalse(suppressEvents));
        this._dur || (this._zTime = -_tinyNum);
        return this;
      };
      _proto.play = function play(from, suppressEvents) {
        from != null && this.seek(from, suppressEvents);
        return this.reversed(false).paused(false);
      };
      _proto.reverse = function reverse(from, suppressEvents) {
        from != null && this.seek(from || this.totalDuration(), suppressEvents);
        return this.reversed(true).paused(false);
      };
      _proto.pause = function pause(atTime, suppressEvents) {
        atTime != null && this.seek(atTime, suppressEvents);
        return this.paused(true);
      };
      _proto.resume = function resume() {
        return this.paused(false);
      };
      _proto.reversed = function reversed(value) {
        if (arguments.length) {
          !!value !== this.reversed() && this.timeScale(-this._rts || (value ? -_tinyNum : 0));
          return this;
        }
        return this._rts < 0;
      };
      _proto.invalidate = function invalidate() {
        this._initted = this._act = 0;
        this._zTime = -_tinyNum;
        return this;
      };
      _proto.isActive = function isActive() {
        var parent = this.parent || this._dp, start = this._start, rawTime;
        return !!(!parent || this._ts && this._initted && parent.isActive() && (rawTime = parent.rawTime(true)) >= start && rawTime < this.endTime(true) - _tinyNum);
      };
      _proto.eventCallback = function eventCallback(type, callback, params) {
        var vars = this.vars;
        if (arguments.length > 1) {
          if (!callback) {
            delete vars[type];
          } else {
            vars[type] = callback;
            params && (vars[type + "Params"] = params);
            type === "onUpdate" && (this._onUpdate = callback);
          }
          return this;
        }
        return vars[type];
      };
      _proto.then = function then(onFulfilled) {
        var self = this, prevProm = self._prom;
        return new Promise(function(resolve) {
          var f2 = _isFunction(onFulfilled) ? onFulfilled : _passThrough, _resolve = function _resolve2() {
            var _then = self.then;
            self.then = null;
            prevProm && prevProm();
            _isFunction(f2) && (f2 = f2(self)) && (f2.then || f2 === self) && (self.then = _then);
            resolve(f2);
            self.then = _then;
          };
          if (self._initted && self.totalProgress() === 1 && self._ts >= 0 || !self._tTime && self._ts < 0) {
            _resolve();
          } else {
            self._prom = _resolve;
          }
        });
      };
      _proto.kill = function kill() {
        _interrupt(this);
      };
      return Animation2;
    })();
    _setDefaults(Animation.prototype, {
      _time: 0,
      _start: 0,
      _end: 0,
      _tTime: 0,
      _tDur: 0,
      _dirty: 0,
      _repeat: 0,
      _yoyo: false,
      parent: null,
      _initted: false,
      _rDelay: 0,
      _ts: 1,
      _dp: 0,
      ratio: 0,
      _zTime: -_tinyNum,
      _prom: 0,
      _ps: false,
      _rts: 1
    });
    Timeline = /* @__PURE__ */ (function(_Animation) {
      _inheritsLoose(Timeline2, _Animation);
      function Timeline2(vars, position) {
        var _this;
        if (vars === void 0) {
          vars = {};
        }
        _this = _Animation.call(this, vars) || this;
        _this.labels = {};
        _this.smoothChildTiming = !!vars.smoothChildTiming;
        _this.autoRemoveChildren = !!vars.autoRemoveChildren;
        _this._sort = _isNotFalse(vars.sortChildren);
        _globalTimeline && _addToTimeline(vars.parent || _globalTimeline, _assertThisInitialized(_this), position);
        vars.reversed && _this.reverse();
        vars.paused && _this.paused(true);
        vars.scrollTrigger && _scrollTrigger(_assertThisInitialized(_this), vars.scrollTrigger);
        return _this;
      }
      var _proto2 = Timeline2.prototype;
      _proto2.to = function to2(targets, vars, position) {
        _createTweenType(0, arguments, this);
        return this;
      };
      _proto2.from = function from(targets, vars, position) {
        _createTweenType(1, arguments, this);
        return this;
      };
      _proto2.fromTo = function fromTo(targets, fromVars, toVars, position) {
        _createTweenType(2, arguments, this);
        return this;
      };
      _proto2.set = function set(targets, vars, position) {
        vars.duration = 0;
        vars.parent = this;
        _inheritDefaults(vars).repeatDelay || (vars.repeat = 0);
        vars.immediateRender = !!vars.immediateRender;
        new Tween(targets, vars, _parsePosition(this, position), 1);
        return this;
      };
      _proto2.call = function call(callback, params, position) {
        return _addToTimeline(this, Tween.delayedCall(0, callback, params), position);
      };
      _proto2.staggerTo = function staggerTo(targets, duration, vars, stagger, position, onCompleteAll, onCompleteAllParams) {
        vars.duration = duration;
        vars.stagger = vars.stagger || stagger;
        vars.onComplete = onCompleteAll;
        vars.onCompleteParams = onCompleteAllParams;
        vars.parent = this;
        new Tween(targets, vars, _parsePosition(this, position));
        return this;
      };
      _proto2.staggerFrom = function staggerFrom(targets, duration, vars, stagger, position, onCompleteAll, onCompleteAllParams) {
        vars.runBackwards = 1;
        _inheritDefaults(vars).immediateRender = _isNotFalse(vars.immediateRender);
        return this.staggerTo(targets, duration, vars, stagger, position, onCompleteAll, onCompleteAllParams);
      };
      _proto2.staggerFromTo = function staggerFromTo(targets, duration, fromVars, toVars, stagger, position, onCompleteAll, onCompleteAllParams) {
        toVars.startAt = fromVars;
        _inheritDefaults(toVars).immediateRender = _isNotFalse(toVars.immediateRender);
        return this.staggerTo(targets, duration, toVars, stagger, position, onCompleteAll, onCompleteAllParams);
      };
      _proto2.render = function render3(totalTime, suppressEvents, force) {
        var prevTime = this._time, tDur = this._dirty ? this.totalDuration() : this._tDur, dur = this._dur, tTime = totalTime <= 0 ? 0 : _roundPrecise(totalTime), crossingStart = this._zTime < 0 !== totalTime < 0 && (this._initted || !dur), time, child, next, iteration, cycleDuration, prevPaused, pauseTween, timeScale, prevStart, prevIteration, yoyo, isYoyo;
        this !== _globalTimeline && tTime > tDur && totalTime >= 0 && (tTime = tDur);
        if (tTime !== this._tTime || force || crossingStart) {
          if (prevTime !== this._time && dur) {
            tTime += this._time - prevTime;
            totalTime += this._time - prevTime;
          }
          time = tTime;
          prevStart = this._start;
          timeScale = this._ts;
          prevPaused = !timeScale;
          if (crossingStart) {
            dur || (prevTime = this._zTime);
            (totalTime || !suppressEvents) && (this._zTime = totalTime);
          }
          if (this._repeat) {
            yoyo = this._yoyo;
            cycleDuration = dur + this._rDelay;
            if (this._repeat < -1 && totalTime < 0) {
              return this.totalTime(cycleDuration * 100 + totalTime, suppressEvents, force);
            }
            time = _roundPrecise(tTime % cycleDuration);
            if (tTime === tDur) {
              iteration = this._repeat;
              time = dur;
            } else {
              prevIteration = _roundPrecise(tTime / cycleDuration);
              iteration = ~~prevIteration;
              if (iteration && iteration === prevIteration) {
                time = dur;
                iteration--;
              }
              time > dur && (time = dur);
            }
            prevIteration = _animationCycle(this._tTime, cycleDuration);
            !prevTime && this._tTime && prevIteration !== iteration && this._tTime - prevIteration * cycleDuration - this._dur <= 0 && (prevIteration = iteration);
            if (yoyo && iteration & 1) {
              time = dur - time;
              isYoyo = 1;
            }
            if (iteration !== prevIteration && !this._lock) {
              var rewinding = yoyo && prevIteration & 1, doesWrap = rewinding === (yoyo && iteration & 1);
              iteration < prevIteration && (rewinding = !rewinding);
              prevTime = rewinding ? 0 : tTime % dur ? dur : tTime;
              this._lock = 1;
              this.render(prevTime || (isYoyo ? 0 : _roundPrecise(iteration * cycleDuration)), suppressEvents, !dur)._lock = 0;
              this._tTime = tTime;
              !suppressEvents && this.parent && _callback(this, "onRepeat");
              if (this.vars.repeatRefresh && !isYoyo) {
                this.invalidate()._lock = 1;
                prevIteration = iteration;
              }
              if (prevTime && prevTime !== this._time || prevPaused !== !this._ts || this.vars.onRepeat && !this.parent && !this._act) {
                return this;
              }
              dur = this._dur;
              tDur = this._tDur;
              if (doesWrap) {
                this._lock = 2;
                prevTime = rewinding ? dur : -1e-4;
                this.render(prevTime, true);
                this.vars.repeatRefresh && !isYoyo && this.invalidate();
              }
              this._lock = 0;
              if (!this._ts && !prevPaused) {
                return this;
              }
            }
          }
          if (this._hasPause && !this._forcing && this._lock < 2) {
            pauseTween = _findNextPauseTween(this, _roundPrecise(prevTime), _roundPrecise(time));
            if (pauseTween) {
              tTime -= time - (time = pauseTween._start);
            }
          }
          this._tTime = tTime;
          this._time = time;
          this._act = !!timeScale;
          if (!this._initted) {
            this._onUpdate = this.vars.onUpdate;
            this._initted = 1;
            this._zTime = totalTime;
            prevTime = 0;
          }
          if (!prevTime && tTime && dur && !suppressEvents && !prevIteration) {
            _callback(this, "onStart");
            if (this._tTime !== tTime) {
              return this;
            }
          }
          if (time >= prevTime && totalTime >= 0) {
            child = this._first;
            while (child) {
              next = child._next;
              if ((child._act || time >= child._start) && child._ts && pauseTween !== child) {
                if (child.parent !== this) {
                  return this.render(totalTime, suppressEvents, force);
                }
                child.render(child._ts > 0 ? (time - child._start) * child._ts : (child._dirty ? child.totalDuration() : child._tDur) + (time - child._start) * child._ts, suppressEvents, force);
                if (time !== this._time || !this._ts && !prevPaused) {
                  pauseTween = 0;
                  next && (tTime += this._zTime = -_tinyNum);
                  break;
                }
              }
              child = next;
            }
          } else {
            child = this._last;
            var adjustedTime = totalTime < 0 ? totalTime : time;
            while (child) {
              next = child._prev;
              if ((child._act || adjustedTime <= child._end) && child._ts && pauseTween !== child) {
                if (child.parent !== this) {
                  return this.render(totalTime, suppressEvents, force);
                }
                child.render(child._ts > 0 ? (adjustedTime - child._start) * child._ts : (child._dirty ? child.totalDuration() : child._tDur) + (adjustedTime - child._start) * child._ts, suppressEvents, force || _reverting && _isRevertWorthy(child));
                if (time !== this._time || !this._ts && !prevPaused) {
                  pauseTween = 0;
                  next && (tTime += this._zTime = adjustedTime ? -_tinyNum : _tinyNum);
                  break;
                }
              }
              child = next;
            }
          }
          if (pauseTween && !suppressEvents) {
            this.pause();
            pauseTween.render(time >= prevTime ? 0 : -_tinyNum)._zTime = time >= prevTime ? 1 : -1;
            if (this._ts) {
              this._start = prevStart;
              _setEnd(this);
              return this.render(totalTime, suppressEvents, force);
            }
          }
          this._onUpdate && !suppressEvents && _callback(this, "onUpdate", true);
          if (tTime === tDur && this._tTime >= this.totalDuration() || !tTime && prevTime) {
            if (prevStart === this._start || Math.abs(timeScale) !== Math.abs(this._ts)) {
              if (!this._lock) {
                (totalTime || !dur) && (tTime === tDur && this._ts > 0 || !tTime && this._ts < 0) && _removeFromParent(this, 1);
                if (!suppressEvents && !(totalTime < 0 && !prevTime) && (tTime || prevTime || !tDur)) {
                  _callback(this, tTime === tDur && totalTime >= 0 ? "onComplete" : "onReverseComplete", true);
                  this._prom && !(tTime < tDur && this.timeScale() > 0) && this._prom();
                }
              }
            }
          }
        }
        return this;
      };
      _proto2.add = function add(child, position) {
        var _this2 = this;
        _isNumber(position) || (position = _parsePosition(this, position, child));
        if (!(child instanceof Animation)) {
          if (_isArray(child)) {
            child.forEach(function(obj) {
              return _this2.add(obj, position);
            });
            return this;
          }
          if (_isString(child)) {
            return this.addLabel(child, position);
          }
          if (_isFunction(child)) {
            child = Tween.delayedCall(0, child);
          } else {
            return this;
          }
        }
        return this !== child ? _addToTimeline(this, child, position) : this;
      };
      _proto2.getChildren = function getChildren(nested, tweens, timelines, ignoreBeforeTime) {
        if (nested === void 0) {
          nested = true;
        }
        if (tweens === void 0) {
          tweens = true;
        }
        if (timelines === void 0) {
          timelines = true;
        }
        if (ignoreBeforeTime === void 0) {
          ignoreBeforeTime = -_bigNum;
        }
        var a = [], child = this._first;
        while (child) {
          if (child._start >= ignoreBeforeTime) {
            if (child instanceof Tween) {
              tweens && a.push(child);
            } else {
              timelines && a.push(child);
              nested && a.push.apply(a, child.getChildren(true, tweens, timelines));
            }
          }
          child = child._next;
        }
        return a;
      };
      _proto2.getById = function getById2(id2) {
        var animations = this.getChildren(1, 1, 1), i2 = animations.length;
        while (i2--) {
          if (animations[i2].vars.id === id2) {
            return animations[i2];
          }
        }
      };
      _proto2.remove = function remove(child) {
        if (_isString(child)) {
          return this.removeLabel(child);
        }
        if (_isFunction(child)) {
          return this.killTweensOf(child);
        }
        child.parent === this && _removeLinkedListItem(this, child);
        if (child === this._recent) {
          this._recent = this._last;
        }
        return _uncache(this);
      };
      _proto2.totalTime = function totalTime(_totalTime2, suppressEvents) {
        if (!arguments.length) {
          return this._tTime;
        }
        this._forcing = 1;
        if (!this._dp && this._ts) {
          this._start = _roundPrecise(_ticker.time - (this._ts > 0 ? _totalTime2 / this._ts : (this.totalDuration() - _totalTime2) / -this._ts));
        }
        _Animation.prototype.totalTime.call(this, _totalTime2, suppressEvents);
        this._forcing = 0;
        return this;
      };
      _proto2.addLabel = function addLabel(label, position) {
        this.labels[label] = _parsePosition(this, position);
        return this;
      };
      _proto2.removeLabel = function removeLabel(label) {
        delete this.labels[label];
        return this;
      };
      _proto2.addPause = function addPause(position, callback, params) {
        var t2 = Tween.delayedCall(0, callback || _emptyFunc, params);
        t2.data = "isPause";
        this._hasPause = 1;
        return _addToTimeline(this, t2, _parsePosition(this, position));
      };
      _proto2.removePause = function removePause(position) {
        var child = this._first;
        position = _parsePosition(this, position);
        while (child) {
          if (child._start === position && child.data === "isPause") {
            _removeFromParent(child);
          }
          child = child._next;
        }
      };
      _proto2.killTweensOf = function killTweensOf(targets, props, onlyActive) {
        var tweens = this.getTweensOf(targets, onlyActive), i2 = tweens.length;
        while (i2--) {
          _overwritingTween !== tweens[i2] && tweens[i2].kill(targets, props);
        }
        return this;
      };
      _proto2.getTweensOf = function getTweensOf2(targets, onlyActive) {
        var a = [], parsedTargets = toArray(targets), child = this._first, isGlobalTime = _isNumber(onlyActive), children;
        while (child) {
          if (child instanceof Tween) {
            if (_arrayContainsAny(child._targets, parsedTargets) && (isGlobalTime ? (!_overwritingTween || child._initted && child._ts) && child.globalTime(0) <= onlyActive && child.globalTime(child.totalDuration()) > onlyActive : !onlyActive || child.isActive())) {
              a.push(child);
            }
          } else if ((children = child.getTweensOf(parsedTargets, onlyActive)).length) {
            a.push.apply(a, children);
          }
          child = child._next;
        }
        return a;
      };
      _proto2.tweenTo = function tweenTo(position, vars) {
        vars = vars || {};
        var tl = this, endTime = _parsePosition(tl, position), _vars = vars, startAt = _vars.startAt, _onStart = _vars.onStart, onStartParams = _vars.onStartParams, immediateRender = _vars.immediateRender, initted, tween = Tween.to(tl, _setDefaults({
          ease: vars.ease || "none",
          lazy: false,
          immediateRender: false,
          time: endTime,
          overwrite: "auto",
          duration: vars.duration || Math.abs((endTime - (startAt && "time" in startAt ? startAt.time : tl._time)) / tl.timeScale()) || _tinyNum,
          onStart: function onStart() {
            tl.pause();
            if (!initted) {
              var duration = vars.duration || Math.abs((endTime - (startAt && "time" in startAt ? startAt.time : tl._time)) / tl.timeScale());
              tween._dur !== duration && _setDuration(tween, duration, 0, 1).render(tween._time, true, true);
              initted = 1;
            }
            _onStart && _onStart.apply(tween, onStartParams || []);
          }
        }, vars));
        return immediateRender ? tween.render(0) : tween;
      };
      _proto2.tweenFromTo = function tweenFromTo(fromPosition, toPosition, vars) {
        return this.tweenTo(toPosition, _setDefaults({
          startAt: {
            time: _parsePosition(this, fromPosition)
          }
        }, vars));
      };
      _proto2.recent = function recent() {
        return this._recent;
      };
      _proto2.nextLabel = function nextLabel(afterTime) {
        if (afterTime === void 0) {
          afterTime = this._time;
        }
        return _getLabelInDirection(this, _parsePosition(this, afterTime));
      };
      _proto2.previousLabel = function previousLabel(beforeTime) {
        if (beforeTime === void 0) {
          beforeTime = this._time;
        }
        return _getLabelInDirection(this, _parsePosition(this, beforeTime), 1);
      };
      _proto2.currentLabel = function currentLabel(value) {
        return arguments.length ? this.seek(value, true) : this.previousLabel(this._time + _tinyNum);
      };
      _proto2.shiftChildren = function shiftChildren(amount, adjustLabels, ignoreBeforeTime) {
        if (ignoreBeforeTime === void 0) {
          ignoreBeforeTime = 0;
        }
        var child = this._first, labels = this.labels, p2;
        amount = _roundPrecise(amount);
        while (child) {
          if (child._start >= ignoreBeforeTime) {
            child._start += amount;
            child._end += amount;
          }
          child = child._next;
        }
        if (adjustLabels) {
          for (p2 in labels) {
            if (labels[p2] >= ignoreBeforeTime) {
              labels[p2] += amount;
            }
          }
        }
        return _uncache(this);
      };
      _proto2.invalidate = function invalidate(soft) {
        var child = this._first;
        this._lock = 0;
        while (child) {
          child.invalidate(soft);
          child = child._next;
        }
        return _Animation.prototype.invalidate.call(this, soft);
      };
      _proto2.clear = function clear(includeLabels) {
        if (includeLabels === void 0) {
          includeLabels = true;
        }
        var child = this._first, next;
        while (child) {
          next = child._next;
          this.remove(child);
          child = next;
        }
        this._dp && (this._time = this._tTime = this._pTime = 0);
        includeLabels && (this.labels = {});
        return _uncache(this);
      };
      _proto2.totalDuration = function totalDuration(value) {
        var max = 0, self = this, child = self._last, prevStart = _bigNum, prev, start, parent;
        if (arguments.length) {
          return self.timeScale((self._repeat < 0 ? self.duration() : self.totalDuration()) / (self.reversed() ? -value : value));
        }
        if (self._dirty) {
          parent = self.parent;
          while (child) {
            prev = child._prev;
            child._dirty && child.totalDuration();
            start = child._start;
            if (start > prevStart && self._sort && child._ts && !self._lock) {
              self._lock = 1;
              _addToTimeline(self, child, start - child._delay, 1)._lock = 0;
            } else {
              prevStart = start;
            }
            if (start < 0 && child._ts) {
              max -= start;
              if (!parent && !self._dp || parent && parent.smoothChildTiming) {
                self._start += _roundPrecise(start / self._ts);
                self._time -= start;
                self._tTime -= start;
              }
              self.shiftChildren(-start, false, -Infinity);
              prevStart = 0;
            }
            child._end > max && child._ts && (max = child._end);
            child = prev;
          }
          _setDuration(self, self === _globalTimeline && self._time > max ? self._time : max, 1, 1);
          self._dirty = 0;
        }
        return self._tDur;
      };
      Timeline2.updateRoot = function updateRoot(time) {
        if (_globalTimeline._ts) {
          _lazySafeRender(_globalTimeline, _parentToChildTotalTime(time, _globalTimeline));
          _lastRenderedFrame = _ticker.frame;
        }
        if (_ticker.frame >= _nextGCFrame) {
          _nextGCFrame += _config.autoSleep || 120;
          var child = _globalTimeline._first;
          if (!child || !child._ts) {
            if (_config.autoSleep && _ticker._listeners.length < 2) {
              while (child && !child._ts) {
                child = child._next;
              }
              child || _ticker.sleep();
            }
          }
        }
      };
      return Timeline2;
    })(Animation);
    _setDefaults(Timeline.prototype, {
      _lock: 0,
      _hasPause: 0,
      _forcing: 0
    });
    _addComplexStringPropTween = function _addComplexStringPropTween2(target, prop, start, end, setter, stringFilter, funcParam) {
      var pt4 = new PropTween(this._pt, target, prop, 0, 1, _renderComplexString, null, setter), index = 0, matchIndex = 0, result, startNums, color, endNum, chunk, startNum, hasRandom, a;
      pt4.b = start;
      pt4.e = end;
      start += "";
      end += "";
      if (hasRandom = ~end.indexOf("random(")) {
        end = _replaceRandom(end);
      }
      if (stringFilter) {
        a = [start, end];
        stringFilter(a, target, prop);
        start = a[0];
        end = a[1];
      }
      startNums = start.match(_complexStringNumExp) || [];
      while (result = _complexStringNumExp.exec(end)) {
        endNum = result[0];
        chunk = end.substring(index, result.index);
        if (color) {
          color = (color + 1) % 5;
        } else if (chunk.substr(-5) === "rgba(") {
          color = 1;
        }
        if (endNum !== startNums[matchIndex++]) {
          startNum = parseFloat(startNums[matchIndex - 1]) || 0;
          pt4._pt = {
            _next: pt4._pt,
            p: chunk || matchIndex === 1 ? chunk : ",",
            //note: SVG spec allows omission of comma/space when a negative sign is wedged between two numbers, like 2.5-5.3 instead of 2.5,-5.3 but when tweening, the negative value may switch to positive, so we insert the comma just in case.
            s: startNum,
            c: endNum.charAt(1) === "=" ? _parseRelative(startNum, endNum) - startNum : parseFloat(endNum) - startNum,
            m: color && color < 4 ? Math.round : 0
          };
          index = _complexStringNumExp.lastIndex;
        }
      }
      pt4.c = index < end.length ? end.substring(index, end.length) : "";
      pt4.fp = funcParam;
      if (_relExp.test(end) || hasRandom) {
        pt4.e = 0;
      }
      this._pt = pt4;
      return pt4;
    };
    _addPropTween = function _addPropTween2(target, prop, start, end, index, targets, modifier, stringFilter, funcParam, optional) {
      _isFunction(end) && (end = end(index || 0, target, targets));
      var currentValue = target[prop], parsedStart = start !== "get" ? start : !_isFunction(currentValue) ? currentValue : funcParam ? target[prop.indexOf("set") || !_isFunction(target["get" + prop.substr(3)]) ? prop : "get" + prop.substr(3)](funcParam) : target[prop](), setter = !_isFunction(currentValue) ? _setterPlain : funcParam ? _setterFuncWithParam : _setterFunc, pt4;
      if (_isString(end)) {
        if (~end.indexOf("random(")) {
          end = _replaceRandom(end);
        }
        if (end.charAt(1) === "=") {
          pt4 = _parseRelative(parsedStart, end) + (getUnit(parsedStart) || 0);
          if (pt4 || pt4 === 0) {
            end = pt4;
          }
        }
      }
      if (!optional || parsedStart !== end || _forceAllPropTweens) {
        if (!isNaN(parsedStart * end) && end !== "") {
          pt4 = new PropTween(this._pt, target, prop, +parsedStart || 0, end - (parsedStart || 0), typeof currentValue === "boolean" ? _renderBoolean : _renderPlain, 0, setter);
          funcParam && (pt4.fp = funcParam);
          modifier && pt4.modifier(modifier, this, target);
          return this._pt = pt4;
        }
        !currentValue && !(prop in target) && _missingPlugin(prop, end);
        return _addComplexStringPropTween.call(this, target, prop, parsedStart, end, setter, stringFilter || _config.stringFilter, funcParam);
      }
    };
    _processVars = function _processVars2(vars, index, target, targets, tween) {
      _isFunction(vars) && (vars = _parseFuncOrString(vars, tween, index, target, targets));
      if (!_isObject(vars) || vars.style && vars.nodeType || _isArray(vars) || _isTypedArray(vars)) {
        return _isString(vars) ? _parseFuncOrString(vars, tween, index, target, targets) : vars;
      }
      var copy = {}, p2;
      for (p2 in vars) {
        copy[p2] = _parseFuncOrString(vars[p2], tween, index, target, targets);
      }
      return copy;
    };
    _checkPlugin = function _checkPlugin2(property, vars, tween, index, target, targets) {
      var plugin, pt4, ptLookup, i2;
      if (_plugins[property] && (plugin = new _plugins[property]()).init(target, plugin.rawVars ? vars[property] : _processVars(vars[property], index, target, targets, tween), tween, index, targets) !== false) {
        tween._pt = pt4 = new PropTween(tween._pt, target, property, 0, 1, plugin.render, plugin, 0, plugin.priority);
        if (tween !== _quickTween) {
          ptLookup = tween._ptLookup[tween._targets.indexOf(target)];
          i2 = plugin._props.length;
          while (i2--) {
            ptLookup[plugin._props[i2]] = pt4;
          }
        }
      }
      return plugin;
    };
    _initTween = function _initTween2(tween, time, tTime) {
      var vars = tween.vars, ease = vars.ease, startAt = vars.startAt, immediateRender = vars.immediateRender, lazy = vars.lazy, onUpdate = vars.onUpdate, runBackwards = vars.runBackwards, yoyoEase = vars.yoyoEase, keyframes = vars.keyframes, autoRevert = vars.autoRevert, dur = tween._dur, prevStartAt = tween._startAt, targets = tween._targets, parent = tween.parent, fullTargets = parent && parent.data === "nested" ? parent.vars.targets : targets, autoOverwrite = tween._overwrite === "auto" && !_suppressOverwrites, tl = tween.timeline, reverseEase = vars.easeReverse || yoyoEase, cleanVars, i2, p2, pt4, target, hasPriority, gsData, harness, plugin, ptLookup, index, harnessVars, overwritten;
      tl && (!keyframes || !ease) && (ease = "none");
      tween._ease = _parseEase(ease, _defaults.ease);
      tween._rEase = reverseEase && (_parseEase(reverseEase) || tween._ease);
      tween._from = !tl && !!vars.runBackwards;
      if (tween._from) tween.ratio = 1;
      if (!tl || keyframes && !vars.stagger) {
        harness = targets[0] ? _getCache(targets[0]).harness : 0;
        harnessVars = harness && vars[harness.prop];
        cleanVars = _copyExcluding(vars, _reservedProps);
        if (prevStartAt) {
          prevStartAt._zTime < 0 && prevStartAt.progress(1);
          time < 0 && runBackwards && immediateRender && !autoRevert ? prevStartAt.render(-1, true) : prevStartAt.revert(runBackwards && dur ? _revertConfigNoKill : _startAtRevertConfig);
          prevStartAt._lazy = 0;
        }
        if (startAt) {
          _removeFromParent(tween._startAt = Tween.set(targets, _setDefaults({
            data: "isStart",
            overwrite: false,
            parent,
            immediateRender: true,
            lazy: !prevStartAt && _isNotFalse(lazy),
            startAt: null,
            delay: 0,
            onUpdate: onUpdate && function() {
              return _callback(tween, "onUpdate");
            },
            stagger: 0
          }, startAt)));
          tween._startAt._dp = 0;
          tween._startAt._sat = tween;
          time < 0 && (_reverting || !immediateRender && !autoRevert) && tween._startAt.revert(_revertConfigNoKill);
          if (immediateRender) {
            if (dur && time <= 0 && tTime <= 0) {
              time && (tween._zTime = time);
              return;
            }
          }
        } else if (runBackwards && dur) {
          if (!prevStartAt) {
            time && (immediateRender = false);
            p2 = _setDefaults({
              overwrite: false,
              data: "isFromStart",
              //we tag the tween with as "isFromStart" so that if [inside a plugin] we need to only do something at the very END of a tween, we have a way of identifying this tween as merely the one that's setting the beginning values for a "from()" tween. For example, clearProps in CSSPlugin should only get applied at the very END of a tween and without this tag, from(...{height:100, clearProps:"height", delay:1}) would wipe the height at the beginning of the tween and after 1 second, it'd kick back in.
              lazy: immediateRender && !prevStartAt && _isNotFalse(lazy),
              immediateRender,
              //zero-duration tweens render immediately by default, but if we're not specifically instructed to render this tween immediately, we should skip this and merely _init() to record the starting values (rendering them immediately would push them to completion which is wasteful in that case - we'd have to render(-1) immediately after)
              stagger: 0,
              parent
              //ensures that nested tweens that had a stagger are handled properly, like gsap.from(".class", {y: gsap.utils.wrap([-100,100]), stagger: 0.5})
            }, cleanVars);
            harnessVars && (p2[harness.prop] = harnessVars);
            _removeFromParent(tween._startAt = Tween.set(targets, p2));
            tween._startAt._dp = 0;
            tween._startAt._sat = tween;
            time < 0 && (_reverting ? tween._startAt.revert(_revertConfigNoKill) : tween._startAt.render(-1, true));
            tween._zTime = time;
            if (!immediateRender) {
              _initTween2(tween._startAt, _tinyNum, _tinyNum);
            } else if (!time) {
              return;
            }
          }
        }
        tween._pt = tween._ptCache = 0;
        lazy = dur && _isNotFalse(lazy) || lazy && !dur;
        for (i2 = 0; i2 < targets.length; i2++) {
          target = targets[i2];
          gsData = target._gsap || _harness(targets)[i2]._gsap;
          tween._ptLookup[i2] = ptLookup = {};
          _lazyLookup[gsData.id] && _lazyTweens.length && _lazyRender();
          index = fullTargets === targets ? i2 : fullTargets.indexOf(target);
          if (harness && (plugin = new harness()).init(target, harnessVars || cleanVars, tween, index, fullTargets) !== false) {
            tween._pt = pt4 = new PropTween(tween._pt, target, plugin.name, 0, 1, plugin.render, plugin, 0, plugin.priority);
            plugin._props.forEach(function(name) {
              ptLookup[name] = pt4;
            });
            plugin.priority && (hasPriority = 1);
          }
          if (!harness || harnessVars) {
            for (p2 in cleanVars) {
              if (_plugins[p2] && (plugin = _checkPlugin(p2, cleanVars, tween, index, target, fullTargets))) {
                plugin.priority && (hasPriority = 1);
              } else {
                ptLookup[p2] = pt4 = _addPropTween.call(tween, target, p2, "get", cleanVars[p2], index, fullTargets, 0, vars.stringFilter);
              }
            }
          }
          tween._op && tween._op[i2] && tween.kill(target, tween._op[i2]);
          if (autoOverwrite && tween._pt) {
            _overwritingTween = tween;
            _globalTimeline.killTweensOf(target, ptLookup, tween.globalTime(time));
            overwritten = !tween.parent;
            _overwritingTween = 0;
          }
          tween._pt && lazy && (_lazyLookup[gsData.id] = 1);
        }
        hasPriority && _sortPropTweensByPriority(tween);
        tween._onInit && tween._onInit(tween);
      }
      tween._onUpdate = onUpdate;
      tween._initted = (!tween._op || tween._pt) && !overwritten;
      keyframes && time <= 0 && tl.render(_bigNum, true, true);
    };
    _updatePropTweens = function _updatePropTweens2(tween, property, value, start, startIsRelative, ratio, time, skipRecursion) {
      var ptCache = (tween._pt && tween._ptCache || (tween._ptCache = {}))[property], pt4, rootPT, lookup, i2;
      if (!ptCache) {
        ptCache = tween._ptCache[property] = [];
        lookup = tween._ptLookup;
        i2 = tween._targets.length;
        while (i2--) {
          pt4 = lookup[i2][property];
          if (pt4 && pt4.d && pt4.d._pt) {
            pt4 = pt4.d._pt;
            while (pt4 && pt4.p !== property && pt4.fp !== property) {
              pt4 = pt4._next;
            }
          }
          if (!pt4) {
            _forceAllPropTweens = 1;
            tween.vars[property] = "+=0";
            _initTween(tween, time);
            _forceAllPropTweens = 0;
            return skipRecursion ? _warn(property + " not eligible for reset. Try splitting into individual properties") : 1;
          }
          ptCache.push(pt4);
        }
      }
      i2 = ptCache.length;
      while (i2--) {
        rootPT = ptCache[i2];
        pt4 = rootPT._pt || rootPT;
        pt4.s = (start || start === 0) && !startIsRelative ? start : pt4.s + (start || 0) + ratio * pt4.c;
        pt4.c = value - pt4.s;
        rootPT.e && (rootPT.e = _round(value) + getUnit(rootPT.e));
        rootPT.b && (rootPT.b = pt4.s + getUnit(rootPT.b));
      }
    };
    _addAliasesToVars = function _addAliasesToVars2(targets, vars) {
      var harness = targets[0] ? _getCache(targets[0]).harness : 0, propertyAliases = harness && harness.aliases, copy, p2, i2, aliases;
      if (!propertyAliases) {
        return vars;
      }
      copy = _merge({}, vars);
      for (p2 in propertyAliases) {
        if (p2 in copy) {
          aliases = propertyAliases[p2].split(",");
          i2 = aliases.length;
          while (i2--) {
            copy[aliases[i2]] = copy[p2];
          }
        }
      }
      return copy;
    };
    _parseKeyframe = function _parseKeyframe2(prop, obj, allProps, easeEach) {
      var ease = obj.ease || easeEach || "power1.inOut", p2, a;
      if (_isArray(obj)) {
        a = allProps[prop] || (allProps[prop] = []);
        obj.forEach(function(value, i2) {
          return a.push({
            t: i2 / (obj.length - 1) * 100,
            v: value,
            e: ease
          });
        });
      } else {
        for (p2 in obj) {
          a = allProps[p2] || (allProps[p2] = []);
          p2 === "ease" || a.push({
            t: parseFloat(prop),
            v: obj[p2],
            e: ease
          });
        }
      }
    };
    _parseFuncOrString = function _parseFuncOrString2(value, tween, i2, target, targets) {
      return _isFunction(value) ? value.call(tween, i2, target, targets) : _isString(value) && ~value.indexOf("random(") ? _replaceRandom(value) : value;
    };
    _staggerTweenProps = _callbackNames + "repeat,repeatDelay,yoyo,repeatRefresh,yoyoEase,easeReverse,autoRevert";
    _staggerPropsToSkip = {};
    _forEachName(_staggerTweenProps + ",id,stagger,delay,duration,paused,scrollTrigger", function(name) {
      return _staggerPropsToSkip[name] = 1;
    });
    Tween = /* @__PURE__ */ (function(_Animation2) {
      _inheritsLoose(Tween2, _Animation2);
      function Tween2(targets, vars, position, skipInherit) {
        var _this3;
        if (typeof vars === "number") {
          position.duration = vars;
          vars = position;
          position = null;
        }
        _this3 = _Animation2.call(this, skipInherit ? vars : _inheritDefaults(vars)) || this;
        var _this3$vars = _this3.vars, duration = _this3$vars.duration, delay = _this3$vars.delay, immediateRender = _this3$vars.immediateRender, stagger = _this3$vars.stagger, overwrite = _this3$vars.overwrite, keyframes = _this3$vars.keyframes, defaults2 = _this3$vars.defaults, scrollTrigger = _this3$vars.scrollTrigger, parent = vars.parent || _globalTimeline, parsedTargets = (_isArray(targets) || _isTypedArray(targets) ? _isNumber(targets[0]) : "length" in vars) ? [targets] : toArray(targets), tl, i2, copy, l2, p2, curTarget, staggerFunc, staggerVarsToMerge;
        _this3._targets = parsedTargets.length ? _harness(parsedTargets) : _warn("GSAP target " + targets + " not found. https://gsap.com", !_config.nullTargetWarn) || [];
        _this3._ptLookup = [];
        _this3._overwrite = overwrite;
        if (keyframes || stagger || _isFuncOrString(duration) || _isFuncOrString(delay)) {
          vars = _this3.vars;
          var easeReverse = vars.easeReverse || vars.yoyoEase;
          tl = _this3.timeline = new Timeline({
            data: "nested",
            defaults: defaults2 || {},
            targets: parent && parent.data === "nested" ? parent.vars.targets : parsedTargets
          });
          tl.kill();
          tl.parent = tl._dp = _assertThisInitialized(_this3);
          tl._start = 0;
          if (stagger || _isFuncOrString(duration) || _isFuncOrString(delay)) {
            l2 = parsedTargets.length;
            staggerFunc = stagger && distribute(stagger);
            if (_isObject(stagger)) {
              for (p2 in stagger) {
                if (~_staggerTweenProps.indexOf(p2)) {
                  staggerVarsToMerge || (staggerVarsToMerge = {});
                  staggerVarsToMerge[p2] = stagger[p2];
                }
              }
            }
            for (i2 = 0; i2 < l2; i2++) {
              copy = _copyExcluding(vars, _staggerPropsToSkip);
              copy.stagger = 0;
              easeReverse && (copy.easeReverse = easeReverse);
              staggerVarsToMerge && _merge(copy, staggerVarsToMerge);
              curTarget = parsedTargets[i2];
              copy.duration = +_parseFuncOrString(duration, _assertThisInitialized(_this3), i2, curTarget, parsedTargets);
              copy.delay = (+_parseFuncOrString(delay, _assertThisInitialized(_this3), i2, curTarget, parsedTargets) || 0) - _this3._delay;
              if (!stagger && l2 === 1 && copy.delay) {
                _this3._delay = delay = copy.delay;
                _this3._start += delay;
                copy.delay = 0;
              }
              tl.to(curTarget, copy, staggerFunc ? staggerFunc(i2, curTarget, parsedTargets) : 0);
              tl._ease = _easeMap.none;
            }
            tl.duration() ? duration = delay = 0 : _this3.timeline = 0;
          } else if (keyframes) {
            _inheritDefaults(_setDefaults(tl.vars.defaults, {
              ease: "none"
            }));
            tl._ease = _parseEase(keyframes.ease || vars.ease || "none");
            var time = 0, a, kf, v2;
            if (_isArray(keyframes)) {
              keyframes.forEach(function(frame) {
                return tl.to(parsedTargets, frame, ">");
              });
              tl.duration();
            } else {
              copy = {};
              for (p2 in keyframes) {
                p2 === "ease" || p2 === "easeEach" || _parseKeyframe(p2, keyframes[p2], copy, keyframes.easeEach);
              }
              for (p2 in copy) {
                a = copy[p2].sort(function(a2, b2) {
                  return a2.t - b2.t;
                });
                time = 0;
                for (i2 = 0; i2 < a.length; i2++) {
                  kf = a[i2];
                  v2 = {
                    ease: kf.e,
                    duration: (kf.t - (i2 ? a[i2 - 1].t : 0)) / 100 * duration
                  };
                  v2[p2] = kf.v;
                  tl.to(parsedTargets, v2, time);
                  time += v2.duration;
                }
              }
              tl.duration() < duration && tl.to({}, {
                duration: duration - tl.duration()
              });
            }
          }
          duration || _this3.duration(duration = tl.duration());
        } else {
          _this3.timeline = 0;
        }
        if (overwrite === true && !_suppressOverwrites) {
          _overwritingTween = _assertThisInitialized(_this3);
          _globalTimeline.killTweensOf(parsedTargets);
          _overwritingTween = 0;
        }
        _addToTimeline(parent, _assertThisInitialized(_this3), position);
        vars.reversed && _this3.reverse();
        vars.paused && _this3.paused(true);
        if (immediateRender || !duration && !keyframes && _this3._start === _roundPrecise(parent._time) && _isNotFalse(immediateRender) && _hasNoPausedAncestors(_assertThisInitialized(_this3)) && parent.data !== "nested") {
          _this3._tTime = -_tinyNum;
          _this3.render(Math.max(0, -delay) || 0);
        }
        scrollTrigger && _scrollTrigger(_assertThisInitialized(_this3), scrollTrigger);
        return _this3;
      }
      var _proto3 = Tween2.prototype;
      _proto3.render = function render3(totalTime, suppressEvents, force) {
        var prevTime = this._time, tDur = this._tDur, dur = this._dur, isNegative = totalTime < 0, tTime = totalTime > tDur - _tinyNum && !isNegative ? tDur : totalTime < _tinyNum ? 0 : totalTime, time, pt4, iteration, cycleDuration, prevIteration, isYoyo, ratio, timeline2;
        if (!dur) {
          _renderZeroDurationTween(this, totalTime, suppressEvents, force);
        } else if (tTime !== this._tTime || !totalTime || force || !this._initted && this._tTime || this._startAt && this._zTime < 0 !== isNegative || this._lazy) {
          time = tTime;
          timeline2 = this.timeline;
          if (this._repeat) {
            cycleDuration = dur + this._rDelay;
            if (this._repeat < -1 && isNegative) {
              return this.totalTime(cycleDuration * 100 + totalTime, suppressEvents, force);
            }
            time = _roundPrecise(tTime % cycleDuration);
            if (tTime === tDur) {
              iteration = this._repeat;
              time = dur;
            } else {
              prevIteration = _roundPrecise(tTime / cycleDuration);
              iteration = ~~prevIteration;
              if (iteration && iteration === prevIteration) {
                time = dur;
                iteration--;
              } else if (time > dur) {
                time = dur;
              }
            }
            isYoyo = this._yoyo && iteration & 1;
            if (isYoyo) time = dur - time;
            prevIteration = _animationCycle(this._tTime, cycleDuration);
            if (time === prevTime && !force && this._initted && iteration === prevIteration) {
              this._tTime = tTime;
              return this;
            }
            if (iteration !== prevIteration) {
              if (this.vars.repeatRefresh && !isYoyo && !this._lock && time !== cycleDuration && this._initted) {
                this._lock = force = 1;
                this.render(_roundPrecise(cycleDuration * iteration), true).invalidate()._lock = 0;
              }
            }
          }
          if (!this._initted) {
            if (_attemptInitTween(this, isNegative ? totalTime : time, force, suppressEvents, tTime)) {
              this._tTime = 0;
              return this;
            }
            if (prevTime !== this._time && !(force && this.vars.repeatRefresh && iteration !== prevIteration)) {
              return this;
            }
            if (dur !== this._dur) {
              return this.render(totalTime, suppressEvents, force);
            }
          }
          if (this._rEase) {
            var inv = time < prevTime;
            if (inv !== this._inv) {
              var segDur = inv ? prevTime : dur - prevTime;
              this._inv = inv;
              if (this._from) this.ratio = 1 - this.ratio;
              this._invRatio = this.ratio;
              this._invTime = prevTime;
              this._invRecip = segDur ? (inv ? -1 : 1) / segDur : 0;
              this._invScale = inv ? -this.ratio : 1 - this.ratio;
              this._invEase = inv ? this._rEase : this._ease;
            }
            this.ratio = ratio = this._invRatio + this._invScale * this._invEase((time - this._invTime) * this._invRecip);
          } else {
            this.ratio = ratio = this._ease(time / dur);
          }
          if (this._from) this.ratio = ratio = 1 - ratio;
          this._tTime = tTime;
          this._time = time;
          if (!this._act && this._ts) {
            this._act = 1;
            this._lazy = 0;
          }
          if (!prevTime && tTime && !suppressEvents && !prevIteration) {
            _callback(this, "onStart");
            if (this._tTime !== tTime) {
              return this;
            }
          }
          pt4 = this._pt;
          while (pt4) {
            pt4.r(ratio, pt4.d);
            pt4 = pt4._next;
          }
          timeline2 && timeline2.render(totalTime < 0 ? totalTime : timeline2._dur * timeline2._ease(time / this._dur), suppressEvents, force) || this._startAt && (this._zTime = totalTime);
          if (this._onUpdate && !suppressEvents) {
            isNegative && _rewindStartAt(this, totalTime, suppressEvents, force);
            _callback(this, "onUpdate");
          }
          this._repeat && iteration !== prevIteration && this.vars.onRepeat && !suppressEvents && this.parent && _callback(this, "onRepeat");
          if ((tTime === this._tDur || !tTime) && this._tTime === tTime) {
            isNegative && !this._onUpdate && _rewindStartAt(this, totalTime, true, true);
            (totalTime || !dur) && (tTime === this._tDur && this._ts > 0 || !tTime && this._ts < 0) && _removeFromParent(this, 1);
            if (!suppressEvents && !(isNegative && !prevTime) && (tTime || prevTime || isYoyo)) {
              _callback(this, tTime === tDur ? "onComplete" : "onReverseComplete", true);
              this._prom && !(tTime < tDur && this.timeScale() > 0) && this._prom();
            }
          }
        }
        return this;
      };
      _proto3.targets = function targets() {
        return this._targets;
      };
      _proto3.invalidate = function invalidate(soft) {
        (!soft || !this.vars.runBackwards) && (this._startAt = 0);
        this._pt = this._op = this._onUpdate = this._lazy = this.ratio = 0;
        this._ptLookup = [];
        this.timeline && this.timeline.invalidate(soft);
        return _Animation2.prototype.invalidate.call(this, soft);
      };
      _proto3.resetTo = function resetTo(property, value, start, startIsRelative, skipRecursion) {
        _tickerActive || _ticker.wake();
        this._ts || this.play();
        var time = Math.min(this._dur, (this._dp._time - this._start) * this._ts), ratio;
        this._initted || _initTween(this, time);
        ratio = this._ease(time / this._dur);
        if (_updatePropTweens(this, property, value, start, startIsRelative, ratio, time, skipRecursion)) {
          return this.resetTo(property, value, start, startIsRelative, 1);
        }
        _alignPlayhead(this, 0);
        this.parent || _addLinkedListItem(this._dp, this, "_first", "_last", this._dp._sort ? "_start" : 0);
        return this.render(0);
      };
      _proto3.kill = function kill(targets, vars) {
        if (vars === void 0) {
          vars = "all";
        }
        if (!targets && (!vars || vars === "all")) {
          this._lazy = this._pt = 0;
          this.parent ? _interrupt(this) : this.scrollTrigger && this.scrollTrigger.kill(!!_reverting);
          return this;
        }
        if (this.timeline) {
          var tDur = this.timeline.totalDuration();
          this.timeline.killTweensOf(targets, vars, _overwritingTween && _overwritingTween.vars.overwrite !== true)._first || _interrupt(this);
          this.parent && tDur !== this.timeline.totalDuration() && _setDuration(this, this._dur * this.timeline._tDur / tDur, 0, 1);
          return this;
        }
        var parsedTargets = this._targets, killingTargets = targets ? toArray(targets) : parsedTargets, propTweenLookup = this._ptLookup, firstPT = this._pt, overwrittenProps, curLookup, curOverwriteProps, props, p2, pt4, i2;
        if ((!vars || vars === "all") && _arraysMatch(parsedTargets, killingTargets)) {
          vars === "all" && (this._pt = 0);
          return _interrupt(this);
        }
        overwrittenProps = this._op = this._op || [];
        if (vars !== "all") {
          if (_isString(vars)) {
            p2 = {};
            _forEachName(vars, function(name) {
              return p2[name] = 1;
            });
            vars = p2;
          }
          vars = _addAliasesToVars(parsedTargets, vars);
        }
        i2 = parsedTargets.length;
        while (i2--) {
          if (~killingTargets.indexOf(parsedTargets[i2])) {
            curLookup = propTweenLookup[i2];
            if (vars === "all") {
              overwrittenProps[i2] = vars;
              props = curLookup;
              curOverwriteProps = {};
            } else {
              curOverwriteProps = overwrittenProps[i2] = overwrittenProps[i2] || {};
              props = vars;
            }
            for (p2 in props) {
              pt4 = curLookup && curLookup[p2];
              if (pt4) {
                if (!("kill" in pt4.d) || pt4.d.kill(p2) === true) {
                  _removeLinkedListItem(this, pt4, "_pt");
                }
                delete curLookup[p2];
              }
              if (curOverwriteProps !== "all") {
                curOverwriteProps[p2] = 1;
              }
            }
          }
        }
        this._initted && !this._pt && firstPT && _interrupt(this);
        return this;
      };
      Tween2.to = function to2(targets, vars) {
        return new Tween2(targets, vars, arguments[2]);
      };
      Tween2.from = function from(targets, vars) {
        return _createTweenType(1, arguments);
      };
      Tween2.delayedCall = function delayedCall(delay, callback, params, scope) {
        return new Tween2(callback, 0, {
          immediateRender: false,
          lazy: false,
          overwrite: false,
          delay,
          onComplete: callback,
          onReverseComplete: callback,
          onCompleteParams: params,
          onReverseCompleteParams: params,
          callbackScope: scope
        });
      };
      Tween2.fromTo = function fromTo(targets, fromVars, toVars) {
        return _createTweenType(2, arguments);
      };
      Tween2.set = function set(targets, vars) {
        vars.duration = 0;
        vars.repeatDelay || (vars.repeat = 0);
        return new Tween2(targets, vars);
      };
      Tween2.killTweensOf = function killTweensOf(targets, props, onlyActive) {
        return _globalTimeline.killTweensOf(targets, props, onlyActive);
      };
      return Tween2;
    })(Animation);
    _setDefaults(Tween.prototype, {
      _targets: [],
      _lazy: 0,
      _startAt: 0,
      _op: 0,
      _onInit: 0
    });
    _forEachName("staggerTo,staggerFrom,staggerFromTo", function(name) {
      Tween[name] = function() {
        var tl = new Timeline(), params = _slice.call(arguments, 0);
        params.splice(name === "staggerFromTo" ? 5 : 4, 0, 0);
        return tl[name].apply(tl, params);
      };
    });
    _setterPlain = function _setterPlain2(target, property, value) {
      return target[property] = value;
    };
    _setterFunc = function _setterFunc2(target, property, value) {
      return target[property](value);
    };
    _setterFuncWithParam = function _setterFuncWithParam2(target, property, value, data) {
      return target[property](data.fp, value);
    };
    _setterAttribute = function _setterAttribute2(target, property, value) {
      return target.setAttribute(property, value);
    };
    _getSetter = function _getSetter2(target, property) {
      return _isFunction(target[property]) ? _setterFunc : _isUndefined(target[property]) && target.setAttribute ? _setterAttribute : _setterPlain;
    };
    _renderPlain = function _renderPlain2(ratio, data) {
      return data.set(data.t, data.p, Math.round((data.s + data.c * ratio) * 1e6) / 1e6, data);
    };
    _renderBoolean = function _renderBoolean2(ratio, data) {
      return data.set(data.t, data.p, !!(data.s + data.c * ratio), data);
    };
    _renderComplexString = function _renderComplexString2(ratio, data) {
      var pt4 = data._pt, s2 = "";
      if (!ratio && data.b) {
        s2 = data.b;
      } else if (ratio === 1 && data.e) {
        s2 = data.e;
      } else {
        while (pt4) {
          s2 = pt4.p + (pt4.m ? pt4.m(pt4.s + pt4.c * ratio) : Math.round((pt4.s + pt4.c * ratio) * 1e4) / 1e4) + s2;
          pt4 = pt4._next;
        }
        s2 += data.c;
      }
      data.set(data.t, data.p, s2, data);
    };
    _renderPropTweens = function _renderPropTweens2(ratio, data) {
      var pt4 = data._pt;
      while (pt4) {
        pt4.r(ratio, pt4.d);
        pt4 = pt4._next;
      }
    };
    _addPluginModifier = function _addPluginModifier2(modifier, tween, target, property) {
      var pt4 = this._pt, next;
      while (pt4) {
        next = pt4._next;
        pt4.p === property && pt4.modifier(modifier, tween, target);
        pt4 = next;
      }
    };
    _killPropTweensOf = function _killPropTweensOf2(property) {
      var pt4 = this._pt, hasNonDependentRemaining, next;
      while (pt4) {
        next = pt4._next;
        if (pt4.p === property && !pt4.op || pt4.op === property) {
          _removeLinkedListItem(this, pt4, "_pt");
        } else if (!pt4.dep) {
          hasNonDependentRemaining = 1;
        }
        pt4 = next;
      }
      return !hasNonDependentRemaining;
    };
    _setterWithModifier = function _setterWithModifier2(target, property, value, data) {
      data.mSet(target, property, data.m.call(data.tween, value, data.mt), data);
    };
    _sortPropTweensByPriority = function _sortPropTweensByPriority2(parent) {
      var pt4 = parent._pt, next, pt22, first, last;
      while (pt4) {
        next = pt4._next;
        pt22 = first;
        while (pt22 && pt22.pr > pt4.pr) {
          pt22 = pt22._next;
        }
        if (pt4._prev = pt22 ? pt22._prev : last) {
          pt4._prev._next = pt4;
        } else {
          first = pt4;
        }
        if (pt4._next = pt22) {
          pt22._prev = pt4;
        } else {
          last = pt4;
        }
        pt4 = next;
      }
      parent._pt = first;
    };
    PropTween = /* @__PURE__ */ (function() {
      function PropTween2(next, target, prop, start, change, renderer, data, setter, priority) {
        this.t = target;
        this.s = start;
        this.c = change;
        this.p = prop;
        this.r = renderer || _renderPlain;
        this.d = data || this;
        this.set = setter || _setterPlain;
        this.pr = priority || 0;
        this._next = next;
        if (next) {
          next._prev = this;
        }
      }
      var _proto4 = PropTween2.prototype;
      _proto4.modifier = function modifier(func, tween, target) {
        this.mSet = this.mSet || this.set;
        this.set = _setterWithModifier;
        this.m = func;
        this.mt = target;
        this.tween = tween;
      };
      return PropTween2;
    })();
    _forEachName(_callbackNames + "parent,duration,ease,delay,overwrite,runBackwards,startAt,yoyo,immediateRender,repeat,repeatDelay,data,paused,reversed,lazy,callbackScope,stringFilter,id,yoyoEase,stagger,inherit,repeatRefresh,keyframes,autoRevert,scrollTrigger,easeReverse", function(name) {
      return _reservedProps[name] = 1;
    });
    _globals.TweenMax = _globals.TweenLite = Tween;
    _globals.TimelineLite = _globals.TimelineMax = Timeline;
    _globalTimeline = new Timeline({
      sortChildren: false,
      defaults: _defaults,
      autoRemoveChildren: true,
      id: "root",
      smoothChildTiming: true
    });
    _config.stringFilter = _colorStringFilter;
    _media = [];
    _listeners = {};
    _emptyArray = [];
    _lastMediaTime = 0;
    _contextID = 0;
    _dispatch = function _dispatch2(type) {
      return (_listeners[type] || _emptyArray).map(function(f2) {
        return f2();
      });
    };
    _onMediaChange = function _onMediaChange2() {
      var time = Date.now(), matches = [];
      if (time - _lastMediaTime > 2) {
        _dispatch("matchMediaInit");
        _media.forEach(function(c) {
          var queries = c.queries, conditions = c.conditions, match, p2, anyMatch, toggled;
          for (p2 in queries) {
            match = _win.matchMedia(queries[p2]).matches;
            match && (anyMatch = 1);
            if (match !== conditions[p2]) {
              conditions[p2] = match;
              toggled = 1;
            }
          }
          if (toggled) {
            c.revert();
            anyMatch && matches.push(c);
          }
        });
        _dispatch("matchMediaRevert");
        matches.forEach(function(c) {
          return c.onMatch(c, function(func) {
            return c.add(null, func);
          });
        });
        _lastMediaTime = time;
        _dispatch("matchMedia");
      }
    };
    Context = /* @__PURE__ */ (function() {
      function Context2(func, scope) {
        this.selector = scope && selector(scope);
        this.data = [];
        this._r = [];
        this.isReverted = false;
        this.id = _contextID++;
        func && this.add(func);
      }
      var _proto5 = Context2.prototype;
      _proto5.add = function add(name, func, scope) {
        if (_isFunction(name)) {
          scope = func;
          func = name;
          name = _isFunction;
        }
        var self = this, f2 = function f3() {
          var prev = _context, prevSelector = self.selector, result;
          prev && prev !== self && prev.data.push(self);
          scope && (self.selector = selector(scope));
          _context = self;
          result = func.apply(self, arguments);
          _isFunction(result) && self._r.push(result);
          _context = prev;
          self.selector = prevSelector;
          self.isReverted = false;
          return result;
        };
        self.last = f2;
        return name === _isFunction ? f2(self, function(func2) {
          return self.add(null, func2);
        }) : name ? self[name] = f2 : f2;
      };
      _proto5.ignore = function ignore(func) {
        var prev = _context;
        _context = null;
        func(this);
        _context = prev;
      };
      _proto5.getTweens = function getTweens() {
        var a = [];
        this.data.forEach(function(e2) {
          return e2 instanceof Context2 ? a.push.apply(a, e2.getTweens()) : e2 instanceof Tween && !(e2.parent && e2.parent.data === "nested") && a.push(e2);
        });
        return a;
      };
      _proto5.clear = function clear() {
        this._r.length = this.data.length = 0;
      };
      _proto5.kill = function kill(revert, matchMedia2) {
        var _this4 = this;
        if (revert) {
          (function() {
            var tweens = _this4.getTweens(), i3 = _this4.data.length, t2;
            while (i3--) {
              t2 = _this4.data[i3];
              if (t2.data === "isFlip") {
                t2.revert();
                t2.getChildren(true, true, false).forEach(function(tween) {
                  return tweens.splice(tweens.indexOf(tween), 1);
                });
              }
            }
            tweens.map(function(t3) {
              return {
                g: t3._dur || t3._delay || t3._sat && !t3._sat.vars.immediateRender ? t3.globalTime(0) : -Infinity,
                t: t3
              };
            }).sort(function(a, b2) {
              return b2.g - a.g || -Infinity;
            }).forEach(function(o2) {
              return o2.t.revert(revert);
            });
            i3 = _this4.data.length;
            while (i3--) {
              t2 = _this4.data[i3];
              if (t2 instanceof Timeline) {
                if (t2.data !== "nested") {
                  t2.scrollTrigger && t2.scrollTrigger.revert();
                  t2.kill();
                }
              } else {
                !(t2 instanceof Tween) && t2.revert && t2.revert(revert);
              }
            }
            _this4._r.forEach(function(f2) {
              return f2(revert, _this4);
            });
            _this4.isReverted = true;
          })();
        } else {
          this.data.forEach(function(e2) {
            return e2.kill && e2.kill();
          });
        }
        this.clear();
        if (matchMedia2) {
          var i2 = _media.length;
          while (i2--) {
            _media[i2].id === this.id && _media.splice(i2, 1);
          }
        }
      };
      _proto5.revert = function revert(config3) {
        this.kill(config3 || {});
      };
      return Context2;
    })();
    MatchMedia = /* @__PURE__ */ (function() {
      function MatchMedia2(scope) {
        this.contexts = [];
        this.scope = scope;
        _context && _context.data.push(this);
      }
      var _proto6 = MatchMedia2.prototype;
      _proto6.add = function add(conditions, func, scope) {
        _isObject(conditions) || (conditions = {
          matches: conditions
        });
        var context3 = new Context(0, scope || this.scope), cond = context3.conditions = {}, mq, p2, active;
        _context && !context3.selector && (context3.selector = _context.selector);
        this.contexts.push(context3);
        func = context3.add("onMatch", func);
        context3.queries = conditions;
        for (p2 in conditions) {
          if (p2 === "all") {
            active = 1;
          } else {
            mq = _win.matchMedia(conditions[p2]);
            if (mq) {
              _media.indexOf(context3) < 0 && _media.push(context3);
              (cond[p2] = mq.matches) && (active = 1);
              mq.addListener ? mq.addListener(_onMediaChange) : mq.addEventListener("change", _onMediaChange);
            }
          }
        }
        active && func(context3, function(f2) {
          return context3.add(null, f2);
        });
        return this;
      };
      _proto6.revert = function revert(config3) {
        this.kill(config3 || {});
      };
      _proto6.kill = function kill(revert) {
        this.contexts.forEach(function(c) {
          return c.kill(revert, true);
        });
      };
      return MatchMedia2;
    })();
    _gsap = {
      registerPlugin: function registerPlugin() {
        for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          args[_key2] = arguments[_key2];
        }
        args.forEach(function(config3) {
          return _createPlugin(config3);
        });
      },
      timeline: function timeline(vars) {
        return new Timeline(vars);
      },
      getTweensOf: function getTweensOf(targets, onlyActive) {
        return _globalTimeline.getTweensOf(targets, onlyActive);
      },
      getProperty: function getProperty(target, property, unit, uncache) {
        _isString(target) && (target = toArray(target)[0]);
        var getter = _getCache(target || {}).get, format = unit ? _passThrough : _numericIfPossible;
        unit === "native" && (unit = "");
        return !target ? target : !property ? function(property2, unit2, uncache2) {
          return format((_plugins[property2] && _plugins[property2].get || getter)(target, property2, unit2, uncache2));
        } : format((_plugins[property] && _plugins[property].get || getter)(target, property, unit, uncache));
      },
      quickSetter: function quickSetter(target, property, unit) {
        target = toArray(target);
        if (target.length > 1) {
          var setters = target.map(function(t2) {
            return gsap.quickSetter(t2, property, unit);
          }), l2 = setters.length;
          return function(value) {
            var i2 = l2;
            while (i2--) {
              setters[i2](value);
            }
          };
        }
        target = target[0] || {};
        var Plugin = _plugins[property], cache = _getCache(target), p2 = cache.harness && (cache.harness.aliases || {})[property] || property, setter = Plugin ? function(value) {
          var p3 = new Plugin();
          _quickTween._pt = 0;
          p3.init(target, unit ? value + unit : value, _quickTween, 0, [target]);
          p3.render(1, p3);
          _quickTween._pt && _renderPropTweens(1, _quickTween);
        } : cache.set(target, p2);
        return Plugin ? setter : function(value) {
          return setter(target, p2, unit ? value + unit : value, cache, 1);
        };
      },
      quickTo: function quickTo(target, property, vars) {
        var _setDefaults22;
        var tween = gsap.to(target, _setDefaults((_setDefaults22 = {}, _setDefaults22[property] = "+=0.1", _setDefaults22.paused = true, _setDefaults22.stagger = 0, _setDefaults22), vars || {})), func = function func2(value, start, startIsRelative) {
          return tween.resetTo(property, value, start, startIsRelative);
        };
        func.tween = tween;
        return func;
      },
      isTweening: function isTweening(targets) {
        return _globalTimeline.getTweensOf(targets, true).length > 0;
      },
      defaults: function defaults(value) {
        value && value.ease && (value.ease = _parseEase(value.ease, _defaults.ease));
        return _mergeDeep(_defaults, value || {});
      },
      config: function config2(value) {
        return _mergeDeep(_config, value || {});
      },
      registerEffect: function registerEffect(_ref3) {
        var name = _ref3.name, effect = _ref3.effect, plugins = _ref3.plugins, defaults2 = _ref3.defaults, extendTimeline = _ref3.extendTimeline;
        (plugins || "").split(",").forEach(function(pluginName) {
          return pluginName && !_plugins[pluginName] && !_globals[pluginName] && _warn(name + " effect requires " + pluginName + " plugin.");
        });
        _effects[name] = function(targets, vars, tl) {
          return effect(toArray(targets), _setDefaults(vars || {}, defaults2), tl);
        };
        if (extendTimeline) {
          Timeline.prototype[name] = function(targets, vars, position) {
            return this.add(_effects[name](targets, _isObject(vars) ? vars : (position = vars) && {}, this), position);
          };
        }
      },
      registerEase: function registerEase(name, ease) {
        _easeMap[name] = _parseEase(ease);
      },
      parseEase: function parseEase(ease, defaultEase) {
        return arguments.length ? _parseEase(ease, defaultEase) : _easeMap;
      },
      getById: function getById(id2) {
        return _globalTimeline.getById(id2);
      },
      exportRoot: function exportRoot(vars, includeDelayedCalls) {
        if (vars === void 0) {
          vars = {};
        }
        var tl = new Timeline(vars), child, next;
        tl.smoothChildTiming = _isNotFalse(vars.smoothChildTiming);
        _globalTimeline.remove(tl);
        tl._dp = 0;
        tl._time = tl._tTime = _globalTimeline._time;
        child = _globalTimeline._first;
        while (child) {
          next = child._next;
          if (includeDelayedCalls || !(!child._dur && child instanceof Tween && child.vars.onComplete === child._targets[0])) {
            _addToTimeline(tl, child, child._start - child._delay);
          }
          child = next;
        }
        _addToTimeline(_globalTimeline, tl, 0);
        return tl;
      },
      context: function context(func, scope) {
        return func ? new Context(func, scope) : _context;
      },
      matchMedia: function matchMedia(scope) {
        return new MatchMedia(scope);
      },
      matchMediaRefresh: function matchMediaRefresh() {
        return _media.forEach(function(c) {
          var cond = c.conditions, found, p2;
          for (p2 in cond) {
            if (cond[p2]) {
              cond[p2] = false;
              found = 1;
            }
          }
          found && c.revert();
        }) || _onMediaChange();
      },
      addEventListener: function addEventListener(type, callback) {
        var a = _listeners[type] || (_listeners[type] = []);
        ~a.indexOf(callback) || a.push(callback);
      },
      removeEventListener: function removeEventListener(type, callback) {
        var a = _listeners[type], i2 = a && a.indexOf(callback);
        i2 >= 0 && a.splice(i2, 1);
      },
      utils: {
        wrap,
        wrapYoyo,
        distribute,
        random,
        snap,
        normalize,
        getUnit,
        clamp,
        splitColor,
        toArray,
        selector,
        mapRange,
        pipe,
        unitize,
        interpolate,
        shuffle
      },
      install: _install,
      effects: _effects,
      ticker: _ticker,
      updateRoot: Timeline.updateRoot,
      plugins: _plugins,
      globalTimeline: _globalTimeline,
      core: {
        PropTween,
        globals: _addGlobal,
        Tween,
        Timeline,
        Animation,
        getCache: _getCache,
        _removeLinkedListItem,
        reverting: function reverting() {
          return _reverting;
        },
        context: function context2(toAdd) {
          if (toAdd && _context) {
            _context.data.push(toAdd);
            toAdd._ctx = _context;
          }
          return _context;
        },
        suppressOverwrites: function suppressOverwrites(value) {
          return _suppressOverwrites = value;
        }
      }
    };
    _forEachName("to,from,fromTo,delayedCall,set,killTweensOf", function(name) {
      return _gsap[name] = Tween[name];
    });
    _ticker.add(Timeline.updateRoot);
    _quickTween = _gsap.to({}, {
      duration: 0
    });
    _getPluginPropTween = function _getPluginPropTween2(plugin, prop) {
      var pt4 = plugin._pt;
      while (pt4 && pt4.p !== prop && pt4.op !== prop && pt4.fp !== prop) {
        pt4 = pt4._next;
      }
      return pt4;
    };
    _addModifiers = function _addModifiers2(tween, modifiers) {
      var targets = tween._targets, p2, i2, pt4;
      for (p2 in modifiers) {
        i2 = targets.length;
        while (i2--) {
          pt4 = tween._ptLookup[i2][p2];
          if (pt4 && (pt4 = pt4.d)) {
            if (pt4._pt) {
              pt4 = _getPluginPropTween(pt4, p2);
            }
            pt4 && pt4.modifier && pt4.modifier(modifiers[p2], tween, targets[i2], p2);
          }
        }
      }
    };
    _buildModifierPlugin = function _buildModifierPlugin2(name, modifier) {
      return {
        name,
        headless: 1,
        rawVars: 1,
        //don't pre-process function-based values or "random()" strings.
        init: function init4(target, vars, tween) {
          tween._onInit = function(tween2) {
            var temp, p2;
            if (_isString(vars)) {
              temp = {};
              _forEachName(vars, function(name2) {
                return temp[name2] = 1;
              });
              vars = temp;
            }
            if (modifier) {
              temp = {};
              for (p2 in vars) {
                temp[p2] = modifier(vars[p2]);
              }
              vars = temp;
            }
            _addModifiers(tween2, vars);
          };
        }
      };
    };
    gsap = _gsap.registerPlugin({
      name: "attr",
      init: function init(target, vars, tween, index, targets) {
        var p2, pt4, v2;
        this.tween = tween;
        for (p2 in vars) {
          v2 = target.getAttribute(p2) || "";
          pt4 = this.add(target, "setAttribute", (v2 || 0) + "", vars[p2], index, targets, 0, 0, p2);
          pt4.op = p2;
          pt4.b = v2;
          this._props.push(p2);
        }
      },
      render: function render(ratio, data) {
        var pt4 = data._pt;
        while (pt4) {
          _reverting ? pt4.set(pt4.t, pt4.p, pt4.b, pt4) : pt4.r(ratio, pt4.d);
          pt4 = pt4._next;
        }
      }
    }, {
      name: "endArray",
      headless: 1,
      init: function init2(target, value) {
        var i2 = value.length;
        while (i2--) {
          this.add(target, i2, target[i2] || 0, value[i2], 0, 0, 0, 0, 0, 1);
        }
      }
    }, _buildModifierPlugin("roundProps", _roundModifier), _buildModifierPlugin("modifiers"), _buildModifierPlugin("snap", snap)) || _gsap;
    Tween.version = Timeline.version = gsap.version = "3.15.0";
    _coreReady = 1;
    _windowExists() && _wake();
    Power0 = _easeMap.Power0;
    Power1 = _easeMap.Power1;
    Power2 = _easeMap.Power2;
    Power3 = _easeMap.Power3;
    Power4 = _easeMap.Power4;
    Linear = _easeMap.Linear;
    Quad = _easeMap.Quad;
    Cubic = _easeMap.Cubic;
    Quart = _easeMap.Quart;
    Quint = _easeMap.Quint;
    Strong = _easeMap.Strong;
    Elastic = _easeMap.Elastic;
    Back = _easeMap.Back;
    SteppedEase = _easeMap.SteppedEase;
    Bounce = _easeMap.Bounce;
    Sine = _easeMap.Sine;
    Expo = _easeMap.Expo;
    Circ = _easeMap.Circ;
  }
});

// node_modules/.pnpm/gsap@3.15.0/node_modules/gsap/CSSPlugin.js
var _win2, _doc2, _docElement, _pluginInitted, _tempDiv, _tempDivStyler, _recentSetterPlugin, _reverting2, _windowExists3, _transformProps, _RAD2DEG, _DEG2RAD, _atan2, _bigNum2, _capsExp, _horizontalExp, _complexExp, _propertyAliases, _renderCSSProp, _renderPropWithEnd, _renderCSSPropWithBeginning, _renderCSSPropWithBeginningAndEnd, _renderRoundedCSSProp, _renderNonTweeningValue, _renderNonTweeningValueOnlyAtEnd, _setterCSSStyle, _setterCSSProp, _setterTransform, _setterScale, _setterScaleWithRender, _setterTransformWithRender, _transformProp, _transformOriginProp, _saveStyle, _removeIndependentTransforms, _revertStyle, _getStyleSaver, _supports3D, _createElement, _getComputedProperty, _prefixes, _checkPropPrefix, _initCore, _getReparentedCloneBBox, _getAttributeFallbacks, _getBBox, _isSVG, _removeProperty, _addNonTweeningPT, _nonConvertibleUnits, _nonStandardLayouts, _convertToUnit, _get, _tweenComplexCSSString, _keywordToPercent, _convertKeywordsToPercentages, _renderClearProps, _specialProps, _identity2DMatrix, _rotationalProperties, _isNullTransform, _getComputedTransformMatrixAsArray, _getMatrix, _applySVGOrigin, _parseTransform, _firstTwoOnly, _addPxTranslate, _renderNon3DTransforms, _zeroDeg, _zeroPx, _endParenthesis, _renderCSSTransforms, _renderSVGTransforms, _addRotationalPropTween, _assign, _addRawTransformPTs, CSSPlugin;
var init_CSSPlugin = __esm({
  "node_modules/.pnpm/gsap@3.15.0/node_modules/gsap/CSSPlugin.js"() {
    init_gsap_core();
    _windowExists3 = function _windowExists4() {
      return typeof window !== "undefined";
    };
    _transformProps = {};
    _RAD2DEG = 180 / Math.PI;
    _DEG2RAD = Math.PI / 180;
    _atan2 = Math.atan2;
    _bigNum2 = 1e8;
    _capsExp = /([A-Z])/g;
    _horizontalExp = /(left|right|width|margin|padding|x)/i;
    _complexExp = /[\s,\(]\S/;
    _propertyAliases = {
      autoAlpha: "opacity,visibility",
      scale: "scaleX,scaleY",
      alpha: "opacity"
    };
    _renderCSSProp = function _renderCSSProp2(ratio, data) {
      return data.set(data.t, data.p, Math.round((data.s + data.c * ratio) * 1e4) / 1e4 + data.u, data);
    };
    _renderPropWithEnd = function _renderPropWithEnd2(ratio, data) {
      return data.set(data.t, data.p, ratio === 1 ? data.e : Math.round((data.s + data.c * ratio) * 1e4) / 1e4 + data.u, data);
    };
    _renderCSSPropWithBeginning = function _renderCSSPropWithBeginning2(ratio, data) {
      return data.set(data.t, data.p, ratio ? Math.round((data.s + data.c * ratio) * 1e4) / 1e4 + data.u : data.b, data);
    };
    _renderCSSPropWithBeginningAndEnd = function _renderCSSPropWithBeginningAndEnd2(ratio, data) {
      return data.set(data.t, data.p, ratio === 1 ? data.e : ratio ? Math.round((data.s + data.c * ratio) * 1e4) / 1e4 + data.u : data.b, data);
    };
    _renderRoundedCSSProp = function _renderRoundedCSSProp2(ratio, data) {
      var value = data.s + data.c * ratio;
      data.set(data.t, data.p, ~~(value + (value < 0 ? -0.5 : 0.5)) + data.u, data);
    };
    _renderNonTweeningValue = function _renderNonTweeningValue2(ratio, data) {
      return data.set(data.t, data.p, ratio ? data.e : data.b, data);
    };
    _renderNonTweeningValueOnlyAtEnd = function _renderNonTweeningValueOnlyAtEnd2(ratio, data) {
      return data.set(data.t, data.p, ratio !== 1 ? data.b : data.e, data);
    };
    _setterCSSStyle = function _setterCSSStyle2(target, property, value) {
      return target.style[property] = value;
    };
    _setterCSSProp = function _setterCSSProp2(target, property, value) {
      return target.style.setProperty(property, value);
    };
    _setterTransform = function _setterTransform2(target, property, value) {
      return target._gsap[property] = value;
    };
    _setterScale = function _setterScale2(target, property, value) {
      return target._gsap.scaleX = target._gsap.scaleY = value;
    };
    _setterScaleWithRender = function _setterScaleWithRender2(target, property, value, data, ratio) {
      var cache = target._gsap;
      cache.scaleX = cache.scaleY = value;
      cache.renderTransform(ratio, cache);
    };
    _setterTransformWithRender = function _setterTransformWithRender2(target, property, value, data, ratio) {
      var cache = target._gsap;
      cache[property] = value;
      cache.renderTransform(ratio, cache);
    };
    _transformProp = "transform";
    _transformOriginProp = _transformProp + "Origin";
    _saveStyle = function _saveStyle2(property, isNotCSS) {
      var _this = this;
      var target = this.target, style = target.style, cache = target._gsap;
      if (property in _transformProps && style) {
        this.tfm = this.tfm || {};
        if (property !== "transform") {
          property = _propertyAliases[property] || property;
          ~property.indexOf(",") ? property.split(",").forEach(function(a) {
            return _this.tfm[a] = _get(target, a);
          }) : this.tfm[property] = cache.x ? cache[property] : _get(target, property);
          property === _transformOriginProp && (this.tfm.zOrigin = cache.zOrigin);
        } else {
          return _propertyAliases.transform.split(",").forEach(function(p2) {
            return _saveStyle2.call(_this, p2, isNotCSS);
          });
        }
        if (this.props.indexOf(_transformProp) >= 0) {
          return;
        }
        if (cache.svg) {
          this.svgo = target.getAttribute("data-svg-origin");
          this.props.push(_transformOriginProp, isNotCSS, "");
        }
        property = _transformProp;
      }
      (style || isNotCSS) && this.props.push(property, isNotCSS, style[property]);
    };
    _removeIndependentTransforms = function _removeIndependentTransforms2(style) {
      if (style.translate) {
        style.removeProperty("translate");
        style.removeProperty("scale");
        style.removeProperty("rotate");
      }
    };
    _revertStyle = function _revertStyle2() {
      var props = this.props, target = this.target, style = target.style, cache = target._gsap, i2, p2;
      for (i2 = 0; i2 < props.length; i2 += 3) {
        if (!props[i2 + 1]) {
          props[i2 + 2] ? style[props[i2]] = props[i2 + 2] : style.removeProperty(props[i2].substr(0, 2) === "--" ? props[i2] : props[i2].replace(_capsExp, "-$1").toLowerCase());
        } else if (props[i2 + 1] === 2) {
          target[props[i2]](props[i2 + 2]);
        } else {
          target[props[i2]] = props[i2 + 2];
        }
      }
      if (this.tfm) {
        for (p2 in this.tfm) {
          cache[p2] = this.tfm[p2];
        }
        if (cache.svg) {
          cache.renderTransform();
          target.setAttribute("data-svg-origin", this.svgo || "");
        }
        i2 = _reverting2();
        if ((!i2 || !i2.isStart) && !style[_transformProp]) {
          _removeIndependentTransforms(style);
          if (cache.zOrigin && style[_transformOriginProp]) {
            style[_transformOriginProp] += " " + cache.zOrigin + "px";
            cache.zOrigin = 0;
            cache.renderTransform();
          }
          cache.uncache = 1;
        }
      }
    };
    _getStyleSaver = function _getStyleSaver2(target, properties) {
      var saver = {
        target,
        props: [],
        revert: _revertStyle,
        save: _saveStyle
      };
      target._gsap || gsap.core.getCache(target);
      properties && target.style && target.nodeType && properties.split(",").forEach(function(p2) {
        return saver.save(p2);
      });
      return saver;
    };
    _createElement = function _createElement2(type, ns3) {
      var e2 = _doc2.createElementNS ? _doc2.createElementNS((ns3 || "http://www.w3.org/1999/xhtml").replace(/^https/, "http"), type) : _doc2.createElement(type);
      return e2 && e2.style ? e2 : _doc2.createElement(type);
    };
    _getComputedProperty = function _getComputedProperty2(target, property, skipPrefixFallback) {
      var cs3 = getComputedStyle(target);
      return cs3[property] || cs3.getPropertyValue(property.replace(_capsExp, "-$1").toLowerCase()) || cs3.getPropertyValue(property) || !skipPrefixFallback && _getComputedProperty2(target, _checkPropPrefix(property) || property, 1) || "";
    };
    _prefixes = "O,Moz,ms,Ms,Webkit".split(",");
    _checkPropPrefix = function _checkPropPrefix2(property, element, preferPrefix) {
      var e2 = element || _tempDiv, s2 = e2.style, i2 = 5;
      if (property in s2 && !preferPrefix) {
        return property;
      }
      property = property.charAt(0).toUpperCase() + property.substr(1);
      while (i2-- && !(_prefixes[i2] + property in s2)) {
      }
      return i2 < 0 ? null : (i2 === 3 ? "ms" : i2 >= 0 ? _prefixes[i2] : "") + property;
    };
    _initCore = function _initCore2() {
      if (_windowExists3() && window.document) {
        _win2 = window;
        _doc2 = _win2.document;
        _docElement = _doc2.documentElement;
        _tempDiv = _createElement("div") || {
          style: {}
        };
        _tempDivStyler = _createElement("div");
        _transformProp = _checkPropPrefix(_transformProp);
        _transformOriginProp = _transformProp + "Origin";
        _tempDiv.style.cssText = "border-width:0;line-height:0;position:absolute;padding:0";
        _supports3D = !!_checkPropPrefix("perspective");
        _reverting2 = gsap.core.reverting;
        _pluginInitted = 1;
      }
    };
    _getReparentedCloneBBox = function _getReparentedCloneBBox2(target) {
      var owner = target.ownerSVGElement, svg = _createElement("svg", owner && owner.getAttribute("xmlns") || "http://www.w3.org/2000/svg"), clone = target.cloneNode(true), bbox;
      clone.style.display = "block";
      svg.appendChild(clone);
      _docElement.appendChild(svg);
      try {
        bbox = clone.getBBox();
      } catch (e2) {
      }
      svg.removeChild(clone);
      _docElement.removeChild(svg);
      return bbox;
    };
    _getAttributeFallbacks = function _getAttributeFallbacks2(target, attributesArray) {
      var i2 = attributesArray.length;
      while (i2--) {
        if (target.hasAttribute(attributesArray[i2])) {
          return target.getAttribute(attributesArray[i2]);
        }
      }
    };
    _getBBox = function _getBBox2(target) {
      var bounds, cloned;
      try {
        bounds = target.getBBox();
      } catch (error) {
        bounds = _getReparentedCloneBBox(target);
        cloned = 1;
      }
      bounds && (bounds.width || bounds.height) || cloned || (bounds = _getReparentedCloneBBox(target));
      return bounds && !bounds.width && !bounds.x && !bounds.y ? {
        x: +_getAttributeFallbacks(target, ["x", "cx", "x1"]) || 0,
        y: +_getAttributeFallbacks(target, ["y", "cy", "y1"]) || 0,
        width: 0,
        height: 0
      } : bounds;
    };
    _isSVG = function _isSVG2(e2) {
      return !!(e2.getCTM && (!e2.parentNode || e2.ownerSVGElement) && _getBBox(e2));
    };
    _removeProperty = function _removeProperty2(target, property) {
      if (property) {
        var style = target.style, first2Chars;
        if (property in _transformProps && property !== _transformOriginProp) {
          property = _transformProp;
        }
        if (style.removeProperty) {
          first2Chars = property.substr(0, 2);
          if (first2Chars === "ms" || property.substr(0, 6) === "webkit") {
            property = "-" + property;
          }
          style.removeProperty(first2Chars === "--" ? property : property.replace(_capsExp, "-$1").toLowerCase());
        } else {
          style.removeAttribute(property);
        }
      }
    };
    _addNonTweeningPT = function _addNonTweeningPT2(plugin, target, property, beginning, end, onlySetAtEnd) {
      var pt4 = new PropTween(plugin._pt, target, property, 0, 1, onlySetAtEnd ? _renderNonTweeningValueOnlyAtEnd : _renderNonTweeningValue);
      plugin._pt = pt4;
      pt4.b = beginning;
      pt4.e = end;
      plugin._props.push(property);
      return pt4;
    };
    _nonConvertibleUnits = {
      deg: 1,
      rad: 1,
      turn: 1
    };
    _nonStandardLayouts = {
      grid: 1,
      flex: 1
    };
    _convertToUnit = function _convertToUnit2(target, property, value, unit) {
      var curValue = parseFloat(value) || 0, curUnit = (value + "").trim().substr((curValue + "").length) || "px", style = _tempDiv.style, horizontal = _horizontalExp.test(property), isRootSVG = target.tagName.toLowerCase() === "svg", measureProperty = (isRootSVG ? "client" : "offset") + (horizontal ? "Width" : "Height"), amount = 100, toPixels = unit === "px", toPercent = unit === "%", px, parent, cache, isSVG;
      if (unit === curUnit || !curValue || _nonConvertibleUnits[unit] || _nonConvertibleUnits[curUnit]) {
        return curValue;
      }
      curUnit !== "px" && !toPixels && (curValue = _convertToUnit2(target, property, value, "px"));
      isSVG = target.getCTM && _isSVG(target);
      if ((toPercent || curUnit === "%") && (_transformProps[property] || ~property.indexOf("adius"))) {
        px = isSVG ? target.getBBox()[horizontal ? "width" : "height"] : target[measureProperty];
        return _round(toPercent ? curValue / px * amount : curValue / 100 * px);
      }
      style[horizontal ? "width" : "height"] = amount + (toPixels ? curUnit : unit);
      parent = unit !== "rem" && ~property.indexOf("adius") || unit === "em" && target.appendChild && !isRootSVG ? target : target.parentNode;
      if (isSVG) {
        parent = (target.ownerSVGElement || {}).parentNode;
      }
      if (!parent || parent === _doc2 || !parent.appendChild) {
        parent = _doc2.body;
      }
      cache = parent._gsap;
      if (cache && toPercent && cache.width && horizontal && cache.time === _ticker.time && !cache.uncache) {
        return _round(curValue / cache.width * amount);
      } else {
        if (toPercent && (property === "height" || property === "width")) {
          var v2 = target.style[property];
          target.style[property] = amount + unit;
          px = target[measureProperty];
          v2 ? target.style[property] = v2 : _removeProperty(target, property);
        } else {
          (toPercent || curUnit === "%") && !_nonStandardLayouts[_getComputedProperty(parent, "display")] && (style.position = _getComputedProperty(target, "position"));
          parent === target && (style.position = "static");
          parent.appendChild(_tempDiv);
          px = _tempDiv[measureProperty];
          parent.removeChild(_tempDiv);
          style.position = "absolute";
        }
        if (horizontal && toPercent) {
          cache = _getCache(parent);
          cache.time = _ticker.time;
          cache.width = parent[measureProperty];
        }
      }
      return _round(toPixels ? px * curValue / amount : px && curValue ? amount / px * curValue : 0);
    };
    _get = function _get2(target, property, unit, uncache) {
      var value;
      _pluginInitted || _initCore();
      if (property in _propertyAliases && property !== "transform") {
        property = _propertyAliases[property];
        if (~property.indexOf(",")) {
          property = property.split(",")[0];
        }
      }
      if (_transformProps[property] && property !== "transform") {
        value = _parseTransform(target, uncache);
        value = property !== "transformOrigin" ? value[property] : value.svg ? value.origin : _firstTwoOnly(_getComputedProperty(target, _transformOriginProp)) + " " + value.zOrigin + "px";
      } else {
        value = target.style[property];
        if (!value || value === "auto" || uncache || ~(value + "").indexOf("calc(")) {
          value = _specialProps[property] && _specialProps[property](target, property, unit) || _getComputedProperty(target, property) || _getProperty(target, property) || (property === "opacity" ? 1 : 0);
        }
      }
      return unit && !~(value + "").trim().indexOf(" ") ? _convertToUnit(target, property, value, unit) + unit : value;
    };
    _tweenComplexCSSString = function _tweenComplexCSSString2(target, prop, start, end) {
      if (!start || start === "none") {
        var p2 = _checkPropPrefix(prop, target, 1), s2 = p2 && _getComputedProperty(target, p2, 1);
        if (s2 && s2 !== start) {
          prop = p2;
          start = s2;
        } else if (prop === "borderColor") {
          start = _getComputedProperty(target, "borderTopColor");
        }
      }
      var pt4 = new PropTween(this._pt, target.style, prop, 0, 1, _renderComplexString), index = 0, matchIndex = 0, a, result, startValues, startNum, color, startValue, endValue, endNum, chunk, endUnit, startUnit, endValues;
      pt4.b = start;
      pt4.e = end;
      start += "";
      end += "";
      if (end.substring(0, 6) === "var(--") {
        end = _getComputedProperty(target, end.substring(4, end.indexOf(")")));
      }
      if (end === "auto") {
        startValue = target.style[prop];
        target.style[prop] = end;
        end = _getComputedProperty(target, prop) || end;
        startValue ? target.style[prop] = startValue : _removeProperty(target, prop);
      }
      a = [start, end];
      _colorStringFilter(a);
      start = a[0];
      end = a[1];
      startValues = start.match(_numWithUnitExp) || [];
      endValues = end.match(_numWithUnitExp) || [];
      if (endValues.length) {
        while (result = _numWithUnitExp.exec(end)) {
          endValue = result[0];
          chunk = end.substring(index, result.index);
          if (color) {
            color = (color + 1) % 5;
          } else if (chunk.substr(-5) === "rgba(" || chunk.substr(-5) === "hsla(") {
            color = 1;
          }
          if (endValue !== (startValue = startValues[matchIndex++] || "")) {
            startNum = parseFloat(startValue) || 0;
            startUnit = startValue.substr((startNum + "").length);
            endValue.charAt(1) === "=" && (endValue = _parseRelative(startNum, endValue) + startUnit);
            endNum = parseFloat(endValue);
            endUnit = endValue.substr((endNum + "").length);
            index = _numWithUnitExp.lastIndex - endUnit.length;
            if (!endUnit) {
              endUnit = endUnit || _config.units[prop] || startUnit;
              if (index === end.length) {
                end += endUnit;
                pt4.e += endUnit;
              }
            }
            if (startUnit !== endUnit) {
              startNum = _convertToUnit(target, prop, startValue, endUnit) || 0;
            }
            pt4._pt = {
              _next: pt4._pt,
              p: chunk || matchIndex === 1 ? chunk : ",",
              //note: SVG spec allows omission of comma/space when a negative sign is wedged between two numbers, like 2.5-5.3 instead of 2.5,-5.3 but when tweening, the negative value may switch to positive, so we insert the comma just in case.
              s: startNum,
              c: endNum - startNum,
              m: color && color < 4 || prop === "zIndex" ? Math.round : 0
            };
          }
        }
        pt4.c = index < end.length ? end.substring(index, end.length) : "";
      } else {
        pt4.r = prop === "display" && end === "none" ? _renderNonTweeningValueOnlyAtEnd : _renderNonTweeningValue;
      }
      _relExp.test(end) && (pt4.e = 0);
      this._pt = pt4;
      return pt4;
    };
    _keywordToPercent = {
      top: "0%",
      bottom: "100%",
      left: "0%",
      right: "100%",
      center: "50%"
    };
    _convertKeywordsToPercentages = function _convertKeywordsToPercentages2(value) {
      var split = value.split(" "), x2 = split[0], y2 = split[1] || "50%";
      if (x2 === "top" || x2 === "bottom" || y2 === "left" || y2 === "right") {
        value = x2;
        x2 = y2;
        y2 = value;
      }
      split[0] = _keywordToPercent[x2] || x2;
      split[1] = _keywordToPercent[y2] || y2;
      return split.join(" ");
    };
    _renderClearProps = function _renderClearProps2(ratio, data) {
      if (data.tween && data.tween._time === data.tween._dur) {
        var target = data.t, style = target.style, props = data.u, cache = target._gsap, prop, clearTransforms, i2;
        if (props === "all" || props === true) {
          style.cssText = "";
          clearTransforms = 1;
        } else {
          props = props.split(",");
          i2 = props.length;
          while (--i2 > -1) {
            prop = props[i2];
            if (_transformProps[prop]) {
              clearTransforms = 1;
              prop = prop === "transformOrigin" ? _transformOriginProp : _transformProp;
            }
            _removeProperty(target, prop);
          }
        }
        if (clearTransforms) {
          _removeProperty(target, _transformProp);
          if (cache) {
            cache.svg && target.removeAttribute("transform");
            style.scale = style.rotate = style.translate = "none";
            _parseTransform(target, 1);
            cache.uncache = 1;
            _removeIndependentTransforms(style);
          }
        }
      }
    };
    _specialProps = {
      clearProps: function clearProps(plugin, target, property, endValue, tween) {
        if (tween.data !== "isFromStart") {
          var pt4 = plugin._pt = new PropTween(plugin._pt, target, property, 0, 0, _renderClearProps);
          pt4.u = endValue;
          pt4.pr = -10;
          pt4.tween = tween;
          plugin._props.push(property);
          return 1;
        }
      }
      /* className feature (about 0.4kb gzipped).
      , className(plugin, target, property, endValue, tween) {
      	let _renderClassName = (ratio, data) => {
      			data.css.render(ratio, data.css);
      			if (!ratio || ratio === 1) {
      				let inline = data.rmv,
      					target = data.t,
      					p;
      				target.setAttribute("class", ratio ? data.e : data.b);
      				for (p in inline) {
      					_removeProperty(target, p);
      				}
      			}
      		},
      		_getAllStyles = (target) => {
      			let styles = {},
      				computed = getComputedStyle(target),
      				p;
      			for (p in computed) {
      				if (isNaN(p) && p !== "cssText" && p !== "length") {
      					styles[p] = computed[p];
      				}
      			}
      			_setDefaults(styles, _parseTransform(target, 1));
      			return styles;
      		},
      		startClassList = target.getAttribute("class"),
      		style = target.style,
      		cssText = style.cssText,
      		cache = target._gsap,
      		classPT = cache.classPT,
      		inlineToRemoveAtEnd = {},
      		data = {t:target, plugin:plugin, rmv:inlineToRemoveAtEnd, b:startClassList, e:(endValue.charAt(1) !== "=") ? endValue : startClassList.replace(new RegExp("(?:\\s|^)" + endValue.substr(2) + "(?![\\w-])"), "") + ((endValue.charAt(0) === "+") ? " " + endValue.substr(2) : "")},
      		changingVars = {},
      		startVars = _getAllStyles(target),
      		transformRelated = /(transform|perspective)/i,
      		endVars, p;
      	if (classPT) {
      		classPT.r(1, classPT.d);
      		_removeLinkedListItem(classPT.d.plugin, classPT, "_pt");
      	}
      	target.setAttribute("class", data.e);
      	endVars = _getAllStyles(target, true);
      	target.setAttribute("class", startClassList);
      	for (p in endVars) {
      		if (endVars[p] !== startVars[p] && !transformRelated.test(p)) {
      			changingVars[p] = endVars[p];
      			if (!style[p] && style[p] !== "0") {
      				inlineToRemoveAtEnd[p] = 1;
      			}
      		}
      	}
      	cache.classPT = plugin._pt = new PropTween(plugin._pt, target, "className", 0, 0, _renderClassName, data, 0, -11);
      	if (style.cssText !== cssText) { //only apply if things change. Otherwise, in cases like a background-image that's pulled dynamically, it could cause a refresh. See https://gsap.com/forums/topic/20368-possible-gsap-bug-switching-classnames-in-chrome/.
      		style.cssText = cssText; //we recorded cssText before we swapped classes and ran _getAllStyles() because in cases when a className tween is overwritten, we remove all the related tweening properties from that class change (otherwise class-specific stuff can't override properties we've directly set on the target's style object due to specificity).
      	}
      	_parseTransform(target, true); //to clear the caching of transforms
      	data.css = new gsap.plugins.css();
      	data.css.init(target, changingVars, tween);
      	plugin._props.push(...data.css._props);
      	return 1;
      }
      */
    };
    _identity2DMatrix = [1, 0, 0, 1, 0, 0];
    _rotationalProperties = {};
    _isNullTransform = function _isNullTransform2(value) {
      return value === "matrix(1, 0, 0, 1, 0, 0)" || value === "none" || !value;
    };
    _getComputedTransformMatrixAsArray = function _getComputedTransformMatrixAsArray2(target) {
      var matrixString = _getComputedProperty(target, _transformProp);
      return _isNullTransform(matrixString) ? _identity2DMatrix : matrixString.substr(7).match(_numExp).map(_round);
    };
    _getMatrix = function _getMatrix2(target, force2D) {
      var cache = target._gsap || _getCache(target), style = target.style, matrix = _getComputedTransformMatrixAsArray(target), parent, nextSibling, temp, addedToDOM;
      if (cache.svg && target.getAttribute("transform")) {
        temp = target.transform.baseVal.consolidate().matrix;
        matrix = [temp.a, temp.b, temp.c, temp.d, temp.e, temp.f];
        return matrix.join(",") === "1,0,0,1,0,0" ? _identity2DMatrix : matrix;
      } else if (matrix === _identity2DMatrix && !target.offsetParent && target !== _docElement && !cache.svg) {
        temp = style.display;
        style.display = "block";
        parent = target.parentNode;
        if (!parent || !target.offsetParent && !target.getBoundingClientRect().width) {
          addedToDOM = 1;
          nextSibling = target.nextElementSibling;
          _docElement.appendChild(target);
        }
        matrix = _getComputedTransformMatrixAsArray(target);
        temp ? style.display = temp : _removeProperty(target, "display");
        if (addedToDOM) {
          nextSibling ? parent.insertBefore(target, nextSibling) : parent ? parent.appendChild(target) : _docElement.removeChild(target);
        }
      }
      return force2D && matrix.length > 6 ? [matrix[0], matrix[1], matrix[4], matrix[5], matrix[12], matrix[13]] : matrix;
    };
    _applySVGOrigin = function _applySVGOrigin2(target, origin, originIsAbsolute, smooth, matrixArray, pluginToAddPropTweensTo) {
      var cache = target._gsap, matrix = matrixArray || _getMatrix(target, true), xOriginOld = cache.xOrigin || 0, yOriginOld = cache.yOrigin || 0, xOffsetOld = cache.xOffset || 0, yOffsetOld = cache.yOffset || 0, a = matrix[0], b2 = matrix[1], c = matrix[2], d2 = matrix[3], tx = matrix[4], ty = matrix[5], originSplit = origin.split(" "), xOrigin = parseFloat(originSplit[0]) || 0, yOrigin = parseFloat(originSplit[1]) || 0, bounds, determinant, x2, y2;
      if (!originIsAbsolute) {
        bounds = _getBBox(target);
        xOrigin = bounds.x + (~originSplit[0].indexOf("%") ? xOrigin / 100 * bounds.width : xOrigin);
        yOrigin = bounds.y + (~(originSplit[1] || originSplit[0]).indexOf("%") ? yOrigin / 100 * bounds.height : yOrigin);
      } else if (matrix !== _identity2DMatrix && (determinant = a * d2 - b2 * c)) {
        x2 = xOrigin * (d2 / determinant) + yOrigin * (-c / determinant) + (c * ty - d2 * tx) / determinant;
        y2 = xOrigin * (-b2 / determinant) + yOrigin * (a / determinant) - (a * ty - b2 * tx) / determinant;
        xOrigin = x2;
        yOrigin = y2;
      }
      if (smooth || smooth !== false && cache.smooth) {
        tx = xOrigin - xOriginOld;
        ty = yOrigin - yOriginOld;
        cache.xOffset = xOffsetOld + (tx * a + ty * c) - tx;
        cache.yOffset = yOffsetOld + (tx * b2 + ty * d2) - ty;
      } else {
        cache.xOffset = cache.yOffset = 0;
      }
      cache.xOrigin = xOrigin;
      cache.yOrigin = yOrigin;
      cache.smooth = !!smooth;
      cache.origin = origin;
      cache.originIsAbsolute = !!originIsAbsolute;
      target.style[_transformOriginProp] = "0px 0px";
      if (pluginToAddPropTweensTo) {
        _addNonTweeningPT(pluginToAddPropTweensTo, cache, "xOrigin", xOriginOld, xOrigin);
        _addNonTweeningPT(pluginToAddPropTweensTo, cache, "yOrigin", yOriginOld, yOrigin);
        _addNonTweeningPT(pluginToAddPropTweensTo, cache, "xOffset", xOffsetOld, cache.xOffset);
        _addNonTweeningPT(pluginToAddPropTweensTo, cache, "yOffset", yOffsetOld, cache.yOffset);
      }
      target.setAttribute("data-svg-origin", xOrigin + " " + yOrigin);
    };
    _parseTransform = function _parseTransform2(target, uncache) {
      var cache = target._gsap || new GSCache(target);
      if ("x" in cache && !uncache && !cache.uncache) {
        return cache;
      }
      var style = target.style, invertedScaleX = cache.scaleX < 0, px = "px", deg = "deg", cs3 = getComputedStyle(target), origin = _getComputedProperty(target, _transformOriginProp) || "0", x2, y2, z5, scaleX, scaleY, rotation, rotationX, rotationY, skewX2, skewY2, perspective, xOrigin, yOrigin, matrix, angle, cos, sin, a, b2, c, d2, a12, a22, t1, t2, t3, a13, a23, a33, a42, a43, a32;
      x2 = y2 = z5 = rotation = rotationX = rotationY = skewX2 = skewY2 = perspective = 0;
      scaleX = scaleY = 1;
      cache.svg = !!(target.getCTM && _isSVG(target));
      if (cs3.translate) {
        if (cs3.translate !== "none" || cs3.scale !== "none" || cs3.rotate !== "none") {
          style[_transformProp] = (cs3.translate !== "none" ? "translate3d(" + (cs3.translate + " 0 0").split(" ").slice(0, 3).join(", ") + ") " : "") + (cs3.rotate !== "none" ? "rotate(" + cs3.rotate + ") " : "") + (cs3.scale !== "none" ? "scale(" + cs3.scale.split(" ").join(",") + ") " : "") + (cs3[_transformProp] !== "none" ? cs3[_transformProp] : "");
        }
        style.scale = style.rotate = style.translate = "none";
      }
      matrix = _getMatrix(target, cache.svg);
      if (cache.svg) {
        if (cache.uncache) {
          t2 = target.getBBox();
          origin = cache.xOrigin - t2.x + "px " + (cache.yOrigin - t2.y) + "px";
          t1 = "";
        } else {
          t1 = !uncache && target.getAttribute("data-svg-origin");
        }
        _applySVGOrigin(target, t1 || origin, !!t1 || cache.originIsAbsolute, cache.smooth !== false, matrix);
      }
      xOrigin = cache.xOrigin || 0;
      yOrigin = cache.yOrigin || 0;
      if (matrix !== _identity2DMatrix) {
        a = matrix[0];
        b2 = matrix[1];
        c = matrix[2];
        d2 = matrix[3];
        x2 = a12 = matrix[4];
        y2 = a22 = matrix[5];
        if (matrix.length === 6) {
          scaleX = Math.sqrt(a * a + b2 * b2);
          scaleY = Math.sqrt(d2 * d2 + c * c);
          rotation = a || b2 ? _atan2(b2, a) * _RAD2DEG : 0;
          skewX2 = c || d2 ? _atan2(c, d2) * _RAD2DEG + rotation : 0;
          skewX2 && (scaleY *= Math.abs(Math.cos(skewX2 * _DEG2RAD)));
          if (cache.svg) {
            x2 -= xOrigin - (xOrigin * a + yOrigin * c);
            y2 -= yOrigin - (xOrigin * b2 + yOrigin * d2);
          }
        } else {
          a32 = matrix[6];
          a42 = matrix[7];
          a13 = matrix[8];
          a23 = matrix[9];
          a33 = matrix[10];
          a43 = matrix[11];
          x2 = matrix[12];
          y2 = matrix[13];
          z5 = matrix[14];
          angle = _atan2(a32, a33);
          rotationX = angle * _RAD2DEG;
          if (angle) {
            cos = Math.cos(-angle);
            sin = Math.sin(-angle);
            t1 = a12 * cos + a13 * sin;
            t2 = a22 * cos + a23 * sin;
            t3 = a32 * cos + a33 * sin;
            a13 = a12 * -sin + a13 * cos;
            a23 = a22 * -sin + a23 * cos;
            a33 = a32 * -sin + a33 * cos;
            a43 = a42 * -sin + a43 * cos;
            a12 = t1;
            a22 = t2;
            a32 = t3;
          }
          angle = _atan2(-c, a33);
          rotationY = angle * _RAD2DEG;
          if (angle) {
            cos = Math.cos(-angle);
            sin = Math.sin(-angle);
            t1 = a * cos - a13 * sin;
            t2 = b2 * cos - a23 * sin;
            t3 = c * cos - a33 * sin;
            a43 = d2 * sin + a43 * cos;
            a = t1;
            b2 = t2;
            c = t3;
          }
          angle = _atan2(b2, a);
          rotation = angle * _RAD2DEG;
          if (angle) {
            cos = Math.cos(angle);
            sin = Math.sin(angle);
            t1 = a * cos + b2 * sin;
            t2 = a12 * cos + a22 * sin;
            b2 = b2 * cos - a * sin;
            a22 = a22 * cos - a12 * sin;
            a = t1;
            a12 = t2;
          }
          if (rotationX && Math.abs(rotationX) + Math.abs(rotation) > 359.9) {
            rotationX = rotation = 0;
            rotationY = 180 - rotationY;
          }
          scaleX = _round(Math.sqrt(a * a + b2 * b2 + c * c));
          scaleY = _round(Math.sqrt(a22 * a22 + a32 * a32));
          angle = _atan2(a12, a22);
          skewX2 = Math.abs(angle) > 2e-4 ? angle * _RAD2DEG : 0;
          perspective = a43 ? 1 / (a43 < 0 ? -a43 : a43) : 0;
        }
        if (cache.svg) {
          t1 = target.getAttribute("transform");
          cache.forceCSS = target.setAttribute("transform", "") || !_isNullTransform(_getComputedProperty(target, _transformProp));
          t1 && target.setAttribute("transform", t1);
        }
      }
      if (Math.abs(skewX2) > 90 && Math.abs(skewX2) < 270) {
        if (invertedScaleX) {
          scaleX *= -1;
          skewX2 += rotation <= 0 ? 180 : -180;
          rotation += rotation <= 0 ? 180 : -180;
        } else {
          scaleY *= -1;
          skewX2 += skewX2 <= 0 ? 180 : -180;
        }
      }
      uncache = uncache || cache.uncache;
      cache.x = x2 - ((cache.xPercent = x2 && (!uncache && cache.xPercent || (Math.round(target.offsetWidth / 2) === Math.round(-x2) ? -50 : 0))) ? target.offsetWidth * cache.xPercent / 100 : 0) + px;
      cache.y = y2 - ((cache.yPercent = y2 && (!uncache && cache.yPercent || (Math.round(target.offsetHeight / 2) === Math.round(-y2) ? -50 : 0))) ? target.offsetHeight * cache.yPercent / 100 : 0) + px;
      cache.z = z5 + px;
      cache.scaleX = _round(scaleX);
      cache.scaleY = _round(scaleY);
      cache.rotation = _round(rotation) + deg;
      cache.rotationX = _round(rotationX) + deg;
      cache.rotationY = _round(rotationY) + deg;
      cache.skewX = skewX2 + deg;
      cache.skewY = skewY2 + deg;
      cache.transformPerspective = perspective + px;
      if (cache.zOrigin = parseFloat(origin.split(" ")[2]) || !uncache && cache.zOrigin || 0) {
        style[_transformOriginProp] = _firstTwoOnly(origin);
      }
      cache.xOffset = cache.yOffset = 0;
      cache.force3D = _config.force3D;
      cache.renderTransform = cache.svg ? _renderSVGTransforms : _supports3D ? _renderCSSTransforms : _renderNon3DTransforms;
      cache.uncache = 0;
      return cache;
    };
    _firstTwoOnly = function _firstTwoOnly2(value) {
      return (value = value.split(" "))[0] + " " + value[1];
    };
    _addPxTranslate = function _addPxTranslate2(target, start, value) {
      var unit = getUnit(start);
      return _round(parseFloat(start) + parseFloat(_convertToUnit(target, "x", value + "px", unit))) + unit;
    };
    _renderNon3DTransforms = function _renderNon3DTransforms2(ratio, cache) {
      cache.z = "0px";
      cache.rotationY = cache.rotationX = "0deg";
      cache.force3D = 0;
      _renderCSSTransforms(ratio, cache);
    };
    _zeroDeg = "0deg";
    _zeroPx = "0px";
    _endParenthesis = ") ";
    _renderCSSTransforms = function _renderCSSTransforms2(ratio, cache) {
      var _ref = cache || this, xPercent = _ref.xPercent, yPercent = _ref.yPercent, x2 = _ref.x, y2 = _ref.y, z5 = _ref.z, rotation = _ref.rotation, rotationY = _ref.rotationY, rotationX = _ref.rotationX, skewX2 = _ref.skewX, skewY2 = _ref.skewY, scaleX = _ref.scaleX, scaleY = _ref.scaleY, transformPerspective = _ref.transformPerspective, force3D = _ref.force3D, target = _ref.target, zOrigin = _ref.zOrigin, transforms = "", use3D = force3D === "auto" && ratio && ratio !== 1 || force3D === true;
      if (zOrigin && (rotationX !== _zeroDeg || rotationY !== _zeroDeg)) {
        var angle = parseFloat(rotationY) * _DEG2RAD, a13 = Math.sin(angle), a33 = Math.cos(angle), cos;
        angle = parseFloat(rotationX) * _DEG2RAD;
        cos = Math.cos(angle);
        x2 = _addPxTranslate(target, x2, a13 * cos * -zOrigin);
        y2 = _addPxTranslate(target, y2, -Math.sin(angle) * -zOrigin);
        z5 = _addPxTranslate(target, z5, a33 * cos * -zOrigin + zOrigin);
      }
      if (transformPerspective !== _zeroPx) {
        transforms += "perspective(" + transformPerspective + _endParenthesis;
      }
      if (xPercent || yPercent) {
        transforms += "translate(" + xPercent + "%, " + yPercent + "%) ";
      }
      if (use3D || x2 !== _zeroPx || y2 !== _zeroPx || z5 !== _zeroPx) {
        transforms += z5 !== _zeroPx || use3D ? "translate3d(" + x2 + ", " + y2 + ", " + z5 + ") " : "translate(" + x2 + ", " + y2 + _endParenthesis;
      }
      if (rotation !== _zeroDeg) {
        transforms += "rotate(" + rotation + _endParenthesis;
      }
      if (rotationY !== _zeroDeg) {
        transforms += "rotateY(" + rotationY + _endParenthesis;
      }
      if (rotationX !== _zeroDeg) {
        transforms += "rotateX(" + rotationX + _endParenthesis;
      }
      if (skewX2 !== _zeroDeg || skewY2 !== _zeroDeg) {
        transforms += "skew(" + skewX2 + ", " + skewY2 + _endParenthesis;
      }
      if (scaleX !== 1 || scaleY !== 1) {
        transforms += "scale(" + scaleX + ", " + scaleY + _endParenthesis;
      }
      target.style[_transformProp] = transforms || "translate(0, 0)";
    };
    _renderSVGTransforms = function _renderSVGTransforms2(ratio, cache) {
      var _ref2 = cache || this, xPercent = _ref2.xPercent, yPercent = _ref2.yPercent, x2 = _ref2.x, y2 = _ref2.y, rotation = _ref2.rotation, skewX2 = _ref2.skewX, skewY2 = _ref2.skewY, scaleX = _ref2.scaleX, scaleY = _ref2.scaleY, target = _ref2.target, xOrigin = _ref2.xOrigin, yOrigin = _ref2.yOrigin, xOffset = _ref2.xOffset, yOffset = _ref2.yOffset, forceCSS = _ref2.forceCSS, tx = parseFloat(x2), ty = parseFloat(y2), a11, a21, a12, a22, temp;
      rotation = parseFloat(rotation);
      skewX2 = parseFloat(skewX2);
      skewY2 = parseFloat(skewY2);
      if (skewY2) {
        skewY2 = parseFloat(skewY2);
        skewX2 += skewY2;
        rotation += skewY2;
      }
      if (rotation || skewX2) {
        rotation *= _DEG2RAD;
        skewX2 *= _DEG2RAD;
        a11 = Math.cos(rotation) * scaleX;
        a21 = Math.sin(rotation) * scaleX;
        a12 = Math.sin(rotation - skewX2) * -scaleY;
        a22 = Math.cos(rotation - skewX2) * scaleY;
        if (skewX2) {
          skewY2 *= _DEG2RAD;
          temp = Math.tan(skewX2 - skewY2);
          temp = Math.sqrt(1 + temp * temp);
          a12 *= temp;
          a22 *= temp;
          if (skewY2) {
            temp = Math.tan(skewY2);
            temp = Math.sqrt(1 + temp * temp);
            a11 *= temp;
            a21 *= temp;
          }
        }
        a11 = _round(a11);
        a21 = _round(a21);
        a12 = _round(a12);
        a22 = _round(a22);
      } else {
        a11 = scaleX;
        a22 = scaleY;
        a21 = a12 = 0;
      }
      if (tx && !~(x2 + "").indexOf("px") || ty && !~(y2 + "").indexOf("px")) {
        tx = _convertToUnit(target, "x", x2, "px");
        ty = _convertToUnit(target, "y", y2, "px");
      }
      if (xOrigin || yOrigin || xOffset || yOffset) {
        tx = _round(tx + xOrigin - (xOrigin * a11 + yOrigin * a12) + xOffset);
        ty = _round(ty + yOrigin - (xOrigin * a21 + yOrigin * a22) + yOffset);
      }
      if (xPercent || yPercent) {
        temp = target.getBBox();
        tx = _round(tx + xPercent / 100 * temp.width);
        ty = _round(ty + yPercent / 100 * temp.height);
      }
      temp = "matrix(" + a11 + "," + a21 + "," + a12 + "," + a22 + "," + tx + "," + ty + ")";
      target.setAttribute("transform", temp);
      forceCSS && (target.style[_transformProp] = temp);
    };
    _addRotationalPropTween = function _addRotationalPropTween2(plugin, target, property, startNum, endValue) {
      var cap = 360, isString = _isString(endValue), endNum = parseFloat(endValue) * (isString && ~endValue.indexOf("rad") ? _RAD2DEG : 1), change = endNum - startNum, finalValue = startNum + change + "deg", direction, pt4;
      if (isString) {
        direction = endValue.split("_")[1];
        if (direction === "short") {
          change %= cap;
          if (change !== change % (cap / 2)) {
            change += change < 0 ? cap : -cap;
          }
        }
        if (direction === "cw" && change < 0) {
          change = (change + cap * _bigNum2) % cap - ~~(change / cap) * cap;
        } else if (direction === "ccw" && change > 0) {
          change = (change - cap * _bigNum2) % cap - ~~(change / cap) * cap;
        }
      }
      plugin._pt = pt4 = new PropTween(plugin._pt, target, property, startNum, change, _renderPropWithEnd);
      pt4.e = finalValue;
      pt4.u = "deg";
      plugin._props.push(property);
      return pt4;
    };
    _assign = function _assign2(target, source) {
      for (var p2 in source) {
        target[p2] = source[p2];
      }
      return target;
    };
    _addRawTransformPTs = function _addRawTransformPTs2(plugin, transforms, target) {
      var startCache = _assign({}, target._gsap), exclude = "perspective,force3D,transformOrigin,svgOrigin", style = target.style, endCache, p2, startValue, endValue, startNum, endNum, startUnit, endUnit;
      if (startCache.svg) {
        startValue = target.getAttribute("transform");
        target.setAttribute("transform", "");
        style[_transformProp] = transforms;
        endCache = _parseTransform(target, 1);
        _removeProperty(target, _transformProp);
        target.setAttribute("transform", startValue);
      } else {
        startValue = getComputedStyle(target)[_transformProp];
        style[_transformProp] = transforms;
        endCache = _parseTransform(target, 1);
        style[_transformProp] = startValue;
      }
      for (p2 in _transformProps) {
        startValue = startCache[p2];
        endValue = endCache[p2];
        if (startValue !== endValue && exclude.indexOf(p2) < 0) {
          startUnit = getUnit(startValue);
          endUnit = getUnit(endValue);
          startNum = startUnit !== endUnit ? _convertToUnit(target, p2, startValue, endUnit) : parseFloat(startValue);
          endNum = parseFloat(endValue);
          plugin._pt = new PropTween(plugin._pt, endCache, p2, startNum, endNum - startNum, _renderCSSProp);
          plugin._pt.u = endUnit || 0;
          plugin._props.push(p2);
        }
      }
      _assign(endCache, startCache);
    };
    _forEachName("padding,margin,Width,Radius", function(name, index) {
      var t2 = "Top", r3 = "Right", b2 = "Bottom", l2 = "Left", props = (index < 3 ? [t2, r3, b2, l2] : [t2 + l2, t2 + r3, b2 + r3, b2 + l2]).map(function(side) {
        return index < 2 ? name + side : "border" + side + name;
      });
      _specialProps[index > 1 ? "border" + name : name] = function(plugin, target, property, endValue, tween) {
        var a, vars;
        if (arguments.length < 4) {
          a = props.map(function(prop) {
            return _get(plugin, prop, property);
          });
          vars = a.join(" ");
          return vars.split(a[0]).length === 5 ? a[0] : vars;
        }
        a = (endValue + "").split(" ");
        vars = {};
        props.forEach(function(prop, i2) {
          return vars[prop] = a[i2] = a[i2] || a[(i2 - 1) / 2 | 0];
        });
        plugin.init(target, vars, tween);
      };
    });
    CSSPlugin = {
      name: "css",
      register: _initCore,
      targetTest: function targetTest(target) {
        return target.style && target.nodeType;
      },
      init: function init3(target, vars, tween, index, targets) {
        var props = this._props, style = target.style, startAt = tween.vars.startAt, startValue, endValue, endNum, startNum, type, specialProp, p2, startUnit, endUnit, relative, isTransformRelated, transformPropTween, cache, smooth, hasPriority, inlineProps, finalTransformValue;
        _pluginInitted || _initCore();
        this.styles = this.styles || _getStyleSaver(target);
        inlineProps = this.styles.props;
        this.tween = tween;
        for (p2 in vars) {
          if (p2 === "autoRound") {
            continue;
          }
          endValue = vars[p2];
          if (_plugins[p2] && _checkPlugin(p2, vars, tween, index, target, targets)) {
            continue;
          }
          type = typeof endValue;
          specialProp = _specialProps[p2];
          if (type === "function") {
            endValue = endValue.call(tween, index, target, targets);
            type = typeof endValue;
          }
          if (type === "string" && ~endValue.indexOf("random(")) {
            endValue = _replaceRandom(endValue);
          }
          if (specialProp) {
            specialProp(this, target, p2, endValue, tween) && (hasPriority = 1);
          } else if (p2.substr(0, 2) === "--") {
            startValue = (getComputedStyle(target).getPropertyValue(p2) + "").trim();
            endValue += "";
            _colorExp.lastIndex = 0;
            if (!_colorExp.test(startValue)) {
              startUnit = getUnit(startValue);
              endUnit = getUnit(endValue);
              endUnit ? startUnit !== endUnit && (startValue = _convertToUnit(target, p2, startValue, endUnit) + endUnit) : startUnit && (endValue += startUnit);
            }
            this.add(style, "setProperty", startValue, endValue, index, targets, 0, 0, p2);
            props.push(p2);
            inlineProps.push(p2, 0, style[p2]);
          } else if (type !== "undefined") {
            if (startAt && p2 in startAt) {
              startValue = typeof startAt[p2] === "function" ? startAt[p2].call(tween, index, target, targets) : startAt[p2];
              _isString(startValue) && ~startValue.indexOf("random(") && (startValue = _replaceRandom(startValue));
              getUnit(startValue + "") || startValue === "auto" || (startValue += _config.units[p2] || getUnit(_get(target, p2)) || "");
              (startValue + "").charAt(1) === "=" && (startValue = _get(target, p2));
            } else {
              startValue = _get(target, p2);
            }
            startNum = parseFloat(startValue);
            relative = type === "string" && endValue.charAt(1) === "=" && endValue.substr(0, 2);
            relative && (endValue = endValue.substr(2));
            endNum = parseFloat(endValue);
            if (p2 in _propertyAliases) {
              if (p2 === "autoAlpha") {
                if (startNum === 1 && _get(target, "visibility") === "hidden" && endNum) {
                  startNum = 0;
                }
                inlineProps.push("visibility", 0, style.visibility);
                _addNonTweeningPT(this, style, "visibility", startNum ? "inherit" : "hidden", endNum ? "inherit" : "hidden", !endNum);
              }
              if (p2 !== "scale" && p2 !== "transform") {
                p2 = _propertyAliases[p2];
                ~p2.indexOf(",") && (p2 = p2.split(",")[0]);
              }
            }
            isTransformRelated = p2 in _transformProps;
            if (isTransformRelated) {
              this.styles.save(p2);
              finalTransformValue = endValue;
              if (type === "string" && endValue.substring(0, 6) === "var(--") {
                endValue = _getComputedProperty(target, endValue.substring(4, endValue.indexOf(")")));
                if (endValue.substring(0, 5) === "calc(") {
                  var origPerspective = target.style.perspective;
                  target.style.perspective = endValue;
                  endValue = _getComputedProperty(target, "perspective");
                  origPerspective ? target.style.perspective = origPerspective : _removeProperty(target, "perspective");
                }
                endNum = parseFloat(endValue);
              }
              if (!transformPropTween) {
                cache = target._gsap;
                cache.renderTransform && !vars.parseTransform || _parseTransform(target, vars.parseTransform);
                smooth = vars.smoothOrigin !== false && cache.smooth;
                transformPropTween = this._pt = new PropTween(this._pt, style, _transformProp, 0, 1, cache.renderTransform, cache, 0, -1);
                transformPropTween.dep = 1;
              }
              if (p2 === "scale") {
                this._pt = new PropTween(this._pt, cache, "scaleY", cache.scaleY, (relative ? _parseRelative(cache.scaleY, relative + endNum) : endNum) - cache.scaleY || 0, _renderCSSProp);
                this._pt.u = 0;
                props.push("scaleY", p2);
                p2 += "X";
              } else if (p2 === "transformOrigin") {
                inlineProps.push(_transformOriginProp, 0, style[_transformOriginProp]);
                endValue = _convertKeywordsToPercentages(endValue);
                if (cache.svg) {
                  _applySVGOrigin(target, endValue, 0, smooth, 0, this);
                } else {
                  endUnit = parseFloat(endValue.split(" ")[2]) || 0;
                  endUnit !== cache.zOrigin && _addNonTweeningPT(this, cache, "zOrigin", cache.zOrigin, endUnit);
                  _addNonTweeningPT(this, style, p2, _firstTwoOnly(startValue), _firstTwoOnly(endValue));
                }
                continue;
              } else if (p2 === "svgOrigin") {
                _applySVGOrigin(target, endValue, 1, smooth, 0, this);
                continue;
              } else if (p2 in _rotationalProperties) {
                _addRotationalPropTween(this, cache, p2, startNum, relative ? _parseRelative(startNum, relative + endValue) : endValue);
                continue;
              } else if (p2 === "smoothOrigin") {
                _addNonTweeningPT(this, cache, "smooth", cache.smooth, endValue);
                continue;
              } else if (p2 === "force3D") {
                cache[p2] = endValue;
                continue;
              } else if (p2 === "transform") {
                _addRawTransformPTs(this, endValue, target);
                continue;
              }
            } else if (!(p2 in style)) {
              p2 = _checkPropPrefix(p2) || p2;
            }
            if (isTransformRelated || (endNum || endNum === 0) && (startNum || startNum === 0) && !_complexExp.test(endValue) && p2 in style) {
              startUnit = (startValue + "").substr((startNum + "").length);
              endNum || (endNum = 0);
              endUnit = getUnit(endValue) || (p2 in _config.units ? _config.units[p2] : startUnit);
              startUnit !== endUnit && (startNum = _convertToUnit(target, p2, startValue, endUnit));
              this._pt = new PropTween(this._pt, isTransformRelated ? cache : style, p2, startNum, (relative ? _parseRelative(startNum, relative + endNum) : endNum) - startNum, !isTransformRelated && (endUnit === "px" || p2 === "zIndex") && vars.autoRound !== false ? _renderRoundedCSSProp : _renderCSSProp);
              this._pt.u = endUnit || 0;
              if (isTransformRelated && finalTransformValue !== endValue) {
                this._pt.b = startValue;
                this._pt.e = finalTransformValue;
                this._pt.r = _renderCSSPropWithBeginningAndEnd;
              } else if (startUnit !== endUnit && endUnit !== "%") {
                this._pt.b = startValue;
                this._pt.r = _renderCSSPropWithBeginning;
              }
            } else if (!(p2 in style)) {
              if (p2 in target) {
                this.add(target, p2, startValue || target[p2], relative ? relative + endValue : endValue, index, targets);
              } else if (p2 !== "parseTransform") {
                _missingPlugin(p2, endValue);
                continue;
              }
            } else {
              _tweenComplexCSSString.call(this, target, p2, startValue, relative ? relative + endValue : endValue);
            }
            isTransformRelated || (p2 in style ? inlineProps.push(p2, 0, style[p2]) : typeof target[p2] === "function" ? inlineProps.push(p2, 2, target[p2]()) : inlineProps.push(p2, 1, startValue || target[p2]));
            props.push(p2);
          }
        }
        hasPriority && _sortPropTweensByPriority(this);
      },
      render: function render2(ratio, data) {
        if (data.tween._time || !_reverting2()) {
          var pt4 = data._pt;
          while (pt4) {
            pt4.r(ratio, pt4.d);
            pt4 = pt4._next;
          }
        } else {
          data.styles.revert();
        }
      },
      get: _get,
      aliases: _propertyAliases,
      getSetter: function getSetter(target, property, plugin) {
        var p2 = _propertyAliases[property];
        p2 && p2.indexOf(",") < 0 && (property = p2);
        return property in _transformProps && property !== _transformOriginProp && (target._gsap.x || _get(target, "x")) ? plugin && _recentSetterPlugin === plugin ? property === "scale" ? _setterScale : _setterTransform : (_recentSetterPlugin = plugin || {}) && (property === "scale" ? _setterScaleWithRender : _setterTransformWithRender) : target.style && !_isUndefined(target.style[property]) ? _setterCSSStyle : ~property.indexOf("-") ? _setterCSSProp : _getSetter(target, property);
      },
      core: {
        _removeProperty,
        _getMatrix
      }
    };
    gsap.utils.checkPrefix = _checkPropPrefix;
    gsap.core.getStyleSaver = _getStyleSaver;
    (function(positionAndScale, rotation, others, aliases) {
      var all = _forEachName(positionAndScale + "," + rotation + "," + others, function(name) {
        _transformProps[name] = 1;
      });
      _forEachName(rotation, function(name) {
        _config.units[name] = "deg";
        _rotationalProperties[name] = 1;
      });
      _propertyAliases[all[13]] = positionAndScale + "," + rotation;
      _forEachName(aliases, function(name) {
        var split = name.split(":");
        _propertyAliases[split[1]] = all[split[0]];
      });
    })("x,y,z,scale,scaleX,scaleY,xPercent,yPercent", "rotation,rotationX,rotationY,skewX,skewY", "transform,transformOrigin,svgOrigin,force3D,smoothOrigin,transformPerspective", "0:translateX,1:translateY,2:translateZ,8:rotate,8:rotationZ,8:rotateZ,9:rotateX,10:rotateY");
    _forEachName("x,y,z,top,right,bottom,left,width,height,fontSize,padding,margin,perspective", function(name) {
      _config.units[name] = "px";
    });
    gsap.registerPlugin(CSSPlugin);
  }
});

// node_modules/.pnpm/gsap@3.15.0/node_modules/gsap/index.js
var gsapWithCSS, TweenMaxWithCSS;
var init_gsap = __esm({
  "node_modules/.pnpm/gsap@3.15.0/node_modules/gsap/index.js"() {
    init_gsap_core();
    init_CSSPlugin();
    gsapWithCSS = gsap.registerPlugin(CSSPlugin) || gsap;
    TweenMaxWithCSS = gsapWithCSS.core.Tween;
  }
});

// src/lib/runtime.ts
function cubicBezier(x1, y1, x2, y2) {
  const A2 = (a, b2) => 1 - 3 * b2 + 3 * a;
  const B2 = (a, b2) => 3 * b2 - 6 * a;
  const C2 = (a) => 3 * a;
  const calc = (t2, a, b2) => ((A2(a, b2) * t2 + B2(a, b2)) * t2 + C2(a)) * t2;
  const slope = (t2, a, b2) => 3 * A2(a, b2) * t2 * t2 + 2 * B2(a, b2) * t2 + C2(a);
  return (p2) => {
    if (p2 <= 0) return 0;
    if (p2 >= 1) return 1;
    let t2 = p2;
    for (let i2 = 0; i2 < 8; i2++) {
      const x3 = calc(t2, x1, x2) - p2;
      if (Math.abs(x3) < 1e-5) break;
      const d2 = slope(t2, x1, x2);
      if (Math.abs(d2) < 1e-6) break;
      t2 -= x3 / d2;
    }
    return calc(t2, y1, y2);
  };
}
function resolveEase(ease) {
  const key = (ease || "ease").trim();
  if (easeCache.has(key)) return easeCache.get(key);
  let fn2;
  const cubic = key.match(/cubic-bezier\(([^)]+)\)/);
  const steps = key.match(/steps\(\s*(\d+)\s*(?:,\s*([a-z-]+))?\s*\)/);
  if (CUBIC_KEYWORDS[key]) {
    const [a, b2, c, d2] = CUBIC_KEYWORDS[key];
    fn2 = cubicBezier(a, b2, c, d2);
  } else if (cubic) {
    const n3 = cubic[1].split(",").map(Number);
    fn2 = cubicBezier(n3[0] ?? 0.25, n3[1] ?? 0.1, n3[2] ?? 0.25, n3[3] ?? 1);
  } else if (steps) {
    const count = parseInt(steps[1], 10) || 1;
    const pos = steps[2] || "end";
    fn2 = (p2) => {
      const clamped = Math.min(1, Math.max(0, p2));
      if (pos === "start" || pos === "jump-start") return Math.min(1, Math.floor(clamped * count) / count);
      return Math.min(1, Math.ceil(clamped * count) / count);
    };
  } else {
    const parsed = gsapWithCSS.parseEase(key);
    fn2 = parsed || ((p2) => p2);
  }
  easeCache.set(key, fn2);
  return fn2;
}
function parseTransformFns(value) {
  const out = [];
  if (!value || value === "none") return [{ fn: "translate", args: [{ value: 0, pct: false }, { value: 0, pct: false }] }];
  const re4 = /([a-zA-Z0-9]+)\s*\(([^)]*)\)/g;
  let m2;
  while (m2 = re4.exec(value)) {
    const fn2 = m2[1].toLowerCase();
    const args = m2[2].split(/[,\s]+/).filter(Boolean).map((v2) => ({ value: parseFloat(v2) || 0, pct: v2.endsWith("%") }));
    out.push({ fn: fn2, args });
  }
  if (!out.length) return [{ fn: "translate", args: [{ value: 0, pct: false }, { value: 0, pct: false }] }];
  return out;
}
function fnsToMatrix(fns, w2, h) {
  let m2 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const at4 = (fn2, i2) => {
    const arg = fn2.args[i2];
    if (!arg) return i2 === 0 ? 1 : 0;
    if (!arg.pct) return arg.value;
    const axis = fn2.fn.endsWith("y") ? h : w2;
    return arg.value / 100 * axis;
  };
  for (const fn2 of fns) {
    switch (fn2.fn) {
      case "translate":
        m2 = mul(m2, translate(at4(fn2, 0), fn2.args[1] ? at4(fn2, 1) : 0));
        break;
      case "translatex":
        m2 = mul(m2, translate(at4(fn2, 0), 0));
        break;
      case "translatey":
        m2 = mul(m2, translate(0, at4(fn2, 0)));
        break;
      case "translate3d":
        m2 = mul(m2, translate(at4(fn2, 0), at4(fn2, 1)));
        break;
      case "scale": {
        const sx = at4(fn2, 0);
        const sy = fn2.args[1] !== void 0 ? at4(fn2, 1) : sx;
        m2 = mul(m2, scale(sx, sy));
        break;
      }
      case "scalex":
        m2 = mul(m2, scale(at4(fn2, 0), 1));
        break;
      case "scaley":
        m2 = mul(m2, scale(1, at4(fn2, 0)));
        break;
      case "rotate":
      case "rotatez":
        m2 = mul(m2, rotate(fn2.args[0]?.value || 0));
        break;
      case "skewx":
        m2 = mul(m2, skewX(fn2.args[0]?.value || 0));
        break;
      case "skewy":
        m2 = mul(m2, skewY(fn2.args[0]?.value || 0));
        break;
      case "matrix": {
        const v2 = fn2.args.map((a) => a.value);
        if (v2.length >= 6) m2 = mul(m2, { a: v2[0], b: v2[1], c: v2[2], d: v2[3], e: v2[4], f: v2[5] });
        break;
      }
    }
  }
  return m2;
}
function interpolateFns(a, b2, p2, w2, h) {
  const sameShape = a.length === b2.length && a.every((v2, i2) => v2.fn === b2[i2].fn && v2.args.length === b2[i2].args.length);
  if (sameShape) {
    const out = a.map((f2, i2) => ({
      fn: f2.fn,
      args: f2.args.map((arg, j3) => {
        const bv = b2[i2].args[j3];
        const axis = f2.fn.endsWith("y") ? h : w2;
        const av = arg.pct ? arg.value / 100 * axis : arg.value;
        const bb = bv.pct ? bv.value / 100 * axis : bv.value;
        return { value: av + (bb - av) * p2, pct: false };
      })
    }));
    return fnsToMatrix(out, w2, h);
  }
  const ma2 = fnsToMatrix(a, w2, h);
  const mb = fnsToMatrix(b2, w2, h);
  return lerpMatrix(ma2, mb, p2);
}
function decompose(m2) {
  const sx = Math.hypot(m2.a, m2.b);
  const rot = Math.atan2(m2.b, m2.a);
  const denom = sx || 1;
  const skew = (m2.a * m2.c + m2.b * m2.d) / (denom * denom);
  const sy = Math.hypot(m2.c - m2.a * skew, m2.d - m2.b * skew) || 1;
  return { tx: m2.e, ty: m2.f, rot, sx, sy, skew };
}
function recompose(d2) {
  const cos = Math.cos(d2.rot);
  const sin = Math.sin(d2.rot);
  return {
    a: cos * d2.sx,
    b: sin * d2.sx,
    c: (cos * d2.skew - sin) * d2.sy,
    d: (sin * d2.skew + cos) * d2.sy,
    e: d2.tx,
    f: d2.ty
  };
}
function lerpMatrix(a, b2, p2) {
  const da2 = decompose(a);
  const db = decompose(b2);
  let rot = da2.rot + (db.rot - da2.rot) * p2;
  if (db.rot - da2.rot > Math.PI) rot = da2.rot + (db.rot - da2.rot - Math.PI * 2) * p2;
  if (db.rot - da2.rot < -Math.PI) rot = da2.rot + (db.rot - da2.rot + Math.PI * 2) * p2;
  return recompose({
    tx: da2.tx + (db.tx - da2.tx) * p2,
    ty: da2.ty + (db.ty - da2.ty) * p2,
    rot,
    sx: da2.sx + (db.sx - da2.sx) * p2,
    sy: da2.sy + (db.sy - da2.sy) * p2,
    skew: da2.skew + (db.skew - da2.skew) * p2
  });
}
function parseNumeric(raw, fontSize) {
  const v2 = (raw || "").trim();
  if (!v2) return 0;
  const num3 = parseFloat(v2);
  if (!Number.isFinite(num3)) return 0;
  if (v2.endsWith("em")) return num3 * fontSize;
  if (v2.endsWith("%")) return num3;
  return num3;
}
function propKind(prop) {
  if (prop === "transform") return "transform";
  if (prop === "fill" || prop === "stroke" || prop === "color") return "color";
  if (prop === "visibility" || prop === "display") return "keyword";
  return "number";
}
function clamp012(v2) {
  if (!Number.isFinite(v2)) return 1;
  return Math.min(1, Math.max(0, v2));
}
var CUBIC_KEYWORDS, easeCache, AssetPlayer;
var init_runtime = __esm({
  "src/lib/runtime.ts"() {
    init_gsap();
    init_css();
    init_matrix();
    init_convert();
    CUBIC_KEYWORDS = {
      ease: [0.25, 0.1, 0.25, 1],
      "ease-in": [0.42, 0, 1, 1],
      "ease-out": [0, 0, 0.58, 1],
      "ease-in-out": [0.42, 0, 0.58, 1],
      linear: [0, 0, 1, 1]
    };
    easeCache = /* @__PURE__ */ new Map();
    AssetPlayer = class {
      constructor(converted, asset) {
        this.groups = [];
        this.time = 0;
        this.duration = 1;
        this.playing = false;
        this.loop = true;
        this.speed = 1;
        this.cache = /* @__PURE__ */ new Map();
        this.converted = converted;
        this.asset = asset;
        this.rebuild();
      }
      rebuild() {
        const converted = this.converted;
        this.groups = [];
        let duration = 0;
        const groups = this.asset.groups || [];
        groups.forEach((group) => {
          if (group.enabled === false) return;
          const targets = group.targetIds?.length ? group.targetIds : [group.targetId];
          const stagger = Math.max(0, group.stagger || 0);
          const iterations = group.iterations === "infinite" ? Infinity : Math.max(1, group.iterations || 1);
          targets.forEach((targetId, index) => {
            const element = converted.elements.get(targetId);
            if (!element) return;
            const fontSize = element.baseStyle.fontSize || 16;
            const tracks = group.tracks.map((track2) => this.bindTrack(track2, fontSize));
            if (!tracks.length) return;
            const delay = group.delay + index * stagger;
            const groupEnd = delay + group.duration * iterations;
            if (Number.isFinite(groupEnd)) duration = Math.max(duration, groupEnd);
            this.groups.push({ group, element, tracks, ease: resolveEase(group.ease), delay });
          });
        });
        if (!Number.isFinite(duration) || duration <= 0) {
          duration = Math.max(1, ...groups.map((g2) => g2.delay + g2.duration));
        }
        this.duration = duration;
        this.time = Math.min(this.time, duration);
        this.reset();
      }
      bindTrack(track2, fontSize) {
        const kind = propKind(track2.property);
        const keys = track2.keyframes.map((k2) => {
          const raw = k2.value;
          const bound = { offset: k2.offset, kind, raw: raw ?? "" };
          if (kind === "number") bound.num = parseNumeric(raw, fontSize);
          else if (kind === "color") bound.color = parseColor(raw);
          else if (kind === "transform") bound.fns = parseTransformFns(raw);
          return bound;
        }).sort((a, b2) => a.offset - b2.offset);
        return { property: track2.property, keys, unitScale: fontSize };
      }
      sample(track2, key) {
        return key.num ?? 0;
      }
      /** 计算某个属性在给定进度下的值 */
      valueAt(track2, p2, el) {
        const keys = track2.keys;
        if (!keys.length) return 0;
        if (p2 <= keys[0].offset) return this.keyValue(keys[0], el);
        if (p2 >= keys[keys.length - 1].offset) return this.keyValue(keys[keys.length - 1], el);
        let i2 = 0;
        while (i2 < keys.length - 1 && keys[i2 + 1].offset < p2) i2++;
        const a = keys[i2];
        const b2 = keys[i2 + 1];
        const span = b2.offset - a.offset || 1;
        const local = Math.min(1, Math.max(0, (p2 - a.offset) / span));
        if (a.kind === "transform" && a.fns && b2.fns) {
          return interpolateFns(a.fns, b2.fns, local, el.bbox.width, el.bbox.height);
        }
        if (a.kind === "color" && a.color && b2.color) {
          return mixColor(a.color, b2.color, local);
        }
        if (a.kind === "keyword") {
          return local < 1 ? a.raw === "visible" || a.raw === "inline" ? 1 : 0 : b2.raw === "visible" || b2.raw === "inline" ? 1 : 0;
        }
        const av = this.sample(track2, a);
        const bv = this.sample(track2, b2);
        return av + (bv - av) * local;
      }
      keyValue(key, el) {
        if (key.kind === "transform" && key.fns) return fnsToMatrix(key.fns, el.bbox.width, el.bbox.height);
        if (key.kind === "color" && key.color) return key.color;
        if (key.kind === "keyword") return key.raw === "visible" || key.raw === "inline" ? 1 : 0;
        return key.num ?? 0;
      }
      /** 把时间落到所有元素上：同一元素上多条动画时，活动轨道优先于未活动轨道的基准值 */
      render(time) {
        this.time = time;
        const map = /* @__PURE__ */ new Map();
        for (const bound of this.groups) {
          const { element, ease } = bound;
          const state = this.stateAt(bound, time);
          const p2 = state ? ease(state.progress) : 0;
          let per = map.get(element);
          if (!per) {
            per = /* @__PURE__ */ new Map();
            map.set(element, per);
          }
          for (const track2 of bound.tracks) {
            const existing = per.get(track2.property);
            if (state) {
              per.set(track2.property, { active: true, value: this.valueAt(track2, p2, element) });
            } else if (!existing || !existing.active) {
              per.set(track2.property, { active: false, value: this.baseValue(track2.property, element) });
            }
          }
        }
        map.forEach((per, element) => {
          per.forEach((entry, prop) => this.applyValue(prop, entry.value, element, entry.active));
        });
      }
      baseValue(prop, el) {
        const b2 = el.baseStyle;
        switch (prop) {
          case "opacity":
            return b2.opacity;
          case "transform":
            return null;
          case "letter-spacing":
            return b2.letterSpacing ?? 0;
          case "font-size":
            return b2.fontSize ?? 16;
          case "width":
            return b2.width ?? el.bbox.width;
          case "height":
            return b2.height ?? el.bbox.height;
          case "stroke-width":
            return b2.strokeWidth ?? 1;
          case "fill":
          case "stroke":
            return b2[prop];
          default:
            return void 0;
        }
      }
      changed(prop, el, signature) {
        const key = `${el.el.id}|${prop}`;
        if (this.cache.get(key) === signature) return false;
        this.cache.set(key, signature);
        return true;
      }
      applyValue(prop, value, el, active) {
        const node = el.node;
        switch (prop) {
          case "transform": {
            if (!active) {
              const base = elementBaseMatrix(el);
              const sig2 = `m${base.a},${base.b},${base.c},${base.d},${base.e},${base.f}`;
              if (this.changed("transform", el, sig2)) el.wrapper.setTransform(base, false);
              break;
            }
            const m2 = value;
            const pivot = {
              x: el.bbox.x + el.originPoint.x * el.bbox.width,
              y: el.bbox.y + el.originPoint.y * el.bbox.height
            };
            const composed = mul(elementBaseMatrix(el), pivotMatrix(m2, pivot.x, pivot.y));
            const sig = `m${composed.a.toFixed(4)},${composed.b.toFixed(4)},${composed.c.toFixed(4)},${composed.d.toFixed(4)},${composed.e.toFixed(2)},${composed.f.toFixed(2)}`;
            if (this.changed("transform", el, sig)) el.wrapper.setTransform(composed, false);
            break;
          }
          case "opacity": {
            const next = clamp012(Number(value));
            if (this.changed(prop, el, String(next))) node.opacity = next;
            break;
          }
          case "letter-spacing": {
            const next = Number(value);
            if (this.changed(prop, el, String(next))) node.letterSpacing = next;
            break;
          }
          case "font-size": {
            const next = Math.max(1, Number(value));
            if (this.changed(prop, el, String(next))) node.fontSize = next;
            break;
          }
          case "stroke-width": {
            const next = Math.max(0, Number(value));
            if (this.changed(prop, el, String(next))) node.strokeWidth = next;
            break;
          }
          case "stroke-dashoffset": {
            const next = Number(value);
            if (this.changed(prop, el, String(next))) node.dashOffset = next;
            break;
          }
          case "fill":
          case "stroke": {
            const str2 = typeof value === "string" ? value : value && "r" in value ? rgbaString(value) : "";
            if (str2 && this.changed(prop, el, str2)) node[prop] = str2;
            break;
          }
          case "visibility": {
            const next = Number(value) > 0.5;
            if (this.changed(prop, el, String(next))) node.visible = next;
            break;
          }
          case "width":
          case "height": {
            const next = Math.max(1, Number(value));
            if (this.changed(prop, el, String(next))) node[prop] = next;
            break;
          }
        }
      }
      stateAt(bound, time) {
        const group = bound.group;
        const d2 = Math.max(1e-3, group.duration);
        let t2 = time - bound.delay;
        if (t2 < 0) {
          if (group.fillMode === "backwards" || group.fillMode === "both") return { progress: 0 };
          return null;
        }
        const iterations = group.iterations === "infinite" ? Infinity : Math.max(1, group.iterations || 1);
        let index = Math.floor(t2 / d2);
        let local = t2 - index * d2;
        if (iterations !== Infinity && index >= iterations) {
          if (group.fillMode === "forwards" || group.fillMode === "both") {
            index = iterations - 1;
            local = d2;
          } else {
            return null;
          }
        }
        let progress = Math.min(1, Math.max(0, local / d2));
        const dir = group.direction;
        if (dir === "reverse" || dir === "alternate" && index % 2 === 1 || dir === "alternate-reverse" && index % 2 === 0) {
          progress = 1 - progress;
        }
        return { progress };
      }
      /** 布局 / 样式变化后清掉值缓存，让下一帧重新写入 */
      invalidate() {
        this.cache.clear();
      }
      reset() {
        this.groups.forEach(({ element, tracks }) => {
          tracks.forEach((t2) => {
            const base = this.baseValue(t2.property, element);
            if (t2.property === "transform") {
              element.wrapper.setTransform(elementBaseMatrix(element), false);
            } else if (base !== void 0) {
              this.applyValue(t2.property, base, element, false);
            }
          });
        });
      }
      seek(time) {
        this.time = Math.min(this.duration, Math.max(0, time));
        this.render(this.time);
        this.onTime?.(this.time, this.duration);
      }
      get lastFrameTime() {
        return this.duration - Math.min(1e-6, this.duration / 2);
      }
      play() {
        if (this.playing) return;
        if (this.time >= this.lastFrameTime) this.seek(0);
        this.playing = true;
      }
      pause() {
        this.playing = false;
      }
      tick(dt4) {
        if (!this.playing) return;
        let t2 = this.time + dt4 * this.speed;
        if (t2 >= this.duration) {
          if (this.loop) {
            t2 = this.duration > 0 ? t2 % this.duration : 0;
          } else {
            t2 = this.lastFrameTime;
            this.playing = false;
            this.onEnd?.();
          }
        }
        this.render(t2);
        this.onTime?.(t2, this.duration);
      }
    };
  }
});

// src/lib/review/studioFrame.ts
var studioFrame_exports = {};
__export(studioFrame_exports, {
  applyStudioFrame: () => applyStudioFrame
});
function applyStudioFrame(snap3, asset, ids, frame) {
  const converted = convertSvg(parseSvgDocument(asset.svg), asset);
  const player = new AssetPlayer(converted, asset);
  const targets = /* @__PURE__ */ new Map();
  for (const group of asset.groups) {
    for (const id2 of group.targetIds?.length ? group.targetIds : [group.targetId]) {
      const properties = targets.get(id2) || /* @__PURE__ */ new Set();
      for (const track2 of group.tracks) properties.add(track2.property);
      targets.set(id2, properties);
    }
  }
  applyAssetLayouts(converted, asset.layouts);
  if (player.groups.length) player.render(Math.min(player.duration * frame, player.lastFrameTime));
  for (const element of [snap3.svg, ...Array.from(snap3.svg.querySelectorAll("*"))]) {
    element.style?.setProperty("animation", "none", "important");
    element.style?.setProperty("transition", "none", "important");
  }
  snap3.svg.querySelectorAll("animate, animateTransform, animateMotion, set").forEach((node) => node.remove());
  for (const [id2, entry] of converted.elements) {
    const svg = ids.get(id2);
    if (!svg?.style) continue;
    const properties = targets.get(id2);
    const style = svg.style;
    const set = (name, value) => style.setProperty(name, value, "important");
    const override = asset.overrides?.[id2];
    if (entry.layoutOffset || entry.overrideMatrix || properties?.has("transform")) {
      const { a, b: b2, c, d: d2, e: e2, f: f2 } = entry.wrapper.getTransform("local");
      set("transform-origin", "0px 0px");
      set("transform-box", "view-box");
      set("transform", `matrix(${a},${b2},${c},${d2},${e2},${f2})`);
    }
    const node = entry.node;
    for (const [property, { field, unit }] of Object.entries(animatedStyle)) {
      if (!properties?.has(property)) continue;
      const value = node[field];
      if (typeof value === "string" || typeof value === "number") set(property, String(value) + (unit || ""));
    }
    for (const property of ["width", "height"]) {
      if ((properties?.has(property) || override?.[property] !== void 0) && typeof node[property] === "number") {
        svg.setAttribute(property, String(node[property]));
        set(property, `${node[property]}px`);
      }
    }
    if (properties?.has("visibility") && node.visible === false) set("visibility", "hidden");
  }
  snap3.duration = player.groups.length ? player.duration : 0;
  snap3.animationCount = asset.groups.filter((group) => group.enabled !== false).length;
  snap3.hasSmil = false;
}
var animatedStyle;
var init_studioFrame = __esm({
  "src/lib/review/studioFrame.ts"() {
    init_convert();
    init_apply();
    init_runtime();
    init_svg_doc();
    animatedStyle = {
      opacity: { field: "opacity" },
      fill: { field: "fill" },
      stroke: { field: "stroke" },
      "stroke-width": { field: "strokeWidth" },
      "stroke-dashoffset": { field: "dashOffset" },
      "font-size": { field: "fontSize", unit: "px" },
      "letter-spacing": { field: "letterSpacing", unit: "px" }
    };
  }
});

// src/lib/review/review.ts
var review_exports = {};
__export(review_exports, {
  buildReviewFrameSvg: () => buildReviewFrameSvg,
  buildView: () => buildView,
  gateOf: () => gateOf,
  reviewInputHash: () => reviewInputHash,
  runReview: () => runReview
});
async function buildReviewFrameSvg(asset, options = {}) {
  const frameRatio = clamp013(options.frame ?? 1);
  const snap3 = await mountSnapshot(asset);
  try {
    const idMap = assignIds(snap3);
    applyOverrides(snap3, asset.overrides, idMap);
    if (asset.groups.length || Object.keys(asset.layouts || {}).length || Object.keys(asset.overrides || {}).length || snap3.animationCount || snap3.hasSmil) {
      const { applyStudioFrame: applyStudioFrame2 } = await Promise.resolve().then(() => (init_studioFrame(), studioFrame_exports));
      applyStudioFrame2(snap3, asset, idMap, frameRatio);
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    return bakeStatic(snap3);
  } finally {
    snap3.dispose();
  }
}
async function runReview(asset, options = {}) {
  const started = performance.now();
  const medium = options.medium || "ui";
  const frameRatio = clamp013(options.frame ?? 1);
  const notes = [];
  const ran = /* @__PURE__ */ new Set();
  let snap3 = null;
  try {
    snap3 = await mountSnapshot(asset);
    const idMap = assignIds(snap3);
    const overrideInfo = applyOverrides(snap3, asset.overrides, idMap);
    notes.push(...overrideInfo.notes);
    if (asset.groups.length || Object.keys(asset.layouts || {}).length || Object.keys(asset.overrides || {}).length || snap3.animationCount || snap3.hasSmil) {
      const { applyStudioFrame: applyStudioFrame2 } = await Promise.resolve().then(() => (init_studioFrame(), studioFrame_exports));
      applyStudioFrame2(snap3, asset, idMap, frameRatio);
      notes.push("\u52A8\u753B\u4E0E\u5E03\u5C40\u6309 Studio \u53C2\u6570\u5B9A\u683C\uFF0C\u518D\u4EE5 SVG \u590D\u73B0\u53D6\u6837");
    }
    await new Promise((r3) => requestAnimationFrame(() => r3()));
    const boxes = extractBoxes(snap3);
    if (snap3.animationCount === 0 && !snap3.hasSmil) notes.push("\u8FD9\u6761\u7D20\u6750\u6CA1\u6709\u53EF\u62BD\u53D6\u7684\u52A8\u753B\uFF0C\u8BC4\u5BA1\u7684\u662F\u9759\u6001\u753B\u9762");
    const staticSvg = bakeStatic(snap3);
    const raster = await rasterize(snap3, staticSvg);
    if (!raster?.image) notes.push("\u5149\u6805\u5316\u5931\u8D25\uFF1A\u5BF9\u6BD4\u5EA6\u4E0E\u8C03\u8272\u677F\u6309\u672A\u6D4B\u5904\u7406");
    notes.push("\u900F\u660E\u533A\u57DF\u6309\u767D\u5E95\u5408\u6210\u540E\u53D6\u6837");
    const texts = boxes.elements.filter((e2) => e2.kind === "text" || e2.text && e2.fontSize);
    ran.add("layout");
    const layout = measureLayout({
      elements: boxes.elements,
      groupBoxes: boxes.groupBoxes,
      W: snap3.width,
      H: snap3.height,
      medium,
      displayWidth: options.displayWidth,
      scaleLadder: options.scaleLadder
    });
    ran.add("contrast");
    const contrast = measureContrast({
      texts,
      raster: raster && raster.image ? raster : null,
      W: snap3.width,
      medium,
      displayWidth: options.displayWidth
    });
    ran.add("pixels");
    const pixelFindings = [];
    let palette = [];
    if (raster?.image) {
      const px = measurePixels(raster);
      pixelFindings.push(...px.findings);
      palette = px.palette;
    }
    ran.add("media");
    const mediaFindings = [];
    if (boxes.brokenImages.length) {
      for (const id2 of boxes.brokenImages) {
        mediaFindings.push({
          ruleId: "QL-07",
          element: id2,
          measured: "empty",
          unit: "status",
          status: gateStatus(RULES["QL-07"].gate, "empty"),
          method: "image_href",
          evidence: { reason: "<image> \u6CA1\u6709 href\uFF0C\u6216\u6307\u5411\u7A7A\u4E32" }
        });
      }
    } else if (boxes.unresolvedImages.length) {
      mediaFindings.push({
        ruleId: "QL-07",
        element: boxes.unresolvedImages[0],
        measured: "unresolved",
        unit: "status",
        status: "UNMEASURED",
        method: "image_href",
        evidence: {
          refs: boxes.unresolvedImages.slice(0, 4),
          note: "\u4F4D\u56FE\u662F\u5916\u94FE\uFF0C\u79BB\u7EBF\u65E0\u6CD5\u6821\u9A8C\u53EF\u8FBE\u6027\uFF1B\u53EA\u6709\u7A7A\u5F15\u7528\u80FD\u786E\u5B9A\u662F\u574F\u7684"
        }
      });
    } else {
      mediaFindings.push({
        ruleId: "QL-07",
        element: "canvas",
        measured: "ok",
        unit: "status",
        status: gateStatus(RULES["QL-07"].gate, "ok"),
        method: "image_href",
        evidence: { note: "\u8FD9\u5F20\u7D20\u6750\u6CA1\u6709\u4F4D\u56FE\u5F15\u7528\uFF0C\u4E0D\u5B58\u5728\u5916\u94FE\u5931\u6548" }
      });
    }
    const bleed = layout.findings.filter((f2) => f2.ruleId === "VS-01" && f2.status === "WARN" && f2.evidence?.kind !== "text").length;
    if (bleed) notes.push(`${bleed} \u4E2A\u88C5\u9970\u56FE\u5F62\u6574\u5757\u5728\u753B\u5E03\u5916\uFF1A\u4E0D\u5F71\u54CD\u753B\u9762\uFF0C\u4F46\u7B49\u4E8E\u6CA1\u753B`);
    const partialBleed = layout.findings.filter((f2) => f2.ruleId === "VS-01" && f2.status === "PASS" && f2.evidence?.kind === "shape" && Number(f2.measured) > 0).length;
    if (partialBleed) notes.push(`${partialBleed} \u4E2A\u88C5\u9970\u56FE\u5F62\u51FA\u8840\u5230\u753B\u5916\uFF1A\u6309\u6709\u610F\u51FA\u8840\u5904\u7406\uFF0C\u4E0D\u8BA1\u88C1\u5207`);
    const raws = [...layout.findings, ...contrast.findings, ...pixelFindings, ...mediaFindings].filter((r3) => ACTIVE_IDS.has(r3.ruleId) && RULES[r3.ruleId]?.measure !== "semantic");
    const unmeasured = [...layout.unmeasured, ...contrast.unmeasured];
    if (!raster?.image) unmeasured.push({ ruleId: "CL-01", reason: "\u5149\u6805\u5316\u5931\u8D25\uFF0C\u8C03\u8272\u677F\u65E0\u6CD5\u7EDF\u8BA1" });
    if (!raster?.image) unmeasured.push({ ruleId: "NS-01", reason: "\u5149\u6805\u5316\u5931\u8D25\uFF0C\u8D1F\u7A7A\u95F4\u65E0\u6CD5\u7EDF\u8BA1" });
    const unmeasuredIds = new Set(unmeasured.map((u2) => u2.ruleId));
    const measuredRaws = raws.filter((r3) => !(unmeasuredIds.has(r3.ruleId) && r3.status === "PASS"));
    const sorted = sortFindings(measuredRaws.map((raw, i2) => makeFinding(raw, i2 + 1)));
    const findings = sorted.map((f2, i2) => ({ ...f2, id: `F-${String(i2 + 1).padStart(3, "0")}` }));
    const gr01 = layout.findings.find((f2) => f2.ruleId === "GR-01" && f2.metric === "grid_align_share");
    const grid = gr01 ? {
      unit: Number(gr01.evidence.unit) || null,
      tolerance: Number(gr01.evidence.tolerance) || 1,
      share: Number(gr01.measured),
      aligned: Number(gr01.evidence.aligned) || 0,
      samples: Number(gr01.evidence.samples) || 0,
      offGrid: gr01.evidence.offGrid || [],
      source: "inferred"
    } : {
      unit: null,
      tolerance: 1,
      share: null,
      aligned: 0,
      samples: boxes.elements.length,
      offGrid: [],
      source: "none"
    };
    const boxMap = {};
    for (const el of boxes.elements) boxMap[el.id] = el.bbox;
    const counts = countLevels(findings);
    const coverage = buildCoverage({ medium, findings, unmeasured, ran });
    const gate = gateOf(counts, coverage);
    const view = buildView(findings);
    return {
      assetId: asset.id,
      assetName: asset.name,
      inputHash: reviewInputHash(asset, options),
      libraryVersion: LIBRARY_VERSION,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      canvas: { width: snap3.width, height: snap3.height },
      medium,
      displayWidth: options.displayWidth,
      frame: frameRatio,
      duration: Math.round(snap3.duration * 100) / 100,
      grid,
      boxes: boxMap,
      counts,
      gate,
      findings,
      unmeasured,
      coverage,
      view,
      details: {
        elapsedMs: Math.round(performance.now() - started),
        raster: raster?.image ? { width: raster.width, height: raster.height } : null,
        notes: [...notes, ...palette.length ? [`\u4E3B\u8272 ${palette.slice(0, 5).join(" ")}`] : []],
        animations: snap3.animationCount,
        elements: boxes.elements.length,
        texts: texts.length
      }
    };
  } finally {
    snap3?.dispose();
  }
}
function countLevels(findings) {
  const counts = { FAIL: 0, WARN: 0, PASS: 0, UNMEASURED: 0 };
  for (const f2 of findings) counts[f2.level] = (counts[f2.level] || 0) + 1;
  return counts;
}
function gateOf(counts, coverage) {
  if (counts.FAIL) return "BLOCKED";
  const pending2 = (coverage.counts.unmeasured || 0) + (coverage.counts.not_run || 0) + (coverage.counts.not_implemented || 0);
  if (counts.WARN || pending2) return "REVIEW_NEEDED";
  return "DELIVERABLE";
}
function buildView(findings) {
  const policy = ruleset.impactPolicy;
  const budget = {
    high: policy.budget.high ?? null,
    medium: policy.budget.medium ?? 5,
    low: policy.budget.low ?? 0
  };
  const perCard = policy.budget.elementsPerCard || 5;
  const cards = /* @__PURE__ */ new Map();
  const values = /* @__PURE__ */ new Map();
  for (const f2 of findings) {
    if (f2.level === "PASS") continue;
    const key = `${f2.ruleId}|${f2.metric}`;
    let card = cards.get(key);
    if (!card) {
      card = {
        ruleId: f2.ruleId,
        title: CARD_TITLES[f2.metric] || f2.title,
        principle: f2.principle,
        violation: f2.violation,
        impact: f2.impact,
        level: f2.level,
        count: 0,
        elementCount: 0,
        elementsSample: [],
        measuredRange: [],
        unit: f2.unit,
        threshold: f2.provenance.threshold,
        measure: f2.provenance.measure,
        gatePower: f2.gatePower,
        fix: f2.fix,
        note: typeof f2.evidence?.note === "string" ? f2.evidence.note : void 0
      };
      cards.set(key, card);
      values.set(key, []);
    }
    card.count++;
    if (!card.elementsSample.includes(f2.element)) card.elementsSample.push(f2.element);
    if (!card.fix && f2.fix) card.fix = f2.fix;
    if (IMPACT_ORDER[f2.impact] < IMPACT_ORDER[card.impact]) card.impact = f2.impact;
    if (levelRank(f2.level) < levelRank(card.level)) card.level = f2.level;
    if (typeof f2.measured === "number") values.get(key).push(f2.measured);
  }
  for (const [key, card] of cards) {
    const list = values.get(key) || [];
    card.measuredRange = list.length ? [round4(Math.min(...list)), round4(Math.max(...list))] : [];
    card.elementCount = card.elementsSample.length;
    card.elementsSample = card.elementsSample.slice(0, perCard);
  }
  const ranked = [...cards.values()].sort(
    (a, b2) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b2.impact] || levelRank(a.level) - levelRank(b2.level) || b2.count - a.count || a.ruleId.localeCompare(b2.ruleId)
  );
  const order = policy.order?.length ? policy.order : ["high", "medium", "low"];
  const sections = [];
  let collapsed = 0;
  for (const key of order) {
    const items = ranked.filter((c) => c.impact === key);
    const cap = budget[key];
    const shown = cap === null || cap === void 0 ? items : items.slice(0, cap);
    const hidden = items.slice(shown.length);
    collapsed += hidden.reduce((sum, c) => sum + c.count, 0);
    sections.push({
      impact: key,
      label: IMPACT_LABELS[key],
      findings: items.reduce((sum, c) => sum + c.count, 0),
      cards: items.length,
      shown,
      hidden: {
        cards: hidden.length,
        findings: hidden.reduce((sum, c) => sum + c.count, 0),
        ruleIds: hidden.map((c) => c.ruleId),
        items: hidden
      }
    });
  }
  return {
    mode: "ui",
    budget,
    byImpact: {
      high: byImpact(ranked, "high"),
      medium: byImpact(ranked, "medium"),
      low: byImpact(ranked, "low")
    },
    sections,
    collapsed: { findings: collapsed, detail: "\u6298\u53E0\u9879\u4ECD\u5B8C\u6574\u4FDD\u7559\u5728 findings[]\uFF0C\u53EF\u6309 id \u56DE\u67E5\uFF0C\u4E0D\u5220\u9664" }
  };
}
var clamp013, CARD_TITLES, byImpact, levelRank, round4;
var init_review = __esm({
  "src/lib/review/review.ts"() {
    init_rules2();
    init_boxes();
    init_snapshot();
    init_overrides();
    init_layout();
    init_pixels();
    init_findings();
    init_hash();
    init_hash();
    clamp013 = (v2) => Math.max(0, Math.min(1, Number.isFinite(v2) ? v2 : 1));
    CARD_TITLES = {
      out_of_canvas: "\u51FA\u753B\uFF08\u88AB\u753B\u5E03\u88C1\u6389\uFF09",
      out_of_safe: "\u5B89\u5168\u533A\uFF08\u56DB\u8FB9 5%\uFF09",
      size_ratio_rank1_body: "\u5C42\u7EA7\u843D\u5DEE\uFF08\u6807\u9898 vs \u6B63\u6587\uFF09",
      text_accent_colors: "\u6587\u5B57\u914D\u8272\u9884\u7B97\uFF08\u5F3A\u8C03\u8272\uFF09",
      dominant_share: "\u8C03\u8272\u677F\uFF08\u4E3B\u8272\u5360\u6BD4\uFF09",
      rule_line_offset_spread: "\u5206\u9694\u7EBF\u5B9A\u4F4D\uFF08\u540C\u7C7B\u504F\u5DEE\uFF09"
    };
    byImpact = (cards, impact) => ({
      findings: cards.filter((c) => c.impact === impact).reduce((s2, c) => s2 + c.count, 0),
      rules: cards.filter((c) => c.impact === impact).length
    });
    levelRank = (l2) => ({ FAIL: 0, WARN: 1, UNMEASURED: 2, PASS: 3 })[l2] ?? 9;
    round4 = (v2) => Math.round(v2 * 1e4) / 1e4;
  }
});

// src/lib/review/agent.ts
function agentReviewRules(rules) {
  return rules.filter((rule) => !rule.outOfScope && (rule.measure === "semantic" || rule.severity === "human"));
}
function parseAgentReviewDocument(raw, validRuleIds, boxes) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned);
  const source = Array.isArray(parsed) ? parsed : parsed?.reviews;
  if (!Array.isArray(source)) throw new Error("JSON \u9876\u5C42\u9700\u8981\u662F\u6570\u7EC4\uFF0C\u6216\u5305\u542B reviews \u6570\u7EC4");
  const results = /* @__PURE__ */ new Map();
  for (const row of source) {
    const ruleId = String(row?.ruleId || "");
    if (!validRuleIds.has(ruleId)) throw new Error(`\u7ED3\u679C\u5305\u542B\u672A\u77E5\u89C4\u5219\uFF1A${ruleId || "\u7F3A\u5C11 ruleId"}`);
    if (results.has(ruleId)) throw new Error(`\u89C4\u5219 ${ruleId} \u91CD\u590D\u8FD4\u56DE`);
    const rawResult = String(row?.result || "").toLowerCase();
    const result = ["positive", "pass", "\u6B63\u4F8B", "\u901A\u8FC7"].includes(rawResult) ? "positive" : ["negative", "issue", "fail", "\u53CD\u4F8B", "\u95EE\u9898"].includes(rawResult) ? "negative" : ["unmeasured", "unknown", "\u672A\u6D4B"].includes(rawResult) ? "unmeasured" : null;
    if (!result) throw new Error(`\u89C4\u5219 ${ruleId} \u7684 result \u65E0\u6548`);
    const elementId = typeof row?.elementId === "string" && row.elementId.trim() ? row.elementId.trim() : void 0;
    const candidate = row?.bbox;
    const bbox = Array.isArray(candidate) && candidate.length === 4 && candidate.every((n3) => Number.isFinite(Number(n3))) && Number(candidate[2]) > 0 && Number(candidate[3]) > 0 ? candidate.map(Number) : elementId ? boxes[elementId] : void 0;
    results.set(ruleId, {
      ruleId,
      result,
      reason: String(row?.reason || "Agent \u672A\u63D0\u4F9B\u5224\u65AD\u4F9D\u636E\u3002"),
      ...elementId ? { elementId } : {},
      ...bbox ? { bbox } : {}
    });
  }
  const missing = [...validRuleIds].filter((ruleId) => !results.has(ruleId));
  if (missing.length) throw new Error(`\u7F3A\u5C11 ${missing.length} \u6761\u89C4\u5219\u7ED3\u8BBA\uFF1A${missing.slice(0, 6).join("\u3001")}${missing.length > 6 ? "\u2026" : ""}`);
  return {
    ...typeof parsed?.assetId === "string" ? { assetId: parsed.assetId } : {},
    ...typeof parsed?.inputHash === "string" ? { inputHash: parsed.inputHash } : {},
    ...parsed?.options && typeof parsed.options === "object" ? { options: parsed.options } : {},
    reviews: [...results.values()]
  };
}
var init_agent = __esm({
  "src/lib/review/agent.ts"() {
  }
});

// src/cli/args.ts
function usage(message) {
  throw new CliError("INVALID_ARGUMENT", message);
}
function parseArgv(argv2) {
  const [first, ...tail] = argv2;
  const cmd = !first || first === "--help" || first === "-h" ? "help" : first;
  if (!Object.prototype.hasOwnProperty.call(commands, cmd)) usage(`\u672A\u77E5\u547D\u4EE4\uFF1A${cmd}`);
  const specs = { help: "switch", json: "switch", ...commands[cmd] };
  const flags = /* @__PURE__ */ Object.create(null);
  const positional = [];
  for (let i2 = 0; i2 < tail.length; i2++) {
    const arg = tail[i2];
    if (arg === "--") {
      positional.push(...tail.slice(i2 + 1));
      break;
    }
    if (!arg.startsWith("--") && arg !== "-h") {
      if (arg.startsWith("-")) usage(`\u672A\u77E5\u53C2\u6570\uFF1A${arg}`);
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const key = arg === "-h" ? "help" : arg.slice(2, eq >= 0 ? eq : void 0);
    const option = Object.prototype.hasOwnProperty.call(specs, key) ? specs[key] : void 0;
    if (!option) usage(`\u672A\u77E5\u53C2\u6570\uFF1A--${key}`);
    if (flags[key] !== void 0 && option !== "repeat") usage(`\u53C2\u6570 --${key} \u53EA\u80FD\u4F20\u4E00\u6B21`);
    if (option === "switch") {
      if (eq >= 0) usage(`\u53C2\u6570 --${key} \u4E0D\u63A5\u6536\u503C`);
      flags[key] = true;
      continue;
    }
    const value = eq >= 0 ? arg.slice(eq + 1) : tail[++i2];
    if (!value?.trim() || value.startsWith("--") || value === "-h") usage(`\u53C2\u6570 --${key} \u7F3A\u5C11\u503C`);
    if (option === "repeat") flags[key] = [...flags[key] || [], value];
    else flags[key] = value;
  }
  const projectless = ["bridge", "context", "live", "help"].includes(cmd);
  if (positional.length > (projectless ? 0 : 1)) usage(`\u591A\u4F59\u7684\u4F4D\u7F6E\u53C2\u6570\uFF1A${positional.join(" ")}`);
  if (flags.json && (cmd === "bridge" || cmd === "mcp") && !flags.help) usage(`${cmd} \u662F\u5E38\u9A7B\u547D\u4EE4\uFF0C\u4E0D\u63A5\u6536 --json`);
  return { cmd, flags, file: positional[0] };
}
function str(flags, key) {
  return flags[key];
}
function num2(flags, key) {
  const text = str(flags, key);
  if (text === void 0) return void 0;
  const value = Number(text);
  if (!Number.isFinite(value)) usage(`\u53C2\u6570 --${key} \u9700\u8981\u6709\u9650\u6570\u5B57`);
  return value;
}
function portOf(flags, key, fallback) {
  const port = num2(flags, key) ?? (process.env.MGSVG_BRIDGE?.trim() ? Number(process.env.MGSVG_BRIDGE) : fallback);
  if (port !== void 0 && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    usage(`--${key} \u6216 MGSVG_BRIDGE \u5FC5\u987B\u662F 1\u201365535 \u7684\u7AEF\u53E3`);
  }
  return port;
}
var commands, CliError;
var init_args = __esm({
  "src/cli/args.ts"() {
    commands = {
      help: {},
      init: { project: "value", name: "value", force: "switch" },
      outline: { asset: "value", elements: "switch" },
      validate: {},
      apply: { ops: "value", "dry-run": "switch" },
      add: { svg: "value", name: "value", x: "value", y: "value", width: "value", height: "value", "dry-run": "switch" },
      replace: { asset: "value", svg: "value", "dry-run": "switch" },
      style: { asset: "value", element: "value", set: "repeat", clear: "switch", "dry-run": "switch" },
      anim: { asset: "value", group: "value", set: "repeat", "dry-run": "switch" },
      layer: { asset: "value", group: "value", targets: "value", stagger: "value", "dry-run": "switch" },
      layout: {
        asset: "value",
        container: "value",
        mode: "value",
        gap: "value",
        "row-gap": "value",
        padding: "value",
        cols: "value",
        width: "value",
        "max-width": "value",
        "align-x": "value",
        "align-y": "value",
        justify: "value",
        wrap: "switch",
        "no-wrap": "switch",
        "dry-run": "switch"
      },
      review: {
        asset: "value",
        run: "switch",
        write: "switch",
        app: "value",
        "project-url": "value",
        "dry-run": "switch",
        "agent-prompt": "switch",
        "agent-result": "value"
      },
      context: { bridge: "value", session: "value", wait: "value", after: "value" },
      live: {
        bridge: "value",
        session: "value",
        current: "switch",
        asset: "value",
        assets: "value",
        element: "value",
        set: "repeat",
        clear: "switch",
        select: "value",
        save: "switch",
        reload: "switch",
        review: "switch",
        frame: "value",
        add: "value",
        name: "value",
        merge: "value",
        replace: "value",
        remove: "switch",
        force: "switch",
        versions: "switch",
        restore: "value",
        "delete-versions": "value"
      },
      version: { bridge: "value", session: "value", current: "switch", asset: "value", assets: "value", id: "value", ids: "value", json: "switch" },
      bridge: { port: "value" },
      mcp: { project: "value", bridge: "value" }
    };
    CliError = class extends Error {
      constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
      }
    };
  }
});

// src/cli/reviewRunner.ts
import { spawn } from "node:child_process";
import fs3 from "node:fs";
import { tmpdir } from "node:os";
import path2 from "node:path";
function withTimeout(promise, ms2, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CliError("REVIEW_TIMEOUT", message)), ms2);
    void promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
async function reviewInBrowser(opts) {
  const chrome = CHROME_CANDIDATES.find((candidate) => candidate && fs3.existsSync(candidate));
  if (!chrome) throw new CliError("CHROME_NOT_FOUND", "\u627E\u4E0D\u5230 Chrome/Chromium\uFF0C\u8BF7\u7528 CHROME \u6307\u5B9A\u53EF\u6267\u884C\u6587\u4EF6");
  if (typeof WebSocket !== "function") throw new CliError("WEBSOCKET_UNAVAILABLE", "\u5F53\u524D Node \u7248\u672C\u6CA1\u6709 WebSocket\uFF0C\u8BF7\u4F7F\u7528 Node 22 \u6216\u4EE5\u4E0A");
  const url = new URL(opts.appUrl);
  url.searchParams.set("project", opts.projectUrl);
  url.searchParams.set("review", opts.target);
  url.searchParams.set("review-job", "1");
  if (opts.mode && opts.mode !== "rules") url.searchParams.set("review-kind", opts.mode);
  const profile = fs3.mkdtempSync(path2.join(tmpdir(), "mgsvg-review-"));
  const portFile = path2.join(profile, "DevToolsActivePort");
  const chromeProcess = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-extensions",
    "--remote-debugging-port=0",
    "--window-size=1600,1000",
    `--user-data-dir=${profile}`,
    "about:blank"
  ], { stdio: "ignore" });
  let launchError;
  chromeProcess.on("error", (error) => {
    launchError = error;
  });
  const closed = new Promise((resolve) => chromeProcess.once("close", () => resolve()));
  let ws2;
  try {
    let endpoint;
    const startupDeadline = Date.now() + 1e4;
    while (!endpoint && Date.now() < startupDeadline && !launchError && chromeProcess.exitCode === null) {
      try {
        const port = Number(fs3.readFileSync(portFile, "utf8").split("\n")[0]);
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1e3) });
        const pages = await response.json();
        endpoint = pages.find((page) => page.type === "page")?.webSocketDebuggerUrl;
      } catch {
      }
      if (!endpoint) await sleep(150);
    }
    if (!endpoint) throw new CliError("CHROME_START_FAILED", launchError?.message || "Chrome \u8C03\u8BD5\u7AEF\u53E3\u65E0\u54CD\u5E94");
    const socket = new WebSocket(endpoint);
    ws2 = socket;
    await withTimeout(new Promise((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new CliError("CHROME_CONNECTION_FAILED", "\u65E0\u6CD5\u8FDE\u63A5 Chrome \u8C03\u8BD5\u7AEF\u53E3")), { once: true });
    }), 5e3, "\u8FDE\u63A5 Chrome \u8D85\u65F6");
    let seq = 0;
    const pending2 = /* @__PURE__ */ new Map();
    socket.addEventListener("message", (event) => {
      const reply = JSON.parse(String(event.data));
      pending2.get(reply.id)?.(reply);
    });
    const send = async (method, params) => {
      const id2 = ++seq;
      try {
        const reply = await withTimeout(new Promise((resolve) => {
          pending2.set(id2, resolve);
          socket.send(JSON.stringify({ id: id2, method, params }));
        }), 5e3, "Chrome \u8C03\u8BD5\u8BF7\u6C42\u8D85\u65F6");
        if (reply.error) throw new CliError("CHROME_CONNECTION_FAILED", reply.error.message);
        return reply.result;
      } finally {
        pending2.delete(id2);
      }
    };
    const navigation = await send("Page.navigate", { url: url.href });
    if (navigation.errorText) throw new CliError("STUDIO_UNAVAILABLE", navigation.errorText);
    const deadline = Date.now() + (opts.timeoutMs ?? 45e3);
    while (Date.now() < deadline) {
      await sleep(400);
      const reply = await send("Runtime.evaluate", {
        expression: "JSON.stringify(window.__mgsvgReviewJob)",
        returnByValue: true
      });
      const raw = reply?.result?.value;
      if (!raw) continue;
      const job = JSON.parse(raw);
      if (job.ok === false) throw new CliError("REVIEW_FAILED", job.error);
      return job.result;
    }
    throw new CliError("REVIEW_TIMEOUT", `\u7B49\u4E0D\u5230\u8BC4\u5BA1\u7ED3\u679C\uFF0C\u8BF7\u786E\u8BA4 ${opts.appUrl} \u53EF\u6253\u5F00\u4E14\u652F\u6301 CLI \u8BC4\u5BA1`);
  } finally {
    ws2?.close();
    chromeProcess.kill("SIGKILL");
    await Promise.race([closed, sleep(500)]);
    try {
      fs3.rmSync(profile, { recursive: true, force: true });
    } catch {
    }
  }
}
var CHROME_CANDIDATES, sleep;
var init_reviewRunner = __esm({
  "src/cli/reviewRunner.ts"() {
    init_args();
    CHROME_CANDIDATES = [
      process.env.CHROME,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser"
    ];
    sleep = (ms2) => new Promise((resolve) => setTimeout(resolve, ms2));
  }
});

// src/cli/projectReview.ts
var projectReview_exports = {};
__export(projectReview_exports, {
  agentPromptForProject: () => agentPromptForProject,
  reviewProjectFile: () => reviewProjectFile,
  saveAgentReviewResult: () => saveAgentReviewResult
});
import path3 from "node:path";
function projectUrlForFile(file, supplied) {
  if (supplied) return supplied;
  const absolute = path3.resolve(file);
  const relative = path3.relative(process.cwd(), absolute);
  if (relative === ".." || relative.startsWith(".." + path3.sep) || path3.isAbsolute(relative)) {
    throw new CliError("INVALID_ARGUMENT", "\u8BF7\u4ECE Studio \u9879\u76EE\u76EE\u5F55\u8FD0\u884C\uFF0C\u6216\u63D0\u4F9B --project-url");
  }
  return "/" + relative.split(path3.sep).map(encodeURIComponent).join("/");
}
async function reviewProjectFile({
  file,
  appUrl = "http://localhost:5188",
  projectUrl,
  target,
  write = false,
  dryRun = false
}) {
  const { project, snapshot } = readProjectFile(file);
  const absolute = path3.resolve(file);
  projectUrl = projectUrlForFile(absolute, projectUrl);
  const assets = target ? [findAsset(project, target)] : project.assets;
  const targetId = target ? assets[0].id : "all";
  const result = await reviewInBrowser({ appUrl, projectUrl, target: targetId });
  if (result.kind === "agent-prompt") throw new CliError("REVIEW_FAILED", "\u8BC4\u5BA1\u6D4F\u89C8\u5668\u8FD4\u56DE\u4E86 Agent \u63D0\u793A\u8BCD\uFF0C\u800C\u4E0D\u662F\u89C4\u5219\u7ED3\u679C");
  const failed = result.rows.filter((row) => row.error);
  if (failed.length) {
    throw new CliError("REVIEW_FAILED", "\u90E8\u5206\u7D20\u6750\u8BC4\u5BA1\u5931\u8D25", failed.map((row) => `${row.assetName}\uFF1A${row.error}`));
  }
  const rows = new Map(result.rows.map((row) => [row.assetId, row]));
  if (result.rows.length !== assets.length || Object.keys(result.snapshots).length !== assets.length) {
    throw new CliError("REVIEW_SOURCE_MISMATCH", "\u6D4F\u89C8\u5668\u4E0E\u672C\u5730\u9879\u76EE\u7684\u8BC4\u5BA1\u7D20\u6750\u4E0D\u4E00\u81F4");
  }
  for (const asset of assets) {
    const saved = result.snapshots[asset.id];
    const row = rows.get(asset.id);
    if (!saved || !row || saved.inputHash !== row.inputHash || saved.inputHash !== reviewInputHash(asset, saved.options)) {
      throw new CliError("REVIEW_SOURCE_MISMATCH", `\u6D4F\u89C8\u5668\u4E0E\u672C\u5730\u9879\u76EE\u7684\u7D20\u6750\u7248\u672C\u4E0D\u4E00\u81F4\uFF1A${asset.name}\uFF08${asset.id}\uFF09`);
    }
  }
  if (write) {
    for (const asset of assets) asset.review = result.snapshots[asset.id];
    const check = validateProject(project);
    if (!check.ok) throw new CliError("VALIDATION_FAILED", "\u9879\u76EE\u6821\u9A8C\u672A\u901A\u8FC7", check.problems);
    if (!dryRun) writeProject(file, project, snapshot);
  }
  return { ...result, file: absolute, written: write && !dryRun };
}
async function agentPromptForProject({
  file,
  appUrl = "http://localhost:5188",
  projectUrl,
  target
}) {
  const { project } = readProjectFile(file);
  const asset = findAsset(project, target);
  const result = await reviewInBrowser({
    appUrl,
    projectUrl: projectUrlForFile(path3.resolve(file), projectUrl),
    target: asset.id,
    mode: "agent-prompt"
  });
  if (result.kind !== "agent-prompt") throw new CliError("REVIEW_FAILED", "\u6D4F\u89C8\u5668\u6CA1\u6709\u8FD4\u56DE Agent \u8BC4\u5BA1\u63D0\u793A\u8BCD");
  if (result.assetId !== asset.id || result.inputHash !== reviewInputHash(asset, result.options)) {
    throw new CliError("REVIEW_SOURCE_MISMATCH", `\u6D4F\u89C8\u5668\u4E0E\u672C\u5730\u9879\u76EE\u7684\u7D20\u6750\u7248\u672C\u4E0D\u4E00\u81F4\uFF1A${asset.name}\uFF08${asset.id}\uFF09`);
  }
  return { ...result, file: path3.resolve(file) };
}
function saveAgentReviewResult({
  file,
  target,
  document: document2,
  write = false,
  dryRun = false
}) {
  const { project, snapshot } = readProjectFile(file);
  const asset = findAsset(project, target);
  const raw = typeof document2 === "string" ? document2 : JSON.stringify(document2);
  const validRuleIds = new Set(agentReviewRules(ruleset.rules).map((rule) => rule.id));
  const parsed = parseAgentReviewDocument(raw, validRuleIds, {});
  if (parsed.assetId !== asset.id) throw new CliError("AGENT_ASSET_MISMATCH", `\u7ED3\u679C assetId \u4E0D\u5339\u914D\uFF1A\u9884\u671F ${asset.id}\uFF0C\u6536\u5230 ${parsed.assetId || "\u7F3A\u5931"}`);
  if (!parsed.inputHash || !parsed.options) throw new CliError("AGENT_RESULT_METADATA_MISSING", "Agent JSON \u5FC5\u987B\u5E26\u56DE assetId\u3001inputHash \u548C options");
  const options = parsed.options;
  if (options.medium !== "ui" && options.medium !== "print") throw new CliError("AGENT_RESULT_INVALID", "Agent JSON \u7684 options.medium \u65E0\u6548");
  if (!Number.isFinite(options.frame) || options.frame < 0 || options.frame > 1) {
    throw new CliError("AGENT_RESULT_INVALID", "Agent JSON \u7684 options.frame \u5FC5\u987B\u5728 0\u20131");
  }
  if (!Number.isFinite(options.displayWidth) || options.displayWidth <= 0) {
    throw new CliError("AGENT_RESULT_INVALID", "Agent JSON \u7684 options.displayWidth \u5FC5\u987B\u4E3A\u6B63\u6570");
  }
  if (options.scaleLadder !== void 0 && (!Array.isArray(options.scaleLadder) || options.scaleLadder.some((value) => !Number.isFinite(value) || value <= 0))) {
    throw new CliError("AGENT_RESULT_INVALID", "Agent JSON \u7684 options.scaleLadder \u5FC5\u987B\u662F\u6B63\u6570\u6570\u7EC4");
  }
  const currentHash = reviewInputHash(asset, options);
  if (parsed.inputHash !== currentHash) throw new CliError("AGENT_RESULT_STALE", "Agent \u7ED3\u679C\u5BF9\u5E94\u7684\u7D20\u6750\u6216\u8BC4\u5BA1\u53E3\u5F84\u5DF2\u53D8\u5316\uFF1B\u8BF7\u91CD\u65B0\u751F\u6210\u63D0\u793A\u8BCD\u5E76\u8BC4\u5BA1");
  const agentReview = {
    inputHash: currentHash,
    options,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    results: parsed.reviews
  };
  asset.agentReview = agentReview;
  const check = validateProject(project);
  if (!check.ok) throw new CliError("VALIDATION_FAILED", "\u9879\u76EE\u6821\u9A8C\u672A\u901A\u8FC7", check.problems);
  if (write && !dryRun) writeProject(file, project, snapshot);
  return { assetId: asset.id, assetName: asset.name, agentReview, written: write && !dryRun, dryRun: !!dryRun };
}
var init_projectReview = __esm({
  "src/cli/projectReview.ts"() {
    init_project();
    init_review();
    init_agent();
    init_rules2();
    init_args();
    init_io();
    init_reviewRunner();
  }
});

// src/cli/bridge.ts
var bridge_exports = {};
__export(bridge_exports, {
  startBridge: () => startBridge
});
import http from "node:http";
import { randomUUID } from "node:crypto";
function localOrigin(origin) {
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}
async function readBody(request) {
  let size2 = 0;
  const chunks = [];
  for await (const chunk of request) {
    size2 += chunk.length;
    if (size2 > MAX_BODY) throw new Error("\u8BF7\u6C42\u5185\u5BB9\u8FC7\u5927");
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("\u8BF7\u6C42\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  return value;
}
async function startBridge(port = 7350) {
  const sessions = /* @__PURE__ */ new Map();
  const pending2 = /* @__PURE__ */ new Map();
  const allowedOrigins = (process.env.MGSVG_STUDIO_ORIGIN || "").split(",").map((origin) => origin.trim());
  const getContext = (sessionId) => {
    const now = Date.now();
    const active = (entry) => now - entry.seenAt < SESSION_TTL;
    if (sessionId) {
      const entry = sessions.get(sessionId);
      return entry && active(entry) ? entry.context : null;
    }
    return Array.from(sessions.values()).reverse().find(active)?.context ?? null;
  };
  const enqueue = (type, payload, sessionId, current = false) => {
    if (Boolean(sessionId) === current) throw new BridgeError("TARGET_REQUIRED", "\u8BF7\u6307\u5B9A\u4F1A\u8BDD ID\uFF0C\u6216\u663E\u5F0F\u4F7F\u7528\u5F53\u524D\u4F1A\u8BDD");
    const context3 = getContext(sessionId);
    if (!context3) throw new BridgeError("SESSION_NOT_FOUND", "Studio \u4F1A\u8BDD\u5DF2\u65AD\u5F00\u6216\u5DF2\u5207\u6362\u9879\u76EE\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u9009\u533A");
    if (sessionId && (type === "style.set" || type === "style.clear") && (!payload.asset || !payload.element)) {
      throw new Error("\u6307\u5B9A\u4F1A\u8BDD\u65F6\uFF0C\u8BF7\u540C\u65F6\u63D0\u4F9B\u8BFB\u53D6\u9009\u533A\u65F6\u62FF\u5230\u7684\u7D20\u6750\u548C\u5143\u7D20 ID");
    }
    if (type === "asset.add" && (typeof payload.svg !== "string" || !payload.svg.trim() || typeof payload.name !== "string" || !payload.name.trim())) {
      throw new Error("\u6DFB\u52A0\u7D20\u6750\u9700\u8981 SVG \u6E90\u7801\u548C\u540D\u79F0");
    }
    const noAsset = type === "asset.add" || type === "project.reload";
    const asset = noAsset ? void 0 : payload.asset || context3.selection.assetId;
    const canUseSelection = !payload.asset || payload.asset === context3.asset?.id || payload.asset === context3.asset?.name;
    const element = noAsset ? void 0 : payload.element || (canUseSelection && type !== "select" ? context3.selection.elementId : void 0);
    if (type !== "save" && !noAsset && !asset) throw new Error("\u8BF7\u5148\u9009\u4E2D\u7D20\u6750\uFF0C\u6216\u63D0\u4F9B\u7D20\u6750 ID");
    if ((type === "style.set" || type === "style.clear") && !element) {
      throw new Error("\u8BF7\u5148\u9009\u4E2D\u5143\u7D20\uFF0C\u6216\u63D0\u4F9B\u7D20\u6750\u548C\u5143\u7D20 ID");
    }
    const SUPPORTED = [
      "style.set",
      "style.clear",
      "select",
      "save",
      "review",
      "asset.add",
      "asset.replaceSvg",
      "asset.remove",
      "asset.mergeVersions",
      "asset.versions",
      "asset.restoreVersion",
      "asset.deleteVersions",
      "project.reload"
    ];
    if (!SUPPORTED.includes(type)) {
      throw new Error(`\u6865\u4E0D\u652F\u6301\u547D\u4EE4\u300C${type}\u300D\u3002\u5F53\u524D\u652F\u6301\uFF1A${SUPPORTED.join("\u3001")}\u3002\u82E5\u8FD9\u662F\u65B0\u52A0\u7684\u547D\u4EE4\uFF0C\u8BF7\u91CD\u542F bridge\uFF08node bin/mgsvg.mjs bridge --port 7350\uFF09`);
    }
    if (type === "review" && payload.frame !== void 0 && (typeof payload.frame !== "number" || !Number.isFinite(payload.frame) || payload.frame < 0 || payload.frame > 1)) throw new Error("\u8BC4\u5BA1\u5E27\u5FC5\u987B\u5728 0 \u5230 1 \u4E4B\u95F4");
    const id2 = randomUUID();
    pending2.set(id2, {
      command: { id: id2, sessionId: context3.sessionId, type, payload: { ...payload, asset, element } },
      expiresAt: Date.now() + bridgeCommandTimeout(type),
      delivered: false
    });
    return id2;
  };
  const getResult = (id2) => {
    const item = pending2.get(id2);
    if (!item) return { ok: false, code: "COMMAND_NOT_FOUND", error: "\u547D\u4EE4\u4E0D\u5B58\u5728\u6216\u7ED3\u679C\u5DF2\u8FC7\u671F" };
    if (item.result) return item.result;
    if (Date.now() >= item.expiresAt) {
      return {
        ok: false,
        code: item.delivered ? "COMMAND_UNCONFIRMED" : "COMMAND_NOT_DELIVERED",
        error: item.delivered ? "Studio \u5DF2\u63A5\u6536\u547D\u4EE4\u4F46\u672A\u53CA\u65F6\u56DE\u4F20\u7ED3\u679C\uFF0C\u8BF7\u5148\u68C0\u67E5\u5F53\u524D\u72B6\u6001" : "Studio \u672A\u9886\u53D6\u547D\u4EE4\uFF0C\u6539\u52A8\u672A\u5E94\u7528\u3002\u8BF7\u786E\u8BA4\u9875\u9762\u4ECD\u5F00\u7740"
      };
    }
  };
  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url || "/", "http://127.0.0.1");
    } catch {
      res.writeHead(400).end();
      return;
    }
    const { pathname } = url;
    const method = req.method === "OPTIONS" ? req.headers["access-control-request-method"] : req.method;
    const studioRoute = method === "POST" && (pathname === "/context" || pathname === "/command/result") || method === "GET" && pathname === "/command/next";
    const origin = req.headers.origin;
    const send = (status, body) => {
      res.statusCode = status;
      if (body !== void 0) res.setHeader("content-type", "application/json");
      res.end(body === void 0 ? void 0 : JSON.stringify(body));
    };
    if (!localOrigin(`http://${req.headers.host}`)) return send(403, { error: "\u53EA\u63A5\u53D7\u672C\u5730\u6865\u5730\u5740" });
    if (origin) {
      if (!studioRoute || !localOrigin(origin) && !allowedOrigins.includes(origin)) {
        return send(403, { error: "\u6B64\u7F51\u9875\u6765\u6E90\u65E0\u6743\u8BBF\u95EE\u672C\u5730\u6865" });
      }
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");
      res.setHeader("vary", "Origin");
    }
    res.setHeader("cache-control", "no-store");
    if (req.method === "OPTIONS") return send(204);
    const now = Date.now();
    for (const [id3, entry] of sessions) if (now - entry.seenAt >= SESSION_TTL) sessions.delete(id3);
    for (const [id3, entry] of pending2) if (now - entry.expiresAt >= RESULT_TTL) pending2.delete(id3);
    const sessionId = url.searchParams.get("session") || void 0;
    const id2 = url.searchParams.get("id") || "";
    try {
      if (req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("application/json")) {
          return send(415, { error: "\u9700\u8981 application/json \u8BF7\u6C42" });
        }
        if (pathname === "/context") {
          const context3 = await readBody(req);
          if (typeof context3.sessionId !== "string" || !context3.sessionId || !context3.selection) {
            return send(400, { error: "\u7F3A\u5C11 Studio \u4F1A\u8BDD\u6216\u9009\u533A" });
          }
          const previous = sessions.get(context3.sessionId)?.context;
          const selection = context3.selection;
          const sameSelection = previous && previous.selection.assetId === selection.assetId && previous.selection.elementId === selection.elementId && previous.selection.groupId === selection.groupId;
          const selectionId = sameSelection ? previous.selectionId : randomUUID();
          const tabPrefix = context3.sessionId.split(":")[0] + ":";
          for (const id3 of sessions.keys()) {
            if (id3 === context3.sessionId || id3.startsWith(tabPrefix)) sessions.delete(id3);
          }
          sessions.set(context3.sessionId, { context: { ...context3, selectionId, ts: (/* @__PURE__ */ new Date()).toISOString() }, seenAt: Date.now() });
          return send(204);
        }
        if (pathname === "/command") {
          const body = await readBody(req);
          return send(202, { id: enqueue(body.type, body.payload || {}, body.sessionId, body.current === true) });
        }
        if (pathname === "/command/result") {
          const body = await readBody(req);
          const item = pending2.get(body.id);
          if (!item?.delivered || item.command.sessionId !== body.sessionId) return send(404);
          item.result ??= body.ok ? { ok: true, result: body.result } : {
            ok: false,
            error: String(body.error || "\u5E94\u7528\u5931\u8D25"),
            code: body.code || "STUDIO_ERROR"
          };
          return send(204);
        }
      }
      if (req.method === "GET") {
        if (pathname === "/command/next") {
          const session = sessions.get(sessionId);
          if (!session) return send(409);
          session.seenAt = now;
          for (const item of pending2.values()) {
            if (item.command.sessionId === sessionId && !item.delivered && now < item.expiresAt) {
              item.delivered = true;
              return send(200, item.command);
            }
          }
          return send(204);
        }
        if (pathname === "/command/result") {
          const result = getResult(id2);
          return result ? send(200, result) : send(204);
        }
        if (pathname === "/context" || pathname === "/health") {
          const context3 = getContext(sessionId);
          if (pathname === "/health") return send(200, { ok: true, hasContext: !!context3, updatedAt: context3?.ts ?? null });
          return context3 ? send(200, context3) : send(204);
        }
      }
      send(404);
    } catch (error) {
      send(400, { code: error instanceof BridgeError ? error.code : "INVALID_ARGUMENT", error: error.message });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  }).catch((error) => {
    throw new Error(`\u65E0\u6CD5\u542F\u52A8\u672C\u5730\u6865 ${port}\uFF1A${error.message}`);
  });
  return {
    port,
    getContext,
    async waitForContext(timeoutMs, { sessionId, after } = {}) {
      const baseline = after ?? getContext(sessionId)?.selectionId;
      const deadline = Date.now() + timeoutMs;
      do {
        const context3 = getContext(sessionId);
        if (context3 && context3.selectionId !== baseline) return context3;
        await new Promise((resolve) => setTimeout(resolve, 120));
      } while (Date.now() < deadline && server.listening);
      return null;
    },
    async runCommand(type, payload, sessionId) {
      const id2 = enqueue(type, payload, sessionId);
      while (server.listening) {
        const result = getResult(id2);
        if (result) return result;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      return { ok: false, error: "\u672C\u5730\u6865\u5DF2\u5173\u95ED" };
    },
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
var SESSION_TTL, RESULT_TTL, MAX_BODY, BridgeError;
var init_bridge = __esm({
  "src/cli/bridge.ts"() {
    init_bridge_protocol();
    SESSION_TTL = 3e4;
    RESULT_TTL = 3e4;
    MAX_BODY = 1e7;
    BridgeError = class extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    };
  }
});

// src/mcp/server.ts
var server_exports = {};
__export(server_exports, {
  startMcpServer: () => startMcpServer
});
import fs4 from "node:fs";
import path4 from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z as z4 } from "zod";
async function startMcpServer(projectPath, bridgePort) {
  const defaultPath = projectPath || process.env.MG_SVG_PROJECT || "project.mgsvg";
  const server = new McpServer({ name: "mg-svg-studio", version: "0.1.0" });
  const resolvePath = (p2) => path4.resolve(p2 || defaultPath);
  const text = (body) => ({ content: [{ type: "text", text: body }] });
  const fail = (err) => ({
    content: [{ type: "text", text: "\u9519\u8BEF\uFF1A" + (err?.message || String(err)) }],
    isError: true
  });
  server.registerTool(
    "project_schema",
    {
      title: "\u9879\u76EE\u6587\u4EF6\u683C\u5F0F\u8BF4\u660E",
      description: "\u8FD4\u56DE .mgsvg \u9879\u76EE\u6587\u4EF6\u7684 JSON \u7ED3\u6784\u4E0E\u5B57\u6BB5\u542B\u4E49\uFF0C\u5148\u8BFB\u8FD9\u4E2A\u518D\u6539\u6587\u4EF6\u3002",
      inputSchema: {}
    },
    async () => text(FORMAT_DOC)
  );
  server.registerTool(
    "project_outline",
    {
      title: "\u9879\u76EE\u6982\u89C8",
      description: "\u5217\u51FA\u7D20\u6750\u3001\u52A8\u753B\u8F68\u9053\u3001\u5E03\u5C40\u4EE5\u53CA\u53EF\u7528\u7684\u5143\u7D20 id\uFF08Agent \u5B9A\u4F4D\u5143\u7D20\u7528\uFF09\u3002",
      inputSchema: {
        path: z4.string().optional().describe("\u9879\u76EE\u6587\u4EF6\u8DEF\u5F84\uFF0C\u9ED8\u8BA4 MG_SVG_PROJECT \u6216 project.mgsvg"),
        asset: z4.string().optional().describe("\u53EA\u770B\u67D0\u4E2A\u7D20\u6750\uFF08id \u6216\u540D\u79F0\uFF09"),
        elements: z4.boolean().optional().describe("\u662F\u5426\u5217\u51FA\u6BCF\u4E2A\u7D20\u6750\u7684\u5143\u7D20 id")
      }
    },
    async ({ path: p2, asset, elements }) => {
      try {
        const project = readProject(resolvePath(p2));
        return text(outline(project, { assetId: asset, elements: !!elements }));
      } catch (err) {
        return fail(err);
      }
    }
  );
  server.registerTool(
    "project_read_asset",
    {
      title: "\u8BFB\u53D6\u7D20\u6750",
      description: "\u8FD4\u56DE\u4E00\u4E2A\u7D20\u6750\u7684\u5B8C\u6574 JSON\uFF08\u52A8\u753B\u3001\u5143\u7D20\u7D22\u5F15\u3001\u6837\u5F0F\u8986\u76D6\u3001\u5E03\u5C40\uFF09\u3002",
      inputSchema: {
        path: z4.string().optional(),
        asset: z4.string().describe("\u7D20\u6750 id \u6216\u540D\u79F0"),
        includeSvg: z4.boolean().optional().describe("\u662F\u5426\u5305\u542B SVG \u6E90\u7801\uFF08\u53EF\u80FD\u5F88\u5927\uFF09")
      }
    },
    async ({ path: p2, asset, includeSvg }) => {
      try {
        const project = readProject(resolvePath(p2));
        const found = findAsset(project, asset);
        const copy = { ...found };
        if (!includeSvg) {
          copy.svgBytes = Buffer.byteLength(found.svg, "utf8");
          delete copy.svg;
        }
        return text(JSON.stringify(copy, null, 2));
      } catch (err) {
        return fail(err);
      }
    }
  );
  const bridge = bridgePort ? await Promise.resolve().then(() => (init_bridge(), bridge_exports)).then((m2) => m2.startBridge(bridgePort)) : null;
  if (bridge) console.error(`[mg-svg] \u9009\u62E9\u6865\u5DF2\u5F00\u5728 http://127.0.0.1:${bridge.port}\uFF08Studio \u9ED8\u8BA4\u8FDE\u63A5\u672C\u673A 7350 \u7AEF\u53E3\uFF09`);
  server.registerTool(
    "studio_context",
    {
      title: "\u8BFB\u53D6 Studio \u5F53\u524D\u7684\u9009\u4E2D\u9879",
      description: "\u8FD4\u56DE\u4EBA\u5728 Studio \u91CC\u6B64\u523B\u9009\u4E2D\u7684\u7D20\u6750/\u5143\u7D20\uFF08id\u3001\u6807\u7B7E\u3001\u6587\u5B57\u3001\u4F4D\u7F6E\u3001\u8986\u76D6\u6837\u5F0F\uFF09\u4EE5\u53CA\u8FD9\u4E00\u7248\u8BC4\u5BA1\u5728\u8BE5\u5143\u7D20\u4E0A\u7684\u5224\u5B9A\u3002\u9700\u8981\u672C\u673A 7350 \u6865\u5DF2\u542F\u52A8\uFF0CStudio \u9ED8\u8BA4\u8FDE\u63A5\u8BE5\u7AEF\u53E3\u3002",
      inputSchema: {
        waitSeconds: z4.number().positive().max(120).optional().describe("\u7B49\u4E00\u6B21\u65B0\u7684\u9009\u62E9\uFF0C\u6700\u591A\u7B49\u8FD9\u4E48\u591A\u79D2"),
        sessionId: z4.string().trim().min(1).optional().describe("\u53EA\u8BFB\u6216\u7B49\u5F85\u6307\u5B9A\u4F1A\u8BDD"),
        after: z4.string().trim().min(1).optional().describe("\u7B49\u5230\u4E0E\u4E0A\u6B21\u8FD4\u56DE\u7684 selectionId \u4E0D\u540C")
      }
    },
    async ({ waitSeconds, sessionId, after }) => {
      if (!bridge) return fail(new Error("MCP \u6CA1\u5E26 --bridge \u542F\u52A8\uFF0C\u8BFB\u4E0D\u5230 Studio \u7684\u9009\u62E9"));
      if (after && !waitSeconds) return fail(new Error("after \u9700\u4E0E waitSeconds \u4E00\u8D77\u4F7F\u7528"));
      const ctx = waitSeconds ? await bridge.waitForContext(waitSeconds * 1e3, { sessionId, after }) : bridge.getContext(sessionId);
      if (!ctx) return fail(new Error(waitSeconds ? "\u7B49\u5F85\u65B0\u9009\u533A\u8D85\u65F6" : "\u6CA1\u6709\u53EF\u7528\u7684 Studio \u4F1A\u8BDD"));
      return text(JSON.stringify(ctx, null, 2));
    }
  );
  server.registerTool(
    "studio_apply",
    {
      title: "\u5B9E\u65F6\u7F16\u8F91 Studio \u5143\u7D20",
      description: "\u5148\u7528 studio_context \u8BFB\u53D6\u9009\u533A\uFF0C\u518D\u4F20\u5165\u8FD4\u56DE\u7684 sessionId\u3001asset.id \u548C element.id\u3002\u6539\u52A8\u7ACB\u5373\u53CD\u6620\u5230\u753B\u5E03\uFF0C\u968F\u754C\u9762\u6539\u52A8\u4E00\u8D77\u4FDD\u5B58\u3002",
      inputSchema: {
        sessionId: z4.string().trim().min(1).describe("studio_context \u8FD4\u56DE\u7684\u4F1A\u8BDD ID\uFF0C\u7528\u4E8E\u9501\u5B9A\u6D4F\u89C8\u5668\u6807\u7B7E\u9875\u548C\u6253\u5F00\u7684\u9879\u76EE"),
        asset: z4.string().optional().describe("\u4FEE\u6539\u6216\u6E05\u9664\u6837\u5F0F\u65F6\u5FC5\u586B\uFF0C\u4F7F\u7528 studio_context \u8FD4\u56DE\u7684 asset.id"),
        element: z4.string().optional().describe("\u4FEE\u6539\u6216\u6E05\u9664\u6837\u5F0F\u65F6\u5FC5\u586B\uFF0C\u4F7F\u7528 studio_context \u8FD4\u56DE\u7684 element.id"),
        style: z4.record(z4.string(), z4.any()).optional().describe('\u6837\u5F0F\u8865\u4E01\uFF0C\u5982 {"fill":"#e11d48","fontSize":28}'),
        clear: z4.boolean().optional().describe("\u6E05\u6389\u8BE5\u5143\u7D20\u7684\u8986\u76D6\u6837\u5F0F"),
        select: z4.string().optional().describe("\u5207\u6362\u9009\u4E2D\u5143\u7D20\u7684 ID \u6216\u552F\u4E00\u6807\u7B7E")
      }
    },
    async ({ sessionId, asset, element, style, clear, select }) => {
      try {
        if (!bridge) throw new Error("\u8BF7\u7528 --bridge 7350 \u542F\u52A8 MCP\uFF1BStudio \u4F1A\u81EA\u52A8\u8FDE\u63A5\u672C\u673A\u6865");
        if (Number(!!style) + Number(!!clear) + Number(!!select) !== 1) {
          throw new Error("\u8BF7\u63D0\u4F9B style\u3001clear \u6216 select \u4E2D\u7684\u4E00\u79CD\u64CD\u4F5C");
        }
        const type = select ? "select" : clear ? "style.clear" : "style.set";
        const result = await bridge.runCommand(type, { asset, element: select || element, patch: style }, sessionId);
        if (result.ok === false) throw new Error(result.error);
        return text(JSON.stringify(result.result, null, 2));
      } catch (error) {
        return fail(error);
      }
    }
  );
  server.registerTool(
    "studio_save",
    {
      title: "\u4FDD\u5B58 Studio \u5F53\u524D\u9879\u76EE",
      description: "\u8C03\u7528 Studio \u7684\u9879\u76EE\u4FDD\u5B58\uFF0C\u5199\u56DE\u5DF2\u94FE\u63A5\u7684\u672C\u5730 .mgsvg\u3002\u4EC5\u5728\u7528\u6237\u8981\u6C42\u4FDD\u5B58\u65F6\u8C03\u7528\u3002\u6587\u4EF6\u5DF2\u88AB\u5916\u90E8\u4FEE\u6539\u65F6\u4F1A\u62A5\u544A\u51B2\u7A81\u3002",
      inputSchema: {
        sessionId: z4.string().trim().min(1).describe("studio_context \u8FD4\u56DE\u7684\u4F1A\u8BDD ID")
      }
    },
    async ({ sessionId }) => {
      try {
        if (!bridge) throw new Error("\u8BF7\u7528 --bridge 7350 \u542F\u52A8 MCP\uFF1BStudio \u4F1A\u81EA\u52A8\u8FDE\u63A5\u672C\u673A\u6865");
        const result = await bridge.runCommand("save", {}, sessionId);
        if (result.ok === false) throw new Error(result.error);
        return text(JSON.stringify(result.result, null, 2));
      } catch (error) {
        return fail(error);
      }
    }
  );
  server.registerTool(
    "studio_review",
    {
      title: "\u8BC4\u5BA1 Studio \u5F53\u524D\u753B\u9762",
      description: "\u4F7F\u7528\u6D4F\u89C8\u5668\u4E2D\u7684\u672A\u4FDD\u5B58\u7D20\u6750\u8FD0\u884C\u89C6\u89C9\u8BC4\u5BA1\uFF0C\u62A5\u544A\u968F\u5F53\u524D\u9879\u76EE\u4FDD\u5B58\u3002",
      inputSchema: {
        sessionId: z4.string().trim().min(1).describe("studio_context \u8FD4\u56DE\u7684\u4F1A\u8BDD ID"),
        asset: z4.string().trim().min(1).optional().describe("\u7D20\u6750 ID\uFF0C\u7701\u7565\u65F6\u4F7F\u7528\u4F1A\u8BDD\u5F53\u524D\u7D20\u6750"),
        frame: z4.number().min(0).max(1).optional().describe("\u52A8\u753B\u8FDB\u5EA6\uFF0C\u9ED8\u8BA4 1\uFF08\u672B\u5E27\uFF09")
      }
    },
    async ({ sessionId, asset, frame }) => {
      try {
        if (!bridge) throw new Error("\u8BF7\u7528 --bridge 7350 \u542F\u52A8 MCP\uFF1BStudio \u4F1A\u81EA\u52A8\u8FDE\u63A5\u672C\u673A\u6865");
        const result = await bridge.runCommand("review", { asset, frame }, sessionId);
        if (result.ok === false) throw new Error(result.error);
        return text(JSON.stringify(result.result, null, 2));
      } catch (error) {
        return fail(error);
      }
    }
  );
  server.registerTool(
    "review_read",
    {
      title: "\u8BFB\u53D6\u89C6\u89C9\u8BC4\u5BA1\u7ED3\u679C",
      description: "\u5206\u522B\u8BFB\u53D6\u89C4\u5219\u8BC4\u5BA1\u4E0E Agent \u8BC4\u5BA1\u5FEB\u7167\u3002\u5305\u542B PASS/FAIL/WARN/\u672A\u6D4B\u89C4\u5219\u660E\u7EC6\u3001Agent \u7ED3\u8BBA\u53CA\u5404\u81EA\u7684\u8FC7\u671F\u72B6\u6001\uFF1B\u8FC7\u671F\u7ED3\u679C\u4E0D\u4F1A\u4F5C\u4E3A\u5F53\u524D\u7ED3\u8BBA\u8FD4\u56DE\u3002",
      inputSchema: {
        path: z4.string().optional(),
        asset: z4.string().optional().describe("\u53EA\u8BFB\u4E00\u5F20\uFF1A\u7D20\u6750 id \u6216\u540D\u79F0")
      }
    },
    async ({ path: p2, asset }) => {
      try {
        const project = readProject(resolvePath(p2));
        const { reviewInputHash: reviewInputHash2 } = await Promise.resolve().then(() => (init_review(), review_exports));
        const assets = asset ? [findAsset(project, asset)] : project.assets;
        const rows = assets.map((a) => {
          const snap3 = a.review;
          const status = !snap3 ? "none" : snap3.inputHash !== reviewInputHash2(a, snap3.options || {}) ? "stale" : "ok";
          const agentSnap = a.agentReview;
          const agentReviewStatus = !agentSnap ? "none" : agentSnap.inputHash !== reviewInputHash2(a, agentSnap.options || {}) ? "stale" : "ok";
          return {
            id: a.id,
            name: a.name,
            status,
            review: status === "ok" ? {
              inputHash: snap3.inputHash,
              gate: snap3.gate,
              counts: snap3.counts,
              coverage: snap3.coverage,
              generatedAt: snap3.generatedAt,
              findings: snap3.findings || []
            } : null,
            lastReview: snap3 ? { generatedAt: snap3.generatedAt, gate: snap3.gate, findings: snap3.findings?.length || 0 } : null,
            agentReviewStatus,
            agentReview: agentReviewStatus === "ok" ? agentSnap : null,
            lastAgentReview: agentSnap ? { generatedAt: agentSnap.generatedAt, results: agentSnap.results?.length || 0 } : null
          };
        });
        return text(JSON.stringify(rows, null, 2));
      } catch (err) {
        return fail(err);
      }
    }
  );
  server.registerTool(
    "review_run",
    {
      title: "\u5728\u6D4F\u89C8\u5668\u91CC\u91CD\u8DD1\u89C6\u89C9\u8BC4\u5BA1",
      description: "\u8D77\u65E0\u5934 Chrome \u6253\u5F00\u6B63\u5728\u8FD0\u884C\u7684 Studio\uFF08\u9ED8\u8BA4 http://localhost:5188\uFF09\uFF0C\u5BF9\u9879\u76EE\u73B0\u7B97\u4E00\u6B21\u8BC4\u5BA1\u5E76\u8FD4\u56DE\u7ED3\u679C\u3002\u9879\u76EE\u6587\u4EF6\u5FC5\u987B\u80FD\u88AB Studio \u7AD9\u70B9\u8BBF\u95EE\u5230\u3002",
      inputSchema: {
        path: z4.string().optional(),
        asset: z4.string().optional().describe("\u53EA\u8BC4\u4E00\u5F20\uFF1B\u7701\u7565\u5219\u8BC4\u5168\u90E8"),
        appUrl: z4.string().optional().describe("Studio \u5730\u5740\uFF0C\u9ED8\u8BA4 http://localhost:5188"),
        projectUrl: z4.string().optional().describe("Studio \u53EF\u8BBF\u95EE\u7684\u9879\u76EE URL\uFF1B\u5199\u56DE\u524D\u4F1A\u6838\u5BF9\u7D20\u6750\u7248\u672C"),
        write: z4.boolean().optional().describe("\u628A\u7ED3\u679C\u5199\u56DE\u9879\u76EE\u6587\u4EF6")
      }
    },
    async ({ path: p2, asset, appUrl, projectUrl, write }) => {
      try {
        const { reviewProjectFile: reviewProjectFile2 } = await Promise.resolve().then(() => (init_projectReview(), projectReview_exports));
        const result = await reviewProjectFile2({ file: resolvePath(p2), appUrl, projectUrl, target: asset, write });
        return text(JSON.stringify(result, null, 2));
      } catch (err) {
        return fail(err);
      }
    }
  );
  server.registerTool(
    "agent_review_prompt",
    {
      title: "\u751F\u6210 Agent \u8BED\u4E49\u8BC4\u5BA1\u63D0\u793A\u8BCD",
      description: "\u4E3A\u6307\u5B9A\u7D20\u6750\u751F\u6210\u7ED1\u5B9A assetId\u3001\u8F93\u5165\u6307\u7EB9\u4E0E\u8BC4\u5BA1\u53E3\u5F84\u7684 Agent \u8BC4\u5BA1\u63D0\u793A\u8BCD\uFF0C\u5305\u542B\u6D4F\u89C8\u5668\u6E32\u67D3\u7684\u52A8\u753B\u672B\u5E27 SVG \u548C\u65E0\u6CD5\u91CF\u5316\u7684\u89C4\u5219\u3002",
      inputSchema: {
        path: z4.string().optional(),
        asset: z4.string().describe("\u7D20\u6750 id \u6216\u540D\u79F0"),
        appUrl: z4.string().optional().describe("Studio \u5730\u5740\uFF0C\u9ED8\u8BA4 http://localhost:5188"),
        projectUrl: z4.string().optional().describe("Studio \u53EF\u8BBF\u95EE\u7684\u9879\u76EE URL\uFF1B\u5199\u56DE\u524D\u4F1A\u6838\u5BF9\u7D20\u6750\u7248\u672C")
      }
    },
    async ({ path: p2, asset, appUrl, projectUrl }) => {
      try {
        const { agentPromptForProject: agentPromptForProject2 } = await Promise.resolve().then(() => (init_projectReview(), projectReview_exports));
        const result = await agentPromptForProject2({ file: resolvePath(p2), target: asset, appUrl, projectUrl });
        return text(JSON.stringify(result, null, 2));
      } catch (err) {
        return fail(err);
      }
    }
  );
  server.registerTool(
    "agent_review_submit",
    {
      title: "\u5BFC\u5165 Agent \u8BED\u4E49\u8BC4\u5BA1\u7ED3\u679C",
      description: "\u9A8C\u8BC1 Agent JSON \u4E2D\u7684\u7D20\u6750 ID\u3001inputHash\u3001options \u548C\u5B8C\u6574\u89C4\u5219\u7ED3\u8BBA\uFF1B\u53EF\u5148 dryRun \u9884\u89C8\uFF0C\u8BBE\u7F6E write \u540E\u5199\u56DE .mgsvg\u3002",
      inputSchema: {
        path: z4.string().optional(),
        asset: z4.string().describe("\u7D20\u6750 id \u6216\u540D\u79F0"),
        result: z4.any().describe("Agent \u8FD4\u56DE\u7684 JSON \u6587\u672C\u6216\u5BF9\u8C61\uFF0C\u5FC5\u987B\u5E26 assetId\u3001inputHash\u3001options\u3001reviews"),
        write: z4.boolean().optional().describe("\u9A8C\u8BC1\u540E\u5199\u56DE\u9879\u76EE\u6587\u4EF6"),
        dryRun: z4.boolean().optional().describe("\u914D\u5408 write \u53EA\u6821\u9A8C\u548C\u9884\u89C8\uFF0C\u4E0D\u843D\u76D8")
      }
    },
    async ({ path: p2, asset, result, write, dryRun }) => {
      try {
        const { saveAgentReviewResult: saveAgentReviewResult2 } = await Promise.resolve().then(() => (init_projectReview(), projectReview_exports));
        const saved = saveAgentReviewResult2({ file: resolvePath(p2), target: asset, document: result, write, dryRun });
        return text(JSON.stringify(saved, null, 2));
      } catch (err) {
        return fail(err);
      }
    }
  );
  server.registerTool(
    "project_apply_ops",
    {
      title: "\u6279\u91CF\u4FEE\u6539\u9879\u76EE",
      description: "\u5E94\u7528\u4E00\u6279\u64CD\u4F5C\u540E\u539F\u5B50\u5199\u56DE\u6587\u4EF6\u3002\u652F\u6301 asset.add/remove/update\u3001board.move\u3001anim.set/update/remove/layer/keyframes\u3001style.set/clear\u3001layout.set/clear\u3002",
      inputSchema: {
        path: z4.string().optional(),
        ops: z4.array(z4.any()).describe("\u64CD\u4F5C\u6570\u7EC4\uFF0C\u89C1\u9879\u76EE\u683C\u5F0F\u8BF4\u660E"),
        dryRun: z4.boolean().optional().describe("\u53EA\u6821\u9A8C\u4E0D\u5199\u6587\u4EF6")
      }
    },
    async ({ path: p2, ops, dryRun }) => {
      try {
        const file = resolvePath(p2);
        const { project, snapshot } = readProjectFile(file);
        const { project: next, log } = applyOps(project, ops);
        const check = validateProject(next);
        if (!check.ok) return fail(new Error("\u6821\u9A8C\u5931\u8D25\uFF1A" + check.problems.join("\uFF1B")));
        if (!dryRun) writeProject(file, next, snapshot);
        return text(
          JSON.stringify(
            {
              written: !dryRun,
              file,
              applied: log,
              outline: outline(next, { elements: false })
            },
            null,
            2
          )
        );
      } catch (err) {
        return fail(err);
      }
    }
  );
  server.registerTool(
    "project_add_asset",
    {
      title: "\u6DFB\u52A0\u7D20\u6750",
      description: "\u628A\u4E00\u4EFD SVG \u52A0\u5165\u9879\u76EE\uFF08\u89E3\u6790\u51FA\u5143\u7D20\u7D22\u5F15\u4E0E\u53EF\u7F16\u8F91\u52A8\u753B\uFF09\uFF0C\u8FD4\u56DE\u65B0\u7D20\u6750\u7684 id\u3002",
      inputSchema: {
        path: z4.string().optional(),
        name: z4.string().describe("\u7D20\u6750\u540D\u79F0"),
        svg: z4.string().optional().describe("SVG \u6E90\u7801"),
        svgPath: z4.string().optional().describe("\u6216\u8005\u7ED9\u4E00\u4E2A\u672C\u5730 SVG \u6587\u4EF6\u8DEF\u5F84"),
        x: z4.number().optional().describe("\u753B\u5E03\u4F4D\u7F6E x"),
        y: z4.number().optional().describe("\u753B\u5E03\u4F4D\u7F6E y")
      }
    },
    async ({ path: p2, name, svg, svgPath, x: x2, y: y2 }) => {
      try {
        const file = resolvePath(p2);
        const source = svg || (svgPath ? fs4.readFileSync(path4.resolve(svgPath), "utf8") : "");
        if (!source) return fail(new Error("\u9700\u8981 svg \u6216 svgPath"));
        const { project, snapshot } = readProjectFile(file);
        const asset = buildAssetFromSvg(source, name, { x: x2, y: y2 });
        project.assets.push(asset);
        const check = validateProject(project);
        if (!check.ok) return fail(new Error("\u6821\u9A8C\u5931\u8D25\uFF1A" + check.problems.join("\uFF1B")));
        writeProject(file, project, snapshot);
        return text(
          JSON.stringify(
            {
              assetId: asset.id,
              name: asset.name,
              groups: asset.groups.map((g2) => ({ id: g2.id, name: g2.name, targets: g2.targetIds?.length || 1 })),
              elements: asset.elements?.length || 0,
              warnings: asset.warnings
            },
            null,
            2
          )
        );
      } catch (err) {
        return fail(err);
      }
    }
  );
  server.registerTool(
    "project_validate",
    {
      title: "\u6821\u9A8C\u9879\u76EE",
      description: "\u68C0\u67E5\u7D20\u6750/\u5143\u7D20/\u52A8\u753B\u5F15\u7528\u662F\u5426\u4E00\u81F4\uFF0C\u8FD4\u56DE\u95EE\u9898\u5217\u8868\u3002",
      inputSchema: { path: z4.string().optional() }
    },
    async ({ path: p2 }) => {
      try {
        const project = readProject(resolvePath(p2));
        const result = validateProject(project);
        return text(JSON.stringify({ ...result, assets: project.assets.length }, null, 2));
      } catch (err) {
        return fail(err);
      }
    }
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[mg-svg-studio] MCP server ready \xB7 project=${defaultPath}`);
}
var FORMAT_DOC;
var init_server = __esm({
  "src/mcp/server.ts"() {
    init_io();
    init_project();
    FORMAT_DOC = `# MG SVG Studio \u9879\u76EE\u6587\u4EF6

\u4E00\u4E2A\u9879\u76EE\u662F\u4E00\u4E2A JSON \u6587\u4EF6\uFF08\u9ED8\u8BA4 project.mgsvg\uFF09\uFF0C\u7ED3\u6784\uFF1A

{
  "format": "mg-svg-studio/project",
  "version": 1,
  "name": "\u7D20\u6750\u5E93\u540D\u5B57",
  "assets": [{
    "id": "a_xxx", "name": "\u7D20\u6750\u540D", "x": 0, "y": 0,
    "width": 1920, "height": 1080, "kind": "animated",
    "svg": "<svg \u2026>",
    "elements": [{ "id": "0.79.82", "tag": "g", "label": "#name", "depth": 2, "kind": "group" }],
    "groups": [{ "id": "g1", "name": "charIn", "targetId": "0.1", "targetIds": ["0.1","0.2"],
                 "stagger": 0.085, "duration": 0.8, "delay": 0.95,
                 "ease": "cubic-bezier(.4,0,.2,1)", "iterations": 1,
                 "direction": "normal", "fillMode": "both", "origin": "css",
                 "originPoint": { "x": 0.5, "y": 1 },
                 "tracks": [{ "id": "t1", "property": "opacity",
                              "keyframes": [{ "offset": 0, "value": "0" }, { "offset": 1, "value": "1" }] }] }],
    "overrides": { "0.1.11": { "fill": "#e11d48" } },
    "layouts": { "0.1": { "mode": "row", "gap": 24 } }
  }]
}

\u8981\u70B9\uFF1A
- id \u90FD\u662F\u7A33\u5B9A\u7684\uFF1A\u5143\u7D20 id \u7531 SVG \u6587\u6863\u987A\u5E8F\u751F\u6210\uFF08\u5982 "0.1.11"\uFF09\uFF0C\u7D20\u6750 id \u5728\u5BFC\u5165\u65F6\u751F\u6210\u3002
- \u52A8\u753B\u8F68\u9053\uFF08groups\uFF09\u4F5C\u7528\u5728\u5143\u7D20\u4E0A\uFF1BtargetIds + stagger \u8868\u793A\u4E00\u6761\u300C\u5206\u5C42\u300D\uFF0C\u540C\u4E00\u7EC4\u5173\u952E\u5E27\u4F5C\u7528\u5728\u591A\u4E2A\u5143\u7D20\u4E0A\uFF0C\u9010\u4E2A\u5EF6\u8FDF\u3002
- overrides \u662F\u5143\u7D20\u6837\u5F0F\u8986\u76D6\uFF08fill/stroke/strokeWidth/opacity/fontSize/...\uFF09\u3002
- layouts \u662F\u5BB9\u5668\u5E03\u5C40 spec\uFF08mode: row|column|grid|free\uFF0Cgap/padding/cols/alignX/alignY/justify/wrap\uFF09\u3002
- review \u4FDD\u5B58\u89C4\u5219\u8BC4\u5BA1\u7ED3\u679C\uFF08PASS \u6B63\u4F8B\u3001FAIL/WARN \u53CD\u4F8B\u3001\u672A\u6D4B\u9879\uFF09\u53CA inputHash\uFF1BagentReview \u5355\u72EC\u4FDD\u5B58 Agent \u8BED\u4E49\u7ED3\u679C\uFF0C\u4E0D\u6DF7\u5165\u89C4\u5219\u95F8\u95E8\u3002
- \u5199\u6587\u4EF6\u524D\u5148\u8BFB\u6587\u4EF6\uFF1Bapply_ops \u4F1A\u505A\u6821\u9A8C\u5E76\u539F\u5B50\u66FF\u6362\u3002\u4E5F\u53EF\u4EE5\u76F4\u63A5\u7528\u6587\u672C\u7F16\u8F91\u5668\u6539\u8FD9\u4E2A JSON\u3002`;
  }
});

// src/cli/index.ts
init_io();
init_project();
init_bridge_protocol();
init_style_patch();
init_project_schema();
init_detect();
init_review();
init_projectReview();
init_args();
import fs5 from "node:fs";
import path5 from "node:path";
var HELP = `mgsvg \u2014 MG SVG Studio \u9879\u76EE\u6587\u4EF6\u5DE5\u5177\uFF08Agent \u53EF\u76F4\u63A5\u6539\u6587\u4EF6\uFF09

\u7528\u6CD5\uFF1A
  mgsvg init    <project> [--name \u540D\u79F0] [--force]
  mgsvg outline <project> [--asset <id>] [--elements] [--json]
  mgsvg apply   <project> --ops <file|-> [--dry-run] [--json]
  mgsvg add     <project> --svg <file> --name <name> [--x 0] [--y 0] [--width 0] [--height 0] [--dry-run]
  mgsvg replace <project> --asset <id> --svg <file> [--dry-run]
  mgsvg style   <project> --asset <id> --element <id|label> --set fill=#f00 [--set opacity=0.5] [--clear]
  mgsvg anim    <project> --asset <id> --group <id|name> --set duration=1.2 [--set ease=power2.out]
  mgsvg layer   <project> --asset <id> --group <id|name> --targets a,b,c [--stagger 0.08]
  mgsvg layout  <project> --asset <id> --container <id|label> --mode row --gap 40 [--cols 3] [--padding 0]
  mgsvg review <project> [--asset <id|name>] [--json] [--run] [--write]
  mgsvg review <project> --agent-prompt --asset <id|name> [--app <url>] [--project-url <path>]
  mgsvg review <project> --agent-result <file|-> --asset <id|name> (--write | --dry-run)
  mgsvg version list|restore|delete --asset <id> (--session <id> | --current) [--id v] [--ids v,v]
  mgsvg bridge  [--port 7350]                  \u5F00\u672C\u5730\u9009\u62E9\u6865\uFF08Agent \u7528\u5B83\u770B\u4F60\u5728\u9009\u4EC0\u4E48\uFF09
  mgsvg context [--bridge 7350] [--session <id>] [--wait 30] [--after <selectionId>] [--json]
  mgsvg live    [--bridge 7350] (--session <id> | --current) [--asset <id>] [--element <id>]
                --set fill=#f00 | --clear | --select <id|label> | --add <svg> [--name \u540D\u79F0] | --asset <id> --replace <svg\u6587\u4EF6>\uFF08\u539F\u5730\u66FF\u6362\uFF09 | --asset <id> --remove\uFF08\u5220\u9664\uFF09 | --asset <\u76EE\u6807> --merge <\u7D20\u6750id,...> | --asset <id> --restore <\u7248\u672Cid> | --save [--force] | --reload | --review [--frame 0..1]
  mgsvg validate <project> [--json]
  mgsvg mcp     [--project <project>] [--bridge <port>]   \u542F\u52A8 MCP server\uFF08stdio\uFF0C\u53EF\u5E26\u9009\u62E9\u6865\uFF09

context / bridge\uFF1A
  bridge  \u5E38\u9A7B\u5F00\u4E00\u4E2A http://127.0.0.1:7350 \u7684\u6865\uFF1BStudio \u9ED8\u8BA4\u8FDE\u63A5\u6B64\u7AEF\u53E3\uFF0C
          \u4F60\u9009\u4E2D\u4EC0\u4E48\u90FD\u4F1A\u63A8\u5230\u6865\u4E0A\uFF0CAgent \u8BFB context \u5C31\u80FD\u77E5\u9053\u662F\u54EA\u4E2A\u5143\u7D20\u3002
  context \u8BFB\u5F53\u524D\u9009\u533A\u3002--wait \u7B49\u9009\u533A\u53D8\u5316\uFF0C--after \u53EF\u6307\u5B9A\u4E4B\u524D\u7684 selectionId\u3002
  live    \u5728 Studio \u4E2D\u5373\u65F6\u5E94\u7528\uFF1B--add \u76F4\u63A5\u52A0\u5165\u5F53\u524D\u7D20\u6750\u5E93\u5E76\u81EA\u52A8\u6392\u5E03\u3002--save \u4FDD\u5B58\u5DF2\u94FE\u63A5\u7684 .mgsvg\u3002
          --reload \u4ECE\u5DF2\u94FE\u63A5\u6587\u4EF6\u91CD\u65B0\u8F7D\u5165\uFF1B--review \u8BC4\u5BA1\u672A\u4FDD\u5B58\u7684\u7D20\u6750\uFF0C\u9ED8\u8BA4\u672B\u5E27\u3002
          \u591A\u4E2A\u9875\u9762\u8FDE\u63A5\u540C\u4E00\u6865\u65F6\u4F18\u5148\u7528 --session \u9501\u5B9A\u76EE\u6807\u3002

review\uFF1A
  \u9ED8\u8BA4\u8BFB\u9879\u76EE\u6587\u4EF6\u91CC\u5B58\u7740\u7684\u8BC4\u5BA1\u5FEB\u7167\uFF08\u9762\u677F\u8DD1\u8FC7\u3001\u4FDD\u5B58\u8FC7\u5C31\u6709\uFF09\uFF0C\u5E76\u6807\u51FA\u8FC7\u671F\u3002
  --run      \u8D77\u65E0\u5934 Chrome \u6253\u5F00\u6B63\u5728\u8DD1\u7684 Studio \u73B0\u7B97\u4E00\u6B21\uFF08\u9700\u8981 --app\uFF0C\u9ED8\u8BA4 http://localhost:5188\uFF09
  --write    \u628A --run \u7684\u7ED3\u679C\u5199\u56DE\u9879\u76EE\u6587\u4EF6
  --agent-prompt \u751F\u6210\u5E26\u5F53\u524D\u672B\u5E27 SVG \u548C\u89C4\u5219\u6307\u7EB9\u7684 Agent \u8BED\u4E49\u8BC4\u5BA1\u63D0\u793A\u8BCD
  --agent-result  \u5BFC\u5165 Agent \u8FD4\u56DE\u7684 JSON\uFF1B--write \u4FDD\u5B58\uFF0C--dry-run \u53EA\u6821\u9A8C\uFF0C\u8DEF\u5F84\u4E3A - \u65F6\u4ECE stdin \u8BFB\u53D6
  --app <url>        Studio \u5730\u5740
  --project-url <p>  Studio \u4E0A\u9879\u76EE\u6587\u4EF6\u7684\u53EF\u8BBF\u95EE\u8DEF\u5F84\uFF08\u9ED8\u8BA4\u6309\u5F53\u524D\u76EE\u5F55\u63A8\u7B97\uFF09

\u901A\u7528\uFF1A
  --help            \u663E\u793A\u5E2E\u52A9
  --json            stdout \u8F93\u51FA\u4E00\u4E2A\u5BF9\u8C61\uFF0C\u542B ok\u3001status\u3001result \u6216 code\u3001error

\u9879\u76EE\u6587\u4EF6\u662F JSON\uFF1A{ format, version, name, assets:[...] }\uFF0Cassets \u91CC\u5C31\u662F svg / groups / overrides / layouts\u3002
\u6240\u6709\u5199\u64CD\u4F5C\u5148\u5B8C\u6574\u6821\u9A8C\u3001\u518D\u539F\u5B50\u66FF\u6362\u539F\u6587\u4EF6\uFF0C\u5931\u8D25\u4E0D\u4F1A\u7559\u4E0B\u534A\u4E2A\u6587\u4EF6\u3002
`;
function fmtContext(ctx, oneLine) {
  const asset = ctx.asset ? `${ctx.asset.name} (${ctx.asset.id})` : "-";
  const el = ctx.element;
  if (oneLine) {
    const desc = el ? `${el.id}${el.label ? " " + el.label : ""}${el.text ? ` \u201C${String(el.text).slice(0, 14)}\u201D` : ""}` : "\uFF08\u672A\u9009\u5143\u7D20\uFF09";
    return `${new Date(ctx.ts).toLocaleTimeString()} \xB7 ${asset} \xB7 ${desc}`;
  }
  const lines = [];
  const file = ctx.project?.file || "";
  lines.push(`\u9879\u76EE\uFF1A${ctx.project?.name || "-"}${file ? ` (${file})` : ""}`);
  lines.push(`\u4F1A\u8BDD\uFF1A${ctx.sessionId}`);
  lines.push(`\u9009\u533A\u7248\u672C\uFF1A${ctx.selectionId}`);
  lines.push(`\u7D20\u6750\uFF1A${asset}`);
  if (el) {
    const kindLabel = { text: "\u6587\u5B57", shape: "\u56FE\u5F62", group: "\u7EC4", image: "\u56FE\u7247" };
    const kind = kindLabel[el.kind || ""] || el.kind || el.tag || "";
    lines.push(`\u9009\u4E2D\uFF1A${el.id}  ${kind}${el.label ? `  label=${el.label}` : ""}`);
    if (el.text) lines.push(`\u6587\u5B57\uFF1A${el.text}`);
    if (el.rect) {
      lines.push(`\u4F4D\u7F6E\uFF1A${Math.round(el.rect.x)},${Math.round(el.rect.y)}  ${Math.round(el.rect.width)}\xD7${Math.round(el.rect.height)}`);
    }
    const ov = el.overrides && Object.keys(el.overrides).length ? el.overrides : null;
    if (ov) lines.push(`\u8986\u76D6\uFF1A${JSON.stringify(ov)}`);
  } else {
    lines.push("\u9009\u4E2D\uFF1A\uFF08\u53EA\u9009\u4E86\u7D20\u6750\uFF0C\u6CA1\u9009\u5143\u7D20\uFF09");
  }
  if (ctx.review) {
    const c = ctx.review.counts || {};
    lines.push(`\u8BC4\u5BA1\uFF1A${ctx.review.gate} \xB7 \u786C\u4F24 ${c.FAIL ?? 0} \xB7 \u63D0\u793A ${c.WARN ?? 0}`);
    for (const f2 of (ctx.review.findingsForElement || []).slice(0, 6)) {
      lines.push(`  \xB7 ${f2.ruleId} ${f2.level} ${f2.title || ""}  ${f2.measured ?? ""}${f2.unit || ""}`);
    }
  }
  return lines.join("\n");
}
var argv = process.argv.slice(2);
var jsonMode = argv.slice(0, argv.indexOf("--") === -1 ? argv.length : argv.indexOf("--")).some((arg) => arg === "--json" || arg.startsWith("--json="));
var sleep2 = (ms2) => new Promise((resolve) => setTimeout(resolve, ms2));
function success(status, result, human) {
  if (jsonMode) console.log(JSON.stringify({ ok: true, status, result }, null, 2));
  else human();
}
function checkProject(project) {
  const result = validateProject(project);
  if (!result.ok) throw new CliError("VALIDATION_FAILED", "\u9879\u76EE\u6821\u9A8C\u672A\u901A\u8FC7", result.problems);
}
function saveProject(file, project, flags, snapshot) {
  checkProject(project);
  if (flags["dry-run"]) return { file: path5.resolve(file), written: false };
  return { file: writeProject(file, project, snapshot), written: true };
}
function setPairs(flags, numeric, parseOther) {
  const entries = /* @__PURE__ */ new Map();
  for (const pair of flags.set ?? []) {
    const eq = pair.indexOf("=");
    const key = pair.slice(0, eq).trim();
    if (eq < 1 || !key) usage(`--set \u9700\u8981 key=value\uFF0C\u6536\u5230\uFF1A${pair}`);
    if (entries.has(key)) usage(`--set \u5C5E\u6027 ${key} \u53EA\u80FD\u4F20\u4E00\u6B21`);
    const raw = pair.slice(eq + 1);
    if (numeric.has(key)) {
      const number = raw.trim() ? Number(raw) : NaN;
      if (!Number.isFinite(number)) usage(`--set ${key} \u9700\u8981\u6709\u9650\u6570\u5B57`);
      entries.set(key, number);
    } else entries.set(key, parseOther(raw));
  }
  return Object.fromEntries(entries);
}
async function bridgeFetch(url, options, commandId) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(2e3) });
  } catch {
    if (commandId) throw new CliError("COMMAND_UNCONFIRMED", "\u65E0\u6CD5\u8BFB\u53D6\u547D\u4EE4\u7ED3\u679C\uFF0C\u8BF7\u5148\u68C0\u67E5 Studio \u72B6\u6001", { commandId });
    throw new CliError("BRIDGE_UNREACHABLE", `\u8BFB\u4E0D\u5230\u672C\u5730\u6865\uFF08${new URL(url).origin}\uFF09`);
  }
}
async function readContext(flags) {
  const port = portOf(flags, "bridge", 7350);
  const wait = num2(flags, "wait") ?? 0;
  if (wait < 0 || wait > 600) usage("--wait \u9700\u8981 0\u2013600 \u79D2");
  const session = str(flags, "session");
  const after = str(flags, "after");
  if (after && !wait) usage("--after \u9700\u8981\u540C\u65F6\u6307\u5B9A --wait");
  const query = session ? `?session=${encodeURIComponent(session)}` : "";
  const read = async () => {
    const response = await bridgeFetch(`http://127.0.0.1:${port}/context${query}`);
    if (response.status === 204) return null;
    if (!response.ok) throw new CliError("BRIDGE_ERROR", `\u8BFB\u53D6\u9009\u533A\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`);
    return await response.json();
  };
  let context3 = await read();
  if (wait) {
    const baseline = after ?? context3?.selectionId;
    const deadline = Date.now() + wait * 1e3;
    while ((!context3 || context3.selectionId === baseline) && Date.now() < deadline) {
      await sleep2(Math.min(250, deadline - Date.now()));
      context3 = await read();
    }
    if (!context3 || context3.selectionId === baseline) throw new CliError("NO_NEW_SELECTION", "\u7B49\u5F85\u8D85\u65F6\uFF0C\u671F\u95F4\u6CA1\u6709\u65B0\u9009\u533A");
  }
  if (!context3) throw new CliError(session ? "SESSION_NOT_FOUND" : "NO_CONTEXT", `\u672A\u6536\u5230 Studio \u9009\u533A\uFF0C\u8BF7\u786E\u8BA4\u672C\u673A 7350 \u7AEF\u53E3\u7684\u6865\u5DF2\u542F\u52A8\uFF0C\u5E76\u5237\u65B0 Studio \u9875\u9762`);
  success("read", context3, () => console.log(fmtContext(context3, false)));
}
async function runLive(flags) {
  const sessionId = str(flags, "session");
  const current = flags.current === true;
  if (Boolean(sessionId) === current) usage("\u8BF7\u4F7F\u7528 --session <id> \u9501\u5B9A\u76EE\u6807\uFF0C\u6216\u663E\u5F0F\u4F20 --current");
  const batchAssets = (str(flags, "assets") || "").split(",").map((v2) => v2.trim()).filter(Boolean);
  const asset = str(flags, "asset") || batchAssets[0];
  const element = str(flags, "element");
  const select = str(flags, "select");
  const set = Boolean(flags.set);
  const clear = flags.clear === true;
  const save = flags.save === true;
  const reload = flags.reload === true;
  const review = flags.review === true;
  const add = str(flags, "add");
  const merge = str(flags, "merge");
  const replace = str(flags, "replace");
  const remove = !!flags.remove;
  const listVersions = !!flags.versions;
  const restoreVersion = str(flags, "restore");
  const deleteVersions = str(flags, "delete-versions");
  if (merge && (!asset || add)) usage("--merge \u9700\u8981 --asset \u6307\u5B9A\u76EE\u6807\u7D20\u6750");
  const name = str(flags, "name");
  if ([set, clear, save, reload, review, Boolean(select), Boolean(add), Boolean(merge), Boolean(replace), Boolean(remove), Boolean(listVersions && asset), Boolean(restoreVersion && asset), Boolean(deleteVersions && asset)].filter(Boolean).length !== 1) {
    usage("\u8BF7\u9009\u62E9\u4E00\u79CD\u64CD\u4F5C\uFF1A--set\u3001--clear\u3001--select\u3001--add\u3001--save\u3001--reload \u6216 --review");
  }
  if (sessionId && (set || clear) && (!asset || !element)) usage("\u9501\u5B9A\u5B9E\u65F6\u4FEE\u6539\u65F6\u9700\u8981 --asset \u548C --element");
  if ((save || reload) && (asset || element) || (review || select) && element || add && (asset || element || select)) usage("\u8BE5\u64CD\u4F5C\u4E0D\u63A5\u53D7\u6B64\u7D20\u6750\u6216\u5143\u7D20\u53C2\u6570");
  if (name && !add) usage("--name \u53EA\u7528\u4E8E --add");
  const frame = num2(flags, "frame");
  if (frame !== void 0 && (!review || frame < 0 || frame > 1)) usage("--frame \u53EA\u7528\u4E8E --review\uFF0C\u8303\u56F4\u4E3A 0\u20131");
  const type = save ? "save" : reload ? "project.reload" : review ? "review" : select ? "select" : add ? "asset.add" : merge && asset ? "asset.mergeVersions" : replace && asset ? "asset.replaceSvg" : remove && asset ? "asset.remove" : listVersions && asset ? "asset.versions" : restoreVersion && asset ? "asset.restoreVersion" : deleteVersions && asset ? "asset.deleteVersions" : clear ? "style.clear" : "style.set";
  const payload = { asset, element: select || element, frame };
  if (set) payload.patch = parseStylePatch(setPairs(flags, NUMERIC_STYLE, (value) => value));
  if (merge) payload.sources = merge.split(",").map((v2) => v2.trim()).filter(Boolean);
  if (replace) payload.svg = fs5.readFileSync(path5.resolve(replace), "utf8");
  if (restoreVersion) payload.versionId = restoreVersion;
  if (deleteVersions) payload.versionIds = deleteVersions.split(",").map((v2) => v2.trim()).filter(Boolean);
  if (save && flags.force) payload.force = true;
  if (add) {
    payload.svg = fs5.readFileSync(path5.resolve(add), "utf8");
    payload.name = name || path5.basename(add, path5.extname(add));
  }
  const port = portOf(flags, "bridge", 7350);
  const base = `http://127.0.0.1:${port}`;
  const multi = (str(flags, "assets") || "").split(",").map((v2) => v2.trim()).filter(Boolean);
  const targets = multi.length ? multi : asset ? [asset] : [];
  if (!targets.length) {
    const result = await sendLiveCommand(base, type, payload, sessionId, current);
    if (flags.json) console.log(JSON.stringify(result, null, 2));
    else console.log(describeLiveResult(type, result, { add, replace, remove, merge, restoreVersion, deleteVersions }));
    return;
  }
  const collected = [];
  for (const target of targets) {
    const result = await sendLiveCommand(base, type, { ...payload, asset: target }, sessionId, current);
    collected.push(result);
    if (!flags.json) console.log(describeLiveResult(type, result, { add, replace, remove, merge, restoreVersion, deleteVersions }));
  }
  if (flags.json) console.log(JSON.stringify(collected.length === 1 ? collected[0] : collected, null, 2));
}
function describeLiveResult(type, raw, flags) {
  const d2 = raw ?? {};
  switch (type) {
    case "save":
      return `\u2713 \u5DF2\u4FDD\u5B58 ${d2.file ?? ""}${d2.dirty ? "\uFF0C\u4FDD\u5B58\u671F\u95F4\u6709\u65B0\u7684\u672A\u4FDD\u5B58\u6539\u52A8" : ""}`;
    case "project.reload":
      return `\u2713 \u5DF2\u91CD\u65B0\u8F7D\u5165 ${d2.file ?? ""}\uFF08${d2.assets ?? 0} \u4E2A\u7D20\u6750\uFF09`;
    case "review":
      return `${d2.assetName ?? d2.asset ?? ""}\uFF1A${d2.gate ?? "?"} \xB7 ${d2.counts?.FAIL ?? 0} \u786C\u4F24 / ${d2.counts?.WARN ?? 0} \u63D0\u793A`;
    case "select":
      return `\u2713 \u5DF2\u9009\u4E2D ${d2.selection?.elementId || d2.selection?.assetId || "\u7D20\u6750"}`;
    case "asset.add":
      return `\u2713 \u5DF2\u6DFB\u52A0 ${d2.name ?? ""}\uFF08${d2.asset ?? ""}\uFF09${d2.width ?? "?"}\xD7${d2.height ?? "?"}`;
    case "asset.versions":
      return d2.versions?.length ? d2.versions.map((v2) => `v${v2.index}  ${v2.createdAt ? new Date(v2.createdAt).toLocaleString() : ""}  ${v2.bytes ?? ""}B`).join("\n") : "\u8FD9\u4E2A\u7D20\u6750\u8FD8\u6CA1\u6709\u7248\u672C\u8BB0\u5F55";
    case "asset.mergeVersions":
      return `\u2713 \u5DF2\u5E76\u5165 ${d2.merged ?? 0} \u4E2A\u7248\u672C\uFF0C\u5F53\u524D\u6700\u9AD8 v${d2.index ?? "?"}`;
    case "asset.restoreVersion":
      return `\u2713 \u5DF2\u6062\u590D\u5230 v${d2.index ?? "?"}\uFF08${d2.width ?? "?"}\xD7${d2.height ?? "?"}\uFF09`;
    case "asset.deleteVersions":
      return `\u2713 \u5DF2\u5220\u9664 ${d2.removed ?? 0} \u4E2A\u7248\u672C`;
    case "asset.replaceSvg":
      return `\u2713 \u5DF2\u66FF\u6362\u7D20\u6750\u5185\u5BB9\uFF08${d2.width ?? "?"}\xD7${d2.height ?? "?"}\uFF09`;
    case "asset.remove":
      return `\u2713 \u5DF2\u5220\u9664\u7D20\u6750\u300C${d2.name ?? ""}\u300D`;
    case "style.clear":
      return `\u2713 \u5DF2\u6E05\u9664 ${d2.element ?? "\u5143\u7D20"} \u7684\u6837\u5F0F\u8986\u76D6`;
    default:
      return `\u2713 \u5DF2\u66F4\u65B0 ${d2.element ?? "\u5143\u7D20"}${d2.overrides ? `\uFF1A${Object.keys(d2.overrides).join(", ")}` : ""}`;
  }
}
async function sendLiveCommand(base, type, payload, sessionId, current) {
  const queued = await bridgeFetch(`${base}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, payload, sessionId, current })
  });
  const { id: id2, code, error } = await queued.json().catch(() => ({}));
  if (!queued.ok || !id2) throw new CliError(code || "BRIDGE_ERROR", error || `\u6865\u62D2\u7EDD\u4E86\u8FD9\u6761\u547D\u4EE4\uFF08HTTP ${queued.status}\uFF09`);
  const deadline = Date.now() + bridgeCommandTimeout(type) + 1e3;
  while (Date.now() < deadline) {
    const response = await bridgeFetch(`${base}/command/result?id=${encodeURIComponent(id2)}`, void 0, id2);
    if (response.status === 200) {
      const outcome = await response.json();
      if (outcome.ok === false) throw new CliError(outcome.code || "STUDIO_ERROR", outcome.error, { commandId: id2 });
      return outcome.result;
    }
    if (response.status !== 204) break;
    await sleep2(120);
  }
  throw new CliError("COMMAND_UNCONFIRMED", "\u672A\u6536\u5230 Studio \u7684\u7ED3\u679C\uFF0C\u8BF7\u5148\u68C0\u67E5\u5F53\u524D\u72B6\u6001", { commandId: id2 });
}
async function main() {
  const { cmd, flags, file } = parseArgv(argv);
  if (flags.help || cmd === "help") {
    success("help", HELP, () => console.log(HELP));
    return;
  }
  if (cmd === "mcp") {
    const { startMcpServer: startMcpServer2 } = await Promise.resolve().then(() => (init_server(), server_exports));
    await startMcpServer2(str(flags, "project") || file, portOf(flags, "bridge"));
    return;
  }
  if (cmd === "bridge") {
    const { startBridge: startBridge2 } = await Promise.resolve().then(() => (init_bridge(), bridge_exports));
    const port = portOf(flags, "port", 7350);
    const bridge = await startBridge2(port);
    console.log(`\u9009\u62E9\u6865\u5DF2\u5F00\u5728 http://127.0.0.1:${port}
Studio \u9ED8\u8BA4\u8FDE\u63A5\u672C\u673A 7350 \u7AEF\u53E3\uFF1B\u5982\u679C\u521A\u542F\u52A8\u6865\uFF0C\u8BF7\u5237\u65B0 Studio \u9875\u9762`);
    console.log("\u9009\u4E2D\u5143\u7D20\u65F6\u8FD9\u91CC\u4F1A\u6253\u5370\u4E00\u884C\uFF1BCtrl-C \u9000\u51FA");
    let last = "";
    const timer = setInterval(() => {
      const context3 = bridge.getContext();
      if (!context3 || context3.selectionId === last) return;
      last = context3.selectionId;
      console.log(fmtContext(context3, true));
    }, 300);
    const stop = async () => {
      clearInterval(timer);
      await bridge.close();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return;
  }
  if (cmd === "context") return readContext(flags);
  if (cmd === "version") {
    const sub = file || "list";
    const target = str(flags, "asset");
    if (!target) usage("version \u9700\u8981 --asset \u6307\u5B9A\u7D20\u6750");
    if (sub === "list") flags.versions = true;
    else if (sub === "restore") {
      const id2 = str(flags, "id");
      if (!id2) usage("version restore \u9700\u8981 --id <\u7248\u672C id>");
      flags.restore = id2;
    } else if (sub === "delete") {
      const ids = str(flags, "ids");
      if (!ids) usage("version delete \u9700\u8981 --ids <\u7248\u672C id,...>");
      flags["delete-versions"] = ids;
    } else usage("version \u652F\u6301 list / restore / delete");
    return runLive(flags);
  }
  if (cmd === "live") return runLive(flags);
  if (cmd === "init") {
    const target = file || str(flags, "project");
    if (!target) usage("\u7F3A\u5C11\u9879\u76EE\u6587\u4EF6\u8DEF\u5F84");
    const abs = path5.resolve(target);
    if (fs5.existsSync(abs) && !flags.force) throw new CliError("FILE_EXISTS", `\u6587\u4EF6\u5DF2\u5B58\u5728\uFF1A${abs}\uFF08\u52A0 --force \u8986\u76D6\uFF09`);
    const project2 = {
      format: "mg-svg-studio/project",
      version: 1,
      name: str(flags, "name") || path5.basename(target).replace(/\.(mgsvg|json)$/i, ""),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      assets: []
    };
    const outcome2 = saveProject(abs, project2, flags);
    success("written", outcome2, () => console.log(`\u2713 \u5DF2\u521B\u5EFA ${path5.relative(process.cwd(), outcome2.file)}`));
    return;
  }
  if (!file) usage("\u7F3A\u5C11\u9879\u76EE\u6587\u4EF6\u8DEF\u5F84");
  if (cmd === "validate") {
    const project2 = readProject(file);
    checkProject(project2);
    success("validated", { assets: project2.assets.length, problems: [] }, () => console.log(`\u2713 ${project2.assets.length} \u4E2A\u7D20\u6750\uFF0C\u6821\u9A8C\u901A\u8FC7`));
    return;
  }
  if (cmd === "outline") {
    const project2 = readProject(file);
    const assetId = str(flags, "asset");
    const assets = assetId ? [findAsset(project2, assetId)] : project2.assets;
    const rows = assets.map((a) => ({
      id: a.id,
      name: a.name,
      size: [a.width, a.height],
      position: [a.x, a.y],
      kind: a.kind,
      // 原生素材（lottie / gsap）的动画在运行时里：没有元素索引，也没有轨道，
      // 逐元素与轨道类命令都不适用。这里显式给出，免得 Agent 靠 kind 猜。
      format: a.format || "svg",
      duration: a.duration,
      editable: (a.format || "svg") === "svg",
      groups: a.groups,
      layouts: a.layouts,
      overrides: a.overrides,
      elements: flags.elements ? a.elements : void 0,
      warnings: a.warnings
    }));
    success("read", rows, () => console.log(outline(project2, { assetId, elements: !!flags.elements })));
    return;
  }
  if (cmd === "review") {
    const target = str(flags, "asset");
    const agentPrompt = !!flags["agent-prompt"];
    const agentResultFile = str(flags, "agent-result");
    if (agentPrompt && agentResultFile) usage("--agent-prompt \u4E0E --agent-result \u4E0D\u80FD\u540C\u65F6\u4F7F\u7528");
    if ((agentPrompt || agentResultFile) && flags.run) usage("Agent \u63D0\u793A\u8BCD/\u7ED3\u679C\u5BFC\u5165\u4E0E --run \u4E0D\u80FD\u540C\u65F6\u4F7F\u7528");
    if (agentPrompt) {
      if (!target) usage("--agent-prompt \u9700\u8981 --asset \u6307\u5B9A\u5355\u4E2A\u7D20\u6750");
      if (flags.write || flags["dry-run"]) usage("--agent-prompt \u4E0D\u63A5\u6536 --write \u6216 --dry-run");
      const result = await agentPromptForProject({ file, target, appUrl: str(flags, "app"), projectUrl: str(flags, "project-url") });
      success("agent_prompt", result, () => console.log(result.prompt));
    } else if (agentResultFile) {
      if (!target) usage("--agent-result \u9700\u8981 --asset \u6307\u5B9A\u5355\u4E2A\u7D20\u6750");
      if (!flags.write && !flags["dry-run"]) usage("--agent-result \u9700\u8981 --write\uFF1B\u53EF\u52A0 --dry-run \u9884\u89C8");
      if (str(flags, "app") || str(flags, "project-url")) usage("--app \u548C --project-url \u53EA\u7528\u4E8E --run \u6216 --agent-prompt");
      const raw = agentResultFile === "-" ? await readStdin() : fs5.readFileSync(path5.resolve(agentResultFile), "utf8");
      const result = saveAgentReviewResult({ file, target, document: raw, write: !!flags.write, dryRun: !!flags["dry-run"] });
      success(result.written ? "agent_result_written" : "agent_result_dry_run", result, () => {
        console.log(`${result.assetName}\uFF1A\u5BFC\u5165 Agent \u7ED3\u8BBA ${result.agentReview.results.length} \u6761${result.written ? "\uFF08\u5DF2\u4FDD\u5B58\uFF09" : "\uFF08\u672A\u5199\u5165\uFF09"}`);
      });
    } else if (flags.run) {
      const result = await reviewProjectFile({
        file,
        target,
        appUrl: str(flags, "app"),
        projectUrl: str(flags, "project-url"),
        write: !!flags.write,
        dryRun: !!flags["dry-run"]
      });
      success(result.written ? "written" : flags["dry-run"] ? "dry_run" : "reviewed", result, () => {
        for (const row of result.rows) console.log(`${row.assetName}\uFF1A${row.gate} \xB7 ${row.counts.FAIL} \u786C\u4F24 / ${row.counts.WARN} \u63D0\u793A`);
        if (result.written) console.log(`\u2713 \u5DF2\u5199\u5165 ${result.file}`);
      });
    } else {
      if (flags.write || flags.app || flags["project-url"] || flags["dry-run"]) usage("\u8FD9\u4E9B\u9009\u9879\u9700\u8981 --run\u3001--agent-prompt \u6216 --agent-result");
      const project2 = readProject(file);
      const rows = (target ? [findAsset(project2, target)] : project2.assets).map((asset2) => {
        const snap3 = asset2.review;
        const status = !snap3 ? "none" : snap3.inputHash === reviewInputHash(asset2, snap3.options) ? "ok" : "stale";
        const agentSnap = asset2.agentReview;
        const agentStatus = !agentSnap ? "none" : agentSnap.inputHash === reviewInputHash(asset2, agentSnap.options) ? "ok" : "stale";
        return {
          id: asset2.id,
          name: asset2.name,
          status,
          review: status === "ok" ? snap3 : null,
          lastReview: snap3 ? { gate: snap3.gate, counts: snap3.counts, generatedAt: snap3.generatedAt } : null,
          agentReviewStatus: agentStatus,
          agentReview: agentStatus === "ok" ? agentSnap : null,
          lastAgentReview: agentSnap ? { generatedAt: agentSnap.generatedAt, results: agentSnap.results.length } : null
        };
      });
      success("read", rows, () => {
        const labels = { ok: "\u5DF2\u8BC4\u5BA1", stale: "\u5DF2\u8FC7\u671F", none: "\u672A\u8BC4\u5BA1" };
        for (const row of rows) {
          console.log(`${row.name}\uFF1A\u89C4\u5219 ${labels[row.status]}${row.lastReview ? ` \xB7 ${row.lastReview.gate}` : ""} \xB7 Agent ${labels[row.agentReviewStatus]}${row.lastAgentReview ? ` \xB7 ${row.lastAgentReview.results} \u6761` : ""}`);
          if (row.status === "ok" && row.review) {
            for (const finding of row.review.findings) {
              const measured = finding.measured === null ? "\u672A\u6D4B" : `${finding.measured}${finding.unit ? ` ${finding.unit}` : ""}`;
              console.log(`  ${finding.level.padEnd(10)} ${finding.ruleId} ${finding.title} \xB7 ${finding.element || "\u753B\u9762\u7EA7"} \xB7 ${measured}`);
            }
          }
          if (row.agentReviewStatus === "ok" && row.agentReview) {
            const agentLabels = { positive: "\u6B63\u4F8B", negative: "\u53CD\u4F8B", unmeasured: "\u672A\u6D4B" };
            for (const result of row.agentReview.results) {
              console.log(`  Agent ${agentLabels[result.result]} ${result.ruleId} \xB7 ${result.reason}${result.elementId ? ` \xB7 ${result.elementId}` : ""}`);
            }
          }
        }
      });
    }
    return;
  }
  const { project, snapshot } = readProjectFile(file);
  const batchAssets = (str(flags, "assets") || "").split(",").map((v2) => v2.trim()).filter(Boolean);
  const asset = str(flags, "asset") || batchAssets[0] || "";
  const group = str(flags, "group") || "";
  const element = str(flags, "element") || "";
  let ops;
  switch (cmd) {
    case "apply": {
      const input = str(flags, "ops") || "-";
      const raw = input === "-" ? await readStdin() : fs5.readFileSync(path5.resolve(input), "utf8");
      const parsed = JSON.parse(raw);
      ops = Array.isArray(parsed) ? parsed : parsed?.ops;
      if (!Array.isArray(ops) || !ops.length) usage('ops \u5FC5\u987B\u662F\u975E\u7A7A\u6570\u7EC4\u6216 { "ops": [...] }');
      break;
    }
    case "add": {
      const svgFile = str(flags, "svg");
      if (!svgFile) usage("add \u9700\u8981 --svg <file>");
      const width = num2(flags, "width");
      const height = num2(flags, "height");
      if ((width ?? 0) < 0 || (height ?? 0) < 0) usage("\u5BBD\u9AD8\u4E0D\u80FD\u5C0F\u4E8E 0");
      const text = fs5.readFileSync(path5.resolve(svgFile), "utf8");
      const base = path5.basename(svgFile).replace(/\.(svg|json)$/i, "");
      const native = looksLikeLottie(text) ? "lottie" : looksLikeGsapSvg(text) ? "gsap" : void 0;
      ops = [{
        op: "asset.add",
        ...native ? { format: native, payload: text } : { svg: text },
        name: str(flags, "name") || base,
        width,
        height,
        x: num2(flags, "x"),
        y: num2(flags, "y")
      }];
      break;
    }
    case "replace": {
      const svgFile = str(flags, "svg");
      if (!asset) usage("replace \u9700\u8981 --asset <id>");
      if (!svgFile) usage("replace \u9700\u8981 --svg <file>");
      ops = [{ op: "asset.update", asset, patch: { svg: fs5.readFileSync(path5.resolve(svgFile), "utf8") } }];
      break;
    }
    case "style":
      if (!!flags.clear === !!flags.set) usage("style \u9700\u8981 --set key=value \u6216 --clear");
      ops = flags.clear ? [{ op: "style.clear", asset, element }] : [{ op: "style.set", asset, element, patch: parseStylePatch(setPairs(flags, NUMERIC_STYLE, (value) => value)) }];
      break;
    case "anim": {
      if (!flags.set) usage("anim \u9700\u8981 --set key=value");
      const numbers = /* @__PURE__ */ new Set(["duration", "delay", "stagger"]);
      const patch = setPairs(flags, numbers, (value) => {
        const text = value.trim();
        if (text === "true" || text === "false") return text === "true";
        return text && Number.isFinite(Number(text)) ? Number(text) : value;
      });
      ops = [{ op: "anim.update", asset, group, patch: parseAnimationPatch(patch) }];
      break;
    }
    case "layer": {
      const targets = (str(flags, "targets") || "").split(",").map((value) => value.trim()).filter(Boolean);
      if (!targets.length) usage("layer \u9700\u8981 --targets a,b,c");
      ops = [{ op: "anim.layer", asset, group, targets, stagger: num2(flags, "stagger") }];
      break;
    }
    case "layout": {
      const container = findElement(findAsset(project, asset), str(flags, "container") || "");
      const patch = {};
      for (const [flag, field] of Object.entries({ mode: "mode", "align-x": "alignX", "align-y": "alignY", justify: "justify" })) {
        if (flags[flag] !== void 0) patch[field] = str(flags, flag);
      }
      for (const [flag, field] of Object.entries({ gap: "gap", "row-gap": "rowGap", padding: "padding", cols: "cols", width: "width", "max-width": "maxWidth" })) {
        if (flags[flag] !== void 0) patch[field] = num2(flags, flag);
      }
      if (flags.wrap && flags["no-wrap"]) usage("--wrap \u548C --no-wrap \u53EA\u80FD\u9009\u4E00\u4E2A");
      if (flags.wrap || flags["no-wrap"]) patch.wrap = Boolean(flags.wrap);
      if (!Object.keys(patch).length) usage("layout \u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u5E03\u5C40\u53C2\u6570");
      const before = findAsset(project, asset).layouts?.[container.id];
      ops = [{ op: "layout.set", asset, container: container.id, spec: { ...before, ...parseLayoutPatch(patch) } }];
      break;
    }
    default:
      usage(`\u672A\u77E5\u547D\u4EE4\uFF1A${cmd}`);
  }
  const { project: next, log } = applyOps(project, ops);
  const outcome = saveProject(file, next, flags, snapshot);
  success(outcome.written ? "written" : "dry_run", { ...outcome, log }, () => {
    for (const item of log) console.log(`  ${item.index}. ${item.op} \u2192 ${item.detail}`);
    console.log(outcome.written ? `\u2713 \u5DF2\u5199\u5165 ${outcome.file}` : "\uFF08dry-run\uFF0C\u672A\u5199\u5165\uFF09");
  });
}
main().catch((error) => {
  const message = error.message || String(error);
  const code = error instanceof CliError ? error.code : "COMMAND_FAILED";
  const details = error instanceof CliError ? error.details : void 0;
  if (jsonMode) console.log(JSON.stringify({ ok: false, status: "failed", code, error: message, details }, null, 2));
  else {
    console.error("\u2717 " + message);
    if (Array.isArray(details)) for (const detail of details) console.error("  - " + detail);
  }
  process.exitCode = code === "INVALID_ARGUMENT" ? 2 : 1;
});
/*! Bundled license information:

gsap/gsap-core.js:
  (*!
   * GSAP 3.15.0
   * https://gsap.com
   *
   * @license Copyright 2008-2026, GreenSock. All rights reserved.
   * Subject to the terms at https://gsap.com/standard-license
   * @author: Jack Doyle, jack@greensock.com
  *)

gsap/CSSPlugin.js:
  (*!
   * CSSPlugin 3.15.0
   * https://gsap.com
   *
   * Copyright 2008-2026, GreenSock. All rights reserved.
   * Subject to the terms at https://gsap.com/standard-license
   * @author: Jack Doyle, jack@greensock.com
  *)
*/
