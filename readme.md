# 🚌 kactakalkar — Istanbul Live Transit

An **independent**, **open-source**, and **AI-powered** live transit application for Istanbul public transport, built on IETT/IBB open data.

> **⚠️ Legal Disclaimer:** kactakalkar is an independent project with **no official affiliation** with IETT (Istanbul Electricity, Tramway and Tunnel General Management) or IBB (Istanbul Metropolitan Municipality). Data accuracy and uninterrupted service are not guaranteed. The application is provided "as-is".

## ✨ Features

- **🚏 Stop Search:** Search by stop code or name, and view a live list of approaching vehicles.
- **🚌 Route Details:** Route paths, stops, departure schedules, depot routes, and announcements.
- **📡 Live Fleet:** Real-time map tracking of active vehicles on a specific line.
- **🔍 Vehicle Search:** Detailed vehicle info via license plate or door code (with IETT CAPTCHA verification).
- **🗺️ Route Planner:** Calculates the best transfer routes using IETT's official `nasilgiderim` service.
- **📍 Nearby Stops:** Location-based stop listing within a 600-meter radius.
- **📅 Trip Archive & Popular Lines:** Historical trip records and the most frequently used lines.
- **🤖 AI Assistant:** Local rule-based AI to query lines, stops, and vehicles.
- **📱 PWA Support:** Installable, offline-capable mobile application experience.

## 🛠️ Technologies

- **Frontend:** Vanilla JavaScript, HTML5, CSS3, Leaflet.js (Maps)
- **Backend:** Node.js, Hono (replacing Express), Native Fetch API
- **Deployment:** Cloudflare Workers & Assets
- **Data Sources:** IBB Open Data Portal (SOAP API), iett.istanbul (HTML Scraping)

## 🚀 Installation & Running

### Requirements
- Node.js (v18 or higher)
- npm

### 1. Clone the Project
```bash
git clone https://github.com/fth25/kactakalkar.git
cd kactakalkar