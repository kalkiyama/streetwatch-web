import { useEffect, useState } from "react";
import { Camera, ExternalLink } from "lucide-react";
import { C } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// Public webcams near the feed you're looking at, via Windy. Deliberately collapsed by
// default: it's a supporting detail, not the main event, and it costs an upstream request.
const INITIAL = 6;   // fits without scrolling at two columns on a phone

export default function NearbyCams({ lat, lon, name }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setData(null); setOpen(false); setShowAll(false); }, [lat, lon]);

  useEffect(() => {
    if (!open || data || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    let alive = true;
    setLoading(true);
    fetch(`${BACKEND_URL}/api/webcams?lat=${lat}&lon=${lon}&radius=50&limit=12`)
      .then((r) => r.json())
      .then((j) => { if (alive) setData(j); })
      .catch(() => { if (alive) setData({ error: "Could not reach StreetWatch backend" }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, data, lat, lon]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cams = (data && data.webcams) || [];

  return (
    <div className="px-4 pb-3">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded font-mono"
        style={{ fontSize: 10, letterSpacing: 0.5, color: open ? C.ink : "#37C46A",
          background: open ? "#37C46A" : "rgba(55,196,106,0.12)",
          border: "1px solid rgba(55,196,106,0.4)" }}>
        <Camera size={11} />
        NEARBY CAMS{data && data.count ? ` ${data.count}` : ""}
      </button>

      {open && (
        <div className="mt-2">
          {loading && <div className="font-mono" style={{ fontSize: 10, color: C.faint }}>looking for public cameras within 50km…</div>}

          {!loading && data && data.configured === false && (
            <div className="font-mono" style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
              Windy webcams aren&rsquo;t configured on this instance yet.
            </div>
          )}

          {!loading && data && data.error && (
            <div className="font-mono" style={{ fontSize: 10, color: "#F6A821" }}>{data.error}</div>
          )}

          {!loading && data && data.configured !== false && !data.error && cams.length === 0 && (
            <div className="font-mono" style={{ fontSize: 10, color: C.faint }}>
              No public webcams listed within 50km of {name || "this feed"}.
            </div>
          )}

          {cams.length > 0 && (
            <>
              {/* A single horizontal row ran the cameras off the edge of the screen — the ones
                  that mattered were the ones you could not see. A grid wraps to whatever width
                  the device gives it: two columns on a narrow phone, four or five on a desktop,
                  and it reflows on rotation without any breakpoint guessing. */}
              <div style={{ display: "grid", gap: 8,
                gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))" }}>
                {(showAll ? cams : cams.slice(0, INITIAL)).map((w) => (
                  <a key={w.id} href={w.live || w.day || "#"} target="_blank" rel="noopener noreferrer"
                    className="rounded overflow-hidden"
                    style={{ border: `1px solid ${C.line}`, background: C.panel2 }}>
                    {w.thumb ? (
                      <img src={w.thumb} alt={w.title || "webcam"} loading="lazy"
                        style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block",
                          opacity: w.status === "inactive" ? 0.45 : 1 }} />
                    ) : (
                      <div style={{ width: "100%", aspectRatio: "16 / 9", background: C.ink }} />
                    )}
                    <div className="px-1.5 py-1 font-mono" style={{ fontSize: 9, color: C.dim, lineHeight: 1.3 }}>
                      <div style={{ color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {w.title || "Webcam"}
                      </div>
                      <div className="flex items-center gap-1" style={{ color: C.faint }}>
                        {w.status === "inactive" ? "inactive" : w.live ? "live" : "timelapse"}
                        <ExternalLink size={8} />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
              {cams.length > INITIAL && (
                <button onClick={() => setShowAll(!showAll)} className="mt-1.5 px-2 py-1 rounded font-mono"
                  style={{ fontSize: 10, color: "#37C46A", background: "rgba(55,196,106,0.10)",
                    border: "1px solid rgba(55,196,106,0.35)" }}>
                  {showAll ? "SHOW FEWER" : `SHOW ALL ${cams.length} CAMERAS`}
                </button>
              )}
              <div className="font-mono mt-1" style={{ fontSize: 9, color: C.faint, lineHeight: 1.5 }}>
                Public webcams via Windy · opens on windy.com · free tier serves low-resolution
                images and links expire after ~10 minutes
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
