/**
 * EV-07B GPS Gateway Server
 *
 * TCP server (GT06 protocol) + HTTP health check API.
 * Receives binary telemetry from EV-07B pendants and forwards
 * parsed data to Supabase edge functions.
 */

const net = require("net");
const http = require("http");
const { parsePacket } = require("./gt06-parser");
const { forwardToCheckin, forwardSosAlert } = require("./forwarder");

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || "5001", 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000", 10);

// Connected devices: IMEI -> { socket, lastSeen, batteryLevel }
const connectedDevices = new Map();

// Socket -> IMEI mapping (for cleanup on disconnect)
const socketToImei = new Map();

// ───── TCP Server (GT06 Protocol) ──────────────────────────────

const tcpServer = net.createServer((socket) => {
  const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[tcp] New connection from ${remoteAddr}`);

  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    // Process all complete packets in the buffer
    while (buffer.length >= 10) {
      // Find start marker
      let startIdx = -1;
      for (let i = 0; i < buffer.length - 1; i++) {
        if (
          (buffer[i] === 0x78 && buffer[i + 1] === 0x78) ||
          (buffer[i] === 0x79 && buffer[i + 1] === 0x79)
        ) {
          startIdx = i;
          break;
        }
      }

      if (startIdx === -1) {
        buffer = Buffer.alloc(0);
        break;
      }

      if (startIdx > 0) {
        buffer = buffer.slice(startIdx);
      }

      // Find end marker (0D 0A)
      let endIdx = -1;
      for (let i = 2; i < buffer.length - 1; i++) {
        if (buffer[i] === 0x0d && buffer[i + 1] === 0x0a) {
          endIdx = i + 2;
          break;
        }
      }

      if (endIdx === -1) break; // Incomplete packet, wait for more data

      const packetBuf = buffer.slice(0, endIdx);
      buffer = buffer.slice(endIdx);

      try {
        const packet = parsePacket(packetBuf);
        if (!packet) {
          console.warn(`[tcp] Unparseable packet from ${remoteAddr}`);
          continue;
        }

        handlePacket(socket, packet, remoteAddr);
      } catch (err) {
        console.error(`[tcp] Parse error from ${remoteAddr}:`, err.message);
      }
    }

    // Prevent buffer from growing too large
    if (buffer.length > 4096) {
      console.warn(`[tcp] Buffer overflow from ${remoteAddr}, clearing`);
      buffer = Buffer.alloc(0);
    }
  });

  socket.on("close", () => {
    const imei = socketToImei.get(socket);
    if (imei) {
      console.log(`[tcp] Device ${imei} disconnected`);
      connectedDevices.delete(imei);
      socketToImei.delete(socket);
    } else {
      console.log(`[tcp] Connection closed from ${remoteAddr}`);
    }
  });

  socket.on("error", (err) => {
    console.error(`[tcp] Socket error from ${remoteAddr}:`, err.message);
    const imei = socketToImei.get(socket);
    if (imei) {
      connectedDevices.delete(imei);
      socketToImei.delete(socket);
    }
  });

  // Timeout idle connections after 10 minutes
  socket.setTimeout(600000);
  socket.on("timeout", () => {
    console.log(`[tcp] Timeout from ${remoteAddr}, closing`);
    socket.destroy();
  });
});

function handlePacket(socket, packet, remoteAddr) {
  const { type, data, ack } = packet;

  // Always send ACK
  if (ack) {
    socket.write(ack);
  }

  switch (type) {
    case "login": {
      const { imei } = data;
      console.log(`[tcp] Login from IMEI ${imei} (${remoteAddr})`);
      connectedDevices.set(imei, {
        socket,
        lastSeen: new Date(),
        batteryLevel: null,
      });
      socketToImei.set(socket, imei);

      // Forward initial checkin
      forwardToCheckin({ imei, event_type: "checkin" });
      break;
    }

    case "heartbeat": {
      const imei = socketToImei.get(socket);
      if (!imei) {
        console.warn(`[tcp] Heartbeat from unregistered socket ${remoteAddr}`);
        break;
      }

      const deviceInfo = connectedDevices.get(imei);
      if (deviceInfo) {
        deviceInfo.lastSeen = new Date();
        deviceInfo.batteryLevel = data.battery_level;
      }

      console.log(`[tcp] Heartbeat from ${imei}: battery=${data.battery_level}%`);

      forwardToCheckin({
        imei,
        battery_level: data.battery_level,
        event_type: "checkin",
      });
      break;
    }

    case "location": {
      const imei = socketToImei.get(socket);
      if (!imei) break;

      const deviceInfo = connectedDevices.get(imei);
      if (deviceInfo) {
        deviceInfo.lastSeen = new Date();
      }

      console.log(
        `[tcp] Location from ${imei}: lat=${data.lat} lng=${data.lng} speed=${data.speed}km/h sats=${data.satellites}`
      );

      forwardToCheckin({
        imei,
        lat: data.lat,
        lng: data.lng,
        event_type: "checkin",
      });
      break;
    }

    case "alarm": {
      const imei = socketToImei.get(socket);
      if (!imei) break;

      const deviceInfo = connectedDevices.get(imei);
      if (deviceInfo) {
        deviceInfo.lastSeen = new Date();
      }

      console.log(
        `[tcp] ALARM from ${imei}: type=${data.alarm_type} lat=${data.lat} lng=${data.lng}`
      );

      if (data.alarm_type) {
        forwardSosAlert({
          imei,
          alarm_type: data.alarm_type,
          lat: data.lat,
          lng: data.lng,
          battery_level: deviceInfo?.batteryLevel,
        });
      }

      // Also forward as regular checkin for location update
      forwardToCheckin({
        imei,
        lat: data.lat,
        lng: data.lng,
        event_type: data.alarm_type || "checkin",
      });
      break;
    }

    default:
      console.log(`[tcp] Unknown packet type: ${type} from ${remoteAddr}`);
  }
}

// ───── HTTP Server (Health Check + Device List) ────────────────

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "x-api-key");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        uptime: process.uptime(),
        connectedDevices: connectedDevices.size,
        gatewayPort: GATEWAY_PORT,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (url.pathname === "/devices") {
    // Require API key
    const apiKey = req.headers["x-api-key"];
    const expectedKey = process.env.EV07B_CHECKIN_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const devices = [];
    for (const [imei, info] of connectedDevices) {
      devices.push({
        imei,
        lastSeen: info.lastSeen?.toISOString(),
        batteryLevel: info.batteryLevel,
        connected: !info.socket.destroyed,
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ devices, count: devices.length }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ───── Start Servers ───────────────────────────────────────────

tcpServer.listen(GATEWAY_PORT, () => {
  console.log(`[gateway] TCP server listening on port ${GATEWAY_PORT}`);
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`[gateway] HTTP server listening on port ${HTTP_PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[gateway] Shutting down...");
  tcpServer.close();
  httpServer.close();
  process.exit(0);
});
