import 'dotenv/config'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import { buildDemoReport } from './simulation/fixtures'
import { runLiveSimulation } from './simulation/live'
import { hasJevApiKey, JEV_MODEL } from './simulation/jev-agent'
import type { CreateRunInput, RunReport, RunStatus } from './types'

const app = express()
const port = Number(process.env.PORT ?? 8787)
const runs = new Map<string, RunReport>()
const controllers = new Map<string, AbortController>()
const assetRoot = path.join(process.cwd(), 'runtime-assets')

app.use(cors())
app.use(express.json())
app.use('/api/run-assets', express.static(assetRoot))

const normalizeUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Website URL is required.')
  const parsed = new URL(value.trim())
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https website URL.')
  return parsed.toString().replace(/\/$/, '')
}

const normalizeInput = (body: Partial<CreateRunInput>): Required<CreateRunInput> => {
  const website = normalizeUrl(body.website)
  const task = typeof body.task === 'string' ? body.task.trim() : ''
  if (task.length < 8) throw new Error('Add a little more detail to the task so users know what to do.')
  const personas = Math.max(5, Math.min(Number(body.personas) || 15, 15))
  const maxSteps = Math.max(10, Math.min(Number(body.maxSteps) || 30, 50))
  return { website, task, personas, maxSteps }
}

const setRunState = (run: RunReport, status: RunStatus, progress: number, phase: string) => {
  run.status = status
  run.progress = progress
  run.phase = phase
  runs.set(run.id, run)
}

const scheduleRun = (run: RunReport, input: Required<CreateRunInput>) => {
  const controller = new AbortController()
  controllers.set(run.id, controller)
  setRunState(run, 'running', 5, 'Preparing live personas')
  void runLiveSimulation({
    ...input,
    id: run.id,
    assetDir: assetRoot,
    signal: controller.signal,
    onProgress: (progress, phase) => {
      if (controllers.has(run.id)) setRunState(run, 'running', progress, phase)
    },
    onEvent: (event) => {
      if (!controllers.has(run.id)) return
      run.liveEvents = [...(run.liveEvents || []), event].slice(-240)
      run.phase = event.personaName + ' · ' + event.action
      runs.set(run.id, run)
    },
  }).then((finished) => {
    if (!controllers.has(run.id)) return
    controllers.delete(run.id)
    runs.set(run.id, finished)
  }).catch((error) => {
    if (!controllers.has(run.id)) return
    controllers.delete(run.id)
    const fallback = buildDemoReport({ ...input, id: run.id })
    fallback.executionMode = 'fallback'
    fallback.phase = 'Preview fallback'
    fallback.errorMessage = error instanceof Error ? error.message : 'The live browser run could not complete.'
    fallback.guardrailNote = 'The live browser run could not complete, so this report is a clearly labeled preview. No external action was submitted.'
    fallback.liveEvents = run.liveEvents || []
    runs.set(run.id, fallback)
  })
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'ghost-user-api', jevConfigured: hasJevApiKey(), model: JEV_MODEL }))

app.get('/api/runs', (_req, res) => {
  res.json([...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20))
})

app.get('/api/runs/demo', (_req, res) => {
  res.json(buildDemoReport({
    website: 'https://acmecloud.dev',
    task: 'Find the cheapest paid plan and start signing up for it.',
    id: 'demo-run',
  }))
})

app.get('/api/runs/:id', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'Run not found.' })
  return res.json(run)
})

app.post('/api/runs', (req, res) => {
  try {
    if (!hasJevApiKey()) return res.status(503).json({ error: 'JEV is not configured. Add TYPESAFE_API_KEY to .env, restart the dev server, and try again.' })
    const input = normalizeInput(req.body as Partial<CreateRunInput>)
    const id = 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
    const now = new Date().toISOString()
    const run: RunReport = {
      ...buildDemoReport({ ...input, id }),
      status: 'queued',
      executionMode: 'live',
      progress: 3,
      phase: 'Queued for simulation',
      createdAt: now,
      completedAt: undefined,
      metrics: {
        completed: 0,
        total: input.personas,
        completionRate: 0,
        avgSteps: 0,
        successfulAvgSteps: 0,
        failedAvgSteps: 0,
        avgConfidence: 0,
        avgBacktracks: 0,
        biggestDropOff: 'Not measured yet',
        biggestDropOffCount: 0,
        sessionDuration: '0s',
      },
      summary: 'JEV is preparing isolated browser sessions for this task.',
      summaryAccent: 'The report will be built from live page states, actions, and screenshots.',
      issues: [],
      personas: [],
      journeyNodes: [],
      journeyEdges: [],
      screenshots: [],
      liveEvents: [],
      bestPath: [],
      guardrailNote: 'JEV-driven sessions stop before sensitive inputs, account creation, payment, messages, destructive actions, and protected submissions.',
    }
    runs.set(id, run)
    scheduleRun(run, input)
    return res.status(201).json(run)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not start the run.' })
  }
})

app.post('/api/runs/:id/cancel', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).json({ error: 'Run not found.' })
  controllers.get(run.id)?.abort()
  controllers.delete(run.id)
  setRunState(run, 'failed', run.progress, 'Run cancelled')
  return res.json(run)
})

app.listen(port, () => {
  console.log('Ghost User API listening on http://localhost:' + port)
})
