---
id: security/raw-html-sinks
title: Unsanitized HTML (XSS)
severity: high
appliesTo: [project]
inputs: [source.code]
---

## Intent
Traces every `dangerouslySetInnerHTML` and `innerHTML` back to where its content comes from, such as the CMS, shoppers or APIs, and checks that untrusted content is sanitized first. Rendering unsanitized HTML lets injected scripts run on the site (cross-site scripting).
## Inspect
Trace dangerouslySetInnerHTML and innerHTML values backward through CMS/user inputs, transformations, sanitizers, and trust boundaries.
## Evaluate
Finding requires an untrusted or inadequately sanitized flow; sink presence alone, with every flow trusted or sanitized, is a pass.
## Evidence
Cite source, transformations, sanitizer policy, and sink lines without sensitive content.
## Remediation
Render structured data or apply a maintained context-appropriate sanitizer.
## Examples
Compliant: compile-time constant markup. Problematic: unsanitized CMS HTML. Ambiguous: sink with unresolved upstream source.
