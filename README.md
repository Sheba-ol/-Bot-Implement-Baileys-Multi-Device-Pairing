# WhatsApp Pro Bot 🤖

A Node.js WhatsApp bot built with [Baileys](https://github.com/WhiskeySockets/Baileys) (multi-device) featuring **user tiers**, a **payment gate middleware**, and **Nodemailer email integration**.

---

## Project Structure

```
whatsapp-bot/
├── src/
│   ├── index.js                    ← Entry point, Baileys connection & phone pairing
│   ├── config/
│   │   └── index.js                ← Centralised env/config loader
│   ├── handlers/
│   │   └── commandHandler.js       ← All bot commands (/start, /premium, /activate…)
│   ├── middleware/
│   │   └── paymentGate.js          ← ⭐ Pro-check clause (payment wall)
│   └── services/
│       ├── userDb.js               ← In-memory user store with Pro tier logic
│       └── emailService.js         ← Nodemailer welcome email
├── .env.example                    ← Copy to .env and fill in your values
└── package.json
```

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — fill in your phone number, SMTP credentials, and payment link
```

### 3. Run the bot
```bash
npm start
```

On first run the bot will display an **8-digit pairing code** in the terminal. Enter it in WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number instead". The session is saved to `./session/` — you won't need to pair again after that.

---

## Bot Commands

| Command | Tier | Description |
|---|---|---|
| `/start` or `/help` | Free | Show the help menu |
| `/status` | Free | Show your current tier (Free / Pro) |
| `/premium` | **Pro only** | Access Pro features (gated) |
| `/activate <email>` | Free | Upgrade to Pro after payment |
| `/admin` | **Pro + Admin** | View user stats |

---

## How the Payment Gate Works

The `paymentGate.js` middleware exports a single async function `requirePro(jid, sock)`:

```
Incoming /premium command
        │
        ▼
requirePro(jid, sock) called
        │
   isProUser(jid)?
   ┌────┴─────┐
  YES         NO
   │           │
   │           ▼
   │    Send "Payment Required" message
   │    with payment link
   │           │
   ▼           ▼
returns false  returns true
   │           │
   ▼           ▼
Handler     Handler
continues   returns early
```

Every Pro-only command simply does:
```js
const blocked = await requirePro(jid, sock);
if (blocked) return;
// ... rest of the command
```

---

## Upgrading to Production

- Replace the in-memory `userDb.js` with a real database (MongoDB / PostgreSQL)
- Add a real payment webhook (Stripe `payment_intent.succeeded` → call `upgradeUserToPro`)
- Use a secret manager instead of `.env` for credentials
- Add rate limiting to prevent spam
- Deploy behind a process manager like PM2
