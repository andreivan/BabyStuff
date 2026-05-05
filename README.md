# Baby Inventory & Wishlist

A mobile-first Next.js App Router single-page app for tracking baby items by category. It uses `localStorage` for local testing and keeps persistence isolated so it can be swapped for a database later.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and enter the access code:

```text
2026Baby
```

On Windows PowerShell, if `npm` is blocked by script policy, use:

```powershell
npm.cmd install
npm.cmd run dev
```

## Supabase setup

This app is wired for Supabase. Add these variables locally in `.env.local` and in Vercel project settings:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_api_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Run the SQL in `supabase-schema.sql` once in:

```text
Supabase Dashboard -> SQL Editor -> New query
```

The app will seed the initial baby stock into Supabase the first time it loads an empty `baby_items` table.

## Deploy to Vercel via GitHub

1. Push this project to a GitHub repository.
2. In Vercel, choose **Add New Project** and import the GitHub repo.
3. Keep the default framework setting as **Next.js**.
4. Add the Supabase environment variables in **Settings -> Environment Variables**.
5. Use the default build command `npm run build`.
6. Deploy.

If Supabase is not configured, the app falls back to `localStorage` for local testing.
