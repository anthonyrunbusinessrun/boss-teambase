import { Resend } from "resend";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export async function sendVerificationEmail(email: string, name: string, verificationUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Email verification is not configured");

  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verificationUrl);
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: email,
    subject: "Verify your Teambase email",
    text: `Hi ${name}, verify your Teambase account: ${verificationUrl}\n\nThis link expires in 24 hours.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033">
      <h1 style="font-size:24px">Verify your Teambase email</h1>
      <p>Hi ${safeName},</p>
      <p>Confirm this email address to finish creating your Teambase profile.</p>
      <p style="margin:28px 0"><a href="${safeUrl}" style="background:#1565c0;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Verify email</a></p>
      <p style="font-size:13px;color:#667085">This link expires in 24 hours. If you did not request it, you can ignore this email.</p>
    </div>`,
  });
  if (error) throw new Error(error.message);
}
