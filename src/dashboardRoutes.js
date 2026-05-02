const express = require('express');
const { db } = require('./db');
const { auth } = require('./middleware');

const router = express.Router();

router.get('/', auth, (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().split('T')[0];

  // Projects user is in
  const totalProjects = db.prepare(`
    SELECT COUNT(*) as count FROM project_members WHERE user_id = ?
  `).get(userId).count;

  // All tasks in user's projects
  const taskStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN t.due_date < ? AND t.status != 'done' THEN 1 ELSE 0 END) as overdue
    FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
  `).get(today, userId);

  // Tasks assigned to me
  const myTasks = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN t.due_date < ? AND t.status != 'done' THEN 1 ELSE 0 END) as overdue
    FROM tasks t WHERE t.assignee_id = ?
  `).get(today, userId);

  // Recent tasks (across all my projects)
  const recentTasks = db.prepare(`
    SELECT t.*, p.name as project_name, u.name as assignee_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_id
    JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
    ORDER BY t.updated_at DESC
    LIMIT 8
  `).all(userId);

  // Overdue tasks
  const overdueTasks = db.prepare(`
    SELECT t.*, p.name as project_name, u.name as assignee_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_id
    JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
    WHERE t.due_date < ? AND t.status != 'done'
    ORDER BY t.due_date ASC
    LIMIT 5
  `).all(userId, today);

  // My assigned tasks
  const myAssignedTasks = db.prepare(`
    SELECT t.*, p.name as project_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.assignee_id = ? AND t.status != 'done'
    ORDER BY t.due_date ASC NULLS LAST
    LIMIT 5
  `).all(userId);

  res.json({
    stats: {
      totalProjects,
      ...taskStats,
      myTasks
    },
    recentTasks,
    overdueTasks,
    myAssignedTasks
  });
});

module.exports = router;
