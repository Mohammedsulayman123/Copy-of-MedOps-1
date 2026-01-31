# Wash Link - WASH Response Dashboard

## Project Description
Wash Link is a specialized rapid-response dashboard designed for monitoring water, sanitation, and hygiene (WASH) facilities in crisis zones. It facilitates real-time data collection from volunteers in the field and provides actionable insights for NGOs to manage risks effectively.

**Key Features:**
*   **Volunteer Dashboard:** Branched assessment logic (Yes/Limited/No functionality) for rapid Toilet and Water Point reporting.
*   **NGO Dashboard:** Real-time visibility into field operations with a heatmap of critical interventions.
*   **Resilient Core Architecture:** 
    *   **Self-Healing User Profiles:** Automatically restores missing database profiles to ensure write permissions.
    *   **Offline-First Choice:** Offers a split-second choice between **Manual SMS Fallback** or **Encrypted Local Sync** when internet connectivity is poor (< 3s response).
    *   **Real-time Sync Indicators:** Pulse-animated UI showing exact synchronization status (Pending vs. Synced) using Firestore metadata.
*   **Unified Risk Calculator:** Complex scoring (0-100) identifying Priority 1 (Critical) threats across multiple facility types.

## 🚀 Live Demo & Downloads
- **Web Dashboard (Vercel):** [Click here to view Live Demo](https://copy-of-med-ops-1.vercel.app/#/login)
- **Android App:** [Download APK File](https://drive.google.com/file/d/1JOuXfiZ7wbohAeQy98i8rE0m6VhPPISj/view?usp=sharing)
- **SMS Reporting Demo Video:** [Watch Video Here]([VIDEO_URL_HERE])

### 🔑 Demo Credentials
Use these credentials to try the app:
- **Volunteer Access:** `VOL-18` (No password required)
- **NGO Access:** `NGO-ALPHA`
  - **Password:** `123456`

---

## Installation & Setup

### Prerequisites
*   **Node.js** (v18 or higher recommended)
*   **npm** or **yarn**
*   **Android Studio** (for mobile deployment)

### Steps
1.  **Clone the Repository**
    ```bash
    git clone https://github.com/Mohammedsulayman123/MedOps.git
    cd MedOps
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    *   Ensure you have a Firebase project set up.
    *   Configure your firebase credentials in `services/firebase.ts`.

---

## Running the Project

### Web Development Mode
To run the web application locally:
```bash
npm run dev
```
Access the app at `http://localhost:5173`.

### Production Build
To build the project for production:
```bash
npm run build
```

### Mobile Deployment (Android)
To sync and open the project in Android Studio:
```bash
npx cap sync android
npx cap open android
```
From Android Studio, you can run the app on an emulator or a connected physical device.

---

## Credits
**Developed by:** [MedOps Team]

**Special Thanks:**
*   **React & Vite Community** for the robust development framework.
*   **Firebase** for real-time database and offline persistence capabilities.
*   **Leaflet** for the interactive mapping visualization.

---

## License
This project is licensed under the **MIT License**.

Copyright (c) 2026 Wash Link Team.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
