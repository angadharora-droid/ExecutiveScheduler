# ExecutiveScheduler

Executive time scheduler — React (Vite + Tailwind) frontend with an Express + MongoDB backend.

## Run locally

```
npm install
npm run build
npm start
```

Requires a `.env` file with `MONGODB_URI=<your MongoDB connection string>` (not committed).

## Accounts

Admins manage accounts at `/admin`. Three roles:

- **Admin** — full board plus user management.
- **Member** — full board.
- **Submit only** — no board. After signing in this account sees only a "Submit a task" form. Each submission lands in the Submissions tab of the owner it is tied to (chosen when the account is created; changeable later on `/admin`), who sets Priority and Importance and approves it onto their board.

## Deploy on Railway

1. Create a new Railway project from this GitHub repo.
2. Add a variable: `MONGODB_URI` = your MongoDB Atlas connection string.
3. Railway builds with `npm run build` and starts with `npm start` automatically.
4. In MongoDB Atlas → Network Access, allow access from `0.0.0.0/0` (or Railway's IPs) so the server can connect.
