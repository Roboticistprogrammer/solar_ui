# Build Issues Backlog

This file tracks the initial issue list required to turn the concept dashboard into a working build. It stands in for hosted GitHub issues until a remote issue tracker is configured for this repository.

| ID | Status | Priority | Dependency | Issue |
| --- | --- | --- | --- | --- |
| SUI-001 | Done | P0 | None | Create a `uv` managed project skeleton with runnable app and test commands. |
| SUI-002 | Done | P0 | SUI-001 | Add a simulated telemetry API that normalizes mission, vehicle, battery, cleaning, link, environment, zone, and alert data. |
| SUI-003 | Done | P0 | SUI-001, SUI-002 | Build the first read-only dashboard screen using simulated telemetry. |
| SUI-004 | Todo | P0 | SUI-002 | Add a WebSocket telemetry stream with client-side reconnect/backoff behavior. |
| SUI-005 | Todo | P1 | SUI-002 | Persist missions, alerts, zones, and telemetry snapshots in PostgreSQL. |
| SUI-006 | Todo | P1 | SUI-002 | Implement a ROS adapter contract for cleaning payload topics. |
| SUI-007 | Todo | P1 | SUI-002 | Implement a MAVLink/PX4 read-only telemetry adapter that does not conflict with QGC. |
| SUI-008 | Todo | P1 | SUI-003 | Replace the CSS panel map placeholder with a reusable SVG/Canvas coverage map component. |
| SUI-009 | Todo | P2 | SUI-003 | Add mission history, CSV/JSON export, and replay mode. |
| SUI-010 | Todo | P2 | SUI-003 | Add authentication, operator roles, TLS deployment notes, and audit-log requirements. |

## Started First

The first implementation pass focuses on the easiest independent issues: project scaffolding, deterministic simulated telemetry, and a static read-only dashboard shell. These unblock UI iteration before ROS, MAVLink, video, and database integration are available.
