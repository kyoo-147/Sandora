# Demo 1: spatial commerce website

## Request pattern

“CEO, hãy lên kế hoạch cho các agent tạo website theo design của designer đi,
tạo các assets 3D và hiệu ứng 3D; có thể dùng imagegen. Hãy xem lại taste của
tôi trước khi phân công.”

## Outcome

Create a high-fidelity marketing site for Kite & Kiln Studio from the supplied
design references, with approved 3D or generated visual assets and purposeful
motion.

## Required context

1. `company/PROFILE.md`
2. `brand/BRAND.md`
3. `brand/TASTE.md`
4. `product/PRODUCT.md`
5. `assets/ASSET_MANIFEST.md`
6. `designs/full_landing.webp` and the relevant landing references

## Suggested lane graph

CEO chooses the actual graph after inspecting the brief. Possible lanes:

- design read and reference decomposition
- 3D asset and image-generation exploration
- frontend implementation
- motion and interaction implementation
- performance/accessibility review
- independent visual comparison

Do not create every lane by default. Each lane needs a distinct artifact and a
clear acceptance test.

## Acceptance evidence

- Design read names the page archetype, visual dials, and reference decisions.
- Generated assets have prompts, provenance, and intended placement.
- The implementation works at mobile, tablet, and desktop widths.
- Motion has a purpose and respects reduced motion.
- No fake product UI or invented customer proof is presented as real.
- Lighthouse and accessibility checks are reported before completion.
