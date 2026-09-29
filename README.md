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

Meeting OS is the group's shared record of meetings. Once this server is connected to it,
every account gets:

- a **Meeting** tab on the Board to create meetings in Meeting OS: name, header, unit, caller,
  date, time, length, venue or video link, agenda, and attendees — picked from Meeting OS's
  people, or added by hand when they are not in it. Meeting OS saves it and emails the calendar
  invites. The meeting goes on the creator's board at its time, so planning keeps that time for it.
  Attendees who have an account here (matched by username = mobile number, or by name) also get
  it in their Submissions inbox to **Accept** (it goes on their board) or say they **can't
  attend**; the Meeting tab lists each meeting with who has accepted and who has not answered.
  A Meeting task already on the board opens the tab filled in from it ("Meeting OS" on its card).
- the **action points** assigned to it in Meeting OS — by its name, or by its username when that
  is a mobile number — in its Submissions inbox, to approve onto the board or dismiss. Only action
  points created after the account first opened its inbox come across. The server asks Meeting OS
  at most once a minute, when the inbox refreshes.

Server variables (the connection is off while either is empty):

- `MEETING_OS_API_URL` — the Meeting OS **backend** address, e.g. `https://meetingos.up.railway.app`
- `MEETING_OS_SECRET` — the same long random value as `MEETING_OS_SECRET` on the Meeting OS backend

## Deploy on Railway

1. Create a new Railway project from this GitHub repo.
2. Add a variable: `MONGODB_URI` = your MongoDB Atlas connection string.
3. Railway builds with `npm run build` and starts with `npm start` automatically.
4. In MongoDB Atlas → Network Access, allow access from `0.0.0.0/0` (or Railway's IPs) so the server can connect.
