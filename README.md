# 🍅 Laura's Food

A beautiful, AI-powered weekly meal planning app for healthy, restaurant-quality meals in 10 minutes or less.

## Features

- **Week 1 Menu** — 7 complete recipes (Mon–Sun), each with tomatoes as the star ingredient
- **Recipe Cards** — Full ingredients, step-by-step instructions, dressing recipes & plating tips
- **Pantry Tracker** — Toggle items as empty to automatically add them to next week's shopping list
- **Smart Shopping List** — Fresh items only; pantry staples are never included unless marked empty
- **Next Week Generator** — Pre-built AI system prompt & trigger phrase to generate Week 2+ via Claude or any AI
- **Persistent State** — Shopping checkmarks and pantry status saved locally via localStorage

## Rules

- Tomatoes as the star ingredient in every meal
- 10 minutes or less prep time per meal
- Restaurant-quality, beautifully arranged presentation
- Fresh or frozen protein (shrimp & salmon primary; tuna pouch as backup)
- Pantry staples are **never** on the shopping list

## Tech Stack

Single-file HTML app — no build step, no dependencies, no backend required. Open `index.html` in any browser.

## Live App

Deployed via GitHub Pages: [View App](https://nelsonhumberto.github.io/laurafood/)

## Generating New Weeks

Open the **Next Week** tab, copy the system prompt, and send it to [Claude.ai](https://claude.ai). Then use the trigger phrase:

> **"Laura's Food — give me Week 2"**

The AI will generate 7 brand-new meals, a shopping list, and plating tips — with no repeats from previous weeks.
