/**
 * src/index.js
 * ────────────
 * Entry point for the WhatsApp Pro Bot.
 *
 * Responsibilities:
 *   • Create and maintain a Baileys multi-device WhatsApp session
 *   • Authenticate via "Link with Phone Number" pairing code (no QR scan needed)
 *   • Forward all incoming text messages to the command router
 *   • Gracefully reconnect on connection drops
 */

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { createInterface } from "readline";

import config from "./config/index.js";
import { handleMessage } from "./handlers/commandHandler.js";
import { verifySmtpConnection } from "./services/emailService.js";

// ── Logger ─────────────────────────────────────────────────────────────────────
// Baileys is very verbose by default — we suppress noise below "warn" level.
const logger = pino({ level: "warn" });

// ── Readline helper (used once to prompt for the pairing code) ─────────────────
function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

// ── Main bot factory ───────────────────────────────────────────────────────────

/**
 * Creates (or restores) a WhatsApp session and attaches all event listeners.
 * Calls itself recursively on reconnect.
 */
async function startBot() {
  // ── 1. Load or create auth state ────────────────────────────────────────────
  const { state, saveCreds } = await useMultiFileAuthState(config.bot.sessionDir);

  // ── 2. Fetch the latest Baileys protocol version ─────────────────────────────
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[Bot] Using WA v${version.join(".")} — latest: ${isLatest}`);

  // ── 3. Create the socket ─────────────────────────────────────────────────────
  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      // makeCacheableSignalKeyStore wraps the state with an LRU cache for performance
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    // Prevent the bot from being seen as "online" when not actively chatting
    markOnlineOnConnect: false,
    // Retry message sends on transient failures
    retryRequestDelayMs: 2000,
  });

  // ── 4. Phone-number pairing code (fires only on first run / new session) ──────
  if (!sock.authState.creds.registered) {
    let phoneNumber = config.bot.phoneNumber;

    if (!phoneNumber) {
      // Prompt interactively if not set in .env
      phoneNumber = await prompt(
        "\n📱 Enter your WhatsApp phone number (with country code, no spaces or +):\n> "
      );
    }

    // requestPairingCode triggers a 8-digit code sent to the phone number
    // The user enters this code in WhatsApp → Linked Devices → Link a Device
    const pairingCode = await sock.requestPairingCode(phoneNumber);

    console.log("\n┌─────────────────────────────────────────────┐");
    console.log("│         WHATSAPP PAIRING CODE               │");
    console.log("├─────────────────────────────────────────────┤");
    console.log(`│  Code: ${pairingCode.match(/.{1,4}/g).join("-").padEnd(37)}│`);
    console.log("├─────────────────────────────────────────────┤");
    console.log("│  1. Open WhatsApp on your phone             │");
    console.log("│  2. Go to Settings → Linked Devices         │");
    console.log("│  3. Tap 'Link a Device'                     │");
    console.log("│  4. Choose 'Link with phone number instead' │");
    console.log(`│  5. Enter the code above                    │`);
    console.log("└─────────────────────────────────────────────┘\n");
  }

  // ── 5. Event: save credentials whenever they update ──────────────────────────
  sock.ev.on("creds.update", saveCreds);

  // ── 6. Event: connection state changes ────────────────────────────────────────
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (connection === "open") {
      console.log("[Bot] ✅ Connected to WhatsApp!");
      return;
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[Bot] Connection closed (code ${statusCode}). Reconnect: ${shouldReconnect}`
      );

      if (shouldReconnect) {
        console.log("[Bot] Reconnecting in 3 s…");
        setTimeout(startBot, 3000);
      } else {
        console.log("[Bot] Logged out. Delete the ./session folder and restart to re-link.");
        process.exit(0);
      }
    }
  });

  // ── 7. Event: incoming messages ───────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // "notify" = new real-time messages; skip historical syncs
    if (type !== "notify") return;

    for (const msg of messages) {
      // Skip messages sent by the bot itself
      if (msg.key.fromMe) continue;

      // Extract the sender's JID (strip device suffix for group compatibility)
      const senderJid = msg.key.remoteJid;
      if (!senderJid) continue;

      // Extract plain text from various message types
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      // Only process messages that start with "/" (commands)
      if (!text.startsWith("/")) return;

      try {
        await handleMessage(sock, senderJid, text);
      } catch (err) {
        console.error(`[Bot] Error handling message from ${senderJid}:`, err);
        // Send a generic error reply so the user knows something went wrong
        await sock
          .sendMessage(senderJid, {
            text: "⚠️ An internal error occurred. Please try again later.",
          })
          .catch(() => {});
      }
    }
  });

  return sock;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

(async () => {
  console.log("═══════════════════════════════════════");
  console.log("      WhatsApp Pro Bot — Starting       ");
  console.log("═══════════════════════════════════════");

  // Verify SMTP on startup (non-fatal)
  await verifySmtpConnection();

  await startBot();
})();
