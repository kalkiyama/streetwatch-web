// How many satellites to plot, decided by MEASURING this device rather than guessing at it.
//
// WHY NOT DETECT THE DEVICE: a ₹4,000 Android and a Galaxy S26 Ultra are both "mobile", and the
// gap between them is larger than the gap between the Ultra and a laptop. Core counts lie about
// throughput, navigator.deviceMemory does not exist on iOS, and a flagship in battery-saver
// behaves like a budget phone. Frame time is the one signal that describes the device actually in
// front of the person, in the state it is actually in.
//
// The ladder starts LOW and climbs. Starting high and backing off means the first thing a slow
// device does is stutter, which is the impression that sticks.

export const LADDER = [750, 1500, 3000, 6000, 12000, 0];   // 0 = no limit
const START_INDEX = 1;          // 1500: safe on almost anything, still looks like a constellation

// Hysteresis, deliberately asymmetric. Climbing needs sustained good frames; dropping happens fast.
// A person notices one second of stutter far more than they notice a step up arriving late.
const GOOD_MS = 20;             // ~50fps
const BAD_MS  = 33;             // ~30fps
const CLIMB_AFTER = 90;         // frames of good performance before stepping up
const DROP_AFTER = 20;          // frames of bad performance before stepping down
const SETTLE_FRAMES = 45;       // ignore measurements straight after a change: the step itself costs

export function createDensityController(onChange) {
  let idx = START_INDEX;
  let good = 0, bad = 0, settle = SETTLE_FRAMES;
  let last = 0;
  let manual = false;           // once a person picks a level, stop second-guessing them
  let ceilingIdx = LADDER.length - 1;

  return {
    get limit() { return LADDER[idx]; },
    get index() { return idx; },
    get auto() { return !manual; },

    // Called every animation frame with the timestamp requestAnimationFrame provides.
    sample(now) {
      if (manual) return;
      if (last === 0) { last = now; return; }
      const dt = now - last;
      last = now;
      if (settle > 0) { settle--; return; }

      // A tab that was backgrounded reports a huge delta on its first frame back. That is not the
      // device being slow, so it is discarded rather than triggering a drop.
      if (dt > 500) { good = 0; bad = 0; settle = SETTLE_FRAMES; return; }

      if (dt <= GOOD_MS) { good++; bad = 0; } else if (dt >= BAD_MS) { bad++; good = 0; } else { good = 0; bad = 0; }

      if (bad >= DROP_AFTER && idx > 0) {
        // Remember where it broke BEFORE stepping down. Recording the ceiling after the decrement
        // left the failing level still reachable, so the device climbed back into the stutter it
        // had just escaped — a sawtooth, which is worse than settling one rung low.
        ceilingIdx = Math.min(ceilingIdx, idx - 1);
        idx--;
        good = bad = 0; settle = SETTLE_FRAMES;
        onChange(LADDER[idx], true);
      } else if (good >= CLIMB_AFTER && idx < ceilingIdx) {
        idx++;
        good = bad = 0; settle = SETTLE_FRAMES;
        onChange(LADDER[idx], true);
      }
    },

    setManual(limit) {
      manual = true;
      const found = LADDER.indexOf(limit);
      idx = found >= 0 ? found : START_INDEX;
      onChange(LADDER[idx], false);
    },

    setAuto() {
      manual = false;
      good = bad = 0; settle = SETTLE_FRAMES;
      ceilingIdx = LADDER.length - 1;   // a fresh look: the device may be plugged in now
      onChange(LADDER[idx], true);
    },
  };
}

// Plain-language label for whatever the controller settled on, so the number on screen is never
// unexplained. "3,000 of 10,754" alone reads like a failure; saying why it is 3,000 does not.
export function densityNote(limit, plotted, total, auto) {
  if (!total) return "";
  // "the full set" claimed completeness of the CATEGORY when it only ever meant "nothing was
  // dropped by the plot limit". Harmless for Starlink, badly wrong for the military group, whose
  // heading has to say "not all that fly" while this line said the opposite directly beneath it.
  // "all N available" is the same fact without the stronger claim.
  if (!limit || plotted >= total) return `all ${total.toLocaleString()} available`;
  const of = `${plotted.toLocaleString()} of ${total.toLocaleString()}`;
  return auto
    ? `${of} \u2014 an even sample, adjusted to keep this device smooth`
    : `${of} \u2014 an even sample at the level you chose`;
}
