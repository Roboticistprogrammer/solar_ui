const byId = (id) => document.getElementById(id);
const formatDuration = (seconds) => {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

function render(snapshot) {
  const { mission, vehicle, battery, cleaning, links, environment, alerts } = snapshot;
  const percent = Math.round((mission.cleaned_area_m2 / mission.total_area_m2) * 100);

  byId("mission-name").textContent = mission.name;
  byId("start-time").textContent = new Date(mission.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  byId("elapsed").textContent = formatDuration(mission.elapsed_seconds);
  byId("drone-id").textContent = vehicle.drone_id;
  byId("rc-link").textContent = links.rc.status;
  byId("weather").textContent = `${environment.temperature_c}°C`;

  byId("battery-percent").textContent = `${battery.percent}%`;
  byId("voltage").textContent = `${battery.voltage_v} V`;
  byId("current").textContent = `${battery.current_a} A`;
  byId("battery-time").textContent = `${battery.remaining_minutes} min`;

  byId("percent-complete").textContent = `${percent}%`;
  byId("total-area").textContent = `${mission.total_area_m2.toLocaleString()} m²`;
  byId("cleaned-area").textContent = `${mission.cleaned_area_m2.toLocaleString()} m²`;
  byId("remaining-area").textContent = `${mission.remaining_area_m2.toLocaleString()} m²`;
  byId("eta").textContent = formatDuration(mission.eta_seconds);

  byId("rc-status").textContent = links.rc.status;
  byId("rc-rssi").textContent = `${links.rc.rssi_dbm} dBm`;
  byId("video-status").textContent = links.video.status;
  byId("video-rssi").textContent = `${links.video.rssi_dbm} dBm`;

  byId("water").textContent = `${cleaning.water_percent}%`;
  byId("flow").textContent = `${cleaning.flow_lpm} L/min`;
  byId("pump").textContent = cleaning.pump_on ? "On" : "Off";
  byId("zone").textContent = cleaning.active_zone;

  byId("mode").textContent = vehicle.mode;
  byId("altitude").textContent = `${vehicle.altitude_m} m`;
  byId("speed").textContent = `${vehicle.speed_mps} m/s`;
  byId("gps").textContent = vehicle.gps_fix;

  byId("alerts").innerHTML = alerts
    .map((alert) => `<li><span class="${alert.severity}">${alert.severity === "warning" ? "⚠" : "●"}</span><span>${alert.message}<br><small>${alert.recommended_action}</small></span></li>`)
    .join("");
}

async function loadTelemetry() {
  const response = await fetch("/api/telemetry");
  render(await response.json());
}

loadTelemetry();
setInterval(loadTelemetry, 5000);
