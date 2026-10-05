# Smart Attendance System — FSD2

A continuation of the FSD1 Smart Attendance frontend. FSD2 converts the static HTML/CSS/JS prototype into a full-stack application using React, Node.js, Express and SQLite.

## Technology stack

- Frontend: React, Vite, React Router, Axios
- Backend: Node.js, Express
- Database: SQLite using sql.js (WebAssembly, no native C++ build required)
- Authentication: JWT + bcryptjs
- QR: qrcode for generation and html5-qrcode for browser scanning
- Security basics: Helmet, CORS, rate limiting, server-side role checks

## Project structure

```text
smart-attendance-fsd2/
├── frontend/          # React/Vite SPA
├── backend/           # Express REST API + SQLite
├── package.json       # root scripts
└── README.md
```

## Run locally

Requirements: Node.js 18+ (Node.js 20/22 LTS is recommended for classroom projects; Node.js 26 is also supported by this dependency set).

```bash
npm install
npm run install:all
npm run dev
```

Frontend: http://localhost:5173
API: http://localhost:5000/api

The backend creates `backend/data/attendance.db` automatically on first run. The SQLite database is handled through sql.js/WebAssembly, so Windows does not need Visual Studio C++ build tools or node-gyp for this project.

## Demo accounts

All demo passwords: `Password@123`

- Admin: `admin001`
- Faculty: `faculty001`
- Student: `student001`

A seeded faculty subject and student are also created automatically.

## Main FSD2 flows

1. Login using the backend authentication API.
2. Faculty creates a live attendance session for a subject.
3. Backend creates a short-lived QR token for that session.
4. Student scans the QR code or enters the token.
5. Backend validates the token, session expiry and student enrollment before recording attendance.
6. Faculty can manually override attendance and view reports.
7. Admin can manage students, faculty and subjects.
8. Student can view attendance history and subject-wise percentages.

## API overview

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/dashboard/summary`
- `GET/POST/PUT/DELETE /api/students`
- `GET/POST/PUT/DELETE /api/faculty`
- `GET/POST/PUT/DELETE /api/subjects`
- `POST /api/attendance/sessions`
- `GET /api/attendance/sessions/active`
- `POST /api/attendance/mark`
- `POST /api/attendance/manual`
- `GET /api/attendance/my`
- `GET /api/attendance/report`
- `GET /api/attendance/percentage`

## Production note

For a real college deployment, move SQLite to PostgreSQL/MySQL, store JWT secrets in a secret manager, serve over HTTPS, add refresh-token/session management, audit logging and institution SSO.
