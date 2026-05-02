# TaskFlow — Team Task Manager

A clean, minimal full-stack task manager with role-based access control.

## Features

- **Authentication** — Signup/Login with JWT, role selection (Admin/Member)
- **Projects** — Create, edit, delete projects; track progress with a visual bar
- **Team Management** — Add/remove members per project, assign Admin or Member roles
- **Tasks** — Create, edit, delete tasks with title, description, assignee, priority (low/medium/high), status, and due date
- **Status Tracking** — Click the status circle to cycle: To Do → In Progress → Done
- **Dashboard** — Stats overview, recent activity, my assigned tasks, overdue tasks
- **My Tasks** — All tasks assigned to you across all projects, filterable
- **Role-Based Access Control** — Project admins can manage members and delete projects; members can create/edit their own tasks

## Tech Stack

- **Backend** — Node.js + Express
- **Database** — SQLite (via better-sqlite3, file-based, zero config)
- **Frontend** — Vanilla HTML/CSS/JS (Single Page App)
- **Auth** — JWT tokens (stored in localStorage + httpOnly cookie)

## Local Development

```bash
npm install
npm run dev
# Visit http://localhost:3000
```

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select this repo
4. Railway auto-detects Node.js and runs `node src/server.js`
5. Add environment variables (optional):
   - `JWT_SECRET` — a long random string (e.g. `openssl rand -hex 32`)
   - `DB_DIR` — defaults to `./data` (Railway's ephemeral filesystem — see note below)

### ⚠ Persistent Storage on Railway

SQLite writes to disk. On Railway's free tier, the filesystem resets on redeploy. To persist data:

**Option A (Free):** Use Railway Volume:
1. In your Railway project → Add Volume → Mount at `/data`
2. Set env var `DB_DIR=/data`

**Option B:** Swap SQLite for PostgreSQL (Railway provides free Postgres):
- Add Postgres plugin in Railway
- Replace better-sqlite3 with `pg` package
- Update queries (minor syntax changes)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | `taskflow_secret_key_change_in_prod` | JWT signing secret |
| `DB_DIR` | `./data` | Directory for SQLite database file |

## Project Structure

```
taskflow/
├── src/
│   ├── server.js          # Express app entry point
│   ├── db.js              # SQLite setup + schema
│   ├── middleware.js       # JWT auth middleware
│   ├── authRoutes.js      # /api/auth/*
│   ├── projectRoutes.js   # /api/projects/*
│   ├── taskRoutes.js      # /api/projects/:id/tasks/*
│   └── dashboardRoutes.js # /api/dashboard
├── public/
│   ├── index.html         # Single Page App shell
│   ├── css/style.css      # All styles
│   └── js/app.js          # All frontend logic
├── package.json
└── railway.json
```

## API Endpoints

### Auth
- `POST /api/auth/signup` — Register (name, email, password, role)
- `POST /api/auth/login` — Login (email, password)
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user

### Projects
- `GET /api/projects` — List my projects
- `POST /api/projects` — Create project
- `GET /api/projects/:id` — Project detail + members
- `PUT /api/projects/:id` — Update project (admin)
- `DELETE /api/projects/:id` — Delete project (admin)
- `POST /api/projects/:id/members` — Add member (admin)
- `DELETE /api/projects/:id/members/:userId` — Remove member (admin)
- `PUT /api/projects/:id/members/:userId` — Change member role (admin)

### Tasks
- `GET /api/projects/:id/tasks` — List tasks
- `POST /api/projects/:id/tasks` — Create task
- `PUT /api/projects/:id/tasks/:taskId` — Update task
- `DELETE /api/projects/:id/tasks/:taskId` — Delete task

### Dashboard
- `GET /api/dashboard` — Stats + recent/overdue/my tasks

### Users
- `GET /api/users/search?q=...` — Search users by name/email (for adding members)
