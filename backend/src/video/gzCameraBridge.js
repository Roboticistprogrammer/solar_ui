import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";

const IMAGE_TOPIC_PATTERN = /camera|image/i;
const JPEG_MAGIC = Buffer.from([0xff, 0xd8]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export class GzCameraBridge extends EventEmitter {
  constructor({ command = "gz", topic = "", autoStart = false } = {}) {
    super();
    this.command = command;
    this.topic = topic;
    this.autoStart = autoStart;
    this.process = null;
    this.buffer = "";
    this.frame = null;
    this.lastFrameAt = null;
    this.status = autoStart ? "starting" : "idle";
    this.error = "";
  }

  async start() {
    if (this.process) {
      return this.statusSnapshot();
    }

    if (!this.topic) {
      this.topic = await findCameraTopic(this.command);
    }

    if (!this.topic) {
      this.status = "topic_not_found";
      this.error = "No Gazebo camera/image topic was found. Spawn x500_camera_down, then set GZ_CAMERA_TOPIC if auto-discovery misses it.";
      return this.statusSnapshot();
    }

    this.status = "running";
    this.error = "";
    this.process = spawn(this.command, ["topic", "-e", "--json-output", "-t", this.topic], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      this.consumeJsonLines();
    });

    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (chunk) => {
      this.error = chunk.trim();
    });

    this.process.on("error", (error) => {
      this.status = "error";
      this.error = error.message;
      this.process = null;
    });

    this.process.on("exit", (code, signal) => {
      this.status = "stopped";
      this.error = code || signal ? `gz topic exited with ${code ?? signal}` : "";
      this.process = null;
    });

    return this.statusSnapshot();
  }

  stop() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.status = "stopped";
  }

  statusSnapshot() {
    return {
      status: this.status,
      topic: this.topic,
      has_frame: Boolean(this.frame),
      last_frame_at: this.lastFrameAt ? new Date(this.lastFrameAt).toISOString() : null,
      error: this.error,
    };
  }

  consumeJsonLines() {
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) {
        this.consumeMessage(line);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  consumeMessage(line) {
    try {
      this.ingestImageMessage(JSON.parse(line));
    } catch {
      const boundary = line.lastIndexOf("}");
      if (boundary !== -1) {
        try {
          this.ingestImageMessage(JSON.parse(line.slice(0, boundary + 1)));
        } catch {
          this.error = "Unable to parse Gazebo camera JSON output.";
        }
      }
    }
  }

  ingestImageMessage(message) {
    const frame = imageMessageToFrame(message);
    if (!frame) {
      this.error = "Gazebo image message format is unsupported or missing frame data.";
      return;
    }
    this.frame = frame;
    this.lastFrameAt = Date.now();
    this.status = "receiving";
    this.error = "";
    this.emit("frame", frame);
  }
}

export async function findCameraTopic(command = "gz") {
  const topics = await listTopics(command);
  return topics.find((topic) => /x500.*camera.*image/i.test(topic))
    ?? topics.find((topic) => /camera.*image/i.test(topic))
    ?? topics.find((topic) => IMAGE_TOPIC_PATTERN.test(topic))
    ?? "";
}

export function listTopics(command = "gz") {
  return new Promise((resolve) => {
    const child = spawn(command, ["topic", "-l"], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", () => resolve([]));
    child.on("exit", () => {
      resolve(output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    });
  });
}

export function imageMessageToFrame(message) {
  const data = readImageData(message);
  if (!data?.length) {
    return null;
  }

  if (startsWith(data, JPEG_MAGIC)) {
    return { contentType: "image/jpeg", body: data };
  }

  if (startsWith(data, PNG_MAGIC)) {
    return { contentType: "image/png", body: data };
  }

  const width = numberField(message, ["width", "image_width", "cols"]);
  const height = numberField(message, ["height", "image_height", "rows"]);
  const pixelFormat = String(message.pixel_format_type ?? message.pixel_format ?? message.format ?? "").toLowerCase();

  if (!width || !height) {
    return null;
  }

  if (pixelFormat.includes("bgr")) {
    return { contentType: "image/bmp", body: rawToBmp(data, width, height, "bgr") };
  }

  return { contentType: "image/bmp", body: rawToBmp(data, width, height, "rgb") };
}

function readImageData(message) {
  const value = message.data ?? message.image?.data ?? message.header?.data;
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return Buffer.from(value);
  }
  if (typeof value === "string") {
    return decodeStringData(value);
  }
  if (value.type === "Buffer" && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return null;
}

function decodeStringData(value) {
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length % 4 === 0) {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length) {
      return decoded;
    }
  }
  return Buffer.from(value, "binary");
}

function rawToBmp(data, width, height, channelOrder) {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowStride * height;
  const fileSize = 54 + pixelDataSize;
  const output = Buffer.alloc(fileSize);

  output.write("BM", 0, "ascii");
  output.writeUInt32LE(fileSize, 2);
  output.writeUInt32LE(54, 10);
  output.writeUInt32LE(40, 14);
  output.writeInt32LE(width, 18);
  output.writeInt32LE(-height, 22);
  output.writeUInt16LE(1, 26);
  output.writeUInt16LE(24, 28);
  output.writeUInt32LE(pixelDataSize, 34);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 3;
      const targetOffset = 54 + y * rowStride + x * 3;
      if (sourceOffset + 2 >= data.length) {
        continue;
      }
      if (channelOrder === "bgr") {
        output[targetOffset] = data[sourceOffset];
        output[targetOffset + 1] = data[sourceOffset + 1];
        output[targetOffset + 2] = data[sourceOffset + 2];
      } else {
        output[targetOffset] = data[sourceOffset + 2];
        output[targetOffset + 1] = data[sourceOffset + 1];
        output[targetOffset + 2] = data[sourceOffset];
      }
    }
  }
  return output;
}

function startsWith(buffer, prefix) {
  return buffer.length >= prefix.length && prefix.every((byte, index) => buffer[index] === byte);
}

function numberField(object, fields) {
  for (const field of fields) {
    const value = Number(object[field]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}
