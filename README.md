# Smart Attendance FSD2 — MongoDB v3.1 (stability fixes)

React + Vite frontend, Express API and MongoDB/Mongoose database.

## Important fixes in this package

- The API client normalizes `VITE_API_URL`: either `https://your-backend.onrender.com` or that URL ending in `/api` is accepted.
- Local development defaults to `http://localhost:5000/api`; production without an env value no longer silently tries localhost.
- CORS supports a comma-separated `CLIENT_URL` allow-list, normalizes trailing slashes, and returns an actionable error when an origin is blocked.
- Login trims/uppercases the user ID, returns clearer invalid-credential messages, and reports database errors separately from incorrect credentials.
- Frontend network, timeout and API URL errors now show actionable messages instead of only “Something went wrong.”
- Attendance date uses `APP_TIME_ZONE` (defaults to `Asia/Kolkata`).
- Empty coordinates are rejected instead of being interpreted as zero.
- The ZIP excludes `node_modules`, `.git`, and real `.env` files.

## Run locally (Windows PowerShell)

1. Extract this ZIP to a new folder.
2. Copy `backend/.env.example` to `backend/.env`.
3. Fill in your real MongoDB Atlas URI, JWT secret and QR secret. Use the same MongoDB URI as your existing deployment if you need the existing accounts/data.
4. From the project root:

   ```powershell
   npm install
   npm run install:all
   npm run dev
   ```

5. Open `http://localhost:5173`.
6. Check backend status at `http://localhost:5000/api/health`. It should return `{"status":"ok","database":"mongodb"}`.

If you use a database with no admin account yet, create one from the project root:

```powershell
npm run create-admin -- --userCode ADMIN001 --name "System Administrator" --email admin@example.com --password "ReplaceWithStrongPassword123"
```

If that ID/email already exists, the script deliberately does not overwrite the account. Use the existing account or choose a new unique ID and email.

## Deploy on Render

For the backend Web Service:

- Root directory: project root (leave blank if this ZIP is the repository root)
- Build command: `npm install && npm --prefix backend install`
- Start command: `npm start`
- Environment variables:
  - `MONGODB_URI`: the correct Atlas connection string, including the database name you intend to use
  - `JWT_SECRET`: random secret of at least 32 characters
  - `QR_SECRET`: a different random secret of at least 32 characters
  - `CLIENT_URL`: exact Vercel origin, e.g. `https://your-frontend.vercel.app` (add other origins separated by commas if needed)
  - `NODE_ENV=production`
  - `APP_TIME_ZONE=Asia/Kolkata`

Wait for the Render service to finish deploying, then open `https://YOUR-BACKEND.onrender.com/api/health`. Do not continue debugging the login form until the health endpoint reports `status: ok` and `database: mongodb`.

## Deploy on Vercel

- Set the Vercel project Root Directory to `frontend`.
- Framework preset: Vite.
- Build command: `npm run build`.
- Output directory: `dist`.
- Add environment variable `VITE_API_URL=https://YOUR-BACKEND.onrender.com/api` for the relevant environment.
- Redeploy after changing environment variables; Vite reads them at build time.

## Login troubleshooting

1. **Health endpoint fails or does not show MongoDB:** fix the Render service startup and `MONGODB_URI` first.
2. **Login says invalid user ID/password/role:** select the correct role tab and verify the account exists in the same MongoDB database configured in the running backend. User IDs are normalized to uppercase.
3. **Browser reports a CORS error:** set `CLIENT_URL` to the exact frontend origin only (scheme + hostname, no path), e.g. `https://your-frontend.vercel.app`. Comma-separated origins are supported.
4. **Browser reports API endpoint not found:** set `VITE_API_URL` to the backend origin plus `/api`, then redeploy Vercel.
5. **Cannot reach backend:** open the health URL directly, check Render logs, and confirm that the Vercel environment variable was applied to the Production environment.

Do not paste or commit `.env` values into chat or source control.

## Existing features

- Strict role-based authentication; no public registration or demo credentials.
- Student/faculty administration and subject enrollment.
- Class and teaching assignments, including restricted special classes.
- QR attendance rotating every 20 seconds, with server-side signature validation.
- Server-side attendance location-radius checks.
- Manual attendance, reports, and MongoDB persistence.

For detailed class/teaching-assignment behavior, see `ARCHITECTURE-CHANGES.md`.
