# CA Mentor Backend

Express + MongoDB backend for CA Mentor, prepared for deployment on Render.

## Scripts

```bash
npm install
npm run dev
npm start
```

## Required Environment Variables

Copy `.env.example` to `.env` for local development, then configure the same values in Render:

```bash
cp .env.example .env
```

Required:

- `MONGO_URI`
- `JWT_SECRET`

Common production values:

- `NODE_ENV=production`
- `PORT=10000` on Render is provided automatically, so you do not need to hardcode it
- `ALLOWED_ORIGINS=https://camentor.vercel.app`
- `TRUST_PROXY=1`

Optional AI integration:

- `GEMINI_API_KEY`
- `GEMINI_API_VERSION`
- `GEMINI_MODEL`
- `GEMINI_MAX_OUTPUT_TOKENS`

## Render Deployment

Use the included [render.yaml](/Users/admin/Desktop/vs%20code%20/ca-mentor/camentor-backend/render.yaml) or create a Web Service manually with:

- Root directory: `camentor-backend`
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/healthz`

After deploy, set `ALLOWED_ORIGINS` to `https://camentor.vercel.app` and any custom domain you attach.

## Health Check

- `GET /healthz` returns a deployment-friendly JSON status payload
- `GET /` returns a small service status response
