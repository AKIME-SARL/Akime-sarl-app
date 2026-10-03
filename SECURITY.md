# Security and secret handling

## Repository rules

- `.env` and `backups/` are ignored and must never be force-added.
- `.env.example` is the only environment file intended for Git. It contains
  placeholders and local-development defaults only.
- Do not put credentials in source code, workflow YAML, issues, pull-request
  text, test fixtures, or logs.
- The `Secret scan` workflow runs Gitleaks on pull requests, protected-branch
  pushes, weekly schedules, and on demand. It checks out full history so a
  historical commit is included in the scan.

## Production configuration

In GitHub, create a `production` Environment and add sensitive configuration
under **Settings → Environments → production → Environment secrets**. At a
minimum, store these as secrets:

`MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`,
`EMAIL_PASS`, and any OAuth client secret.

The repository-level `GITLEAKS_LICENSE` secret is also required for the
Gitleaks workflow because this repository belongs to an organization. Obtain
the license from Gitleaks before enabling the workflow on the default branch.

Use Environment variables (rather than secrets) for non-sensitive settings
such as `NODE_ENV`, `PORT`, `BASE_URL`, `ORIGIN`, and rate limits. The
deployment workflow or hosting platform must inject these values into the
application process; GitHub Secrets are not automatically runtime environment
variables.

Repository administrators should also enable GitHub's native **Secret
scanning** and **Push protection** under **Settings → Code security and
analysis**. Those account-level settings cannot be enabled by a repository
file.

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
