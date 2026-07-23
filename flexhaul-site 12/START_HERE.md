# Start Here — What Goes Where

This download has **two folders**, and they go to **two different places**.
That split isn't a mistake — your website and your CRM's backend are
fundamentally different kinds of things (one is files to read, the other is
a live server that has to stay running), so they need different hosts.

---

## 📁 `flexhaul-site` → your EXISTING GitHub repo → Netlify

This is your whole website, already updated with one real change: `admin.html`
now the full CRM login screen (replacing the old lightweight dispatch board),
plus a new `admin` folder alongside it with the CRM's actual screens.

**What to do:** upload this folder's contents into the same GitHub repo your
site already lives in — same drag-and-drop process you've already done
before. Netlify will redeploy automatically, same as always.

If you'd rather not re-upload the whole site, the only two things that
actually changed are `admin.html` and the new `admin` folder — you can just
add/replace those two in GitHub instead of everything else. Either way works.

**Nothing else about your site changed** — same pages, same pricing removals,
same phone number and email, same everything else.

---

## 📁 `flexhaul-crm-backend` → a NEW, separate GitHub repo → Render

This is the CRM's actual engine — the part that remembers your customers and
jobs permanently. It has to run as a live server, which Netlify can't do,
which is why this needs its own home (Render).

**What to do:**
1. Create a **new, separate** GitHub repo (e.g. name it `flexhaul-crm-backend`)
2. Upload this folder's contents into that new repo (same drag-and-drop trick)
3. Follow **"Part 2 — Deploy for real"** in this folder's own `README.md` to
   connect that repo to Render

This is the part I can't do for you — it needs a real Render account, which
only you can create. The README walks through every click.

---

## Quick sanity check before you start

- Your **existing** GitHub repo/Netlify site → gets `flexhaul-site`'s contents
- A **brand-new** GitHub repo → gets `flexhaul-crm-backend`'s contents
- Two different repos, two different hosts, one website + one CRM

Once both are up, `admin.html` needs one line updated to point at wherever
Render ends up hosting your backend — that's also covered in the backend
folder's README, under "Point the frontend at the real API."
