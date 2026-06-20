# Fitness Wrapped

A year-in-review for your Garmin data. Upload your Garmin Connect CSV exports and get a Spotify-Wrapped-style recap of your training year: totals, trends, personal bests, a full-screen story mode, and shareable images.

**Live:** [garmin-wrapped.vercel.app](https://garmin-wrapped.vercel.app)

Everything runs in your browser. Your CSV files are parsed locally and never uploaded to a server.

---

## What you get

- **A full dashboard** of the year: total distance and moving time, sessions, calories, heart rate, elevation, per-sport breakdowns (running, cycling, swimming), longest activity, biggest calorie burn, consistency streak, and an optional sleep and steps summary.
- **Year-over-year comparison** when your data spans more than one year (see [Multi-year support](#multi-year-support)).
- **"Your year in motion"** monthly chart with a per-sport toggle (All / Run / Bike / Swim / Other) and a value on every month.
- **Story mode** — a full-screen, tap-through recap (`Play your year`) with one stat per scene, big type, and per-scene artwork. Each scene, including the final summary card, can be saved as an image to share.
- **A customizable recap card** — choose which stats appear on the final "receipts" slide and its shareable image.
- **Imperial or metric** units, switchable at any time.

---

## How to export your data from Garmin Connect

You need at least the **Activities** export. **Steps** and **Sleep** are optional and unlock extra sections.

Export from a desktop browser; the CSV download links are easiest to reach there.

### 1. Activities (required)

1. Open [Garmin Connect → Activities](https://connect.garmin.com/modern/activities).
2. Scroll down until the list includes the oldest activity you want in your recap. Garmin loads more activities as you scroll, so keep going if you want multiple years (see below).
3. Click **Export CSV** (top right of the activity list).

This single file can hold as many years as you scrolled back to load. That is what powers the multi-year features.

### 2. Steps (optional)

1. Open [Garmin Connect → Steps report](https://connect.garmin.com/modern/report/29/wellness/last_year).
2. Set the date range to **1 Year**.
3. Click **Export**.

### 3. Sleep (optional)

1. Open [Garmin Connect → Sleep](https://connect.garmin.com/modern/sleep).
2. Set the range to **1 Year**.
3. Open the **three-dot menu** and choose **Export CSV**.

### Then, in the app

1. Pick your units (Imperial or Metric) **before** uploading.
2. Use **Upload Activities**, and optionally **Steps CSV** and **Sleep CSV**.
3. The dashboard fills in as each file loads.

---

## Multi-year support

Your Activities export often contains several years of history in one file. Fitness Wrapped reads the date on every activity and groups them by calendar year, then builds the recap around one **focus year** at a time.

### The year toggle

When your data contains **two or more years**, a year switcher appears in the header. Pick a year and the entire dashboard, including the story mode and the recap card, recalculates for that year only. With a single year of data, the toggle is hidden and the app just shows that year.

### Which year is shown first

The app picks a sensible default so you are not staring at a half-finished year:

- It defaults to the **most recent year** in your file.
- If the most recent year is the **current calendar year and still in progress** (and you have at least one earlier year), it defaults to the **latest complete year** instead, so the first thing you see is a full twelve months. You can always switch back to the in-progress year with the toggle.

### Year-over-year comparison

With two or more years present, the dashboard shows a comparison strip near the top: **Total Distance**, **Total Sessions**, **Total Time**, and **Average Run Pace**, each with the change versus the prior year and the prior-year value for context (for example, "was 1,434 mi in 2024"). The comparison uses the nearest earlier year that actually has data, so gaps in your history are handled gracefully.

### Within-year trends

"Your year in motion" breaks the focus year down by month and surfaces how the year developed: how your running pace changed from the first half to the second, how your longest run grew, and your busiest month. The chart's sport toggle only offers sports you actually did that year.

### A note on Steps and Sleep

The Steps and Sleep exports are **one-year wellness reports** made of weekly summaries, so they reflect roughly the last twelve months rather than splitting cleanly by focus year. They power the steps and sleep sections and are entirely optional. The Activities file is the source for all the year-aware features above.

---

## Story mode and sharing

Click **Play your year** for a full-screen, scroll-snapping recap with one headline stat per scene and a summary "receipts" card at the end. Use **Save image** to download the scene you are viewing (including the summary) as a PNG to post or send.

**Customize recap** lets you choose up to nine stats for that final card from everything your data supports (distance, time, sessions, calories, heart rate, elevation, ascent, steps, sleep, streak, run pace, top month, top sport). Your choices apply to both the on-screen card and the saved image.

There is also **Download as image** on the dashboard, which captures the whole page as a single tall PNG.

---

## Privacy

Fitness Wrapped is fully client-side. CSV files are read and processed in your browser using [Papa Parse](https://www.papaparse.com/); nothing is sent to a backend, and there is no account or database. Refreshing the page clears everything.

---

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router) and [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/) in strict mode
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Papa Parse](https://www.papaparse.com/) for CSV parsing
- [html-to-image](https://github.com/bubkoo/html-to-image) for image export
- [lucide-react](https://lucide.dev/) for icons
- Deployed on [Vercel](https://vercel.com/)

---

## Getting started (local development)

Requires **Node 20 or newer**.

```bash
# install dependencies
npm install

# start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and upload your CSVs.

Other scripts:

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # lint (the build is gated on zero warnings)
```

---

## Project structure

```
app/
  page.tsx          # the dashboard + controls (upload, units, story launch, recap customization)
components/
  StatCard.tsx      # small dashboard stat tile
  MonthlyBars.tsx   # "Your year in motion" bar chart
  StoryMode.tsx     # full-screen story mode (scenes, palettes, motifs, image export)
lib/
  types.ts          # shared types
  parse.ts          # CSV parsing helpers and number/date parsing
  normalize.ts      # unit detection and conversion
  activity-columns.ts # Garmin column mapping + activity-type canonicalization
  metrics.ts        # core activity metrics for a set of rows
  wellness.ts       # sleep and steps metrics
  compare.ts        # year-over-year comparison
  trends.ts         # within-year monthly trends
  format.ts         # duration / pace / distance formatting
  copy.ts           # dynamic, stable flavor text
  constants.ts      # shared constants
```

---

## Notes and limitations

- Distances are normalized to a common unit internally and displayed in your chosen system. Swim distances are shown in meters.
- Activity-type detection covers common English exports and some French, German, Spanish, and Dutch labels. Unusual or localized type names may land in the "Other" bucket.
- The recap-card selection lives in page state and resets on refresh.

---

## Disclaimer

Not affiliated with, endorsed by, or sponsored by Garmin Ltd. "Garmin" and "Garmin Connect" are trademarks of their respective owner. This is an independent hobby project that reads your own exported data.

© 2025 Jordan Lindsay.
