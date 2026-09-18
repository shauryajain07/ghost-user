import type {
  AgentStep,
  FrictionIssue,
  JourneyEdge,
  JourneyNode,
  Persona,
  PersonaResult,
  RunReport,
  ScreenshotFrame,
} from '../types'

export const personas: Persona[] = [
  {
    id: 'p1',
    name: 'Impatient User',
    description: 'Scans fast and expects the first CTA to be the shortest path.',
    initials: 'IU',
    color: '#d7ff65',
    patience: 0.22,
    technicalLiteracy: 0.52,
    riskTolerance: 0.54,
    attentionToDetail: 0.28,
    willingnessToExplore: 0.2,
    priceSensitivity: 0.47,
  },
  {
    id: 'p2',
    name: 'Careful Buyer',
    description: 'Reads the small print and compares what each plan really includes.',
    initials: 'CB',
    color: '#ffbd7d',
    patience: 0.86,
    technicalLiteracy: 0.58,
    riskTolerance: 0.3,
    attentionToDetail: 0.94,
    willingnessToExplore: 0.72,
    priceSensitivity: 0.88,
  },
  {
    id: 'p3',
    name: 'Technical User',
    description: 'Looks for precise language, docs, and proof before committing.',
    initials: 'TU',
    color: '#9cb6ff',
    patience: 0.76,
    technicalLiteracy: 0.97,
    riskTolerance: 0.62,
    attentionToDetail: 0.84,
    willingnessToExplore: 0.68,
    priceSensitivity: 0.46,
  },
  {
    id: 'p4',
    name: 'First-Time Visitor',
    description: 'Has no context and relies on familiar labels and clear hierarchy.',
    initials: 'FV',
    color: '#f49bd6',
    patience: 0.6,
    technicalLiteracy: 0.34,
    riskTolerance: 0.45,
    attentionToDetail: 0.5,
    willingnessToExplore: 0.42,
    priceSensitivity: 0.65,
  },
  {
    id: 'p5',
    name: 'Skeptical User',
    description: 'Searches for trust signals, hidden costs, and an easy way out.',
    initials: 'SU',
    color: '#c1a6ff',
    patience: 0.64,
    technicalLiteracy: 0.61,
    riskTolerance: 0.18,
    attentionToDetail: 0.82,
    willingnessToExplore: 0.55,
    priceSensitivity: 0.8,
  },
  {
    id: 'p6',
    name: 'Goal-Oriented User',
    description: 'Filters out everything unrelated and takes the most obvious route.',
    initials: 'GO',
    color: '#80e6cf',
    patience: 0.48,
    technicalLiteracy: 0.66,
    riskTolerance: 0.67,
    attentionToDetail: 0.45,
    willingnessToExplore: 0.31,
    priceSensitivity: 0.57,
  },
  {
    id: 'p7',
    name: 'Explorer',
    description: 'Clicks around, builds a mental model, then chooses a route.',
    initials: 'EX',
    color: '#91d0ff',
    patience: 0.78,
    technicalLiteracy: 0.7,
    riskTolerance: 0.61,
    attentionToDetail: 0.66,
    willingnessToExplore: 0.98,
    priceSensitivity: 0.52,
  },
  {
    id: 'p8',
    name: 'Distracted User',
    description: 'Misses subtle controls and needs strong visual signposting.',
    initials: 'DU',
    color: '#ff9a9a',
    patience: 0.35,
    technicalLiteracy: 0.42,
    riskTolerance: 0.45,
    attentionToDetail: 0.21,
    willingnessToExplore: 0.24,
    priceSensitivity: 0.58,
  },
  {
    id: 'p9',
    name: 'Comparison Shopper',
    description: 'Wants the best fit and checks features, pricing, and proof points.',
    initials: 'CS',
    color: '#f0dc75',
    patience: 0.82,
    technicalLiteracy: 0.64,
    riskTolerance: 0.32,
    attentionToDetail: 0.87,
    willingnessToExplore: 0.79,
    priceSensitivity: 0.92,
  },
  {
    id: 'p10',
    name: 'Mobile-Minded User',
    description: 'Expects compact navigation, clear buttons, and minimal reading.',
    initials: 'MM',
    color: '#ffc27b',
    patience: 0.38,
    technicalLiteracy: 0.49,
    riskTolerance: 0.5,
    attentionToDetail: 0.35,
    willingnessToExplore: 0.34,
    priceSensitivity: 0.7,
  },
  {
    id: 'p11',
    name: 'Team Lead',
    description: 'Looks for evidence the product can work across a whole team.',
    initials: 'TL',
    color: '#b8f08f',
    patience: 0.71,
    technicalLiteracy: 0.73,
    riskTolerance: 0.4,
    attentionToDetail: 0.72,
    willingnessToExplore: 0.66,
    priceSensitivity: 0.68,
  },
  {
    id: 'p12',
    name: 'Low-Context User',
    description: 'Needs plain language and reassurance before taking any next step.',
    initials: 'LC',
    color: '#b3d6ff',
    patience: 0.55,
    technicalLiteracy: 0.2,
    riskTolerance: 0.26,
    attentionToDetail: 0.46,
    willingnessToExplore: 0.35,
    priceSensitivity: 0.72,
  },
  {
    id: 'p13',
    name: 'Returning User',
    description: 'Assumes the product will behave like tools they already know.',
    initials: 'RU',
    color: '#eab4ff',
    patience: 0.5,
    technicalLiteracy: 0.74,
    riskTolerance: 0.72,
    attentionToDetail: 0.42,
    willingnessToExplore: 0.29,
    priceSensitivity: 0.4,
  },
  {
    id: 'p14',
    name: 'Security-Conscious User',
    description: 'Checks the edge cases and pauses at anything that feels irreversible.',
    initials: 'SC',
    color: '#9fe3df',
    patience: 0.88,
    technicalLiteracy: 0.91,
    riskTolerance: 0.12,
    attentionToDetail: 0.97,
    willingnessToExplore: 0.6,
    priceSensitivity: 0.61,
  },
  {
    id: 'p15',
    name: 'Shortcut Seeker',
    description: 'Looks for the one link that gets straight to the answer.',
    initials: 'SS',
    color: '#ffb3a2',
    patience: 0.29,
    technicalLiteracy: 0.57,
    riskTolerance: 0.74,
    attentionToDetail: 0.27,
    willingnessToExplore: 0.18,
    priceSensitivity: 0.51,
  },
]

const makeTimeline = (items: Array<Omit<AgentStep, 'step'>>): AgentStep[] =>
  items.map((item, index) => ({ ...item, step: index + 1 }))

const completedTimeline = (lowConfidence = false): AgentStep[] =>
  makeTimeline([
    {
      page: 'homepage',
      pageLabel: 'Homepage',
      action: 'Viewed page',
      actionDetail: 'Scanned the primary navigation and hero area',
      reasoningSummary: 'The user first looked for a familiar route to compare plans.',
      confidence: 0.82,
      expectedOutcome: 'Find a clear path toward pricing.',
      actualOutcome: 'Pricing was visible in the top navigation.',
      timeMs: 2100,
      tone: 'neutral',
    },
    {
      page: 'pricing',
      pageLabel: 'Pricing',
      action: 'Clicked “Pricing”',
      actionDetail: 'Selected the top navigation link',
      reasoningSummary: 'Pricing appeared to be the clearest place to compare paid plans.',
      confidence: 0.88,
      expectedOutcome: 'See plan names, prices, and differences.',
      actualOutcome: 'Plan cards loaded with a monthly / annual toggle.',
      timeMs: 1800,
      tone: 'success',
    },
    {
      page: 'pricing',
      pageLabel: 'Pricing',
      action: 'Compared plan cards',
      actionDetail: 'Read feature rows and the plan descriptions',
      reasoningSummary: 'The user checked whether the lowest price still covered the task.',
      confidence: lowConfidence ? 0.43 : 0.81,
      expectedOutcome: 'Identify the cheapest plan that fits.',
      actualOutcome: lowConfidence
        ? 'The differences between Starter and Pro were not immediately clear.'
        : 'Starter was identified as the cheapest paid plan.',
      timeMs: 6400,
      tone: lowConfidence ? 'warning' : 'neutral',
    },
    {
      page: 'signup',
      pageLabel: 'Signup',
      action: 'Selected “Start free trial”',
      actionDetail: 'Chose the CTA on the Starter card',
      reasoningSummary: 'The user expected the CTA to begin signup without a commitment.',
      confidence: lowConfidence ? 0.62 : 0.83,
      expectedOutcome: 'Open account creation for the selected plan.',
      actualOutcome: 'Signup opened with Starter preselected.',
      timeMs: 2300,
      tone: 'success',
    },
    {
      page: 'signup',
      pageLabel: 'Signup',
      action: 'Reached protected boundary',
      actionDetail: 'Stopped before entering personal information',
      reasoningSummary: 'The user reached the task boundary and did not submit sensitive data.',
      confidence: 0.91,
      expectedOutcome: 'Mark the task complete before account creation.',
      actualOutcome: 'Task completed safely at the signup boundary.',
      timeMs: 1000,
      tone: 'success',
    },
  ])

const failedTimeline = (kind: 'cta' | 'plans'): AgentStep[] =>
  makeTimeline([
    {
      page: 'homepage',
      pageLabel: 'Homepage',
      action: kind === 'cta' ? 'Clicked “Get started”' : 'Viewed page',
      actionDetail: kind === 'cta' ? 'Selected the prominent hero CTA' : 'Scanned the hero and navigation',
      reasoningSummary:
        kind === 'cta'
          ? 'The primary CTA sounded like the fastest route to starting a plan.'
          : 'The user searched for a direct link to pricing.',
      confidence: kind === 'cta' ? 0.84 : 0.69,
      expectedOutcome: 'Move closer to choosing a paid plan.',
      actualOutcome: kind === 'cta' ? 'Opened product selection instead of signup.' : 'Pricing link was below the fold.',
      timeMs: 2700,
      tone: kind === 'cta' ? 'warning' : 'neutral',
    },
    {
      page: kind === 'cta' ? 'products' : 'homepage',
      pageLabel: kind === 'cta' ? 'Products' : 'Homepage',
      action: kind === 'cta' ? 'Scanned product cards' : 'Scrolled down',
      actionDetail: kind === 'cta' ? 'Looked for pricing context' : 'Searched feature sections for pricing',
      reasoningSummary:
        kind === 'cta'
          ? 'The user re-evaluated the navigation after landing on an unexpected page.'
          : 'The user expected pricing to be visible near the main product explanation.',
      confidence: kind === 'cta' ? 0.46 : 0.51,
      expectedOutcome: 'Understand which product to choose.',
      actualOutcome: 'The page introduced more choices without clarifying the paid plan route.',
      timeMs: 5400,
      tone: 'warning',
    },
    {
      page: 'pricing',
      pageLabel: 'Pricing',
      action: 'Clicked “Pricing”',
      actionDetail: 'Returned to the pricing route',
      reasoningSummary: 'The user backtracked to a page that better matched the original intent.',
      confidence: 0.58,
      expectedOutcome: 'Compare plans and choose the cheapest paid option.',
      actualOutcome: 'Plan comparison required switching between similar-looking cards.',
      timeMs: 4200,
      tone: 'warning',
    },
    {
      page: 'pricing',
      pageLabel: 'Pricing',
      action: 'Backtracked to homepage',
      actionDetail: 'Used browser back after an unclear plan choice',
      reasoningSummary: 'The user could not tell which card matched the task with enough confidence.',
      confidence: 0.31,
      expectedOutcome: 'Find a clear next action.',
      actualOutcome: 'The user abandoned after a second interpretation of the same flow.',
      timeMs: 3700,
      tone: 'danger',
    },
  ])

const makePersonaResults = (): PersonaResult[] => {
  const completedIds = new Set(['p2', 'p3', 'p5', 'p6', 'p7', 'p9', 'p11', 'p14', 'p15'])
  const protectedIds = new Set(['p1', 'p10'])
  return personas.map((persona, index) => {
    const outcome: PersonaResult['outcome'] = completedIds.has(persona.id)
      ? 'completed'
      : protectedIds.has(persona.id)
        ? 'protected'
        : 'failed'
    const isLowConfidence = persona.id === 'p2' || persona.id === 'p9'
    const path = outcome === 'failed'
      ? ['Homepage', 'Get started', 'Products', 'Pricing', 'Homepage']
      : ['Homepage', 'Pricing', 'Starter plan', 'Signup boundary']
    const timeline = outcome === 'failed' ? failedTimeline(index % 2 === 0 ? 'cta' : 'plans') : completedTimeline(isLowConfidence)
    const steps = outcome === 'failed' ? 14 + (index % 4) : outcome === 'protected' ? 6 : 5 + (index % 3)
    return {
      ...persona,
      outcome,
      outcomeLabel: outcome === 'completed' ? 'Completed' : outcome === 'protected' ? 'Protected boundary' : 'Failed',
      steps,
      confidence: outcome === 'failed' ? 0.39 + (index % 3) * 0.04 : 0.71 + (index % 4) * 0.04,
      backtracks: outcome === 'failed' ? 2 + (index % 2) : index === 1 ? 1 : 0,
      duration: outcome === 'failed' ? (1 + (index % 2)) + 'm ' + (18 + index) + 's' : '0m ' + (28 + index * 3) + 's',
      path,
      primaryProblem:
        outcome === 'failed'
          ? '“Get started” opened a product-selection page, so the shortest path was not obvious.'
          : outcome === 'protected'
            ? 'Reached the signup boundary safely before any sensitive information was entered.'
            : isLowConfidence
              ? 'Plan differentiation was just clear enough, but required extra comparison.'
              : 'No meaningful friction detected on the successful path.',
      confidenceDrop: outcome === 'failed' ? 'Step 3 · 64% → 31%' : isLowConfidence ? 'Step 3 · 82% → 43%' : undefined,
      timeline,
    }
  })
}

const issues: FrictionIssue[] = [
  {
    id: 'issue-1',
    page: 'Homepage',
    title: '“Get started” creates the wrong expectation',
    description: 'The most prominent CTA opens product selection instead of the path users expected for choosing a plan.',
    usersAffected: 7,
    severity: 'High',
    severityTone: 'high',
    evidence: ['7 users followed the CTA expecting signup', '3 users backtracked to Pricing', '2 users abandoned after the detour'],
    recommendation: 'Rename it to “Explore products”, or route it directly to the plan-selection flow.',
  },
  {
    id: 'issue-2',
    page: 'Pricing',
    title: 'Paid plan differences need stronger hierarchy',
    description: 'Users had to switch between similar cards to tell which option was the cheapest paid plan for their goal.',
    usersAffected: 5,
    severity: 'Medium',
    severityTone: 'medium',
    evidence: ['Average confidence fell to 41% during comparison', '2 users toggled monthly / annual twice', '4 users reread the same feature row'],
    recommendation: 'Add a “best for” sentence and a clear paid-plan label above the feature comparison.',
  },
  {
    id: 'issue-3',
    page: 'Homepage',
    title: 'Pricing is visually secondary',
    description: 'The pricing route is available, but it competes with multiple marketing links and is easy to miss on a quick scan.',
    usersAffected: 4,
    severity: 'Medium',
    severityTone: 'medium',
    evidence: ['4 users scrolled before opening Pricing', '2 users searched Features first', 'Mobile-minded users missed the link on the first pass'],
    recommendation: 'Promote Pricing in the primary action group and repeat it near the first value proposition.',
  },
  {
    id: 'issue-4',
    page: 'Signup',
    title: 'Boundary state is reassuring but under-explained',
    description: 'The signup handoff is safe, but users do not get a clear signal that their selected plan carried through.',
    usersAffected: 3,
    severity: 'Low',
    severityTone: 'low',
    evidence: ['3 users paused on the plan summary', 'No user submitted sensitive information', 'Successful users still checked the plan name twice'],
    recommendation: 'Echo the selected plan and state what happens next before asking for account details.',
  },
]

const journeyNodes: JourneyNode[] = [
  { id: 'home', label: 'Homepage', meta: '100% · 15 users', x: 10, y: 48, tone: 'default' },
  { id: 'pricing', label: 'Pricing', meta: '73% · 11 users', x: 37, y: 27, tone: 'lime' },
  { id: 'products', label: 'Products', meta: '27% · 4 users', x: 37, y: 74, tone: 'orange' },
  { id: 'plan', label: 'Starter plan', meta: '60% · 9 users', x: 64, y: 27, tone: 'lime' },
  { id: 'back', label: 'Backtrack', meta: '20% · 3 users', x: 64, y: 75, tone: 'red' },
  { id: 'signup', label: 'Signup boundary', meta: '60% · 9 users', x: 88, y: 27, tone: 'lime' },
  { id: 'abandon', label: 'Abandoned', meta: '20% · 3 users', x: 88, y: 75, tone: 'red' },
]

const journeyEdges: JourneyEdge[] = [
  { from: 'home', to: 'pricing', label: '73%', tone: 'lime' },
  { from: 'home', to: 'products', label: '27%', tone: 'orange' },
  { from: 'pricing', to: 'plan', label: '82%', tone: 'lime' },
  { from: 'products', to: 'pricing', label: '75%', tone: 'orange' },
  { from: 'plan', to: 'signup', label: '100%', tone: 'lime' },
  { from: 'pricing', to: 'back', label: '18%', tone: 'red' },
  { from: 'back', to: 'abandon', label: '67%', tone: 'red' },
]

const screenshots: ScreenshotFrame[] = [
  { step: 1, page: 'Homepage', caption: 'Primary navigation and hero CTA', selected: 'Pricing', tone: 'neutral' },
  { step: 2, page: 'Pricing', caption: 'Plan comparison with monthly billing selected', selected: 'Starter', tone: 'warning' },
  { step: 3, page: 'Pricing', caption: 'Users pause on nearly identical plan labels', selected: 'Get started', tone: 'warning' },
  { step: 4, page: 'Signup', caption: 'Safe stopping point before account details', selected: 'Starter plan', tone: 'success' },
]

export function buildDemoReport(input: { website: string; task: string; personas?: number; maxSteps?: number; id?: string }): RunReport {
  const url = new URL(input.website)
  const personaResults = makePersonaResults().slice(0, Math.max(5, Math.min(input.personas ?? 15, 15)))
  const total = personaResults.length
  const completed = personaResults.filter((persona) => persona.outcome !== 'failed').length
  return {
    id: input.id ?? 'demo-run',
    status: 'complete',
    executionMode: 'preview',
    progress: 100,
    phase: 'Report ready',
    website: input.website,
    domain: url.hostname.replace(/^www\./, ''),
    task: input.task,
    createdAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    completedAt: new Date().toISOString(),
    personasCount: total,
    maxSteps: input.maxSteps ?? 30,
    metrics: {
      completed,
      total,
      completionRate: Math.round((completed / total) * 100),
      avgSteps: 9.8,
      successfulAvgSteps: 6.4,
      failedAvgSteps: 14.8,
      avgConfidence: 72,
      avgBacktracks: 1.2,
      biggestDropOff: 'Pricing → Plan selection',
      biggestDropOffCount: 5,
      sessionDuration: '6m 42s',
    },
    summary: 'Most users found the right neighborhood, but the first CTA sent a meaningful group down the wrong path.',
    summaryAccent: 'The fastest improvement is to align “Get started” with the expectation it creates.',
    issues,
    personas: personaResults,
    journeyNodes,
    journeyEdges,
    screenshots,
    bestPath: ['Homepage', 'Pricing', 'Starter plan', 'Signup boundary'],
    guardrailNote: 'Simulations stop at protected action boundaries. No account, payment, message, or destructive action is submitted.',
  }
}
