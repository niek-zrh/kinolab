import { HUB_FOLDERS } from "./domain";

/**
 * The guide Kinolab puts at the top of every Drive hub. Uploaded as HTML and
 * converted by Drive into a Google Doc, so it reads like a document rather
 * than a text-file preview. drive.ts records its id on the hub so the sync
 * never imports it as a production file.
 */
export const HUB_README_NAME = "READ ME — Kinolab folder structure";

/** What each HUB_FOLDERS key holds; keys without an entry are listed bare. */
const FOLDER_PURPOSE: Record<string, string> = {
  admin: "Contracts, budgets, schedules and other paperwork.",
  development: "Story development.",
  "development.coreScript": "The current script.",
  "development.scriptOptions": "Alternative drafts and script options.",
  preproduction: "Everything prepared before shots are made.",
  "preproduction.concepts": "Character and concept art.",
  "preproduction.locations": "Location references and designs.",
  previews: "Previews and animatics.",
  "previews.options": "Preview variations under consideration.",
  production: "The shots themselves.",
  "production.shots":
    "One folder per shot, created by Kinolab the first time the shot gets a file.",
  post: "Post-production.",
  "post.sound": "Music, dialogue and sound effects.",
  "post.vfx": "Visual-effects work.",
  delivery: "Finished output.",
  "delivery.masters": "Final masters.",
  "delivery.qc": "Quality-control reports and checked files.",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function hubReadmeHtml(production: {
  code: string;
  name: string;
}): string {
  const title = escapeHtml(`${production.code} — ${production.name}`);
  const folders = HUB_FOLDERS.map((entry) => {
    const depth = entry.path.length - 1;
    const name = escapeHtml(entry.path[depth] ?? "");
    const purpose = FOLDER_PURPOSE[entry.key];
    const indent = depth * 24;
    return `<p style="margin:2px 0 2px ${indent}pt"><b>${name}/</b>${
      purpose ? ` — ${escapeHtml(purpose)}` : ""
    }</p>`;
  }).join("\n");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(HUB_README_NAME)}</title></head>
<body style="font-family:Arial,sans-serif">
<h1>${title}</h1>
<p>This folder is the Google Drive hub for this production in <b>Kinolab</b>.
Kinolab created it, keeps track of every file in it, and shares it with the
production team.</p>

<h2>⚠️ Please don't reorganise this folder outside Kinolab</h2>
<p>Kinolab finds files by the exact folders it created. If you <b>rename,
move or delete</b> folders or files here directly in Google Drive, Kinolab can
lose track of them: options can disappear from shots, approved files can go
missing, and work already reviewed in Kinolab can break.</p>
<ul>
<li>Upload, approve and rename through Kinolab whenever possible.</li>
<li>Adding your own files to the general folders below is fine.</li>
<li>Never rename, move or delete anything inside
<b>04 Production/Shots/</b>.</li>
<li>Need a different structure? Ask your producer to change it in Kinolab
first.</li>
</ul>

<h2>Folder structure</h2>
${folders}

<h2>Inside a shot folder</h2>
<p>Every shot gets <b>04 Production/Shots/&lt;shot code&gt;/</b> with two
folders:</p>
<p style="margin-left:24pt"><b>Options/</b> — every version uploaded or
attached to the shot in Kinolab.</p>
<p style="margin-left:24pt"><b>Approved/</b> — the picked version, copied
under its final name, for example
<b>${escapeHtml(production.code)}_SC010_SH010_v3.mp4</b>.</p>

<p style="color:#666"><i>This document was created by Kinolab. You can delete
it without breaking anything, but it will not be recreated automatically.</i></p>
</body></html>`;
}
