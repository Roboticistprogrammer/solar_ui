from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any


class MissionState(StrEnum):
    """Read-only mission states displayed by the dashboard."""

    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    ABORTED = "aborted"


class Severity(StrEnum):
    """Alert severity levels used by the operator-facing alert center."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass(frozen=True)
class LinkStatus:
    status: str
    rssi_dbm: int
    latency_ms: int


@dataclass(frozen=True)
class BatteryStatus:
    percent: int
    voltage_v: float
    current_a: float
    remaining_minutes: int


@dataclass(frozen=True)
class CleaningStatus:
    water_percent: int
    flow_lpm: float
    pump_on: bool
    nozzle_pressure_bar: float
    active_zone: str


@dataclass(frozen=True)
class MissionProgress:
    mission_id: str
    name: str
    state: MissionState
    started_at: datetime
    elapsed_seconds: int
    total_area_m2: int
    cleaned_area_m2: int
    remaining_area_m2: int
    eta_seconds: int

    @property
    def percent_complete(self) -> int:
        return round((self.cleaned_area_m2 / self.total_area_m2) * 100)


@dataclass(frozen=True)
class VehicleStatus:
    drone_id: str
    mode: str
    altitude_m: float
    speed_mps: float
    gps_fix: str
    failsafe: bool


@dataclass(frozen=True)
class EnvironmentStatus:
    temperature_c: float
    humidity_percent: int
    wind_speed_kmh: float


@dataclass(frozen=True)
class Alert:
    id: str
    timestamp: datetime
    severity: Severity
    source: str
    message: str
    recommended_action: str
    acknowledged: bool = False


@dataclass(frozen=True)
class ZoneStatus:
    id: str
    label: str
    state: str
    pass_count: int


@dataclass(frozen=True)
class TelemetrySnapshot:
    mission: MissionProgress
    vehicle: VehicleStatus
    battery: BatteryStatus
    cleaning: CleaningStatus
    links: dict[str, LinkStatus]
    environment: EnvironmentStatus
    alerts: list[Alert]
    zones: list[ZoneStatus]
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict[str, Any]:
        return _json_ready(asdict(self))


def _json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, StrEnum):
        return str(value)
    return value
