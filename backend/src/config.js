export function readConfig(env = process.env) {
  return {
    host: env.HOST || "127.0.0.1",
    port: numberFromEnv(env.PORT, 5000),
    mavlinkHost: env.PX4_MAVLINK_HOST || "0.0.0.0",
    mavlinkPort: numberFromEnv(env.PX4_MAVLINK_PORT, 14550),
    cameraUrl: env.PX4_CAMERA_URL || "",
    cameraKind: env.PX4_CAMERA_KIND || inferCameraKind(env.PX4_CAMERA_URL || ""),
    gzCameraTopic: env.GZ_CAMERA_TOPIC || "",
    gzCameraAutoStart: boolFromEnv(env.GZ_CAMERA_AUTO_START, false),
    gzCommand: env.GZ_COMMAND || "gz",
  };
}

function numberFromEnv(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferCameraKind(url) {
  const normalized = url.toLowerCase();
  if (normalized.endsWith(".m3u8")) {
    return "hls";
  }
  if (normalized.endsWith(".mp4") || normalized.endsWith(".webm")) {
    return "video";
  }
  if (normalized.includes("mjpg") || normalized.includes("mjpeg")) {
    return "mjpeg";
  }
  if (normalized.startsWith("rtsp://")) {
    return "rtsp";
  }
  return url ? "image" : "none";
}

function boolFromEnv(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
