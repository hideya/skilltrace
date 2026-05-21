import nodemailer from 'nodemailer'
import { redirectWithError } from 'remix-toast'
import { User } from '~/models/.server/user'

export async function requireUserByToken(token: string) {
  let user = await User.findBy({ token })
  if (!user) throw await redirectWithError('/', 'Invalid token')
  return user
}

export async function sendAuthEmail(
  to: string,
  subject: string,
  link: string,
) {
  let smtpConfig = getSmtpConfig()

  if (!smtpConfig?.auth?.user) {
    logAuthLink(link)
    return
  }

  let url = buildAuthUrl(link)
  let transporter = nodemailer.createTransport(smtpConfig as any)

  await transporter.sendMail({
    from: smtpConfig.auth.user,
    to,
    subject,
    text: `${subject}\n\n${url}`,
    html: renderAuthEmail(subject, url),
  })
}

function logAuthLink(path: string) {
  let origin = process.env.ORIGIN || 'http://localhost:5173'
  let url = new URL(path, origin)
  console.log(`[auth-link] ${url.toString()}`)
}

function buildAuthUrl(link: string) {
  let origin = process.env.ORIGIN || 'http://localhost:5173'
  return new URL(link, origin).toString()
}

function renderAuthEmail(subject: string, url: string) {
  let safeSubject = escapeHtml(subject)
  let safeUrl = escapeHtml(url)

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;">${safeSubject}</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4b5563;">
          Click the button below to continue.
        </p>
        <a
          href="${safeUrl}"
          style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:9999px;"
        >
          Open link
        </a>
        <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;">
          If the button does not work, paste this link into your browser:<br />
          ${safeUrl}
        </p>
      </div>
    </div>
  </body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getSmtpConfig() {
  let raw = process.env.SMTP_CONFIG
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
