/**
 * services/emailService.js
 * ────────────────────────
 * Thin wrapper around Nodemailer.
 * Exports a single `sendWelcomeEmail` function called when a user upgrades to Pro.
 */

import nodemailer from "nodemailer";
import config from "../config/index.js";

// ── Transport (created once, reused for every send) ───────────────────────────
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure, // true → SSL on port 465; false → STARTTLS on 587
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

// ── Email Templates ───────────────────────────────────────────────────────────

/**
 * Build the HTML body for the Pro welcome email.
 * @param {string} jid  — The user's WhatsApp JID (used as display name fallback)
 */
function buildWelcomeHtml(jid) {
  const displayPhone = jid.replace("@s.whatsapp.net", "");
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 560px; margin: 40px auto; background: #fff;
                     border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
        .header { background: #25D366; padding: 28px; text-align: center; color: #fff; }
        .header h1 { margin: 0; font-size: 24px; }
        .body { padding: 28px; color: #333; line-height: 1.6; }
        .badge { display: inline-block; background: #FFD700; color: #333;
                 font-weight: bold; padding: 4px 12px; border-radius: 20px; margin-bottom: 16px; }
        .footer { background: #f0f0f0; padding: 16px; text-align: center;
                  font-size: 12px; color: #888; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to Pro!</h1>
        </div>
        <div class="body">
          <span class="badge">⭐ PRO MEMBER</span>
          <p>Hi <strong>+${displayPhone}</strong>,</p>
          <p>
            Your account has been <strong>successfully upgraded to Pro</strong>.
            You now have access to all premium features on the WhatsApp bot.
          </p>
          <h3>What's included in Pro?</h3>
          <ul>
            <li>✅ Unlimited /premium commands</li>
            <li>✅ Priority response queue</li>
            <li>✅ Exclusive Pro-only features</li>
            <li>✅ Direct support channel</li>
          </ul>
          <p>
            Head back to WhatsApp and type <strong>/premium</strong> to try it out right now!
          </p>
          <p>Thank you for your support 🙏</p>
        </div>
        <div class="footer">
          © ${new Date().getFullYear()} WhatsApp Pro Bot — You received this because you upgraded your account.
        </div>
      </div>
    </body>
    </html>
  `;
}

// ── Public Functions ──────────────────────────────────────────────────────────

/**
 * Send a "Welcome to Pro" email to the newly upgraded user.
 *
 * @param {string} toEmail  — Recipient email address
 * @param {string} jid      — WhatsApp JID (used in the email body)
 * @returns {Promise<object>} Nodemailer send info object
 */
export async function sendWelcomeEmail(toEmail, jid) {
  const mailOptions = {
    from: `"${config.email.fromName}" <${config.email.fromAddress}>`,
    to: toEmail,
    subject: "🎉 Welcome to Pro — Your upgrade is confirmed!",
    text: `Hi! Your WhatsApp account (+${jid.replace("@s.whatsapp.net", "")}) has been upgraded to Pro. Enjoy all premium features!`,
    html: buildWelcomeHtml(jid),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Welcome email sent to ${toEmail} (msgId: ${info.messageId})`);
    return info;
  } catch (err) {
    // Log but don't crash — email failure shouldn't break the bot
    console.error(`[Email] Failed to send welcome email to ${toEmail}:`, err.message);
    throw err;
  }
}

/**
 * Verify the SMTP connection is working on startup.
 * Logs a warning if credentials are missing/wrong — doesn't throw.
 */
export async function verifySmtpConnection() {
  try {
    await transporter.verify();
    console.log("[Email] SMTP connection verified ✓");
  } catch (err) {
    console.warn("[Email] SMTP verification failed (emails won't send):", err.message);
  }
}
