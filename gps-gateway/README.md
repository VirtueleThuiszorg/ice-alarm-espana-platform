# EV-07B GPS Gateway

Standalone TCP bridge server that receives binary GT06 protocol data from EV-07B GPS pendants and forwards parsed telemetry to Supabase edge functions.

## Architecture

```
EV-07B Pendant → TCP (port 5001) → GPS Gateway → HTTP → Supabase Edge Functions
                                                       ├─ ev07b-checkin (location/heartbeat)
                                                       └─ ev07b-sos-alert (SOS/fall/geofence)
```

## Quick Start

```bash
# Set environment variables
export SUPABASE_URL=https://your-project.supabase.co
export EV07B_CHECKIN_KEY=your-secret-key
export GATEWAY_PORT=5001
export HTTP_PORT=3000

# Run directly
node src/server.js

# Or with Docker
docker build -t gps-gateway .
docker run -p 5001:5001 -p 3000:3000 \
  -e SUPABASE_URL=... \
  -e EV07B_CHECKIN_KEY=... \
  gps-gateway
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | required | Your Supabase project URL |
| `EV07B_CHECKIN_KEY` | required | API key matching Supabase secret |
| `GATEWAY_PORT` | 5001 | TCP port for device connections |
| `HTTP_PORT` | 3000 | HTTP port for health check API |

## HTTP Endpoints

- `GET /health` — Public health check (returns connected device count)
- `GET /devices` — Protected device list (requires `x-api-key` header)

## GT06 Protocol Support

Handles these packet types:
- **Login (0x01)** — Device registration with IMEI
- **Heartbeat (0x13/0x23)** — Battery level and status
- **Location (0x12/0x22)** — GPS coordinates
- **Alarm (0x16/0x26)** — SOS, fall, low battery, geofence alerts

## Firewall

Open TCP port 5001 (or your configured GATEWAY_PORT) for inbound device connections.
Port 3000 (HTTP) can be restricted to your admin network.
