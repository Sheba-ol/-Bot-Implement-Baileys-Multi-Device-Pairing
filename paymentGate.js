/**
 * middleware/paymentGate.js
 * ─────────────────────────
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║              PAYMENT GATE — CORE CLAUSE EXPLAINED               ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║                                                                  ║
 * ║  Every time a "Pro-only" command is invoked, the flow is:        ║
 * ║                                                                  ║
 * ║  1. requirePro(jid, sock, jid) is called BEFORE the command      ║
 * ║     handler runs.                                                ║
 * ║                                                                  ║
 * ║  2. It checks isProUser(jid) from the user database.             ║
 * ║                                                                  ║
 * ║  3a. ✅ User IS Pro  → returns false (no gate triggered)         ║
 * ║       → caller proceeds to run the actual command handler.       ║
 * ║                                                                  ║
 * ║  3b. ❌ User is NOT Pro → sends a "Payment Required" WhatsApp    ║
 * ║       message containing a mock payment link → returns true      ║
 * ║       (gate was triggered) → caller STOPS; handler never runs.   ║
 * ║                                                                  ║
 * ║  This pattern keeps every command handler clean — they never     ║
 * ║  need to repeat the Pro check; they just call requirePro first.  ║
 * ║                                                                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { isProUser } from "../services/userDb.js";
import config from "../config/index.js";

/**
 * Payment-gate middleware for Pro-only commands.
 *
 * @param {string}  jid   — Sender's WhatsApp JID
 * @param {object}  sock  — Active Baileys socket (used to reply)
 * @returns {Promise<boolean>}
 *   true  → gate triggered; the calling handler should return early.
 *   false → user is Pro; the calling handler should continue normally.
 */
export async function requirePro(jid, sock) {
  // ── CLAUSE: Check Pro status ────────────────────────────────────────────────
  if (isProUser(jid)) {
    return false; // ✅ Access granted — do not block
  }

  // ── Gate triggered: user is NOT Pro ─────────────────────────────────────────
  const paymentMessage = [
    "🔒 *Pro Feature — Payment Required*\n",
    "This command is only available to *Pro* subscribers.\n",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "💎 *Upgrade to Pro* and unlock:",
    "  • /premium commands",
    "  • Priority support",
    "  • Exclusive features\n",
    `💳 *Pay & Upgrade Now:*\n${config.payment.link}\n`,
    "━━━━━━━━━━━━━━━━━━━━━━",
    "_After payment, send /activate <your-email> to unlock your account._",
  ].join("\n");

  await sock.sendMessage(jid, { text: paymentMessage });

  return true; // 🚫 Gate was triggered — tell the caller to stop
}
