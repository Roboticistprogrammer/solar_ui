const MAVLINK_V1_MAGIC = 0xfe;
const MAVLINK_V2_MAGIC = 0xfd;

export function parseMavlinkDatagram(buffer) {
  const messages = [];
  let offset = 0;

  while (offset < buffer.length) {
    const magic = buffer[offset];
    const packet = magic === MAVLINK_V1_MAGIC
      ? readV1Packet(buffer, offset)
      : magic === MAVLINK_V2_MAGIC
        ? readV2Packet(buffer, offset)
        : null;

    if (!packet) {
      offset += 1;
      continue;
    }

    const message = decodeMessage(packet);
    if (message) {
      messages.push(message);
    }
    offset = packet.nextOffset;
  }

  return messages;
}

function readV1Packet(buffer, offset) {
  if (offset + 8 > buffer.length) {
    return null;
  }
  const length = buffer[offset + 1];
  const packetLength = 6 + length + 2;
  if (offset + packetLength > buffer.length) {
    return null;
  }
  return {
    version: 1,
    systemId: buffer[offset + 3],
    componentId: buffer[offset + 4],
    messageId: buffer[offset + 5],
    payload: buffer.subarray(offset + 6, offset + 6 + length),
    nextOffset: offset + packetLength,
  };
}

function readV2Packet(buffer, offset) {
  if (offset + 12 > buffer.length) {
    return null;
  }
  const length = buffer[offset + 1];
  const signatureLength = buffer[offset + 2] & 0x01 ? 13 : 0;
  const packetLength = 10 + length + 2 + signatureLength;
  if (offset + packetLength > buffer.length) {
    return null;
  }
  return {
    version: 2,
    systemId: buffer[offset + 5],
    componentId: buffer[offset + 6],
    messageId: buffer[offset + 7] | (buffer[offset + 8] << 8) | (buffer[offset + 9] << 16),
    payload: buffer.subarray(offset + 10, offset + 10 + length),
    nextOffset: offset + packetLength,
  };
}

function decodeMessage(packet) {
  const base = {
    system_id: packet.systemId,
    component_id: packet.componentId,
    message_id: packet.messageId,
    received_at: new Date().toISOString(),
  };
  const payload = packet.payload;

  try {
    switch (packet.messageId) {
      case 0:
        return {
          ...base,
          type: "heartbeat",
          custom_mode: uint32(payload, 0),
          vehicle_type: uint8(payload, 4),
          autopilot: uint8(payload, 5),
          base_mode: uint8(payload, 6),
          system_status: uint8(payload, 7),
        };
      case 1:
        return {
          ...base,
          type: "sys_status",
          voltage_battery_v: uint16(payload, 14) / 1000,
          current_battery_a: int16(payload, 16) / 100,
          battery_remaining_percent: int8(payload, 30),
        };
      case 24:
        return {
          ...base,
          type: "gps_raw_int",
          fix_type: uint8(payload, 20),
          satellites_visible: uint8(payload, 29),
        };
      case 30:
        return {
          ...base,
          type: "attitude",
          roll_rad: float(payload, 4),
          pitch_rad: float(payload, 8),
          yaw_rad: float(payload, 12),
        };
      case 32:
        return {
          ...base,
          type: "local_position_ned",
          x_m: float(payload, 4),
          y_m: float(payload, 8),
          z_m: float(payload, 12),
          vx_mps: float(payload, 16),
          vy_mps: float(payload, 20),
          vz_mps: float(payload, 24),
        };
      case 33:
        return {
          ...base,
          type: "global_position_int",
          latitude: int32(payload, 4) / 1e7,
          longitude: int32(payload, 8) / 1e7,
          altitude_m: int32(payload, 12) / 1000,
          relative_altitude_m: int32(payload, 16) / 1000,
          vx_mps: int16(payload, 20) / 100,
          vy_mps: int16(payload, 22) / 100,
          vz_mps: int16(payload, 24) / 100,
          heading_deg: uint16(payload, 26) / 100,
        };
      case 74:
        return {
          ...base,
          type: "vfr_hud",
          airspeed_mps: float(payload, 0),
          groundspeed_mps: float(payload, 4),
          altitude_m: float(payload, 8),
          climb_mps: float(payload, 12),
          heading_deg: int16(payload, 16),
          throttle_percent: uint16(payload, 18),
        };
      case 109:
        return {
          ...base,
          type: "radio_status",
          rssi: uint8(payload, 0),
          remote_rssi: uint8(payload, 1),
          tx_buffer_percent: uint8(payload, 2),
          noise: uint8(payload, 3),
          remote_noise: uint8(payload, 4),
          rx_errors: uint16(payload, 5),
          fixed: uint16(payload, 7),
        };
      case 147:
        return decodeBatteryStatus(base, payload);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function decodeBatteryStatus(base, payload) {
  const voltages = [];
  for (let index = 0; index < 10; index += 1) {
    const value = uint16(payload, 10 + index * 2);
    if (value !== 0xffff) {
      voltages.push(value / 1000);
    }
  }
  return {
    ...base,
    type: "battery_status",
    voltages_v: voltages,
    voltage_v: voltages.reduce((sum, value) => sum + value, 0),
    current_battery_a: int16(payload, 30) / 100,
    battery_remaining_percent: int8(payload, 35),
  };
}

function uint8(buffer, offset) {
  return offset < buffer.length ? buffer.readUInt8(offset) : 0;
}

function int8(buffer, offset) {
  return offset < buffer.length ? buffer.readInt8(offset) : 0;
}

function uint16(buffer, offset) {
  return offset + 2 <= buffer.length ? buffer.readUInt16LE(offset) : 0;
}

function int16(buffer, offset) {
  return offset + 2 <= buffer.length ? buffer.readInt16LE(offset) : 0;
}

function uint32(buffer, offset) {
  return offset + 4 <= buffer.length ? buffer.readUInt32LE(offset) : 0;
}

function int32(buffer, offset) {
  return offset + 4 <= buffer.length ? buffer.readInt32LE(offset) : 0;
}

function float(buffer, offset) {
  return offset + 4 <= buffer.length ? Number(buffer.readFloatLE(offset).toFixed(3)) : 0;
}
