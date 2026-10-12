import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,useNavigate,useLocation,useSearchParams,Routes,Route,Navigate,Link} from 'react-router-dom';
import {LogOut,Home,BookOpen,Users,ClipboardCheck,ScanLine,BarChart3,ShieldCheck,Menu,X,GraduationCap,UserRoundCog,MapPin,Settings,RefreshCw,Edit3} from 'lucide-react';
import {Html5Qrcode} from 'html5-qrcode';
import {getUser,clearSession,api,saveSession} from './lib/api';
import './styles.css';

const localDateInput = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const navFor=r=>r==='student'?[['Dashboard','/student',Home],['Scan QR','/student/scan',ScanLine],['My Attendance','/student/attendance',ClipboardCheck],['Percentages','/student/percentage',BarChart3]]:r==='faculty'?[['Dashboard','/faculty',Home],['Generate QR','/faculty/qr',ScanLine],['Manual Attendance','/faculty/manual',ClipboardCheck],['Reports','/faculty/reports',BarChart3]]:[['Dashboard','/admin',Home],['Students','/admin/students',Users],['Faculty','/admin/faculty',UserRoundCog],['Subjects','/admin/subjects',BookOpen],['Classes & Assignments','/admin/classes',GraduationCap],['Attendance','/admin/attendance',ClipboardCheck],['Location','/admin/location',MapPin]];
const errorOf = e => {
  if (typeof e?.response?.data?.message === 'string') return e.response.data.message;
  if (e?.response?.status === 404) {
    return 'API endpoint not found. Check that VITE_API_URL points to your backend and ends with /api.';
  }
  if (e?.response?.status >= 500) {
    return `Backend error (${e.response.status}). Check the Render logs and MongoDB connection.`;
  }
  if (e?.code === 'ECONNABORTED') return 'The backend took too long to respond. Check whether the backend is awake and connected to MongoDB.';
  if (!e?.response) {
    return 'Cannot reach the backend API. Check VITE_API_URL, confirm the backend is running, and verify CLIENT_URL in the backend CORS settings.';
  }
  return `Request failed (${e.response.status}). Please check the entered details and try again.`;
};
function Layout({children}){const u=getUser(),loc=useLocation(),nav=useNavigate(),[open,setOpen]=useState(false);if(!u)return <Navigate to="/login" replace/>;return <div className="app"><aside className={open?'open':''}><div className="brand"><GraduationCap size={28}/><span>Smart Attendance</span></div><div className="role-chip"><ShieldCheck size={15}/>{u.role}</div><nav>{navFor(u.role).map(([label,path,Icon])=><Link key={path} className={loc.pathname===path?'active':''} to={path} onClick={()=>setOpen(false)}><Icon size={18}/>{label}</Link>)}</nav><button className="logout" onClick={()=>{clearSession();nav('/login')}}><LogOut size={18}/>Logout</button></aside><main className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button><div><span className="eyebrow">FSD2 • Full Stack Application</span><h2>{navFor(u.role).find(x=>x[1]===loc.pathname)?.[0]||'Smart Attendance'}</h2></div><div className="user-pill"><div className="avatar">{u.name?.[0]}</div><div><b>{u.name}</b><small>{u.userCode}</small></div></div></header><section className="content">{children}</section></main></div>}
function Protected({role,children}){const u=getUser();if(!u)return <Navigate to="/login" replace/>;if(role&&u.role!==role)return <Navigate to={`/${u.role}`} replace/>;return <Layout>{children}</Layout>}
function PageTitle({title,desc,children}){return <div className="page-title"><div><span className="eyebrow">SMART ATTENDANCE</span><h1>{title}</h1><p>{desc}</p></div>{children}</div>}
function Stat({label,value,icon:Icon}){return <div className="stat"><Icon size={22}/><div><small>{label}</small><strong>{value}</strong></div></div>}
function Landing(){return <div className="landing"><div className="landing-nav"><div className="brand"><GraduationCap/> Smart Attendance</div><Link className="btn secondary" to="/login">Login</Link></div><div className="hero"><span className="badge">FSD → FSD2 PROJECT</span><h1>Smart attendance.<br/><em>Built for the full stack.</em></h1><p>Rotating 20-second QR attendance with server-side location validation, strict authentication and MongoDB persistence.</p><div className="actions"><Link className="btn" to="/login">Open Portal</Link><a className="btn secondary" href="#features">Explore Features</a></div></div><div id="features" className="feature-row">{[['⚡','Rotating QR','Every QR changes automatically every 20 seconds.'],['📍','Location Restricted','Attendance is accepted only inside the administrator-defined radius.'],['🔐','Strict Authentication','No public registration or demo accounts.']].map(x=><div className="feature" key={x[1]}><span>{x[0]}</span><h3>{x[1]}</h3><p>{x[2]}</p></div>)}</div></div>}
function Login(){const nav=useNavigate(),[role,setRole]=useState('student'),[form,setForm]=useState({userCode:'',password:''}),[busy,setBusy]=useState(false),[error,setError]=useState('');async function submit(e){e.preventDefault();setBusy(true);setError('');try{const r=await api.post('/auth/login',{...form,userCode:form.userCode.trim().toUpperCase(),role});saveSession(r.data.token,r.data.user);nav(`/${r.data.user.role}`)}catch(e){setError(errorOf(e))}finally{setBusy(false)}}return <div className="auth-page"><div className="auth-card"><Link to="/" className="back">← Smart Attendance</Link><div className="auth-icon"><GraduationCap/></div><h1>Welcome back</h1><p>Sign in with an account provisioned by your administrator.</p><div className="tabs">{['student','faculty','admin'].map(r=><button type="button" className={role===r?'selected':''} key={r} onClick={()=>{setRole(r);setForm({userCode:'',password:''});setError('')}}>{r}</button>)}</div><form onSubmit={submit}><label>{role==='student'?'Student ID':role==='faculty'?'Faculty ID':'Admin ID'}<input autoComplete="username" value={form.userCode} onChange={e=>setForm({...form,userCode:e.target.value})} required/></label><label>Password<input autoComplete="current-password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/></label>{error&&<div className="error-box">{error}</div>}<button className="btn" disabled={busy}>{busy?'Signing in…':'Login'}</button></form></div></div>}
function StudentDashboard(){const[d,setD]=useState(null);useEffect(()=>{api.get('/dashboard/summary').then(r=>setD(r.data))},[]);const s=d?.student;return <><PageTitle title="Student Dashboard" desc={`Good to see you, ${s?.name||getUser().name}.`} />{s&&<div className="panel"><b>{s.department}</b> · Batch {s.batch||'—'} · Class {s.classSection||'—'}</div>}<div className="stats"><Stat label="Subjects" value={d?.subjects?.length??'—'} icon={BookOpen}/><Stat label="Subjects ≥ 75%" value={d?d.subjects.filter(x=>x.percentage>=75).length:'—'} icon={BarChart3}/><Stat label="Attendance records" value={d?d.subjects.reduce((a,x)=>a+(x.total||0),0):'—'} icon={ClipboardCheck}/></div><div className="grid two"><div className="panel"><h3>Subject overview</h3>{d?.subjects?.map(s=><div className="list-row" key={s.id}><div><b>{s.code}</b><span>{s.name}</span></div><div className={`percentage ${s.percentage<75?'warn':''}`}>{s.percentage}%</div></div>)}</div><div className="panel callout"><MapPin size={40}/><h3>Location-aware attendance</h3><p>Allow browser location access and scan the latest faculty QR. The server verifies your distance.</p><Link className="btn" to="/student/scan">Scan QR Code</Link></div></div></>}
function Scanner() {
  const [scanAttempt, setScanAttempt] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const scannerRef = useRef(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let active = true;
    let scanner;

    async function startScanner() {
      try {
        scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
          async decodedText => {
            if (handledRef.current || !active) return;
            handledRef.current = true;
            setBusy(true);
            setError('');
            setMessage('QR detected. Verifying your location…');

            try {
              if (!navigator.geolocation) {
                throw new Error('This browser does not support location access.');
              }
              const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: true,
                  timeout: 15000,
                  maximumAge: 0
                });
              });
              const response = await api.post('/attendance/mark', {
                token: decodedText,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              });
              setMessage(response.data.message || 'Attendance marked successfully.');
              setError('');
            } catch (e) {
              const geoError = e?.code === 1 || e?.code === 2 || e?.code === 3;
              setError(geoError
                ? 'Location permission is required. Allow location access, then scan again.'
                : errorOf(e));
              setMessage('');
            } finally {
              try {
                if (scanner?.isScanning) await scanner.stop();
              } catch {}
              setCameraReady(false);
              setBusy(false);
            }
          },
          () => {}
        );
        if (active) setCameraReady(true);
      } catch (e) {
        if (active) {
          setError('Unable to start the camera. Allow camera access and open this page over HTTPS or localhost.');
          setCameraReady(false);
        }
      }
    }

    startScanner();
    return () => {
      active = false;
      const current = scannerRef.current;
      scannerRef.current = null;
      if (current) {
        const clear = () => {
          try { current.clear(); } catch {}
        };
        if (current.isScanning) current.stop().then(clear).catch(clear);
        else clear();
      }
    };
  }, [scanAttempt]);

  function scanAgain() {
    setMessage('');
    setError('');
    setBusy(false);
    setCameraReady(false);
    handledRef.current = false;
    setScanAttempt(value => value + 1);
  }

  return <>
    <PageTitle title="Scan Attendance QR" desc="Scan the current faculty QR code. Location permission is required to mark attendance." />
    <div className="grid two">
      <div className="panel form-panel">
        <div id="qr-reader" className="scanner-box" />
        {cameraReady && <p className="muted">Camera is ready. Point it at the latest QR code.</p>}
        {busy && <div className="success-box">Checking QR and location…</div>}
        {message && <div className="success-box">{message}</div>}
        {error && <div className="error-box">{error}</div>}
        <button className="btn" type="button" onClick={scanAgain} disabled={busy}>
          {cameraReady ? 'Restart scanner' : 'Scan again'}
        </button>
      </div>
      <div className="panel">
        <h3>Before scanning</h3>
        <ul>
          <li>Choose the Student role and sign in.</li>
          <li>Allow camera and location permissions.</li>
          <li>Use the current QR displayed by your faculty member.</li>
          <li>Stay within the attendance location radius configured by the administrator.</li>
        </ul>
      </div>
    </div>
  </>;
}

function FacultyDashboard(){const[d,setD]=useState(null);useEffect(()=>{api.get('/dashboard/summary').then(r=>setD(r.data))},[]);return <><PageTitle title="Faculty Dashboard" desc="Run attendance sessions with rotating QR codes."/><div className="stats"><Stat label="My subjects" value={d?.subjects?.length??'—'} icon={BookOpen}/><Stat label="Enrolled students" value={d?.totalStudents??'—'} icon={Users}/><Stat label="Present today" value={d?.todayPresent??'—'} icon={ClipboardCheck}/></div><div className="panel"><div className="panel-head"><h3>Your subjects</h3><Link className="btn small" to="/faculty/qr">Generate QR</Link></div>{d?.subjects?.map(s=><div className="list-row" key={s.id}><div><b>{s.code}</b><span>{s.name} · {s.department}</span></div><Link to={`/faculty/qr?subject=${s.id}`} className="text-btn">Start session →</Link></div>)}</div></>}
function AdminDashboard(){const[d,setD]=useState(null),[loc,setLoc]=useState(null);useEffect(()=>{Promise.all([api.get('/dashboard/summary'),api.get('/settings/location')]).then(([a,b])=>{setD(a.data);setLoc(b.data)})},[]);return <><PageTitle title="Admin Console" desc="Manage users, subjects, enrollment, attendance and location policy."/><div className="stats"><Stat label="Students" value={d?.students??'—'} icon={Users}/><Stat label="Faculty" value={d?.faculty??'—'} icon={UserRoundCog}/><Stat label="Subjects" value={d?.subjects??'—'} icon={BookOpen}/><Stat label="Attendance" value={d?.attendance??'—'} icon={ClipboardCheck}/></div><div className="grid three"><Link className="action-card" to="/admin/students"><Users/><b>Manage Students</b><span>Add, edit, batch and class details.</span></Link><Link className="action-card" to="/admin/faculty"><UserRoundCog/><b>Manage Faculty</b><span>Add and edit faculty by department.</span></Link><Link className="action-card" to="/admin/subjects"><BookOpen/><b>Manage Subjects</b><span>Department-first faculty assignment and enrollment.</span></Link><Link className="action-card" to="/admin/classes"><GraduationCap/><b>Classes & Teaching</b><span>Create classes and assign subjects to faculty teams or special groups.</span></Link><Link className="action-card" to="/admin/attendance"><ClipboardCheck/><b>Manual Attendance</b><span>Admin can explicitly add or correct attendance.</span></Link></div><div className="panel"><div className="panel-head"><div><h3>Attendance location</h3><p>{loc?`${loc.latitude}, ${loc.longitude} • ${loc.radiusMeters}m radius`:'Not configured'}</p></div><Link className="btn small" to="/admin/location"><Settings size={16}/> Configure</Link></div></div></>}
function LocationSettings(){const[form,setForm]=useState({latitude:'',longitude:'',radiusMeters:100}),[msg,setMsg]=useState(''),[error,setError]=useState('');useEffect(()=>{api.get('/settings/location').then(r=>r.data&&setForm(r.data)).catch(e=>setError(errorOf(e)))},[]);function current(){navigator.geolocation?.getCurrentPosition(p=>setForm({...form,latitude:p.coords.latitude.toFixed(6),longitude:p.coords.longitude.toFixed(6)}),()=>setError('Unable to read current location.'))}async function save(e){e.preventDefault();try{const r=await api.put('/settings/location',form);setForm(r.data);setMsg('Location policy saved.');setError('')}catch(e){setError(errorOf(e))}}return <><PageTitle title="Attendance Location" desc="Students can mark QR attendance only inside this server-enforced radius."/><div className="panel form-panel"><form className="grid two" onSubmit={save}><label>Latitude<input type="number" step="any" value={form.latitude||''} onChange={e=>setForm({...form,latitude:e.target.value})} required/></label><label>Longitude<input type="number" step="any" value={form.longitude||''} onChange={e=>setForm({...form,longitude:e.target.value})} required/></label><label>Allowed radius (meters)<input type="number" min="10" max="10000" value={form.radiusMeters||100} onChange={e=>setForm({...form,radiusMeters:e.target.value})} required/></label><div><label>&nbsp;</label><button type="button" className="btn secondary" onClick={current}><MapPin size={17}/> Use current location</button></div><button className="btn">Save location policy</button></form>{msg&&<div className="success-box">{msg}</div>}{error&&<div className="error-box">{error}</div>}</div></>}
function QRGenerator(){
 const [params]=useSearchParams(),[subjects,setSubjects]=useState([]),[assignments,setAssignments]=useState([]),[selected,setSelected]=useState(params.get('subject')||''),[assignmentId,setAssignmentId]=useState(''),[duration,setDuration]=useState(5),[session,setSession]=useState(null),[msg,setMsg]=useState(''),[seconds,setSeconds]=useState(0);
 useEffect(()=>{Promise.all([api.get('/subjects'),api.get('/teaching-assignments')]).then(([s,a])=>{setSubjects(s.data);setAssignments(a.data);if(!selected&&s.data[0])setSelected(String(s.data[0].id));if(a.data[0]){setAssignmentId(String(a.data[0].id));setSelected(String(a.data[0].subjectId?._id||a.data[0].subjectId));}}).catch(e=>setMsg(errorOf(e)))},[]);
 const chosenAssignment=assignments.find(a=>a.id===assignmentId);
 useEffect(()=>{if(!session)return;const timer=setInterval(async()=>{try{const r=await api.get(`/attendance/sessions/${session.session?.id||session.id}/qr`);setSession(s=>({...s,...r.data}))}catch(e){setMsg(errorOf(e));clearInterval(timer)}},1000);return()=>clearInterval(timer)},[session?.session?.id,session?.id]);
 useEffect(()=>{if(!session)return;const t=setInterval(()=>setSeconds(Math.max(0,Math.ceil((new Date(session.nextRotationAt)-Date.now())/1000))),250);return()=>clearInterval(t)},[session?.nextRotationAt]);
 async function create(){try{const payload={subjectId:selected,durationMinutes:Number(duration)};if(assignmentId)payload.assignmentId=assignmentId;const r=await api.post('/attendance/sessions',payload);setSession({...r.data,subject:subjects.find(s=>String(s.id)===String(selected))});setSeconds(r.data.qr.validForSeconds);setMsg('')}catch(e){setMsg(errorOf(e))}}
 async function close(){const id=session.session?.id||session.id;try{await api.post(`/attendance/sessions/${id}/close`);setSession(null);setMsg('Session closed.')}catch(e){setMsg(errorOf(e))}}
 const qr=session?.qrDataUrl||session?.qr?.qrDataUrl;
 return <><PageTitle title="Generate QR" desc="The QR changes automatically every 20 seconds; only the current code is valid."/><div className="grid two"><div className="panel form-panel">
 {assignments.length>0&&<label>Class assignment<select value={assignmentId} onChange={e=>{const id=e.target.value;setAssignmentId(id);const a=assignments.find(x=>x.id===id);if(a)setSelected(String(a.subjectId?._id||a.subjectId));}}><option value="">Choose assignment</option>{assignments.map(a=><option key={a.id} value={a.id}>{a.type==='special'?'Special':'Regular'} · {a.title||a.classId?.name||'Class'} · {a.subjectId?.code} · {(a.facultyIds||[]).map(f=>f.name).join(', ')}</option>)}</select><small>Special-class QR codes can be scanned only by the selected students.</small></label>}
 <label>Subject<select value={selected} onChange={e=>setSelected(e.target.value)}>{subjects.map(s=><option value={s.id} key={s.id}>{s.code} — {s.name}</option>)}</select></label><label>Session duration<select value={duration} onChange={e=>setDuration(Number(e.target.value))}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></label><button className="btn" onClick={create} disabled={!selected||(assignments.length>0&&!assignmentId)}>Start rotating QR</button>{session&&<button className="btn secondary" onClick={close}>Close session</button>}{msg&&<div className="success-box">{msg}</div>}</div><div className="panel qr-panel">{qr?<><div className="qr-wrap"><img src={qr} alt="Attendance QR"/></div><p><RefreshCw size={15}/> New QR in <b>{seconds}s</b></p></>:<div className="empty"><ScanLine size={48}/><p>Your rotating QR code will appear here.</p></div>}</div></div></>;
}
function ManualAttendance({admin=false}){const[students,setStudents]=useState([]),[subjects,setSubjects]=useState([]),[form,setForm]=useState({date:localDateInput(),status:'present'}),[msg,setMsg]=useState(''),[error,setError]=useState('');useEffect(()=>{Promise.all([api.get('/students'),api.get('/subjects')]).then(([a,b])=>{setStudents(a.data);setSubjects(b.data);setForm(f=>({...f,studentId:a.data[0]?.id,subjectId:b.data[0]?.id}))})},[]);async function save(){try{const r=await api.post('/attendance/manual',form);setMsg(r.data.message);setError('')}catch(e){setError(errorOf(e))}}return <><PageTitle title={admin?'Admin Attendance':'Manual Attendance'} desc={admin?'Admins can explicitly add or correct attendance for enrolled students.':'Faculty can correct attendance records for their subjects.'}/><div className="panel form-panel"><div className="grid two"><label>Student<select value={form.studentId||''} onChange={e=>setForm({...form,studentId:e.target.value})}>{students.map(s=><option key={s.id} value={s.id}>{s.userCode} — {s.name} ({s.classSection||'-'})</option>)}</select></label><label>Subject<select value={form.subjectId||''} onChange={e=>setForm({...form,subjectId:e.target.value})}>{subjects.map(s=><option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select></label><label>Date<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option></select></label></div><button className="btn" onClick={save}>Save Attendance</button>{msg&&<div className="success-box">{msg}</div>}{error&&<div className="error-box">{error}</div>}</div></>}
function Reports(){const[rows,setRows]=useState([]),[subjects,setSubjects]=useState([]),[subjectId,setSubjectId]=useState('');useEffect(()=>{api.get('/subjects').then(r=>setSubjects(r.data));load()},[]);async function load(id=''){const r=await api.get('/attendance/report',{params:id?{subjectId:id}:{}});setRows(r.data)}return <><PageTitle title="Attendance Reports" desc="View subject-wise student attendance analytics."><select className="title-select" value={subjectId} onChange={e=>{setSubjectId(e.target.value);load(e.target.value)}}><option value="">All subjects</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.code}</option>)}</select></PageTitle><div className="panel table-wrap"><table><thead><tr><th>Student</th><th>Subject</th><th>Present</th><th>Absent</th><th>Late</th><th>Percentage</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td><b>{r.userCode}</b> {r.studentName}</td><td>{r.subjectCode}</td><td>{r.present}</td><td>{r.absent}</td><td>{r.late}</td><td><strong className={r.percentage<75?'warn-text':''}>{r.percentage}%</strong></td></tr>)}</tbody></table></div></>}
function Crud({type}){const isStudent=type==='students',[departments,setDepartments]=useState([]),[classes,setClasses]=useState([]),[rows,setRows]=useState([]),[form,setForm]=useState({}),[editing,setEditing]=useState(null),[msg,setMsg]=useState(''),[error,setError]=useState('');async function load(){const r=await api.get(`/${type}`);setRows(r.data)}useEffect(()=>{load();api.get('/meta/departments').then(r=>{setDepartments(r.data.departments);setClasses(r.data.classes)})},[type]);function reset(){setForm({});setEditing(null);setMsg('');setError('')}async function save(e){e.preventDefault();try{if(editing)await api.put(`/${type}/${editing}`,form);else await api.post(`/${type}`,form);setMsg(editing?'Details updated successfully':`${isStudent?'Student':'Faculty'} created successfully`);reset();load()}catch(e){setError(errorOf(e))}}async function del(id){if(!confirm('Delete this account?'))return;await api.delete(`/${type}/${id}`);load()}function edit(r){setEditing(r.id);setForm({userCode:r.userCode,name:r.name,email:r.email,department:r.department,batch:r.batch,classSection:r.classSection,password:''});setMsg('');setError('')}return <><PageTitle title={`Manage ${isStudent?'Students':'Faculty'}`} desc="Administrators can provision and edit accounts."/><div className="panel form-panel"><div className="panel-head"><h3>{editing?'Edit':'Add'} {isStudent?'Student':'Faculty'}</h3>{editing&&<button className="btn secondary small" onClick={reset}>Cancel</button>}</div><form className="grid two" onSubmit={save}><label>User ID<input disabled={!!editing} value={form.userCode||''} onChange={e=>setForm({...form,userCode:e.target.value})} required/></label><label>Full name<input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} required/></label><label>Email<input type="email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})} required/></label><label>Department<select value={form.department||''} onChange={e=>setForm({...form,department:e.target.value})} required><option value="">Select department</option>{departments.map(d=><option key={d}>{d}</option>)}</select></label>{isStudent&&<><label>Batch<input placeholder="e.g. 2026-2030" value={form.batch||''} onChange={e=>setForm({...form,batch:e.target.value})} required/></label><label>Class<select value={form.classSection||''} onChange={e=>setForm({...form,classSection:e.target.value})} required><option value="">Select class</option>{classes.map(c=><option key={c}>{c}</option>)}</select></label></>}<label>Password {editing&&<small>(leave blank to keep current)</small>}<input type="password" minLength="8" placeholder="Minimum 8 characters" value={form.password||''} onChange={e=>setForm({...form,password:e.target.value})} required={!editing}/></label><button className="btn">{editing?'Update':'Create account'}</button></form>{msg&&<div className="success-box">{msg}</div>}{error&&<div className="error-box">{error}</div>}</div><div className="panel table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Department</th>{isStudent&&<><th>Batch</th><th>Class</th></>}<th>Action</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.userCode}</td><td>{r.name}</td><td>{r.email}</td><td>{r.department}</td>{isStudent&&<><td>{r.batch||'—'}</td><td>{r.classSection||'—'}</td></>}<td><button className="text-btn" onClick={()=>edit(r)}><Edit3 size={15}/> Edit</button> <button className="danger-link" onClick={()=>del(r.id)}>Delete</button></td></tr>)}</tbody></table></div></>}
function Subjects(){const[rows,setRows]=useState([]),[faculty,setFaculty]=useState([]),[students,setStudents]=useState([]),[departments,setDepartments]=useState([]),[classes,setClasses]=useState([]),[form,setForm]=useState({}),[enroll,setEnroll]=useState({mode:'individual'}),[msg,setMsg]=useState(''),[error,setError]=useState('');async function load(){const [s,f,st,m]=await Promise.all([api.get('/subjects'),api.get('/faculty'),api.get('/students'),api.get('/meta/departments')]);setRows(s.data);setFaculty(f.data);setStudents(st.data);setDepartments(m.data.departments);setClasses(m.data.classes)}useEffect(()=>{load()},[]);const filteredFaculty=faculty.filter(f=>f.department===form.department);async function add(e){e.preventDefault();try{await api.post('/subjects',form);setForm({});setMsg('Subject created');setError('');load()}catch(e){setError(errorOf(e))}}async function enrollSubject(id){try{const payload=enroll.mode==='individual'?{mode:'individual',studentId:enroll.studentId}:{mode:'class',batch:enroll.batch,classSection:enroll.classSection};const r=await api.post(`/subjects/${id}/enroll`,payload);setMsg(r.data.message);setError('')}catch(e){setError(errorOf(e))}}return <><PageTitle title="Manage Subjects" desc="Select subject department first, then only faculty from that department."/><div className="panel form-panel"><form className="grid two" onSubmit={add}><label>Subject code<input value={form.code||''} onChange={e=>setForm({...form,code:e.target.value})} required/></label><label>Subject name<input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} required/></label><label>Department<select value={form.department||''} onChange={e=>setForm({...form,department:e.target.value,facultyId:''})} required><option value="">Select department first</option>{departments.map(d=><option key={d}>{d}</option>)}</select></label><label>Faculty (select one or more)<select multiple value={form.facultyIds||[]} onChange={e=>setForm({...form,facultyIds:Array.from(e.target.selectedOptions,o=>o.value),facultyId:Array.from(e.target.selectedOptions,o=>o.value)[0]||''})} disabled={!form.department} required>{filteredFaculty.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><small>Hold Ctrl (Windows) or Command (Mac) to select multiple faculty.</small></label><label>Semester<input type="number" min="1" max="12" value={form.semester||''} onChange={e=>setForm({...form,semester:Number(e.target.value)})} required/></label><button className="btn">Create Subject</button></form></div><div className="panel form-panel"><h3>Enroll Students</h3><div className="tabs"><button className={enroll.mode==='individual'?'selected':''} onClick={()=>setEnroll({mode:'individual'})}>Individual student</button><button className={enroll.mode==='class'?'selected':''} onClick={()=>setEnroll({mode:'class'})}>Entire class</button></div><div className="grid two"><label>Subject<select value={enroll.subjectId||''} onChange={e=>setEnroll({...enroll,subjectId:e.target.value})}><option value="">Select subject</option>{rows.map(s=><option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select></label>{enroll.mode==='individual'?<label>Student<select value={enroll.studentId||''} onChange={e=>setEnroll({...enroll,studentId:e.target.value})}><option value="">Select student</option>{students.map(s=><option key={s.id} value={s.id}>{s.userCode} — {s.name} · {s.department} · {s.batch}/{s.classSection}</option>)}</select></label>:<><label>Batch<input placeholder="e.g. 2026-2030" value={enroll.batch||''} onChange={e=>setEnroll({...enroll,batch:e.target.value})}/></label><label>Class<select value={enroll.classSection||''} onChange={e=>setEnroll({...enroll,classSection:e.target.value})}><option value="">Select class</option>{classes.map(c=><option key={c}>{c}</option>)}</select></label></>}</div><button className="btn" disabled={!enroll.subjectId||(enroll.mode==='individual'?!enroll.studentId:!enroll.batch||!enroll.classSection)} onClick={()=>enrollSubject(enroll.subjectId)}>Enroll {enroll.mode==='class'?'class':'student'}</button>{msg&&<div className="success-box">{msg}</div>}{error&&<div className="error-box">{error}</div>}</div><div className="panel table-wrap"><table><thead><tr><th>Code</th><th>Subject</th><th>Department</th><th>Faculty</th><th>Semester</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.code}</td><td>{r.name}</td><td>{r.department}</td><td>{r.facultyName}</td><td>{r.semester}</td></tr>)}</tbody></table></div></>}
function ClassManagement(){
 const [classes,setClasses]=useState([]),[subjects,setSubjects]=useState([]),[faculty,setFaculty]=useState([]),[students,setStudents]=useState([]),[meta,setMeta]=useState({departments:[],classes:[]}),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [classForm,setClassForm]=useState({name:'',department:'',batch:'',section:'',semester:1,studentIds:[]});
 const [assign,setAssign]=useState({classId:'',subjectId:'',facultyIds:[],type:'regular',studentIds:[],title:''});
 async function load(){try{const [c,s,f,st,m]=await Promise.all([api.get('/classes'),api.get('/subjects'),api.get('/faculty'),api.get('/students'),api.get('/meta/departments')]);setClasses(c.data);setSubjects(s.data);setFaculty(f.data);setStudents(st.data);setMeta(m.data)}catch(e){setError(errorOf(e))}}
 useEffect(()=>{load()},[]);
 const selectedClass=classes.find(c=>c.id===assign.classId);
 const eligibleStudents=students.filter(s=>selectedClass&&s.department===selectedClass.department&&s.batch===selectedClass.batch&&s.classSection===selectedClass.section);
 const eligibleFaculty=faculty.filter(f=>{const sub=subjects.find(x=>x.id===assign.subjectId);return !sub||f.department===sub.department});
 async function createClass(e){e.preventDefault();setMessage('');setError('');try{const r=await api.post('/classes',classForm);setMessage('Class created successfully.');setClassForm({name:'',department:'',batch:'',section:'',semester:1,studentIds:[]});await load()}catch(e){setError(errorOf(e))}}
 async function createAssignment(e){e.preventDefault();setMessage('');setError('');try{const r=await api.post('/teaching-assignments',assign);setMessage(r.data.message);setAssign({classId:'',subjectId:'',facultyIds:[],type:'regular',studentIds:[],title:''});await load()}catch(e){setError(errorOf(e))}}
 return <><PageTitle title="Classes & Teaching Assignments" desc="Create academic classes, assign subjects and faculty teams, or run special classes for selected students."/>
 <div className="panel form-panel"><h3>1. Create a class</h3><p>Students are selected from the matching department, batch and section. Create student accounts first.</p><form className="grid two" onSubmit={createClass}>
 <label>Class name<input placeholder="e.g. CSE - 2nd Year - A" value={classForm.name} onChange={e=>setClassForm({...classForm,name:e.target.value})} required/></label>
 <label>Department<select value={classForm.department} onChange={e=>setClassForm({...classForm,department:e.target.value,studentIds:[]})} required><option value="">Select department</option>{meta.departments.map(d=><option key={d}>{d}</option>)}</select></label>
 <label>Batch<input placeholder="e.g. 2025-2029" value={classForm.batch} onChange={e=>setClassForm({...classForm,batch:e.target.value,studentIds:[]})} required/></label>
 <label>Section<select value={classForm.section} onChange={e=>setClassForm({...classForm,section:e.target.value,studentIds:[]})} required><option value="">Select section</option>{meta.classes.map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Semester<input type="number" min="1" max="12" value={classForm.semester} onChange={e=>setClassForm({...classForm,semester:Number(e.target.value)})} required/></label>
 <label>Students (optional, multiple)<select multiple value={classForm.studentIds} onChange={e=>setClassForm({...classForm,studentIds:Array.from(e.target.selectedOptions,o=>o.value)})}>{students.filter(st=>st.department===classForm.department&&st.batch===classForm.batch&&st.classSection===classForm.section).map(st=><option key={st.id} value={st.id}>{st.userCode} — {st.name}</option>)}</select><small>Hold Ctrl to select multiple students.</small></label>
 <button className="btn">Create Class</button></form></div>
 <div className="panel form-panel"><h3>2. Assign subject and faculty to a class</h3><form className="grid two" onSubmit={createAssignment}>
 <label>Class<select value={assign.classId} onChange={e=>setAssign({...assign,classId:e.target.value,studentIds:[]})} required><option value="">Select class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} · Sem {c.semester} · {c.batch}</option>)}</select></label>
 <label>Subject<select value={assign.subjectId} onChange={e=>setAssign({...assign,subjectId:e.target.value,facultyIds:[]})} required><option value="">Select subject</option>{subjects.filter(sub=>!selectedClass||(sub.department===selectedClass.department&&Number(sub.semester)===Number(selectedClass.semester))).map(sub=><option key={sub.id} value={sub.id}>{sub.code} — {sub.name}</option>)}</select></label>
 <label>Faculty (multiple allowed)<select multiple value={assign.facultyIds} onChange={e=>setAssign({...assign,facultyIds:Array.from(e.target.selectedOptions,o=>o.value)})} required>{eligibleFaculty.map(f=><option key={f.id} value={f.id}>{f.name} · {f.department}</option>)}</select><small>Hold Ctrl to assign more than one faculty member.</small></label>
 <label>Class type<select value={assign.type} onChange={e=>setAssign({...assign,type:e.target.value,studentIds:[]})}><option value="regular">Regular class — all class students</option><option value="special">Special class — selected students only</option></select></label>
 {assign.type==='special'&&<label>Selected students<select multiple value={assign.studentIds} onChange={e=>setAssign({...assign,studentIds:Array.from(e.target.selectedOptions,o=>o.value)})} required>{eligibleStudents.map(st=><option key={st.id} value={st.id}>{st.userCode} — {st.name}</option>)}</select><small>Only these students can attend this special class.</small></label>}
 {assign.type==='special'&&<label>Special class title<input placeholder="e.g. Advanced React Workshop" value={assign.title} onChange={e=>setAssign({...assign,title:e.target.value})} required/></label>}
 <button className="btn" disabled={!assign.classId||!assign.subjectId||!assign.facultyIds.length||(assign.type==='special'&&!assign.studentIds.length)}>Save Teaching Assignment</button></form>
 {message&&<div className="success-box">{message}</div>}{error&&<div className="error-box">{error}</div>}</div>
 <div className="panel table-wrap"><h3>Existing classes</h3><table><thead><tr><th>Class</th><th>Department</th><th>Batch</th><th>Section</th><th>Semester</th><th>Students</th></tr></thead><tbody>{classes.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.department}</td><td>{c.batch}</td><td>{c.section}</td><td>{c.semester}</td><td>{c.studentIds?.length||0}</td></tr>)}</tbody></table></div>
 </>;
}

function App(){return <Routes><Route path="/" element={<Landing/>}/><Route path="/login" element={<Login/>}/><Route path="/student" element={<Protected role="student"><StudentDashboard/></Protected>}/><Route path="/student/scan" element={<Protected role="student"><Scanner/></Protected>}/><Route path="/student/attendance" element={<Protected role="student"><MyAttendance/></Protected>}/><Route path="/student/percentage" element={<Protected role="student"><Percentage/></Protected>}/><Route path="/faculty" element={<Protected role="faculty"><FacultyDashboard/></Protected>}/><Route path="/faculty/qr" element={<Protected role="faculty"><QRGenerator/></Protected>}/><Route path="/faculty/manual" element={<Protected role="faculty"><ManualAttendance/></Protected>}/><Route path="/faculty/reports" element={<Protected role="faculty"><Reports/></Protected>}/><Route path="/admin" element={<Protected role="admin"><AdminDashboard/></Protected>}/><Route path="/admin/students" element={<Protected role="admin"><Crud type="students"/></Protected>}/><Route path="/admin/faculty" element={<Protected role="admin"><Crud type="faculty"/></Protected>}/><Route path="/admin/subjects" element={<Protected role="admin"><Subjects/></Protected>}/><Route path="/admin/classes" element={<Protected role="admin"><ClassManagement/></Protected>}/><Route path="/admin/attendance" element={<Protected role="admin"><ManualAttendance admin/></Protected>}/><Route path="/admin/location" element={<Protected role="admin"><LocationSettings/></Protected>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}
function MyAttendance(){const[rows,setRows]=useState([]);useEffect(()=>{api.get('/attendance/my').then(r=>setRows(r.data))},[]);return <><PageTitle title="My Attendance" desc="Your complete attendance history."/><div className="panel table-wrap"><table><thead><tr><th>Date</th><th>Subject</th><th>Status</th><th>Method</th><th>Marked at</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.date}</td><td>{r.subjectCode} {r.subjectName}</td><td>{r.status}</td><td>{r.method}</td><td>{new Date(r.markedAt).toLocaleString()}</td></tr>)}</tbody></table></div></>}
function Percentage(){const[rows,setRows]=useState([]);useEffect(()=>{api.get('/attendance/percentage').then(r=>setRows(r.data))},[]);return <><PageTitle title="Attendance Percentage" desc="Subject-wise attendance."/><div className="grid three">{rows.map(r=><div className="panel percentage-card" key={r.id}><span>{r.code}</span><h3>{r.name}</h3><div className="big-percent">{r.percentage}%</div><small>{r.present} present · {r.absent} absent · {r.late} late</small></div>)}</div></>}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
