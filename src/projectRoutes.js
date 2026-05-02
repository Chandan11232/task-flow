const express = require('express');
const { db } = require('./db');
const { auth } = require('./middleware');

const router = express.Router();

// Helper: check if user is project admin
function isProjectAdmin(projectId, userId) {
  const pm = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  return pm && pm.role === 'admin';
}

// Helper: check if user is in project
function isProjectMember(projectId, userId) {
  return !!db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

// Get all projects for current user
router.get('/', auth, (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, u.name as owner_name, pm.role as my_role,
      (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_count
    FROM projects p
    JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    JOIN users u ON u.id = p.owner_id
    ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json(projects);
});

// Create project (any authenticated user becomes admin of their project)
router.post('/', auth, (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });

  const result = db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)').run(name.trim(), description?.trim() || null, req.user.id);
  // Auto-add creator as admin
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(result.lastInsertRowid, req.user.id, 'admin');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
});

// Get single project
router.get('/:id', auth, (req, res) => {
  const projectId = parseInt(req.params.id);
  if (!isProjectMember(projectId, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const project = db.prepare(`
    SELECT p.*, u.name as owner_name, pm.role as my_role
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE p.id = ?
  `).get(req.user.id, projectId);

  if (!project) return res.status(404).json({ error: 'Project not found' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, pm.role, pm.joined_at
    FROM project_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
    ORDER BY pm.role DESC, u.name ASC
  `).all(projectId);

  res.json({ ...project, members });
});

// Update project (project admin only)
router.put('/:id', auth, (req, res) => {
  const projectId = parseInt(req.params.id);
  if (!isProjectAdmin(projectId, req.user.id)) return res.status(403).json({ error: 'Project admin access required' });

  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });

  db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(name.trim(), description?.trim() || null, projectId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  res.json(project);
});

// Delete project (project admin only)
router.delete('/:id', auth, (req, res) => {
  const projectId = parseInt(req.params.id);
  if (!isProjectAdmin(projectId, req.user.id)) return res.status(403).json({ error: 'Project admin access required' });

  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  res.json({ message: 'Project deleted' });
});

// Add member to project
router.post('/:id/members', auth, (req, res) => {
  const projectId = parseInt(req.params.id);
  if (!isProjectAdmin(projectId, req.user.id)) return res.status(403).json({ error: 'Project admin access required' });

  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'No user found with that email' });

  const memberRole = role === 'admin' ? 'admin' : 'member';
  try {
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, user.id, memberRole);
    res.json({ ...user, role: memberRole });
  } catch {
    return res.status(409).json({ error: 'User is already a project member' });
  }
});

// Remove member from project
router.delete('/:id/members/:userId', auth, (req, res) => {
  const projectId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);

  if (!isProjectAdmin(projectId, req.user.id)) return res.status(403).json({ error: 'Project admin access required' });
  if (targetUserId === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself from project' });

  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, targetUserId);
  res.json({ message: 'Member removed' });
});

// Update member role
router.put('/:id/members/:userId', auth, (req, res) => {
  const projectId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  if (!isProjectAdmin(projectId, req.user.id)) return res.status(403).json({ error: 'Project admin access required' });

  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  db.prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?').run(role, projectId, targetUserId);
  res.json({ message: 'Role updated' });
});

module.exports = router;
