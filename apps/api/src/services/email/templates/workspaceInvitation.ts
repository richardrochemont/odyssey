import { WorkspaceInvitationPayload } from "../types";

export interface CompiledEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export function buildWorkspaceInvitationEmail(payload: WorkspaceInvitationPayload): CompiledEmailTemplate {
  const { inviterName, workspaceName, role, expiresAt, invitationUrl } = payload;
  const formattedExpiry = new Date(expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const subject = `You've been invited to join ${workspaceName} on Odyssey`;

  const text = `
You've been invited to join ${workspaceName} on Odyssey!

${inviterName} has invited you to join the ${workspaceName} workspace with the role of "${role}".

Accept your invitation by opening the following link in your browser:
${invitationUrl}

Note: This link is single-use and will expire on ${formattedExpiry}.

If you were not expecting this invitation, you can safely ignore this email.

---
Odyssey • Residential Property Operations Cockpit
https://odyssey.investments
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0f172a;
      color: #e2e8f0;
      margin: 0;
      padding: 32px 16px;
    }
    .card {
      max-width: 560px;
      margin: 0 auto;
      background-color: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .brand {
      font-size: 20px;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: -0.5px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h1 {
      font-size: 22px;
      font-weight: 600;
      color: #f8fafc;
      margin-top: 0;
      margin-bottom: 16px;
    }
    p {
      font-size: 15px;
      line-height: 1.6;
      color: #cbd5e1;
      margin-bottom: 20px;
    }
    .badge {
      display: inline-block;
      background-color: #0284c7;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: capitalize;
    }
    .cta-container {
      margin: 28px 0;
      text-align: center;
    }
    .btn {
      display: inline-block;
      background-color: #0284c7;
      color: #ffffff !important;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }
    .expiry-note {
      font-size: 13px;
      color: #94a3b8;
      border-top: 1px solid #334155;
      padding-top: 16px;
      margin-top: 24px;
    }
    .footer {
      max-width: 560px;
      margin: 24px auto 0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <span>Odyssey</span>
    </div>
    <h1>Workspace Invitation</h1>
    <p>
      <strong>${inviterName}</strong> has invited you to join the <strong>${workspaceName}</strong> workspace on Odyssey.
    </p>
    <p>
      Assigned Role: <span class="badge">${role}</span>
    </p>
    <div class="cta-container">
      <a href="${invitationUrl}" class="btn" target="_blank" rel="noopener noreferrer">Join Workspace</a>
    </div>
    <div class="expiry-note">
      This secure link is single-use and will expire on <strong>${formattedExpiry}</strong>. If you did not expect this invitation, you can safely ignore this email.
    </div>
  </div>
  <div class="footer">
    Odyssey Portfolio Management &bull; https://odyssey.investments
  </div>
</body>
</html>
`.trim();

  return { subject, html, text };
}
