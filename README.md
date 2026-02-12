# Ascendio

**AI-powered growth on autopilot.**

Ascendio is an automated AI blogging platform that connects to your WordPress site, generates articles with featured images, and publishes them on a schedule — fully set and forget.

## Features

- **WordPress Connect** — Link your WordPress site in seconds using Application Passwords
- **AI Article Generation** — Full structured articles (HTML with H2/H3) via OpenAI GPT-4o
- **AI Featured Images** — Automatic image generation via DALL-E 3
- **Scheduled Publishing** — Configure frequency, time, and timezone with RRULE scheduling
- **Background Workers** — Reliable job processing via Upstash QStash with auto-retry
- **Dashboard** — Clean SaaS UI with site overview, schedule management, and run history

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js API Routes |
| Database | Supabase (Postgres + Auth) |
| Background Jobs | Upstash QStash |
| AI | OpenAI API (GPT-4o + DALL-E 3) |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [OpenAI](https://platform.openai.com) API key
- An [Upstash](https://upstash.com) account (for QStash)
- A [Vercel](https://vercel.com) account (for deployment)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd ascendio
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project
2. Go to the SQL Editor and run the contents of `supabase/migrations.sql`
3. This creates all tables, indexes, and Row Level Security policies

### 3. Generate Encryption Key

Generate a 32-byte base64 encryption key for credential storage:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 4. Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for workers) |
| `OPENAI_API_KEY` | OpenAI API key |
| `QSTASH_URL` | `https://qstash.upstash.io` |
| `QSTASH_TOKEN` | Your QStash token |
| `QSTASH_CURRENT_SIGNING_KEY` | QStash current signing key |
| `QSTASH_NEXT_SIGNING_KEY` | QStash next signing key |
| `APP_CRED_ENC_KEY` | 32-byte base64 key (from step 3) |
| `CRON_SECRET` | A secret string for securing the cron endpoint |

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create an account.

### 6. Deploy to Vercel

```bash
vercel
```

Set all environment variables in the Vercel dashboard. The cron job is configured in `vercel.json` to run every 15 minutes.

## Architecture

```
/src
  /app
    /(auth)/login        → Authentication page
    /(app)/dashboard     → Stats overview + recent runs
    /(app)/sites         → WordPress site management
    /(app)/schedule      → Schedule configuration
    /(app)/runs          → Run history + logs
    /api
      /auth/callback     → Supabase auth callback
      /sites             → CRUD for WordPress sites
      /sites/test-connection → Test WP connection
      /schedules         → CRUD for schedules
      /runs              → Read run history
      /cron              → Scheduler tick (every 15 min)
      /workers/generate-and-publish → Background worker
  /lib
    encryption.ts        → AES-256-GCM credential encryption
    openai.ts            → Article + image generation
    wordpress.ts         → WordPress REST API client
    scheduler.ts         → RRULE schedule helpers
    qstash.ts            → QStash job enqueueing
    logger.ts            → Run log writer
    supabase/            → Supabase client variants
  /components
    app-shell.tsx        → App layout with sidebar navigation
    /ui                  → shadcn/ui components
```

## How It Works

1. **Connect** — Add your WordPress site with Application Password credentials (stored AES-256-GCM encrypted)
2. **Schedule** — Set how often and when to publish (daily, weekly, biweekly, monthly)
3. **Generate** — Every 15 minutes, the cron checks for due schedules and enqueues jobs via QStash
4. **Publish** — The worker generates an article + image via OpenAI, uploads to WordPress, and publishes
5. **Monitor** — Track all runs, view logs, and see published post URLs in the dashboard

## WordPress Setup

1. In your WordPress admin, go to **Users → Profile**
2. Scroll to **Application Passwords**
3. Enter a name (e.g., "Ascendio") and click **Add New Application Password**
4. Copy the generated password and use it when adding your site in Ascendio

## Default Language

Generated content defaults to **Dutch (Nederlands)**. This can be customized per site in the codebase.

## License

Private — All rights reserved.
