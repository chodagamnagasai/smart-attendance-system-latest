# FSD2 Architecture

```text
Browser
  │
  ▼
React + Vite SPA
  │ Axios / JWT
  ▼
Express REST API
  ├── Authentication / Role middleware
  ├── Student APIs
  ├── Faculty APIs
  ├── Subject APIs
  └── Attendance + QR APIs
  │
  ▼
SQLite database
  ├── users
  ├── subjects
  ├── enrollments
  ├── attendance_sessions
  └── attendance
```

## Why this stack?

- **React** replaces the FSD1 static HTML pages with reusable components, routing and state-driven UI.
- **Vite** gives fast development and a simple production build.
- **Node.js + Express** provides the server-side REST API taught in FSD2.
- **SQLite** is appropriate for a college project because it persists data without requiring a separate database server.
- **JWT + bcrypt** demonstrates real authentication instead of FSD1's localStorage-only mock login.
- **QR sessions** are created on the server and expire automatically, preventing a permanent static attendance QR.

## Request flow

### Student QR attendance

1. Faculty logs in.
2. Faculty selects a subject and creates a session.
3. Express generates a cryptographically random token and stores its expiry.
4. The server returns a QR data URL.
5. Student scans the QR.
6. React sends the token with the student's JWT.
7. Express verifies the token, session status, expiry and enrollment.
8. A unique daily attendance record is inserted.

### Security boundaries

Authentication and role checks are enforced on the backend. Frontend route guards are only for user experience; they are not treated as security controls.
