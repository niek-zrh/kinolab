# Dropping in generated images

Kinolab combines code-native interface graphics with original raster artwork.
Version 1.6 includes a generated soundstage sign-in image and optional local
demo film stills. See [asset provenance and exact prompts](CREATIVE-ASSETS.md).
The grain, film leader and empty frames remain code-native and follow both themes.
Version 1.7 adds two editorial workspace images and seven original vector
symbols. [Exact generation prompts and placement rules](WORKSPACE-ASSETS.md).

But some things a model does better than a gradient. This is where those go.
Generate them wherever you generate the film — Midjourney, Flux, Firefly,
whatever — and wire the file into the relevant component. `CinemaBackdrop`
uses its code treatment when no `image` prop is supplied; a missing file with
an explicit `image` prop is not an automatic fallback.

## The slots

| File | Where it shows | Size | Falls back to |
|---|---|---|---|
| `public/brand/sign-in.jpg` | Behind the sign-in form (installed in 1.6) | Wide JPG | The code backdrop when no image prop is passed |
| `public/brand/creative-workbench-v1.jpg` | Artist desk, reference banner, overview without production artwork | 1774×887 JPG | Solid charcoal surface |
| `public/brand/assistant-frames-v1.jpg` | Planned AI workspace banner | 1774×887 JPG | Solid charcoal surface |
| `public/brand/empty-shots.jpg` | The Shots empty state | 1600×900 | An icon in a badge |
| `public/brand/empty-review.jpg` | The Review queue empty state | 1600×900 | An icon in a badge |

To use one, pass it where the component already accepts it — e.g.
`<CinemaBackdrop image="/brand/sign-in.jpg" />` in
`app/(auth)/sign-in/page.tsx`. The treatment stays either way: grain,
vignette and letterbox are applied over the image, so a raw render still sits
inside the same frame language as the rest of the app.

## What to generate

Two rules, both learned the hard way in this codebase:

1. **Nothing important in the lower third.** Text sits below or over the
   bottom of these frames. A subject with its face or its title down there
   will collide — the seeded covers demonstrated exactly this.
2. **Leave the centre quiet.** The sign-in form sits in the middle over a
   vignette. A busy centre makes the email field hard to read.

Prompts that fit the existing palette — warm ink `#0b0d11`, tape orange
`#ff6b2c`, cold blue key:

**sign-in.jpg**
> anamorphic film still, empty sound stage at night, one warm practical lamp
> far left, cold blue rim light, deep black falloff, heavy atmosphere and haze,
> lens flare streak across upper third, no people, no text, composition open
> and dark through the centre, 35mm grain, cinematic wide --ar 16:9

**empty-shots.jpg**
> overhead of an empty light box with blank film strips laid out, warm tungsten
> glow, deep shadow, no images on the frames, quiet and still, muted palette
> with one orange accent, no text --ar 16:9

**empty-review.jpg**
> a darkened grading suite, two blank monitors facing a single empty chair,
> cold monitor glow, warm practical behind, nobody present, no text,
> cinematic --ar 16:9

Keep them dark. Every one of these sits under interface text, and a bright
plate forces a heavier scrim, which throws away the thing you generated.

## Checking one

Drop the file, wire it in, then look at it in place — not in the finder:

```bash
pnpm dev
node scripts/capture-help.mjs   # or just open the screen
```

The question is never "is the image good". It is "can I still read the form".
