# FSD2 Changelog

## 3.0.0 — MongoDB + secure attendance controls
- Replaced SQLite/sql.js with MongoDB + Mongoose.
- Removed seeded/demo users and public registration.
- Added secure admin bootstrap CLI.
- Added strong password validation for provisioned accounts.
- Added administrator-controlled attendance latitude/longitude/radius.
- Added server-side Haversine location enforcement.
- Added signed 20-second rotating QR payloads.
- Added browser geolocation requirement for student QR attendance.
- Added attendance-location audit data to QR attendance records.
- Preserved the existing React application structure and visual theme where practical.
