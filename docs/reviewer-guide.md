# Reviewer Guide

This guide describes a bounded way to review an OASIS candidate fix. You do not need a special OASIS reviewer role to participate; sign in with GitHub to use the validation workflow.

## What is a candidate fix?

A candidate fix is a proposed code change intended to address a reported security concern. Its presence in OASIS does not by itself establish that the underlying implementation is vulnerable, that the patch is final, or that a maintainer will merge it.

## A practical review flow

### 1. Understand the finding

Read the Summary and Details. Identify the behavior being reported, the affected code, the weakness or security property involved, the tool or source that raised the concern, and what evidence is available.

### 2. Inspect the change

Review the Diff. Work out what behavior changes and whether the patch addresses the reported concern. Look for the security property the change is intended to establish, not just whether the code looks different.

### 3. Check context

Use the Comments and other project context. Open the pull request on GitHub when needed to inspect surrounding code, tests, discussion, or repository-specific behavior.

### 4. Make a bounded decision

Ask what the evidence supports for this candidate. A vote records a reviewer's judgment; it is not proof by itself. Confidence and community consensus provide context and should not replace examining the code and evidence.

## Review questions

### Finding validity

Does the reported behavior exist in the affected code? Understand the input, operation, and security property involved. A scanner label or weakness identifier can help locate context, but does not answer this question on its own.

### Exploitability and security relevance

Consider whether attacker-controlled input can reach the behavior, whether the relevant path is reachable, what privileges or preconditions apply, and what impact could result. Record the limits of the evidence you have.

### Patch quality

Does the change remove or reduce the reported concern? Is the intended security property clear? Consider whether the patch addresses the relevant behavior rather than only a symptom.

### Regression risk

Look for functional or security behavior that could break or become less safe. Review affected call sites, tests, and assumptions when they are available. A small diff can still have broad effects.

### Evidence quality

Prefer evidence such as code paths, data flow, tests, reproduction steps, and relevant project discussion. Treat automated findings and confidence scores as context to inspect, not as a substitute for evidence.

## Keep the two judgments separate

Whether a vulnerability is valid and whether a proposed remediation is good are related but separate questions. A finding may be supported while the patch is incomplete or unsafe; a proposed change may also improve security even when the evidence for the original claim is limited. Consider each question on its own evidence.

## When evidence is incomplete

Do not vote just to finish a review. Read the discussion, inspect the Diff and available context, and ask a question if that could clarify the issue. If you cannot make a supported decision, leave the candidate for someone with stronger context or expertise.

## OASIS decisions

- **Accept** — the evidence supports the reported concern and the proposed change is an appropriate response.
- **Modify** — the concern or direction may be valid, but the proposed change needs revision.
- **Reject** — the evidence or remediation does not support this candidate as proposed.
- **Duplicate** — the same concern is already represented by another candidate fix.

Choose the decision that best fits the evidence and explain the reasoning in the form. Do not treat the decision as a maintainer or merge outcome.

## The current validation form

Form fields depend on the selected decision. In the current interface, all decisions ask for Comments. Accept and Modify also ask for Confidence and a Recommended action; Reject offers optional Blocking issues and To reconsider fields; Duplicate asks for the parent pull request number. These are reviewer inputs and do not represent maintainer decisions.

## Validation and maintainer actions are separate

OASIS validation is community input and does not merge code. The Workflow view tracks maintainer and upstream actions separately. Project maintainers decide whether and how to respond to a candidate submitted to their repository.

Return to the [Quick Start](/quick-start) or [browse Candidate Fixes](/workspace/fixes).
