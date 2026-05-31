from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import (
    Alert,
    BatteryStatus,
    CleaningStatus,
    EnvironmentStatus,
    LinkStatus,
    MissionProgress,
    MissionState,
    Severity,
    TelemetrySnapshot,
    VehicleStatus,
    ZoneStatus,
)

MISSION_START = datetime(2026, 5, 31, 9, 15, tzinfo=timezone.utc)
TOTAL_AREA_M2 = 1200


def build_snapshot(elapsed_seconds: int = 1104) -> TelemetrySnapshot:
    """Build a deterministic telemetry snapshot for UI development and tests."""

    cleaned_area = min(TOTAL_AREA_M2, 780 + max(elapsed_seconds - 1104, 0) // 3)
    remaining_area = max(TOTAL_AREA_M2 - cleaned_area, 0)
    eta_seconds = max(0, int(remaining_area / 0.55))
    battery_percent = max(0, 76 - max(elapsed_seconds - 1104, 0) // 240)
    water_percent = max(0, 68 - max(elapsed_seconds - 1104, 0) // 180)

    alerts = [
        Alert(
            id="evt-water-normal",
            timestamp=MISSION_START + timedelta(minutes=13),
            severity=Severity.INFO,
            source="cleaning_payload",
            message="Water level is normal.",
            recommended_action="Continue monitoring the mission.",
            acknowledged=True,
        ),
        Alert(
            id="evt-dust-zone-3",
            timestamp=MISSION_START + timedelta(minutes=7),
            severity=Severity.WARNING,
            source="coverage_estimator",
            message="High dust detected on zone 3. Cleaning time adjusted.",
            recommended_action="Review zone 3 in the post-mission report.",
        ),
    ]

    return TelemetrySnapshot(
        mission=MissionProgress(
            mission_id="mission-rooftop-a",
            name="Rooftop Plant A",
            state=MissionState.IN_PROGRESS,
            started_at=MISSION_START,
            elapsed_seconds=elapsed_seconds,
            total_area_m2=TOTAL_AREA_M2,
            cleaned_area_m2=cleaned_area,
            remaining_area_m2=remaining_area,
            eta_seconds=eta_seconds,
        ),
        vehicle=VehicleStatus(
            drone_id="SPCD-001",
            mode="Auto Clean",
            altitude_m=8.2,
            speed_mps=1.2,
            gps_fix="3D RTK",
            failsafe=False,
        ),
        battery=BatteryStatus(
            percent=battery_percent,
            voltage_v=48.1,
            current_a=18.6,
            remaining_minutes=28,
        ),
        cleaning=CleaningStatus(
            water_percent=water_percent,
            flow_lpm=2.5,
            pump_on=True,
            nozzle_pressure_bar=3.4,
            active_zone="Zone 3",
        ),
        links={
            "rc": LinkStatus(status="Strong", rssi_dbm=-65, latency_ms=42),
            "telemetry": LinkStatus(status="Strong", rssi_dbm=-62, latency_ms=55),
            "video": LinkStatus(status="Stable", rssi_dbm=-61, latency_ms=120),
        },
        environment=EnvironmentStatus(
            temperature_c=28,
            humidity_percent=56,
            wind_speed_kmh=12,
        ),
        alerts=alerts,
        zones=[
            ZoneStatus(id="z1", label="Zone 1", state="cleaned", pass_count=1),
            ZoneStatus(id="z2", label="Zone 2", state="cleaned", pass_count=1),
            ZoneStatus(id="z3", label="Zone 3", state="in_progress", pass_count=2),
            ZoneStatus(id="z4", label="Zone 4", state="planned", pass_count=0),
            ZoneStatus(id="z5", label="Zone 5", state="planned", pass_count=0),
        ],
    )
