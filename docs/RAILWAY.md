# Deploy Arlo to Railway + test in Zoom Marketplace

This guide assumes **GitHub** for source control, **Railway** for hosting, **Neon** (or any Postgres) for `DATABASE_URL`, and a **Zoom Marketplace** app already created.

## Architecture

| Piece | Railway |
|--------|---------|
| **Web** | One service built from the repo root `Dockerfile`: Express API + static CRA app on **one HTTPS URL** (required for Zoom Home URL and cookies). |
| **RTMS** | Optional **second** service using `rtms/` as the root directory and `rtms/Dockerfile` (Linux `amd64`). Receives forwarded webhooks from the backend. |

Zoom sends webhooks to **`https://<your-web-domain>/api/rtms/webhook`**. The backend validates and forwards to the RTMS service using `RTMS_SERVICE_URL`.

---

## 1. Push to GitHub

1. Create a **new empty** repository on GitHub (no README if you will push an existing tree).
2. From the project root:

```bash
git init
git add .
git commit -m "Initial commit: Arlo Meeting Assistant"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Do **not** commit `.env`. It is listed in `.gitignore`.

---

## 2. Railway — Web service (API + frontend)

1. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub** → select the repo.
2. Railway should detect `railway.toml` and build with the root **`Dockerfile`**.
3. **Generate a public domain**: Service → **Settings** → **Networking** → **Generate domain** (HTTPS).
4. Set **Variables** (minimum):

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Neon connection string (`?sslmode=require` as needed). |
| `PUBLIC_URL` | `https://<your-railway-domain>` (no trailing slash). |
| `SESSION_SECRET` | 64 hex chars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `REDIS_ENCRYPTION_KEY` | 32 hex chars: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `ZOOM_CLIENT_ID` | Zoom Marketplace → App Credentials. |
| `ZOOM_CLIENT_SECRET` | Same. |
| `ZOOM_APP_ID` | From app page URL path on Marketplace (optional but used for auto-open). |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | `https://<your-railway-domain>,http://localhost:3001` |

Optional: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `AI_ENABLED=true`, etc. (see `.env.example`).

5. **RTMS forwarding** (if you run the RTMS service below):

| Variable | Value |
|----------|--------|
| `RTMS_SERVICE_URL` | Internal URL to the RTMS service, e.g. `http://<rtms-service-name>.railway.internal:3002` (see Railway private networking docs). |

6. Redeploy and open **`https://<domain>/health`** — expect JSON `status: "ok"`.
7. Open **`https://<domain>/`** — the Zoom app UI should load (same origin as `/api`).

---

## 3. Railway — RTMS service (optional but needed for live RTMS transcripts)

1. In the same project: **New service** → **GitHub repo** (same repo).
2. **Settings** → set **Root directory** to `rtms`.
3. Dockerfile path: `Dockerfile` (under `rtms/`).
4. **Variables** (examples — align with your Web service):

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Same as Web (Neon). |
| `ZOOM_CLIENT_ID` | Same as Web. |
| `ZOOM_CLIENT_SECRET` | Same as Web. |
| `BACKEND_URL` | Internal Web URL, e.g. `http://<web-service-name>.railway.internal:3000` (use the port Railway assigns if not 3000). |
| `ZM_RTMS_CLIENT` | Same as `ZOOM_CLIENT_ID`. |
| `ZM_RTMS_SECRET` | Same as `ZOOM_CLIENT_SECRET`. |

5. Ensure the Web service’s `RTMS_SERVICE_URL` points at this RTMS service’s **internal** host and port **3002**.

RTMS uses native bindings; Railway’s builder should use **linux/amd64** (the repo `docker-compose` already sets `platform: linux/amd64` for RTMS).

---

## 4. Zoom Marketplace (test / production)

1. **Home URL**: `https://<your-railway-domain>/`  
2. **OAuth Redirect URL**: `https://<your-railway-domain>/api/auth/callback`  
3. **Domain allowlist**: include `appssdk.zoom.us` (see project `CLAUDE.md`).  
4. **Event subscription endpoint** (RTMS): `https://<your-railway-domain>/api/rtms/webhook`  
5. Subscribe to **`meeting.rtms_started`** and **`meeting.rtms_stopped`** (and complete Zoom’s RTMS approval if required).  
6. Save and wait for Zoom to propagate changes.

Use **Open** in a real Zoom meeting to test the in-meeting app.

---

## Troubleshooting

- **502 / empty app**: Check Web deploy logs; confirm `SERVE_FRONTEND_STATIC=true` is set by the `Dockerfile` and the image built the `frontend/build` folder.
- **Database errors**: Confirm `DATABASE_URL` and that `prisma db push` ran (see startup logs).
- **OAuth redirect mismatch**: `PUBLIC_URL` and Zoom **Redirect URL** must match exactly (https, no wrong host).
- **Cookies / login**: `NODE_ENV=production` and `trust proxy` are set for HTTPS; ensure you use the Railway HTTPS URL, not http.
