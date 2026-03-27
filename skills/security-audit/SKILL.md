---
name: security-audit
description: "Use when assessing security of code, APIs, or infrastructure — OWASP-based review with severity classification"
---

# Security Audit

Structured security assessment based on OWASP Top 10 with project-context awareness.

**Announce at start:** "I'm using the devflow:security-audit skill."

## When to Use

- During Review phase (design-level security)
- During Validation phase (implementation-level security)
- When touching auth, data handling, or APIs
- Before any deployment

## OWASP Top 10 Checklist (2021)

### A01: Broken Access Control
- [ ] Authorization checks on every protected endpoint
- [ ] Principle of least privilege enforced
- [ ] No direct object references without ownership validation
- [ ] CORS properly configured (not `*` in production)
- [ ] Rate limiting on sensitive operations

### A02: Cryptographic Failures
- [ ] Sensitive data encrypted at rest and in transit
- [ ] Strong algorithms (no MD5, SHA1 for security)
- [ ] Secrets in env vars or secret managers, never in code
- [ ] HTTPS enforced, no mixed content

### A03: Injection
- [ ] SQL: parameterized queries, no string concatenation
- [ ] XSS: output encoding, Content-Security-Policy headers
- [ ] Command injection: no user input in shell commands
- [ ] LDAP/NoSQL: appropriate escaping and validation

### A04: Insecure Design
- [ ] Threat modeling done for critical flows
- [ ] Abuse cases considered (not just happy path)
- [ ] Defense in depth (not relying on single check)

### A05: Security Misconfiguration
- [ ] Default credentials changed
- [ ] Unnecessary features/endpoints disabled
- [ ] Error messages don't leak internal details
- [ ] Security headers set (X-Frame-Options, X-Content-Type-Options, etc.)

### A06: Vulnerable Components
- [ ] Dependencies checked for known CVEs
- [ ] No unused dependencies
- [ ] Lock file committed (package-lock.json, Cargo.lock, etc.)

### A07: Authentication Failures
- [ ] Password hashing with bcrypt/argon2 (not plain or MD5)
- [ ] Session management secure (httpOnly, secure, SameSite cookies)
- [ ] Multi-factor available for critical accounts
- [ ] Account lockout after failed attempts

### A08: Data Integrity Failures
- [ ] CI/CD pipeline integrity (no unsigned packages)
- [ ] Deserialization of untrusted data validated
- [ ] Auto-update mechanisms use signed packages

### A09: Logging Failures
- [ ] Authentication events logged (login, logout, failed attempts)
- [ ] Authorization failures logged
- [ ] Sensitive data NOT logged (passwords, tokens, PII)
- [ ] Logs tamper-resistant

### A10: Server-Side Request Forgery (SSRF)
- [ ] User-supplied URLs validated and restricted
- [ ] Internal network access blocked from user requests
- [ ] URL schemes restricted (no `file://`, `gopher://`)

## Severity Classification

| Severity | Criteria | Action |
|----------|---------|--------|
| **CRITICAL** | Exploitable now, data at risk | Block merge, fix immediately |
| **HIGH** | Significant risk, requires specific conditions | Fix before merge |
| **MEDIUM** | Moderate risk, defense-in-depth gap | Fix in current sprint |
| **LOW** | Minor risk, best-practice deviation | Track, fix when nearby |

## Report Format

```markdown
## Security Audit: [feature/scope]

### Findings

#### [CRITICAL] SQL Injection in user search
- **Location:** src/api/users.ts:42
- **Issue:** User input concatenated into SQL query
- **Impact:** Full database access
- **Fix:** Use parameterized query

#### [HIGH] Missing auth check on admin endpoint
...

### Summary
- Critical: N | High: N | Medium: N | Low: N
- **Recommendation:** BLOCK / FIX / PASS
```

## Mode Integration

### Full Mode
```
agent({ action: "orchestrate", agents: ["security-auditor"], task: "<description>" })
skill({ action: "getContent", skill: "security-audit" })
```

### Lite Mode
Read `.context/agents/security-auditor.md` and `.context/skills/security-audit/SKILL.md`.

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| "We'll add security later" | Security is cheapest at design time, most expensive in production |
| Only checking the happy path | Attackers don't use your UI the way users do |
| Trusting client-side validation | Everything client-side can be bypassed |
| Security through obscurity | Hidden URLs/endpoints are still discoverable |
| Logging sensitive data "for debugging" | Logs get leaked, stored indefinitely, shared broadly |
