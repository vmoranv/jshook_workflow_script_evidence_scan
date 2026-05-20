import {
  branchStep,
  defineWorkflow,
  sequenceStep,
  toolStep,
  type WorkflowExecutionContext,
} from '@jshookmcp/extension-sdk/workflow';

const DEFAULT_HINTS = ['*main*.js', '*index*.js', '*app*.js'] as const;

const workflowId = 'workflow.script-evidence-scan.v1';

export default defineWorkflow(workflowId, 'Script Evidence Scan', (workflow) =>
  workflow
    .description(
      'Navigate to a page, enumerate browser-loaded scripts, and inspect configured script URL hints via get_script_source previews.',
    )
    .tags(['workflow', 'reverse', 'script', 'evidence', 'browser'])
    .timeoutMs(8 * 60_000)
    .defaultMaxConcurrency(1)
    .buildGraph((ctx: WorkflowExecutionContext) => {
      const prefix = 'workflows.scriptEvidenceScan';
      const pageUrl = ctx.getConfig<string>(`${prefix}.pageUrl`, 'https://example.com/');
      const waitUntil = ctx.getConfig<string>(`${prefix}.waitUntil`, 'networkidle');
      const runAuthExtract = ctx.getConfig<boolean>(`${prefix}.runAuthExtract`, true);
      const maxScripts = ctx.getConfig<number>(`${prefix}.maxScripts`, 80);
      const includeDefaultHints = ctx.getConfig<boolean>(`${prefix}.includeDefaultHints`, true);
      const configuredHints = ctx.getConfig<string[]>(`${prefix}.targetScriptHints`, []);
      const includeFullSource = ctx.getConfig<boolean>(`${prefix}.includeFullSource`, true);
      const previewMaxLines = ctx.getConfig<number>(`${prefix}.previewMaxLines`, 120);

      const targetHints = [
        ...(includeDefaultHints ? [...DEFAULT_HINTS] : []),
        ...configuredHints,
      ].filter((value, index, array) => value.trim().length > 0 && array.indexOf(value) === index);

      return sequenceStep('script-evidence-scan-root', (root) => {
        root.tool('navigate-target', 'page_navigate', {
          input: {
            url: pageUrl,
            waitUntil,
            enableNetworkMonitoring: true,
          },
        });
        root.step(
          branchStep('maybe-auth-extract', 'script_evidence_run_auth_extract', (branch) => {
            branch
              .predicateFn(() => runAuthExtract)
              .whenTrue(
                toolStep('auth-extract', 'page_script_run', {
                  input: { name: 'auth_extract' },
                }),
              )
              .whenFalse(
                toolStep('skip-auth-extract', 'console_execute', {
                  input: {
                    expression:
                      '({ skipped: true, step: "auth_extract", reason: "config_disabled" })',
                  },
                }),
              );
          }),
        );
        root.tool('list-loaded-scripts', 'get_all_scripts', {
          input: {
            includeSource: includeFullSource,
            maxScripts,
          },
        });
        root.tool('summarize-script-hints', 'page_evaluate', {
          input: {
            code: `(function(){
              const hints = ${JSON.stringify(targetHints)};
              const urls = Array.from(document.scripts)
                .map(s => s.src || '')
                .filter(Boolean);
              const matches = hints.map((hint) => {
                const escaped = hint
                  .replace(/[.+^()|[\\\\]\\\\]/g, '\\\\$&')
                  .replace(/\\\\\\*/g, '.*');
                const rx = new RegExp('^' + escaped + '$', 'i');
                return {
                  hint,
                  matchedUrls: urls.filter(url => rx.test(url)).slice(0, 10),
                };
              });
              return { hints, totalScriptsWithSrc: urls.length, matches };
            })()`,
          },
        });
        root.tool('emit-summary', 'console_execute', {
          input: {
            expression: `(${JSON.stringify({
              workflowId,
              pageUrl,
              waitUntil,
              runAuthExtract,
              maxScripts,
              previewMaxLines,
              inspectedHints: targetHints,
              strategy: [
                'navigate',
                'optional_auth_extract',
                'get_all_scripts',
                'get_script_source(preview)',
              ],
            })})`,
          },
        });
      });
    })
    .onStart((ctx) => {
      ctx.emitMetric('workflow_runs_total', 1, 'counter', { workflowId, stage: 'start' });
    })
    .onFinish((ctx) => {
      ctx.emitMetric('workflow_runs_total', 1, 'counter', { workflowId, stage: 'finish' });
    })
    .onError((ctx, error) => {
      ctx.emitMetric('workflow_errors_total', 1, 'counter', { workflowId, error: error.name });
    }),
);
