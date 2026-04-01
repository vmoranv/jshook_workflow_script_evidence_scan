import { createWorkflow, SequenceNodeBuilder, ToolNodeBuilder, } from '@jshookmcp/extension-sdk/workflow';
const workflowId = 'workflow.script-evidence-scan.v1';
const DEFAULT_HINTS = ['*main*.js', '*index*.js', '*app*.js'];
export default createWorkflow(workflowId, 'Script Evidence Scan')
    .description('Navigate to a page, enumerate browser-loaded scripts, and inspect configured script URL hints via get_script_source previews.')
    .tags(['workflow', 'reverse', 'script', 'evidence', 'browser'])
    .timeoutMs(8 * 60_000)
    .defaultMaxConcurrency(1)
    .buildGraph((ctx) => {
    const prefix = 'workflows.scriptEvidenceScan';
    const pageUrl = String(ctx.getConfig(`${prefix}.pageUrl`, 'https://example.com/'));
    const waitUntil = String(ctx.getConfig(`${prefix}.waitUntil`, 'networkidle'));
    const runAuthExtract = Boolean(ctx.getConfig(`${prefix}.runAuthExtract`, true));
    const maxScripts = Number(ctx.getConfig(`${prefix}.maxScripts`, 80));
    const includeDefaultHints = Boolean(ctx.getConfig(`${prefix}.includeDefaultHints`, true));
    const configuredHints = ctx.getConfig(`${prefix}.targetScriptHints`, []);
    const includeFullSource = Boolean(ctx.getConfig(`${prefix}.includeFullSource`, true));
    const previewMaxLines = Number(ctx.getConfig(`${prefix}.previewMaxLines`, 120));
    const targetHints = [
        ...(includeDefaultHints ? [...DEFAULT_HINTS] : []),
        ...configuredHints,
    ].filter((value, index, array) => value.trim().length > 0 && array.indexOf(value) === index);
    const root = new SequenceNodeBuilder('script-evidence-scan-root');
    root
        .tool('navigate-target', 'page_navigate', {
        input: {
            url: pageUrl,
            waitUntil,
            enableNetworkMonitoring: true,
        },
    })
        .branch('maybe-auth-extract', 'script_evidence_run_auth_extract', (b) => {
        b.predicateFn(() => runAuthExtract)
            .whenTrue(new ToolNodeBuilder('auth-extract', 'page_script_run').input({
            name: 'auth_extract',
        }))
            .whenFalse(new ToolNodeBuilder('skip-auth-extract', 'console_execute').input({
            expression: '({ skipped: true, step: "auth_extract", reason: "config_disabled" })',
        }));
    })
        .tool('list-loaded-scripts', 'get_all_scripts', {
        input: {
            includeSource: includeFullSource,
            maxScripts,
        },
    })
        .tool('summarize-script-hints', 'page_evaluate', {
        input: {
            code: `(function(){
            const hints = ${JSON.stringify(targetHints)};
            const urls = Array.from(document.scripts)
              .map(s => s.src || '')
              .filter(Boolean);
            const matches = hints.map((hint) => {
              const escaped = hint
                .replace(/[.+^()|[\\]\\]/g, '\\$&')
                .replace(/\\\*/g, '.*');
              const rx = new RegExp('^' + escaped + '$', 'i');
              return {
                hint,
                matchedUrls: urls.filter(url => rx.test(url)).slice(0, 10),
              };
            });
            return { hints, totalScriptsWithSrc: urls.length, matches };
          })()`,
        },
    })
        .tool('emit-summary', 'console_execute', {
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
    return root;
})
    .onStart((ctx) => {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
        workflowId,
        stage: 'start',
    });
})
    .onFinish((ctx) => {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
        workflowId,
        stage: 'finish',
    });
})
    .onError((ctx, error) => {
    ctx.emitMetric('workflow_errors_total', 1, 'counter', {
        workflowId,
        error: error.name,
    });
})
    .build();
