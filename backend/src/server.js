import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import mongoose from 'mongoose';
import { initDb, User, Subject, Enrollment, AttendanceSession, Attendance, Setting } from './db.js';

const app = express();
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET;
const QR_SECRET = process.env.QR_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const QR_INTERVAL_MS = 20_000;

if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters long.');
if (!QR_SECRET || QR_SECRET.length < 32) throw new Error('QR_SECRET must be set and at least 32 characters long.');

await initDb();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

const safeUser = u => ({ id: String(u._id), userCode: u.userCode, name: u.name, email: u.email, role: u.role, department: u.department, semester: u.semester });
const sign = u => jwt.sign({ id: String(u._id), role: u.role, userCode: u.userCode, name: u.name }, JWT_SECRET, { expiresIn: '8h', issuer: 'smart-attendance' });
const today = () => new Date().toISOString().slice(0, 10);
const oid = id => mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { issuer: 'smart-attendance' });
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired. Please login again.' });
  }
}
const roles = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission for this action' });
const validCredentials = (userCode, password) => typeof userCode === 'string' && /^[A-Za-z0-9._-]{3,50}$/.test(userCode) && typeof password === 'string';
const validPassword = password => typeof password === 'string' && password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function validateCoordinates(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 && Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180;
}

async function getLocationConfig() {
  const setting = await Setting.findOne({ key: 'attendanceLocation' }).lean();
  return setting?.value || null;
}

function qrSlot(now = Date.now()) { return Math.floor(now / QR_INTERVAL_MS); }
function qrSignature(sessionId, slot) {
  return crypto.createHmac('sha256', QR_SECRET).update(`${sessionId}:${slot}`).digest('base64url');
}
function qrPayload(sessionId, now = Date.now()) {
  const slot = qrSlot(now);
  return `SMARTATTENDANCE:v2:${sessionId}:${slot}:${qrSignature(sessionId, slot)}`;
}
function parseQr(payload) {
  const parts = String(payload || '').trim().split(':');
  if (parts.length !== 5 || parts[0] !== 'SMARTATTENDANCE' || parts[1] !== 'v2') return null;
  const [,, sessionId, slotText, signature] = parts;
  if (!mongoose.isValidObjectId(sessionId) || !/^\d+$/.test(slotText)) return null;
  const slot = Number(slotText);
  const expected = Buffer.from(qrSignature(sessionId, slot));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  return { sessionId, slot };
}
async function buildQr(session) {
  const now = Date.now();
  const slot = qrSlot(now);
  const payload = `SMARTATTENDANCE:v2:${String(session._id)}:${slot}:${qrSignature(String(session._id), slot)}`;
  const nextRotationAt = (slot + 1) * QR_INTERVAL_MS;
  return {
    qrData: payload,
    qrDataUrl: await QRCode.toDataURL(payload, { width: 360, margin: 2, errorCorrectionLevel: 'M' }),
    slot,
    nextRotationAt: new Date(nextRotationAt).toISOString(),
    validForSeconds: Math.max(0, Math.ceil((nextRotationAt - now) / 1000))
  };
}

app.get('/api/health', (_, res) => res.json({ status: 'ok', service: 'smart-attendance-api', database: mongoose.connection.readyState === 1 ? 'mongodb' : 'disconnected' }));

// Strict authentication: there is intentionally no public registration endpoint.
app.post('/api/auth/login', async (req, res) => {
  const { userCode, password, role } = req.body || {};
  if (!validCredentials(userCode, password) || !['admin', 'faculty', 'student'].includes(role)) return res.status(401).json({ message: 'Invalid credentials' });
  const user = await User.findOne({ userCode: String(userCode).toUpperCase(), role });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Invalid credentials' });
  res.json({ token: sign(user), user: safeUser(user) });
});
app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ message: 'Account no longer exists' });
  res.json({ user: safeUser(user) });
});

app.get('/api/dashboard/summary', auth, async (req, res) => {
  if (req.user.role === 'student') {
    const enrollments = await Enrollment.find({ studentId: req.user.id }).lean();
    const subjectIds = enrollments.map(x => x.subjectId);
    const subjects = await Subject.find({ _id: { $in: subjectIds } }).lean();
    const attendance = await Attendance.find({ studentId: req.user.id, subjectId: { $in: subjectIds } }).lean();
    const rows = subjects.map(s => {
      const a = attendance.filter(x => String(x.subjectId) === String(s._id));
      const present = a.filter(x => x.status === 'present').length;
      return { id: String(s._id), code: s.code, name: s.name, marked: a.length, total: a.length, present, percentage: a.length ? Math.round(present / a.length * 100) : 0 };
    });
    return res.json({ role: 'student', subjects: rows.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  if (req.user.role === 'faculty') {
    const subjects = await Subject.find({ facultyId: req.user.id }).sort({ name: 1 }).lean();
    const subjectIds = subjects.map(x => x._id);
    const enrollments = await Enrollment.find({ subjectId: { $in: subjectIds } }).lean();
    const todayCount = await Attendance.countDocuments({ subjectId: { $in: subjectIds }, attendanceDate: today(), status: 'present' });
    return res.json({ role: 'faculty', subjects: subjects.map(s => ({ id: String(s._id), code: s.code, name: s.name })), totalStudents: new Set(enrollments.map(e => String(e.studentId))).size, todayPresent: todayCount });
  }
  res.json({ role: 'admin', students: await User.countDocuments({ role: 'student' }), faculty: await User.countDocuments({ role: 'faculty' }), subjects: await Subject.countDocuments(), attendance: await Attendance.countDocuments() });
});

app.get('/api/settings/location', auth, roles('admin'), async (_, res) => res.json(await getLocationConfig()));
app.put('/api/settings/location', auth, roles('admin'), async (req, res) => {
  const { latitude, longitude, radiusMeters } = req.body || {};
  if (!validateCoordinates(latitude, longitude) || !Number.isFinite(Number(radiusMeters)) || Number(radiusMeters) < 10 || Number(radiusMeters) > 10000) return res.status(400).json({ message: 'Provide valid coordinates and a radius between 10 and 10,000 meters.' });
  const value = { latitude: Number(latitude), longitude: Number(longitude), radiusMeters: Number(radiusMeters) };
  await Setting.findOneAndUpdate({ key: 'attendanceLocation' }, { value, updatedBy: req.user.id }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.json(value);
});

app.get('/api/students', auth, roles('admin', 'faculty'), async (_, res) => {
  const students = await User.find({ role: 'student' }).sort({ name: 1 }).lean();
  const counts = await Enrollment.aggregate([{ $match: { studentId: { $in: students.map(s => s._id) } } }, { $group: { _id: '$studentId', count: { $sum: 1 } } }]);
  const map = new Map(counts.map(x => [String(x._id), x.count]));
  res.json(students.map(s => ({ ...safeUser(s), subjects: map.get(String(s._id)) || 0 })));
});

async function createUser(req, res, role) {
  const { userCode, name, email, password, department = '', semester = null } = req.body || {};
  if (!userCode || !name || !email || !validPassword(password)) return res.status(400).json({ message: 'User ID, name, email and a strong password are required. Password must be 12+ characters with upper/lowercase letters and a number.' });
  try {
    const user = await User.create({ userCode, name, email, passwordHash: await bcrypt.hash(password, 12), role, department, semester: semester === '' ? null : Number(semester) });
    res.status(201).json({ user: safeUser(user) });
  } catch (e) {
    res.status(e?.code === 11000 ? 409 : 400).json({ message: e?.code === 11000 ? 'User ID or email already exists' : 'Unable to create account' });
  }
}
app.post('/api/students', auth, roles('admin'), (req, res) => createUser(req, res, 'student'));
app.put('/api/students/:id', auth, roles('admin'), async (req, res) => {
  const { name, email, department = '', semester = null } = req.body || {};
  const user = await User.findOneAndUpdate({ _id: req.params.id, role: 'student' }, { name, email, department, semester: semester === '' ? null : Number(semester) }, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ message: 'Student not found' });
  res.json({ user: safeUser(user) });
});
app.delete('/api/students/:id', auth, roles('admin'), async (req, res) => { await User.deleteOne({ _id: req.params.id, role: 'student' }); await Enrollment.deleteMany({ studentId: req.params.id }); res.json({ message: 'Student deleted' }); });

app.get('/api/faculty', auth, roles('admin'), async (_, res) => res.json((await User.find({ role: 'faculty' }).sort({ name: 1 }).lean()).map(safeUser)));
app.post('/api/faculty', auth, roles('admin'), (req, res) => createUser(req, res, 'faculty'));
app.delete('/api/faculty/:id', auth, roles('admin'), async (req, res) => { await Subject.deleteMany({ facultyId: req.params.id }); await User.deleteOne({ _id: req.params.id, role: 'faculty' }); res.json({ message: 'Faculty deleted' }); });

app.get('/api/subjects', auth, async (req, res) => {
  let subjectFilter = {};
  if (req.user.role === 'faculty') subjectFilter.facultyId = req.user.id;
  if (req.user.role === 'student') {
    const e = await Enrollment.find({ studentId: req.user.id }).lean();
    subjectFilter._id = { $in: e.map(x => x.subjectId) };
  }
  const rows = await Subject.find(subjectFilter).populate('facultyId', 'name').sort({ name: 1 }).lean();
  res.json(rows.map(s => ({ ...s, id: String(s._id), facultyName: s.facultyId?.name || '', facultyId: String(s.facultyId?._id || s.facultyId) })));
});
app.post('/api/subjects', auth, roles('admin'), async (req, res) => {
  const { code, name, facultyId, semester, department = '' } = req.body || {};
  if (!code || !name || !oid(facultyId) || !Number.isInteger(Number(semester))) return res.status(400).json({ message: 'Code, name, faculty and semester are required' });
  try { const s = await Subject.create({ code, name, facultyId, semester: Number(semester), department }); res.status(201).json({ id: String(s._id) }); }
  catch (e) { res.status(e?.code === 11000 ? 409 : 400).json({ message: e?.code === 11000 ? 'Subject code already exists' : 'Unable to create subject' }); }
});
app.put('/api/subjects/:id', auth, roles('admin'), async (req, res) => { const { code, name, facultyId, semester, department = '' } = req.body || {}; const s = await Subject.findByIdAndUpdate(req.params.id, { code, name, facultyId, semester: Number(semester), department }, { new: true, runValidators: true }); if (!s) return res.status(404).json({ message: 'Subject not found' }); res.json({ message: 'Subject updated' }); });
app.delete('/api/subjects/:id', auth, roles('admin'), async (req, res) => { await Enrollment.deleteMany({ subjectId: req.params.id }); await Attendance.deleteMany({ subjectId: req.params.id }); await AttendanceSession.deleteMany({ subjectId: req.params.id }); await Subject.deleteOne({ _id: req.params.id }); res.json({ message: 'Subject deleted' }); });
app.post('/api/subjects/:id/enroll', auth, roles('admin'), async (req, res) => { if (!oid(req.body.studentId)) return res.status(400).json({ message: 'Invalid student' }); const student = await User.findOne({ _id: req.body.studentId, role: 'student' }); if (!student) return res.status(404).json({ message: 'Student not found' }); try { await Enrollment.create({ studentId: req.body.studentId, subjectId: req.params.id }); } catch (e) { if (e?.code !== 11000) return res.status(400).json({ message: 'Unable to enroll student' }); } res.json({ message: 'Student enrolled' }); });

async function requireLocation(req, res) {
  const { latitude, longitude } = req.body || {};
  if (!validateCoordinates(latitude, longitude)) { res.status(400).json({ message: 'Location permission is required. Please enable GPS/location access.' }); return null; }
  const config = await getLocationConfig();
  if (!config || !Number.isFinite(Number(config.latitude)) || !Number.isFinite(Number(config.longitude)) || !Number.isFinite(Number(config.radiusMeters))) { res.status(503).json({ message: 'Attendance location has not been configured by the administrator.' }); return null; }
  const distance = distanceMeters(config.latitude, config.longitude, Number(latitude), Number(longitude));
  if (distance > config.radiusMeters) { res.status(403).json({ message: `You are outside the allowed attendance area (${Math.round(distance)}m away; limit ${config.radiusMeters}m).` }); return null; }
  return { latitude: Number(latitude), longitude: Number(longitude), distanceMeters: Math.round(distance) };
}

app.post('/api/attendance/sessions', auth, roles('faculty'), async (req, res) => {
  const { subjectId, durationMinutes = 5 } = req.body || {};
  if (!oid(subjectId)) return res.status(400).json({ message: 'Invalid subject' });
  const subject = await Subject.findOne({ _id: subjectId, facultyId: req.user.id });
  if (!subject) return res.status(404).json({ message: 'Subject not found or not assigned to you' });
  await AttendanceSession.updateMany({ facultyId: req.user.id, status: 'active' }, { $set: { status: 'closed' } });
  const now = new Date();
  const expires = new Date(now.getTime() + Math.max(1, Math.min(30, Number(durationMinutes))) * 60_000);
  const session = await AttendanceSession.create({ subjectId: subject._id, facultyId: req.user.id, startsAt: now, expiresAt: expires, status: 'active' });
  const qr = await buildQr(session);
  res.status(201).json({ id: String(session._id), subject: { id: String(subject._id), code: subject.code, name: subject.name }, startsAt: now.toISOString(), expiresAt: expires.toISOString(), ...qr });
});
app.post('/api/attendance/sessions/:id/close', auth, roles('faculty'), async (req, res) => { await AttendanceSession.updateOne({ _id: req.params.id, facultyId: req.user.id }, { $set: { status: 'closed' } }); res.json({ message: 'Session closed' }); });
app.get('/api/attendance/sessions/:id/qr', auth, roles('faculty'), async (req, res) => {
  const session = await AttendanceSession.findOne({ _id: req.params.id, facultyId: req.user.id, status: 'active' });
  if (!session || session.expiresAt <= new Date()) return res.status(410).json({ message: 'Attendance session has expired or is closed' });
  res.json(await buildQr(session));
});
app.get('/api/attendance/sessions/active', auth, roles('faculty'), async (req, res) => { const sessions = await AttendanceSession.find({ facultyId: req.user.id, status: 'active', expiresAt: { $gt: new Date() } }).populate('subjectId', 'code name').sort({ createdAt: -1 }).lean(); res.json(sessions.map(s => ({ id: String(s._id), startsAt: s.startsAt, expiresAt: s.expiresAt, status: s.status, code: s.subjectId.code, name: s.subjectId.name }))); });

app.post('/api/attendance/mark', auth, roles('student'), async (req, res) => {
  const location = await requireLocation(req, res); if (!location) return;
  const parsed = parseQr(req.body.token); if (!parsed) return res.status(400).json({ message: 'Invalid QR code' });
  if (parsed.slot !== qrSlot()) return res.status(410).json({ message: 'This QR code has expired. Please scan the latest QR code.' });
  const session = await AttendanceSession.findOne({ _id: parsed.sessionId, status: 'active' }).populate('subjectId', 'name code');
  if (!session) return res.status(404).json({ message: 'Invalid or closed QR session' });
  if (session.expiresAt <= new Date()) return res.status(410).json({ message: 'Attendance session has expired' });
  const enrolled = await Enrollment.exists({ studentId: req.user.id, subjectId: session.subjectId._id });
  if (!enrolled) return res.status(403).json({ message: 'You are not enrolled in this subject' });
  try {
    await Attendance.create({ sessionId: session._id, studentId: req.user.id, subjectId: session.subjectId._id, attendanceDate: today(), status: 'present', method: 'qr', location });
    res.json({ message: `Attendance marked for ${session.subjectId.name}`, distanceMeters: location.distanceMeters });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: 'Attendance is already marked for this subject today' });
    throw e;
  }
});

app.post('/api/attendance/manual', auth, roles('faculty'), async (req, res) => {
  const { studentId, subjectId, date = today(), status = 'present' } = req.body || {};
  if (!['present', 'absent', 'late'].includes(status)) return res.status(400).json({ message: 'Invalid attendance status' });
  const subject = await Subject.findOne({ _id: subjectId, facultyId: req.user.id });
  if (!subject) return res.status(403).json({ message: 'Subject not assigned to you' });
  const student = await User.findOne({ _id: studentId, role: 'student' });
  if (!student || !(await Enrollment.exists({ studentId, subjectId }))) return res.status(400).json({ message: 'Student is not enrolled in this subject' });
  await Attendance.findOneAndUpdate({ studentId, subjectId, attendanceDate: date }, { sessionId: null, status, method: 'manual', markedAt: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.json({ message: 'Attendance updated' });
});

app.get('/api/attendance/my', auth, roles('student'), async (req, res) => { const rows = await Attendance.find({ studentId: req.user.id }).populate('subjectId', 'code name').sort({ attendanceDate: -1, markedAt: -1 }).lean(); res.json(rows.map(r => ({ id: String(r._id), date: r.attendanceDate, markedAt: r.markedAt, status: r.status, method: r.method, subjectCode: r.subjectId.code, subjectName: r.subjectId.name }))); });
app.get('/api/attendance/percentage', auth, roles('student'), async (req, res) => { const e = await Enrollment.find({ studentId: req.user.id }).lean(); const subjects = await Subject.find({ _id: { $in: e.map(x => x.subjectId) } }).lean(); const all = await Attendance.find({ studentId: req.user.id }).lean(); res.json(subjects.map(s => { const a = all.filter(x => String(x.subjectId) === String(s._id)); const present = a.filter(x => x.status === 'present').length; return { id: String(s._id), code: s.code, name: s.name, total: a.length, present, absent: a.filter(x => x.status === 'absent').length, late: a.filter(x => x.status === 'late').length, percentage: a.length ? Math.round(present / a.length * 100) : 0 }; })); });
app.get('/api/attendance/report', auth, roles('faculty', 'admin'), async (req, res) => {
  const subjectFilter = req.query.subjectId && oid(req.query.subjectId) ? { _id: req.query.subjectId } : {};
  const subjects = await Subject.find(req.user.role === 'faculty' ? { facultyId: req.user.id, ...subjectFilter } : subjectFilter).lean();
  const subjectIds = subjects.map(s => s._id); const enrollments = await Enrollment.find({ subjectId: { $in: subjectIds } }).lean(); const studentIds = enrollments.map(e => e.studentId); const students = await User.find({ _id: { $in: studentIds }, role: 'student' }).lean(); const attendance = await Attendance.find({ subjectId: { $in: subjectIds } }).lean();
  const rows = [];
  for (const s of subjects) for (const e of enrollments.filter(x => String(x.subjectId) === String(s._id))) { const u = students.find(x => String(x._id) === String(e.studentId)); if (!u) continue; const a = attendance.filter(x => String(x.subjectId) === String(s._id) && String(x.studentId) === String(u._id)); const present = a.filter(x => x.status === 'present').length; rows.push({ studentId: String(u._id), userCode: u.userCode, studentName: u.name, subjectCode: s.code, subjectName: s.name, total: a.length, present, absent: a.filter(x => x.status === 'absent').length, late: a.filter(x => x.status === 'late').length, percentage: a.length ? Math.round(present / a.length * 100) : 0 }); }
  rows.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode) || a.studentName.localeCompare(b.studentName)); res.json(rows);
});

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ message: 'Internal server error' }); });
app.listen(PORT, () => console.log(`Smart Attendance API running at http://localhost:${PORT}`));
