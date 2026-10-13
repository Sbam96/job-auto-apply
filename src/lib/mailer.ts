// Email. Uses SMTP when configured (e.g. a Gmail app password, free); otherwise mail is kept in
// the database outbox and logged, so the app still works while email isn't set up.
import nodemailer from "nodemailer";
import type { Db } from "./db";

export interface Mail { to: string; subject: string; text: string }

export function smtpConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !!(env.SMTP_URL || (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS));
}

export async function sendMail(db: Db, mail: Mail, env: NodeJS.ProcessEnv = process.env): Promise<"sent" | "outbox"> {
  await db.query("INSERT INTO mail_outbox (to_email, subject, body) VALUES ($1, $2, $3)", [mail.to, mail.subject, mail.text]);
  if (!smtpConfigured(env)) {
    // Only the account owner can read these logs; this is how links arrive until SMTP is set up.
    console.log(`[mail] SMTP not configured; kept in outbox. To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}`);
    return "outbox";
  }
  const transport = env.SMTP_URL
    ? nodemailer.createTransport(env.SMTP_URL)
    : nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 465),
        secure: Number(env.SMTP_PORT ?? 465) === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
  await transport.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to: mail.to, subject: mail.subject, text: mail.text });
  return "sent";
}

export const appUrl = (env: NodeJS.ProcessEnv = process.env) => (env.APP_URL || env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
