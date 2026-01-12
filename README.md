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

## Environment notes

- `backend/.env` and `frontend/.env` should exist (see `.sample.env` files).
- `BACKEND_URL` should point to the backend origin (same as the frontend when deployed).
- `FRONTEND_URL` should point to the frontend origin for redirects.
- Admin access is controlled by the `isAdmin` flag on the user document; subscription role (free/premium) is derived from `subscriptionExpiresAt`.

## Fresh deploy checklist

1) Start the server.
2) Open `/admin.html`, log in with the bootstrap email (creates the bootstrap admin).
3) In Admin → API Keys, create a key.
4) Add the API key to `frontend/.env` as `REACT_APP_BACKEND_API_KEY`.
5) Seed locations: `node backend/models/seedLocations.js`.
