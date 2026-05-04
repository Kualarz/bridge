# Bridge — Secrets Scan of Git History

**Date:** 2026-05-03
**Scope:** Full git history, all branches, all commits.
**Tool used:** Manual `git log --all -p | grep -nE` patterns (gitleaks not installed locally; npx fallback failed — gitleaks is a Go binary, not on npm).
**Repository state at scan time:** 5 commits total, 26 distinct files ever tracked, 1 branch (`main`).

---

## Summary

| Credential type | Count |
|-----------------|-------|
| Anthropic API key (`sk-ant-...`) | **0** |
| OpenAI API key (`sk-...`) | **0** |
| GitHub PAT (`ghp_`, `gho_`, `ghs_`, `github_pat_`) | **0** |
| AWS access key (`AKIA...`) | **0** |
| Google API key (`AIza...`) | **0** |
| Google service account JSON (`"private_key":` / `"type": "service_account"`) | **0** |
| Tailscale auth key (`tskey-auth-...`) | **0** |
| Generic env-style credential assignment (`KEY=sk-`, `KEY=ghp_`, etc.) | **0** |
| Committed real `.env` file (any path) | **0** |

**Total findings: 0**

> **Caveat:** Zero matches against the standard pattern set does NOT prove the repo is free of secrets. It only proves the specific patterns scanned for did not match. Custom-format keys, base64-encoded credentials, OAuth refresh tokens with non-standard prefixes, or anything inside a binary blob would not be caught by this scan. Treat this as "no obvious smoking gun" rather than "definitely clean."

---

## Detailed findings

None. No matches against any of the credential regex patterns specified in the brief.

---

## Files of concern (sensitive name patterns ever committed)

Search: every file ever added across all commits matching `\.env`, `secret`, `credential`, `token`, `\.pem$`, `\.key$`, `\.p12$`, `id_rsa`, `config\.json$`.

| File path | Risk assessment |
|-----------|-----------------|
| `.env.example` | **SAFE.** Reviewed contents at every commit it appears (`06bb324`, `c2bf865`). Contains only `BRIDGE_PORT=7777` and `LOG_LEVEL=info` style assignments — no credential-shaped values. This file is the public template for `.env` and is intended to be committed. |
| `tsconfig.json` | **SAFE — false positive.** Matched the `*config.json$` pattern but is the standard TypeScript compiler config. Reviewed: no credentials, no secrets, only TypeScript compiler options. |

No `.env`, `.env.local`, `.env.production`, `*.pem`, `*.key`, `id_rsa`, or any other actually-sensitive filename has ever been committed to this repository.

---

## Conclusion

The git history of this repo, as of commit `06bb324`, contains **no detected credentials** by any of the standard scanning patterns.

This is the best possible outcome from a scan, but it is not equivalent to a guarantee. Three caveats:

1. **Pattern coverage is finite.** Any credential format not matching the listed regexes (custom internal tokens, JWTs without recognizable prefixes, database connection strings with embedded passwords, etc.) would slip past this scan. A second pass with a real tool (`gitleaks`, `truffleHog`) is recommended before going public — specifically gitleaks's broader rule set, which includes ~100+ patterns vs. the 7 scanned here.
2. **Public-repo exposure is not undone by deletion.** If anything credential-shaped *was* ever briefly pushed to this repo while it was public, even if since removed from working tree and history, it should be assumed compromised. (The brief notes the repo is currently public.) The scan above confirms nothing of that shape is *currently in history*, but that doesn't speak to anything that may have been force-pushed away or scraped during a brief exposure window.
3. **Tailscale Funnel hostname is not in committed files.** The hostname `jimmy-pc.tail4eb324.ts.net` exists only in live `tailscale serve` output and in this conversation's transcript. It is not a credential by itself (it's just a routable hostname; the access control is the Funnel ACL, not the URL), but worth noting it isn't leaked through commits either.

**Recommendation:** treat this as a green light for the OSS release with respect to credential leakage in history. If the user wants belt-and-braces, a one-shot run of `gitleaks` (installed standalone or via Docker) would close the pattern-coverage gap before publishing.
