# /project:review-file

Review the currently open file for issues specific to this project.

## Instructions
Read the file the user specifies (or the currently open file) and check for:

1. **Type safety** — any use of `any`, missing interfaces, improper casting
2. **Convention violations** — types not from `pos.types.ts`, inline styles, wrong import paths
3. **Logic bugs** — off-by-one, null/undefined risks, wrong DrinkSize or PaymentMethod usage
4. **Performance** — unnecessary re-renders, missing memoization on heavy components
5. **Dead code** — unused imports, unused variables, commented-out blocks

Output format:
- One issue per line
- Format: `[TYPE] line X — description — suggested fix`
- If nothing wrong: "Hn. Clean file."
