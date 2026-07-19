import { useState, useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { C, LAYERS } from "../theme.js";
import AviationRadar from "./AviationRadar.jsx";
import MarineRadar from "./MarineRadar.jsx";
import EarthView from "./EarthView.jsx";
import SpaceView from "./SpaceView.jsx";

export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

// Animated live preview for camera layers.
export function LiveViewport({ cam, now, onOpen }) {
  const canvasRef = useRef(null);
  const color = LAYERS[cam.layer].color;
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); let raf, t = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = () => {
      const { width: w, height: h } = canvas;
      ctx.fillStyle = "#0A0D12"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(90,100,115,0.18)"; ctx.lineWidth = 1;
      const vpx = w / 2, vpy = h * 0.42;
      for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(vpx + i * 14, vpy); ctx.lineTo(vpx + i * 90, h); ctx.stroke(); }
      for (let j = 1; j <= 7; j++) { const y = vpy + Math.pow(j / 7, 2) * (h - vpy); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let k = 0; k < 5; k++) {
        const p = ((t * (0.4 + k * 0.12) + k * 40) % 100) / 100;
        const y = vpy + Math.pow(p, 2) * (h - vpy);
        const x = vpx + (k % 2 === 0 ? 1 : -1) * (18 + p * 120); const s = 1 + p * 4;
        ctx.fillStyle = k % 3 === 0 ? color : "rgba(232,234,237,0.6)"; ctx.fillRect(x, y, s * 1.6, s);
      }
      if (!reduce) {
        const by = (t * 1.4 % (h + 60)) - 30;
        const g = ctx.createLinearGradient(0, by - 30, 0, by + 30);
        g.addColorStop(0, "rgba(55,196,106,0)"); g.addColorStop(0.5, "rgba(55,196,106,0.10)"); g.addColorStop(1, "rgba(55,196,106,0)");
        ctx.fillStyle = g; ctx.fillRect(0, by - 30, w, 60);
      }
      t += reduce ? 0 : 1; raf = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, [cam, color]);
  return <Frame cam={cam} now={now} onOpen={onOpen}><canvas ref={canvasRef} width={640} height={400} className="w-full h-full block" /></Frame>;
}

// Static preview for data layers (aviation, marine, weather, space).
export function DataPreview({ cam, now, onOpen }) {
  const L = LAYERS[cam.layer]; const Icon = L.icon;
  return (
    <Frame cam={cam} now={now} onOpen={onOpen}>
      <button onClick={onOpen} className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ cursor: "pointer", background:
        `radial-gradient(600px 300px at 50% 30%, ${L.color}14, transparent), #0A0D12` }}>
        <Icon size={54} color={L.color} strokeWidth={1.4} />
        <span className="flex items-center gap-2 px-4 py-2 rounded-full font-mono"
          style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: "#0A0D12", background: L.color }}>
          <ExternalLink size={15} /> WATCH LIVE
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: C.dim, letterSpacing: 0.5 }}>
          Opens {cam.src} in your browser
        </span>
      </button>
    </Frame>
  );
}

export default function Frame({ cam, now, onOpen, children }) {
  const L = LAYERS[cam.layer];
  const ts = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className="group relative w-full overflow-hidden rounded-lg"
      style={{ border: `1px solid ${C.line}`, background: "#0A0D12", aspectRatio: "16 / 10", cursor: "pointer" }}>
      {children}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
        style={{ transition: "opacity .18s", background: "rgba(10,13,18,0.35)" }}>
        <span className="flex items-center gap-2 px-3 py-2 rounded font-mono"
          style={{ background: L.color, color: C.ink, fontSize: 12, fontWeight: 700 }}>
          <ExternalLink size={14} /> Open live in browser
        </span>
      </div>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(180deg, rgba(10,13,18,0.85), rgba(10,13,18,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded" style={{ background: `${L.color}22` }}>
          <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: L.color, display: "inline-block" }} />
          <span className="font-mono" style={{ fontSize: 11, letterSpacing: 1, color: L.color }}>LIVE</span>
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: C.dim }}>{cam.id}</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 py-2"
        style={{ background: "linear-gradient(0deg, rgba(10,13,18,0.9), rgba(10,13,18,0))" }}>
        <div>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{cam.name}</div>
          <div className="font-mono" style={{ fontSize: 11, color: C.faint }}>{cam.lat.toFixed(3)}, {cam.lng.toFixed(3)} · {cam.src}</div>
        </div>
        <div className="font-mono text-right" style={{ fontSize: 11, color: C.faint }}>{ts}</div>
      </div>
    </div>
  );
}

