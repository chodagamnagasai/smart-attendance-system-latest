# FSD2 Architecture

```text
Browser
  │
  ▼
React + Vite SPA
  │ Axios / JWT / Browser Geolocation
  ▼
Express REST API
  ├── Authentication + role middleware
  ├── Admin / user provisioning
  ├── Location policy
  ├── Subject + enrollment APIs
  └── Attendance + rotating QR APIs
  │
  ▼
MongoDB via Mongoose
  ├── users
  ├── subjects
  ├── enrollments
  ├── attendancesessions
  ├── attendances
  └── settings
```

## Security boundaries
Frontend route protection is only a UX control. Every protected API endpoint validates the JWT and role server-side.

There is no public registration endpoint and no seeded/demo account. The initial admin is created explicitly using the backend CLI bootstrap command.

## Location verification
The browser supplies latitude/longitude after requesting permission. The server loads the administrator's configured attendance location and calculates Haversine distance. Attendance is rejected if the distance is greater than the configured radius.

The submitted coordinates are stored with QR attendance as an audit field (`location.latitude`, `location.longitude`, `location.distanceMeters`). Browser GPS is not a tamper-proof security boundary; production deployments should consider stronger device/identity controls if required.

## Rotating QR
Each attendance session has a start/end time. The QR payload is derived from:

```text
HMAC-SHA256(QR_SECRET, sessionId + ":" + floor(currentTime / 20 seconds))
```

The payload is not a permanent random token. The frontend refreshes the QR every second so the displayed code changes at each 20-second boundary. The API accepts only the current 20-second slot, plus normal session/enrollment checks.
