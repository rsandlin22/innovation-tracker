// Three-way merge of tracker data, shared by the server (require) and the
// browser (<script src="merge.js">).
//
// Every browser holds its own copy of the data. Saving that whole copy would
// wipe out anything other people added since it was loaded, so instead each
// save sends the copy it started from (base) and its current copy (mine). Only
// what changed between those two is applied on top of the latest saved data
// (theirs); everyone else's changes are kept.
(function (root) {
  const COLLECTIONS = ['goals', 'rocks', 'priorities', 'members', 'teams'];

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const noteKey = n => n.ts + '\u0000' + n.text;

  // Notes are append-only, so when two people add notes to the same item,
  // keep both: everything in mine plus notes others added since base.
  function mergeNotes(theirs, base, mine) {
    const seen = new Set([...(base || []), ...(mine || [])].map(noteKey));
    const othersAdded = (theirs || []).filter(n => !seen.has(noteKey(n)));
    return [...othersAdded, ...(mine || [])];
  }

  function mergeItem(theirs, base, mine) {
    const merged = { ...mine };
    if (theirs.noteHistory || mine.noteHistory) {
      merged.noteHistory = mergeNotes(theirs.noteHistory, base && base.noteHistory, mine.noteHistory);
    }
    return merged;
  }

  function mergeList(theirs = [], base = [], mine = []) {
    const byId = list => new Map(list.map(x => [x.id, x]));
    const B = byId(base), M = byId(mine), T = byId(theirs);
    const out = [];
    for (const t of theirs) {
      const b = B.get(t.id), m = M.get(t.id);
      if (!m) {
        if (!b) out.push(t);            // added by someone else
        continue;                       // else: I deleted it
      }
      out.push(b && same(b, m) ? t : mergeItem(t, b, m)); // unchanged by me → keep theirs
    }
    for (const m of mine) {
      if (T.has(m.id)) continue;
      const b = B.get(m.id);
      if (!b) out.push(m);              // I added it
      else if (!same(b, m)) out.push(m); // someone deleted it, but I edited it — keep
    }
    return out;
  }

  function mergeData(theirs, base, mine) {
    theirs = theirs || {}; base = base || {}; mine = mine || {};
    const out = {};
    for (const k of COLLECTIONS) {
      // Nothing saved yet for this collection → take mine as-is
      out[k] = theirs[k] ? mergeList(theirs[k], base[k], mine[k]) : (mine[k] || []);
    }
    out.nextId = Math.max(theirs.nextId || 0, mine.nextId || 0);
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { mergeData };
  else root.mergeData = mergeData;
})(this);
