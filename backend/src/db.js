import mongoose from 'mongoose';

export const DEPARTMENTS = [
  'Computer Science',
  'Information Technology',
  'Electronics and Communication',
  'Electrical and Electronics',
  'Mechanical',
  'Civil',
  'Artificial Intelligence and Data Science'
];
export const CLASS_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];

const userSchema = new mongoose.Schema({
  userCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'faculty', 'student'], required: true },
  department: { type: String, enum: DEPARTMENTS, default: undefined },
  batch: { type: String, default: '', trim: true },
  classSection: { type: String, enum: CLASS_SECTIONS, default: undefined },
  academicClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicClass', default: null }
}, { timestamps: true });
userSchema.index({ role: 1, department: 1, batch: 1, classSection: 1 });

const subjectSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  department: { type: String, enum: DEPARTMENTS, required: true },
  // facultyId retained for existing databases; facultyIds supports team teaching.
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  facultyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  semester: { type: Number, required: true, min: 1, max: 12 }
}, { timestamps: true });

const academicClassSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  department: { type: String, enum: DEPARTMENTS, required: true },
  batch: { type: String, required: true, trim: true },
  section: { type: String, enum: CLASS_SECTIONS, required: true },
  semester: { type: Number, required: true, min: 1, max: 12 },
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });
academicClassSchema.index({ department: 1, batch: 1, section: 1, semester: 1 }, { unique: true });

const teachingAssignmentSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicClass', default: null },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  facultyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  // regular assignment targets every class member; special assignment targets selected students only.
  type: { type: String, enum: ['regular', 'special'], default: 'regular' },
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  title: { type: String, trim: true, default: '' }
}, { timestamps: true });
teachingAssignmentSchema.index({ classId: 1, subjectId: 1, type: 1, title: 1 });

const enrollmentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true }
}, { timestamps: true });
enrollmentSchema.index({ studentId: 1, subjectId: 1 }, { unique: true });

const sessionSchema = new mongoose.Schema({
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TeachingAssignment', default: null },
  allowedStudentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['active', 'closed'], default: 'active' }
}, { timestamps: true });
sessionSchema.index({ facultyId: 1, status: 1, expiresAt: 1 });

const attendanceSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', default: null },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  attendanceDate: { type: String, required: true },
  markedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
  method: { type: String, enum: ['qr', 'manual'], default: 'qr' },
  location: { latitude: Number, longitude: Number, distanceMeters: Number }
}, { timestamps: true });
attendanceSchema.index({ studentId: 1, subjectId: 1, attendanceDate: 1 }, { unique: true });

const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Subject = mongoose.models.Subject || mongoose.model('Subject', subjectSchema);
export const AcademicClass = mongoose.models.AcademicClass || mongoose.model('AcademicClass', academicClassSchema);
export const TeachingAssignment = mongoose.models.TeachingAssignment || mongoose.model('TeachingAssignment', teachingAssignmentSchema);
export const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);
export const AttendanceSession = mongoose.models.AttendanceSession || mongoose.model('AttendanceSession', sessionSchema);
export const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
export const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

export async function initDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Create backend/.env before starting the API.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 10) });
  await Promise.all([User.init(), Subject.init(), AcademicClass.init(), TeachingAssignment.init(), Enrollment.init(), Attendance.init(), AttendanceSession.init(), Setting.init()]);
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}
export async function closeDb() { await mongoose.disconnect(); }
