/* ============================================================
   TaskFlow Frontend — Single Page App
   ============================================================ */

let currentUser = null;
let token = localStorage.getItem('tf_token');
let currentProjectId = null;
let currentProject = null;
let currentTasks = [];
let editingTaskId = null;
let allMyTasks = [];

// ============================================================
// API HELPER
// ============================================================
async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ============================================================
// INIT
// ============================================================
async function init() {
  if (token) {
    try {
      currentUser = await api('GET', '/api/auth/me');
      showApp();
      navigate('dashboard');
    } catch {
      token = null;
      localStorage.removeItem('tf_token');
      showAuth();
    }
  } else {
    showAuth();
  }
}

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  // Update sidebar user info
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-role').textContent = currentUser.role;
  document.getElementById('sidebar-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
}

// ============================================================
// AUTH
// ============================================================
function showTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signup-form').classList.toggle('hidden', tab !== 'signup');
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
  });
  hideError('login-error');
  hideError('signup-error');
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  hideError('login-error');
  try {
    const data = await api('POST', '/api/auth/login', { email, password });
    token = data.token;
    localStorage.setItem('tf_token', token);
    currentUser = data.user;
    showApp();
    navigate('dashboard');
  } catch (err) {
    showError('login-error', err.message);
  }
}

async function signup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const role = document.getElementById('signup-role').value;
  hideError('signup-error');
  try {
    const data = await api('POST', '/api/auth/signup', { name, email, password, role });
    token = data.token;
    localStorage.setItem('tf_token', token);
    currentUser = data.user;
    showApp();
    navigate('dashboard');
  } catch (err) {
    showError('signup-error', err.message);
  }
}

async function logout() {
  try { await api('POST', '/api/auth/logout'); } catch {}
  token = null;
  currentUser = null;
  localStorage.removeItem('tf_token');
  showAuth();
}

// Allow Enter key in auth forms
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const active = document.activeElement;
  if (active.closest('#login-form')) login();
  else if (active.closest('#signup-form')) signup();
});

// ============================================================
// NAVIGATION
// ============================================================
function navigate(page, id) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  if (page === 'dashboard') {
    document.getElementById('page-dashboard').classList.remove('hidden');
    document.querySelector('[data-page="dashboard"]').classList.add('active');
    loadDashboard();
  } else if (page === 'projects') {
    document.getElementById('page-projects').classList.remove('hidden');
    document.querySelector('[data-page="projects"]').classList.add('active');
    loadProjects();
  } else if (page === 'project-detail') {
    document.getElementById('page-project-detail').classList.remove('hidden');
    currentProjectId = id;
    loadProjectDetail(id);
  } else if (page === 'my-tasks') {
    document.getElementById('page-my-tasks').classList.remove('hidden');
    document.querySelector('[data-page="my-tasks"]').classList.add('active');
    loadMyTasks();
  }
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  try {
    const data = await api('GET', '/api/dashboard');
    renderStats(data.stats);
    renderRecentTasks(data.recentTasks);
    renderMyTasksDashboard(data.myAssignedTasks);
    renderOverdueTasks(data.overdueTasks);
  } catch (err) {
    showToast('Failed to load dashboard', 'error');
  }
}

function renderStats(stats) {
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Projects</div>
      <div class="stat-value">${stats.totalProjects}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Tasks</div>
      <div class="stat-value">${stats.total || 0}</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-label">In Progress</div>
      <div class="stat-value">${stats.in_progress || 0}</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">Completed</div>
      <div class="stat-value">${stats.done || 0}</div>
    </div>
    <div class="stat-card danger">
      <div class="stat-label">Overdue</div>
      <div class="stat-value">${stats.overdue || 0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Assigned to Me</div>
      <div class="stat-value">${stats.myTasks?.total || 0}</div>
    </div>
  `;
}

function renderRecentTasks(tasks) {
  const el = document.getElementById('recent-tasks-list');
  if (!tasks.length) { el.innerHTML = emptyState('No tasks yet', '📋'); return; }
  el.innerHTML = tasks.map(t => `
    <div class="task-item-mini">
      <div class="task-status-dot dot-${t.status}"></div>
      <div style="flex:1;min-width:0">
        <div class="task-mini-title ${t.status === 'done' ? 'done' : ''}">${esc(t.title)}</div>
        <div class="task-mini-meta">${esc(t.project_name)}${t.assignee_name ? ' · ' + esc(t.assignee_name) : ''}</div>
      </div>
      <div class="task-mini-badges">
        <span class="badge badge-${t.status}">${statusLabel(t.status)}</span>
        ${t.due_date && isOverdue(t.due_date) && t.status !== 'done' ? '<span class="badge badge-overdue">Overdue</span>' : ''}
      </div>
    </div>
  `).join('');
}

function renderMyTasksDashboard(tasks) {
  const el = document.getElementById('my-tasks-dashboard');
  if (!tasks.length) { el.innerHTML = emptyState('No tasks assigned', '✓'); return; }
  el.innerHTML = tasks.map(t => `
    <div class="task-item-mini">
      <div class="task-status-dot dot-${t.status}"></div>
      <div style="flex:1;min-width:0">
        <div class="task-mini-title">${esc(t.title)}</div>
        <div class="task-mini-meta">${esc(t.project_name)}${t.due_date ? ' · Due ' + formatDate(t.due_date) : ''}</div>
      </div>
      <span class="badge badge-${t.priority}">${t.priority}</span>
    </div>
  `).join('');
}

function renderOverdueTasks(tasks) {
  const el = document.getElementById('overdue-tasks-list');
  if (!tasks.length) { el.innerHTML = emptyState('No overdue tasks 🎉', ''); return; }
  el.innerHTML = tasks.map(t => `
    <div class="task-item-mini">
      <div class="task-status-dot" style="background:var(--danger)"></div>
      <div style="flex:1;min-width:0">
        <div class="task-mini-title">${esc(t.title)}</div>
        <div class="task-mini-meta">${esc(t.project_name)} · Due ${formatDate(t.due_date)}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// PROJECTS
// ============================================================
async function loadProjects() {
  const grid = document.getElementById('projects-grid');
  grid.innerHTML = `<div class="loading">Loading projects...</div>`;
  try {
    const projects = await api('GET', '/api/projects');
    if (!projects.length) {
      grid.innerHTML = emptyState('No projects yet. Create your first one!', '📁');
      return;
    }
    grid.innerHTML = projects.map(p => {
      const progress = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
      return `
        <div class="project-card" onclick="navigate('project-detail', ${p.id})">
          <div class="project-card-header">
            <div class="project-card-name">${esc(p.name)}</div>
            <span class="badge badge-${p.my_role}">${p.my_role}</span>
          </div>
          <div class="project-card-desc">${esc(p.description || 'No description')}</div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width:${progress}%"></div>
          </div>
          <div class="project-card-footer">
            <span>${p.member_count} member${p.member_count !== 1 ? 's' : ''}</span>
            <span>${p.done_count}/${p.task_count} tasks done</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    grid.innerHTML = emptyState('Failed to load projects', '⚠');
  }
}

async function createProject() {
  const name = document.getElementById('project-name-input').value.trim();
  const description = document.getElementById('project-desc-input').value.trim();
  hideError('create-project-error');
  if (!name) { showError('create-project-error', 'Project name is required'); return; }
  try {
    await api('POST', '/api/projects', { name, description });
    closeModal('create-project-modal');
    document.getElementById('project-name-input').value = '';
    document.getElementById('project-desc-input').value = '';
    loadProjects();
    showToast('Project created!', 'success');
  } catch (err) {
    showError('create-project-error', err.message);
  }
}

async function updateProject() {
  const name = document.getElementById('edit-project-name').value.trim();
  const description = document.getElementById('edit-project-desc').value.trim();
  hideError('edit-project-error');
  if (!name) { showError('edit-project-error', 'Project name is required'); return; }
  try {
    await api('PUT', `/api/projects/${currentProjectId}`, { name, description });
    closeModal('edit-project-modal');
    loadProjectDetail(currentProjectId);
    showToast('Project updated!', 'success');
  } catch (err) {
    showError('edit-project-error', err.message);
  }
}

function openEditProject() {
  if (!currentProject) return;
  document.getElementById('edit-project-name').value = currentProject.name;
  document.getElementById('edit-project-desc').value = currentProject.description || '';
  openModal('edit-project-modal');
}

function confirmDeleteProject() {
  openConfirmModal(
    'Delete Project',
    `Are you sure you want to delete "${currentProject?.name}"? This will also delete all tasks.`,
    async () => {
      try {
        await api('DELETE', `/api/projects/${currentProjectId}`);
        closeModal('confirm-modal');
        navigate('projects');
        showToast('Project deleted', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

// ============================================================
// PROJECT DETAIL
// ============================================================
async function loadProjectDetail(id) {
  try {
    currentProject = await api('GET', `/api/projects/${id}`);
    document.getElementById('project-detail-name').textContent = currentProject.name;

    // Render project action buttons (for admin)
    const actionsEl = document.getElementById('project-actions');
    if (currentProject.my_role === 'admin') {
      actionsEl.innerHTML = `
        <button class="btn btn-ghost" onclick="openEditProject()">Edit</button>
        <button class="btn btn-danger" onclick="confirmDeleteProject()">Delete</button>
      `;
      document.getElementById('add-member-btn').style.display = '';
      document.getElementById('add-task-btn').style.display = '';
    } else {
      actionsEl.innerHTML = '';
      document.getElementById('add-member-btn').style.display = 'none';
      // Members can still add tasks
      document.getElementById('add-task-btn').style.display = '';
    }

    renderMembers(currentProject.members);
    await loadTasks(id);
  } catch (err) {
    showToast('Failed to load project', 'error');
    navigate('projects');
  }
}

function renderMembers(members) {
  const list = document.getElementById('members-list');
  const isAdmin = currentProject?.my_role === 'admin';
  list.innerHTML = members.map(m => `
    <div class="member-item">
      <div class="member-avatar">${m.name.charAt(0).toUpperCase()}</div>
      <div class="member-info">
        <div class="member-name">${esc(m.name)}</div>
        <div class="member-email">${esc(m.email)}</div>
      </div>
      <div class="member-actions">
        <span class="badge badge-${m.role}">${m.role}</span>
        ${isAdmin && m.id !== currentUser.id ? `
          <button class="btn-icon" onclick="removeMember(${m.id}, '${esc(m.name)}')" title="Remove">
            <svg viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// ============================================================
// TASKS
// ============================================================
async function loadTasks(projectId) {
  const list = document.getElementById('tasks-list');
  list.innerHTML = `<div class="loading">Loading tasks...</div>`;
  try {
    currentTasks = await api('GET', `/api/projects/${projectId}/tasks`);
    const activeFilter = document.querySelector('.filter-tab.active')?.dataset?.filter || 'all';
    renderTasks(currentTasks, activeFilter);
  } catch {
    list.innerHTML = emptyState('Failed to load tasks', '⚠');
  }
}

function renderTasks(tasks, filter = 'all') {
  const list = document.getElementById('tasks-list');
  const today = new Date().toISOString().split('T')[0];
  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  if (!filtered.length) {
    list.innerHTML = emptyState(filter === 'all' ? 'No tasks yet. Add your first task!' : `No ${statusLabel(filter)} tasks`, '📋');
    return;
  }
  const isAdmin = currentProject?.my_role === 'admin';
  list.innerHTML = filtered.map(t => {
    const canEdit = t.created_by === currentUser.id || t.assignee_id === currentUser.id || isAdmin;
    const overdue = t.due_date && t.due_date < today && t.status !== 'done';
    return `
      <div class="task-row" data-id="${t.id}">
        <div class="task-check ${t.status === 'done' ? 'checked' : t.status === 'in_progress' ? 'in-progress' : ''}"
          onclick="cycleStatus(${t.id}, '${t.status}')" title="Click to change status"></div>
        <div class="task-body">
          <div class="task-title ${t.status === 'done' ? 'done' : ''}">${esc(t.title)}</div>
          <div class="task-meta">
            <span class="badge badge-${t.status}">${statusLabel(t.status)}</span>
            <span class="badge badge-${t.priority}">${t.priority}</span>
            ${t.assignee_name ? `<span class="task-meta-item">👤 ${esc(t.assignee_name)}</span>` : ''}
            ${t.due_date ? `<span class="task-meta-item ${overdue ? 'badge badge-overdue' : ''}">📅 ${formatDate(t.due_date)}</span>` : ''}
          </div>
          ${t.description ? `<div style="font-size:0.8125rem;color:var(--text-muted);margin-top:0.25rem;">${esc(t.description)}</div>` : ''}
        </div>
        <div class="task-row-actions">
          ${canEdit ? `<button class="btn-icon" onclick="openEditTaskModal(${t.id})" title="Edit">
            <svg viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>` : ''}
          ${(t.created_by === currentUser.id || isAdmin) ? `<button class="btn-icon" onclick="deleteTask(${t.id}, '${esc(t.title)}')" title="Delete">
            <svg viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function filterTasks(filter, btn) {
  document.querySelectorAll('#page-project-detail .filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  btn.dataset.filter = filter;
  renderTasks(currentTasks, filter);
}

async function cycleStatus(taskId, currentStatus) {
  const next = { todo: 'in_progress', in_progress: 'done', done: 'todo' };
  try {
    await api('PUT', `/api/projects/${currentProjectId}/tasks/${taskId}`, { status: next[currentStatus] });
    await loadTasks(currentProjectId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAddTaskModal() {
  editingTaskId = null;
  document.getElementById('task-modal-title').textContent = 'New Task';
  document.getElementById('task-modal-submit').textContent = 'Create Task';
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-desc-input').value = '';
  document.getElementById('task-priority-input').value = 'medium';
  document.getElementById('task-status-input').value = 'todo';
  document.getElementById('task-due-input').value = '';
  hideError('task-modal-error');
  populateAssigneeSelect();
  openModal('task-modal');
}

function openEditTaskModal(taskId) {
  const task = currentTasks.find(t => t.id === taskId);
  if (!task) return;
  editingTaskId = taskId;
  document.getElementById('task-modal-title').textContent = 'Edit Task';
  document.getElementById('task-modal-submit').textContent = 'Save Changes';
  document.getElementById('task-title-input').value = task.title;
  document.getElementById('task-desc-input').value = task.description || '';
  document.getElementById('task-priority-input').value = task.priority;
  document.getElementById('task-status-input').value = task.status;
  document.getElementById('task-due-input').value = task.due_date || '';
  hideError('task-modal-error');
  populateAssigneeSelect(task.assignee_id);
  openModal('task-modal');
}

function populateAssigneeSelect(selectedId) {
  const sel = document.getElementById('task-assignee-input');
  const members = currentProject?.members || [];
  sel.innerHTML = `<option value="">Unassigned</option>` +
    members.map(m => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

async function submitTask() {
  const title = document.getElementById('task-title-input').value.trim();
  const description = document.getElementById('task-desc-input').value.trim();
  const assignee_id = document.getElementById('task-assignee-input').value;
  const priority = document.getElementById('task-priority-input').value;
  const status = document.getElementById('task-status-input').value;
  const due_date = document.getElementById('task-due-input').value;
  hideError('task-modal-error');

  if (!title) { showError('task-modal-error', 'Task title is required'); return; }

  const payload = {
    title,
    description: description || null,
    assignee_id: assignee_id ? parseInt(assignee_id) : null,
    priority,
    status,
    due_date: due_date || null,
  };

  try {
    if (editingTaskId) {
      await api('PUT', `/api/projects/${currentProjectId}/tasks/${editingTaskId}`, payload);
      showToast('Task updated!', 'success');
    } else {
      await api('POST', `/api/projects/${currentProjectId}/tasks`, payload);
      showToast('Task created!', 'success');
    }
    closeModal('task-modal');
    loadTasks(currentProjectId);
  } catch (err) {
    showError('task-modal-error', err.message);
  }
}

function deleteTask(taskId, title) {
  openConfirmModal(
    'Delete Task',
    `Delete "${title}"? This cannot be undone.`,
    async () => {
      try {
        await api('DELETE', `/api/projects/${currentProjectId}/tasks/${taskId}`);
        closeModal('confirm-modal');
        loadTasks(currentProjectId);
        showToast('Task deleted', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

// ============================================================
// MEMBERS
// ============================================================
async function addMember() {
  const email = document.getElementById('member-email-input').value.trim();
  const role = document.getElementById('member-role-input').value;
  hideError('add-member-error');
  if (!email) { showError('add-member-error', 'Email is required'); return; }
  try {
    await api('POST', `/api/projects/${currentProjectId}/members`, { email, role });
    closeModal('add-member-modal');
    document.getElementById('member-email-input').value = '';
    await loadProjectDetail(currentProjectId);
    showToast('Member added!', 'success');
  } catch (err) {
    showError('add-member-error', err.message);
  }
}

function removeMember(userId, name) {
  openConfirmModal(
    'Remove Member',
    `Remove "${name}" from this project?`,
    async () => {
      try {
        await api('DELETE', `/api/projects/${currentProjectId}/members/${userId}`);
        closeModal('confirm-modal');
        await loadProjectDetail(currentProjectId);
        showToast('Member removed', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

// ============================================================
// MY TASKS PAGE
// ============================================================
async function loadMyTasks() {
  const el = document.getElementById('my-tasks-list');
  el.innerHTML = `<div class="loading">Loading tasks...</div>`;
  try {
    const projects = await api('GET', '/api/projects');
    const allTasks = [];
    for (const p of projects) {
      const tasks = await api('GET', `/api/projects/${p.id}/tasks`);
      tasks.forEach(t => { if (t.assignee_id === currentUser.id) allTasks.push({ ...t, project_name: p.name }); });
    }
    allMyTasks = allTasks;
    renderMyTasksPage(allTasks, 'all');
  } catch {
    el.innerHTML = emptyState('Failed to load tasks', '⚠');
  }
}

function filterMyTasks(filter, btn) {
  document.querySelectorAll('#page-my-tasks .filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderMyTasksPage(allMyTasks, filter);
}

function renderMyTasksPage(tasks, filter) {
  const el = document.getElementById('my-tasks-list');
  const today = new Date().toISOString().split('T')[0];
  let filtered = tasks;
  if (filter === 'overdue') filtered = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done');
  else if (filter !== 'all') filtered = tasks.filter(t => t.status === filter);
  if (!filtered.length) {
    el.innerHTML = emptyState('No tasks found', '✓');
    return;
  }
  el.innerHTML = filtered.map(t => {
    const overdue = t.due_date && t.due_date < today && t.status !== 'done';
    return `
      <div class="my-task-row">
        <div class="task-status-dot dot-${t.status}" style="margin-top:4px;flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div class="my-task-project">${esc(t.project_name)}</div>
          <div class="task-title ${t.status === 'done' ? 'done' : ''}" style="font-size:0.9rem">${esc(t.title)}</div>
          ${t.description ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">${esc(t.description)}</div>` : ''}
          <div class="task-meta" style="margin-top:0.375rem">
            <span class="badge badge-${t.status}">${statusLabel(t.status)}</span>
            <span class="badge badge-${t.priority}">${t.priority}</span>
            ${t.due_date ? `<span class="task-meta-item ${overdue ? 'badge badge-overdue' : ''}">📅 ${formatDate(t.due_date)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  // If no other modals open, hide overlay
  const anyOpen = [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden'));
  if (!anyOpen) document.getElementById('modal-overlay').classList.add('hidden');
}

function closeAllModals(e) {
  if (e.target === document.getElementById('modal-overlay')) {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('modal-overlay').classList.add('hidden');
  }
}

let confirmCallback = null;
function openConfirmModal(title, message, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  confirmCallback = callback;
  document.getElementById('confirm-action-btn').onclick = () => { if (confirmCallback) confirmCallback(); };
  openModal('confirm-modal');
}

// ============================================================
// UTILITIES
// ============================================================
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusLabel(status) {
  return { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }[status] || status;
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(d) {
  return d < new Date().toISOString().split('T')[0];
}

function emptyState(msg, icon) {
  return `<div class="empty-state">${icon ? `<span class="empty-state-icon">${icon}</span>` : ''}<p>${msg}</p></div>`;
}

// ============================================================
// START
// ============================================================
init();
