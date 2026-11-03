"use strict";

function fromAddress() {
  return String(process.env.AAMART_EMAIL_FROM || "").trim();
}

function emailConfigured() {
  return !!(process.env.AAMART_EMAIL_WEBHOOK_URL || (process.env.AAMART_RESEND_API_KEY && fromAddress()));
}

function otpDebugEnabled() {
  return process.env.AAMART_OTP_DEBUG === "1";
}

async function sendMail(input) {
  const to = String(input && input.to || "").trim();
  const subject = String(input && input.subject || "").trim();
  const text = String(input && input.text || "");
  if (!to || !subject || !text) return { ok: false, error: "Invalid email" };
  if (!emailConfigured()) return { ok: false, error: "Email service is not configured" };

  try {
    if (process.env.AAMART_EMAIL_WEBHOOK_URL) {
      const res = await fetch(process.env.AAMART_EMAIL_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.AAMART_EMAIL_WEBHOOK_TOKEN ? { Authorization: "Bearer " + process.env.AAMART_EMAIL_WEBHOOK_TOKEN } : {}),
        },
        body: JSON.stringify({ from: fromAddress() || "Aamart", to, subject, text }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { ok: false, error: "Email provider rejected the message" };
      return { ok: true };
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.AAMART_RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, error: "Email provider rejected the message" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.name === "TimeoutError" ? "Email provider timed out" : "Email could not be sent" };
  }
}

module.exports = { emailConfigured, otpDebugEnabled, sendMail };
