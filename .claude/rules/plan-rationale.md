# Plan Rationale Requirements (Auto-Loaded)

Every implementation plan must carry enough reasoning for a fresh agent with zero context to understand why decisions were made.

## Inline Rationale

Each phase or major step must include a **Why** line explaining the motivation. Not just "delete these files" but "delete these files because they are dead code — no imports reference them."

## Key Decisions Section

Every plan must end with a **Key Decisions** section listing non-obvious choices and their reasoning. A decision qualifies as "key" if:
- Choosing between two or more reasonable approaches
- Deleting code or removing functionality
- Changing defaults or stored state schema
- Imposing architectural constraints
- Anything a reviewer might question
