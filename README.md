# 🍅 Laura's Food

A beautiful, AI-powered weekly meal planning app. Restaurant-quality, healthy meals in 10 minutes or less — with cross-device sync, photo-to-pantry recognition, and AI recipe generation from whatever's in your kitchen.

**Live App:** [https://nelsonhumberto.github.io/laurafood/](https://nelsonhumberto.github.io/laurafood/)

## Features

- 📅 **Day-numbered weekly menu** with full recipes, ingredients, steps, dressings, plating tips
- 🥫 **Smart pantry** with quantity, units, expiration dates, and staple flags
- 📷 **Photo → pantry** — snap a picture, AI identifies items and adds them
- ✨ **Create Meal** — AI generates a recipe from your current pantry, scaled for # of people and ages
- 🍳 **"I cooked this"** flow — auto-deducts used ingredients, auto-adds empties to To Buy
- 🛒 **To-Buy list** — manual + auto-populated from empty pantry items
- ☁️ **Cross-device sync** via Supabase (real-time updates between devices)
- 📲 **Installable PWA** — Add to Home Screen on iOS / Android / desktop
- 💾 **Offline-first** — works without internet, syncs when back online

## Setup

### 1. Database (one-time)

Run the SQL from [`supabase_setup.sql`](./supabase_setup.sql) in your [Supabase SQL Editor](https://supabase.com/dashboard/project/qdhqkcsfslkbhxtogjfp/editor).

### 2. AI Edge Function (one-time)

```bash
supabase login
supabase link --project-ref qdhqkcsfslkbhxtogjfp
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy ai --no-verify-jwt
```

That's it — the deployed app at the live URL automatically uses the function.

## Tech Stack

- **Frontend:** Single-file HTML + vanilla JS, Nunito + Fraunces fonts
- **Database:** Supabase Postgres (JSONB single-row state model)
- **Real-time:** Supabase Realtime channels
- **AI:** Anthropic Claude (vision for photos, generation for recipes), proxied via Supabase Edge Function
- **PWA:** Service worker (network-first), manifest, maskable icons
- **Hosting:** GitHub Pages

## Project Structure

```
.
├── index.html              # The whole app
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline + caching)
├── icon.svg                # Vector icon
├── icon-192.png            # PWA icon (small)
├── icon-512.png            # PWA icon (large)
├── supabase_setup.sql      # One-time DB setup
├── supabase/
│   ├── config.toml
│   └── functions/ai/
│       └── index.ts        # Claude proxy edge function
└── README.md
```
