"use strict";

/*
 * love-notes — dependency-free Node harness.
 *
 * Loads js/app.js in a tiny fake-DOM sandbox and checks the pure logic.
 * Run: node test/harness.js
 */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const store = {};

function makeEl() {
  return {
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {},
    children: [],
    files: [],
    appendChild() {},
    addEventListener() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    removeAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    remove() {},
    firstChild: null,
    removeChild() {},
    innerHTML: "",
    textContent: "",
    value: ""
  };
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Intl,
  Blob: class {
    constructor(parts) {
      this.parts = parts;
    }
  },
  FileReader: class {
    readAsText() {}
  },
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    }
  },
  location: { href: "https://menaammarpro.github.io/love-notes/", search: "" },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => makeEl(),
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } }
  },
  navigator: { language: "en", clipboard: { writeText: async () => {} } },
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const file = path.join(__dirname, "..", "js", "app.js");
vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: "js/app.js" });

/* ---------------- assertions ---------------- */

const N = sandbox.window.MenaNotes;
let failures = 0;

function assert(cond, message) {
  if (!cond) {
    failures += 1;
    console.error("FAIL: " + message);
    process.exitCode = 1;
  } else {
    console.log("ok - " + message);
  }
}

function eq(a, b, message) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  assert(ok, message + (ok ? "" : " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"));
}

assert(!!N, "namespace window.MenaNotes exposed");
assert(N.STORE === "mena-notes", "storage key is mena-notes");

/* word count */
eq(N.countWords(""), 0, "countWords: empty string");
eq(N.countWords("   "), 0, "countWords: whitespace only");
eq(N.countWords("one two three"), 3, "countWords: three words");
eq(N.countWords("  hello   world \n\n again "), 3, "countWords: collapses whitespace");
assert(N.countWords(null) === 0, "countWords: null is safe");

/* tags */
eq(N.parseTags("pizza, art , , nature"), ["pizza", "art", "nature"], "parseTags: splits and drops blanks");
eq(N.parseTags("Art, art, ART"), ["Art"], "parseTags: dedupes case-insensitively");
eq(N.parseTags("#love, #home"), ["love", "home"], "parseTags: strips leading hash");
eq(N.parseTags(["a", "b"]), ["a", "b"], "parseTags: accepts an array");
eq(N.parseTags(""), [], "parseTags: empty string");
assert(N.parseTags("x".repeat(40)).length === 1, "parseTags: one long tag");
assert(N.parseTags(Array.from({ length: 20 }, (_, i) => "t" + i)).length === 12, "parseTags: caps at 12 tags");
assert(N.parseTags("x".repeat(40))[0].length === 24, "parseTags: caps tag length at 24");

/* excerpt */
eq(N.excerpt("short body", 40), "short body", "excerpt: short text unchanged");
assert(N.excerpt("a".repeat(120), 50).length <= 51, "excerpt: truncates long text");
assert(N.excerpt("hello world and more words here", 12).endsWith("…"), "excerpt: adds an ellipsis");
assert(N.excerpt(null) === "", "excerpt: null is safe");
eq(N.excerpt("line one\nline two", 90), "line one line two", "excerpt: flattens newlines");

/* create / sanitise */
const made = N.createNote(1000, "seed", { title: "Hi", body: "there", tags: "a,b", color: "gold", pinned: true });
eq(made.title, "Hi", "createNote: title");
eq(made.tags, ["a", "b"], "createNote: tags parsed");
eq(made.color, "gold", "createNote: colour kept");
eq(made.pinned, true, "createNote: pinned kept");
assert(!!made.id && typeof made.id === "string", "createNote: gives an id");
eq(made.updatedAt, 1000, "createNote: updatedAt set");
eq(N.createNote(1, "s", { color: "chartreuse" }).color, "white", "createNote: unknown colour falls back to white");
eq(N.createNote(1, "s", {}).pinned, false, "createNote: pinned defaults false");

assert(N.sanitiseNote(null, 1) === null, "sanitiseNote: rejects null");
assert(N.sanitiseNote("nope", 1) === null, "sanitiseNote: rejects a string");
assert(N.sanitiseNote([], 1) === null, "sanitiseNote: rejects an array");
assert(N.sanitiseNote({}, 1) === null, "sanitiseNote: rejects a junk object");
assert(N.sanitiseNote({ title: "", body: "", tags: [] }, 1) === null, "sanitiseNote: rejects an empty note");
const good = N.sanitiseNote({ id: "x1", title: " T ", body: "b", tags: ["  art "], color: "pink" }, 5000);
eq(good.id, "x1", "sanitiseNote: keeps id");
eq(good.title, "T", "sanitiseNote: trims title");
eq(good.tags, ["art"], "sanitiseNote: cleans tags");
eq(good.color, "pink", "sanitiseNote: keeps valid colour");
eq(good.updatedAt, 5000, "sanitiseNote: fills updatedAt");
eq(N.sanitiseNote({ body: "only a body" }, 7).id.length > 0, true, "sanitiseNote: mints an id when missing");

/* accents */
eq(N.accentFor("pink"), "#ff9fcf", "accentFor: pink");
eq(N.accentFor("bogus"), "#ffffff", "accentFor: falls back to white");
assert(N.isColour("gold") && !N.isColour("blue"), "isColour: validates names");

/* loadState */
eq(N.loadState(null, 1).notes, [], "loadState: null gives no notes");
eq(N.loadState("{not json", 1).notes, [], "loadState: corrupt JSON is ignored");
eq(N.loadState(JSON.stringify({ notes: [{ title: "A", body: "b" }] }), 1).notes.length, 1, "loadState: reads the envelope");
eq(N.loadState(JSON.stringify([{ title: "A" }]), 1).notes.length, 1, "loadState: reads a bare array");
eq(N.loadState(JSON.stringify({ notes: [{}, "x", null] }), 1).notes.length, 0, "loadState: skips junk entries");

/* sort */
const sorted = N.sortNotes([
  { id: "a", pinned: false, updatedAt: 30 },
  { id: "b", pinned: true, updatedAt: 10 },
  { id: "c", pinned: false, updatedAt: 50 },
  { id: "d", pinned: true, updatedAt: 20 }
]);
eq(sorted.map((n) => n.id), ["d", "b", "c", "a"], "sortNotes: pinned first, then newest");

/* filtering */
const bank = [
  { id: "1", title: "Pizza night", body: "cheese", tags: ["food"], pinned: false, updatedAt: 3 },
  { id: "2", title: "Song", body: "our melody for you", tags: ["music", "us"], pinned: true, updatedAt: 2 },
  { id: "3", title: "Art idea", body: "white canvas", tags: ["art"], pinned: false, updatedAt: 1 }
];
eq(N.filterNotes(bank, "pizza", null).map((n) => n.id), ["1"], "filterNotes: matches title");
eq(N.filterNotes(bank, "melody", null).map((n) => n.id), ["2"], "filterNotes: matches body");
eq(N.filterNotes(bank, "ART", null).map((n) => n.id), ["3"], "filterNotes: matches tag, case-insensitive");
eq(N.filterNotes(bank, "", "art").map((n) => n.id), ["3"], "filterNotes: tag filter");
eq(N.filterNotes(bank, "zzz", null).length, 0, "filterNotes: no matches");
eq(N.filterNotes(bank, "", null).length, 3, "filterNotes: empty query returns all");
assert(N.searchMatches(bank[0], "") === true, "searchMatches: empty query matches");

/* mutations */
let notes = [];
notes = N.upsertNote(notes, { id: "n1", title: "one" });
eq(notes.length, 1, "upsertNote: inserts");
notes = N.upsertNote(notes, { id: "n1", title: "one edited" });
eq(notes.length, 1, "upsertNote: replaces by id");
eq(notes[0].title, "one edited", "upsertNote: replacement wins");
notes = N.removeNote(notes, "n1");
eq(notes.length, 0, "removeNote: removes by id");

eq(N.getNote(bank, "2").title, "Song", "getNote: finds by id");
assert(N.getNote(bank, "missing") === null, "getNote: missing returns null");

const pinnedOnce = N.togglePin(bank, "1", 99);
eq(pinnedOnce.filter((n) => n.id === "1")[0].pinned, true, "togglePin: flips false to true");
eq(bank.filter((n) => n.id === "1")[0].pinned, false, "togglePin: leaves the original untouched");

/* tags list */
eq(N.allTags(bank), ["art", "food", "music", "us"], "allTags: unique and sorted");

/* export / import round trip */
const aport = N.createNote(10, "rt", { title: "Round trip", body: "hello world", tags: "us, love", color: "purple" });
const text = N.exportPayload([aport], 1234);
assert(text.indexOf('"app": "love-notes"') !== -1, "exportPayload: names the app");
const back = N.parseImport(text, 10);
eq(back.length, 1, "parseImport: reads the envelope");
eq(back[0].title, "Round trip", "parseImport: title survives the round trip");
eq(back[0].tags, ["us", "love"], "parseImport: tags survive the round trip");
eq(back[0].color, "purple", "parseImport: colour survives the round trip");

let threw = false;
try {
  N.parseImport("not json", 1);
} catch (e) {
  threw = true;
}
assert(threw, "parseImport: throws on invalid JSON");

threw = false;
try {
  N.parseImport("{}", 1);
} catch (e) {
  threw = true;
}
assert(threw, "parseImport: throws when no notes are present");

threw = false;
try {
  N.parseImport("", 1);
} catch (e) {
  threw = true;
}
assert(threw, "parseImport: throws on empty text");

eq(N.parseImport(JSON.stringify([{ title: "Bare" }]), 1).length, 1, "parseImport: accepts a bare array");

/* merge */
const merged = N.mergeNotes([{ id: "a", title: "old" }], [{ id: "a", title: "new" }, { id: "b", title: "second" }]);
eq(merged.length, 2, "mergeNotes: unions by id");
eq(N.getNote(merged, "a").title, "new", "mergeNotes: incoming wins on conflict");

/* relative time */
eq(N.formatRelative(0, 1000), "—", "formatRelative: zero is a dash");
eq(N.formatRelative(1000, 1000), "just now", "formatRelative: same instant");
eq(N.formatRelative(1000, 1000 + 5 * 60000), "5m ago", "formatRelative: minutes");
eq(N.formatRelative(1000, 1000 + 3 * 3600000), "3h ago", "formatRelative: hours");
eq(N.formatRelative(1000, 1000 + 2 * 86400000), "2d ago", "formatRelative: days");
eq(N.formatRelative(5000, 1000), "just now", "formatRelative: future clamps to now");

/* summary */
const sum = N.summary(bank);
eq(sum.total, 3, "summary: counts notes");
eq(sum.pinned, 1, "summary: counts pinned");
eq(sum.tags, 4, "summary: counts unique tags");
assert(sum.words > 0, "summary: counts words");

/* ---------------- result ---------------- */
if (failures) {
  console.error("\n" + failures + " check(s) failed.");
  process.exit(1);
}
console.log("\nAll love-notes checks passed ♥");
