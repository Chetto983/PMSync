#!/bin/bash
# check-deprecated.sh - Reject DEPRECATED markers without removal dates
#
# Allowed: DEPRECATED - Remove by 2026-03-01
# Allowed: @deprecated Use X instead - Remove by 2026-03-01
# Blocked: DEPRECATED (no removal date)
# Blocked: @deprecated Use X instead (no removal date)

set -e

# Get staged TypeScript files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.ts$' || true)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Pattern: DEPRECATED or @deprecated NOT followed by "Remove by YYYY-MM-DD" on same or next line
# We check for DEPRECATED without a removal date pattern nearby
ERRORS=""

for FILE in $STAGED_FILES; do
  # Skip if file doesn't exist (deleted)
  [ -f "$FILE" ] || continue

  # Find lines with DEPRECATED (case insensitive)
  DEPRECATED_LINES=$(grep -n -i "DEPRECATED\|@deprecated" "$FILE" 2>/dev/null || true)

  if [ -n "$DEPRECATED_LINES" ]; then
    # For each deprecated line, check if there's a removal date nearby
    while IFS= read -r line; do
      LINE_NUM=$(echo "$line" | cut -d: -f1)

      # Check this line and next 2 lines for removal date pattern
      CONTEXT=$(sed -n "${LINE_NUM},$((LINE_NUM+2))p" "$FILE")

      if ! echo "$CONTEXT" | grep -qi "Remove by [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}"; then
        ERRORS="${ERRORS}\n${FILE}:${LINE_NUM}: DEPRECATED marker without removal date"
      fi
    done <<< "$DEPRECATED_LINES"
  fi
done

if [ -n "$ERRORS" ]; then
  echo "ERROR: Found DEPRECATED markers without removal dates:"
  echo -e "$ERRORS"
  echo ""
  echo "Please add a removal date in format: 'Remove by YYYY-MM-DD'"
  echo "Example: // DEPRECATED - Remove by 2026-03-15: Use newFunction() instead"
  exit 1
fi

exit 0
