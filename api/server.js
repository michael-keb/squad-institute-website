import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import sgMail from "@sendgrid/mail";

const app = express();
const PORT = Number(process.env.PORT || 8787);

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY?.trim();
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL?.trim() || "contact@thesquadinstitute.com";
const FROM_NAME = process.env.SENDGRID_FROM_NAME?.trim() || "Squad Institute";
const TO_EMAIL = process.env.CONTACT_TO_EMAIL?.trim() || "contact@thesquadinstitute.com";
const SEND_RECEIPT = process.env.SEND_APPLICANT_RECEIPT === "true";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

app.use(express.json({ limit: "32kb" }));

app.use(
  cors({
    origin(origin, cb) {
      // Reflect allowed origins only — never throw (throws break preflight as 500).
      if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — try again in a few minutes." },
  }),
);

function mailProvider() {
  if (SENDGRID_API_KEY && FROM_EMAIL && TO_EMAIL) return "sendgrid";
  if (TO_EMAIL) return "formsubmit";
  return null;
}

function configured() {
  return Boolean(mailProvider());
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function linesToHtml(lines) {
  return lines.map((l) => `<p style="margin:0 0 6px">${esc(l)}</p>`).join("");
}

async function sendViaFormSubmit({ subject, text, replyTo, name }) {
  const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(TO_EMAIL)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      name: name || replyTo || "Website",
      email: replyTo || TO_EMAIL,
      _replyto: replyTo || undefined,
      _subject: subject,
      _template: "table",
      _captcha: "false",
      message: text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `FormSubmit HTTP ${res.status}`);
    err.response = { body: data };
    throw err;
  }
  return data;
}

async function sendMail({ to, subject, text, html, replyTo, name }) {
  const provider = mailProvider();
  if (provider === "sendgrid") {
    await sgMail.send({
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      replyTo: replyTo || undefined,
      subject,
      text,
      html,
    });
    return;
  }
  if (provider === "formsubmit") {
    // FormSubmit always delivers to CONTACT_TO_EMAIL (activation required once).
    await sendViaFormSubmit({ subject, text, replyTo, name });
    return;
  }
  throw new Error("No mail provider configured");
}

app.get("/health", (_req, res) => {
  const provider = mailProvider();
  res.json({
    ok: true,
    mail: provider || "missing",
    sendgrid: provider === "sendgrid" ? "configured" : "missing SENDGRID_API_KEY",
  });
});

app.post("/api/contact", async (req, res) => {
  if (!configured()) {
    return res.status(503).json({ error: "Email service not configured yet." });
  }

  const { name, email, topic, message, website } = req.body || {};
  if (website) return res.json({ ok: true }); // honeypot

  if (!name?.trim() || !email?.trim() || !topic?.trim() || !message?.trim()) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  const subject = `[Website] ${topic.trim()} — ${name.trim()}`;
  const text = [`Name: ${name.trim()}`, `Email: ${email.trim()}`, `Topic: ${topic.trim()}`, "", message.trim()].join("\n");
  const html = linesToHtml(text.split("\n"));

  try {
    await sendMail({
      to: TO_EMAIL,
      subject,
      text,
      html,
      replyTo: email.trim(),
      name: name.trim(),
    });
    res.json({ ok: true, provider: mailProvider() });
  } catch (err) {
    console.error("Contact mail error:", err?.response?.body || err);
    res.status(502).json({ error: "Could not send message. Email us at contact@thesquadinstitute.com" });
  }
});

app.post("/api/apply", async (req, res) => {
  if (!configured()) {
    return res.status(503).json({ error: "Email service not configured yet." });
  }

  const { fields, stakes, path, firstName, lastName, email, website } = req.body || {};
  if (website) return res.json({ ok: true }); // honeypot

  const applicantEmail = (email || fields?.Email || "").trim();
  const fname = (firstName || fields?.["First name"] || "").trim();
  const lname = (lastName || fields?.["Last name"] || "").trim();

  if (!fname || !lname || !applicantEmail || !stakes?.trim()) {
    return res.status(400).json({ error: "Missing required application fields." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  const pathVal = path || fields?.Path || "seat";
  const prefix =
    pathVal === "coaching" ? "Coaching request" : pathVal === "both" ? "Coaching + seat" : "Seat application";
  const subject = `${prefix} — ${fname} ${lname}`;

  const lines = [];
  if (fields && typeof fields === "object") {
    for (const [k, v] of Object.entries(fields)) {
      if (v?.toString().trim()) lines.push(`${k}: ${v.toString().trim()}`);
    }
  }
  lines.push("", "What's at stake:", stakes.trim());
  const text = lines.join("\n");
  const html = linesToHtml(lines);

  try {
    await sendMail({
      to: TO_EMAIL,
      subject,
      text,
      html,
      replyTo: applicantEmail,
      name: `${fname} ${lname}`,
    });

    // Receipt emails need SendGrid (FormSubmit can't send as Squad Institute).
    if (SEND_RECEIPT && mailProvider() === "sendgrid") {
      const receiptText = [
        `Hi ${fname},`,
        "",
        "We received your application. A human on our team will reply within five business days.",
        "",
        "What you sent is private to us — used to match and support you, not shared in squad chat.",
        "",
        "— Squad Institute",
        "contact@thesquadinstitute.com",
      ].join("\n");
      await sendMail({
        to: applicantEmail,
        subject: "We received your application — Squad Institute",
        text: receiptText,
        html: linesToHtml(receiptText.split("\n")),
        name: "Squad Institute",
      });
    }

    res.json({ ok: true, provider: mailProvider() });
  } catch (err) {
    console.error("Apply mail error:", err?.response?.body || err);
    res.status(502).json({ error: "Could not submit application. Email us at contact@thesquadinstitute.com" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`Squad Institute website API on :${PORT} (mail: ${mailProvider() || "NOT CONFIGURED"})`);
});
