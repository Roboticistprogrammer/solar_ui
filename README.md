# Autonomous Solar Panel Washer Drone Dashboard

This repository defines the product direction and implementation plan for a monitoring dashboard used during autonomous solar panel washing missions. The overall vehicle stack is expected to use PX4, MAVLink, ROS/ROS 2, and QGroundControl (QGC). This dashboard is intentionally **not** a replacement for QGC: QGC remains the ground control station for vehicle setup, mission upload, safety actions, and pilot/operator control. The dashboard focuses on mission visualization, operational awareness, cleaning productivity, fleet/asset tracking, and post-mission review.


## Current MVP Stage

The active MVP is now a single-branch dashboard stack:

- `backend/`: read-only Node.js telemetry gateway for PX4 MAVLink, simulated fallback data, camera stream configuration, REST endpoints, and Server-Sent Events.
- `frontend/`: React/Vite mission dashboard that renders PX4 telemetry, mission progress, alerts, and a browser-renderable downward camera stream.
- `app/` and `static/`: the original Python/static prototype kept as a lightweight fallback and reference while the React MVP is built out.

The dashboard does **not** send arming, takeoff, landing, navigation, pump, or emergency commands. QGroundControl remains the command authority.

## Quickstart: React MVP

Start the backend:

```bash
cd backend
npm install
npm start
```

In another terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Then open <http://127.0.0.1:5173>. The frontend proxies `/api` to <http://127.0.0.1:5000>.

Useful backend endpoints:

- <http://127.0.0.1:5000/api/health>
- <http://127.0.0.1:5000/api/telemetry>
- <http://127.0.0.1:5000/api/telemetry/stream>
- <http://127.0.0.1:5000/api/video/config>

If PX4 is not running, the dashboard stays usable with simulated mission data and warning alerts.

## PX4 SITL Telemetry

The backend listens for PX4 MAVLink UDP packets on `0.0.0.0:14550` by default.

```bash
PX4_MAVLINK_PORT=14550 npm start
```

When PX4 SITL sends MAVLink to that port, the dashboard switches from `Simulation Fallback` to `PX4 MAVLink Live` and publishes normalized telemetry to the UI at `/api/telemetry/stream`.

For a local PX4 setup, route MAVLink to the backend port using your preferred PX4/QGC/MAVLink Router configuration. Keep QGC connected separately for mission upload and operator control.

## PX4 x500_camera_down Video

Browsers cannot render Gazebo transport topics or RTSP directly. The backend supports two camera paths.

### Option A: Use the Built-In Gazebo Topic Bridge

Start the backend with Gazebo camera auto-discovery enabled:

```bash
cd backend
GZ_CAMERA_AUTO_START=true npm start
```

Then start the frontend and open <http://127.0.0.1:5173>. After `x500_camera_down` is spawned, the backend searches Gazebo topics for a camera/image stream and exposes it as:

```text
http://127.0.0.1:5000/api/video/mjpeg
```

If auto-discovery misses the topic, list available Gazebo topics and set the topic explicitly:

```bash
gz topic -l
GZ_CAMERA_TOPIC=/world/default/model/x500_camera_down_0/link/camera_link/sensor/camera/image GZ_CAMERA_AUTO_START=true npm start
```

You can also start discovery from the dashboard camera panel with **Start Gazebo Bridge**, or call:

```bash
curl -X POST http://127.0.0.1:5000/api/video/gz/start
```

### Option B: Provide an Existing Browser Stream

Bridge the `x500_camera_down` camera to a browser-renderable stream yourself, then pass that URL to the backend:

```bash
PX4_CAMERA_URL=http://127.0.0.1:8080/stream.mjpg PX4_CAMERA_KIND=mjpeg npm start
```

Supported frontend stream kinds:

- `mjpeg`: rendered with an `<img>` tag.
- `image`: rendered with an `<img>` tag.
- `video`: rendered with a native `<video>` tag for browser-supported formats such as MP4/WebM.
- `hls`: exposed to the `<video>` tag for browser/player support.
- `rtsp`: detected, but shown as requiring a bridge because browsers cannot display it directly.

The built-in Gazebo bridge uses `gz topic -e --json-output`, so it requires the Gazebo CLI to be available on `PATH`. Set `GZ_COMMAND=/path/to/gz` if needed.

The ROS/nozzle/payload packages are intentionally outside this repository. This dashboard only displays the normalized cleaning fields it receives.

## Legacy Static Prototype

The initial Python prototype still runs without external application dependencies:

```bash
uv sync
uv run python -m app.main
```

Then open <http://127.0.0.1:8000> to view the dashboard, or call <http://127.0.0.1:8000/api/telemetry> to inspect the normalized telemetry snapshot used by the UI.

For automated checks, run:

```bash
uv run python -m unittest discover -s tests
cd backend && npm test
```

See [`docs/issues.md`](docs/issues.md) for the issue backlog required to complete the build.

## Product Scope

### Primary Users

- **Mission operator:** watches mission progress, cleaning quality, water status, alerts, and links while QGC handles control authority.
- **Field technician:** reviews maintenance health, water/pump issues, nozzle performance, and service needs.
- **Operations manager:** tracks completed area, mission duration, cleaning coverage, productivity, and historical logs.

### In Scope

- Real-time mission monitoring and status visualization.
- Live video display with overlays for mission state and cleaning progress.
- Solar array coverage map showing planned, cleaned, skipped, and problem zones.
- Battery, water, pump, link, environmental, and drone health panels.
- Alert timeline with severity, source, recommended action, and acknowledgement state.
- Mission logs, summary reports, and exportable data for QA and operations.
- Integration with ROS/PX4/MAVLink telemetry and QGC workflows without taking over command responsibility.

### Out of Scope for Dashboard MVP

- Direct piloting, arming, takeoff, landing, or emergency command control.
- Mission authoring features that duplicate QGC mission planning.
- Low-level autopilot configuration.
- Full fleet dispatch optimization.

## Preliminary Design Review (PDR)

### 1. Mission Need

Solar farms and rooftop solar assets lose efficiency when dust, debris, and residue accumulate. An autonomous washer drone can improve cleaning speed and safety, but operators still need a purpose-built dashboard to understand whether the cleaning mission is progressing correctly, whether the panels are being cleaned effectively, and whether consumables or subsystems are at risk. Since QGC already covers ground control responsibilities, this dashboard must prioritize visibility, traceability, and operational confidence.

### 2. PDR Objectives

The most crucial objectives for the dashboard are:

1. **Mission progress clarity:** show exactly which panel zones are planned, cleaned, in progress, skipped, or blocked.
2. **Cleaning system awareness:** track water level, water flow, pump status, nozzle status, and cleaning anomalies.
3. **Flight and safety awareness:** display battery, position, altitude, speed, mode, health, failsafe state, RC link, telemetry link, and video link without becoming the control station.
4. **Operator trust:** provide live video, timestamps, confidence indicators, and alert explanations so the operator can quickly decide whether to continue monitoring in the dashboard or intervene through QGC.
5. **Post-mission accountability:** produce logs and reports showing coverage, duration, resources consumed, warnings, and uncleaned regions.
6. **Integration readiness:** support MAVLink/PX4/ROS data sources while keeping the dashboard backend modular enough to support simulation, replay, and future hardware changes.

### 3. Success Criteria

The MVP dashboard is successful when it can:

- Display live mission state with less than 1 second typical UI update latency for key telemetry.
- Show cleaned-area progress at zone or panel-row resolution.
- Identify critical alerts such as low battery, weak link, low water, pump fault, mission paused, geofence/failsafe, and cleaning blockage.
- Show a live or simulated camera feed in the dashboard.
- Record mission telemetry and event logs for replay and reporting.
- Run independently from QGC while consuming the same vehicle ecosystem data through MAVLink/ROS bridges.

### 4. Concept of Operations

1. Operator prepares and uploads the mission in QGC.
2. Dashboard connects to backend telemetry services and displays the selected drone/mission.
3. Drone begins autonomous cleaning under PX4/mission logic.
4. Dashboard visualizes live progress, camera feed, consumables, communication health, and alerts.
5. If intervention is required, the operator uses QGC or approved safety procedure rather than dashboard flight controls.
6. After completion, dashboard stores a mission summary with coverage, alerts, water usage, duration, and unresolved zones.

### 5. Dashboard Information Architecture

Recommended MVP screens:

- **Dashboard / Mission Overview:** live camera, mission progress, coverage map, battery, communication, drone status, environment, and recent alerts.
- **Live View:** larger video feed, optional overlays for drone pose, cleaned path, panel grid, and anomaly markers.
- **Mission Tracker:** read-only mission route, panel zones, coverage state, cleaning pass status, and time remaining.
- **Flight Logs:** searchable mission history, telemetry replay, event timeline, and report export.
- **Maintenance:** pump/nozzle health, water system diagnostics, battery cycles, error history, and preflight checklist status.
- **Alerts:** severity-based alert center with acknowledgement, source, timestamp, and recommended action.
- **Settings:** connection endpoints, units, operator preferences, map/site metadata, and data retention settings.

### 6. Required Telemetry and Data Inputs

| Category | Example Fields | Source Candidate |
| --- | --- | --- |
| Vehicle state | armed state, mode, position, altitude, velocity, heading, attitude, mission item, failsafe flags | PX4 via MAVLink or ROS bridge |
| Battery | percentage, voltage, current, estimated remaining time, warning level | MAVLink battery messages / ROS topics |
| Communication | RC link quality, telemetry link quality, video link state, RSSI, latency | MAVLink radio status, backend network metrics |
| Cleaning system | pump on/off, water flow, tank level, nozzle pressure, washer state, cleaning pass count | ROS topics from payload controller |
| Mission progress | planned area, cleaned area, remaining area, skipped zones, route progress, ETA | backend mission service combining telemetry + site map |
| Video | camera stream, stream state, resolution, frame latency | WebRTC/RTSP gateway |
| Environment | wind, temperature, humidity, irradiance if available | onboard sensors, weather API, or local station |
| Logs/events | alerts, operator notes, mission phases, subsystem state transitions | backend event service |

### 7. Functional Requirements

- Display current mission name, state, start time, elapsed time, and estimated time remaining.
- Render a site/array map with coverage state and current drone position.
- Show live video with connection state and quality indicators.
- Present subsystem cards for battery, communication, drone state, cleaning system, and environmental data.
- Generate alerts from telemetry thresholds and backend event rules.
- Store telemetry snapshots and event history for each mission.
- Support simulation/replay mode for UI development before complete hardware availability.
- Provide report export in JSON and CSV initially; PDF can be a later milestone.

### 8. Non-Functional Requirements

- **Reliability:** dashboard should degrade gracefully if video, telemetry, or cleaning payload data is temporarily unavailable.
- **Latency:** critical telemetry should update at 1-5 Hz in the UI; video should prioritize low-latency streaming over archival quality.
- **Security:** backend endpoints should require authentication; deployment should support TLS and role-based access.
- **Maintainability:** frontend components and backend adapters should be modular and testable.
- **Extensibility:** add future drones, sensor topics, and cleaning algorithms without rewriting the UI.
- **Auditability:** preserve mission logs with timestamps and source identifiers.

### 9. Key Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Dashboard accidentally duplicates QGC control responsibilities | Safety and certification complexity | Keep controls read-only in MVP; link to QGC procedure for intervention |
| Inconsistent telemetry between MAVLink and ROS | Operator confusion | Define a normalized backend mission-state model with source priority rules |
| Video latency or stream instability | Reduced operator confidence | Use WebRTC for live monitoring and show clear stream-health indicators |
| Cleaning coverage estimate is inaccurate | Poor QA and reporting | Start with path/zone-based coverage, then add perception-based verification later |
| Hardware payload topics change during prototyping | Rework | Use adapter interfaces and simulation fixtures |
| Too much information on one screen | Cognitive overload | Use severity, grouping, and progressive disclosure |

## Recommended Dashboard Coding Stack

### Frontend

- **React + TypeScript:** mature ecosystem for real-time dashboards and component-driven UI.
- **Vite:** fast local development and simple production builds.
- **Tailwind CSS:** efficient styling for a dark telemetry dashboard similar to the sample UI.
- **shadcn/ui or Radix UI:** accessible primitives for cards, dialogs, tabs, menus, and form controls.
- **Zustand or Redux Toolkit:** client-side state management. Zustand is simpler for the MVP; Redux Toolkit is better if event flows become complex.
- **TanStack Query:** server-state management for mission history, settings, reports, and non-streaming API calls.
- **WebSocket or Socket.IO client:** real-time telemetry and alert updates.
- **Map/visualization:** start with SVG/Canvas for rooftop panel grids; consider MapLibre GL if geospatial solar-farm maps become central.
- **Charts:** Recharts or Apache ECharts for battery trends, water flow, alerts over time, and post-mission analytics.

### Backend

- **Node.js + TypeScript + Fastify:** lightweight, high-performance API server for telemetry normalization, REST endpoints, and WebSocket fanout.
- **ROS integration:** use a ROS bridge service or a small Python ROS node that publishes normalized data to the Node backend via WebSocket, MQTT, Redis, or NATS.
- **MAVLink integration:** use MAVSDK, MAVLink Router, or a dedicated adapter service to consume PX4 telemetry without interfering with QGC.
- **Streaming gateway:** use WebRTC for low-latency browser video; accept RTSP from camera sources when needed and convert at the edge.
- **Database:** PostgreSQL for missions, assets, alerts, operators, and reports; TimescaleDB extension if high-volume telemetry history is needed.
- **Cache/message bus:** Redis or NATS for real-time telemetry fanout, replay buffers, and decoupling adapters from API clients.
- **Object storage:** S3-compatible storage for video snapshots, mission exports, and generated reports if required.

### Integration Architecture

```text
PX4 Autopilot / Payload Controller
        |              |
     MAVLink        ROS topics
        |              |
  MAVLink Adapter   ROS Adapter
        \              /
         Normalized Telemetry/Event Model
                    |
        Node.js Fastify API + WebSocket Gateway
             |          |          |
       PostgreSQL   Redis/NATS   WebRTC Gateway
             |          |          |
             React + TypeScript Dashboard
```

### Suggested Repository Milestones

1. **M0: Design baseline**
   - Document PDR, dashboard scope, data model, and stack.
   - Create static dashboard mock matching the sample layout.
2. **M1: Frontend MVP**
   - Build React/Vite dashboard shell with mission overview, cards, map placeholder, alerts, and simulated telemetry.
3. **M2: Backend simulation mode**
   - Add Fastify API and WebSocket telemetry simulator.
   - Persist mission events to PostgreSQL or local development storage.
4. **M3: ROS/MAVLink adapters**
   - Connect read-only telemetry from PX4/MAVLink and cleaning payload ROS topics.
   - Normalize telemetry into the dashboard event model.
5. **M4: Video integration**
   - Add WebRTC/RTSP camera bridge and stream-health reporting.
6. **M5: Mission reports and replay**
   - Add historical missions, event timeline, CSV/JSON exports, and telemetry replay.
7. **M6: Field hardening**
   - Authentication, TLS deployment, alert tuning, offline handling, and operator acceptance testing.

### Initial Data Model

Core entities to design first:

- **Drone:** id, name, firmware version, payload version, health state.
- **Mission:** id, site, start/end time, state, planned area, cleaned area, remaining area, operator.
- **Zone:** mission id, polygon/grid reference, planned state, cleaning state, pass count, anomaly flags.
- **TelemetrySample:** timestamp, drone id, position, battery, speed, altitude, links, cleaning subsystem state.
- **Alert:** timestamp, severity, source, code, message, recommended action, acknowledged by/time.
- **MaintenanceEvent:** component, fault code, notes, service status, related mission.

### MVP UI Priorities

The sample dashboard should evolve around these high-priority widgets:

1. Mission header: mission name, status, start time, elapsed time, ETA.
2. Live video card: low-latency stream with live/recording/quality indicators.
3. Mission progress card: cleaned percentage, total/cleaned/remaining area, map view, current drone location.
4. Cleaning system card: water level, flow rate, pump status, nozzle status, wash mode, estimated water remaining.
5. Vehicle health cards: battery, mode, altitude, speed, GPS status, failsafe state.
6. Communication card: RC, telemetry, video, cloud/backend status, signal strength, latency.
7. Alert center: prioritized events with acknowledgement and recommended actions.
8. Post-mission summary: coverage, missed zones, alerts, water used, duration, average cleaning rate.

## Development Principles

- Treat QGC as the control authority and this dashboard as the operations/visibility layer.
- Build all early UI against simulated telemetry so design can progress before final hardware integration.
- Normalize MAVLink and ROS data before it reaches React components.
- Prefer clear status semantics over raw telemetry dumps.
- Design every alert with an operator action in mind.
- Keep the architecture modular so the first prototype can run on a laptop and later move to an edge computer or cloud-connected deployment.
