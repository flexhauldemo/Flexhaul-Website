# FlexHaul & Demolition — Website + SMS + Dashboard Setup Guide

This site is plain static HTML/CSS/JS (no build step) **plus** four small
serverless functions that power real SMS confirmations/reminders and a
live admin dashboard. Everything works as a plain static site even
without these pieces — this guide is specifically about turning them on.

## What's already built

- `netlify/functions/submit-quote.js` — receives the contact form
  submission, saves it, and sends an instant SMS confirmation via Twilio
  if the customer opted in.
- `netlify/functions/send-reminders.js` — runs automatically once a day
  and texts anyone whose sofa/furniture pickup is happening tomorrow.
- `netlify/functions/get-leads.js` — returns every saved lead. This is
  what lets `admin.html` show real bookings from every device, not just
  the browser it's opened in.
- `netlify/functions/manage-lead.js` — updates a lead's status or
  deletes it from the dashboard, applying everywhere (not just locally).
- `privacy.html` / `terms.html` — required by Twilio before they'll
  approve SMS sending (see step 2 below).
- The contact form and furniture pickup form already call these
  functions; nothing else on the site needs to change.

## Step 1 — Deploy on Netlify via Git (not drag-and-drop)

Netlify Drop (the drag-and-drop uploader) only hosts static files — it
does not run the functions in `netlify/functions`. To get those working:

1. Push this whole folder to a GitHub (or GitLab/Bitbucket) repository.
2. In Netlify, choose **Add new site → Import an existing project**,
   and connect that repository.
3. Leave the build settings as-is — `netlify.toml` already tells Netlify
   where the site and functions live.
4. Deploy. Your `/.netlify/functions/submit-quote` endpoint is now live.

## Step 2 — Set up Twilio and register for SMS (A2P 10DLC)

1. Create a Twilio account and buy a phone number.
2. Twilio requires **A2P 10DLC registration** before carriers will
   reliably deliver your texts. This takes **10–15 days**, so start
   this well before you need SMS live.
3. As of mid-2026, Twilio requires your registration to include a
   **live Privacy Policy URL and Terms of Service URL**. Once this site
   is deployed, those are:
   - `https://yourdomain.com/privacy.html`
   - `https://yourdomain.com/terms.html`

   **Have a lawyer review both pages before you rely on them** — I
   drafted plain-language starting points, not legal advice.
4. During registration, Twilio will ask what kind of messages you're
   sending — describe it plainly: appointment confirmations and
   reminders for a junk removal / demolition service, sent only to
   customers who opted in on your quote form.

## Step 3 — Add your credentials to Netlify

In Netlify: **Site settings → Environment variables**, add:

| Key | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | From your Twilio Console (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | From your Twilio Console |
| `TWILIO_FROM_NUMBER` | Your Twilio number, e.g. `+17650000000` |
| `ADMIN_API_KEY` | A password you make up — protects the dashboard's data endpoints. Use something long and random, not a real word. |
| `BLOBS_SITE_ID` | Your Netlify Project ID — find it at Project configuration > General > Project details > "Project ID" |
| `BLOBS_TOKEN` | A Personal Access Token — click your account avatar (bottom-left in Netlify) > User settings > Applications > New access token. Copy the value immediately; Netlify only shows it once. |

Redeploy after adding these (Netlify only picks up new environment
variables on a fresh deploy).

**Why `BLOBS_SITE_ID` and `BLOBS_TOKEN` are needed:** Netlify Blobs is
supposed to auto-configure itself with zero setup, but this sometimes
fails in production with a `MissingBlobsEnvironmentError` even on
correctly deployed sites — a known Netlify quirk, not something wrong
with this code. Setting these two variables explicitly (which the
functions in `netlify/functions/_blobStore.js` check for first) works
around it reliably.

## Step 4 — Test it

1. Submit a real quote request through `contact.html` with your own
   phone number and the SMS checkbox checked.
2. You should get a confirmation text within a few seconds.
3. To test the reminder function without waiting a full day, open
   Netlify's **Functions** tab, find `send-reminders`, and click
   **Run now**. Check the function log to see how many reminders it
   found and sent.
4. Open `admin.html`, click **Connect Live Data**, and enter the same
   value you set for `ADMIN_API_KEY`. You should see the request you
   just submitted. The browser remembers this key after the first time,
   so you won't need to re-enter it on future visits from that device.

## The admin dashboard (`admin.html`)

Before you connect live data, the dashboard shows **local demo data
only** — sample bookings you can generate with "Load Sample Data",
stored just in that browser. This is normal and expected; it's there so
the dashboard is still useful to look at before you've deployed anything.

Click **Connect Live Data** and enter your `ADMIN_API_KEY` to switch to
**live mode**, which shows real bookings from every device via
`get-leads.js`. In live mode, changing a status or deleting a request
updates the shared server data (via `manage-lead.js`) — visible to
anyone else who opens the dashboard, not just you.

**A note on the admin key:** this is basic protection, not enterprise
authentication. Anyone with the key can see and edit every customer's
name, phone, and address. Keep it private the way you'd keep a shared
password private, and don't post the admin URL anywhere public. If you
later want real per-staff logins, audit logs, or role permissions,
that's a bigger step up (e.g. Netlify Identity) — ask if you get there.

## Changing the reminder send time

`send-reminders.js` runs on a cron schedule set at the bottom of the
file (`exports.config = { schedule: "0 14 * * *" }`). That's 2pm UTC.
Edit that line to change when reminders go out — see
[Netlify's cron format reference](https://docs.netlify.com/build/functions/scheduled-functions/)
for the syntax.

## Changing the pickup schedule (every-other-Saturday, time windows)

That logic lives in one place: `js/schedule.js`. It's already documented
inline — see the comment block at the top of that file.
