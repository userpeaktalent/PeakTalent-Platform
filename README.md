<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your PeakTalent app

This repo contains the frontend for PeakTalent, built with Vite + React and connected to Supabase.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` from [.env.example](./.env.example)
3. Set these values in `.env.local`:
   `VITE_SUPABASE_URL`
   `VITE_SUPABASE_ANON_KEY`
   `VITE_GEMINI_API_KEY`
4. Optional legacy fallback:
   `GEMINI_API_KEY`
5. Run the app:
   `npm run dev`

## Deploy on Vercel

This repo is now prepared for Vercel hosting:

- [vercel.json](./vercel.json) adds SPA rewrites so React Router routes like `/seeker/dashboard` and `/admin/dashboard` work when opened directly
- [.env.example](./.env.example) lists the production environment variables you need
- [vite.config.ts](./vite.config.ts) now accepts `VITE_GEMINI_API_KEY` as the main production key and keeps a legacy fallback

### Fast but unsafe production path

This setup works immediately, but your Gemini key is exposed in the browser bundle.

Required Vercel environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY`

Optional fallback:

- `GEMINI_API_KEY`

### Vercel steps

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Keep the detected Vite settings, or set them manually:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Add the environment variables above in the Vercel project settings.
5. Deploy once and verify the generated `*.vercel.app` URL works.
6. Add your custom domain in the Vercel project.
7. Update the DNS at your registrar with the records Vercel shows you.

### Supabase production checklist

Before using the real domain, update Supabase Auth settings:

- `Site URL` = your production domain
- add redirect URLs for:
  - your production domain
  - your `www` domain if used
  - localhost for local development
  - your Vercel preview domain if you want preview auth flows to work

If you rely on admin impersonation and admin delete/apply tools, also make sure the SQL files below have already been run in the target Supabase project.

### Optional admin usage card setup

To show live Supabase usage inside the admin `Health Overview`, run:

- [supabase/admin_supabase_usage.sql](./supabase/admin_supabase_usage.sql)

Optional environment variables for richer admin usage metrics:

- `VITE_SUPABASE_PLAN=free|pro|team|enterprise`
- `VITE_SUPABASE_DB_LIMIT_BYTES`
- `VITE_SUPABASE_STORAGE_LIMIT_BYTES`
- `VITE_SUPABASE_API_REQUEST_LIMIT` (defaults to `500000` when omitted)
- `VITE_AI_REQUEST_LIMIT` (defaults to `500000` when omitted)

For API request tracking, deploy the `admin-supabase-usage` Edge Function and set this secret in Supabase:

- `PEAKTALENT_SUPABASE_MANAGEMENT_TOKEN`

Notes:

- DB and storage usage come from the admin RPC above.
- API request tracking now goes through the `admin-supabase-usage` Edge Function, so the Management API token stays server-side.

## Admin Recruiter Impersonation

To let an admin impersonate recruiters and seekers with full job/application visibility, run these SQL files in the Supabase SQL Editor for this project:

- [supabase/get_admin_job_applicants.sql](./supabase/get_admin_job_applicants.sql)
- [supabase/get_admin_candidate_jobs.sql](./supabase/get_admin_candidate_jobs.sql)
- [supabase/get_candidate_jobs_with_status.sql](./supabase/get_candidate_jobs_with_status.sql)
- [supabase/admin_apply_to_job.sql](./supabase/admin_apply_to_job.sql)
- [supabase/admin_unapply_from_job.sql](./supabase/admin_unapply_from_job.sql)
- [supabase/set_job_application_status.sql](./supabase/set_job_application_status.sql)
- [supabase/admin_delete_job.sql](./supabase/admin_delete_job.sql)
- [supabase/delete_recruiter_job_posting.sql](./supabase/delete_recruiter_job_posting.sql)
- [supabase/candidate_assets_and_refinement.sql](./supabase/candidate_assets_and_refinement.sql)

## Recruiter invite emails

The recruiter questionnaire / AI-refinement invite flow can now send real emails through a Supabase Edge Function:

- [supabase/functions/send-recruiter-interest-email/index.ts](./supabase/functions/send-recruiter-interest-email/index.ts)

Recommended setup for `jobs@updates.peaktalent.it`:

1. Use Microsoft Graph with an Entra app, not the mailbox password directly.
2. Grant the app the `Mail.Send` application permission and admin-consent it.
3. Restrict mailbox access to the sender mailbox where possible.
4. In your DNS for `peaktalent.it`, make sure outbound email authentication is configured:
   - SPF TXT record:
     - `v=spf1 include:spf.protection.outlook.com -all`
   - DKIM:
     - create the two CNAME records provided by Microsoft 365 / Defender for `selector1._domainkey` and `selector2._domainkey`
     - then enable DKIM for the domain in Microsoft 365
   - DMARC TXT record:
     - host: `_dmarc`
     - value: `v=DMARC1; p=none; pct=100; rua=mailto:info@peaktalent.it`
5. Set these Edge Function secrets:
   - `MICROSOFT_TENANT_ID`
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
   - `MICROSOFT_SENDER_EMAIL=jobs@updates.peaktalent.it`
   - optional: `PUBLIC_SITE_URL=https://www.peaktalent.it`
5. Deploy the function:
   - `supabase functions deploy send-recruiter-interest-email --no-verify-jwt=false`

Notes:

- This keeps Microsoft credentials server-side inside Supabase Functions.
- The browser only invokes the function through the normal Supabase client.
- If you want the easiest third-party alternative, Resend currently lists a free tier with 3,000 emails/month and 100 emails/day, and a Pro plan at $20/month for 50,000 emails/month:
  - [Resend pricing](https://resend.com/pricing)

hey hey
Aggiornamento README per nuovo commit.
