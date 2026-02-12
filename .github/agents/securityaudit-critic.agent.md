---
description: "SecurityAudit – critic step"
tools:
  - codebase
  - editFiles
  - terminal
handoff:
  - agent: securityaudit-executor
    autoSend: true
---

# SecurityAudit — critic

> Recipe: Comprehensive security audit workflow covering threat modeling, code review,

Code: {{code_to_audit}}
Threat Model: {{threat_model}}

Perform security code review:
1. Authentication vulnerabilities
2. Authorization issues
3. Input validation flaws
4. Injection attacks
5. Cryptographic weaknesses
6. Session management
7. Dependency vulnerabilities

When you are done, hand off to the next agent in the chain.
