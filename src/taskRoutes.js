const express = require('express');
const { db } = require('./db');
const { auth } = require('./middleware');

const router = express.Router({ mergeParams: true });

function isProjectMember(projectId, userId) {
  return !!db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}
function isProjectAdmin(projectId, userId) {
  const pm = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  return pm && pm.role === 'admin';
}

// Get all tasks for a project
router.get('/', auth, (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (!isProjectMember(projectId, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const tasks = db.prepare(`
    SELECT t.*, 
      u1.name as assignee_name, u1.email as assignee_email,
      u2.name as creator_name
    FROM tasks t
    LEFT JOIN users u1 ON u1.id = t.assignee_id
    JOIN users u2 ON u2.id = t.created_by
    WHERE t.project_id = ?
    ORDER BY 
      CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
  `).all(projectId);

  res.json(tasks);
});

// Create task
router.post('/', auth, (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (!isProjectMember(projectId, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const { title, description, assignee_id, priority, due_date } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required' });

  const validPriorities = ['low', 'medium', 'high'];
  const taskPriority = validPriorities.includes(priority) ? priority : 'medium';

  // Validate assignee is in project
  if (assignee_id && !isProjectMember(projectId, assignee_id)) {
    return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  // Validate due_date
  let parsedDate = null;
  if (due_date) {
    parsedDate = due_date;
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, project_id, assignee_id, created_by, priority, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title.trim(), description?.trim() || null, projectId, assignee_id || null, req.user.id, taskPriority, parsedDate);

  const task = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u2.name as creator_name
    FROM tasks t
    LEFT JOIN users u1 ON u1.id = t.assignee_id
    JOIN users u2 ON u2.id = t.created_by
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(task);
});

// Update task
router.put('/:taskId', auth, (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const taskId = parseInt(req.params.taskId);

  if (!isProjectMember(projectId, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Only task creator, assignee, or project admin can edit
  const canEdit = task.created_by === req.user.id || task.assignee_id === req.user.id || isProjectAdmin(projectId, req.user.id);
  if (!canEdit) return res.status(403).json({ error: 'You do not have permission to edit this task' });

  const { title, description, assignee_id, status, priority, due_date } = req.body;
  if (title !== undefined && !title.trim()) return res.status(400).json({ error: 'Task title cannot be empty' });

  const validStatuses = ['todo', 'in_progress', 'done'];
  const validPriorities = ['low', 'medium', 'high'];

  const updatedTitle = (title !== undefined ? title.trim() : task.title);
  const updatedDesc = (description !== undefined ? description?.trim() || null : task.description);
  const updatedAssignee = (assignee_id !== undefined ? assignee_id || null : task.assignee_id);
  const updatedStatus = validStatuses.includes(status) ? status : task.status;
  const updatedPriority = validPriorities.includes(priority) ? priority : task.priority;
  const updatedDue = (due_date !== undefined ? due_date || null : task.due_date);

  // Validate new assignee
  if (updatedAssignee && !isProjectMember(projectId, updatedAssignee)) {
    return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  db.prepare(`
    UPDATE tasks SET title=?, description=?, assignee_id=?, status=?, priority=?, due_date=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(updatedTitle, updatedDesc, updatedAssignee, updatedStatus, updatedPriority, updatedDue, taskId);

  const updated = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u2.name as creator_name
    FROM tasks t
    LEFT JOIN users u1 ON u1.id = t.assignee_id
    JOIN users u2 ON u2.id = t.created_by
    WHERE t.id = ?
  `).get(taskId);

  res.json(updated);
});

// Delete task
router.delete('/:taskId', auth, (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const taskId = parseInt(req.params.taskId);

  if (!isProjectMember(projectId, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const canDelete = task.created_by === req.user.id || isProjectAdmin(projectId, req.user.id);
  if (!canDelete) return res.status(403).json({ error: 'Only task creator or project admin can delete tasks' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  res.json({ message: 'Task deleted' });
});

module.exports = router;
