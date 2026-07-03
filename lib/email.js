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

export async function sendWelcomeEmail(to, name, password) {
  const loginUrl = `${process.env.NEXTAUTH_URL}/login`;
  const isSelfSignup = !password;
  
  const credentialsHtml = password ? `
    <p style="color:#666;font-size:14px;margin-bottom:24px">An administrator has created an account for you on OnePWS CardScan. Here are your login credentials:</p>
    <div style="background:#fff;padding:16px;border-radius:8px;border:1px solid #eef2f6;margin-bottom:24px">
      <p style="margin:4px 0;font-size:14px"><strong>Email:</strong> ${to}</p>
      <p style="margin:4px 0;font-size:14px"><strong>Password:</strong> ${password}</p>
    </div>
  ` : `
    <p style="color:#666;font-size:14px;margin-bottom:24px">Your account has been successfully created. You can now log in using your registered email and password.</p>
  `;

  await transporter.sendMail({
    from: `"OnePWS CardScan" <${process.env.SMTP_USER}>`,
    to,
    subject: isSelfSignup ? 'Welcome to OnePWS CardScan!' : 'Welcome to OnePWS CardScan - Your Account Details',
    html: `
      <div style="font-family:'Be Vietnam Pro',sans-serif;max-width:500px;margin:0 auto;padding:40px 20px;background:#f9f9f9;border-radius:12px;border:1px solid #eef2f6">
        <h2 style="color:#1a1a1a;margin-bottom:8px">Welcome, ${name}!</h2>
        ${credentialsHtml}
        <a href="${loginUrl}" style="display:inline-block;padding:12px 32px;background:#e63232;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Log In Now</a>
        <p style="color:#999;font-size:12px;margin-top:32px">${isSelfSignup ? 'Start scanning business cards and managing your contacts instantly!' : 'We recommend changing your password from your Profile page after logging in.'}</p>
      </div>
    `,
  });
}
