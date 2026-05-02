const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDb, db } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/auth', require('./authRoutes'));
app.use('/api/projects', require('./projectRoutes'));
app.use('/api/projects/:projectId/tasks', require('./taskRoutes'));
app.use('/api/dashboard', require('./dashboardRoutes'));

// Users search
const { auth } = require('./middleware');
app.get('/api/users/search', auth, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    const users = db.prepare(`
      SELECT id, name, email, role FROM users 
      WHERE (name LIKE ? OR email LIKE ?) 
      AND id != ?
      LIMIT 10
    `).all(`%${q}%`, `%${q}%`, req.user.id);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize DB then start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`TaskFlow running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
