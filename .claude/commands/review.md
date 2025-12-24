# Code Review: 本質的な課題発見と解決

Review code in $ARGUMENTS for **fundamental design issues**, not surface-level cleanup. Use extended thinking (ultrathink).

**Philosophy**: Find root causes, but respect the codebase's simplicity-first approach. From `style-guide.md`:

- "Obvious over clever" - Can you understand it in 5 seconds?
- "Duplication over wrong abstraction" - Write it twice, abstract on the third
- "Simple over complex" - Prefer imperative solutions over abstractions
- "Do not model state machines or data with classes" - Use discriminated unions sparingly

**CRITICAL**: Do NOT suggest new abstractions (state machines, wrapper classes, generic utilities) unless the same pattern appears 3+ times. Prefer inline, obvious code.

## What to Look For

Reference `.claude/rules/style-guide.md` for detailed examples.

### 1. Abstractions & Decomposition

- §9.2 Refactoring & Anti-Patterns - Premature abstraction, wrong boundaries
- §3.2 Balanced Function Decomposition - When to extract vs inline

### 2. Type Design

- §2.1 Parse, Don't Validate - Transform at boundaries, don't re-validate
- §2.2 Discriminated Unions Over Classes - Exhaustive checking, no inheritance
- §6.3 No Enums - Use const object pattern

### 3. Control Flow

- §3.3 Early Returns and Guard Clauses - Happy path at root indentation
- §3.3.1 Prefer Early Returns Over `let` Accumulation
- §7.2 Sequential vs Parallel Processing - Right async pattern for the job
- §4.1 Single Try-Catch for Related Operations

### 4. Function Design

- §3.5 Object Destructuring for Opaque Parameters
- §3.1 Simple Over Complex - Prefer imperative over functional abstractions

### 5. Code Hygiene (Always Check)

- §3.4 Naming Conventions - No generic names, Hungarian notation, abbreviations
- §3.2 Superfluous abstractions - Inline trivial one-liners
- Comments - Delete restating JSDoc, commented-out code, TODOs without tickets
- Dead code - Remove unused imports, uncalled methods, unread variables

## Review Process

1. **Understand the use case** - What is this code trying to accomplish?
2. **Trace the data flow** - Follow the data from input to output
3. **Question abstractions** - Does this class/function earn its existence? Could it be simpler?
4. **Resist adding complexity** - The fix should simplify, not add layers

## Output Format

```markdown
## 本質的な課題 (Fundamental Issues)

### [Critical/High/Medium] Issue Title
**Root Cause**: Why this problem exists at the design level
**Symptom**: What you observe in the code
**Location**: `path/to/file.ts:123`
**Proposed Fix**: How to simplify (prefer removal/inlining over adding new abstractions)

## Surface Issues (Lower Priority)
- Brief list of naming, formatting, comment issues (fix these only after fundamental issues)
```

## Fix Approach

**For fundamental issues:**

1. Propose the simplest fix first (often: inline, remove, or merge)
2. Ask for confirmation if the change affects multiple files or public interfaces
3. Implement the fix

**For surface issues:**

1. Fix silently after addressing fundamental issues
2. Run `pnpm turbo run fix` to format

## Anti-patterns to Flag

- **Adding abstraction to fix a bug** - Symptom-fixing vs root cause
- **Creating a "utils" function** - Find the right home or inline it
- **Wrapper functions that just pass through** - No value added, remove them
- **Extracting trivial operations** - `name.replace(/_id_seq$/, "")` should stay inline
- **Boolean parameters** - Should often be two separate functions

## When Abstractions ARE Appropriate

**State machines** - Use when:

- There are distinct, named states (e.g., VOID → EVENT_CREATED → BOT_SCHEDULED)
- Transitions between states have specific actions
- The switch statement covers all state combinations exhaustively

**Don't use** state machines for:

- Simple if/else that can be early returns
- Boolean flags that don't represent true states
- "Just in case" future flexibility

**New types/classes** - Use when:

- Pattern repeats 3+ times
- Encapsulates meaningful domain complexity
- Makes invalid states unrepresentable

## Anti-patterns to AVOID Suggesting

- Generic utility wrappers
- New abstraction layers for 1-2 use cases
- "Future-proofing" changes
- State machines for simple conditional logic

---

Now analyze: $ARGUMENTS
