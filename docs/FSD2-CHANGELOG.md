# FSD1 → FSD2 changes

| FSD1 | FSD2 |
|---|---|
| Static HTML pages | React single-page application |
| CSS + one global JS file | Reusable React components + state |
| localStorage mock login | JWT authentication + bcrypt password hashing |
| Browser-only role check | Backend role-based authorization |
| Fake QR generation | Server-created expiring QR sessions |
| Fake attendance toast | Persistent SQLite attendance records |
| Placeholder reports | API-backed attendance analytics |
| Static management pages | Admin CRUD APIs and forms |
| No backend | Node.js + Express REST API |
| No database | SQLite with users, subjects, enrollment and attendance tables |

## What remains from FSD1

The original project is preserved under `docs/fsd1-original/` for submission/demo comparison. The React application intentionally retains the original Smart Attendance concept, roles and major screens while replacing the mock behavior with working full-stack functionality.
