# Design

The look is a small, deliberate system — not a theme sprinkled on top. Five
principles, one material rule, and a single token file everything reads from.

## Principles

1. **Tokens are the source of truth.** Every color, size, radius, shadow, and
   duration is a CSS custom property in [`web/src/brand/tokens.css`](web/src/brand/tokens.css).
   Nothing hard-codes a hex. The whole product re-themes from that one file, and
   the file is written to be lifted out and shared across surfaces.
2. **Two materials, and only two.** See below. This is the rule worth
   remembering.
3. **Flat, not shaded.** Solid fills, one hairline, one honest shadow per
   elevation level. No decorative gradients — they date quickly and muddy a
   brand. Depth comes from a shadow scale (`--e-1/2/3`), not from paint.
4. **The brand lives in the chrome, not on the canvas.** Forest green and gold
   identify the tool; the board stays a neutral, near-white drafting surface so a
   user's own colors read true. The product should never fight the work.
5. **Motion is a nudge.** 120–200ms, one easing curve (`--ease`). Enough to feel
   responsive, never enough to wait on.

## The two-material model

Every surface is exactly one of these:

- **Board — solid.** An opaque, neutral drafting surface with a faint dot grid.
  No blur, no tint, no brand color. It is the paper.
- **Chrome — glass.** The floating toolbar and pills use one translucent glass
  material: a dark forest tint, a backdrop blur, a top specular highlight, a
  faint gold hairline, and one soft shadow. Defined once and reused.

### Why glass is confined to small chrome (the intentional part)

`backdrop-filter: blur()` is the expensive primitive. The browser keeps a GPU
buffer for the blurred region and **re-blurs whatever is behind it every time
that content changes.** On a drawing app the board repaints up to 60×/second, so
a large glass surface sitting over the board would re-blur every frame — visible
jank, exactly when you want the drawing to feel effortless.

So the board stays opaque and only the small, mostly-static floating panels are
glass. A retina toolbar is well under a megabyte of GPU buffer; the board is free.
That confinement is the same discipline Apple's Liquid Glass follows — glass on
the controls, content underneath stays solid — and here it is a performance
decision first and an aesthetic one second. A `@supports` fallback swaps glass
for a solid panel where `backdrop-filter` is unavailable, so it never looks
broken.

## Token layers

`tokens.css` is organized so semantic names never reach for a raw hex directly:

- **Primitives** — the raw brand ramps (`--forest-*`, `--gold-*`, `--ink`, `--paper`).
- **Semantics** — what the UI actually references: board (`--board-bg`,
  `--board-grid`), chrome/glass (`--glass-*`, `--text*`), accent and status.
- **Scales** — type, space (8px base), radius, elevation, motion.

Change a primitive and the whole product moves with it; change a semantic and
only that role moves. That separation is what makes the layer safe to share.

## Palette

- **Chrome:** deep forest glass, warm off-white text, gold accents (the "EA"
  mark, the active-swatch ring, the hairline).
- **Board default ink** is a soft near-black — a whiteboard's default pen, not a
  brand color. The swatches offer a handful of everyday diagram colors plus the
  brand gold and green, and a rainbow picker covers everything else.
- **Identity colors** (cursors, avatars) are saturated hues chosen to pop on a
  light board and carry white labels.
