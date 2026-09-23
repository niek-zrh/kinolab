# Workspace artwork and icons — 1.7

Created 2026-09-22 with the **built-in image generation tool**, not a CLI/API
fallback. No user files or third-party movie stills were supplied to generation.
These are original AI-generated decorative illustrations, not production assets.
The images were inspected at full size and in the application. Originals remain
in the local image-generation output; delivery copies are JPEG at quality 82.

## Saved assets

| Repository path | Placement | Dimensions |
| --- | --- | --- |
| `public/brand/creative-workbench-v1.jpg` | My work, reference-board banner, overview fallback | 1774×887 |
| `public/brand/assistant-frames-v1.jpg` | AI workspace roadmap banner | 1774×887 |
| `components/app/workspace-glyph.tsx` | Seven original SVG symbols: story, look, character, review, production, delivery, assistance | 32×32 viewBox |

The interface symbols were drawn directly in code to match the existing line
icon system. They are decorative (`aria-hidden`) beside text labels; interactive
controls have their own accessible names.

The bitmap compositions leave the left half quiet for HTML text. They use dark
scrims and white text in both themes. A solid charcoal background preserves
readability if the image cannot load. Do not bake labels into the images, or
reuse these decorative assets as real shot thumbnails.

## Exact prompt: creative workbench

```text
Use case: photorealistic-natural
Asset type: original wide editorial artwork for the empty workspace and art-direction banner of Kinolab, a film-production application.
Primary request: a beautiful tactile film art-director's workbench seen from overhead, an intentional still life of storyboard drawings on cream paper, translucent color gels, a strip of film, graphite pencils and a small cinematography lens. No screens, no UI mockup.
Composition/framing: wide landscape 2:1 composition, objects arranged in an elegant diagonal on the RIGHT HALF, LEFT HALF a quiet charcoal work surface with subtle paper texture to leave space for live interface copy; generous negative space, tight art direction rather than clutter.
Lighting/mood: warm directional amber light crossing cool graphite shadows, restrained cinematic chiaroscuro, inviting and sophisticated; photorealistic materials and subtle film grain.
Color palette: charcoal, off-white, warm amber, a muted slate-blue gel. Original application artwork, not a scene from a real movie.
Constraints: absolutely no text, lettering, legible numbers, people, logos, brands or watermark; no robot, no neon purple orb; usable as a short banner crop.
```

## Exact prompt: assistant frames

```text
Use case: stylized-concept
Asset type: original editorial header art for a future AI-assistance workspace in a professional film-production application.
Primary request: three overlapping rectangular optical glass frames in a dark studio, like a physical exploded film contact sheet, light passing from one frame into the next. The metaphor is artist-directed tools, not a machine replacing an artist.
Style/medium: high-end physical product photography, exquisite frosted and clear glass edges, quiet charcoal background, subtle amber and cool blue refraction, tactile and believable.
Composition/framing: wide landscape 2:1; sculptural frames concentrated on the RIGHT HALF and plenty of nearly black negative space on the left for HTML copy; clean silhouette remains legible at banner size.
Lighting/mood: restrained film-studio lighting, calm, precise, warm optical highlights.
Constraints: no text, logos, UI screenshots, watermark, robots, human faces, stars, glowing orb, purple gradients or decorative circuit boards. Not a depiction of a real movie or generated production footage.
```
