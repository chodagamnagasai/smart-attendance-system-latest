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
import { initDb, User, Subject, Enrollment, AttendanceSession, Attendance, Setting, DEPARTMENTS, CLASS_SECTIONS } from './db.js';

const app = express();
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET;
const QR_SECRET = process.env.QR_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const QR_INTERVAL_MS = 20_000;
const PASSWORD_MIN = 8;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters long.');
if (!QR_SECRET || QR_SECRET.length < 32) throw new Error('QR_SECRET must be set and at least 32 characters long.');
await initDb();
app.disable('x-powered-by'); app.set('trust proxy', 1);
app.use(helmet()); app.use(cors({ origin: CLIENT_URL, credentials: true })); app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

const oid = id => mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
const today = () => new Date().toISOString().slice(0, 10);
const validCredentials = (userCode, password) => typeof userCode === 'string' && /^[A-Za-z0-9._-]{3,50}$/.test(userCode) && typeof password === 'string';
const validPassword = password => typeof password === 'string' && password.length >= PASSWORD_MIN;
const validDepartment = value => DEPARTMENTS.includes(value);
const validClass = value => CLASS_SECTIONS.includes(value);

function safeUser(u) { return { id: String(u._id), userCode: u.userCode, name: u.name, email: u.email, role: u.role, department: u.department || '', batch: u.batch || '', classSection: u.classSection || '' }; }
function sign(u) { return jwt.sign({ id: String(u._id), role: u.role, userCode: u.userCode, name: u.name }, JWT_SECRET, { expiresIn: '8h', issuer: 'smart-attendance' }); }
function auth(req, res, next) { const h = req.headers.authorization || ''; const token = h.startsWith('Bearer ') ? h.slice(7) : null; if (!token) return res.status(401).json({ message: 'Authentication required' }); try { req.user = jwt.verify(token, JWT_SECRET, { issuer: 'smart-attendance' }); next(); } catch { return res.status(401).json({ message: 'Session expired. Please login again.' }); } }
const roles = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission for this action' });

function distanceMeters(lat1, lon1, lat2, lon2) { const r = 6371000, rad = d => d * Math.PI / 180, dLat = rad(lat2-lat1), dLon = rad(lon2-lon1); const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2; return 2*r*Math.asin(Math.sqrt(a)); }
function validateCoordinates(lat, lon) { return Number.isFinite(Number(lat)) && Number(lat) >= -90 && Number(lat) <= 90 && Number.isFinite(Number(lon)) && Number(lon) >= -180 && Number(lon) <= 180; }
async function getLocationConfig() { return (await Setting.findOne({ key: 'attendanceLocation' }).lean())?.value || null; }
function qrSlot(now=Date.now()) { return Math.floor(now / QR_INTERVAL_MS); }
function qrSignature(sessionId, slot) { return crypto.createHmac('sha256', QR_SECRET).update(`${sessionId}:${slot}`).digest('base64url'); }
function parseQr(payload) { const p=String(payload||'').trim().split(':'); if(p.length!==5||p[0]!=='SMARTATTENDANCE'||p[1]!=='v2')return null; const [, ,sessionId,slotText,sig]=p; if(!mongoose.isValidObjectId(sessionId)||!/^[0-9]+$/.test(slotText))return null; const expected=Buffer.from(qrSignature(sessionId,Number(slotText))); const actual=Buffer.from(sig); if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null; return {sessionId,slot:Number(slotText)}; }
async function buildQr(session) { const now=Date.now(), slot=qrSlot(now), payload=`SMARTATTENDANCE:v2:${session._id}:${slot}:${qrSignature(session._id,slot)}`, next=(slot+1)*QR_INTERVAL_MS; return { qrData:payload, qrDataUrl:await QRCode.toDataURL(payload,{width:360,margin:2,errorCorrectionLevel:'M'}), slot, nextRotationAt:new Date(next).toISOString(), validForSeconds:Math.max(0,Math.ceil((next-now)/1000)) }; }

app.get('/api/health',(_,res)=>res.json({status:'ok',database:mongoose.connection.readyState===1?'mongodb':'disconnected'}));
app.get('/api/meta/departments',auth,(_,res)=>res.json({departments:DEPARTMENTS,classes:CLASS_SECTIONS}));

app.post('/api/auth/login',async(req,res)=>{const {userCode,password,role}=req.body||{}; if(!validCredentials(userCode,password)||!['admin','faculty','student'].includes(role))return res.status(401).json({message:'Invalid credentials'}); const user=await User.findOne({userCode:String(userCode).toUpperCase(),role}); if(!user||!(await bcrypt.compare(password,user.passwordHash)))return res.status(401).json({message:'Invalid credentials'}); res.json({token:sign(user),user:safeUser(user)});});
app.get('/api/auth/me',auth,async(req,res)=>{const u=await User.findById(req.user.id); if(!u)return res.status(401).json({message:'Account no longer exists'}); res.json({user:safeUser(u)});});

app.get('/api/dashboard/summary',auth,async(req,res)=>{
  if(req.user.role==='student'){const e=await Enrollment.find({studentId:req.user.id}).lean(), ids=e.map(x=>x.subjectId), subs=await Subject.find({_id:{$in:ids}}).lean(), att=await Attendance.find({studentId:req.user.id,subjectId:{$in:ids}}).lean(); return res.json({role:'student',student:safeUser(await User.findById(req.user.id)),subjects:subs.map(s=>{const a=att.filter(x=>String(x.subjectId)===String(s._id)),p=a.filter(x=>x.status==='present').length;return{id:String(s._id),code:s.code,name:s.name,marked:a.length,total:a.length,present:p,percentage:a.length?Math.round(p/a.length*100):0};}).sort((a,b)=>a.name.localeCompare(b.name))});}
  if(req.user.role==='faculty'){const subs=await Subject.find({facultyId:req.user.id}).sort({name:1}).lean(),ids=subs.map(x=>x._id),en=await Enrollment.find({subjectId:{$in:ids}}).lean(),present=await Attendance.countDocuments({subjectId:{$in:ids},attendanceDate:today(),status:'present'});return res.json({role:'faculty',subjects:subs.map(s=>({id:String(s._id),code:s.code,name:s.name,department:s.department})),totalStudents:new Set(en.map(e=>String(e.studentId))).size,todayPresent:present});}
  res.json({role:'admin',students:await User.countDocuments({role:'student'}),faculty:await User.countDocuments({role:'faculty'}),subjects:await Subject.countDocuments(),attendance:await Attendance.countDocuments()});
});

app.get('/api/settings/location',auth,roles('admin'),async(_,res)=>res.json(await getLocationConfig()));
app.put('/api/settings/location',auth,roles('admin'),async(req,res)=>{const {latitude,longitude,radiusMeters}=req.body||{};if(!validateCoordinates(latitude,longitude)||!Number.isFinite(Number(radiusMeters))||Number(radiusMeters)<10||Number(radiusMeters)>10000)return res.status(400).json({message:'Provide valid coordinates and a radius between 10 and 10,000 meters.'});const value={latitude:Number(latitude),longitude:Number(longitude),radiusMeters:Number(radiusMeters)};await Setting.findOneAndUpdate({key:'attendanceLocation'},{value,updatedBy:req.user.id},{upsert:true,new:true,setDefaultsOnInsert:true});res.json(value);});

app.get('/api/students',auth,roles('admin','faculty'),async(_,res)=>{const students=await User.find({role:'student'}).sort({name:1}).lean();const counts=await Enrollment.aggregate([{$match:{studentId:{$in:students.map(s=>s._id)}}},{$group:{_id:'$studentId',count:{$sum:1}}}]);const map=new Map(counts.map(x=>[String(x._id),x.count]));res.json(students.map(s=>({...safeUser(s),subjects:map.get(String(s._id))||0})));});

async function createUser(req,res,role){const {userCode,name,email,password,department,batch='',classSection}=req.body||{};if(!userCode||!name||!email||!validPassword(password)||!validDepartment(department))return res.status(400).json({message:`User ID, name, email, department and a password of at least ${PASSWORD_MIN} characters are required.`});if(role==='student'&&!validClass(classSection))return res.status(400).json({message:'A valid class section is required for students.'});try{const user=await User.create({userCode,name,email,passwordHash:await bcrypt.hash(password,12),role,department,batch:role==='student'?batch:'',classSection:role==='student'?classSection:undefined});res.status(201).json({user:safeUser(user)});}catch(e){res.status(e?.code===11000?409:400).json({message:e?.code===11000?'User ID or email already exists':'Unable to create account'});}}
app.post('/api/students',auth,roles('admin'),(req,res)=>createUser(req,res,'student'));
app.put('/api/students/:id',auth,roles('admin'),async(req,res)=>{const {name,email,password,department,batch='',classSection}=req.body||{};if(!name||!email||!validDepartment(department)||!validClass(classSection)|| (password!==undefined&&password!==''&&!validPassword(password)))return res.status(400).json({message:'Provide valid student details; password is optional and must be at least 8 characters when changed.'});const update={name,email,department,batch,classSection};if(password)update.passwordHash=await bcrypt.hash(password,12);try{const u=await User.findOneAndUpdate({_id:req.params.id,role:'student'},update,{new:true,runValidators:true});if(!u)return res.status(404).json({message:'Student not found'});res.json({user:safeUser(u)});}catch(e){res.status(e?.code===11000?409:400).json({message:e?.code===11000?'Email already exists':'Unable to update student'});}});
app.delete('/api/students/:id',auth,roles('admin'),async(req,res)=>{await Enrollment.deleteMany({studentId:req.params.id});await Attendance.deleteMany({studentId:req.params.id});await User.deleteOne({_id:req.params.id,role:'student'});res.json({message:'Student deleted'});});

app.get('/api/faculty',auth,roles('admin'),async(_,res)=>res.json((await User.find({role:'faculty'}).sort({name:1}).lean()).map(safeUser)));
app.post('/api/faculty',auth,roles('admin'),(req,res)=>createUser(req,res,'faculty'));
app.put('/api/faculty/:id',auth,roles('admin'),async(req,res)=>{const {name,email,password,department}=req.body||{};if(!name||!email||!validDepartment(department)||(password!==undefined&&password!==''&&!validPassword(password)))return res.status(400).json({message:'Provide valid faculty details; password is optional and must be at least 8 characters when changed.'});const update={name,email,department};if(password)update.passwordHash=await bcrypt.hash(password,12);try{const u=await User.findOneAndUpdate({_id:req.params.id,role:'faculty'},update,{new:true,runValidators:true});if(!u)return res.status(404).json({message:'Faculty not found'});res.json({user:safeUser(u)});}catch(e){res.status(e?.code===11000?409:400).json({message:e?.code===11000?'Email already exists':'Unable to update faculty'});}});
app.delete('/api/faculty/:id',auth,roles('admin'),async(req,res)=>{await Subject.deleteMany({facultyId:req.params.id});await User.deleteOne({_id:req.params.id,role:'faculty'});res.json({message:'Faculty deleted'});});

app.get('/api/subjects',auth,async(req,res)=>{let f={};if(req.user.role==='faculty')f.facultyId=req.user.id;if(req.user.role==='student'){const e=await Enrollment.find({studentId:req.user.id}).lean();f._id={$in:e.map(x=>x.subjectId)};}const rows=await Subject.find(f).populate('facultyId','name department').sort({name:1}).lean();res.json(rows.map(s=>({...s,id:String(s._id),facultyName:s.facultyId?.name||'',facultyId:String(s.facultyId?._id||s.facultyId)})));});
app.post('/api/subjects',auth,roles('admin'),async(req,res)=>{const {code,name,department,facultyId,semester}=req.body||{};if(!code||!name||!validDepartment(department)||!oid(facultyId)||!Number.isInteger(Number(semester)))return res.status(400).json({message:'Code, name, department, faculty and semester are required.'});const faculty=await User.findOne({_id:facultyId,role:'faculty',department});if(!faculty)return res.status(400).json({message:'Select a faculty member from the selected department.'});try{const s=await Subject.create({code,name,department,facultyId,semester:Number(semester)});res.status(201).json({id:String(s._id)});}catch(e){res.status(e?.code===11000?409:400).json({message:e?.code===11000?'Subject code already exists':'Unable to create subject'});}});
app.put('/api/subjects/:id',auth,roles('admin'),async(req,res)=>{const {code,name,department,facultyId,semester}=req.body||{};if(!code||!name||!validDepartment(department)||!oid(facultyId)||!Number.isInteger(Number(semester)))return res.status(400).json({message:'Invalid subject details.'});if(!await User.exists({_id:facultyId,role:'faculty',department}))return res.status(400).json({message:'Faculty must belong to the selected department.'});try{const s=await Subject.findByIdAndUpdate(req.params.id,{code,name,department,facultyId,semester:Number(semester)},{new:true,runValidators:true});if(!s)return res.status(404).json({message:'Subject not found'});res.json({message:'Subject updated'});}catch(e){res.status(e?.code===11000?409:400).json({message:e?.code===11000?'Subject code already exists':'Unable to update subject'});}});
app.delete('/api/subjects/:id',auth,roles('admin'),async(req,res)=>{await Enrollment.deleteMany({subjectId:req.params.id});await Attendance.deleteMany({subjectId:req.params.id});await AttendanceSession.deleteMany({subjectId:req.params.id});await Subject.deleteOne({_id:req.params.id});res.json({message:'Subject deleted'});});

app.post('/api/subjects/:id/enroll',auth,roles('admin'),async(req,res)=>{const {mode,studentId,batch,classSection}=req.body||{};const subject=await Subject.findById(req.params.id);if(!subject)return res.status(404).json({message:'Subject not found'});let students=[];if(mode==='individual'){if(!oid(studentId))return res.status(400).json({message:'Select a valid student.'});const s=await User.findOne({_id:studentId,role:'student',department:subject.department});if(!s)return res.status(400).json({message:'Student must belong to the subject department.'});students=[s];}else if(mode==='class'){if(!batch||!validClass(classSection))return res.status(400).json({message:'Batch and class section are required for class enrollment.'});students=await User.find({role:'student',department:subject.department,batch,classSection});if(!students.length)return res.status(404).json({message:'No students found in the selected department, batch and class.'});}else return res.status(400).json({message:'Enrollment mode must be individual or class.'});let added=0;for(const s of students){try{await Enrollment.create({studentId:s._id,subjectId:subject._id});added++;}catch(e){if(e?.code!==11000)throw e;}}res.json({message:`${added} student(s) enrolled successfully`,added,total:students.length});});

async function requireLocation(req,res){const {latitude,longitude}=req.body||{};if(!validateCoordinates(latitude,longitude)){res.status(400).json({message:'Location permission is required.'});return null;}const config=await getLocationConfig();if(!config){res.status(503).json({message:'Attendance location has not been configured by the administrator.'});return null;}const d=distanceMeters(config.latitude,config.longitude,Number(latitude),Number(longitude));if(d>config.radiusMeters){res.status(403).json({message:`You are outside the allowed attendance area (${Math.round(d)}m away; limit ${config.radiusMeters}m).`});return null;}return{latitude:Number(latitude),longitude:Number(longitude),distanceMeters:Math.round(d)};}
app.post('/api/attendance/sessions',auth,roles('faculty'),async(req,res)=>{const {subjectId,durationMinutes=5}=req.body||{};if(!oid(subjectId))return res.status(400).json({message:'Invalid subject'});const subject=await Subject.findOne({_id:subjectId,facultyId:req.user.id});if(!subject)return res.status(403).json({message:'Subject not assigned to you'});await AttendanceSession.updateMany({facultyId:req.user.id,status:'active'},{$set:{status:'closed'}});const mins=Math.min(60,Math.max(1,Number(durationMinutes)||5)),s=await AttendanceSession.create({subjectId,facultyId:req.user.id,startsAt:new Date(),expiresAt:new Date(Date.now()+mins*60000)});res.status(201).json({session:{id:String(s._id),subject:subject.name,expiresAt:s.expiresAt},qr:await buildQr(s)});});
app.post('/api/attendance/sessions/:id/close',auth,roles('faculty'),async(req,res)=>{await AttendanceSession.updateOne({_id:req.params.id,facultyId:req.user.id},{$set:{status:'closed'}});res.json({message:'Session closed'});});
app.get('/api/attendance/sessions/:id/qr',auth,roles('faculty'),async(req,res)=>{const s=await AttendanceSession.findOne({_id:req.params.id,facultyId:req.user.id,status:'active'});if(!s||s.expiresAt<=new Date())return res.status(410).json({message:'Attendance session has expired or is closed'});res.json(await buildQr(s));});
app.get('/api/attendance/sessions/active',auth,roles('faculty'),async(req,res)=>{const ss=await AttendanceSession.find({facultyId:req.user.id,status:'active',expiresAt:{$gt:new Date()}}).populate('subjectId','code name').sort({createdAt:-1}).lean();res.json(ss.map(s=>({id:String(s._id),startsAt:s.startsAt,expiresAt:s.expiresAt,status:s.status,code:s.subjectId.code,name:s.subjectId.name})));});

app.post('/api/attendance/mark',auth,roles('student'),async(req,res)=>{const location=await requireLocation(req,res);if(!location)return;const parsed=parseQr(req.body.token);if(!parsed)return res.status(400).json({message:'Invalid QR code'});if(parsed.slot!==qrSlot())return res.status(410).json({message:'This QR code has expired. Please scan the latest QR code.'});const session=await AttendanceSession.findOne({_id:parsed.sessionId,status:'active'}).populate('subjectId','name code');if(!session||session.expiresAt<=new Date())return res.status(410).json({message:'Attendance session has expired'});if(!await Enrollment.exists({studentId:req.user.id,subjectId:session.subjectId._id}))return res.status(403).json({message:'You are not enrolled in this subject'});try{await Attendance.create({sessionId:session._id,studentId:req.user.id,subjectId:session.subjectId._id,attendanceDate:today(),status:'present',method:'qr',location});res.json({message:`Attendance marked for ${session.subjectId.name}`,distanceMeters:location.distanceMeters});}catch(e){if(e?.code===11000)return res.status(409).json({message:'Attendance is already marked for this subject today'});throw e;}});

app.post('/api/attendance/manual',auth,roles('admin','faculty'),async(req,res)=>{const {studentId,subjectId,date=today(),status='present'}=req.body||{};if(!oid(studentId)||!oid(subjectId)||!['present','absent','late'].includes(status))return res.status(400).json({message:'Invalid attendance details'});const subject=await Subject.findOne({_id:subjectId,...(req.user.role==='faculty'?{facultyId:req.user.id}:{})});if(!subject)return res.status(403).json({message:'Subject is not available to you'});const student=await User.findOne({_id:studentId,role:'student'});if(!student||!await Enrollment.exists({studentId,subjectId}))return res.status(400).json({message:'Student is not enrolled in this subject'});try{await Attendance.findOneAndUpdate({studentId,subjectId,attendanceDate:date},{sessionId:null,status,method:'manual',markedAt:new Date()},{upsert:true,new:true,setDefaultsOnInsert:true});res.json({message:'Attendance updated'});}catch(e){throw e;}});
app.get('/api/attendance/my',auth,roles('student'),async(req,res)=>{const rows=await Attendance.find({studentId:req.user.id}).populate('subjectId','code name').sort({attendanceDate:-1,markedAt:-1}).lean();res.json(rows.map(r=>({id:String(r._id),date:r.attendanceDate,markedAt:r.markedAt,status:r.status,method:r.method,subjectCode:r.subjectId.code,subjectName:r.subjectId.name})))});
app.get('/api/attendance/percentage',auth,roles('student'),async(req,res)=>{const e=await Enrollment.find({studentId:req.user.id}).lean(),subs=await Subject.find({_id:{$in:e.map(x=>x.subjectId)}}).lean(),all=await Attendance.find({studentId:req.user.id}).lean();res.json(subs.map(s=>{const a=all.filter(x=>String(x.subjectId)===String(s._id)),p=a.filter(x=>x.status==='present').length;return{id:String(s._id),code:s.code,name:s.name,total:a.length,present:p,absent:a.filter(x=>x.status==='absent').length,late:a.filter(x=>x.status==='late').length,percentage:a.length?Math.round(p/a.length*100):0};}));});
app.get('/api/attendance/report', auth, roles('faculty','admin'), async (req, res) => {
  const sf = req.query.subjectId && oid(req.query.subjectId) ? { _id: req.query.subjectId } : {};
  const subjectFilter = req.user.role === 'faculty' ? { facultyId: req.user.id, ...sf } : sf;
  const subs = await Subject.find(subjectFilter).lean();
  const ids = subs.map(s => s._id);
  const en = await Enrollment.find({ subjectId: { $in: ids } }).lean();
  const students = await User.find({ _id: { $in: en.map(e => e.studentId) }, role: 'student' }).lean();
  const att = await Attendance.find({ subjectId: { $in: ids } }).lean();
  const rows = [];
  for (const s of subs) {
    for (const e of en.filter(x => String(x.subjectId) === String(s._id))) {
      const u = students.find(x => String(x._id) === String(e.studentId));
      if (!u) continue;
      const a = att.filter(x => String(x.subjectId) === String(s._id) && String(x.studentId) === String(u._id));
      const p = a.filter(x => x.status === 'present').length;
      rows.push({ studentId: String(u._id), userCode: u.userCode, studentName: u.name, subjectCode: s.code, subjectName: s.name, total: a.length, present: p, absent: a.filter(x => x.status === 'absent').length, late: a.filter(x => x.status === 'late').length, percentage: a.length ? Math.round(p / a.length * 100) : 0 });
    }
  }
  res.json(rows.sort((a,b) => a.subjectCode.localeCompare(b.subjectCode) || a.studentName.localeCompare(b.studentName)));
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({message:'Internal server error'});});
app.listen(PORT,()=>console.log(`Smart Attendance API running at http://localhost:${PORT}`));
