# Workout Log

A workout logging web app that runs entirely in your browser. Log sets, reps, holds and equipment, follow training
plans, track progress on graphs, and keep photos, measurements and goals. Your data stays on your device unless you
choose to back it up or sync it.

## Use it on your phone

1. Open the address of this site in Chrome on your phone and let it load once while online.
2. Open Chrome's menu and choose **Install app** (or **Add to Home screen**).
3. After that it opens full-screen and works offline.

## Backups

- **Settings menu:** Export backup, and Import backup to restore on another device.
- **Profile screen:** Google Drive sync, and an automatic daily backup to a folder (Chrome or Edge on a computer only).

Backups contain personal data, so do not upload them to this repository.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Opens the app |
| `workout-log-standalone.html`, `workout-log.js` | Main log page and its code |
| `workout-graph.html`, `workout-graph.js` | Progress graphs |
| `workout-shared.js` | Helpers used by both pages (units, formatting, colour themes, strength maths) |
| `workout-log-style.css` | Styles for both pages |
| `workout-tools.js`, `workout-library.js`, `workout-profile.js`, `workout-backup.js` | Timer and metronome, programme library, profile, automatic backup |
| `workout-library.json` | Programmes, workouts, warm-ups, stretches, achievements |
| `manifest.webmanifest`, `service-worker.js`, `workout-pwa.js`, `icons/` | Make it installable and usable offline |

Keep all files in the same folder. File names are case sensitive on GitHub Pages.
