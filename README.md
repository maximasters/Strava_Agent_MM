# 🏃‍♂️ Marathon Training Block Comparator

A premium, interactive, and privacy-first web dashboard to compare 20-week marathon training blocks side-by-side using your Strava running history. Designed for serious marathoners who want to analyze their weekly mileage curves, cumulative volume builders, long run progressions, and pace trends leading up to race day.

![Dashboard Preview](https://github.com/user-attachments/assets/demo-placeholder) *(Once deployed, you can add a screenshot here!)*

---

## 🚀 Quick Start (Local Setup)

This project runs entirely on client-side code and native Node.js. It requires **no external packages or dependencies** to run.

### 1. Link Your Strava Account
To fetch your activities, you need a free Strava API application:
1. Go to [Strava API Settings](https://www.strava.com/settings/api) and create an application.
2. Under **Authorization Callback Domain**, enter `localhost`.
3. In your terminal, run the authentication command:
   ```bash
   npm run auth
   ```
4. Open [http://localhost:8111](http://localhost:8111) in your browser.
5. Enter your **Client ID** and **Client Secret** (from the Strava API settings page), and click **Authorize with Strava**.
6. Agree to the permissions on Strava's page. Once complete, the credentials are encrypted and stored locally in `data/credentials.json` (this file is ignored by Git and never published).

### 2. Synchronize Your Activities
Once linked, download and filter your running history:
```bash
npm run sync
```
This script will paginate through your Strava activities, extract runs, strip out all private/location details, and write a clean, optimized data file to `data/activities.json`.

### 3. View the Dashboard
Start a local web server to open the dashboard (or simply open `index.html` in your browser, though a server is recommended for correct local file loading):
```bash
npx serve .
# Or if you have Python: python -m http.server
# Or using VS Code Live Server extension
```
Open the provided URL (e.g. `http://localhost:3000` or `http://localhost:8000`) to view the dashboard!

---

## 🔒 Privacy First

Because this dashboard is designed to be hosted on public static hosts like GitHub Pages (`github.io`), data privacy is baked in:
* **No Secrets Committed:** Your Strava client secret and auth tokens are stored *only* in `data/credentials.json` which is ignored in `.gitignore`.
* **Sanitized Activity Data:** The `data/activities.json` file contains only high-level run statistics (`date`, `distance`, `moving_time`, `elapsed_time`, `name`, `elevation_gain`). 
* **Safe from Stalkers:** All sensitive geographic information (GPS map polylines, coordinates, start/end locations), private descriptions, and sensor data (like heart rate or power) are **completely stripped out** before saving.

---

## 📊 Dashboard Features

* **Side-by-Side Summary Table:** Highlights peak weekly volume, overall average pace, elevation profile, total runs, and actual recorded race-day finish times.
* **Weekly Volume Chart:** Overlay line chart showing mileage curves (tapering and building phases) from Week 1 to Week 20.
* **Cumulative Mileage Chart:** Displays total volume accumulated over the 20 weeks.
* **Weekly Long Run Chart:** Compares the longest run performed in each training week.
* **Weekly Pace Chart:** Plots average pace curves (with reverse-axis so faster pace is displayed higher).
* **Metric Toggle:** Instantly switch all stats, charts, and pace formatting between Miles/Min-per-Mile and Kilometers/Min-per-Km.
* **Dynamic Training Blocks:** Add new training blocks dynamically via the UI (specify Name, Race Date, and Chart Color). Custom blocks are saved in your browser's `localStorage` and will persist across reloads.
* **Automatic Race Detection:** The dashboard scans your run history and automatically matches race-day runs (runs ~26.2 miles run on the race date) to highlight your final finish time.

---

## 🌐 Deploy to GitHub Pages

Hosting your dashboard on GitHub Pages (`yourusername.github.io/repository-name`) is simple:

1. **Create a GitHub Repository** and push your files. Make sure `data/activities.json` is committed, as the web page loads it!
2. **Enable GitHub Pages:**
   * Go to your repository settings on GitHub.
   * Click **Pages** in the left sidebar.
   * Under **Build and deployment**, select **Deploy from a branch** (choose `main` or `master` and the `/ (root)` folder).
   * Click **Save**.
3. Your page will be live at `https://yourusername.github.io/repository-name` in a few minutes!

*Note: Whenever you do more runs and want to update the dashboard, simply run `npm run sync` locally and commit/push the new `data/activities.json` to GitHub!*
