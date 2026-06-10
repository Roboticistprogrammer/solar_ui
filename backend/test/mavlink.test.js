import test from "node:test";
import assert from "node:assert/strict";
import { parseMavlinkDatagram } from "../src/telemetry/mavlink.js";
import { TelemetryStore } from "../src/telemetry/store.js";

test("parses MAVLink v2 heartbeat", () => {
  const payload = Buffer.alloc(9);
  payload.writeUInt32LE(4, 0);
  payload.writeUInt8(2, 4);
  payload.writeUInt8(12, 5);
  payload.writeUInt8(0x80, 6);
  payload.writeUInt8(3, 7);

  const packet = makeV2Packet(1, 1, 0, payload);
  const messages = parseMavlinkDatagram(packet);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "heartbeat");
  assert.equal(messages[0].system_id, 1);
  assert.equal(messages[0].custom_mode, 4);
  assert.equal(messages[0].base_mode, 0x80);
});

test("store normalizes PX4 MAVLink into dashboard snapshot", () => {
  const store = new TelemetryStore();
  store.ingestMavlink([
    {
      type: "heartbeat",
      system_id: 1,
      component_id: 1,
      custom_mode: 4,
      base_mode: 0x80,
      system_status: 3,
    },
    {
      type: "sys_status",
      voltage_battery_v: 15.4,
      current_battery_a: 3.2,
      battery_remaining_percent: 71,
    },
    {
      type: "global_position_int",
      latitude: 41.0082,
      longitude: 28.9784,
      altitude_m: 108.1,
      relative_altitude_m: 7.3,
      vx_mps: 1,
      vy_mps: 2,
      vz_mps: 0,
      heading_deg: 91,
    },
  ]);

  assert.equal(store.snapshot.source, "px4_mavlink");
  assert.equal(store.snapshot.vehicle.drone_id, "PX4-1");
  assert.equal(store.snapshot.vehicle.armed, true);
  assert.equal(store.snapshot.vehicle.latitude, 41.0082);
  assert.equal(store.snapshot.battery.percent, 71);
});

function makeV2Packet(systemId, componentId, messageId, payload) {
  const header = Buffer.from([
    0xfd,
    payload.length,
    0,
    0,
    1,
    systemId,
    componentId,
    messageId & 0xff,
    (messageId >> 8) & 0xff,
    (messageId >> 16) & 0xff,
  ]);
  return Buffer.concat([header, payload, Buffer.from([0, 0])]);
}
