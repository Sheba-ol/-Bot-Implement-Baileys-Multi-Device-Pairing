/**
 * services/userDb.js
 * ──────────────────
 * Lightweight in-memory "database" for user records.
 *
 * In a real application you would replace the Map with a real DB
 * (MongoDB, PostgreSQL, etc.) — the interface stays the same.
 *
 * User record shape:
 * {
 *   jid:       string   — WhatsApp JID  e.g. "15551234567@s.whatsapp.net"
 *   isPro:     boolean  — whether the user has a Pro subscription
 *   email:     string   — stored when user upgrades (optional)
 *   upgradedAt: Date | null
 * }
 */

import config from "../config/index.js";

// ── Internal storage ───────────────────────────────────────────────────────────
/** @type {Map<string, object>} */
const users = new Map();

// Seed any users that were already Pro at startup (from .env)
for (const jid of config.initialProUsers) {
  users.set(jid, { jid, isPro: true, email: null, upgradedAt: new Date() });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Retrieve a user record, creating a default one if it doesn't exist.
 * @param {string} jid
 */
export function getUser(jid) {
  if (!users.has(jid)) {
    users.set(jid, { jid, isPro: false, email: null, upgradedAt: null });
  }
  return users.get(jid);
}

/**
 * Returns true if the given JID belongs to a Pro user.
 * @param {string} jid
 */
export function isProUser(jid) {
  return getUser(jid).isPro === true;
}

/**
 * Upgrade a user to Pro and optionally store their email address.
 * @param {string} jid
 * @param {string} [email]
 */
export function upgradeUserToPro(jid, email = null) {
  const user = getUser(jid);
  user.isPro = true;
  user.upgradedAt = new Date();
  if (email) user.email = email;
  users.set(jid, user);
  return user;
}

/**
 * Downgrade a user (e.g. subscription lapsed).
 * @param {string} jid
 */
export function revokeProAccess(jid) {
  const user = getUser(jid);
  user.isPro = false;
  users.set(jid, user);
  return user;
}

/** Debug helper — dump all users to console */
export function listAllUsers() {
  return [...users.values()];
}
