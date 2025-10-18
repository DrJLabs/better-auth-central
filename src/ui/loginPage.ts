import { escapeHtml } from "./html";

interface LoginPageOptions {
  googleSignInUrl: string;
  baseUrl: string;
  googleProviderConfigured: boolean;
}

export const renderLoginPage = ({
  googleSignInUrl,
  baseUrl,
  googleProviderConfigured,
}: LoginPageOptions): string => {
  const safeUrl = escapeHtml(googleSignInUrl);
  const safeBase = escapeHtml(baseUrl);

  const providerCallout = googleProviderConfigured
    ? `<a class="cta" href="${safeUrl}">Continue with Google</a>`
    : `<div class="notice">
        <strong>Google sign-in unavailable.</strong>
        <span>Provide GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this flow.</span>
      </div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sign in to Better Auth</title>
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
        background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
      }
      .card {
        width: min(42rem, 100%);
        background: rgba(255,255,255,0.92);
        border-radius: 1rem;
        padding: 2.5rem 2rem;
        box-shadow: 0 30px 60px rgba(15, 23, 42, 0.12);
        backdrop-filter: blur(6px);
      }
      h1 {
        margin-top: 0;
        font-size: 2rem;
        letter-spacing: -0.01em;
      }
      p {
        margin: 0.6rem 0 1.4rem;
        line-height: 1.6;
      }
      strong {
        color: #2563eb;
      }
      .cta {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 1rem;
        padding: 0.85rem 1.4rem;
        border-radius: 0.625rem;
        background: #2563eb;
        color: #fff;
        font-weight: 600;
        text-decoration: none;
        box-shadow: 0 12px 24px rgba(37, 99, 235, 0.25);
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .cta:hover {
        transform: translateY(-1px);
        box-shadow: 0 16px 32px rgba(37, 99, 235, 0.28);
      }
      .notice {
        border: 1px solid #f97316;
        background: rgba(249, 115, 22, 0.08);
        color: #9a3412;
        padding: 1rem 1.25rem;
        border-radius: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      ul {
        padding-left: 1.25rem;
      }
      code {
        background: #e2e8f0;
        padding: 0.2rem 0.4rem;
        border-radius: 0.375rem;
        font-size: 0.9rem;
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
      <h1>Welcome to Better Auth</h1>
      <p><strong>${safeBase}</strong> is ready to authenticate the ChatGPT Todo MCP integration. Sign in with Google to continue.</p>
      <p>If you manage this deployment, customise this screen to reflect your product brand and policies.</p>
      ${providerCallout}
      <section>
        <h2>Need a different path?</h2>
        <ul>
          <li>Trigger a custom SSO or email flow by linking to your preferred route.</li>
          <li>Add help text describing who should sign in here.</li>
          <li>Make sure to keep the Google flow accessible at <code>${safeUrl}</code>.</li>
        </ul>
      </section>
      <footer>
        Managed by Better Auth · Ensure administrators keep trusted origins and cookies configured securely.
      </footer>
    </main>
  </body>
</html>`;
};
