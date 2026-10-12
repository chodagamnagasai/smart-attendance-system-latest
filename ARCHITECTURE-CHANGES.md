# Smart Attendance — class-based teaching architecture

## What's changed

- A subject can have multiple faculty members (`Subject.facultyIds`). The previous `facultyId` field is retained for existing database records and compatibility.
- Added `AcademicClass`: department, batch, section, semester, and roster of students.
- Added `TeachingAssignment`: assigns a subject to a class with one or more faculty members.
- Added **regular** assignments (all students in the class) and **special** assignments (selected students only, with a title).
- Added an admin page at `/admin/classes` to create classes and teaching assignments.
- Faculty can select their assignment when creating a rotating QR attendance session. The server stores the allowed roster on that session and rejects students outside a special-class roster.
- Existing enrollments and historical attendance records are preserved.

## How to use

1. Start the backend and frontend as usual.
2. Sign in as an administrator.
3. Create student accounts first, including department, batch, and section.
4. Create subjects and select one or more faculty members (hold Ctrl while selecting multiple options on Windows).
5. Open **Classes & Assignments** in the admin sidebar. Create a class. If no roster is manually selected, all existing students matching its department, batch, and section are added automatically.
6. Assign a subject and one or more faculty members to the class.
7. For a special class, select **Special class**, provide a title, and select only the students who should be allowed to attend.
8. Sign in as one of the assigned faculty members, open **Generate QR**, select the relevant assignment, and start the session.

## Notes

- The class and subject must match on department and semester.
- Students chosen for a special class must belong to the selected class roster.
- Special-class QR sessions are restricted on the server, not just in the UI.
- Existing subjects with only the old `facultyId` remain readable. Newly created subjects store both `facultyId` (primary faculty) and `facultyIds` (full team).
- This package intentionally excludes `node_modules` and `.git`. Run `npm install` at the project root, then `npm --prefix backend install` and `npm --prefix frontend install` if needed.
