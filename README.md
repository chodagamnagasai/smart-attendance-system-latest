# Smart Attendance System — FSD2 Production-Style Upgrade

This project is the FSD2 full-stack continuation of the original Smart Attendance frontend. It uses React, Node.js, Express and MongoDB, with server-enforced location validation and rotating QR attendance.

## Stack
- Frontend: React, Vite, React Router, Axios
- Backend: Node.js, Express
- Database: MongoDB via Mongoose
- Authentication: JWT + bcryptjs; no public registration and no seeded/demo users
- QR: `qrcode` generation + `html5-qrcode` scanning
- Security: Helmet, CORS, rate limiting, strict backend role checks, strong-password policy

## New production-style attendance controls
1. **Location-based attendance** — Admin configures latitude, longitude and an allowed radius (10–10,000m). The server calculates Haversine distance and rejects attendance outside the radius.
2. **Dynamic QR** — Faculty attendance QR rotates every 20 seconds. The token is an HMAC-signed, server-verifiable payload; only the current 20-second slot is accepted.
3. **Strict authentication** — No demo accounts and no public registration endpoint. The first admin is created with the secure CLI bootstrap command. Admins create faculty/student accounts.
4. **MongoDB** — SQLite/sql.js has been removed. Use local MongoDB or MongoDB Atlas through `MONGODB_URI`.

## Setup
Requirements: Node.js 20+ recommended and MongoDB 7+ local or MongoDB Atlas.

### 1. Install dependencies
```bash
npm install
npm run install:all
```

### 2. Configure MongoDB and secrets
Copy `backend/.env.example` to `backend/.env` and set:
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/smart_attendance
JWT_SECRET=<random-secret-at-least-32-characters>
QR_SECRET=<different-random-secret-at-least-32-characters>
MONGODB_MAX_POOL_SIZE=10
```
For MongoDB Atlas, replace `MONGODB_URI` with your Atlas connection string.

### 3. Create the first administrator
There are no default credentials. Run:
```bash
npm --prefix backend run create-admin -- --userCode ADMIN001 --name "System Administrator" --email admin@example.com --password "StrongPassword123"
```
Use your own strong password. The command creates only an admin account; no students, faculty, subjects or attendance are seeded.

### 4. Start the application
```bash
npm run dev
```
Frontend: http://localhost:5173
API: http://localhost:5000/api

## First-time workflow
1. Log in as the administrator.
2. Open **Location** and configure the college/classroom latitude, longitude and radius.
3. Create faculty and student accounts with strong passwords.
4. Create subjects and enroll students.
5. Faculty starts a QR session. The QR automatically rotates every 20 seconds.
6. Students enable browser location and scan the current QR.
7. The API verifies authentication, enrollment, QR signature/current 20-second slot, session expiry and location radius before inserting attendance.

## Production deployment notes
- Use MongoDB Atlas or a managed MongoDB cluster with authentication, TLS and backups.
- Serve the frontend/API over HTTPS; browser geolocation requires a secure context in production.
- Store `JWT_SECRET`, `QR_SECRET` and MongoDB credentials in a secret manager, not source control.
- Set an exact production `CLIENT_URL` instead of `*`.
- Consider HttpOnly secure cookies/refresh-token rotation, audit logs, account lockout/MFA and institution SSO for a larger deployment.
