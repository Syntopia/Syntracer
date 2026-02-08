function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeQuat(q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function quatFromAxisAngle(axis, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return normalizeQuat([axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)]);
}

export function quatMultiply(a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

export function quatRotateVec(q, v) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const vx = v[0], vy = v[1], vz = v[2];
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

export function applyOrbitDragToRotation(rotation, dx, dy, options = {}) {
  const rotateSpeed = options.rotateSpeed ?? 0.004;

  const yaw = -dx * rotateSpeed;
  const pitch = -dy * rotateSpeed;
  let nextRotation = normalizeQuat(rotation);

  // Yaw: rotate around the camera's local up axis (viewport Y projected into 3D)
  if (Math.abs(yaw) > 1e-8) {
    const upAxisRaw = quatRotateVec(nextRotation, [0, 1, 0]);
    const upLen = Math.hypot(upAxisRaw[0], upAxisRaw[1], upAxisRaw[2]) || 1;
    const upAxis = [upAxisRaw[0] / upLen, upAxisRaw[1] / upLen, upAxisRaw[2] / upLen];
    const yawDelta = quatFromAxisAngle(upAxis, yaw);
    nextRotation = normalizeQuat(quatMultiply(yawDelta, nextRotation));
  }

  // Pitch: rotate around the camera's local right axis (viewport X projected into 3D)
  if (Math.abs(pitch) > 1e-8) {
    const rightAxisRaw = quatRotateVec(nextRotation, [1, 0, 0]);
    const rightLen = Math.hypot(rightAxisRaw[0], rightAxisRaw[1], rightAxisRaw[2]) || 1;
    const rightAxis = [rightAxisRaw[0] / rightLen, rightAxisRaw[1] / rightLen, rightAxisRaw[2] / rightLen];
    const pitchDelta = quatFromAxisAngle(rightAxis, pitch);
    nextRotation = normalizeQuat(quatMultiply(pitchDelta, nextRotation));
  }

  return nextRotation;
}

export function resolveRotationLock(currentLock, dx, dy, thresholdPx = 2.0) {
  if (currentLock === "yaw" || currentLock === "pitch") {
    return currentLock;
  }
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < thresholdPx && ady < thresholdPx) {
    return null;
  }
  return adx >= ady ? "yaw" : "pitch";
}
