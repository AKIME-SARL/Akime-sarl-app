# Security and secret handling

## Repository rules

- `.env` and `backups/` are ignored and must never be force-added.
- `.env.example` is the only environment file intended for Git. It contains
  placeholders and local-development defaults only.
- Do not put credentials in source code, workflow YAML, issues, pull-request
  text, test fixtures, or logs.
- The `Secret scan` workflow runs the free, open-source Gitleaks CLI on pull
  requests, protected-branch pushes, weekly schedules, and on demand. It
  checks out full history so a historical commit is included in the scan.

## Production configuration

In GitHub, create a `production` Environment and add sensitive configuration
under **Settings → Environments → production → Environment secrets**. At a
minimum, store these as secrets:

`MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`,
`EMAIL_PASS`, and any OAuth client secret.

Use Environment variables (rather than secrets) for non-sensitive settings
such as `NODE_ENV`, `PORT`, `BASE_URL`, `ORIGIN`, and rate limits. The
deployment workflow or hosting platform must inject these values into the
application process; GitHub Secrets are not automatically runtime environment
variables.

In production, use a MongoDB URI with TLS enabled (`mongodb+srv://` or
`tls=true`). The application rejects a production MongoDB URI without TLS.
Use a dedicated database user limited to `readWrite` on the application
database; do not use an Atlas organization, project, or cluster administrator
credential for the application.

Rate-limit counters for API and authentication endpoints are stored in the
MongoDB `rate_limits` collection, so limits are shared by all application
instances. The application creates a TTL index on startup; the runtime
database user must have permission to create indexes. Keep this collection in
the application database and do not give the application user broader
database access to support it.

Backups contain production data and must be encrypted at rest, access
restricted, retained outside the application host, and periodically tested
with a restore. The local `backups/` directory being Git-ignored does not make
it a safe production backup destination.

Privileged `admin` and `editor` accounts must enable TOTP-based MFA before
they receive an ordinary login session. On their first password login, the
admin page guides the user through enrollment. MFA verification is also
rate-limited.

The public website listens on `PORT` (default `4000`). The admin interface and
its management APIs listen separately on `ADMIN_PORT` (default `4001`), bound
to `ADMIN_HOST` (default `127.0.0.1`). The public listener rejects admin pages
and privileged API routes; the admin listener rejects public website pages.
Do not bind the admin listener to a public interface. Put a trusted HTTPS
reverse proxy on the same host in front of the private admin listener, or use
a VPN. If the proxy runs in another container, bind only to a private
container-network address and firewall the port so only the proxy can reach
it. Never publish `ADMIN_PORT` directly to the internet.

Configure the reverse proxy to forward the admin hostname to
`http://127.0.0.1:4001`, and enable `TRUST_PROXY=true` only when requests can
reach the app through that trusted proxy. Admins must open the admin hostname,
not the public website hostname. Production startup rejects a public
`ADMIN_HOST`; loopback and private-network bind addresses are accepted. Include
both public and admin HTTPS origins in `ORIGIN` if the browser makes
cross-origin API requests.
Set `BASE_URL` to the public website HTTPS URL; links from the admin interface
back to the website use this value.
Set `ADMIN_URL` to the HTTPS hostname served by the trusted proxy (for example
`https://admin.example.com`). The public website's Espace pro link redirects
there; the admin listener itself remains private and must not be exposed
directly.
See [NGINX-DEPLOYMENT.md](./NGINX-DEPLOYMENT.md) for a VPS Nginx and
Let's Encrypt setup example.

Repository administrators should also enable GitHub's native **Secret
scanning** and **Push protection** under **Settings → Advanced Security** when
GitHub Secret Protection is available for the organization. Those account-level
settings cannot be enabled by a repository file.

The Gitleaks workflow uses a versioned scanner image rather than the floating
`latest` tag. Review and update that pinned version periodically.

## If a secret is exposed

1. Revoke or rotate it at its issuer first (MongoDB user password, SMTP app
   password, OAuth client secret, API token, and so on).
2. Rotate the local JWT keys with `npm run security-rotate-jwt`; deploy the new
   values as `JWT_SECRET` and `JWT_REFRESH_SECRET`. Existing signed sessions
   become invalid.
3. Revoke stored refresh sessions with `npm run security-remediate` after a
   protected backup has been taken.
4. Remove the secret from every affected commit and force-push only after the
   replacement has been deployed. Treat all old values as compromised even
   after history rewriting.
