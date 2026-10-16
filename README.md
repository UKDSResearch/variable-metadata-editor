# variable-metadata-editor

React application to faciliate Human-In-The-Loop (HITL) review of privacy concepts, variable functions and variable roles. It has three tabs:

| Tab | Source key | Options | Choice |
| --- | --- | --- | --- |
| Privacy | `privacy_predictions` | Each privacy concept; `ADMIN` is shown as **None** | Several, but None can't be combined |
| Functions | `cdif_predictions` | **Weight** = WEIGHT, **None** = 1 − WEIGHT | One |
| Components | `cdif_predictions` | **Identifier** = IDENTIFIER, **Attribute** = ATTRIBUTE + WEIGHT, **Measure** = ADMIN | One |

## AI Assistance

Claude (Anthropic) was used as a coding assistant during development, scaffolding the original code on prompting and implementing iterative changes. This application has been created purely for demo/prototype purposes and is not production-ready.

## Run it on WSL

1. Install Node.js 18 or newer in your WSL distro (skip if `node -v` already shows 18+):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install --lts
   ```
2. Unzip the project somewhere inside the Linux filesystem (e.g. `~/projects`), not under `/mnt/c`.
   File watching and installs are much faster there.
3. Install and start:
   ```bash
   cd variable-metadata-editor
   npm install
   npm run dev
   ```
4. Open http://localhost:5173 in your Windows browser. WSL 2 forwards localhost automatically.
   If it doesn't, run `npm run dev -- --host` and use the Network address it prints.

`npm run build` produces a static site in `dist/` that you can host anywhere.

## Using it

- The bundled example file (`src/sample/`) loads on start. Click **Upload file**, or drop a JSON file on the page, to review your own.
- Each option column shows the model's score with a checkbox (round boxes on one-choice tabs).
  Boxes are pre-ticked when the score is at or above the threshold (default 0.50; the slider applies
  to every tab and only affects rows still to review). On one-choice tabs only the top option is pre-ticked.
- Per row: **✓ Accept** keeps what's ticked, **✕ Reject** marks the suggestion as wrong and leaves the row empty,
  and ticking/unticking any box marks the row **Edited**. **↺** undoes a decision.
- Each tab is reviewed separately; the count on each tab shows progress.
- Click a variable name for its metadata, value labels, all scores for the current tab, the raw CDIF output and a reviewer note.
- Click a column header to sort by that option's score.
- Progress is saved in the browser (localStorage) per file, so a refresh doesn't lose work.
- **Export reviewed JSON** downloads the original file with `privacy_review`, `function_review` and
  `component_review` blocks added to every variable:

```json
"privacy_review": {
  "status": "edited",                          // pending | accepted | edited | rejected
  "selected": ["COB", "ETH"],                  // final human decision as codes (null while pending)
  "selected_names": ["Country of birth", "Ethnicity"],
  "model_suggestion": ["COB"],                 // what the model pre-ticked
  "note": "Also captures ethnicity",           // optional reviewer note
  "reviewed_at": "2026-09-30T15:51:14.562Z"
},
"component_review": { "status": "accepted", "selected": ["MEASURE"], "selected_names": ["Measure"], ... }
```

A top-level `review_meta` records the export time, threshold and per-tab counts.

## Launching from Dataverse as an external tool

Register this app as a file-level "explore" external tool so it opens directly on the enriched metadata
JSON file attached to a dataset (e.g. the output of the n8n enrichment tool):

```
curl -X POST -H 'Content-type: application/json' "http://localhost:8080/api/admin/externalTools?unblock-key=<MY_SECRET_KEY>" -d \
"{ \"displayName\":\"Variable Metadata Editor\", \"description\":\"Open in Variable Metadata Editor\", \"scope\":\"file\", \"type\":\"explore\", \"toolUrl\":\"http://localhost:5173\", \"toolParameters\": { \"queryParameters\":[ {\"fileid\":\"{fileId}\"}, {\"siteUrl\":\"{siteUrl}\"}, {\"key\":\"{apiToken}\"}, {\"datasetid\":\"{datasetPid}\"}, {\"datasetversion\":\"{datasetVersion}\"}, {\"locale\":\"{localeCode}\"} ] }, \"contentType\":\"application/json\" }"
```

When launched this way, the app:

- Auto-loads the target file from Dataverse's Data Access API (`/api/access/datafile/{fileid}`) instead of the sample.
- Shows an **Add reviewed copy to Dataverse** button that adds the reviewed JSON as a new file in the
  dataset via `/api/datasets/:persistentId/add`, named `<original name>_reviewed.json`. The original
  enriched file is never overwritten.
- Still supports **Upload file** / drag-and-drop as a fallback for working outside of Dataverse.

Notes:

- The tool uses the (deprecated but simple) `apiToken`-in-URL authorization method, so only register it on
  instances you trust, and only grant it to users who should be able to write back to the dataset.
- Browser-based external tools require CORS to be enabled on the Dataverse server for the tool's origin
  (e.g. `http://localhost:5173`). See [Cross-Origin Resource Sharing (CORS)](https://guides.dataverse.org/en/latest/installation/config.html#cross-origin-resource-sharing-cors)
  in the Dataverse Installation Guide. The `dataverse-docker` setup in this workspace already sets
  `dataverse.cors.origin=*`, so no extra configuration is needed there.

## Code map

| File | Purpose |
| --- | --- |
| `src/App.jsx` | Page, table, toolbar, upload/export |
| `src/VariableDrawer.jsx` | Side panel with variable details |
| `src/tasks.js` | Tab definitions: option names and how scores map from the model output. Edit this to change mappings or add a tab |
| `src/review.js` | Pure review logic (suggestions, statuses, export format) |
| `src/NetworkBanner.jsx` | Header banner graphic |
| `src/styles.css` | Styles and light/dark colour tokens |
