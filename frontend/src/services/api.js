const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function fetchTelemetry() {
  const response = await fetch(`${API_BASE_URL}/api/telemetry`);
  if (!response.ok) {
    throw new Error(`Telemetry request failed with ${response.status}`);
  }
  return response.json();
}

export async function fetchVideoConfig() {
  const response = await fetch(`${API_BASE_URL}/api/video/config`);
  if (!response.ok) {
    throw new Error(`Video config request failed with ${response.status}`);
  }
  return response.json();
}

export async function startGazeboCameraBridge() {
  const response = await fetch(`${API_BASE_URL}/api/video/gz/start`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Gazebo camera bridge start failed with ${response.status}`);
  }
  return response.json();
}

export function connectTelemetryStream({ onOpen, onError, onTelemetry }) {
  const events = new EventSource(`${API_BASE_URL}/api/telemetry/stream`);
  events.onopen = onOpen;
  events.onerror = onError;
  events.addEventListener("telemetry", (event) => {
    onTelemetry(JSON.parse(event.data));
  });
  return () => events.close();
}
