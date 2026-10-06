# Smart Attendance FSD2 — MongoDB v3.1

This version adds production-oriented administration and enrollment workflows while keeping the existing React/Vite + Express/Node.js + MongoDB architecture.

## Changes in v3.1

- Student accounts: editable name, email, department, batch and class; optional password change.
- Faculty accounts: editable name, email, department; optional password change; no semester.
- Password policy reduced to minimum 8 characters.
- Department is a controlled dropdown backed by a shared server-side list.
- Student class sections are controlled values (A–F) and can be used for bulk enrollment.
- Subjects require department first; only faculty from that department can be selected.
- Semester remains a subject property. It is removed from student and faculty profiles.
- Admin has a dedicated manual attendance page.
- Subject enrollment supports individual student or entire class (department + batch + class).
- MongoDB remains the only application database.

## Existing MongoDB data

Older records may still contain the old `semester` field on users. The new application ignores it. Existing students without `batch`/`classSection` should be edited by an administrator before using whole-class enrollment. Existing departments must match the controlled department list before an account is edited.

## First admin

```powershell
npm --prefix backend run create-admin -- --userCode ADMIN001 --name "System Administrator" --email admin@example.com --password "StrongPass123"
```

Password must contain at least 8 characters.

## Run

```powershell
npm install
npm run install:all
npm run dev
```

Configure `backend/.env` with `MONGODB_URI`, `JWT_SECRET`, `QR_SECRET`, `PORT`, and `CLIENT_URL`.
