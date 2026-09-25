# DESIGN.md

## Visual Theme

Daytime packing station. Warm paper surfaces, terracotta as the single accent (tape, not brand decoration), dense photo catalog. Light theme because staff work under warehouse windows and overhead lamps, not at 2am.

Color strategy: restrained. Tinted warm neutrals, terracotta used for primary actions, selection, and "has packaging photo" marks only.

## Colors (OKLCH)

- `--paper`: oklch(0.965 0.014 82)
- `--paper-raised`: oklch(0.985 0.008 82)
- `--paper-band`: oklch(0.935 0.02 78)
- `--ink`: oklch(0.28 0.03 50)
- `--ink-soft`: oklch(0.46 0.024 52)
- `--line`: oklch(0.88 0.02 75)
- `--accent`: oklch(0.52 0.13 48)
- `--good`: oklch(0.48 0.09 150)

No pure black or white.

## Typography

Heebo 400/500/600/700. Product sans only. SKU strings are LTR-isolated with tabular numerals.

## Layout

Sticky top band with search. Fluid photo grid (`minmax(200px, 1fr)`). Item work happens in a start-edge sheet (right in RTL), not a centered modal.

## Components

- Search field as a scan box
- Photo cards with name + SKU
- Dual photo wells in the item sheet: Wolt vs packaging
- Skeleton grid while the menu loads
