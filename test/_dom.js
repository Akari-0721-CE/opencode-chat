"use strict";
/* Loads the front-end classic scripts into Node with a minimal DOM shim,
   exposing pure functions on globalThis.__pure for unit tests.
   boot.js is intentionally excluded (does network I/O). */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeStyle() {
  return {
    setProperty() {},
    getPropertyValue() { return ""; },
    removeProperty() {},
  };
}
function makeClassList() {
  return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
}
function makeEl() {
  const el = {
    style: makeStyle(),
    dataset: {},
    children: [],
    value: "",
    textContent: "",
    innerHTML: "",
    disabled: false,
    checked: false,
    hidden: false,
    open: false,
    type: "",
    title: "",
    src: "",
    alt: "",
    href: "",
    classList: makeClassList(),
    appendChild(c) { this.children.push(c); return c; },
    append(...a) { this.children.push(...a); },
    prepend() {},
    insertBefore() {},
    remove() {},
    removeChild() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    closest() { return null; },
    contains() { return false; },
    scrollIntoView() {},
    focus() {},
    click() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    getContext() { return { drawImage() {}, clearRect() {}, toDataURL() { return ""; } }; },
    toDataURL() { return ""; },
  };
  Object.defineProperty(el, "firstChild", { get() { return makeEl(); } });
  Object.defineProperty(el, "lastChild", { get() { return makeEl(); } });
  Object.defineProperty(el, "nextSibling", { get() { return null; } });
  Object.defineProperty(el, "parentNode", { get() { return null; } });
  Object.defineProperty(el, "previousElementSibling", { get() { return null; } });
  return el;
}
function makeDocument() {
  const byId = new Map();
  return {
    getElementById(id) { if (!byId.has(id)) byId.set(id, makeEl()); return byId.get(id); },
    createElement() { return makeEl(); },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    head: makeEl(),
    body: makeEl(),
    documentElement: makeEl(),
  };
}
function makeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(String(k)),
    clear: () => m.clear(),
  };
}

globalThis.document = makeDocument();
globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 800, open() {}, matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; } };
globalThis.localStorage = makeLocalStorage();
try { Object.defineProperty(globalThis, "navigator", { value: { clipboard: {} }, configurable: true }); } catch (e) { /* keep Node's navigator */ }
globalThis.location = { href: "http://localhost/" };
globalThis.alert = () => {};
globalThis.confirm = () => true;
globalThis.EventSource = class { constructor() {} addEventListener() {} close() {} };
globalThis.Image = class { set src(v) {} };
globalThis.FileReader = class { readAsDataURL() {} };
globalThis.fetch = () => Promise.reject(new Error("fetch disabled in tests"));
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });

const ORDER = [
  "i18n.js", "core.js", "profile.js", "state.js", "assistants.js", "sessions.js", "render.js",
  "events.js", "attachments.js", "send.js", "proxy.js", "settings.js", "media.js",
  "providers.js", "translate.js", "ocr.js", "favorites.js", "onboarding.js",
];
const JS_DIR = path.join(__dirname, "..", "static", "js");

const EXPORTS = [
  "modelKey", "parseModelKey", "uid", "escapeHtml", "avatarColor", "textHash", "turnKey",
  "fmtSendStamp", "withSendStamp", "splitSendStamp", "stampParts", "messageTextParts",
  "sanitizeFolderName", "uniqueWorkspace", "uniqueAssistantName", "normDir", "markDirUsed",
  "classify", "fmtSize", "dataUrlSize", "fmtNum", "fmtCompact", "fmtCost", "tokenTotal",
  "pickLatestAssistant", "hexToRgba", "accentPreset",
  "fmtDurationMs", "parentPath", "searchSnippet", "escapeRe", "protectSegments", "restoreCode",
  "proxyTranscript", "pushError", "recentErrors", "isAuthErrorText", "isDarkMode", "canNotify",
  "applyProfileObject", "filterModelGroups",
  "sessionUpdated", "sessionDayStart", "sessionDayLabel", "fmtSessionTime", "groupSessionsByDay", "filterSessions",
  "isOcrModelName", "isVisionModel", "ocrDisplayKeyFromParts", "OCR_TEXT_PREFIX",
  "settingsQueryMatches", "lowPerfEnabled", "toolInfo", "renderQuality",
  "t", "currentLang", "setLang",
];

let src = "";
for (const f of ORDER) src += "\n" + fs.readFileSync(path.join(JS_DIR, f), "utf8");
src += "\n;globalThis.__pure = { " + EXPORTS.map((n) => `${n}: (typeof ${n} !== "undefined" ? ${n} : undefined)`).join(", ") + " };\n";

vm.runInThisContext(src, { filename: "frontend-bundle.js" });

module.exports = globalThis.__pure;
