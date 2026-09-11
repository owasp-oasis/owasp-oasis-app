# Security Policy

OWASP OASIS treats reports about its own application and infrastructure
differently from vulnerability findings in the open-source projects displayed
in the OASIS Workspace.

## What belongs here

Use this policy for a suspected vulnerability in this repository, the OASIS
website, its Worker APIs, authentication or authorization, data handling,
deployment, or supporting infrastructure.

If the finding affects another open-source project or one of its dependencies,
follow that project's security policy or coordinated-disclosure process. Do not
publish an unpatched upstream vulnerability in this repository merely because
the project's pull request appears in the OASIS Workspace.

## Request a private reporting channel

GitHub private vulnerability reporting is not currently enabled for this
repository. Until a private reporting channel is published, open a
[security contact request](https://github.com/owasp-oasis/owasp-oasis-app/issues/new?template=security-contact.yml).

The public request must contain no vulnerability details. Do not include an
exploit, reproduction steps, affected endpoint, credentials, tokens, private
data, screenshots, logs, or attachments. A maintainer will arrange an
appropriate private channel for the technical report.

Once a private channel is established, include:

- the affected URL, component, version, or commit, if known;
- the security impact and realistic attack prerequisites;
- minimal reproduction steps or a proof of concept;
- whether sensitive data was accessed;
- possible mitigations or remediation ideas; and
- any coordinated-disclosure timing constraints.

Please do not open duplicate public requests or discuss the report publicly
while it is being assessed.

## Research safety

Use test accounts and the least invasive method that demonstrates the issue.
Do not degrade service, access data that is not yours, persist access, exfiltrate
data, test third-party projects through OASIS, or use social engineering. Stop
testing and request a private channel if you encounter credentials, tokens,
personal information, or other sensitive data.

Maintainers will coordinate validation, remediation, credit, and disclosure in
the private thread. Response timing may depend on volunteer availability and
the severity and complexity of the report.

## Supported version

Security fixes target the current `main` branch and the currently deployed
production service. Reports against old commits are useful when the same issue
is still present in the current version.
