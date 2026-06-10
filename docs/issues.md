# Build Issues Backlog

This file tracks the initial issue list required to turn the concept dashboard into a working build. It stands in for hosted GitHub issues until a remote issue tracker is configured for this repository.

| ID | Status | Priority | Dependency | Issue |
| --- | --- | --- | --- | --- |
| SUI-001 | Done | P0 | None | Create a `uv` managed project skeleton with runnable app and test commands. |
| SUI-002 | Done | P0 | SUI-001 | Add a simulated telemetry API that normalizes mission, vehicle, battery, cleaning, link, environment, zone, and alert data. |
| SUI-003 | Done | P0 | SUI-001, SUI-002 | Build the first read-only dashboard screen using simulated telemetry. |
| SUI-004 | Done | P0 | SUI-002 | Add a live telemetry stream with client-side reconnect behavior. Implemented with Server-Sent Events for the MVP. |
| SUI-005 | Todo | P1 | SUI-002 | Persist missions, alerts, zones, and telemetry snapshots in PostgreSQL. |
| SUI-006 | Deferred | P1 | SUI-002 | Implement ROS cleaning payload packages and nozzle design in a separate repository/package. |
| SUI-007 | In Progress | P1 | SUI-002 | Implement a MAVLink/PX4 read-only telemetry adapter that does not conflict with QGC. UDP ingest and normalization are in place; live PX4 SITL validation remains. |
| SUI-008 | Todo | P1 | SUI-003 | Replace the CSS panel map placeholder with a reusable SVG/Canvas coverage map component. |
| SUI-009 | Todo | P2 | SUI-003 | Add mission history, CSV/JSON export, and replay mode. |
| SUI-010 | Todo | P2 | SUI-003 | Add authentication, operator roles, TLS deployment notes, and audit-log requirements. |
| SUI-011 | In Progress | P0 | SUI-007 | Display the `x500_camera_down` feed on the dashboard through a browser-renderable camera bridge. Built-in Gazebo topic to MJPEG bridge and frontend start control are in place; validation against a live spawned PX4 model remains. |

## Started First

The current implementation pass focuses on one single working branch: React/Vite dashboard, Node telemetry gateway, simulated fallback data, PX4 MAVLink UDP ingest, and configurable browser-renderable camera feed display. ROS payload and nozzle work is intentionally out of scope for this repository.
