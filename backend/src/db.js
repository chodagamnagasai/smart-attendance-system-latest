import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sqlJsDistDir = path.dirname(require.resolve('sql.js'));
const dbFile = process.env.DB_FILE || './data/attendance.db';
const absolute = path.resolve(process.cwd(), dbFile);
fs.mkdirSync(path.dirname(absolute), { recursive: true });

let sqlite = null;
export let db = null;

function saveDatabase() {
  if (!sqlite) return;
  const data = sqlite.export();
  fs.writeFileSync(absolute, Buffer.from(data));
}

function normalizeParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

function createStatement(sql) {
  return {
    get(...params) {
      const statement = sqlite.prepare(sql);
      try {
        statement.bind(normalizeParams(params));
        return statement.step() ? statement.getAsObject() : undefined;
      } finally {
        statement.free();
      }
    },
    all(...params) {
      const statement = sqlite.prepare(sql);
      const rows = [];
      try {
        statement.bind(normalizeParams(params));
        while (statement.step()) rows.push(statement.getAsObject());
        return rows;
      } finally {
        statement.free();
      }
    },
    run(...params) {
      const statement = sqlite.prepare(sql);
      try {
        statement.bind(normalizeParams(params));
        while (statement.step()) { /* consume statements that return rows */ }
      } finally {
        statement.free();
      }
      const lastInsertRowid = sqlite.exec('SELECT last_insert_rowid() AS id')[0]?.values?.[0]?.[0] ?? 0;
      const changes = sqlite.getRowsModified();
      saveDatabase();
      return { lastInsertRowid, changes };
    }
  };
}

export async function initDb() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(sqlJsDistDir, file)
  });

  const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute) : undefined;
  sqlite = existing ? new SQL.Database(existing) : new SQL.Database();

  sqlite.exec('PRAGMA foreign_keys = ON;');
  db = {
    prepare: createStatement,
    exec(sql) {
      const result = sqlite.exec(sql);
      saveDatabase();
      return result;
    }
  };

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','faculty','student')),
      department TEXT DEFAULT '',
      semester INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      faculty_id INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      department TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(faculty_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      UNIQUE(student_id, subject_id),
      FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      faculty_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      starts_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
      FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY(faculty_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      student_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'present' CHECK(status IN ('present','absent','late')),
      method TEXT NOT NULL DEFAULT 'qr' CHECK(method IN ('qr','manual')),
      UNIQUE(student_id, subject_id, attendance_date),
      FOREIGN KEY(session_id) REFERENCES attendance_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );
  `);

  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (Number(count) === 0) seed();
  else saveDatabase();
}

function seed() {
  const password = bcrypt.hashSync('Password@123', 10);
  const insertUser = db.prepare(`INSERT INTO users (user_code,name,email,password_hash,role,department,semester) VALUES (?,?,?,?,?,?,?)`);
  const admin = insertUser.run('admin001','System Administrator','admin@smartattendance.local',password,'admin','Administration',null).lastInsertRowid;
  const faculty = insertUser.run('faculty001','Dr. Priya Sharma','faculty@smartattendance.local',password,'faculty','Computer Science',6).lastInsertRowid;
  const student = insertUser.run('student001','Rahul Kumar','student@smartattendance.local',password,'student','Computer Science',6).lastInsertRowid;
  const subject = db.prepare(`INSERT INTO subjects (code,name,faculty_id,semester,department) VALUES (?,?,?,?,?)`).run('FSD2','Full Stack Development 2',faculty,6,'Computer Science').lastInsertRowid;
  db.prepare('INSERT INTO enrollments (student_id,subject_id) VALUES (?,?)').run(student, subject);
  void admin;
  console.log('Seeded demo data. Password for all demo users: Password@123');
}
