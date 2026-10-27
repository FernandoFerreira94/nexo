import { createChatModel, createDecisionEngine, loadAgentConfig } from '@nexo/agent'
import { writeFileSync } from 'node:fs'
import { runScenario, type ScenarioRun } from './harness'
import { SCENARIOS } from './scenarios'

/**
 * `pnpm eval`: roda os cenários com o modelo configurado no .env e grava docs/eval-report.md.
 * Com LLM_PROVIDER=mock mede só as regras; com openrouter mede o modelo de verdade (e o custo).
 */
const config = loadAgentConfig()
const model = createChatModel(config)
const decision = createDecisionEngine(config, model)

const runs: ScenarioRun[] = []
for (const scenario of SCENARIOS) {
  const run = await runScenario(scenario, { config, model, decision })
  runs.push(run)
  console.warn(
    `${run.passed ? 'OK  ' : 'FALHA'} ${scenario.id}${run.passed ? '' : `: ${run.failures.join('; ')}`}`,
  )
}

const passed = runs.filter((r) => r.passed).length
const totalCost = runs.reduce((sum, r) => sum + r.result.trace.costUsd, 0)
const latencies = runs.map((r) => r.result.trace.latencyMs).sort((a, b) => a - b)
const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0
const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0

const rows = runs.map((r) => {
  const t = r.result.trace
  return `| ${r.passed ? '✅' : '❌'} | ${r.scenario.id} | ${t.understood.intent} | ${t.confidence} | ${t.tokens.input + t.tokens.output} | $${t.costUsd.toFixed(5)} | ${t.latencyMs} ms | ${r.failures.join('; ') || '-'} |`
})

const report = `# Relatório de evals

- Data: ${new Date().toISOString()}
- Modelo: ${config.llmModel} · Decisão: ${config.llmProvider === 'mock' ? 'mock' : config.decisionProvider}
- Resultado: **${passed}/${runs.length}** cenários passaram
- Custo total: $${totalCost.toFixed(4)} · Latência p50 ${p50} ms · p95 ${p95} ms

| | Cenário | Intenção | Confiança | Tokens | Custo | Latência | Falhas |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`

writeFileSync(new URL('../docs/eval-report.md', import.meta.url), report)
console.warn(`\n${passed}/${runs.length} passaram. Relatório em docs/eval-report.md`)
process.exitCode = passed === runs.length ? 0 : 1
