const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface ConsentPageOptions {
  consentCode: string;
  clientId: string;
  scopeList: string[];
  submitUrl: string;
}

export const renderConsentPage = ({
  consentCode,
  clientId,
  scopeList,
  submitUrl,
}: ConsentPageOptions): string => {
  const safeConsent = escapeHtml(consentCode);
  const safeClient = escapeHtml(clientId);
  const safeSubmit = escapeHtml(submitUrl);
  const renderedScopes = scopeList.length
    ? scopeList.map((scope) => `<li><code>${escapeHtml(scope)}</code></li>`).join("")
    : '<li><em>No scopes were requested.</em></li>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Authorize Application</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 3rem 1.5rem;
        display: flex;
        justify-content: center;
        background: radial-gradient(circle at top, #dbeafe 0%, #eef2ff 100%);
      }
      .card {
        width: min(46rem, 100%);
        background: rgba(255, 255, 255, 0.95);
        border-radius: 18px;
        padding: 2.75rem 2.25rem;
        box-shadow: 0 32px 60px rgba(30, 64, 175, 0.18);
        backdrop-filter: blur(8px);
      }
      h1 {
        margin-top: 0;
        font-size: 2.1rem;
        letter-spacing: -0.01em;
      }
      p {
        margin: 0.6rem 0 1.2rem;
        line-height: 1.6;
      }
      .client {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.4rem 0.75rem;
        border-radius: 0.6rem;
        background: rgba(59, 130, 246, 0.12);
        color: #1d4ed8;
        font-weight: 600;
      }
      ul {
        margin: 1rem 0 1.75rem;
        padding-left: 1.25rem;
      }
      code {
        background: #e2e8f0;
        padding: 0.2rem 0.4rem;
        border-radius: 0.375rem;
        font-size: 0.9rem;
      }
      .actions {
        display: flex;
        gap: 1rem;
      }
      button {
        padding: 0.85rem 1.5rem;
        border-radius: 0.7rem;
        border: none;
        font-weight: 600;
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      button[type="submit"] {
        background: #22c55e;
        color: #fff;
        box-shadow: 0 14px 32px rgba(34, 197, 94, 0.25);
      }
      button[type="submit"]:hover {
        transform: translateY(-1px);
        box-shadow: 0 18px 36px rgba(34, 197, 94, 0.28);
      }
      button[data-deny="true"] {
        background: #e2e8f0;
        color: #1f2937;
      }
      footer {
        margin-top: 2.4rem;
        font-size: 0.85rem;
        color: #475569;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Allow access for <span class="client">${safeClient}</span>?</h1>
      <p>The requesting application wants permission to act on your behalf. Review the requested scopes below before continuing.</p>
      <section>
        <h2>Requested scopes</h2>
        <ul>
          ${renderedScopes}
        </ul>
      </section>
      <form method="post" action="${safeSubmit}">
        <input type="hidden" name="consent_code" value="${safeConsent}" />
        <div class="actions">
          <button type="submit" name="accept" value="true">Allow access</button>
          <button type="submit" name="accept" value="false" data-deny="true">Deny</button>
        </div>
      </form>
      <footer>
        Need help? Contact your workspace administrator or revoke access from your Better Auth dashboard.
      </footer>
  </body>
</html>`;
};
