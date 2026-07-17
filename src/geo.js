// Geometry + randomness helpers shared across views.
export const RAD = Math.PI / 180;
export const distKm = (aLat, aLng, bLat, bLng) => {
  const dLat = (bLat - aLat) * RAD, dLng = (bLng - aLng) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
};
export const rnd = (a, b) => a + Math.random() * (b - a);
