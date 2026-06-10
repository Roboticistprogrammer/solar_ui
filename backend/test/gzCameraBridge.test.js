import test from "node:test";
import assert from "node:assert/strict";
import { GzCameraBridge, imageMessageToFrame } from "../src/video/gzCameraBridge.js";

test("converts Gazebo JPEG image JSON into a browser frame", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
  const frame = imageMessageToFrame({ data: jpeg.toString("base64") });

  assert.equal(frame.contentType, "image/jpeg");
  assert.deepEqual(frame.body.subarray(0, 2), Buffer.from([0xff, 0xd8]));
});

test("converts raw RGB image JSON into BMP frame", () => {
  const redThenGreen = Buffer.from([255, 0, 0, 0, 255, 0]);
  const frame = imageMessageToFrame({
    width: 2,
    height: 1,
    pixel_format_type: "RGB_INT8",
    data: Array.from(redThenGreen),
  });

  assert.equal(frame.contentType, "image/bmp");
  assert.equal(frame.body.toString("ascii", 0, 2), "BM");
  assert.equal(frame.body.readInt32LE(18), 2);
  assert.equal(frame.body.readInt32LE(22), -1);
  assert.deepEqual(frame.body.subarray(54, 60), Buffer.from([0, 0, 255, 0, 255, 0]));
});

test("bridge accepts JSON image messages and records latest frame", () => {
  const bridge = new GzCameraBridge();
  bridge.consumeMessage(JSON.stringify({
    width: 1,
    height: 1,
    pixel_format_type: "BGR_INT8",
    data: [0, 0, 255],
  }));

  assert.equal(bridge.statusSnapshot().status, "receiving");
  assert.equal(bridge.statusSnapshot().has_frame, true);
  assert.equal(bridge.frame.contentType, "image/bmp");
});
