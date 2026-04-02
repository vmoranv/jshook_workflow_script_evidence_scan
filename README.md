# script-evidence-scan workflow

Declarative workflow for extracting evidence from **browser-loaded scripts** instead of relying on `collect_code + search_in_scripts`.

## Entry File

- `workflow.ts`

## Workflow ID

- `workflow.script-evidence-scan.v1`

## Structure

This workflow codifies a loaded-script-first evidence path:

- `page_navigate` into the target page
- optional `page_script_run(auth_extract)` to capture ambient auth context
- `get_all_scripts(includeSource=false)` to enumerate scripts currently loaded in the browser
- `get_script_source(preview=true)` for a configurable list of URL hints / wildcard patterns
- `console_execute` summary step listing which hints were inspected

## Tools Used

- `page_navigate`
- `page_script_run`
- `get_all_scripts`
- `get_script_source`
- `console_execute`

## Config

- `workflows.scriptEvidenceScan.pageUrl`
- `workflows.scriptEvidenceScan.waitUntil`
- `workflows.scriptEvidenceScan.runAuthExtract`
- `workflows.scriptEvidenceScan.maxScripts`
- `workflows.scriptEvidenceScan.includeDefaultHints`
- `workflows.scriptEvidenceScan.targetScriptHints`
- `workflows.scriptEvidenceScan.previewMaxLines`

## Default Hints

The workflow can inspect these script URL hints by default:

- `*main*.js`
- `*index*.js`
- `*app*.js`

You can add explicit bundle URLs or wildcard patterns via config.

## Local Validation

1. Run `pnpm install`.
2. Run `pnpm typecheck`.
3. Put this repo under a configured `workflows/` extension root.
4. Run `reload_extensions` in `jshookmcp`.
5. Confirm the workflow appears in `list_extension_workflows`.
6. Execute the workflow and verify it outputs:
   - loaded scripts summary
   - preview(s) for configured script hints
   - final summary of inspected hints
