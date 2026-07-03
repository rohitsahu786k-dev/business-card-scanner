import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export async function sendResetEmail(to, token) {
  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
  const logoUrl = `${process.env.NEXTAUTH_URL}/assets/logo-full.png`;
  
  await transporter.sendMail({
    from: `"OnePWS CardScan" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset Your Password - OnePWS CardScan',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; width: 100% !important;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f8; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.025); border: 1px solid #e2e8f0;">
                <!-- Header -->
                <tr>
                  <td align="center" style="padding: 32px 32px 10px 32px;">
                    <img src="${logoUrl}" alt="OnePWS Logo" style="height: 48px; max-width: 100%; display: block; object-fit: contain;" />
                  </td>
                </tr>
                <!-- Divider -->
                <tr>
                  <td style="padding: 0 32px;">
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0 10px 0;" />
                  </td>
                </tr>
                <!-- Body Content -->
                <tr>
                  <td style="padding: 20px 32px 32px 32px;">
                    <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700; text-align: center;">Reset Your Password</h2>
                    <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.6; text-align: center;">We received a request to reset the password for your OnePWS CardScan account. Please click the button below to set a new password. This link is only valid for 1 hour.</p>
                    
                    <!-- CTA Button -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="center" style="padding: 10px 0 24px 0;">
                          <a href="${resetUrl}" target="_blank" style="background-color: #e63232; color: #ffffff; text-decoration: none; display: inline-block; padding: 12px 36px; font-size: 14px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 6px rgba(230, 50, 50, 0.2); transition: background-color 0.2s ease;">Reset Password</a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px; line-height: 1.5; text-align: center;">Or copy and paste this URL into your browser:</p>
                    <p style="margin: 0 0 24px 0; color: #e63232; font-size: 12px; line-height: 1.5; text-align: center; word-break: break-all;"><a href="${resetUrl}" style="color: #e63232; text-decoration: underline;">${resetUrl}</a></p>
                    
                    <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5; text-align: center;">If you did not request a password reset, you can safely ignore this email. Your password will remain secure.</p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                    <p style="margin: 0 0 6px 0; color: #475569; font-size: 12px; font-weight: 600;">OnePWS Business Card Scanner</p>
                    <p style="margin: 0; color: #94a3b8; font-size: 11px;">&copy; ${new Date().getFullYear()} OnePWS. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });
}

export async function sendWelcomeEmail(to, name, password) {
  const loginUrl = `${process.env.NEXTAUTH_URL}/login`;
  const logoUrl = `${process.env.NEXTAUTH_URL}/assets/logo-full.png`;
  const isSelfSignup = !password;
  
  const credentialsHtml = password ? `
    <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6; text-align: left;">An administrator has created a OnePWS CardScan account for you. Below are your temporary login details:</p>
    <div style="background-color: #f8fafc; padding: 18px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; font-family: monospace;"><strong>Email Address:</strong> <span style="color: #0f172a; font-family: sans-serif; font-size: 14px; font-weight: 600;">${to}</span></p>
      <p style="margin: 0; font-size: 13px; color: #64748b; font-family: monospace;"><strong>Temporary Password:</strong> <span style="color: #0f172a; font-family: sans-serif; font-size: 14px; font-weight: 600;">${password}</span></p>
    </div>
    <p style="margin: 0 0 24px 0; color: #e63232; font-size: 12px; font-weight: 500; text-align: left; line-height: 1.5;"><i style="margin-right: 4px;">&#9888;</i> We highly recommend changing your password in your Profile section immediately after logging in.</p>
  ` : `
    <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.6; text-align: center;">Thank you for registering on OnePWS Business Card Scanner. Your account is active and ready to go!</p>
  `;

  await transporter.sendMail({
    from: `"OnePWS CardScan" <${process.env.SMTP_USER}>`,
    to,
    subject: isSelfSignup ? 'Welcome to OnePWS CardScan!' : 'Welcome to OnePWS CardScan - Your Account Details',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to OnePWS CardScan</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; width: 100% !important;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f8; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.025); border: 1px solid #e2e8f0;">
                <!-- Header -->
                <tr>
                  <td align="center" style="padding: 32px 32px 10px 32px;">
                    <img src="${logoUrl}" alt="OnePWS Logo" style="height: 48px; max-width: 100%; display: block; object-fit: contain;" />
                  </td>
                </tr>
                <!-- Divider -->
                <tr>
                  <td style="padding: 0 32px;">
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0 10px 0;" />
                  </td>
                </tr>
                <!-- Body Content -->
                <tr>
                  <td style="padding: 20px 32px 32px 32px;">
                    <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700; text-align: center;">Welcome, ${name}!</h2>
                    ${credentialsHtml}
                    
                    <!-- CTA Button -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="center" style="padding: 10px 0 24px 0;">
                          <a href="${loginUrl}" target="_blank" style="background-color: #e63232; color: #ffffff; text-decoration: none; display: inline-block; padding: 12px 36px; font-size: 14px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 6px rgba(230, 50, 50, 0.2); transition: background-color 0.2s ease;">Log In to Scanner</a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5; text-align: center;">Start scanning business cards, extracting details instantly with AI, and managing your contacts seamlessly.</p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                    <p style="margin: 0 0 6px 0; color: #475569; font-size: 12px; font-weight: 600;">OnePWS Business Card Scanner</p>
                    <p style="margin: 0; color: #94a3b8; font-size: 11px;">&copy; ${new Date().getFullYear()} OnePWS. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });
}
