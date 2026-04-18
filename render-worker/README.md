# Video Hub Render Worker

A standalone Docker-based render worker for ICE Alarm Video Hub using Remotion + FFmpeg.

## Overview

This worker processes video rendering jobs queued by the Supabase Edge Function. It produces:
- **MP4 video** (H.264 codec)
- **Thumbnail** (JPG)
- **Captions** (VTT and SRT formats)

## Requirements

- Docker (recommended)
- Or: Node.js 20+, FFmpeg, Chrome/Chromium

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✓ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Supabase service role key (for DB + storage access) |
| `WEBHOOK_SECRET` | ✓ | Secret token for authenticating requests from edge function |
| `PORT` | | Server port (default: 3001) |

## Quick Start with Docker

### 1. Build the image

```bash
cd render-worker
docker build -t ice-video-render-worker .
```

### 2. Run the container

```bash
docker run -d \
  --name video-render-worker \
  -p 3001:3001 \
  -e SUPABASE_URL="https://your-project.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  -e WEBHOOK_SECRET="your-webhook-secret" \
  ice-video-render-worker
```

### 3. Verify it's running

```bash
curl http://localhost:3001/health
# {"status":"healthy","timestamp":"2025-01-01T00:00:00.000Z"}
```

## Development (without Docker)

### Prerequisites

1. Install Node.js 20+
2. Install FFmpeg: `apt install ffmpeg` (Linux) or `brew install ffmpeg` (macOS)
3. Install Chrome/Chromium

### Setup

```bash
cd render-worker
npm install
```

### Run in development mode

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export WEBHOOK_SECRET="your-webhook-secret"
npm run dev
```

## API Endpoints

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### Queue Render Job

```
POST /render
Content-Type: application/json

{
  "render_id": "uuid",
  "project_id": "uuid",
  "token": "your-webhook-secret"
}
```

Response:
```json
{
  "status": "accepted",
  "job_id": "uuid"
}
```

## Render Pipeline Stages

1. **Initializing** (0-10%): Fetch project data and brand settings
2. **Generating** (10-30%): Build composition and prepare scenes
3. **Processing** (30-50%): Generate captions/subtitles
4. **Compositing** (50-70%): Render video frames with Remotion
5. **Encoding** (70-90%): Encode final H.264 MP4
6. **Finalizing** (90-100%): Upload files to Supabase Storage

## Output Formats

### Video Formats
- **9:16** (Portrait): 1080x1920 - TikTok, Instagram Reels
- **16:9** (Landscape): 1920x1080 - YouTube, Facebook
- **1:1** (Square): 1080x1080 - Instagram, LinkedIn

### Durations Supported
- 10 seconds
- 15 seconds
- 30 seconds
- 60 seconds

## Storage Buckets

Files are uploaded to these Supabase Storage buckets:
- `video-hub-exports` - MP4 videos
- `video-hub-thumbnails` - JPG thumbnails
- `video-hub-captions` - VTT and SRT files

## Deployment Options

### 1. Self-hosted VPS (Recommended for cost)

Deploy on a VPS with Docker:
```bash
# On your VPS
docker pull your-registry/ice-video-render-worker
docker-compose up -d
```

### 2. Cloud Run / Cloud Functions

Not recommended due to:
- Cold start times
- Execution time limits
- Memory constraints for video rendering

### 3. Kubernetes

For high-volume production:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: video-render-worker
spec:
  replicas: 2
  # ... full config in k8s/ directory
```

## Troubleshooting

### Common Issues

**Chrome not found**
```bash
export CHROME_PATH=/usr/bin/chromium
# or
export CHROME_PATH=/usr/bin/google-chrome
```

**FFmpeg errors**
```bash
# Verify FFmpeg is installed
ffmpeg -version
```

**Memory issues**
- Increase Docker memory limit: `docker run -m 4g ...`
- For long videos (60s), recommend 4GB+ RAM

## Security

- Never expose the worker directly to the internet
- Use a reverse proxy (nginx/Caddy) with TLS
- Rotate `WEBHOOK_SECRET` periodically
- Service role key has full DB access - keep it secure
