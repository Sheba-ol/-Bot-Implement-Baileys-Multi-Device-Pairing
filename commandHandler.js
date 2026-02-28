/**
 * handlers/commandHandler.js
 * ──────────────────────────
 * Defines all bot commands and routes incoming messages to them.
 *
 * Command list:
 *   /start      — greeting & help menu
 *   /status     — show the caller's current tier
 *   /premium    — Pro-only feature (gated by paymentGate middleware)
 *   /activate   — simulate a post-payment Pro upgrade
 *   /admin      — secret admin panel (gated + hardcoded admin JID)
 */

import { requirePro } from "../middleware/paymentGate.js";
import { getUser, upgradeUserToPro, listAllUsers } from "../services/userDb.js";
import { sendWelcomeEmail } from "../services/emailService.js";

// ── Hardcoded admin JID — change to your own WhatsApp JID ─────────────────────
const ADMIN_JID = process.env.ADMIN_JID || "15550000000@s.whatsapp.net";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Send a plain text reply to the message sender. */
async function reply(sock, jid, text) {
  await sock.sendMessage(jid, { text });
}

// ── Command Handlers ──────────────────────────────────────────────────────────

/**
 * /start — Welcome message & command list.
 */
async function handleStart(sock, jid) {
  const menu = [
    "👋 *Welcome to the WhatsApp Pro Bot!*\n",
    "Here are the available commands:\n",
    "📌 */start*    — Show this menu",
    "📌 */status*   — Check your account tier",
    "💎 */premium*  — Access Pro features _(Pro only)_",
    "🔑 */activate <email>* — Activate Pro after payment",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "_Powered by Baileys + Node.js_",
  ].join("\n");

  await reply(sock, jid, menu);
}

/**
 * /status — Show whether the user is Free or Pro.
 */
async function handleStatus(sock, jid) {
  const user = getUser(jid);
  const tier = user.isPro ? "⭐ *Pro*" : "🆓 *Free*";
  const since = user.upgradedAt
    ? `\n_Pro since: ${user.upgradedAt.toDateString()}_`
    : "";

  await reply(sock, jid, `Your current tier: ${tier}${since}`);
}

/**
 * /premium — A Pro-only command.
 *
 * Flow:
 *   1. Call requirePro() — the payment-gate middleware.
 *   2. If gate returns true → user not Pro → message already sent → return.
 *   3. If gate returns false → user IS Pro → run the real feature.
 */
async function handlePremium(sock, jid) {
  // ── Payment Gate Clause ────────────────────────────────────────────────────
  const blocked = await requirePro(jid, sock);
  if (blocked) return; // 🚫 Not Pro — gate sent the payment message; stop here.
  // ── Gate passed: user is Pro ───────────────────────────────────────────────

  await reply(
    sock,
    jid,
    [
      "🌟 *Welcome to the Pro Zone!*\n",
      "You have access to all premium features:\n",
      "✅ Advanced analytics",
      "✅ Unlimited requests",
      "✅ Priority support queue",
      "✅ Beta feature access\n",
      "_More features coming soon — stay tuned!_",
    ].join("\n")
  );
}

/**
 * /activate <email>
 * Simulates the post-payment Pro activation flow.
 *
 * In production this would verify a payment token/webhook before upgrading.
 *
 * @param {string[]} args — Parsed command arguments, args[0] should be the email.
 */
async function handleActivate(sock, jid, args) {
  const email = args[0];

  // ── Validate email argument ────────────────────────────────────────────────
  if (!email || !email.includes("@")) {
    await reply(
      sock,
      jid,
      "⚠️ Please provide a valid email.\nUsage: */activate your@email.com*"
    );
    return;
  }

  // ── Check if already Pro ───────────────────────────────────────────────────
  const user = getUser(jid);
  if (user.isPro) {
    await reply(sock, jid, "✅ Your account is already *Pro*! Enjoy the features 🎉");
    return;
  }

  // ── Upgrade the user ───────────────────────────────────────────────────────
  upgradeUserToPro(jid, email);

  await reply(
    sock,
    jid,
    `🎉 *Congratulations!* Your account has been upgraded to *Pro*.\n\nA welcome email is being sent to: _${email}_\n\nType */premium* to explore your new features!`
  );

  // ── Send welcome email (non-blocking — we don't await to avoid delaying reply) ──
  sendWelcomeEmail(email, jid).catch((err) =>
    console.error("[Activate] Email send error:", err.message)
  );
}

/**
 * /admin — Secret admin panel (Pro + admin JID required).
 */
async function handleAdmin(sock, jid) {
  // ── Payment Gate Clause ────────────────────────────────────────────────────
  const blocked = await requirePro(jid, sock);
  if (blocked) return;

  // ── Additional admin-only check ────────────────────────────────────────────
  if (jid !== ADMIN_JID) {
    await reply(sock, jid, "🚫 *Access Denied.* This command is for admins only.");
    return;
  }

  const allUsers = listAllUsers();
  const proCount = allUsers.filter((u) => u.isPro).length;

  await reply(
    sock,
    jid,
    [
      "🛡️ *Admin Panel*\n",
      `👤 Total users tracked: *${allUsers.length}*`,
      `⭐ Pro users:           *${proCount}*`,
      `🆓 Free users:          *${allUsers.length - proCount}*`,
    ].join("\n")
  );
}

// ── Main Router ───────────────────────────────────────────────────────────────

/**
 * Route an incoming text message to the correct handler.
 *
 * @param {object} sock    — Baileys socket
 * @param {string} jid     — Sender's WhatsApp JID
 * @param {string} text    — Raw message text
 */
export async function handleMessage(sock, jid, text) {
  const trimmed = text.trim();
  const [command, ...args] = trimmed.split(/\s+/);

  console.log(`[Command] ${jid} → ${command} ${args.join(" ")}`);

  switch (command.toLowerCase()) {
    case "/start":
    case "/help":
      await handleStart(sock, jid);
      break;

    case "/status":
      await handleStatus(sock, jid);
      break;

    case "/premium":
      await handlePremium(sock, jid);
      break;

    case "/activate":
      await handleActivate(sock, jid, args);
      break;

    case "/admin":
      await handleAdmin(sock, jid);
      break;

    default:
      // Ignore unknown commands to avoid spam
      break;
  }
}
