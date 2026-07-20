// Touch-scroll guard for Leaflet maps on phones.
//
// The problem: Leaflet claims every one-finger drag to pan the map. A tall map rendered
// edge-to-edge becomes a wall the thumb cannot scroll past — the page is trapped.
// The fix is the convention Google Maps embeds taught everyone: ONE finger scrolls the
// page, TWO fingers pan the map. Desktop pointers are unaffected.
export function guardTouchScroll(map) {
  if (typeof window === "undefined") return;
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) return;                       // mouse/trackpad users keep one-finger drag

  const el = map.getContainer();
  map.dragging.disable();
  // Leaflet sets touch-action:none; pan-y hands vertical swipes back to the page
  el.style.touchAction = "pan-y";

  // hint shown the first few times a single finger tries to pan
  let hint = null, hintTimer = null, hintShown = 0;
  const showHint = () => {
    if (hintShown >= 3) return;              // stop nagging once the idea has landed
    if (!hint) {
      hint = document.createElement("div");
      hint.textContent = "Use two fingers to move the map";
      Object.assign(hint.style, {
        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        background: "rgba(10,14,19,0.82)", color: "#E6EAF2", padding: "8px 14px",
        borderRadius: "6px", font: "500 12px system-ui,sans-serif", zIndex: 1400,
        pointerEvents: "none", transition: "opacity .3s", opacity: "0",
      });
      el.appendChild(hint);
    }
    hintShown++;
    hint.style.opacity = "1";
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { if (hint) hint.style.opacity = "0"; }, 1400);
  };

  const onTouchStart = (e) => {
    if (e.touches.length >= 2) {
      map.dragging.enable();
      el.style.touchAction = "none";         // both fingers belong to the map now
      if (hint) hint.style.opacity = "0";
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 1 && !map.dragging.enabled()) showHint();
  };
  const onTouchEnd = (e) => {
    if (e.touches.length === 0) {
      map.dragging.disable();
      el.style.touchAction = "pan-y";
    }
  };
  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchmove", onTouchMove, { passive: true });
  el.addEventListener("touchend", onTouchEnd, { passive: true });
  el.addEventListener("touchcancel", onTouchEnd, { passive: true });

  return () => {
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchEnd);
    clearTimeout(hintTimer);
    if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
  };
}
