"use strict";

/*
 * love-notes — page logic.
 *
 * A soft scratchpad we keep together. Every note is a plain object and all of
 * the real work lives in pure functions so it can be tested without a browser.
 * Nothing leaves this device: state is kept in localStorage under `mena-notes`.
 */

(function () {
  var STORE = "mena-notes";
  var MAX_TAGS = 12;
  var MAX_TAG_LEN = 24;

  var COLOURS = {
    white: "#ffffff",
    pink: "#ff9fcf",
    purple: "#b98bff",
    gold: "#ffd166"
  };
  var COLOUR_NAMES = ["white", "pink", "purple", "gold"];

  /* ---------------- small helpers ---------------- */

  function isStr(v) {
    return typeof v === "string";
  }

  function cleanText(v, max) {
    if (!isStr(v)) return "";
    var t = v.replace(/\u0000/g, "").trim();
    if (typeof max === "number" && t.length > max) t = t.slice(0, max);
    return t;
  }

  function makeId(seed) {
    var base = String(seed === undefined ? Math.random() : seed).replace(/[^a-z0-9]/gi, "");
    var salt = Math.random().toString(36).slice(2, 8);
    return (base.slice(0, 6) || "note") + "-" + salt + "-" + Date.now().toString(36);
  }

  function isColour(name) {
    return COLOUR_NAMES.indexOf(name) !== -1;
  }

  function accentFor(name) {
    return COLOURS[isColour(name) ? name : "white"];
  }

  /* ---------------- pure functions ---------------- */

  function countWords(text) {
    if (!isStr(text)) return 0;
    var trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function parseTags(input) {
    if (Array.isArray(input)) {
      input = input.join(",");
    }
    if (!isStr(input)) return [];
    var seen = {};
    var out = [];
    input.split(",").forEach(function (raw) {
      var tag = cleanText(raw, MAX_TAG_LEN).replace(/^#/, "");
      if (!tag) return;
      var key = tag.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(tag);
    });
    return out.slice(0, MAX_TAGS);
  }

  function excerpt(body, limit) {
    var n = typeof limit === "number" ? limit : 90;
    if (!isStr(body)) return "";
    var flat = body.replace(/\s+/g, " ").trim();
    if (flat.length <= n) return flat;
    return flat.slice(0, n).replace(/\s+\S*$/, "") + "…";
  }

  function createNote(now, id, partial) {
    var p = partial || {};
    var time = typeof now === "number" ? now : Date.now();
    return {
      id: isStr(p.id) && p.id ? p.id : makeId(id || "note"),
      title: cleanText(p.title, 120),
      body: isStr(p.body) ? p.body.replace(/\u0000/g, "") : "",
      tags: parseTags(p.tags),
      color: isColour(p.color) ? p.color : "white",
      pinned: !!p.pinned,
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : time
    };
  }

  // Returns a clean note, or null when the value is not usable at all.
  function sanitiseNote(raw, now) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var hasContent =
      isStr(raw.id) ||
      isStr(raw.title) ||
      isStr(raw.body) ||
      Array.isArray(raw.tags);
    if (!hasContent) return null;

    var title = cleanText(raw.title, 120);
    var body = isStr(raw.body) ? raw.body.replace(/\u0000/g, "") : "";
    var tags = parseTags(raw.tags);

    // A note with nothing at all in it is not worth keeping.
    if (!title && !body.replace(/\s+/g, "") && !tags.length) return null;

    var time = typeof now === "number" ? now : Date.now();
    return {
      id: isStr(raw.id) && raw.id ? raw.id.slice(0, 80) : makeId("note"),
      title: title,
      body: body,
      tags: tags,
      color: isColour(raw.color) ? raw.color : "white",
      pinned: !!raw.pinned,
      updatedAt: typeof raw.updatedAt === "number" && raw.updatedAt > 0 ? raw.updatedAt : time
    };
  }

  function loadState(raw, now) {
    var notes = [];
    if (isStr(raw) && raw) {
      var parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        parsed = null;
      }
      var list = null;
      if (Array.isArray(parsed)) list = parsed;
      else if (parsed && Array.isArray(parsed.notes)) list = parsed.notes;
      if (list) {
        list.forEach(function (item) {
          var note = sanitiseNote(item, now);
          if (note) notes.push(note);
        });
      }
    }
    return { notes: notes };
  }

  function sortNotes(notes) {
    return notes.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function searchMatches(note, query) {
    if (!query) return true;
    var q = query.trim().toLowerCase();
    if (!q) return true;
    if (isStr(note.title) && note.title.toLowerCase().indexOf(q) !== -1) return true;
    if (isStr(note.body) && note.body.toLowerCase().indexOf(q) !== -1) return true;
    var tags = note.tags || [];
    for (var i = 0; i < tags.length; i += 1) {
      if (String(tags[i]).toLowerCase().indexOf(q) !== -1) return true;
    }
    return false;
  }

  function filterNotes(notes, query, tag) {
    return notes.filter(function (note) {
      if (tag) {
        var tags = note.tags || [];
        var hit = tags.some(function (t) {
          return String(t).toLowerCase() === String(tag).toLowerCase();
        });
        if (!hit) return false;
      }
      return searchMatches(note, query);
    });
  }

  function upsertNote(notes, note) {
    var out = [];
    var found = false;
    notes.forEach(function (n) {
      if (n.id === note.id) {
        out.push(note);
        found = true;
      } else {
        out.push(n);
      }
    });
    if (!found) out.push(note);
    return out;
  }

  function removeNote(notes, id) {
    return notes.filter(function (n) {
      return n.id !== id;
    });
  }

  function getNote(notes, id) {
    for (var i = 0; i < notes.length; i += 1) {
      if (notes[i].id === id) return notes[i];
    }
    return null;
  }

  function togglePin(notes, id, now) {
    return notes.map(function (n) {
      if (n.id !== id) return n;
      var copy = {};
      for (var k in n) if (Object.prototype.hasOwnProperty.call(n, k)) copy[k] = n[k];
      copy.pinned = !n.pinned;
      copy.updatedAt = typeof now === "number" ? now : n.updatedAt;
      return copy;
    });
  }

  function allTags(notes) {
    var map = {};
    notes.forEach(function (n) {
      (n.tags || []).forEach(function (t) {
        var key = String(t).toLowerCase();
        if (!map[key]) map[key] = String(t);
      });
    });
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
      });
  }

  function exportPayload(notes, now) {
    return JSON.stringify(
      {
        app: "love-notes",
        version: 1,
        exportedAt: typeof now === "number" ? now : Date.now(),
        notes: notes
      },
      null,
      2
    );
  }

  // Accepts either our export envelope, a bare array, or {notes:[...]}.
  // Throws a friendly Error when there is nothing usable inside.
  function parseImport(text, now) {
    if (!isStr(text) || !text.trim()) {
      throw new Error("That file looked empty.");
    }
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error("That file isn't valid JSON.");
    }
    var list = null;
    if (Array.isArray(parsed)) list = parsed;
    else if (parsed && Array.isArray(parsed.notes)) list = parsed.notes;
    if (!list) throw new Error("No notes found in that file.");

    var out = [];
    list.forEach(function (item) {
      var note = sanitiseNote(item, now);
      if (note) out.push(note);
    });
    if (!out.length) throw new Error("No notes found in that file.");
    return out;
  }

  function mergeNotes(notes, incoming) {
    var out = notes.slice();
    incoming.forEach(function (note) {
      out = upsertNote(out, note);
    });
    return out;
  }

  function formatRelative(ts, now) {
    if (typeof ts !== "number" || ts <= 0) return "—";
    var current = typeof now === "number" ? now : Date.now();
    var diff = current - ts;
    if (diff < 0) diff = 0;
    var sec = Math.floor(diff / 1000);
    if (sec < 45) return "just now";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + "m ago";
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    var day = Math.floor(hr / 24);
    if (day < 7) return day + "d ago";
    return new Date(ts).toLocaleDateString();
  }

  function summary(notes) {
    var words = 0;
    var pinned = 0;
    notes.forEach(function (n) {
      words += countWords(n.body);
      if (n.pinned) pinned += 1;
    });
    return { total: notes.length, pinned: pinned, words: words, tags: allTags(notes).length };
  }

  /* ---------------- expose the pure API ---------------- */

  var API = {
    STORE: STORE,
    COLOURS: COLOURS,
    COLOUR_NAMES: COLOUR_NAMES,
    accentFor: accentFor,
    isColour: isColour,
    countWords: countWords,
    parseTags: parseTags,
    excerpt: excerpt,
    createNote: createNote,
    sanitiseNote: sanitiseNote,
    loadState: loadState,
    sortNotes: sortNotes,
    searchMatches: searchMatches,
    filterNotes: filterNotes,
    upsertNote: upsertNote,
    removeNote: removeNote,
    getNote: getNote,
    togglePin: togglePin,
    allTags: allTags,
    exportPayload: exportPayload,
    parseImport: parseImport,
    mergeNotes: mergeNotes,
    formatRelative: formatRelative,
    summary: summary
  };

  var root = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this;
  if (root) root.MenaNotes = API;

  /* ---------------- browser wiring (skipped in Node) ---------------- */

  if (typeof document === "undefined" || !document || typeof document.addEventListener !== "function") {
    return;
  }

  var state = { notes: [], selectedId: null, query: "", tag: null };
  var saveTimer = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = String(value);
  }

  function status(message) {
    setText("save-status", message || "");
  }

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ notes: state.notes }));
    } catch (e) {
      /* Storage may be unavailable; the page still works. */
    }
  }

  function scheduleSave() {
    status("Saving…");
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      persist();
      status("Saved ✓");
      window.setTimeout(function () {
        if ($("save-status") && $("save-status").textContent === "Saved ✓") status("");
      }, 1600);
    }, 450);
  }

  function currentNote() {
    return getNote(state.notes, state.selectedId);
  }

  function renderList() {
    var listEl = $("note-list");
    var emptyEl = $("empty-state");
    if (!listEl) return;

    var visible = sortNotes(filterNotes(state.notes, state.query, state.tag));

    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

    if (emptyEl) {
      emptyEl.hidden = visible.length > 0;
      emptyEl.textContent = state.notes.length
        ? "Nothing matches that search."
        : "No notes yet — tap New note and write the first one ♥";
    }

    visible.forEach(function (note) {
      var card = document.createElement("article");
      card.className = "note-card" + (note.id === state.selectedId ? " is-active" : "");
      card.style.setProperty("--note-accent", accentFor(note.color));
      card.setAttribute("data-id", note.id);
      card.setAttribute("tabindex", "0");

      var head = document.createElement("div");
      head.className = "note-card-head";
      var title = document.createElement("span");
      title.className = "note-card-title";
      title.textContent = note.title || "(untitled note)";
      head.appendChild(title);
      if (note.pinned) {
        var pin = document.createElement("span");
        pin.className = "note-card-pin";
        pin.textContent = "📌";
        pin.setAttribute("aria-label", "Pinned");
        head.appendChild(pin);
      }
      card.appendChild(head);

      var body = document.createElement("p");
      body.className = "note-card-excerpt";
      body.textContent = excerpt(note.body, 110) || "…";
      card.appendChild(body);

      var foot = document.createElement("div");
      foot.className = "note-card-foot";
      var when = document.createElement("span");
      when.textContent = formatRelative(note.updatedAt, Date.now());
      foot.appendChild(when);
      (note.tags || []).slice(0, 3).forEach(function (t) {
        var chip = document.createElement("span");
        chip.className = "mini-tag";
        chip.textContent = "#" + t;
        foot.appendChild(chip);
      });
      card.appendChild(foot);

      card.addEventListener("click", function () {
        selectNote(note.id);
      });
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          selectNote(note.id);
        }
      });

      listEl.appendChild(card);
    });

    var s = summary(state.notes);
    setText("notes-count", s.total);
    setText(
      "notes-filtered",
      state.query || state.tag ? "(showing " + visible.length + ")" : ""
    );
  }

  function renderTagbar() {
    var bar = $("tag-filter");
    if (!bar) return;
    while (bar.firstChild) bar.removeChild(bar.firstChild);

    var tags = allTags(state.notes);
    if (!tags.length) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    if (state.tag) {
      var clear = document.createElement("button");
      clear.type = "button";
      clear.className = "tag-chip is-active";
      clear.textContent = "✕ #" + state.tag;
      clear.addEventListener("click", function () {
        state.tag = null;
        renderTagbar();
        renderList();
      });
      bar.appendChild(clear);
    }

    tags.forEach(function (tag) {
      if (state.tag && tag.toLowerCase() === state.tag.toLowerCase()) return;
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip";
      chip.textContent = "#" + tag;
      chip.addEventListener("click", function () {
        state.tag = tag;
        renderTagbar();
        renderList();
      });
      bar.appendChild(chip);
    });
  }

  function markColour(name) {
    var pal = $("colour-palette");
    if (!pal) return;
    var kids = pal.children || [];
    for (var i = 0; i < kids.length; i += 1) {
      var btn = kids[i];
      var isActive = btn.getAttribute && btn.getAttribute("data-color") === name;
      var cls = " " + (btn.className || "") + " ";
      var cleaned = cls.replace(" is-active ", " ").replace(/^\s+|\s+$/g, "");
      btn.className = isActive ? cleaned + " is-active" : cleaned;
    }
  }

  function fillEditor(note) {
    var form = $("editor-form");
    var blank = $("editor-blank");
    if (!form) return;

    if (!note) {
      form.hidden = true;
      if (blank) blank.hidden = false;
      return;
    }
    form.hidden = false;
    if (blank) blank.hidden = true;

    var titleEl = $("editor-title");
    var bodyEl = $("editor-body");
    var tagsEl = $("editor-tags");
    if (titleEl) titleEl.value = note.title;
    if (bodyEl) bodyEl.value = note.body;
    if (tagsEl) tagsEl.value = (note.tags || []).join(", ");

    var pin = $("pin-toggle");
    if (pin) {
      pin.setAttribute("aria-pressed", note.pinned ? "true" : "false");
      pin.textContent = note.pinned ? "Pinned ✓" : "Pin";
    }

    markColour(note.color);
    setText("word-count", countWords(note.body));
    setText("note-updated", "edited " + formatRelative(note.updatedAt, Date.now()));
  }

  function selectNote(id) {
    state.selectedId = getNote(state.notes, id) ? id : null;
    fillEditor(currentNote());
    renderList();
  }

  function renderAll() {
    renderTagbar();
    renderList();
    fillEditor(currentNote());
  }

  function blankNote() {
    var fresh = createNote(Date.now(), "note");
    state.notes = upsertNote(state.notes, fresh);
    state.query = "";
    var search = $("search-input");
    if (search) search.value = "";
    selectNote(fresh.id);
    persist();
    var bodyEl = $("editor-body");
    if (bodyEl && bodyEl.focus) bodyEl.focus();
  }

  function applyEditorToNote() {
    var note = currentNote();
    if (!note) return null;

    var titleEl = $("editor-title");
    var bodyEl = $("editor-body");
    var tagsEl = $("editor-tags");

    var updated = createNote(Date.now(), note.id, {
      id: note.id,
      title: titleEl ? titleEl.value : note.title,
      body: bodyEl ? bodyEl.value : note.body,
      tags: tagsEl ? tagsEl.value : note.tags,
      color: note.color,
      pinned: note.pinned,
      updatedAt: Date.now()
    });
    state.notes = upsertNote(state.notes, updated);
    setText("word-count", countWords(updated.body));
    setText("note-updated", "edited just now");
    return updated;
  }

  function deleteCurrent() {
    var note = currentNote();
    if (!note) return;
    var ok = true;
    if (typeof window.confirm === "function") {
      ok = window.confirm("Delete this note for good?");
    }
    if (!ok) return;
    state.notes = removeNote(state.notes, note.id);
    state.selectedId = null;
    persist();
    renderAll();
    status("Note deleted");
  }

  function doExport() {
    try {
      var text = exportPayload(state.notes, Date.now());
      var blob = new Blob([text], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "our-notes.json";
      if (a.click) a.click();
      URL.revokeObjectURL(url);
      status("Exported " + state.notes.length + " notes");
    } catch (e) {
      status("Couldn't export here.");
    }
  }

  function doImport(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var incoming = parseImport(String(reader.result), Date.now());
        state.notes = mergeNotes(state.notes, incoming);
        persist();
        renderAll();
        status("Imported " + incoming.length + " notes");
      } catch (err) {
        status(err && err.message ? err.message : "Couldn't read that file.");
      }
    };
    reader.onerror = function () {
      status("Couldn't read that file.");
    };
    reader.readAsText(file);
  }

  function copyLink() {
    var note = currentNote();
    if (!note) return;
    var base = "";
    if (typeof location !== "undefined" && location.href) {
      base = location.href.split("?")[0];
    }
    var link = base + "?note=" + encodeURIComponent(note.id);
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(link)
        .then(function () {
          status("Link copied ♥");
        })
        .catch(function () {
          status(link);
        });
    } else {
      status(link);
    }
  }

  function wire() {
    var form = $("editor-form");
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        applyEditorToNote();
        persist();
        renderList();
        status("Saved ✓");
      });
    }

    ["editor-title", "editor-body", "editor-tags"].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.addEventListener("input", function () {
          applyEditorToNote();
          renderList();
          scheduleSave();
        });
      }
    });

    var pal = $("colour-palette");
    if (pal) {
      var sws = pal.children || [];
      for (var i = 0; i < sws.length; i += 1) {
        (function (btn) {
          btn.addEventListener("click", function () {
            var note = currentNote();
            if (!note) return;
            var colour = btn.getAttribute ? btn.getAttribute("data-color") : null;
            if (!isColour(colour)) return;
            note.color = colour;
            note.updatedAt = Date.now();
            markColour(colour);
            persist();
            renderList();
            scheduleSave();
          });
        })(sws[i]);
      }
    }

    var pinBtn = $("pin-toggle");
    if (pinBtn) {
      pinBtn.addEventListener("click", function () {
        var note = currentNote();
        if (!note) return;
        state.notes = togglePin(state.notes, note.id, Date.now());
        fillEditor(currentNote());
        renderList();
        scheduleSave();
      });
    }

    var del = $("delete-note");
    if (del) del.addEventListener("click", deleteCurrent);

    var link = $("copy-link");
    if (link) link.addEventListener("click", copyLink);

    var newBtn = $("new-note");
    if (newBtn) newBtn.addEventListener("click", blankNote);

    var exp = $("export-notes");
    if (exp) exp.addEventListener("click", doExport);

    var imp = $("import-notes");
    if (imp) {
      imp.addEventListener("change", function () {
        doImport(imp.files && imp.files[0]);
        imp.value = "";
      });
    }

    var search = $("search-input");
    if (search) {
      search.addEventListener("input", function () {
        state.query = search.value;
        renderList();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var raw = null;
    try {
      raw = localStorage.getItem(STORE);
    } catch (e) {
      raw = null;
    }
    var loaded = loadState(raw, Date.now());
    state.notes = loaded.notes;

    // Deep link: ?note=<id>
    var wanted = null;
    if (typeof location !== "undefined" && location.search) {
      try {
        wanted = new URLSearchParams(location.search).get("note");
      } catch (e) {
        wanted = null;
      }
    }
    if (wanted && getNote(state.notes, wanted)) {
      state.selectedId = wanted;
    }

    wire();
    renderAll();
  });
})();
