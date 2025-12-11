This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

# Garmin Wrapped

Garmin Wrapped is a small Next.js app that turns your yearly Garmin data into a clean, shareable “year in review” dashboard.  

It uses CSV exports from Garmin Connect for:

- **Activities** (required)
- **Steps** (optional)
- **Sleep** (optional)

You can switch between **Imperial** and **Metric** units, explore your stats, and download the whole page as an image.

---

## Features

- **Activity summary**
  - Total distance, total time, number of sessions
  - Favorite activity type and most active month
  - Longest activity and highest-calorie activity
  - Per-sport breakdown: Running, Cycling, Swimming (with pace/speed)
  - Consistency streak and “grind day” (busiest weekday)
  - Elevation stats: total ascent and highest point

- **Sleep Wrapped** (optional)
  - Average sleep score
  - Average nightly duration
  - Best week of sleep
  - Worst week of sleep

- **Steps Wrapped** (optional)
  - Total steps and average steps per day
  - Best week of steps
  - Rough equivalence in marathons / 5Ks

- **Unit-aware**
  - Choose **Imperial (mi/ft)** or **Metric (km/m)**
  - Data is normalized internally and displayed in the units you select

- **Shareable output**
  - Download the entire page as a PNG image to share or save

---

## Tech Stack

- [Next.js 16](https://nextjs.org/)
- [React 19](https://react.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/) (utility classes)
- [Papaparse](https://www.papaparse.com/) for CSV parsing
- [html-to-image](https://github.com/bubkoo/html-to-image) for PNG export
- [lucide-react](https://lucide.dev/) for icons

---

## Getting Started

### Requirements

- **Node.js** 18+ (recommended)
- **npm** 8+ (or a compatible version)

### Install dependencies

From the project root:

```bash
npm install
