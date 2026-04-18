# ICE Alarm Espa&ntilde;a

Personal emergency alarm service for expats and elderly residents in Spain. Members get a GPS pendant (EV-07B) with 24/7 SOS monitoring, fall detection, and geo-fencing.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Backend | Supabase (Postgres, Auth, Edge Functions, Realtime) |
| Payments | Stripe (checkout sessions, subscriptions) |
| SMS/Voice | Twilio (device provisioning, WhatsApp notifications) |
| Email | Gmail SMTP via Nodemailer (shared `_shared/email.ts`) |
| Hosting | Vercel (frontend) + Supabase Cloud via Lovable (backend) |
| Testing | Vitest |

## Local Development

```sh
git clone https://github.com/LeeLovable/ice-alarm-espanav1.git
cd ice-alarm-espanav1
npm install
npm run dev
```

Requires Node.js 18+. The dev server runs at `http://localhost:5173`.

## Environment Variables

Frontend env vars are set in Vercel. Supabase Edge Function secrets are managed through the Lovable Cloud dashboard.

Key variables:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase connection
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Stripe payments
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — SMS/voice
- `GMAIL_APP_PASSWORD` — Email sending
- `GOOGLE_GEMINI_API_KEY` — AI features (Isabella agent)

## Project Structure

```
src/
  pages/           # Route pages (admin/, client/, join/, public/)
  components/      # UI components (admin/, dashboard/, join/, ui/)
  hooks/           # Custom React hooks
  config/          # Pricing, feature flags, constants
  lib/             # Supabase client, sanitization, utilities
  types/           # TypeScript type definitions
  test/            # Vitest test files

supabase/
  functions/       # 57 Deno Edge Functions
    _shared/       # Shared helpers (cors.ts, email.ts)
  migrations/      # SQL migrations
```

## Edge Functions

All edge functions use a shared CORS helper (`_shared/cors.ts`) that whitelists production domains. Functions are deployed through the Lovable Cloud dashboard (not `supabase functions deploy`).

## Testing

```sh
npm run test        # Run all tests
npx vitest run      # Single run
npx vitest          # Watch mode
```

238 tests across 10 files covering pricing calculations, input validation, utilities, and component logic.

## Deployment

- **Frontend**: Push to `main` triggers Vercel auto-deploy to `icealarm.es`
- **Edge Functions**: Update through the Lovable Cloud dashboard
- **Migrations**: Apply through the Lovable Cloud Supabase SQL editor

## Key Flows

1. **Member Registration**: `/join` wizard &rarr; Stripe checkout &rarr; `stripe-webhook` activates member &rarr; admin provisions pendant
2. **Device Provisioning**: 14-step checklist (SIM, APN, SOS number configured via Twilio SMS)
3. **SOS Monitoring**: Pendant check-ins via `ev07b-checkin` &rarr; real-time alerts &rarr; staff dashboard
