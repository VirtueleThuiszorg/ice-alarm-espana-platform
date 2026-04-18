/**
 * GT06 Binary Protocol Parser for EV-07B GPS Trackers
 *
 * Packet structure:
 * [78 78] or [79 79] — start bits
 * [len]              — packet length (1 or 2 bytes)
 * [protocol]         — protocol number
 * [data...]          — variable payload
 * [serial]           — 2-byte serial number
 * [crc]              — 2-byte CRC-ITU
 * [0D 0A]            — stop bits
 */

const PROTOCOL = {
  LOGIN: 0x01,
  HEARTBEAT_SHORT: 0x13,
  HEARTBEAT_LONG: 0x23,
  LOCATION_SHORT: 0x12,
  LOCATION_LONG: 0x22,
  ALARM_SHORT: 0x16,
  ALARM_LONG: 0x26,
};

/**
 * CRC-ITU (CRC-CCITT) calculation
 * Polynomial: x^16 + x^12 + x^5 + 1 (0x1021)
 */
function crcItu(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc;
}

/**
 * Parse BCD-encoded IMEI from buffer
 * Each byte contains two BCD digits
 */
function parseBcdImei(buf, offset, length) {
  let imei = "";
  for (let i = 0; i < length; i++) {
    const byte = buf[i + offset];
    imei += ((byte >> 4) & 0x0f).toString();
    imei += (byte & 0x0f).toString();
  }
  // IMEI is 15 digits; remove leading zero if present
  return imei.replace(/^0+/, "").padStart(15, "0");
}

/**
 * Parse GPS location data from GT06 packet
 */
function parseLocation(buf, offset) {
  // Date/time (6 bytes): YY MM DD HH MM SS
  const year = 2000 + buf[offset];
  const month = buf[offset + 1];
  const day = buf[offset + 2];
  const hour = buf[offset + 3];
  const minute = buf[offset + 4];
  const second = buf[offset + 5];

  const timestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  // GPS info length + satellites (1 byte)
  const gpsInfoByte = buf[offset + 6];
  const satellites = gpsInfoByte & 0x0f;

  // Latitude (4 bytes, in units of 1/30000 minutes)
  const latRaw = buf.readUInt32BE(offset + 7);
  let lat = latRaw / 30000.0 / 60.0;

  // Longitude (4 bytes, in units of 1/30000 minutes)
  const lngRaw = buf.readUInt32BE(offset + 11);
  let lng = lngRaw / 30000.0 / 60.0;

  // Speed (1 byte, in km/h)
  const speed = buf[offset + 15];

  // Course/status (2 bytes)
  const courseStatus = buf.readUInt16BE(offset + 16);
  const isRealtime = !!(courseStatus & 0x2000);
  const isGpsPositioned = !!(courseStatus & 0x1000);
  const isEast = !(courseStatus & 0x0800);
  const isSouth = !!(courseStatus & 0x0400);

  if (isSouth) lat = -lat;
  if (!isEast) lng = -lng;

  return {
    timestamp,
    lat: isGpsPositioned ? lat : null,
    lng: isGpsPositioned ? lng : null,
    speed,
    satellites,
    isGpsPositioned,
    isRealtime,
  };
}

/**
 * Parse alarm type from status information
 */
function parseAlarmType(statusByte) {
  const alarmBits = statusByte & 0x07;
  switch (alarmBits) {
    case 0x01: return "sos";
    case 0x02: return "low_battery";
    case 0x03: return "fall";
    case 0x04: return "geo_fence";
    default: return null;
  }
}

/**
 * Build an ACK response for a given protocol number and serial
 */
function buildAck(protocolNumber, serialNumber) {
  // Standard ACK: 78 78 05 [proto] [serial_hi serial_lo] [crc_hi crc_lo] 0D 0A
  const payload = Buffer.alloc(5);
  payload[0] = 0x05; // length
  payload[1] = protocolNumber;
  payload.writeUInt16BE(serialNumber, 2);

  // CRC is computed over length + protocol + serial
  const crcData = payload.slice(0, 4);
  const crc = crcItu(crcData);
  payload.writeUInt16BE(crc, 3);
  // Rebuild with CRC in correct position
  const ack = Buffer.alloc(10);
  ack[0] = 0x78;
  ack[1] = 0x78;
  ack[2] = 0x05; // length
  ack[3] = protocolNumber;
  ack.writeUInt16BE(serialNumber, 4);
  const crcBuf = Buffer.from([ack[2], ack[3], ack[4], ack[5]]);
  const ackCrc = crcItu(crcBuf);
  ack.writeUInt16BE(ackCrc, 6);
  ack[8] = 0x0d;
  ack[9] = 0x0a;

  return ack;
}

/**
 * Parse a single GT06 packet from a buffer.
 * Returns { type, data, serial, ack } or null if invalid.
 */
function parsePacket(buf) {
  if (buf.length < 10) return null;

  // Validate start bits
  if (buf[0] !== 0x78 || buf[1] !== 0x78) {
    // Try long header (79 79)
    if (buf[0] === 0x79 && buf[1] === 0x79) {
      // Long packets have 2-byte length
      return parseLongPacket(buf);
    }
    return null;
  }

  const packetLen = buf[2];
  const protocolNumber = buf[3];
  const totalLen = packetLen + 4; // start(2) + len(1) + data + stop(2) — but len includes proto+data+serial+crc

  if (buf.length < 2 + 1 + packetLen + 2) return null;

  const serialOffset = 2 + 1 + packetLen - 4; // 2 bytes before CRC
  const serialNumber = buf.readUInt16BE(serialOffset);

  const result = {
    protocolNumber,
    serial: serialNumber,
    ack: buildAck(protocolNumber, serialNumber),
  };

  switch (protocolNumber) {
    case PROTOCOL.LOGIN: {
      const imei = parseBcdImei(buf, 4, 8);
      return { ...result, type: "login", data: { imei } };
    }

    case PROTOCOL.HEARTBEAT_SHORT:
    case PROTOCOL.HEARTBEAT_LONG: {
      // Terminal info (1 byte) + voltage (2 bytes) + GSM signal (1 byte) + language (2 bytes)
      const terminalInfo = buf[4];
      const voltage = buf.readUInt16BE(5);
      const gsmSignal = buf[7];

      // Rough battery percentage from voltage
      const batteryLevel = Math.min(100, Math.max(0, Math.round((voltage - 3400) / 8)));

      return {
        ...result,
        type: "heartbeat",
        data: {
          battery_level: batteryLevel,
          gsmSignal,
          charging: !!(terminalInfo & 0x08),
        },
      };
    }

    case PROTOCOL.LOCATION_SHORT:
    case PROTOCOL.LOCATION_LONG: {
      const location = parseLocation(buf, 4);
      return { ...result, type: "location", data: location };
    }

    case PROTOCOL.ALARM_SHORT:
    case PROTOCOL.ALARM_LONG: {
      const location = parseLocation(buf, 4);
      // Status/alarm info follows location data
      const statusOffset = 4 + 18; // location data is 18 bytes
      const alarmType = statusOffset < buf.length ? parseAlarmType(buf[statusOffset]) : null;

      return {
        ...result,
        type: "alarm",
        data: { ...location, alarm_type: alarmType },
      };
    }

    default:
      return { ...result, type: "unknown", data: { protocolNumber } };
  }
}

/**
 * Parse long-header (79 79) packets
 */
function parseLongPacket(buf) {
  if (buf.length < 11) return null;

  const packetLen = buf.readUInt16BE(2);
  const protocolNumber = buf[4];
  const serialOffset = 2 + 2 + packetLen - 4;
  const serialNumber = buf.readUInt16BE(serialOffset);

  return {
    protocolNumber,
    serial: serialNumber,
    type: "unknown_long",
    data: { protocolNumber },
    ack: buildAck(protocolNumber, serialNumber),
  };
}

module.exports = {
  parsePacket,
  buildAck,
  crcItu,
  PROTOCOL,
};
