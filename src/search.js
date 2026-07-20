// Typo-tolerant search over the catalogue.
//
// Substring matching handles most of it ("heathro" is inside "Heathrow"). What it can't do
// is survive a wrong or missing letter — "heatrow", "singapor e", "amsterdm". So: run the
// cheap substring pass first, and only fall back to edit-distance when that pass comes up
// short. With 7,300 feeds the fallback has to be guarded or typing gets sluggish.

// strip accents so "Zurich" finds "Zürich", "Malaga" finds "Málaga"
export const norm = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Levenshtein with an early bail-out: if the best possible result already exceeds
// the budget there's no point finishing the matrix.
export function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;      // whole row already too far
    prev = cur;
  }
  return prev[b.length];
}

// how much typo we tolerate, by query length
export const budgetFor = (q) => (q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3);

// split once at index time, not on every keystroke
export const words = (text) => text.split(/[\s,·/()-]+/).filter(Boolean);

// does any word come within the budget of the query?
export function fuzzyHit(wordList, q, budget) {
  const words = wordList;
  for (const w of words) {
    if (!w) continue;
    if (w.startsWith(q)) return true;
    if (Math.abs(w.length - q.length) <= budget && editDistance(w, q, budget) <= budget) return true;
    // also allow the query to match the start of a longer word with typos ("amsterdm" -> "amsterdam")
    if (w.length > q.length && editDistance(w.slice(0, q.length + budget), q, budget) <= budget) return true;
  }
  return false;
}
