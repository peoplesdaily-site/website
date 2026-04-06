# People's Daily News Online — Supabase Integration Guide

## Final File Structure

```
your-website-folder/
│
├── index.html          ← Updated homepage (Supabase-powered)
├── article.html        ← Single article page (NEW)
├── dashboard.html      ← Admin dashboard (NEW)
│
├── js/
│   ├── supabase-client.js   ← Supabase connection (NEW)
│   ├── main.js              ← Homepage data logic (NEW)
│   ├── article.js           ← Article page logic (NEW)
│   └── dashboard.js         ← Dashboard logic (NEW)
│
└── images/
    ├── thumbnail (6).png       ← Your logo (existing)
    └── thumbnail (1500 x 500 px).png  ← Ad banner (existing)
```

---

## Setup Steps

### Step 1 — Copy the files

Create the files exactly as listed above. The `js/` folder must sit next
to `index.html` in the same directory.

### Step 2 — Your Supabase credentials are already in place

The credentials are in `js/supabase-client.js`:

```js
const SUPABASE_URL  = 'https://ulpktvjhxkapdvzaunaa.supabase.co';
const SUPABASE_ANON = 'eyJhbGciO...';  // your anon key
```

You do NOT need to change these unless you move to a different project.
Never paste a service-role key anywhere in frontend code.

### Step 3 — Open your site

Because the scripts load from a CDN and use the fetch API, you need to
serve the files over HTTP (not just open index.html as a file://… path).

**Easiest options:**
- Upload to any static host (Netlify, Vercel, GitHub Pages, cPanel, etc.)
- Locally: use VS Code Live Server extension, or run:
  ```
  npx serve .
  ```

### Step 4 — Add your first article

1. Go to `dashboard.html` (e.g. https://yoursite.com/dashboard.html)
2. Sign in with: `peoplesdailynewsonline@gmail.com` + your password
3. Click **New Article**
4. Fill in the form — title, slug, content, image, category
5. Click **Save & Publish**
6. Visit `index.html` — your article will appear automatically

---

## How Each Page Works

### index.html
- Loads Supabase CDN, then `supabase-client.js`, then `main.js`
- `main.js` fetches all published articles sorted by date
- Replaces the placeholder content in tagged sections (`id="hero-grid"`, etc.)
- Articles are clickable and navigate to `article.html?slug=the-slug`

### article.html
- Reads `?slug=` from the URL
- Fetches that single article from Supabase
- Renders full title, image, content, meta, and related articles sidebar

### dashboard.html
- Shows a login screen by default
- After sign-in, checks the email matches the admin email
- Grants access to: create, edit, delete, feature/unfeature articles
- Image upload goes to the `news-images` Supabase Storage bucket
- Site settings page reads/writes `public.site_settings`

---

## How Admin-Only Access Is Handled

### Client-side check (UX layer)
In `dashboard.js`, the admin email is stored as a base64-encoded string:
```js
const ADMIN_EMAIL = atob('cGVvcGxlc2RhaWx5bmV3c29ubGluZUBnbWFpbC5jb20=');
```
After login, the signed-in user's email is compared to this value.
If it doesn't match, the dashboard shell stays hidden and an "Access
Denied" message is shown.

### Real security layer — Supabase RLS
The client-side email check is a UX-only guard. The real lock is
Row-Level Security (RLS) on your Supabase tables. Even if someone
decoded the base64, bypassed the JS check, and tried to call the
Supabase API directly, they would still be blocked by RLS unless
they are authenticated as the admin Supabase Auth user.

This means:
- Public visitors can only READ published articles (as configured)
- Only the admin Supabase Auth account can INSERT / UPDATE / DELETE

---

## Optional Security Improvements (for later)

### Option A — Use Supabase user metadata
When the admin user was created in Supabase Auth, you can set custom
metadata (e.g. `{ "role": "admin" }`). Then check:
```js
if (session.user.user_metadata?.role !== 'admin') { /* deny */ }
```
This avoids ever referencing the email at all in JS.

### Option B — Custom RLS policy with `auth.uid()`
Instead of checking email, your RLS policies can check `auth.uid() = 'THE_ADMIN_UUID'`.
The UUID is never exposed publicly, making it an even stronger lock.

### Option C — Supabase Edge Function as middleware
Move the auth check to a serverless Edge Function (Deno). The dashboard
calls the function, which verifies the JWT server-side and returns a
signed token. The email/role never touches the browser at all.

**For your current setup, Option A (metadata) is the best quick upgrade.**

---

## Adding More Articles Later

Use the Dashboard → **New Article** form. The fields map directly to
the `public.articles` table columns.

For category filtering to work on the homepage, use one of these
exact category names (case-sensitive):
- Politics
- Local News
- Crime
- Business
- Economy
- Sports
- Entertainment
- World
- Opinion
- Breaking

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Articles don't load | Wrong credentials | Check `supabase-client.js` |
| Dashboard shows "Access Denied" | Wrong email | Sign in with the correct admin email |
| Images don't show | Wrong bucket URL | Check the Storage bucket is public |
| Can't upload images | Storage policy | Verify the bucket has an INSERT policy for authenticated users |
| Articles load but have no images | `image_url` is null | Add an image when creating the article |
