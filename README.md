# Event Radar

An installable web app (PWA) that lists hackathons, workshops, meetups and challenges a student in Kanyakumari can actually join: across Tamil Nadu, Kerala, Bengaluru and online.

**Live app:** https://jeevanxx.github.io/Event-Rader/

## How it works

- **Daily check.** Every morning Claude works through `SCOUT_CHECKLIST.md` (all of Tamil Nadu and Kerala, Bengaluru, online), verifies each event on its source pages, re-checks existing events, updates `data/events.json` and logs what was covered in `data/coverage.json`.
- **Automatic check (free, no AI).** Every day at 6:15 AM IST the `Daily automatic event check` workflow runs `scripts/auto-scout.mjs` on GitHub Actions. It reads structured listings from Unstop, Eventopia and India Hackathons, keeps hackathons, workshops and tech competitions in Tamil Nadu, Kerala, Bengaluru and online (plus anything at Joy University), and refreshes `data/joy.json` from Joy University's events page. These cards are tagged *Auto-found*. It keeps working even without Claude.
- **App.** A static PWA on GitHub Pages reads `data/events.json`. It works offline with the last saved list. Interested / Registered / Skipped marks are saved on each device.
- **Notifications.** When `data/events.json` changes, the `Send event alerts` workflow works out what's new, changed or closing soon and sends one Web Push alert to every registered device.
- **Registering a device.** Tapping **Turn on alerts** creates a push subscription, encrypts it with the repo's public key, and opens a prefilled `push-subscribe` issue. The `Register device for alerts` workflow decrypts it, sends a test alert and labels the issue. Closing the issue turns alerts off for that device.

## Event fields

`id, title, kind, start, end, deadline, city, region, mode, venue, address, organizer, cost, team, eligibility, prizes, theme, perks, bring, summary, warning, url, sources[], verifiedAt, fit, fitReason, isNew, added`

## Secrets

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUB_PRIVATE_KEY` (RSA private key that decrypts device codes).
