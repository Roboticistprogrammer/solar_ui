import { EventEmitter } from "node:events";
import { buildSimulatedSnapshot, buildZones } from "./simulator.js";

const ARMED_FLAG = 0x80;
const CRITICAL_STATUS = new Set([4, 5, 6, 7, 8]);
const TELEMETRY_FRESHNESS_MS = 10_000;

export class TelemetryStore extends EventEmitter {
  constructor({ cameraUrl = "", cameraKind = "none" } = {}) {
    super();
    this.startedAt = Date.now();
    this.lastMavlinkAt = null;
    this.lastMessages = [];
    this.state = {
      heartbeat: null,
      sysStatus: null,
      gps: null,
      attitude: null,
      localPosition: null,
      globalPosition: null,
      vfrHud: null,
      radioStatus: null,
      batteryStatus: null,
      jsonTelemetry: null,
    };
    this.camera = {
      url: cameraUrl,
      kind: cameraKind,
      status: cameraUrl ? "configured" : "unconfigured",
    };
    this.snapshot = this.buildSnapshot();
  }

  ingestMavlink(messages) {
    if (!messages.length) {
      return;
    }
    this.lastMavlinkAt = Date.now();
    this.lastMessages = messages.slice(-20);

    for (const message of messages) {
      switch (message.type) {
        case "heartbeat":
          this.state.heartbeat = message;
          break;
        case "sys_status":
          this.state.sysStatus = message;
          break;
        case "gps_raw_int":
          this.state.gps = message;
          break;
        case "attitude":
          this.state.attitude = message;
          break;
        case "local_position_ned":
          this.state.localPosition = message;
          break;
        case "global_position_int":
          this.state.globalPosition = message;
          break;
        case "vfr_hud":
          this.state.vfrHud = message;
          break;
        case "radio_status":
          this.state.radioStatus = message;
          break;
        case "battery_status":
          this.state.batteryStatus = message;
          break;
        default:
          break;
      }
    }

    this.publish();
  }

  ingestJsonTelemetry(payload) {
    this.state.jsonTelemetry = {
      ...payload,
      received_at: new Date().toISOString(),
    };
    this.publish();
  }

  setCamera(camera) {
    this.camera = {
      ...this.camera,
      ...camera,
    };
    this.publish();
  }

  publish() {
    this.snapshot = this.buildSnapshot();
    this.emit("snapshot", this.snapshot);
  }

  buildSnapshot() {
    const simulated = buildSimulatedSnapshot(Math.floor((Date.now() - this.startedAt) / 1000) + 1104);
    const telemetryOnline = this.lastMavlinkAt && Date.now() - this.lastMavlinkAt < TELEMETRY_FRESHNESS_MS;
    const heartbeat = this.state.heartbeat;
    const globalPosition = this.state.globalPosition;
    const localPosition = this.state.localPosition;
    const vfrHud = this.state.vfrHud;
    const sysStatus = this.state.sysStatus;
    const batteryStatus = this.state.batteryStatus;
    const jsonTelemetry = this.state.jsonTelemetry;

    const speedMps = jsonTelemetry?.speed_mps
      ?? vfrHud?.groundspeed_mps
      ?? vectorSpeed(globalPosition?.vx_mps, globalPosition?.vy_mps, globalPosition?.vz_mps)
      ?? vectorSpeed(localPosition?.vx_mps, localPosition?.vy_mps, localPosition?.vz_mps)
      ?? simulated.vehicle.speed_mps;

    const batteryPercent = clampPercent(
      jsonTelemetry?.battery?.percent
      ?? jsonTelemetry?.battery_percent
      ?? batteryStatus?.battery_remaining_percent
      ?? sysStatus?.battery_remaining_percent
      ?? simulated.battery.percent,
    );

    const voltage = jsonTelemetry?.battery?.voltage_v
      ?? jsonTelemetry?.voltage_v
      ?? batteryStatus?.voltage_v
      ?? sysStatus?.voltage_battery_v
      ?? simulated.battery.voltage_v;

    const current = jsonTelemetry?.battery?.current_a
      ?? jsonTelemetry?.current_a
      ?? batteryStatus?.current_battery_a
      ?? sysStatus?.current_battery_a
      ?? simulated.battery.current_a;

    const failsafe = heartbeat ? CRITICAL_STATUS.has(heartbeat.system_status) : false;
    const armed = heartbeat ? Boolean(heartbeat.base_mode & ARMED_FLAG) : false;

    return {
      ...simulated,
      source: telemetryOnline ? "px4_mavlink" : simulated.source,
      generated_at: new Date().toISOString(),
      telemetry: {
        connected: Boolean(telemetryOnline),
        listening: true,
        last_packet_at: this.lastMavlinkAt ? new Date(this.lastMavlinkAt).toISOString() : null,
        recent_message_types: this.lastMessages.map((message) => message.type),
      },
      video: this.buildVideoStatus(),
      vehicle: {
        ...simulated.vehicle,
        drone_id: jsonTelemetry?.id ?? (heartbeat ? `PX4-${heartbeat.system_id}` : simulated.vehicle.drone_id),
        mode: heartbeat ? px4ModeLabel(heartbeat) : simulated.vehicle.mode,
        armed,
        altitude_m: round(jsonTelemetry?.altitude_m ?? vfrHud?.altitude_m ?? globalPosition?.altitude_m ?? simulated.vehicle.altitude_m, 2),
        relative_altitude_m: round(jsonTelemetry?.relative_altitude_m ?? globalPosition?.relative_altitude_m ?? Math.abs(localPosition?.z_m ?? simulated.vehicle.relative_altitude_m), 2),
        speed_mps: round(speedMps, 2),
        heading_deg: round(jsonTelemetry?.heading_deg ?? vfrHud?.heading_deg ?? globalPosition?.heading_deg ?? simulated.vehicle.heading_deg, 1),
        gps_fix: gpsFixLabel(jsonTelemetry?.gps_fix ?? this.state.gps?.fix_type),
        latitude: jsonTelemetry?.latitude ?? globalPosition?.latitude ?? null,
        longitude: jsonTelemetry?.longitude ?? globalPosition?.longitude ?? null,
        failsafe,
      },
      battery: {
        percent: batteryPercent,
        voltage_v: round(voltage, 2),
        current_a: round(current, 2),
        remaining_minutes: estimateRemainingMinutes(batteryPercent),
      },
      cleaning: {
        ...simulated.cleaning,
        water_percent: jsonTelemetry?.water_percent ?? simulated.cleaning.water_percent,
        pump_on: jsonTelemetry?.pump_on ?? simulated.cleaning.pump_on,
      },
      links: {
        rc: radioLink(this.state.radioStatus),
        telemetry: {
          status: telemetryOnline ? "Live" : "Waiting",
          rssi_dbm: null,
          latency_ms: telemetryOnline ? Math.max(0, Date.now() - this.lastMavlinkAt) : null,
        },
        video: {
          status: this.camera.url ? "Configured" : "Unconfigured",
          rssi_dbm: null,
          latency_ms: null,
        },
      },
      alerts: buildAlerts({ telemetryOnline, batteryPercent, failsafe, camera: this.camera, simulatedAlerts: simulated.alerts }),
      zones: buildZones(),
    };
  }

  buildVideoStatus() {
    return {
      url: this.camera.url,
      kind: this.camera.kind,
      status: this.camera.status,
      configured: Boolean(this.camera.url),
      browser_renderable: ["mjpeg", "image", "video", "hls"].includes(this.camera.kind),
      note: this.camera.kind === "rtsp"
        ? "Browsers cannot render RTSP directly. Bridge PX4/Gazebo camera output to MJPEG, HLS, or WebRTC and set PX4_CAMERA_URL to that stream."
        : "",
    };
  }
}

function buildAlerts({ telemetryOnline, batteryPercent, failsafe, camera, simulatedAlerts }) {
  const alerts = [];
  if (!telemetryOnline) {
    alerts.push({
      id: "evt-telemetry-waiting",
      timestamp: new Date().toISOString(),
      severity: "warning",
      source: "mavlink",
      message: "No PX4 MAVLink packets have been received yet.",
      recommended_action: "Start PX4 SITL and route UDP MAVLink to this backend.",
      acknowledged: false,
    });
  }
  if (!camera.url) {
    alerts.push({
      id: "evt-camera-unconfigured",
      timestamp: new Date().toISOString(),
      severity: "warning",
      source: "video",
      message: "Camera stream URL is not configured.",
      recommended_action: "Bridge the x500_camera_down camera to MJPEG/HLS/WebRTC and set PX4_CAMERA_URL.",
      acknowledged: false,
    });
  }
  if (batteryPercent <= 25) {
    alerts.push({
      id: "evt-battery-low",
      timestamp: new Date().toISOString(),
      severity: batteryPercent <= 15 ? "critical" : "warning",
      source: "px4",
      message: `Battery is at ${batteryPercent}%.`,
      recommended_action: "Monitor mission margin in QGC and prepare the approved recovery procedure.",
      acknowledged: false,
    });
  }
  if (failsafe) {
    alerts.push({
      id: "evt-px4-failsafe",
      timestamp: new Date().toISOString(),
      severity: "critical",
      source: "px4",
      message: "PX4 reports a critical or emergency system state.",
      recommended_action: "Use QGC and the site safety procedure for intervention.",
      acknowledged: false,
    });
  }
  return alerts.length ? alerts : simulatedAlerts;
}

function px4ModeLabel(heartbeat) {
  const prefix = heartbeat.base_mode & ARMED_FLAG ? "Armed" : "Standby";
  return `${prefix} / PX4 custom mode ${heartbeat.custom_mode}`;
}

function gpsFixLabel(value) {
  if (typeof value === "string") {
    return value;
  }
  const labels = {
    0: "No GPS",
    1: "No fix",
    2: "2D fix",
    3: "3D fix",
    4: "DGPS",
    5: "RTK float",
    6: "RTK fixed",
  };
  return labels[value] || "Unknown";
}

function radioLink(radioStatus) {
  if (!radioStatus) {
    return { status: "Unknown", rssi_dbm: null, latency_ms: null };
  }
  const signal = Math.max(radioStatus.rssi, radioStatus.remote_rssi);
  return {
    status: signal > 180 ? "Strong" : signal > 100 ? "Moderate" : "Weak",
    rssi_dbm: signal,
    latency_ms: null,
  };
}

function vectorSpeed(x, y, z) {
  if (![x, y, z].every((value) => typeof value === "number")) {
    return null;
  }
  return Math.sqrt(x ** 2 + y ** 2 + z ** 2);
}

function estimateRemainingMinutes(percent) {
  return Math.max(0, Math.round(percent * 0.36));
}

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function round(value, digits) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}
