# Security

## Reporting a vulnerability

Open a private security advisory on GitHub
(`Security` → `Report a vulnerability`) or email the maintainer. Please don't file
public issues for security problems.

## Threat model notes

This is a read-only tool over public data. There are no user accounts and no
secrets stored server-side. Still, two surfaces are worth understanding:

### The local MCP server (`sgu-mcp`)

- Runs locally over stdio. It only **reads** the public SGU wiki and RSS feed, and
  a local SQLite file. It writes nothing back to those sources and holds no
  credentials.

### The web archive's "Ask Claude" panel (BYOK)

- The static site has an optional panel where a visitor pastes **their own**
  Anthropic API key. The request goes **directly from the visitor's browser to
  `api.anthropic.com`** — never to this site or any server we run.
- The key is stored in the visitor's `localStorage` for convenience. This means:
  - It never leaves their machine except to Anthropic.
  - **But** any successful XSS, or a compromise of a script the page loads, could
    read it. To reduce that blast radius the site:
    - Vendors its JS/WASM locally (no third-party CDNs at runtime).
    - Ships a strict `Content-Security-Policy` that only allows scripts from the
      same origin and only allows network connections to `api.anthropic.com`.
  - Users who prefer not to persist the key can clear it; treat the key as you
    would any password pasted into a browser tool.
- Keys pasted here should be **scoped/limited** (set a low spend cap in the
  Anthropic console). Never use an org-admin key.

### If you self-host the remote MCP connector (`start:http`)

- The HTTP transport must run behind authentication before exposure to the public
  internet (see the README's connector section). Do not expose an unauthenticated
  MCP endpoint — it would let anyone drive your server and consume your egress.
