# Developer Setup

Tested on Windows 11 with Python 3.14 and Node 24. The same steps work on macOS and Linux; adjust the venv activation path.

## Prerequisites

- Python 3.12 or newer (3.14 used in development)
- Node.js 24 and npm
- Git
- A phone with **Expo Go** installed, on the same Wi-Fi as the computer

## Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows (macOS/Linux: source .venv/bin/activate)
pip install -r requirements-dev.txt
cp .env.example .env              # then edit .env
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

In a second terminal, run the background-job consumer (reminders, missed-reminder alerts, retention):

```bash
python manage.py run_huey
```

Useful URLs:

| URL | Purpose |
|---|---|
| `http://localhost:8000/api/v1/health` | Health check |
| `http://localhost:8000/api/docs` | Swagger UI |
| `http://localhost:8000/api/schema` | OpenAPI schema |
| `http://localhost:8000/admin/` | Django admin (create an account with `python manage.py createsuperuser`) |

### Quality checks

```bash
ruff check . && ruff format --check . && mypy . && pytest
```

## Mobile

```bash
cd mobile
npm install
npm start          # scan the QR code with Expo Go
npm run typecheck
npm test
```

### Run on your phone (Expo Go)

1. Install **Expo Go** from the App Store or Play Store. The phone and computer must be on the same Wi-Fi.
2. Find the computer's LAN IP (`ipconfig` on Windows, IPv4 Address), for example `192.168.1.20`.
3. Copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000/api/v1`.
4. In `backend/.env`, make sure `DJANGO_ALLOWED_HOSTS` includes the LAN IP (or `*` for local development).
5. Start the backend with `python manage.py runserver 0.0.0.0:8000` and the jobs with `python manage.py run_huey`.
6. Run `cd mobile && npx expo start --go`, then scan the QR code with the iPhone Camera app (or Expo Go on Android).
7. Demo accounts after `python manage.py seed_demo`: caregiver `carol`, patient `thomas`,
   password `MindNest-Demo-2026` (fictional data).

The server address can also be changed on the sign-in screen ("Server address") without restarting.

The app reads the backend URL from `EXPO_PUBLIC_API_URL` (for example `http://192.168.1.20:8000/api/v1`).
Use your computer's LAN IP, not `localhost`, because the phone is a separate device.
When the phone first connects, Windows may ask to allow Python through the firewall on private networks; allow it.

### Run the MindNest app build (needed for the "MindNest" wake word)

Expo Go cannot listen for "MindNest" (ADR-0011). Everything else still works in Expo Go.

1. Build the Android development app once (and again after adding native modules):
   `cd mobile && npx eas-cli build --profile development --platform android`. Install the APK from the link EAS prints.
2. Start Metro for it: `npx expo start --dev-client --lan`, then open the MindNest app and pick the server, or scan the QR.
3. Patient app → Settings → "Listen for 'MindNest'" (on by default). Allow the microphone and speech recognition.
4. With the app open, say "MindNest, what do I have today?".

## Secrets

- `backend/.env` is git-ignored. Never commit it.
- `GEMINI_API_KEY` is used on the **free tier**. Google may use free-tier inputs for training and human review,
  so use only synthetic/demo data. Set `LLM_PROVIDER=none` to run with no external AI.
