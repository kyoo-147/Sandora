# Demo runbook

## Demo 1: design to spatial website

1. CEO reads `company/PROFILE.md` and `brand/TASTE.md`.
2. CEO inspects the relevant files under `designs/` and produces a one-line
   design read plus missing-input list.
3. CEO chooses only the lanes justified by the actual request. Typical lanes
   are design decomposition, asset exploration, frontend implementation, and
   visual/performance review.
4. Asset agents may use image generation or other approved tools, but must
   return prompts, provenance, and placement guidance.
5. Frontend agents implement against the reference and `brand/TASTE.md`.
6. CEO reconciles visual review, accessibility evidence, and performance output.

## Demo 2: PM interface and quarterly report

1. CEO reads `projects/pm-interface/PROJECT.md` and
   `data/quarterly/2026-Q2.md`.
2. CEO assigns interface, data-validation, and reporting lanes only when their
   artifacts are genuinely independent.
3. PM agents create the interface from the PM design reference.
4. Reporting agents calculate changes and separate fact from interpretation.
5. CEO checks metric lineage, risks, owners, and next actions.
6. The final report states that the numbers are fictional sample data.

## Common handoff packet

Every peer prompt should include outcome, project path, allowed files, expected
artifact, acceptance evidence, stop condition, and reporting line to `ceo`.
