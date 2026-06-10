import { useEffect, useState } from "react";
import { connectTelemetryStream, fetchTelemetry, fetchVideoConfig, startGazeboCameraBridge } from "./services/api.js";

const initialSnapshot = {
  source: "loading",
  mission: {
    name: "Loading mission",
    state: "loading",
    elapsed_seconds: 0,
    eta_seconds: 0,
    total_area_m2: 0,
    cleaned_area_m2: 0,
    remaining_area_m2: 0,
    percent_complete: 0,
  },
  vehicle: {
    drone_id: "PX4",
    mode: "Waiting",
    armed: false,
    altitude_m: 0,
    relative_altitude_m: 0,
    speed_mps: 0,
    heading_deg: 0,
    gps_fix: "Unknown",
    latitude: null,
    longitude: null,
    failsafe: false,
  },
  battery: {
    percent: 0,
    voltage_v: 0,
    current_a: 0,
    remaining_minutes: 0,
  },
  cleaning: {
    water_percent: 0,
    flow_lpm: 0,
    pump_on: false,
    active_zone: "None",
  },
  links: {
    telemetry: { status: "Waiting", latency_ms: null },
    video: { status: "Unconfigured" },
    rc: { status: "Unknown" },
  },
  telemetry: {
    connected: false,
    last_packet_at: null,
    recent_message_types: [],
  },
  video: {
    url: "",
    kind: "none",
    configured: false,
    browser_renderable: false,
    note: "",
  },
  alerts: [],
  zones: [],
};

export default function App() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [video, setVideo] = useState(initialSnapshot.video);
  const [streamConnected, setStreamConnected] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState("");

  useEffect(() => {
    fetchTelemetry().then(setSnapshot).catch(() => undefined);
    fetchVideoConfig().then(setVideo).catch(() => undefined);
    const disconnect = connectTelemetryStream({
      onOpen: () => setStreamConnected(true),
      onError: () => setStreamConnected(false),
      onTelemetry: (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setVideo(nextSnapshot.video);
      },
    });
    return disconnect;
  }, []);

  const percentComplete = snapshot.mission.percent_complete
    ?? Math.round((snapshot.mission.cleaned_area_m2 / Math.max(snapshot.mission.total_area_m2, 1)) * 100);

  const sourceLabel = snapshot.telemetry.connected ? "PX4 MAVLink Live" : "Simulation Fallback";

  async function handleStartGazeboBridge() {
    setBridgeMessage("Starting Gazebo bridge...");
    try {
      const result = await startGazeboCameraBridge();
      setVideo(result.video);
      setBridgeMessage(result.bridge.error || `Gazebo bridge ${result.bridge.status}`);
    } catch (error) {
      setBridgeMessage(error.message);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <img src="/logo.png" alt="DroneX logo" />
          </span>
          <div>
            <strong>DroneX Solar UI</strong>
            <small>PX4 operations monitor</small>
          </div>
        </div>
        <nav>
          <a className="active" href="#overview">Overview</a>
          <a href="#video">Camera</a>
          <a href="#mission">Mission</a>
          <a href="#alerts">Alerts</a>
        </nav>
        <StatusPanel snapshot={snapshot} streamConnected={streamConnected} sourceLabel={sourceLabel} />
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">{sourceLabel}</p>
            <h1>{snapshot.mission.name}</h1>
            <p>{snapshot.vehicle.drone_id} | {snapshot.vehicle.mode} | {snapshot.vehicle.gps_fix}</p>
          </div>
          <div className="quick-stats">
            <Metric label="Battery" value={`${snapshot.battery.percent}%`} tone={snapshot.battery.percent < 25 ? "bad" : "good"} />
            <Metric label="Water" value={`${snapshot.cleaning.water_percent}%`} />
            <Metric label="Altitude" value={`${snapshot.vehicle.relative_altitude_m || snapshot.vehicle.altitude_m} m`} />
            <Metric label="Speed" value={`${snapshot.vehicle.speed_mps} m/s`} />
          </div>
        </header>

        <div className="dashboard-grid">
          <section className="panel video-panel" id="video">
            <PanelHeader title="Downward Camera" status={video.configured ? video.status : "Needs stream URL"} />
            <VideoFeed video={video} bridgeMessage={bridgeMessage} onStartBridge={handleStartGazeboBridge} />
          </section>

          <section className="panel mission-panel" id="mission">
            <PanelHeader title="Mission Progress" status={`${percentComplete}% complete`} />
            <div className="progress-row">
              <div className="progress-ring" style={{ "--progress": `${percentComplete}%` }}>
                <span>{percentComplete}%</span>
              </div>
              <div className="mission-numbers">
                <Metric label="Cleaned" value={`${snapshot.mission.cleaned_area_m2} m2`} />
                <Metric label="Remaining" value={`${snapshot.mission.remaining_area_m2} m2`} />
                <Metric label="ETA" value={formatDuration(snapshot.mission.eta_seconds)} />
              </div>
            </div>
            <CoverageMap zones={snapshot.zones} activeZone={snapshot.cleaning.active_zone} />
          </section>

          <section className="panel">
            <PanelHeader title="PX4 Telemetry" status={snapshot.telemetry.connected ? "Receiving" : "Waiting"} />
            <dl className="details">
              <div><dt>Armed</dt><dd>{snapshot.vehicle.armed ? "Yes" : "No"}</dd></div>
              <div><dt>Failsafe</dt><dd>{snapshot.vehicle.failsafe ? "Active" : "Clear"}</dd></div>
              <div><dt>Heading</dt><dd>{snapshot.vehicle.heading_deg} deg</dd></div>
              <div><dt>Last packet</dt><dd>{snapshot.telemetry.last_packet_at ? new Date(snapshot.telemetry.last_packet_at).toLocaleTimeString() : "none"}</dd></div>
              <div><dt>Recent messages</dt><dd>{snapshot.telemetry.recent_message_types.slice(-5).join(", ") || "none"}</dd></div>
            </dl>
          </section>

          <section className="panel">
            <PanelHeader title="Cleaning Payload" status="ROS package external" />
            <dl className="details">
              <div><dt>Pump</dt><dd>{snapshot.cleaning.pump_on ? "On" : "Off"}</dd></div>
              <div><dt>Flow</dt><dd>{snapshot.cleaning.flow_lpm} L/min</dd></div>
              <div><dt>Active zone</dt><dd>{snapshot.cleaning.active_zone}</dd></div>
              <div><dt>Boundary</dt><dd>No ROS nozzle control in this repo</dd></div>
            </dl>
          </section>

          <section className="panel alerts-panel" id="alerts">
            <PanelHeader title="Alerts" status={`${snapshot.alerts.length} active`} />
            <div className="alert-list">
              {snapshot.alerts.map((alert) => (
                <article className={`alert ${alert.severity}`} key={alert.id}>
                  <strong>{alert.message}</strong>
                  <span>{alert.recommended_action}</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function StatusPanel({ snapshot, streamConnected, sourceLabel }) {
  return (
    <section className="status-panel">
      <span className={`dot ${streamConnected ? "online" : ""}`} />
      <strong>{streamConnected ? "Dashboard stream live" : "Connecting"}</strong>
      <small>{sourceLabel}</small>
      <small>Telemetry: {snapshot.links.telemetry.status}</small>
      <small>Video: {snapshot.links.video.status}</small>
    </section>
  );
}

function PanelHeader({ title, status }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <span>{status}</span>
    </div>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VideoFeed({ video, bridgeMessage, onStartBridge }) {
  if (!video.configured) {
    return (
      <div className="video-empty">
        <strong>Camera stream not configured</strong>
        <span>Set PX4_CAMERA_URL to an MJPEG, HLS, WebRTC, MP4, or image stream exposed from the x500_camera_down camera bridge.</span>
        <button type="button" onClick={onStartBridge}>Start Gazebo Bridge</button>
        {bridgeMessage && <small>{bridgeMessage}</small>}
      </div>
    );
  }

  if (!video.browser_renderable || video.kind === "rtsp") {
    return (
      <div className="video-empty">
        <strong>Bridge required</strong>
        <span>{video.note || "Convert the camera output to a browser-renderable stream and update PX4_CAMERA_URL."}</span>
        <button type="button" onClick={onStartBridge}>Start Gazebo Bridge</button>
        {bridgeMessage && <small>{bridgeMessage}</small>}
      </div>
    );
  }

  if (video.kind === "video" || video.kind === "hls") {
    return <video className="camera-media" src={video.url} controls autoPlay muted playsInline />;
  }

  return <img className="camera-media" src={video.url} alt="PX4 x500 camera down feed" />;
}

function CoverageMap({ zones, activeZone }) {
  const visibleZones = zones.length ? zones : [
    { id: "z1", label: "Zone 1", state: "planned", pass_count: 0 },
    { id: "z2", label: "Zone 2", state: "planned", pass_count: 0 },
    { id: "z3", label: "Zone 3", state: "planned", pass_count: 0 },
    { id: "z4", label: "Zone 4", state: "planned", pass_count: 0 },
  ];

  return (
    <div className="coverage-map">
      {visibleZones.map((zone) => (
        <div className={`zone ${zone.state}`} key={zone.id}>
          <strong>{zone.label}</strong>
          <span>{zone.label === activeZone ? "Drone active" : `${zone.pass_count} pass`}</span>
        </div>
      ))}
    </div>
  );
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, seconds || 0);
  const h = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(safeSeconds % 60)).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
