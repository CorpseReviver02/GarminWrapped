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

## Running Locally - Getting Started

### Requirements

- **Node.js** 18+ (recommended)
- **npm** 8+ (or a compatible version)

### Install dependencies

From the project root:

```bash
npm install
```

### Run the dev server
```bash
npm run dev
```

### Then open:
```bash
http://localhost:3000
```

You should see the Garmin Wrapped UI with a unit toggle and upload buttons.

---

## Exporting data from Garmin Connect

You’ll need to export CSVs from three different areas of Garmin Connect.
Activities is required. Steps and Sleep are optional but recommended.

No changes are required to each CSV, but you may want to delete rows from other years if your export includes multiple years.

### 1. Activities (required)
Go to:
https://connect.garmin.com/modern/activities
Scroll down to the last activity you want included (for example, the last one of the year).
At the top of the activities list, click “Export CSV”.
Save the file somewhere you can easily find it (e.g. activities-2025.csv).

### 2. Steps (optional)
Go to:
https://connect.garmin.com/modern/report/29/wellness/last_year
Set the time range to “1 Year”.
Click “Export” at the top of the screen.
Save the CSV file (e.g. steps-2025.csv).

### 3. Sleep (optional)
Go to:
https://connect.garmin.com/modern/sleep
Set the time range to “1 Year”.
Click the three dots (⋯) menu at the top of the screen.
Choose “Export CSV”.
Save the file (e.g. sleep-2025.csv).

_Tip: If your exports contain multiple years of data, you can open the CSV in Excel/Sheets and delete any rows that are outside the year you’re interested in._

---

## Using the App

### Choose your units
At the top-right of the page, pick:
Imperial (mi/ft) or
Metric (km/m)
### You should select units before uploading your Activities CSV.

### Upload Activities CSV
Click “Upload Activities CSV”.
Select the CSV you exported from the Activities page.
The main dashboard (distance, time, heart rate, elevation, sports cards, etc.) will populate.

### Upload Sleep CSV (optional)
Click “Sleep CSV (optional)”.
Select the CSV you exported from Sleep.
The “Sleep Wrapped” card will show averages and your best/worst weeks.

### Upload Steps CSV (optional)
Click “Steps CSV (optional)”.
Select the CSV you exported from Steps.
Steps totals, averages, and best week will appear, plus marathon/5K equivalents.

### Download as image
Once your data is loaded, click “Download as image” (top-right).
This will generate a PNG image of the page that you can save or share.

---

## Data Notes & Caveats

### Activities
The app expects a standard Garmin Activities CSV as exported from the Activities page.
Different languages/regions are handled via heuristics to map headers and units.
Swimming/Rowing/SkiErg distances are treated as meters exports where appropriate.
Elevation and distance are normalized internally and then displayed in your chosen unit system.

### Steps & Sleep
The app treats some exports as “weekly” summaries based on patterns in the CSV.
Sleep duration can be parsed from HH:MM, hours/minutes strings (e.g. 7h 35min), or similar formats.
If the shape of your CSV is very different, some metrics might not populate perfectly.

### Multiple years
If your exports include multiple years, you can filter them by:
Exporting only the desired year, or
Manually deleting rows from other years in the CSV.

### Privacy
Everything runs locally in your browser.
CSV files are parsed client-side; they are not uploaded to any remote server by this app.

### Scripts
From package.json:
```bash
npm run dev — Start Next.js in development mode
npm run build — Lint + build the production bundle
npm run start — Start Next.js in production mode
npm run lint — Run ESLint
```

### License
This project is for personal use and is not affiliated with Garmin Ltd. or any of its subsidiaries.
Check the repository’s license file (if present) for full details.
