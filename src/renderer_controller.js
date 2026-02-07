export function formatPolyCount(count) {
  if (!Number.isFinite(count)) return "0";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

export function cameraRelativeLightDir(azimuthDeg, elevationDeg, forward, right, up) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const cosEl = Math.cos(el);
  const sinEl = Math.sin(el);
  const sinAz = Math.sin(az);
  const cosAz = Math.cos(az);
  const lx = right[0] * cosEl * sinAz + up[0] * sinEl + forward[0] * cosEl * cosAz;
  const ly = right[1] * cosEl * sinAz + up[1] * sinEl + forward[1] * cosEl * cosAz;
  const lz = right[2] * cosEl * sinAz + up[2] * sinEl + forward[2] * cosEl * cosAz;
  const len = Math.hypot(lx, ly, lz) || 1;
  return [lx / len, ly / len, lz / len];
}

