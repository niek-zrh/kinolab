# Creative asset provenance

Created September 21, 2026 with the OpenAI image-generation tool for this
repository. These are original AI-generated illustrations, not photographs
of a real studio, cast or production. No third-party reference images were
supplied. PNG outputs were converted to JPEG at quality 82 for delivery;
no original film footage was used. Branding appears only on sign-in; demo
stills are installed only by the explicit local-only `demoArtwork:run` action.

## `public/brand/sign-in.jpg`

Use case: photorealistic-natural. Asset type: cinematic sign-in background for Kinolab, a professional film-production workspace. Create an atmospheric photorealistic wide 16:9 image of an empty film soundstage at night, substantial real camera rig and matte box in silhouette on the far left, overhead lighting rig and subtle haze, a single warm tungsten practical light far right against a cool blue rim light. Deep ink shadows, restrained orange highlights matching #ff6b2c. Quiet dark negative space across the center half where an interface form will be placed. Fine 35mm film grain, tactile surfaces, elegant editorial cinematography, believable lighting, no people, no words, no logos, no watermark. The useful imagery is at the outer edges and upper third; keep center low contrast. This is original illustrative branding, not footage from a real film.

## `public/demo/array.jpg`

Original demo film still for Kinolab's fictional SIGNAL LOST production. Photorealistic cinematic wide 16:9 establishing shot of a remote abandoned radio telescope array at blue hour, dish silhouettes on a rocky northern plateau, volumetric fog, a tiny amber maintenance lamp, muted teal blue palette, large-scale landscape and tactile 35mm grain, 1970s science-fiction thriller atmosphere, deliberate composition, no writing, no branding, no watermark. No text burned into the frame. This will be labeled illustrative demo artwork.

## `public/demo/control-room.jpg`

Original demo film still for Kinolab's fictional SIGNAL LOST production. Photorealistic cinematic wide 16:9 interior of a 1970s radio observatory control room, wall of analog meters and reel-to-reel tape machines, one warm desk lamp, dim cyan CRT glow, a lone engineer seen in profile at the left third with practical olive workwear, smoky atmosphere, tactile production design, restrained amber and teal colors, 35mm film grain, strong composed storytelling image. No readable text, no brands, no watermark. This will be labeled illustrative demo artwork.

## `public/demo/rooftop.jpg`

Original demo film still for Kinolab's fictional SIGNAL LOST production. Photorealistic cinematic wide 16:9 night exterior: an engineer in a dark raincoat on a rain-soaked rooftop, back toward camera, distant industrial city and antenna silhouettes, sodium vapor orange reflections across wet concrete, muted blue haze and tiny warm windows, long-lens compression, quiet tense 1970s thriller, rich blacks with shadow detail, 35mm grain, no text, no branding, no watermark. This will be labeled illustrative demo artwork.

## Test media

`e2e/fixtures/review.mp4` is an original three-second synthetic video, not a
downloaded film. Reproduce it with:

```bash
ffmpeg -hide_banner -loglevel error -f lavfi -i 'testsrc2=size=320x180:rate=24:duration=3' -c:v libx264 -pix_fmt yuv420p -movflags +faststart e2e/fixtures/review.mp4
```
