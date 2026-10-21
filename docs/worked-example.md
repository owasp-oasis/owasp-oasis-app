# Worked Example

This fictional example shows how a reviewer can reason about one candidate fix using the fields in the current OASIS validation form. It is an illustration, not a real finding or a maintainer decision.

## Reported finding

A fictional archive library extracts files from an uploaded archive. The finding reports that an archive entry named `../../outside.txt` may cause a file to be written outside the selected extraction directory.

## Evidence and relevance

The reviewer follows the entry name from the archive parser to the path join and file write. In this fictional candidate, the extraction code does not verify that the resolved output path remains inside the intended destination. If an attacker can supply an archive that the application extracts, a traversal entry could write outside that directory. The impact depends on which application accepts and extracts the archive and what filesystem permissions it has.

## Proposed patch

The proposed change resolves the extraction root and each output path, then rejects entries whose resolved path is outside the root before writing the file.

## Regression considerations

The reviewer checks that normal nested archive paths still extract, and considers platform-specific separators and absolute paths. Symlink entries and cleanup after a rejected archive also deserve regression tests because they can affect containment behavior.

## Reviewer reasoning

The reported data flow and missing containment check support the finding in this fictional example. The patch addresses the main path traversal, but the diff does not establish how symlink entries are handled, and the available tests do not cover the platform-specific cases. The reviewer asks for those cases to be addressed before accepting the candidate as proposed.

## Example validation

- **Decision:** Modify
- **Confidence:** Medium
- **Recommended action:** Revise

These are the current form's Modify fields. The final decision remains the reviewer's judgment; the finding evidence does not automatically determine it.

### Example reviewer comment

“The archive entry path reaches the file write without a containment check, so the reported traversal is supported when an application extracts an untrusted archive. The proposed root check addresses the direct traversal case. Please cover symlink entries and platform-specific absolute paths with regression tests, then request another review.”

OASIS validation is community input. It does not constitute maintainer approval or merge the change.

Return to the [Quick Start](/quick-start), the [Reviewer Guide](/reviewer-guide), or [browse Candidate Fixes](/workspace/fixes).
