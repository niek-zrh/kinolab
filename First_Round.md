# First round of user feedback — meeting preparation

| | |
|---|---|
| Product | Kinolab pilot, `v1.0.0-pilot.1` (tagged 2026-08-19) |
| Feedback received | early September 2026, first tester round |
| Known test conditions | The Google Cloud OAuth client does not exist yet, so Google sign-in, the Drive hub and the Picker were off. The tester signed in with email and password and every upload went to app storage ("App uploads"). Nothing about the Drive folder tree was visible to them. |
| Purpose of this document | Turn the feedback into questions and decisions so the **second test version** has clear requirements. No code changes were made for this document. |
| How to use it | Section 1 is the feedback verbatim. Section 2 walks each point: what the app does today, what we need to ask, what has to be decided. Section 3 holds questions we should ask regardless. Sections 4–6 are the agenda, the prioritisation sheet and the space for answers. |

---

## 1. Feedback as received (verbatim)

> Overall, the service looks promising, and I especially love the Review Room.
>
> Here are my first thoughts and suggestions:
>
> 1. **Dark theme** — will definitely need one!
> 2. There seems to be quite a lot of **repetition between folders**. It would be helpful to simplify the structure and reduce duplication.
> 3. We need **separate sections/folders for Characters, Locations, and Scripts**. These are not shots and should probably be handled differently from shot-based content. The full script should be integrated into the project. It would also be useful to have individual scene scripts connected to the relevant scenes/shots. Characters, locations, and other project assets should have their own dedicated structure rather than being treated as shots.
> 4. How can we **rename items or change links** after they have been created? I couldn't find an obvious way to do this.
> 5. The current way of **adding shots** could be improved. Ideally, we should be able to name a sequence/scene and then specify the number of shots we want to create, rather than adding them individually. Also we should be able to **select more than one option/variant per shot**.
> 6. I didn't fully understand the purpose of the **prompt metadata** or how it is supposed to be used in the workflow. Some clarification or a more intuitive presentation would help.
> 7. The different **access/permission options** will definitely be needed in the future, when we have a team working together.

Read-out: one clear win (Review Room), one cosmetic must (dark theme), two structural asks (assets beyond shots; scene-driven shot creation), two usability gaps (renaming; prompt metadata), one confirmation that the role model matters later. Point 5b (multiple picks per shot) touches the core decision invariant and needs the most careful conversation.

---

## 2. Point by point

### 2.1 Dark theme

**Today**
- Two "moods" by design (spec §9): light "production office" for management screens, dark "grading suite" for the Review Room. Both palettes derive from the kinolab.ai brand.
- The dark palette already exists as CSS tokens (`.dark` in `app/globals.css`) and is applied only to the Review Room and its dialogs. There is no theme toggle and no user preference; `next-themes` is installed but unused apart from toast styling.
- Effort to add a full dark mode is moderate: the tokens exist, the work is a provider, a toggle, and a screenshot pass over every screen (status colours, thumbnails on dark, tables).

**Questions to ask**
1. Dark everywhere, or dark by default with light as an option? Would you ever use the light theme?
2. Per user, per device, or follow the operating system setting?
3. Should the Review Room stay dark regardless of the chosen theme? (Colour judgement on a neutral dark surround is the reason it is dark now.)
4. Anything specific that bothered you in the light screens beyond brightness (contrast, thumbnails, long sessions at night)?

**Decision to land**: default theme, toggle location (user menu vs Settings), whether Review Room is exempt.

---

### 2.2 Repetition between folders

**Today**
- Google was not configured during the test, so the tester never saw the Drive hub tree (the 17-folder `00 Admin … 06 Delivery` structure in `convex/lib/domain.ts`). The app does not render that tree anywhere until a hub is connected, and the Files page showed a single "App uploads" section. The Drive tree is therefore **not** what this comment is about; it stays a topic for later (see the note at the end of this block).
- What the tester did see is the same content in several places inside the app:
  - An uploaded option appears as a version on the shot's **Options** tab, as a file on the shot's **Files** tab, on the production **Files** page under "App uploads", and in the **Review Room**.
  - Every shot appears on **Shots**, **Board**, **Review** and **Overview**. Each shot page repeats the same four tabs: Options, Discussion, Files, History.
  - Because the tester modelled characters and locations as shots (see 2.3), each character or location also got a shot page with the full Options / Discussion / Files / History set, which reads as a lot of identical "folders" for things that are not shots.
- The nine-item left rail (Overview, Board, Shots, Review, Files, Decisions, Reports, QC, Settings) may also feel like too many places for a small team.

**Questions to ask**
1. Show us: which screens felt duplicated? The shot page tabs, the Files page versus the Options tab, or the many pages that list shots?
2. Which of the nine pages did you use, and which did you never open? (Board, Decisions, Reports and QC are the likely candidates for "never".)
3. If we merged two pages tomorrow, which two? Should Files disappear as a separate page and live only inside shots and assets?
4. On the shot page, do you need both Options and Files? Files exists for reference material that is not an option (a brief, a script excerpt). Does that distinction make sense to you?
5. How much of the repetition came from creating characters and locations as shots? Would proper asset types (2.3) remove it on its own?

**Decision to land**: which pages to merge or hide in v2, and whether Files stays a top-level page.

**Note for later (Drive tree)**: once Google is set up, the same "reduce duplication" instinct should be applied to the hub tree before the studio's files land in it. Renaming or restructuring a Drive tree that already holds files is painful. Decide the tree together with the asset model from 2.3 (stage-based as now, or asset-type-based: Scripts / Characters / Locations / Shots / Deliveries).

---

### 2.3 Characters, Locations, Scripts as first-class objects

**Today**
- Data model: episodes → scenes → shots → versions (options) → assets (files). Only shots carry options and go through the Review Room.
- Scenes have a code, title, description and a Figma URL (storyboards live in Figma by design). No script text, no attachments.
- There is no entity for characters, locations, props, or style frames. The Drive tree has folders named Core Script, Script Options, Concepts and Locations, but the app treats whatever lands there as plain files.
- The tester evidently created characters and locations as shots to get the options-and-pick workflow for them. That is the real signal: **the Review Room workflow is wanted for non-shot assets.**

**What a v2 could look like (proposal, to validate)**
- A generalised "asset" object with a kind (character, location, prop, style frame, other), its own options, shortlist and pick, its own Drive folder, and links to the scenes and shots it appears in. Shots then reference "Characters in this shot" and "Location".
- A **Script** area per production: the full script as a document, plus a per-scene breakdown so each scene shows its script text, and each shot can open its scene's text from the Review Room right rail.

**Questions to ask**
*Script*
1. What format is the script in? Google Docs, Word, PDF, Final Draft (.fdx), Fountain, plain text? In Russian?
2. Who edits the script, and how often does it change during production? Do you need script versions, or just "the current one"?
3. How do you break the script into scenes today? Would you want scenes created automatically from the script (scene headings), or keep creating scenes yourself and paste the text?
4. Should the script itself go through review and approval (the Development stage gate exists for this), or is it approved outside the tool?
5. What exactly do you want to see from a shot: the scene's full text, only the lines relevant to that shot, or a link to the script at that scene?

*Characters and locations*
6. What does a character consist of for you: reference sheet, turnaround, expressions, costume variants per scene, voice reference? Which of these need the options-and-pick workflow?
7. Is there one approved "canonical look" per character, or several (per episode, per age, per costume)?
8. Same for locations: one approved concept per location, or per time of day / weather / camera angle?
9. What other asset types exist in your productions? Props, vehicles, style frames, colour scripts, music, sound design?
10. How should assets link to shots: does an artist tag "Character A appears in SC010_SH020", and does the shot page then show the approved character look next to the options?
11. Do characters and locations belong to one production, or are they shared across productions of the studio (recurring characters in a series)?
12. Who owns these assets, and do they follow the same stages and gates as shots, or a simpler status (draft, in review, approved)?

**Decision to land**: the list of asset kinds for v2, script format and import path, the linking model (asset ↔ scene ↔ shot), whether assets are per production or studio-wide.

---

### 2.4 Renaming items and changing links after creation

**Today** — the tester is right; several things cannot be changed in the UI:

| Item | Editable in UI today | Notes |
|---|---|---|
| Shot title | Yes (inline on shot page and shots table) | |
| Shot status, stage, assignee, due date | Yes | |
| Shot code (e.g. `SC010_SH020`) | **No** | The code names the Drive folder and the canonical approved filename `SGL_EP01_SC010_SH020_v3.png`. Renaming it means renaming or re-filing in Drive. |
| Shot → scene or episode | **No** | Set only at creation. The backend accepts a change; the UI has no control for it. |
| Scene title, description, Figma URL | **No** | Backend mutation exists; no UI anywhere. Scenes can only be created inline from the "New shot" dialog. |
| Scene code | **No** | |
| Episode title | **No** | Backend only. |
| Production name, status, timezone | Yes (Settings) | Managers only. |
| Production code | **No** | Used in every canonical filename. |
| External links (Figma, sheet, Miro, Telegram) | Yes (Settings → Links) | Everyone sees them as Quick links on the Overview, but only Owner and Producer see Settings, so a Creative Director or Artist has no way to change a wrong link. |
| Version prompt metadata and note | **No** | Backend mutation exists; no UI. |
| Studio name | **No** | |

**Questions to ask**
1. Which items did you try to rename or re-link? Shot codes, scene names, the storyboard link, the production, something else?
2. Who should be allowed to rename: anyone with edit rights, or only producers? Renaming a shot code affects everyone's references.
3. When a shot code changes, do you expect the Drive folder and any approved files to be renamed as well, or is a "formerly SC010_SH020" note enough?
4. Should renames appear in the activity feed and the daily report?
5. Do you need to move shots between scenes and episodes, and reorder shots within a scene?
6. Did you expect the storyboard link to sit on the scene (as now, but hidden), on the shot, or in the Links list?

**Decision to land**: the exact edit surface for v2 (probably: all titles, codes with a Drive rename, scene and episode assignment, links visible to everyone and editable by managers), and who may rename codes.

---

### 2.5a Adding shots: name a scene, then generate N shots

**Today**
- "New shot" dialog: code, optional title, scene, episode (episodic productions only). Hotkey `N`.
- "Paste codes": free text list of codes, one scene and episode for the whole batch, up to 500 at a time, existing codes skipped.
- A scene can be created inline from the scene picker (code only).
- Codes are free text (upper-cased, up to 64 characters). The `SC010_SH020` convention is only a placeholder and the seed data; nothing enforces it.
- Vocabulary: the tester says "sequence/scene". The app has episodes → scenes → shots (no sequence level).

**What a v2 could look like (proposal, to validate)**
A "New scene" flow: scene code and title, number of shots, numbering step (10, 20, 30… or 1, 2, 3…), optional titles per shot, optional assignee. Also "add N shots to this scene" from the scene view, and inserting between existing numbers (SH015).

**Questions to ask**
1. Your naming convention: `SC010_SH020`, `sq010_sh0010`, `E01_S03_SH07`, plain numbers? Does it differ per production or is it fixed per studio?
2. Do you count in steps of 10 (to insert later) or consecutively?
3. Do you think in **sequences → scenes → shots** (three levels) or **scenes → shots**? Do episodes matter for you now?
4. When you create a scene, do you already know how many shots it has (from a storyboard or breakdown), or do shots get added as you go?
5. Would a scene page help (all shots of the scene, its script text, its storyboard, its characters and locations), and would you rather create shots from there than from the shots list?
6. Do you ever split or merge shots after they exist? Delete shots?
7. Should a new shot inherit anything from the scene: assignee, due date, location, characters?

**Decision to land**: naming scheme and numbering step (configurable per production?), the hierarchy (sequence level yes or no), where shot creation lives (shots list vs scene page).

---

### 2.5b Select more than one option/variant per shot

**Today**
- Spec §6 invariant: **exactly one picked version per shot**. Picking one rejects every other option as superseded, sets the shot to "picked", writes a decision to the ledger, notifies the artist, and copies the file to Drive `Approved/` under the canonical name.
- Shortlisting is many-to-one and free: shortlist as many as you like, then compare them 2–4 up in the Review Room.
- Changing the pick later is possible (a new pick supersedes the old one). Re-picking after "approved" requires reopening the shot.

This is the one request that changes a core rule, so we must understand the need before touching it. Plausible reasons behind it, each with a different answer:

| Why they want several | Reasonable design |
|---|---|
| Keep alternates for the editor to choose from in the cut | One hero pick plus "approved alternates" (say, up to 3), all filed to Approved with a suffix |
| A shot needs several outputs (a still and a video, or several plates or passes) | Slots per shot: "still", "animation", "plate A"… each with its own pick |
| Take 2–3 stills forward to the next stage, then pick one video | A "take forward" state between shortlist and pick |
| Several variants are needed for different deliverables or aspect ratios | Variant per deliverable, each with a pick |
| Simply wanted to compare several and shortlist did not read as "selecting" | Naming and UI only, no rule change |

**Questions to ask**
1. Walk me through the case: when you wanted to select more than one option, what happened next with those options?
2. Do the selected options go to the same next step, or to different people or tools?
3. Is there still one "the shot is done" choice in the end, or do several files truly ship?
4. Does one shot have several deliverables (still, video, plate, alt ratio)? Should those be separate "slots" within the shot rather than separate shots?
5. Did you see and use Shortlist and the 2–4 compare? Did it feel like selection, or only like a comparison aid?
6. If several options are approved, how should they be named in Drive, and which one does the daily report and Decisions ledger show?

**Decision to land**: keep the single pick and add either alternates or slots, or move to N picks with a rank. Naming of files in Approved for whichever we choose.

---

### 2.6 Prompt metadata

**Today**
- When uploading options, a "Prompt details" popover lets the artist enter Tool, Model, Prompt and Seed. The values stay set for all following uploads until cleared. Nothing is required.
- Shown in the Review Room right rail (with a "copy prompt" button) and as a small tool badge on the Options tab. Cannot be edited after upload (backend supports it, UI does not).
- Intended purpose (spec): reproducibility. The director says "this one, but at dusk"; the artist has the exact prompt, model and seed to regenerate from. Also a record of which tools produced the approved work.
- The tester did not understand it, which means either the purpose is not communicated, the entry is in the wrong place or moment, or it is not how their artists work.

**Questions to ask**
1. Which generation tools do your artists use? Midjourney, ComfyUI, Stable Diffusion, Runway, Kling, Veo, Sora, Luma, Suno, others?
2. Where do prompts live today? In the tool's history, a Telegram chat, a spreadsheet, nowhere?
3. When a director asks for a change to an option, how does the artist find what produced it?
4. Would automatic extraction help? Many tools embed prompt, seed and workflow into the PNG (ComfyUI, Automatic1111, Midjourney). We could read it on upload so nobody types anything.
5. Is the prompt something the director wants to see at all in the Review Room, or only the artist?
6. Would you rather have prompts as reusable objects (a prompt library per production, per character, per location) than per-upload notes?
7. Should the field simply be called something else: "How this was made", "Generation details"?
8. Do you want to record generation cost or time per option?

**Decision to land**: keep as optional per-upload note with better wording and editing, or automate extraction, or drop it for v2, or grow it into a prompt library.

---

### 2.7 Access and permission options

**Today**
- Six roles, studio-wide (a member has one role for every production of the studio): Owner, Producer, Creative Director, Supervisor, Artist, Viewer.
- Capabilities: Owner and Producer manage everything. Creative Director decides picks and gates anywhere. Supervisor decides only within stages where they are a named gate approver, and runs QC. Artist uploads options, comments, and moves only their own shots between working statuses. Viewer reads everything and comments.
- Nobody can grant a role above their own. Invites are by email on the Team page; the seat is claimed at sign-up. Invite-only sign-up on the pilot backend.
- Not there today: per-production membership, external or client review links, hiding shots from other artists, guest accounts without sign-up, password reset (no email provider).

**Questions to ask**
1. Who is on a typical production: how many artists, who directs, who produces, freelancers or staff?
2. Do people work on several productions at once? Should a person have different roles per production, or is one studio-wide role fine?
3. Do you have external parties who need to see and comment on options: clients, broadcasters, investors? Should they get a login or a shareable review link with an expiry?
4. Should artists see each other's shots and options, or only their own?
5. Who may pick, and who may approve a stage gate, in your studio? Do our six roles match your titles?
6. How do you want people to sign in: Google account, email and password, something else? (Google sign-in requires the Google Cloud client from the README.)
7. Do you need an audit trail of who saw what, or is the activity feed enough?

**Decision to land**: studio-wide vs per-production roles for v2 (probably still studio-wide, with per-production later), whether external review links are in v2, and the sign-in method.

---

## 3. Questions to ask regardless of the feedback

These decide the shape of v2 as much as the seven points above.

**About the test itself**
1. Who tested, in which roles, for how long? With the seeded "SIGNAL LOST" data or a real production?
2. Which screens were used daily, which never? What did you do outside the tool that you expected to do inside it?
3. What would make the team use this every day for one real production?

**Files and Google**
4. Where do your files live today: Google Drive, Yandex Disk, a NAS, Telegram, local disks? Is Google realistic for the team, given where they are located and how they sign in?
5. The Google Cloud client does not exist yet, so the test ran on app storage. For the second test version, do we set up Google (sign-in plus Drive hub) or stay on app storage and decide the file home later? Setting up Google needs a Google Cloud project owned by the studio (free, about an hour, README §Google setup).
6. If Google is not the answer, what is: the studio's own storage, an S3-compatible bucket, Yandex Disk? This determines the v2 file architecture, so it should be decided before v2 work starts.
7. File sizes and types you handle: stills only, video, audio, project files? Largest typical file? (App storage uploads are capped at 20 MB per file today; Drive removes that cap.)

**Video**
8. How much of your work is video generation vs stills? The Review Room compares stills with synced zoom; video preview is poster plus "open in Drive" today. What do you need to judge a video option: scrubbing, frame stepping, side-by-side playback, audio?

**Tools and integrations**
9. Your generation and editing tools, and where the team talks (Telegram was named in discovery). Would notifications in Telegram be worth more than the in-app bell?
10. Do you track budget, cost per generation, or time per shot anywhere?

**Language**
11. Should the UI be in Russian (or bilingual) for v2? Copy is centralised, and Review Room hotkeys already work on a Cyrillic keyboard.

**Scale and timeline**
12. Productions per year, shots per production, options per shot? Episodic or features?
13. When is the next real production that could run in the tool, and what must be true by then?
14. When do you want the second test version, and who will test it?

**Rhythm and reporting**
15. Do the daily report at 18:00, the Decisions ledger and the QC checklist match how you work, or are they noise for now?

**Known gaps to mention proactively**
16. No password reset yet (no email provider). Google sign-in avoids it.
17. Once Drive is on: it can only see files the app created or that were picked through the Google Picker; files dropped into the hub folder in Drive itself stay invisible (Google scope limitation). Worth saying before anyone plans to work "in Drive".

---

## 4. Suggested agenda (60 minutes)

| Time | Topic | Goal |
|---|---|---|
| 0–5 | What worked: the Review Room | Learn exactly what they liked so we keep it, and whether they want it for characters and locations too |
| 5–10 | The test setup (section 3, questions 1–3) | Know who tested, on which data, and which screens they used. Drive was off, so skip that question and use the time on question 5: Google or another file home for v2 |
| 10–20 | Structure: assets beyond shots, script, folder repetition (2.2, 2.3) | Agree the object model for v2 |
| 20–30 | Creating and renaming: scene-driven shot creation, renames, links (2.4, 2.5a) | Agree naming scheme and edit surface |
| 30–40 | Multiple selections per shot (2.5b) | Understand the real case before changing the pick rule |
| 40–47 | Prompt metadata and dark theme (2.6, 2.1) | Decide keep, automate, or drop; theme default |
| 47–52 | Team and permissions, sign-in, video, language (2.7, section 3) | Set expectations for v2 vs later |
| 52–60 | Prioritise and set the v2 test date (section 5) | Leave with a ranked list and a date |

Tip: screen-share the app during 2.4 and 2.5 and let them show where they got stuck. That answers "which items" faster than asking.

---

## 5. Prioritisation sheet (fill in during the meeting)

Rank as **Must for v2**, **Should**, **Later**, or **Drop**.

| # | Item | Rank | Notes and decisions |
|---|---|---|---|
| 1 | Dark theme (default? toggle? Review Room exempt?) | | |
| 2 | Simplify folders and pages (which ones?) | | |
| 3a | Script integrated per production, per-scene text | | |
| 3b | Characters, locations and other assets with options and pick | | |
| 4 | Rename and re-link everything (codes with Drive rename?) | | |
| 5a | Scene-first shot creation with N shots and numbering step | | |
| 5b | Multiple selections per shot (alternates, slots, or N picks) | | |
| 6 | Prompt metadata: reword, auto-extract, library, or drop | | |
| 7 | Permissions: per-production roles, external review links | | |
| 8 | Video review in the Review Room | | |
| 9 | Russian UI | | |
| 10 | Telegram notifications | | |
| 11 | File home: set up Google for v2, or another storage | | Google client still missing as of 2026-09-09 |
| 12 | Sign-in method and password reset | | |

Target date for the second test version: ______________
Testers for round two (names and roles): ______________

---

## 6. Answers and decisions (fill in after the meeting)

Record each decision as: date, decision, why. Anything that deviates from the original spec also goes into `DECISIONS.md` when the work starts.

Key topics that came from the meeting are related to the workflow in the tool. Ones you are looking at the Board (which would also be great if that is also more editable), it would be nice that you can zoom from the board into the details in the different sections. Furthermore, the whole section of characters (see screenshot Heroes.png) is missing under pre-production and when you put prompts there is a lack on editing anything lateron. 
Also for compliance reasons, it's good to have an export option to export prompts and all trademark related topics in case of law suits, or disputes.
Key topic was dark mode by default, but under settings the options to have light mode (the way it looks more or less now). Have an UI/UX and design focus on fixing this properly. And redesign the way that shots are added, sometimes you want to import multiple shots, this process is not easy if you need to put one by one.


- 
- 
