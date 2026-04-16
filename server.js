const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 5000;
const DB_PATH = path.join(process.cwd(), 'bookings.db');

const TIME_SLOTS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

app.use(express.json());

let db;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, time)
    )
  `);
  saveDb();
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

app.get('/api/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date required' });
  const taken = query('SELECT time FROM bookings WHERE date = ?', [date]).map(r => r.time);
  res.json({ slots: TIME_SLOTS.map(t => ({ time: t, available: !taken.includes(t) })) });
});

app.post('/api/book', (req, res) => {
  const { name, phone, date, time } = req.body;
  if (!name || !phone || !date || !time) return res.status(400).json({ error: 'All fields required' });
  if (!TIME_SLOTS.includes(time)) return res.status(400).json({ error: 'Invalid time slot' });
  try {
    const existing = query('SELECT id FROM bookings WHERE date = ? AND time = ?', [date, time]);
    if (existing.length > 0) return res.status(409).json({ error: 'This time slot is already booked' });
    run('INSERT INTO bookings (name, phone, date, time) VALUES (?, ?, ?, ?)', [name.trim(), phone.trim(), date, time]);
    res.status(201).json({ message: 'Booking confirmed!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/bookings', (req, res) => {
  res.json(query('SELECT * FROM bookings ORDER BY date DESC, time DESC'));
});

app.delete('/api/bookings/:id', (req, res) => {
  const existing = query('SELECT id FROM bookings WHERE id = ?', [req.params.id]);
  if (existing.length === 0) return res.status(404).json({ error: 'Not found' });
  run('DELETE FROM bookings WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Booking System</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #1f2937; line-height: 1.5; }
  .navbar { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; }
  .logo { font-size: 1.25rem; font-weight: 700; color: #2563eb; }
  .nav-links { display: flex; gap: 1.25rem; }
  .nav-links a { color: #4b5563; text-decoration: none; font-weight: 500; cursor: pointer; }
  .nav-links a.active { color: #2563eb; }
  .main { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
  .card { background: #fff; border-radius: 12px; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .card h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  .subtitle { color: #6b7280; margin-bottom: 1.75rem; }
  .form { display: flex; flex-direction: column; gap: 1.25rem; }
  .field { display: flex; flex-direction: column; gap: 0.5rem; }
  .field label { font-weight: 500; font-size: 0.9rem; color: #374151; }
  .field input { padding: 0.7rem 0.9rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 1rem; font-family: inherit; }
  .field input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
  .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 0.5rem; }
  .slot { padding: 0.6rem; border: 1px solid #d1d5db; background: #fff; border-radius: 8px; cursor: pointer; font-size: 0.95rem; font-family: inherit; }
  .slot:hover:not(:disabled) { border-color: #2563eb; background: #eff6ff; }
  .slot.selected { background: #2563eb; color: #fff; border-color: #2563eb; }
  .slot.taken { background: #f3f4f6; color: #9ca3af; text-decoration: line-through; cursor: not-allowed; }
  .btn-primary { padding: 0.85rem 1rem; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; font-family: inherit; }
  .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-danger { padding: 0.4rem 0.75rem; background: #ef4444; color: #fff; border: none; border-radius: 6px; font-size: 0.85rem; cursor: pointer; font-family: inherit; }
  .btn-danger:hover { background: #dc2626; }
  .alert { padding: 0.85rem 1rem; border-radius: 8px; font-size: 0.95rem; }
  .alert.success { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
  .alert.error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .muted { color: #9ca3af; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
  th { background: #f9fafb; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; }
  .table-wrap { overflow-x: auto; }
  @media (max-width: 600px) { .card { padding: 1.25rem; } .card h1 { font-size: 1.4rem; } }
</style>
</head>
<body>
<nav class="navbar">
  <span class="logo">📅 BookEasy</span>
  <div class="nav-links">
    <a id="nav-book" class="active">Book</a>
    <a id="nav-admin">Admin</a>
  </div>
</nav>
<main class="main" id="app"></main>
<script>
const app = document.getElementById('app');
const navBook = document.getElementById('nav-book');
const navAdmin = document.getElementById('nav-admin');
let view = 'book';

navBook.onclick = () => { view = 'book'; render(); };
navAdmin.onclick = () => { view = 'admin'; render(); };

function render() {
  navBook.className = view === 'book' ? 'active' : '';
  navAdmin.className = view === 'admin' ? 'active' : '';
  if (view === 'book') renderBooking(); else renderAdmin();
}

function renderBooking() {
  const today = new Date().toISOString().split('T')[0];
  app.innerHTML = \`
    <div class="card">
      <h1>Book an Appointment</h1>
      <p class="subtitle">Pick a date and time that works for you</p>
      <form id="form" class="form">
        <div class="field"><label>Date</label><input type="date" id="date" value="\${today}" min="\${today}" required></div>
        <div class="field"><label>Available Time Slots</label><div class="slots" id="slots"></div></div>
        <div class="field"><label>Your Name</label><input type="text" id="name" placeholder="John Doe" required></div>
        <div class="field"><label>Phone Number</label><input type="tel" id="phone" placeholder="+374 55 000 000" required></div>
        <div id="alert"></div>
        <button type="submit" class="btn-primary" id="submit">Confirm Booking</button>
      </form>
    </div>\`;
  let selectedTime = '';
  const dateEl = document.getElementById('date');
  const slotsEl = document.getElementById('slots');
  const alertEl = document.getElementById('alert');

  async function loadSlots() {
    const date = dateEl.value;
    if (!date) return;
    try {
      const res = await fetch('/api/slots?date=' + date);
      const data = await res.json();
      slotsEl.innerHTML = data.slots.map(s => \`<button type="button" class="slot \${!s.available ? 'taken' : ''} \${s.time === selectedTime ? 'selected' : ''}" data-time="\${s.time}" \${!s.available ? 'disabled' : ''}>\${s.time}</button>\`).join('');
      slotsEl.querySelectorAll('button').forEach(b => {
        b.onclick = () => { selectedTime = b.dataset.time; loadSlots(); };
      });
    } catch { slotsEl.innerHTML = '<p class="muted">Error loading slots</p>'; }
  }
  dateEl.onchange = () => { selectedTime = ''; loadSlots(); };
  loadSlots();

  document.getElementById('form').onsubmit = async (e) => {
    e.preventDefault();
    alertEl.innerHTML = '';
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const date = dateEl.value;
    if (!name || !phone || !date || !selectedTime) {
      alertEl.innerHTML = '<div class="alert error">Please fill all fields and pick a time.</div>';
      return;
    }
    const btn = document.getElementById('submit');
    btn.disabled = true; btn.textContent = 'Booking...';
    try {
      const res = await fetch('/api/book', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, phone, date, time: selectedTime })});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');
      alertEl.innerHTML = \`<div class="alert success">✅ Booking confirmed for \${date} at \${selectedTime}!</div>\`;
      document.getElementById('name').value = '';
      document.getElementById('phone').value = '';
      selectedTime = '';
      loadSlots();
    } catch (err) {
      alertEl.innerHTML = '<div class="alert error">' + err.message + '</div>';
    } finally {
      btn.disabled = false; btn.textContent = 'Confirm Booking';
    }
  };
}

async function renderAdmin() {
  app.innerHTML = '<div class="card"><h1>Admin Panel</h1><p class="subtitle">All bookings</p><div id="list">Loading...</div></div>';
  try {
    const res = await fetch('/api/bookings');
    const bookings = await res.json();
    const listEl = document.getElementById('list');
    if (bookings.length === 0) { listEl.innerHTML = '<p class="muted">No bookings yet.</p>'; return; }
    listEl.innerHTML = \`<div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Date</th><th>Time</th><th></th></tr></thead>
      <tbody>\${bookings.map(b => \`<tr><td>\${b.id}</td><td>\${b.name}</td><td>\${b.phone}</td><td>\${b.date}</td><td>\${b.time}</td><td><button class="btn-danger" data-id="\${b.id}">Delete</button></td></tr>\`).join('')}</tbody>
    </table></div>\`;
    listEl.querySelectorAll('[data-id]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this booking?')) return;
        await fetch('/api/bookings/' + btn.dataset.id, { method: 'DELETE' });
        renderAdmin();
      };
    });
  } catch { document.getElementById('list').innerHTML = '<div class="alert error">Failed to load bookings</div>'; }
}

render();
</script>
</body>
</html>`;

app.get('/', (req, res) => res.send(HTML));
app.get('/admin', (req, res) => res.send(HTML));

initDatabase().then(() => {
  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log('');
    console.log('===============================================');
    console.log('   Booking System is running!');
    console.log('');
    console.log('   Open in browser: ' + url);
    console.log('   Admin panel:     ' + url + '/admin');
    console.log('');
    console.log('   To stop: close this window');
    console.log('===============================================');
    console.log('');
    if (process.platform === 'win32') {
      exec(`start ${url}`);
    } else if (process.platform === 'darwin') {
      exec(`open ${url}`);
    } else {
      exec(`xdg-open ${url}`);
    }
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
