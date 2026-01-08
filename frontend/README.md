# Snowcast Frontend

Responsive frontend for ski resort weather forecasts. Built with Create React App and designed to consume the `weather-backend` API.

## Requirements

- Node.js 18+
- Backend running (local or deployed)

## Environment

Create a `.env` using `.sample.env` as a template.

Required:

- `REACT_APP_BACKEND_URL` - base URL for the backend (e.g. `http://localhost:3001` or `https://<backend>.onrender.com`)

Optional:

- `REACT_APP_BACKEND_API_KEY` - API key for unauthenticated requests (sent as `x-api-key`).

## Local Development

```bash
npm install
npm start
```

The app runs at `http://localhost:3000`.

If you are running the backend locally and want to avoid CORS, use the root proxy script:

```bash
npm run dev:proxy
```

## Build

```bash
npm run build
```

Output goes to `build/`.

## Deploy on Render (Single Service)

Deploy as a single web service that runs the backend and serves the frontend build output.
Use the root scripts for build and start.

## Backend Configuration (CORS + Magic Link)

For magic-link auth to work in production:

- Backend CORS must allow the frontend origin (only if you run the frontend on a different origin in dev).
- `BACKEND_URL` should point to the backend base URL (so the link hits `/auth/verify` on the backend).
- `FRONTEND_URL` should point to the frontend base URL (where the backend redirects after verification).
- `FRONTEND_COOKIE_SECURE=true` for https deployments.

If you see a CORS error like:
`Access-Control-Allow-Origin missing`, update the backend allowlist to include your frontend URL and redeploy the backend.
