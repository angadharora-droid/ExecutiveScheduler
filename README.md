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

## Meeting OS

Accounts can be linked to their Meeting OS account on `/admin` (only people who have one use
Meeting OS). A linked account:

- gets the **action points** assigned to it in Meeting OS (by its Meeting OS name, or by the
  mobile number set on the link) in its Submissions inbox, to approve onto the board or dismiss.
  Only action points created after the link was made come across. The server asks Meeting OS
  at most once a minute, when the inbox refreshes; Meeting OS is only ever read.
- can **schedule its Meeting tasks** (any activity with "meeting" in its name) in Meeting OS:
  Meeting OS's own New Meeting form opens in a dialog, filled in from the task. Once the meeting
  is saved there, the task is tagged "In Meeting OS" and moves to the meeting's date and time.

Server variables (the link is off while either is empty):

- `MEETING_OS_API_URL` — the Meeting OS **backend** address, e.g. `https://<meeting-os-backend>`
- `MEETING_OS_SECRET` — the same long random value as `MEETING_OS_SECRET` on the Meeting OS backend

Build-time, only if the Meeting OS website is not `https://meetingos.centrepointgroup.in`:
`VITE_MEETING_OS_URL`. The portal sign-in works inside the dialog when this app is served under
`centrepointgroup.in`; otherwise Meeting OS asks for its PIN there.

## Deploy on Railway

1. Create a new Railway project from this GitHub repo.
2. Add a variable: `MONGODB_URI` = your MongoDB Atlas connection string.
3. Railway builds with `npm run build` and starts with `npm start` automatically.
4. In MongoDB Atlas → Network Access, allow access from `0.0.0.0/0` (or Railway's IPs) so the server can connect.
