# Security policy

islam.se has no accounts, but readers send it corrections, sometimes with an
email address, and those are kept in a Cloudflare D1 database and mailed to
the editors. A hole in the site's functions could expose them, or let someone
change what a reader sees on a site about their faith. Please report one
privately.

## Reporting a vulnerability

Use GitHub's private reporting:
[report a vulnerability](https://github.com/YunusAndreasson/islamse/security/advisories/new).
Please don't open a public issue.

Include the URL or the app version (at the end of »Om appen« in its
settings), what you did, what happened, and what an attacker would gain. A fix
is coordinated with you before anything is published, and you're credited in
the advisory unless you'd rather not be.

## Supported versions

The site as deployed at https://islam.se, and the latest release of the app on
the App Store and Google Play. Fixes go out as a deploy or a new release.

## Scope

In scope:

- https://islam.se, including its Pages Functions: the correction forms
  (`/api/rattelse`, `/api/moske-rattelse`), the news pages and the Markdown
  responses (`apps/web/functions/`)
- the Worker that mails corrections (`apps/web/workers/rattelse-mailer/`)
- the MCP server at https://mcp.islam.se (`apps/mcp-articles/`)
- the islam.se app for iOS and Android (`apps/mobile/`)
- this repository's workflows

Out of scope: Cloudflare, Apple, Google, Expo and Sentry themselves, and the
map tile services the maps load (MapTiler, OpenFreeMap). Report those to their
owners. A factual or doctrinal error in a text isn't a security issue: use the
»Föreslå en rättelse« link at the end of the page.
