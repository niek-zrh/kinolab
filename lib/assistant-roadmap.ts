/** Design-only roadmap. No providers, prompts, credentials, or execution hooks. */
export const ASSISTANTS = [
  {
    id: "story",
    title: "Story & coverage",
    phase: "Plan",
    glyph: "story",
    summary: "Turn a scene into a considered shot plan.",
    detail:
      "A future story assistant could propose coverage, shot descriptions, and missing story beats without changing your original scene.",
    inputs: "Only the scenes and creative brief you select.",
    output: "A draft shot list with a reason for each suggestion.",
    approval:
      "A director reviews every proposed shot before it joins the production.",
    path: "storyboard",
    destination: "Open storyboard",
    contexts: ["storyboard", "shots"],
  },
  {
    id: "look",
    title: "Look development",
    phase: "Create",
    glyph: "look",
    summary: "Explore a direction. Keep your visual voice.",
    detail:
      "A future look assistant could suggest palettes and visual directions from selected, rights-cleared references. Originals would stay untouched.",
    inputs: "References you explicitly select and a creative direction.",
    output:
      "Labelled concept variations with their sources and generation details.",
    approval:
      "An artist chooses what to keep; nothing becomes an approved reference automatically.",
    path: "references",
    destination: "Open reference board",
    contexts: ["references"],
  },
  {
    id: "character",
    title: "Character continuity",
    phase: "Create",
    glyph: "character",
    summary: "Keep the character recognisable in every frame.",
    detail:
      "A future continuity assistant could compare selected designs against approved character references and flag differences worth checking.",
    inputs:
      "Selected character references and versions, with permission to use them.",
    output: "Side-by-side observations linked to the source versions.",
    approval:
      "The character artist decides whether a difference is intentional or needs work.",
    path: "characters",
    destination: "Open characters",
    contexts: ["characters"],
  },
  {
    id: "review",
    title: "Review companion",
    phase: "Finish",
    glyph: "review",
    summary: "Find the note that moves the shot forward.",
    detail:
      "A future review companion could group feedback and suggest continuity checks. Creative judgement, picks, and approvals remain with the team.",
    inputs: "Only selected versions and review comments.",
    output: "A draft feedback summary with references to the original notes.",
    approval:
      "A reviewer edits and confirms notes before sharing them with an artist.",
    path: "review",
    destination: "Open review queue",
    contexts: ["review", "decisions"],
  },
  {
    id: "production",
    title: "Production brief",
    phase: "Plan",
    glyph: "production",
    summary: "A clear handover, without losing the details.",
    detail:
      "A future production assistant could draft a daily brief from assignments, blockers, and decisions already recorded in Kinolab.",
    inputs: "Selected production activity, assignments, and decisions.",
    output:
      "A source-linked draft of priorities, open questions, and handover notes.",
    approval:
      "A producer reviews the draft before publishing. No silent reassignments or schedule changes.",
    path: "reports",
    destination: "Open reports",
    contexts: ["", "my-work", "board", "reports"],
  },
  {
    id: "delivery",
    title: "Delivery preflight",
    phase: "Finish",
    glyph: "delivery",
    summary: "Catch missing pieces before the handover.",
    detail:
      "A future delivery assistant could check selected files against an agreed checklist and point out missing versions, naming issues, or incomplete records.",
    inputs:
      "Selected deliverables, file metadata, and your delivery checklist.",
    output: "A proposed checklist with evidence for each warning.",
    approval:
      "The delivery lead verifies the findings and signs off. No automatic export or delivery.",
    path: "qc",
    destination: "Open quality control",
    contexts: ["qc", "files"],
  },
] as const;

export type Assistant = (typeof ASSISTANTS)[number];
export type AssistantId = Assistant["id"];

/** Match a production route segment, not an arbitrary substring or tenant id. */
export function assistantForPath(pathname: string): Assistant | undefined {
  const parts = pathname.split("/");
  if (parts[1] !== "p" || !parts[2]) return undefined;
  const section = parts[3] ?? "";
  return ASSISTANTS.find((assistant) =>
    (assistant.contexts as readonly string[]).includes(section),
  );
}
