const missionStart = new Date("2026-05-31T09:15:00.000Z");
const totalAreaM2 = 1200;

export function buildSimulatedSnapshot(elapsedSeconds = 1104) {
  const cleanedArea = Math.min(totalAreaM2, 780 + Math.max(elapsedSeconds - 1104, 0) / 3);
  const remainingArea = Math.max(totalAreaM2 - cleanedArea, 0);
  const batteryPercent = Math.max(0, 76 - Math.floor(Math.max(elapsedSeconds - 1104, 0) / 240));
  const waterPercent = Math.max(0, 68 - Math.floor(Math.max(elapsedSeconds - 1104, 0) / 180));

  return {
    source: "simulation",
    generated_at: new Date().toISOString(),
    mission: {
      mission_id: "mission-rooftop-a",
      name: "Rooftop Plant A",
      state: "in_progress",
      started_at: missionStart.toISOString(),
      elapsed_seconds: elapsedSeconds,
      total_area_m2: totalAreaM2,
      cleaned_area_m2: Math.round(cleanedArea),
      remaining_area_m2: Math.round(remainingArea),
      eta_seconds: Math.max(0, Math.round(remainingArea / 0.55)),
      percent_complete: Math.round((cleanedArea / totalAreaM2) * 100),
    },
    vehicle: {
      drone_id: "PX4-X500-CAMERA-DOWN",
      mode: "Waiting for PX4 MAVLink",
      armed: false,
      altitude_m: 8.2,
      relative_altitude_m: 8.2,
      speed_mps: 1.2,
      heading_deg: 0,
      gps_fix: "simulated",
      latitude: null,
      longitude: null,
      failsafe: false,
    },
    battery: {
      percent: batteryPercent,
      voltage_v: 48.1,
      current_a: 18.6,
      remaining_minutes: 28,
    },
    cleaning: {
      water_percent: waterPercent,
      flow_lpm: 2.5,
      pump_on: true,
      nozzle_pressure_bar: 3.4,
      active_zone: "Zone 3",
      note: "ROS payload data is intentionally out of scope for this dashboard package.",
    },
    links: {
      rc: { status: "Unknown", rssi_dbm: null, latency_ms: null },
      telemetry: { status: "Waiting", rssi_dbm: null, latency_ms: null },
      video: { status: "Unconfigured", rssi_dbm: null, latency_ms: null },
    },
    environment: {
      temperature_c: 28,
      humidity_percent: 56,
      wind_speed_kmh: 12,
    },
    alerts: [
      {
        id: "evt-waiting-px4",
        timestamp: new Date().toISOString(),
        severity: "info",
        source: "backend",
        message: "Dashboard is running in simulation until PX4 MAVLink packets arrive.",
        recommended_action: "Start PX4 SITL with the x500_camera_down model and route MAVLink to the configured UDP port.",
        acknowledged: false,
      },
    ],
    zones: buildZones(),
  };
}

export function buildZones() {
  return [
    { id: "z1", label: "Zone 1", state: "cleaned", pass_count: 1 },
    { id: "z2", label: "Zone 2", state: "cleaned", pass_count: 1 },
    { id: "z3", label: "Zone 3", state: "in_progress", pass_count: 2 },
    { id: "z4", label: "Zone 4", state: "planned", pass_count: 0 },
    { id: "z5", label: "Zone 5", state: "planned", pass_count: 0 },
  ];
}
