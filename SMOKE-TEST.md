# StreetWatch — post-deploy smoke test

**~3 minutes. Run after any deploy that touched the frontend.**

These aren't arbitrary checks. Every line below is a bug that actually shipped and was caught by
hand, so this list is the accumulated memory of what breaks — and what breaks *again* when
something adjacent changes.

A quick note on why this exists: hand-testing is excellent at finding *new* bugs. It is poor at
catching *regressions*, because nobody re-tests forty interactions after every deploy. This is
the short list that makes regressions survivable without a test framework.

---

## 1 · Taps do something (30s)
The single most repeated failure in this project. Four separate variants shipped.

- [ ] Any airport radar → tap a contact → detail appears in the footer
- [ ] Drones → LIST → tap a row under **UAV**
- [ ] Drones → LIST → tap a row under **MIL**
- [ ] Drones → LIST → tap a row under **SEA** (or confirm the honest empty state)
- [ ] Drones → LIST → tap a row under **SUB** (or confirm the honest empty state)

**Pass condition:** something visibly changes. If a contact is no longer live, the radar must
*say so* ("not airborne in this area now") rather than sit silent — a stated miss is a pass.

## 2 · Radar map controls (20s)
- [ ] Radar → **MAP** view → `+` and `−` respond to a single click
- [ ] Zoom buttons are visible, not buried under the footer readout
- [ ] Switch back to **RADAR** view and return — controls still work

## 3 · Radius and layer parity (30s)
The "does it work on the other surface too?" class.

- [ ] Drones → ARCHIVE → Activity map → tap **25nm / 100nm / 250nm** → numbers change
- [ ] Map view → **ACTIVITY** layer → same three chips exist and work
- [ ] Both agree for the same site at the same radius

## 4 · Near me (20s)
- [ ] Tap **Near me**, share location
- [ ] List re-sorts, **map recentres**, radar and nearby cams follow to a local feed
- [ ] Status line names the feed it opened

## 5 · Phone, if the deploy touched maps or layout (45s)
- [ ] One finger over a map **scrolls the page** (does not trap the gesture)
- [ ] Two fingers pan the map
- [ ] Zoom buttons are big enough to hit
- [ ] Nearby cams wrap into a grid, nothing runs off-screen

## 6 · The plausibility check (always)
Not a checkbox — a habit, and the one that found the worst bugs in this project.

> **Whenever a number appears: is that plausible?**

"344 aircraft at one Florida airport" was arithmetically correct and completely false. No test
suite would have caught it, because the code did exactly what it was written to do. Ask the
question anyway.

---

## Weekly, ~2 minutes

```bash
curl -s https://streetwatch-proxy.onrender.com/api/ai/status | python3 -m json.tool   # AI spend vs 500/day cap
curl -s https://streetwatch-proxy.onrender.com/metrics | python3 -m json.tool         # memory, cache hit ratio
```

- [ ] AI calls well under the daily cap
- [ ] `memMB` comfortably under Render's 512MB
- [ ] Neon dashboard — compute hours within the free tier
- [ ] Digest still reads sensibly (week-on-week comparisons appear once the archive passes 14 days)

---

## When something fails

Note **which step**, **what you saw**, and **which device**. That's enough to locate almost any
bug in this codebase — it's exactly how every bug in the build log was found.
