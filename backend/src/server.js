import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { db, initDb } from './db.js';

const app = express();
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-me';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

await initDb();
app.use(helmet());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

const safeUser = u => ({ id:u.id, userCode:u.user_code, name:u.name, email:u.email, role:u.role, department:u.department, semester:u.semester });
const sign = u => jwt.sign({ id:u.id, role:u.role, userCode:u.user_code, name:u.name }, JWT_SECRET, { expiresIn:'8h' });

function auth(req,res,next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({message:'Authentication required'});
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({message:'Session expired. Please login again.'}); }
}
const roles = (...allowed) => (req,res,next) => allowed.includes(req.user.role) ? next() : res.status(403).json({message:'You do not have permission for this action'});
const today = () => new Date().toISOString().slice(0,10);

app.get('/api/health', (_,res)=>res.json({status:'ok',service:'smart-attendance-api'}));

app.post('/api/auth/login', (req,res)=>{
  const { userCode, password, role } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE user_code=? AND role=?').get(userCode, role);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) return res.status(401).json({message:'Invalid credentials'});
  res.json({ token:sign(user), user:safeUser(user) });
});
app.post('/api/auth/register', (req,res)=>{
  const { userCode,name,email,password,department,semester } = req.body || {};
  if (!userCode || !name || !email || !password) return res.status(400).json({message:'Name, ID, email and password are required'});
  if (password.length < 8) return res.status(400).json({message:'Password must contain at least 8 characters'});
  try {
    const hash=bcrypt.hashSync(password,10);
    const result=db.prepare(`INSERT INTO users(user_code,name,email,password_hash,role,department,semester) VALUES(?,?,?,?,?,?,?)`).run(userCode,name,email,hash,'student',department||'',semester||null);
    const user=db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({token:sign(user),user:safeUser(user)});
  } catch(e){ res.status(409).json({message:e.message.includes('UNIQUE')?'User ID or email already exists':'Unable to register'}); }
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id))}));

app.get('/api/dashboard/summary',auth,(req,res)=>{
  if(req.user.role==='student'){
    const rows=db.prepare(`SELECT s.id,s.code,s.name, COUNT(a.id) marked, SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) present FROM subjects s JOIN enrollments e ON e.subject_id=s.id AND e.student_id=? LEFT JOIN attendance a ON a.subject_id=s.id AND a.student_id=? GROUP BY s.id ORDER BY s.name`).all(req.user.id,req.user.id);
    const enriched=rows.map(r=>({...r, total:r.marked||0, percentage:r.marked?Math.round((r.present/r.marked)*100):0}));
    return res.json({role:'student',subjects:enriched});
  }
  if(req.user.role==='faculty'){
    const subjects=db.prepare('SELECT id,code,name FROM subjects WHERE faculty_id=? ORDER BY name').all(req.user.id);
    const totalStudents=db.prepare(`SELECT COUNT(DISTINCT e.student_id) c FROM enrollments e JOIN subjects s ON s.id=e.subject_id WHERE s.faculty_id=?`).get(req.user.id).c;
    const todayCount=db.prepare(`SELECT COUNT(*) c FROM attendance a JOIN subjects s ON s.id=a.subject_id WHERE s.faculty_id=? AND a.attendance_date=? AND a.status='present'`).get(req.user.id,today()).c;
    return res.json({role:'faculty',subjects,totalStudents,todayPresent:todayCount});
  }
  const students=db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c;
  const faculty=db.prepare("SELECT COUNT(*) c FROM users WHERE role='faculty'").get().c;
  const subjects=db.prepare('SELECT COUNT(*) c FROM subjects').get().c;
  const attendance=db.prepare('SELECT COUNT(*) c FROM attendance').get().c;
  res.json({role:'admin',students,faculty,subjects,attendance});
});

app.get('/api/students',auth,roles('admin','faculty'),(req,res)=>{
  const students=db.prepare(`SELECT u.id,u.user_code userCode,u.name,u.email,u.department,u.semester, COUNT(e.id) subjects FROM users u LEFT JOIN enrollments e ON e.student_id=u.id WHERE u.role='student' GROUP BY u.id ORDER BY u.name`).all();
  res.json(students);
});
app.post('/api/students',auth,roles('admin'),(req,res)=>{
  const {userCode,name,email,password='Password@123',department='',semester=null}=req.body||{};
  try { const r=db.prepare(`INSERT INTO users(user_code,name,email,password_hash,role,department,semester) VALUES(?,?,?,?,?,?,?)`).run(userCode,name,email,bcrypt.hashSync(password,10),'student',department,semester); res.status(201).json({id:r.lastInsertRowid}); }
  catch(e){res.status(409).json({message:'Student ID or email already exists'});}
});
app.put('/api/students/:id',auth,roles('admin'),(req,res)=>{const {name,email,department,semester}=req.body; db.prepare('UPDATE users SET name=?,email=?,department=?,semester=? WHERE id=? AND role=\'student\'').run(name,email,department,semester,req.params.id);res.json({message:'Student updated'});});
app.delete('/api/students/:id',auth,roles('admin'),(req,res)=>{db.prepare('DELETE FROM users WHERE id=? AND role=\'student\'').run(req.params.id);res.json({message:'Student deleted'});});

app.get('/api/faculty',auth,roles('admin'),(_,res)=>res.json(db.prepare(`SELECT id,user_code userCode,name,email,department,semester FROM users WHERE role='faculty' ORDER BY name`).all()));
app.post('/api/faculty',auth,roles('admin'),(req,res)=>{const {userCode,name,email,password='Password@123',department='',semester=null}=req.body||{};try{const r=db.prepare(`INSERT INTO users(user_code,name,email,password_hash,role,department,semester) VALUES(?,?,?,?,?,?,?)`).run(userCode,name,email,bcrypt.hashSync(password,10),'faculty',department,semester);res.status(201).json({id:r.lastInsertRowid});}catch{res.status(409).json({message:'Faculty ID or email already exists'});}});
app.delete('/api/faculty/:id',auth,roles('admin'),(req,res)=>{db.prepare('DELETE FROM users WHERE id=? AND role=\'faculty\'').run(req.params.id);res.json({message:'Faculty deleted'});});

app.get('/api/subjects',auth,(req,res)=>{
  let rows;
  if(req.user.role==='faculty') rows=db.prepare(`SELECT s.*,u.name facultyName FROM subjects s JOIN users u ON u.id=s.faculty_id WHERE s.faculty_id=? ORDER BY s.name`).all(req.user.id);
  else if(req.user.role==='student') rows=db.prepare(`SELECT s.*,u.name facultyName FROM subjects s JOIN users u ON u.id=s.faculty_id JOIN enrollments e ON e.subject_id=s.id WHERE e.student_id=? ORDER BY s.name`).all(req.user.id);
  else rows=db.prepare(`SELECT s.*,u.name facultyName FROM subjects s JOIN users u ON u.id=s.faculty_id ORDER BY s.name`).all();
  res.json(rows);
});
app.post('/api/subjects',auth,roles('admin'),(req,res)=>{const {code,name,facultyId,semester,department=''}=req.body||{};try{const r=db.prepare('INSERT INTO subjects(code,name,faculty_id,semester,department) VALUES(?,?,?,?,?)').run(code,name,facultyId,semester,department);res.status(201).json({id:r.lastInsertRowid});}catch{res.status(409).json({message:'Subject code already exists'});}});
app.put('/api/subjects/:id',auth,roles('admin'),(req,res)=>{const {code,name,facultyId,semester,department}=req.body;db.prepare('UPDATE subjects SET code=?,name=?,faculty_id=?,semester=?,department=? WHERE id=?').run(code,name,facultyId,semester,department,req.params.id);res.json({message:'Subject updated'});});
app.delete('/api/subjects/:id',auth,roles('admin'),(req,res)=>{db.prepare('DELETE FROM subjects WHERE id=?').run(req.params.id);res.json({message:'Subject deleted'});});
app.post('/api/subjects/:id/enroll',auth,roles('admin'),(req,res)=>{try{db.prepare('INSERT OR IGNORE INTO enrollments(student_id,subject_id) VALUES(?,?)').run(req.body.studentId,req.params.id);res.json({message:'Student enrolled'});}catch{res.status(400).json({message:'Unable to enroll student'});}});

app.post('/api/attendance/sessions',auth,roles('faculty'),async(req,res)=>{
  const {subjectId,durationMinutes=5}=req.body||{};
  const subject=db.prepare('SELECT * FROM subjects WHERE id=? AND faculty_id=?').get(subjectId,req.user.id);
  if(!subject) return res.status(404).json({message:'Subject not found or not assigned to you'});
  const now=new Date(); const expires=new Date(now.getTime()+Math.max(1,Math.min(30,Number(durationMinutes)))*60000);
  const token=crypto.randomBytes(18).toString('base64url');
  const r=db.prepare('INSERT INTO attendance_sessions(subject_id,faculty_id,token,starts_at,expires_at) VALUES(?,?,?,?,?)').run(subject.id,req.user.id,token,now.toISOString(),expires.toISOString());
  const qrData=`SMARTATTENDANCE:${token}`;
  const qrDataUrl=await QRCode.toDataURL(qrData,{width:360,margin:2});
  res.status(201).json({id:r.lastInsertRowid,token,qrData,qrDataUrl,subject,startsAt:now.toISOString(),expiresAt:expires.toISOString()});
});
app.post('/api/attendance/sessions/:id/close',auth,roles('faculty'),(req,res)=>{db.prepare('UPDATE attendance_sessions SET status=\'closed\' WHERE id=? AND faculty_id=?').run(req.params.id,req.user.id);res.json({message:'Session closed'});});
app.get('/api/attendance/sessions/active',auth,roles('faculty'),(req,res)=>res.json(db.prepare(`SELECT s.id,s.token,s.starts_at startsAt,s.expires_at expiresAt,s.status,sub.code,sub.name FROM attendance_sessions s JOIN subjects sub ON sub.id=s.subject_id WHERE s.faculty_id=? AND s.status='active' AND s.expires_at>? ORDER BY s.id DESC`).all(req.user.id,new Date().toISOString())));

app.post('/api/attendance/mark',auth,roles('student'),(req,res)=>{
  let token=(req.body.token||'').replace('SMARTATTENDANCE:','').trim();
  const session=db.prepare(`SELECT s.*,sub.name subject_name FROM attendance_sessions s JOIN subjects sub ON sub.id=s.subject_id WHERE s.token=? AND s.status='active'`).get(token);
  if(!session) return res.status(404).json({message:'Invalid or closed QR code'});
  if(new Date(session.expires_at)<new Date()) return res.status(410).json({message:'QR code has expired'});
  const enrolled=db.prepare('SELECT 1 FROM enrollments WHERE student_id=? AND subject_id=?').get(req.user.id,session.subject_id);
  if(!enrolled) return res.status(403).json({message:'You are not enrolled in this subject'});
  try{db.prepare(`INSERT INTO attendance(session_id,student_id,subject_id,attendance_date,status,method) VALUES(?,?,?,?,?,?)`).run(session.id,req.user.id,session.subject_id,today(),'present','qr');res.json({message:`Attendance marked for ${session.subject_name}`});}
  catch(e){res.status(409).json({message:'Attendance is already marked for this subject today'});}
});
app.post('/api/attendance/manual',auth,roles('faculty'),(req,res)=>{
  const {studentId,subjectId,date=today(),status='present'}=req.body||{};
  const subject=db.prepare('SELECT id FROM subjects WHERE id=? AND faculty_id=?').get(subjectId,req.user.id);
  if(!subject) return res.status(403).json({message:'Subject not assigned to you'});
  try{db.prepare(`INSERT INTO attendance(student_id,subject_id,attendance_date,status,method) VALUES(?,?,?,?,?) ON CONFLICT(student_id,subject_id,attendance_date) DO UPDATE SET status=excluded.status,method='manual',marked_at=CURRENT_TIMESTAMP`).run(studentId,subjectId,date,status);res.json({message:'Attendance updated'});}catch{res.status(400).json({message:'Unable to update attendance'});}
});

app.get('/api/attendance/my',auth,roles('student'),(req,res)=>res.json(db.prepare(`SELECT a.id,a.attendance_date date,a.marked_at markedAt,a.status,a.method,s.code subjectCode,s.name subjectName FROM attendance a JOIN subjects s ON s.id=a.subject_id WHERE a.student_id=? ORDER BY a.attendance_date DESC,a.marked_at DESC`).all(req.user.id)));
app.get('/api/attendance/percentage',auth,roles('student'),(req,res)=>res.json(db.prepare(`SELECT s.id,s.code,s.name,COUNT(a.id) total,SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) present,SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) absent,SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) late FROM subjects s JOIN enrollments e ON e.subject_id=s.id AND e.student_id=? LEFT JOIN attendance a ON a.subject_id=s.id AND a.student_id=? GROUP BY s.id ORDER BY s.name`).all(req.user.id,req.user.id).map(r=>({...r,percentage:r.total?Math.round((r.present/r.total)*100):0}))));
app.get('/api/attendance/report',auth,roles('faculty','admin'),(req,res)=>{
  const subjectId=req.query.subjectId;
  const filter=req.user.role==='faculty'?' AND s.faculty_id=?':'';
  const args=req.user.role==='faculty'?[req.user.id]:[];
  let sql=`SELECT u.id studentId,u.user_code userCode,u.name studentName,s.code subjectCode,s.name subjectName,COUNT(a.id) total,SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) present,SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) absent,SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) late FROM users u JOIN enrollments e ON e.student_id=u.id JOIN subjects s ON s.id=e.subject_id LEFT JOIN attendance a ON a.student_id=u.id AND a.subject_id=s.id WHERE u.role='student' ${filter}`;
  if(subjectId){sql+=' AND s.id=?';args.push(subjectId);} sql+=' GROUP BY u.id,s.id ORDER BY s.name,u.name';
  res.json(db.prepare(sql).all(...args).map(r=>({...r,percentage:r.total?Math.round((r.present/r.total)*100):0})));
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({message:'Internal server error'});});
app.listen(PORT,()=>console.log(`Smart Attendance API running at http://localhost:${PORT}`));
