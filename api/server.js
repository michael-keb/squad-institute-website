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

function configured() {
  return Boolean(SENDGRID_API_KEY && FROM_EMAIL && TO_EMAIL);
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

async function sendMail({ to, subject, text, html, replyTo }) {
  await sgMail.send({
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    replyTo: replyTo || undefined,
    subject,
    text,
    html,
  });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    sendgrid: configured() ? "configured" : "missing SENDGRID_API_KEY",
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
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("SendGrid contact error:", err?.response?.body || err);
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
    });

    if (SEND_RECEIPT) {
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
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("SendGrid apply error:", err?.response?.body || err);
    res.status(502).json({ error: "Could not submit application. Email us at contact@thesquadinstitute.com" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`Squad Institute website API on :${PORT} (SendGrid: ${configured() ? "ready" : "NOT CONFIGURED"})`);
});
