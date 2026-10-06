import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initDb, closeDb, User } from '../src/db.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const { userCode, name, email, password } = args;
if (!userCode || !name || !email || !password) {
  console.error('Usage: npm run create-admin -- --userCode ADMIN001 --name "System Admin" --email admin@example.com --password "StrongPassword123"');
  process.exit(1);
}
if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
  console.error('Password must be at least 12 characters and contain uppercase, lowercase and a number.');
  process.exit(1);
}
await initDb();
try {
  const existing = await User.findOne({ $or: [{ userCode: userCode.toUpperCase() }, { email: email.toLowerCase() }] });
  if (existing) { console.error('A user with that ID or email already exists.'); process.exitCode = 1; }
  else { const user = await User.create({ userCode, name, email, passwordHash: await bcrypt.hash(password, 12), role: 'admin', department: 'Administration' }); console.log(`Admin created successfully: ${user.userCode} (${user.email})`); }
} finally { await closeDb(); }
