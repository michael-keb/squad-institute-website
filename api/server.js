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
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
const GITHUB_ISSUES_REPO = process.env.GITHUB_ISSUES_REPO?.trim() || "michael-keb/SquadInstitute-Platform";

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

function mailProviders() {
  const providers = [];
  if (GITHUB_TOKEN && GITHUB_ISSUES_REPO) providers.push("github");
  if (SENDGRID_API_KEY && FROM_EMAIL && TO_EMAIL) providers.push("sendgrid");
  return providers;
}

function configured() {
  return mailProviders().length > 0;
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

async function sendViaSendgrid({ to, subject, text, html, replyTo }) {
  await sgMail.send({
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    replyTo: replyTo || undefined,
    subject,
    text,
    html,
  });
}

async function createGithubIssue({ title, body, labels }) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_ISSUES_REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "squad-institute-website-api",
    },
    body: JSON.stringify({ title, body, labels }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `GitHub HTTP ${res.status}`);
    err.response = { body: data };
    throw err;
  }
  return data;
}

async function deliver({ subject, text, html, replyTo, name, issueTitle, issueBody, labels }) {
  const providers = mailProviders();
  const errors = [];
  const delivered = [];

  if (providers.includes("github")) {
    try {
      const issue = await createGithubIssue({
        title: issueTitle || subject,
        body: issueBody || text,
        labels,
      });
      delivered.push({ provider: "github", url: issue.html_url });
    } catch (err) {
      console.error("GitHub issue error:", err?.response?.body || err);
      errors.push(err.message || "github failed");
    }
  }

  if (providers.includes("sendgrid")) {
    try {
      await sendViaSendgrid({ to: TO_EMAIL, subject, text, html, replyTo });
      delivered.push({ provider: "sendgrid" });
    } catch (err) {
      console.error("SendGrid error:", err?.response?.body || err);
      errors.push(err.message || "sendgrid failed");
    }
  }

  if (!delivered.length) {
    throw new Error(errors.join("; ") || "No mail provider succeeded");
  }
  return delivered;
}

app.get("/health", (_req, res) => {
  const providers = mailProviders();
  res.json({
    ok: true,
    mail: providers.length ? providers.join("+") : "missing",
    sendgrid: providers.includes("sendgrid") ? "configured" : "missing SENDGRID_API_KEY",
    github: providers.includes("github") ? "configured" : "missing GITHUB_TOKEN",
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
  const issueBody = [
    `**From:** ${name.trim()} \`<${email.trim()}>\``,
    `**Topic:** ${topic.trim()}`,
    `**Source:** https://thesquadinstitute.com/contact.html`,
    "",
    message.trim(),
    "",
    "---",
    `_Reply-to: ${email.trim()}_`,
  ].join("\n");

  try {
    const delivered = await deliver({
      subject,
      text,
      html,
      replyTo: email.trim(),
      name: name.trim(),
      issueTitle: subject,
      issueBody,
      labels: ["website-contact"],
    });
    res.json({ ok: true, delivered });
  } catch (err) {
    console.error("Contact deliver error:", err);
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
  const issueBody = [
    `**Applicant:** ${fname} ${lname} \`<${applicantEmail}>\``,
    `**Path:** ${pathVal}`,
    `**Source:** https://thesquadinstitute.com/apply.html`,
    "",
    ...lines.map((l) => (l ? l : "")),
    "",
    "---",
    `_Reply-to: ${applicantEmail}_`,
    "_SLA: reply within five business days._",
  ].join("\n");

  try {
    const delivered = await deliver({
      subject,
      text,
      html,
      replyTo: applicantEmail,
      name: `${fname} ${lname}`,
      issueTitle: `[Apply] ${subject}`,
      issueBody,
      labels: ["website-apply"],
    });

    if (SEND_RECEIPT && mailProviders().includes("sendgrid")) {
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
      try {
        await sendViaSendgrid({
          to: applicantEmail,
          subject: "We received your application — Squad Institute",
          text: receiptText,
          html: linesToHtml(receiptText.split("\n")),
        });
      } catch (err) {
        console.error("Receipt send failed (non-fatal):", err?.response?.body || err);
      }
    }

    res.json({ ok: true, delivered });
  } catch (err) {
    console.error("Apply deliver error:", err);
    res.status(502).json({ error: "Could not submit application. Email us at contact@thesquadinstitute.com" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`Squad Institute website API on :${PORT} (mail: ${mailProviders().join("+") || "NOT CONFIGURED"})`);
});
