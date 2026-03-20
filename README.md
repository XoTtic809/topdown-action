# Topdown Action

Fast-paced top-down shooter with boss fights, power-ups, and wave-based progression. Self-hosted Node.js + PostgreSQL backend with a pure JavaScript frontend.

## Folder Structure

```
topdown-action/
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── styles.css
│   │   ├── crate-styles.css
│   │   ├── battlepass-styles.css
│   │   └── marketplace-styles.css
│   ├── js/
│   │   ├── admin/
│   │   │   ├── admin_skins.js
│   │   │   ├── anticheat.js
│   │   │   └── maintenance.js
│   │   ├── auth/
│   │   │   └── api-auth.js
│   │   ├── game/
│   │   │   ├── game.js
│   │   │   ├── mp-hook.js
│   │   │   ├── multiplayer.js
│   │   │   └── ui.js
│   │   ├── marketplace/
│   │   │   ├── api-announcements.js
│   │   │   ├── marketplace-ui.js
│   │   │   └── marketplace.js
│   │   └── shop/
│   │       ├── battlepass-system.js
│   │       └── crate-system.js
│   └── html/
│       └── marketplace modals.html
├── backend/
│   ├── server.js           ← Entry point
│   ├── package.json
│   ├── railway.toml        ← Railway deployment config
│   ├── Procfile            ← Backup start command
│   ├── .env.example        ← Copy this to .env for local dev
│   ├── config/
│   │   └── db.js           ← PostgreSQL pool + schema init
│   ├── middleware/
│   │   └── auth.js         ← JWT requireAuth + requireAdmin
│   ├── models/
│   │   ├── user.js
│   │   ├── inventory.js
│   │   ├── listing.js
│   │   └── transaction.js
│   ├── multiplayer/
│   │   ├── gameServer.js
│   │   └── socketHandler.js
│   └── routes/
│       ├── auth.js              ← /api/auth/*
│       ├── users.js             ← /api/users/*
│       ├── marketplace.js       ← /api/marketplace/*
│       ├── leaderboard.js       ← /api/leaderboard/*
│       ├── battlepass.js        ← /api/battlepass/*
│       ├── announcements.js     ← /api/announcements/*
│       └── traderestrictions.js ← /api/trade-restrictions/*
├── .gitignore
└── README.md
```

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in your values
cp .env.example .env

# 3. Start with auto-reload
npm run dev

# 4. Check it's running
curl http://localhost:3001/health
```

## Deploy to Railway

1. Push this folder to a GitHub repo (node_modules excluded automatically by .gitignore)
2. Go to railway.app → New Project → Deploy from GitHub
3. Add a PostgreSQL service: click + New → Database → Add PostgreSQL
4. Copy the `DATABASE_URL` from Postgres → Variables tab
5. In your backend service → Variables, set:
   - `DATABASE_URL` = paste from above
   - `JWT_SECRET` = run `openssl rand -base64 32` and paste result
   - `NODE_ENV` = `production`
   - `ALLOWED_ORIGIN` = your frontend URL (e.g. https://yourgame.github.io)
   - Leave `PORT` blank — Railway sets it automatically
6. Railway will deploy automatically. Visit `/health` to confirm it's live.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/signup | — | Register new account |
| POST | /api/auth/login | — | Login, returns JWT |
| GET | /api/auth/me | ✓ | Get current user |
| POST | /api/auth/progress | ✓ | Save score/coins/XP |
| POST | /api/auth/change-password | ✓ | Change password |
| GET | /api/users/:uid/profile | — | Public profile |
| POST | /api/users/equip | ✓ | Equip a skin |
| GET | /api/marketplace/listings | — | Browse listings |
| GET | /api/marketplace/my-listings | ✓ | Your active listings |
| POST | /api/marketplace/list | ✓ | List a skin for sale |
| POST | /api/marketplace/buy | ✓ | Buy a listing |
| POST | /api/marketplace/cancel | ✓ | Cancel your listing |
| GET | /api/leaderboard/scores | — | Top scores |
| GET | /api/leaderboard/coins | — | Top coins |
| GET | /api/leaderboard/levels | — | Top XP |
| GET | /health | — | Health check |

Admin routes under `/api/users/admin/*` and `/api/marketplace/admin/*` require `is_admin = true` in the database.
