// Shared palette, layer definitions, and link helpers.
import { Car, Plane, Ship, CloudSun, Camera, PawPrint, Satellite } from "lucide-react";

export const C = {
  ink: "#0E1116", panel: "#161A21", panel2: "#1C212B", line: "#2A303C",
  text: "#E8EAED", dim: "#8A94A3", faint: "#5A6473", amber: "#F6A821", cyan: "#5AC8FA",
};

// Public layers — every source is published for public viewing.
export const LAYERS = {
  traffic:  { label: "Traffic",  icon: Car,       color: "#F6A821", camera: true,  desc: "Public DOT / motorway road cameras." },
  aviation: { label: "Aviation", icon: Plane,     color: "#5AC8FA", camera: false, desc: "Open ADS-B live flight & airport activity." },
  marine:   { label: "Marine",   icon: Ship,      color: "#2563EB", camera: false, desc: "Open AIS live ship positions & ports." },
  weather:  { label: "Earth",    icon: CloudSun,  color: "#A78BFA", camera: false, desc: "Public satellite & weather imagery." },
  webcam:   { label: "Webcams",  icon: Camera,    color: "#37C46A", camera: true,  desc: "Published public webcams — squares, beaches, landmarks." },
  wildlife: { label: "Wildlife", icon: PawPrint,  color: "#A3E635", camera: true,  desc: "Public conservation & nature livestreams." },
  space:    { label: "Space",    icon: Satellite, color: "#F472B6", camera: false, desc: "Live orbital feeds & tracking." },
};
export const layerKeys = Object.keys(LAYERS);

// Route app-pushy sources to web-first viewers that render in the browser.
export const resolveUrl = (cam) =>
  cam.layer === "aviation"
    ? `https://globe.adsbexchange.com/?SiteLat=${cam.lat.toFixed(3)}&SiteLon=${cam.lng.toFixed(3)}`
    : cam.url;
export const openLive = (cam) => { if (typeof window !== "undefined") window.open(resolveUrl(cam), "_blank", "noopener,noreferrer"); };
