# Snowcast

Combined backend + frontend repo for the Snowcast app.

## Structure

- `backend/`: Express + Mongo API server.
- `frontend/`: React app (Create React App).

## Local development

```bash
npm install
npm run install:all
npm run dev
```

Frontend runs at `http://localhost:3000`, backend at `http://localhost:3001`.

Auth uses HttpOnly cookies in a same-origin setup. Magic links must point at the backend so `/auth/verify` can set the session cookie before redirecting to the frontend.

To avoid CORS in dev, use the proxy mode:

```bash
npm run dev:proxy
```

## Production build (single server)

```bash
npm run build
npm run start
```

`npm run build` outputs `frontend/build`. The backend server serves that build in production.

Health checks:

- `GET /health` for backend liveness
- `GET /health/frontend` for frontend build availability

## Docker deployment

Create a root `.env` from the example, then build both Docker images:

```bash
cp .env.docker.example .env
docker compose build
```

Start the local stack:

```bash
docker compose up -d
```

Or build and start in one command:

```bash
docker compose up --build -d
```

Useful local commands:

```bash
docker compose logs -f
docker compose ps
docker compose down
docker compose build frontend
docker compose build backend
```

The frontend is served locally at `http://localhost:8021`, and the backend is available locally at `http://localhost:3021`. Compose binds both ports to `127.0.0.1`; point Cloudflared at `http://localhost:8021` only. The frontend container proxies app API paths such as `/auth`, `/weather`, `/locations`, and `/admin.html` to the backend service over Docker networking, so `REACT_APP_BACKEND_URL` should usually stay empty for same-origin deployment.

To migrate data from a cloud MongoDB database into the local Compose MongoDB service:

```bash
CLOUD_DB_URL='mongodb+srv://user:password@example.mongodb.net/' ./scripts/migrate-cloud-mongo-to-local.sh
```

The script migrates the database named by `DB_NAME` in `.env` and restores it into the local `mongo` service. It uses `--drop`, so existing local collections with the same names are replaced.

Weather storage note: backend fetch/backfill jobs store source Open-Meteo model rows and also materialize the default `median` model into the same hourly weather collection. See `backend/README.md` for the storage/read behavior.

For the `snowcast.mikeshen.dev` tunnel, use this shape in `.env`:

```env
BACKEND_URL=https://snowcast.mikeshen.dev
BACKEND_PORT=3021
FRONTEND_URL=https://snowcast.mikeshen.dev
FRONTEND_PORT=8021
CORS_FRONTEND_ORIGINS=http://localhost:8021,https://snowcast.mikeshen.dev
```

Set `BACKEND_ADMIN_ENABLED=true`, `BACKEND_SESSION_SECRET`, `BACKEND_ADMIN_EMAIL`, and the Brevo email variables only when enabling the admin UI.

## Environment notes

- Docker Compose reads `.env` from the repo root.
- `BACKEND_URL` should point to the public frontend origin when the frontend proxy is the only public entrypoint.
- `FRONTEND_URL` should point to the frontend origin for redirects.
- Admin access is controlled by the `isAdmin` flag on the user document; subscription role (free/premium) is derived from `subscriptionExpiresAt`.

## Fresh deploy checklist

1) Start the server.
2) Open `/admin.html`, log in with the bootstrap email (creates the bootstrap admin).
3) In Admin → API Keys, create a key.
4) Add the API key to `frontend/.env` as `REACT_APP_BACKEND_API_KEY`.
5) Seed locations: `node backend/models/seedLocations.js`.
