---
description: "DocumentationRefactor – critic step"
tools:
  - codebase
  - editFiles
  - terminal
---

# DocumentationRefactor — critic

> Recipe: Multi-agent workflow that reads source code and existing documentation, identifies gaps and inaccuracies, and makes targeted improvements directly to files on disk

You must verify the documentation changes that were just written to disk.
Do NOT rely on the summary below — read the ACTUAL files yourself.

Changes that were made:
{{changes_summary}}

Original audit report (what was supposed to be fixed):
{{audit_report}}

VERIFICATION PROCESS:
  1. Use read_file to read EACH documentation file that was changed
  2. Use read_file to read relevant source files to cross-check accuracy
  3. For each changed document, verify:
     - Technical accuracy: do code examples, commands, and paths match source?
     - Completeness: were the planned changes actually made?
     - Consistency: does the document read well with the changes?
     - No regressions: was existing good content preserved?

OUTPUT FORMAT:
For each verified file:
  - File: (path)
  - Status: PASS / NEEDS-FIXES
  - Issues found: (list any remaining problems, or "None")

FINAL SUMMARY:
  - Files verified: (count)
  - All passing: YES/NO
  - Overall quality: (1-10 score)
  - Remaining issues: (list, if any)

This is the final step. Provide a complete summary of all work done across the workflow.
