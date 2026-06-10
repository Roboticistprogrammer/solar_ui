import dgram from "node:dgram";
import http from "node:http";
import { readConfig } from "./config.js";
import { parseMavlinkDatagram } from "./telemetry/mavlink.js";
import { TelemetryStore } from "./telemetry/store.js";
import { GzCameraBridge, listTopics } from "./video/gzCameraBridge.js";

const config = readConfig();
const bridgeCameraUrl = `http://${config.host}:${config.port}/api/video/mjpeg`;
const store = new TelemetryStore({
  cameraUrl: config.cameraUrl || (config.gzCameraAutoStart ? bridgeCameraUrl : ""),
  cameraKind: config.cameraUrl ? config.cameraKind : config.gzCameraAutoStart ? "mjpeg" : config.cameraKind,
});
const gzCameraBridge = new GzCameraBridge({
  command: config.gzCommand,
  topic: config.gzCameraTopic,
  autoStart: config.gzCameraAutoStart,
});
const sseClients = new Set();
const mjpegClients = new Set();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    sendCors(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, {
      status: "ok",
      service: "solar-ui-backend",
      mavlink: {
        host: config.mavlinkHost,
        port: config.mavlinkPort,
        connected: store.snapshot.telemetry.connected,
        last_packet_at: store.snapshot.telemetry.last_packet_at,
      },
      video: store.snapshot.video,
      gz_camera_bridge: gzCameraBridge.statusSnapshot(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/telemetry") {
    sendJson(response, store.snapshot);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/telemetry/stream") {
    openEventStream(response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/video/config") {
    sendJson(response, {
      ...store.snapshot.video,
      gz_camera_bridge: gzCameraBridge.statusSnapshot(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/video/gz/topics") {
    sendJson(response, {
      topics: await listTopics(config.gzCommand),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/video/gz/start") {
    const status = await startGzCameraBridge();
    sendJson(response, {
      ok: status.status !== "topic_not_found" && status.status !== "error",
      bridge: status,
      video: store.snapshot.video,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/video/gz/stop") {
    gzCameraBridge.stop();
    store.setCamera({ status: "stopped" });
    sendJson(response, {
      ok: true,
      bridge: gzCameraBridge.statusSnapshot(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/video/mjpeg") {
    openMjpegStream(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/ingest/telemetry") {
    try {
      const payload = await readJsonBody(request);
      store.ingestJsonTelemetry(payload);
      sendJson(response, { ok: true });
    } catch (error) {
      sendJson(response, { ok: false, error: error.message }, 400);
    }
    return;
  }

  sendJson(response, { error: "not_found" }, 404);
});

const mavlinkSocket = dgram.createSocket("udp4");
mavlinkSocket.on("message", (message) => {
  store.ingestMavlink(parseMavlinkDatagram(message));
});
mavlinkSocket.on("error", (error) => {
  console.error(`MAVLink UDP socket error: ${error.message}`);
});
mavlinkSocket.bind(config.mavlinkPort, config.mavlinkHost, () => {
  const address = mavlinkSocket.address();
  console.log(`Listening for PX4 MAVLink on udp://${address.address}:${address.port}`);
});

store.on("snapshot", (snapshot) => {
  const body = `event: telemetry\ndata: ${JSON.stringify(snapshot)}\n\n`;
  for (const client of sseClients) {
    client.write(body);
  }
});

gzCameraBridge.on("frame", (frame) => {
  writeMjpegFrame(frame);
  store.setCamera({
    url: bridgeCameraUrl,
    kind: "mjpeg",
    status: "receiving",
  });
});

if (config.gzCameraAutoStart) {
  startGzCameraBridge();
}

const interval = setInterval(() => {
  store.publish();
}, 1000);

server.listen(config.port, config.host, () => {
  console.log(`Solar UI backend running at http://${config.host}:${config.port}`);
});

function openEventStream(response) {
  sendCors(response);
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write(`event: telemetry\ndata: ${JSON.stringify(store.snapshot)}\n\n`);
  sseClients.add(response);
  response.on("close", () => {
    sseClients.delete(response);
  });
}

function sendJson(response, payload, status = 200) {
  sendCors(response);
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function startGzCameraBridge() {
  const status = await gzCameraBridge.start();
  if (status.status !== "topic_not_found" && status.status !== "error") {
    store.setCamera({
      url: bridgeCameraUrl,
      kind: "mjpeg",
      status: status.has_frame ? "receiving" : "waiting_for_frame",
    });
  } else {
    store.setCamera({
      status: status.status,
    });
  }
  return status;
}

function openMjpegStream(response) {
  sendCors(response);
  response.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=solar-ui-frame",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  mjpegClients.add(response);
  if (gzCameraBridge.frame) {
    writeMjpegFrame(gzCameraBridge.frame, response);
  }
  response.on("close", () => {
    mjpegClients.delete(response);
  });
}

function writeMjpegFrame(frame, target = null) {
  const header = [
    "--solar-ui-frame",
    `Content-Type: ${frame.contentType}`,
    `Content-Length: ${frame.body.length}`,
    "",
    "",
  ].join("\r\n");
  const chunk = Buffer.concat([Buffer.from(header), frame.body, Buffer.from("\r\n")]);

  if (target) {
    target.write(chunk);
    return;
  }

  for (const client of mjpegClients) {
    client.write(chunk);
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  clearInterval(interval);
  gzCameraBridge.stop();
  mavlinkSocket.close();
  server.close(() => {
    process.exit(0);
  });
}
