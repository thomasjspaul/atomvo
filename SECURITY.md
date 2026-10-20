# Security

Please **don't open a public issue** for a vulnerability. Report it privately via
GitHub: **Security → Report a vulnerability** on this repository.

## Model

Every deployment is self-hosted on the operator's own Cloudflare account; there is no
shared service. Protection comes from:

- **Cloudflare Access** in front of the app, plus in-Worker JWT verification
  (`worker/auth.ts`). The Worker fails closed (503) if Access isn't configured.
- `/api/ingest/hc/<secret>` is the only route meant to bypass Access; it requires the
  `INGEST_SHARED_SECRET` and is compared in constant time.
- Inbound email import only accepts Wyze sender domains.

Never commit `wrangler.jsonc`, `.dev.vars`, or any API keys — they are git-ignored.
