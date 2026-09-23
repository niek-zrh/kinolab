/**
 * In-app help (v1.4).
 *
 * Two layers, both inside the product:
 *  - this file: what THIS screen is for and what to do next, shown in the
 *    help drawer, so guidance sits a keystroke from the work;
 *  - /help: the illustrated walkthrough of the whole process.
 *
 * Written as short imperative steps rather than prose. Someone opening help
 * is stuck, not settling in to read.
 */

export type HelpTopic = {
  /** Route this covers, with `:id` standing in for a path segment. */
  route: string;
  title: string;
  /** One sentence: what this screen is for. */
  purpose: string;
  /** What to do here, in order. */
  steps: string[];
  /** The thing people get wrong, or the shortcut worth knowing. */
  tip?: string;
};

/** Ordered most specific first — `topicFor` returns the first match. */
export const HELP_TOPICS: HelpTopic[] = [
  {
    route: "/p/:id/assistants",
    title: "AI workspace — planned",
    purpose: "Explore future AI assistance without sending any production data.",
    steps: [
      "Filter by Plan, Create, or Finish to see where assistance could fit your process.",
      "Choose Explore assistant to read the proposed inputs, output, and human approval step.",
      "Use the workspace link on a card to continue working with today's tools.",
    ],
    tip: "These assistants are design previews, not connected services. Nothing runs, changes your work, or incurs an AI charge. Activation and data permissions will be a separate future setup.",
  },
  {
    route: "/p/:id/review/:id",
    title: "Review Room",
    purpose:
      "Compare the options for one shot and decide which one the production uses.",
    steps: [
      "Press 1–4 to put that many options on screen. Zoom and pan are shared, so the same detail lines up across all of them.",
      "Use ← and → to move focus. S shortlists, X rejects with a reason.",
      "P picks — that is the decision, and it files the file into Approved/.",
      "Uploaded videos play in the room. Pause on a moment and choose Attach timestamp before sending feedback. Click a comment's timestamp to seek back to it.",
      "Resolve completed feedback or Show resolved to reopen it. Authors and content editors can resolve a comment.",
    ],
    tip: "Past about 175% you are looking at the cached preview, not the original. Use the link in the zoom box before judging fine detail.",
  },
  {
    route: "/p/:id/review",
    title: "Review queue",
    purpose: "Every shot whose options are waiting on a decision.",
    steps: [
      "Open a card to go into the Review Room.",
      "Characters appear in their own group — they follow the same options-and-pick loop as shots.",
    ],
  },
  {
    route: "/p/:id/storyboard",
    title: "Storyboard",
    purpose: "See your film in scene order, with its artwork and creative direction.",
    steps: [
      "Find a scene with the selector or search for a shot by code or title.",
      "Click any frame to open that shot's options, discussion, and files.",
      "Editors can use the pencil next to a scene to add its brief or link its original storyboard.",
      "Print board opens a print-friendly contact sheet; choose Save as PDF in your browser to share it.",
    ],
    tip: "Frames come from actual shot options. Empty frames stay empty until your team uploads artwork.",
  },
  {
    route: "/p/:id/references",
    title: "Reference board",
    purpose: "Keep the film's artwork, palettes, sources, and creative direction together.",
    steps: [
      "Choose Add reference. Select artwork from this production's library, or make a text-only direction card.",
      "Write what the crew should take from it, add up to six hex colors, and keep the source or credit URL.",
      "Use department filters and search to focus the board. Click a color swatch to copy its hex value.",
      "Archive obsolete references. Open Archived to restore them; the original artwork is kept.",
    ],
    tip: "Artists can create and edit their own references. Editors can maintain the full board; viewers can read it.",
  },
  {
    route: "/p/:id/my-work",
    title: "My work",
    purpose: "The shots assigned to you, grouped by whose move it is.",
    steps: [
      "Start at the top: Needs you is rework to address, or shots with no options yet.",
      "With review means your options are in and someone else owes a decision — nothing to do.",
      "Open a shot to add options.",
      "Use the assignment filters to focus on one state; Show all work clears an empty view. The desk links open your shots and reference board.",
    ],
    tip: "Empty on day one is normal. Shots appear here the moment a producer puts your name on one.",
  },
  {
    route: "/p/:id/shots/:id",
    title: "A shot",
    purpose: "Everything for one shot: its options, the talk, the files, the history.",
    steps: [
      "Options is where you work. Drop files on the uploader, or press ⌘V to paste an image straight in.",
      "Fill in the generation details — tool, model, seed, prompt. That is what makes a result repeatable later.",
      "Shortlist the ones worth comparing, then open the Review Room.",
    ],
    tip: "A better take is a new version, never an edit of the old one. Versions are never renumbered.",
  },
  {
    route: "/p/:id/shots",
    title: "Shots",
    purpose: "Every shot in the production, as a contact sheet or a table.",
    steps: [
      "Scan the sheet to find a shot by eye; switch to the table for sorting and bulk edits.",
      "Filter by status, stage, scene, assignee or episode.",
      "Press N to add shots — name a scene and generate numbered shots, or paste a list from your sheet.",
    ],
    tip: "The coloured edge on each frame is its status, so you can spot rework without reading anything.",
  },
  {
    route: "/p/:id/board",
    title: "Board",
    purpose: "Where every shot sits across the six stages, and the gate on each.",
    steps: [
      "Drag a card between columns to move it through the pipeline.",
      "Edit status, assignee and due date on the card itself.",
      "Use a column's gate to request sign-off, approve, or reject with a note.",
    ],
  },
  {
    route: "/p/:id/characters",
    title: "Characters",
    purpose:
      "One row per character, with Concept and Animation each collecting options.",
    steps: [
      "Each phase works exactly like a shot: options, shortlist, pick.",
      "Keep the base prompt up to date and build each generation on it, so a character stays recognisable across shots.",
    ],
  },
  {
    route: "/p/:id/decisions",
    title: "Decisions",
    purpose: "The ledger — every gate, pick and sign-off, with who and why.",
    steps: [
      "Anything waiting on you appears at the top.",
      "Export as CSV, or as a provenance file carrying every prompt, seed and file identity.",
    ],
    tip: "Nothing here is ever deleted. A later pick supersedes an earlier one and both stay on the record.",
  },
  {
    route: "/p/:id/files",
    title: "Files",
    purpose: "Everything attached to the production, from uploads or the Drive hub.",
    steps: [
      "Filter to unassigned files to find anything not yet attached to a shot.",
      "Missing shows files whose bytes are gone — those need re-uploading.",
    ],
  },
  {
    route: "/p/:id/reports",
    title: "Daily reports",
    purpose: "The day compiled — options added, picks made, gates decided.",
    steps: [
      "A report builds automatically at 18:00 production time, or generate one now.",
      "Publishing freezes it and notifies the team.",
    ],
  },
  {
    route: "/p/:id/qc",
    title: "Delivery QC",
    purpose: "Check masters against the studio template before they ship.",
    steps: [
      "Start a run against a template, then work down the checklist.",
      "A run has to pass before a shot can be marked delivered.",
    ],
  },
  {
    route: "/p/:id/settings",
    title: "Settings",
    purpose: "How this production is configured — and how the app looks to you.",
    steps: [
      "Appearance is personal to you and this device.",
      "Stages, gate approvers, links and the Drive hub are production-wide.",
    ],
  },
  {
    route: "/p/:id",
    title: "Overview",
    purpose: "The production in one screen: progress, the pipeline, what needs you.",
    steps: [
      "The band at the top is how far the production has got and what is waiting on you.",
      "Each stage in the pipeline shows its shot count, its progress and its gate.",
      "Click a stage to see just its shots.",
    ],
  },
  {
    route: "/team",
    title: "Team",
    purpose: "Who is in the studio and what they are allowed to do.",
    steps: [
      "Invite someone by email; the seat attaches when they sign up with that address.",
      "Roles run Owner, Producer, Creative Director, Supervisor, Artist, Viewer.",
    ],
  },
  {
    route: "/",
    title: "Productions",
    purpose: "Every production in this studio.",
    steps: ["Open one to get its overview.", "Producers and owners can start a new one."],
  },
];

/**
 * The end-to-end flow, for the drawer's "the process" tab and the guide.
 * Deliberately the same six stages the board and the pipeline use — one
 * vocabulary everywhere.
 */
export const PROCESS: { title: string; body: string }[] = [
  {
    title: "1 · Plan the shots",
    body: "A producer creates the production and its shots — naming a scene and generating numbered shots, or pasting a list from a sheet. Shots get an assignee and a due date.",
  },
  {
    title: "2 · Make options",
    body: "Artists generate wherever they work — Midjourney, Runway, a paint-over — and upload each result to its shot as a new version. Tool, model, seed and prompt go on the version.",
  },
  {
    title: "3 · Shortlist",
    body: "The artist stars the takes worth comparing. Shortlisting gathers candidates; it decides nothing.",
  },
  {
    title: "4 · Pick",
    body: "In the Review Room the options go side by side under one shared zoom. A Creative Director, Producer or Supervisor picks one. That is the decision, and the file is copied into Approved/ under its canonical name.",
  },
  {
    title: "5 · Pass the gate",
    body: "Each stage has a gate. Sign-off is requested, then approved or rejected with a note, and the stage moves on. Every gate lands in the Decisions ledger.",
  },
  {
    title: "6 · QC and deliver",
    body: "Masters are checked against the delivery template. A run has to pass before a shot is marked delivered. The provenance export carries every prompt and decision out with the film.",
  },
];

/**
 * From a blank project to a delivered film, in order (v1.7).
 *
 * PROCESS above is the six-stage shape of the work. This is the actual
 * sequence of things someone does, with who does each one and what has to be
 * true before it will work — the questions a studio asks on day one and
 * nobody could answer from the stage names alone.
 *
 * Every step here is executed on each test run by
 * `e2e/tests/premiere-journey.spec.ts`, which also captures the screenshots
 * the guide shows. If a step in this list stops being true, that run fails.
 */
export type JourneyStep = {
  n: number;
  title: string;
  who: "Producer" | "Artist" | "Creative Director" | "Anyone";
  body: string;
  /** Something that must already be true, where it is not obvious. */
  needs?: string;
  image?: string;
};

export const JOURNEY: JourneyStep[] = [
  {
    n: 1,
    title: "Start the production",
    who: "Producer",
    body: "New production, give it a name and a code. Skip the Drive step if the studio hub is not connected yet — it can be added later without redoing anything.",
    image: "01-production-created.png",
  },
  {
    n: 2,
    title: "Put the shot list in",
    who: "Producer",
    body: "Shots › New shots. Either name a scene and generate numbered shots, or paste a list straight from your sheet. Codes become the filenames everything is filed under, so settle them now — renaming later is possible but leaves a trail.",
    image: "02-shot-list.png",
  },
  {
    n: 3,
    title: "Invite the crew",
    who: "Producer",
    body: "Team › Invite member, one row per person with their role. The seat attaches the first time they sign in with that exact address.",
    needs: "An invited person cannot be assigned work until they have signed in once and claimed the seat.",
    image: "03-team-invited.png",
  },
  {
    n: 4,
    title: "Assign the work",
    who: "Producer",
    body: "On the Shots table, set an assignee and a due date per shot. That is what puts a shot on someone's My work.",
    image: "04-assigned.png",
  },
  {
    n: 5,
    title: "The artist finds their queue",
    who: "Artist",
    body: "My work groups assigned shots by whose move it is: Needs you first, then In progress, With review and Settled. Nothing there on day one is normal.",
    image: "05-my-work.png",
  },
  {
    n: 6,
    title: "Generate and upload options",
    who: "Artist",
    body: "Work in whatever tool you generate with, then upload each result to the shot as a version — drop, ⌘V paste, or browse. Fill in tool, model, seed and prompt: that is what makes a result repeatable and what the provenance export carries out at the end.",
    needs: "Versions are never renumbered or replaced. A better take is a new version.",
    image: "06-options-uploaded.png",
  },
  {
    n: 7,
    title: "The shot reaches review",
    who: "Anyone",
    body: "Options landing moves the shot into the Review queue on its own — nobody has to remember to hand it over.",
    image: "07-review-queue.png",
  },
  {
    n: 8,
    title: "Compare and pick",
    who: "Creative Director",
    body: "In the Review Room press 1–4 to put that many options side by side under one shared zoom. S shortlists, X rejects with a reason, P picks. The pick is the decision: it is recorded with who and why, and the file is copied into Approved/ under its canonical name.",
    needs: "Only Creative Directors, Producers, Supervisors (in their stages) and Owners can pick.",
    image: "08-review-room.png",
  },
  {
    n: 9,
    title: "The decision is on the record",
    who: "Anyone",
    body: "Decisions is the ledger: every pick, gate and sign-off in order, with who and why. Nothing is deleted — a later pick supersedes an earlier one and both stay.",
    image: "10-decisions.png",
  },
  {
    n: 10,
    title: "Sign off the stage gate",
    who: "Producer",
    body: "On the Board, a stage's menu requests sign-off, then approves or rejects with a note. That is how a stage actually moves.",
    needs: "Set the gate approvers first, in Settings › Stages & gates. A brand-new production has none, so the gate cannot be decided until someone is named.",
    image: "11-gate-approved.png",
  },
  {
    n: 11,
    title: "Run delivery QC",
    who: "Producer",
    body: "QC › New QC run, against the studio template (seed the standard TV-delivery template the first time). Work down the checklist; a failing required check blocks the master until it is fixed and re-checked.",
    needs: "A run needs a name before it will start.",
    image: "12-qc-run.png",
  },
  {
    n: 12,
    title: "Report the day",
    who: "Producer",
    body: "A daily report compiles at 18:00 production time, or generate one now. Publishing freezes it and notifies the team.",
    image: "13-daily-report.png",
  },
  {
    n: 13,
    title: "Hand the record over with the film",
    who: "Producer",
    body: "Decisions › Export provenance writes every version, prompt, seed, file identity and decision to one file. That is the artifact that leaves with the delivery, and the reason any of this was recorded.",
    image: "14-provenance.png",
  },
];

/** `/p/abc123/shots/def456` → `/p/:id/shots/:id`. */
function normalize(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  // Convex ids are lowercase alphanumeric runs; treat any long opaque
  // segment as an id so the route shape matches regardless of the id format.
  const shaped = parts.map((part) =>
    /^[a-z0-9]{16,}$/.test(part) ? ":id" : part,
  );
  return "/" + shaped.join("/");
}

export function topicFor(pathname: string): HelpTopic | undefined {
  const route = normalize(pathname);
  return HELP_TOPICS.find((topic) => topic.route === route);
}
