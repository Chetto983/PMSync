import nodemailer from "nodemailer";

/**
 * Nodemailer transporter for transactional emails (verification, password reset).
 * Server-only module -- runs in Next.js API routes, never client-side.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const fromEmail = process.env.SMTP_FROM_EMAIL || "noreply";
const fromDomain = process.env.SMTP_FROM_DOMAIN || "pmsync.local";

/**
 * Send a transactional email (verification, password reset, etc.).
 * Fire-and-forget in auth callbacks to avoid timing attacks.
 */
export async function sendTransactionalEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  await transporter.sendMail({
    from: `${fromEmail}@${fromDomain}`,
    to,
    subject,
    html,
  });
}
