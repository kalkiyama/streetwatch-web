import { useState, useEffect } from "react";

// A clock that ticks, for anything displaying "N seconds ago" or a wall time.
//
// Lives in its own file because a module exporting BOTH a component and a hook breaks fast refresh
// — React cannot tell whether to remount or re-run on edit, so it gives up and reloads the page.
// It was previously exported from FeedViewer.jsx alongside two components.
//
// Reading Date.now() during render instead is the other way to do this, and it is worse twice
// over: the value never updates until something else re-renders, and it makes render impure.
export function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
