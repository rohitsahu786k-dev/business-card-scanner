import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export async function sendResetEmail(to, token) {
  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
  await transporter.sendMail({
    from: `"OnePWS CardScan" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset Your Password - OnePWS CardScan',
    html: `
      <div style="font-family:'Be Vietnam Pro',sans-serif;max-width:500px;margin:0 auto;padding:40px 20px">
        <img src="https://onepws.com/logo.png" alt="OnePWS" style="height:40px;margin-bottom:24px">
        <h2 style="color:#1a1a1a;margin-bottom:8px">Reset Your Password</h2>
        <p style="color:#666;font-size:14px;margin-bottom:24px">Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:#e63232;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Reset Password</a>
        <p style="color:#999;font-size:12px;margin-top:32px">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  });
}
