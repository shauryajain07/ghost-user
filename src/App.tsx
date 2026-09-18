import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  Ghost,
  Globe2,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  Users,
  X,
  Zap,
} from 'lucide-react'
import type { FrictionIssue, PersonaResult, RunReport, RunStatus, ScreenshotFrame } from '../server/types'

type View = 'new' | 'report' | 'reports'
type ReportTab = 'overview' | 'journeys' | 'friction' | 'personas'

const sampleRuns = [
  {
    domain: 'acmecloud.dev',
    task: 'Find the cheapest paid plan and start signing up for it.',
    time: '34 min ago',
    result: '80%',
    status: 'Ready',
    tone: 'ready',
  },
  {
    domain: 'northstar.app',
    task: 'Find the API documentation and locate the authentication guide.',
    time: 'Yesterday',
    result: '93%',
    status: 'Ready',
    tone: 'ready',
  },
  {
    domain: 'relaystudio.co',
    task: 'Book a product demo with the sales team.',
    time: 'Sep 15, 2026',
    result: '61%',
    status: 'Needs attention',
    tone: 'attention',
  },
]

const navItems = [
  { id: 'new' as const, label: 'New test', icon: Plus },
  { id: 'reports' as const, label: 'Reports', icon: BarChart3 },
]

const formatStatus = (status: RunStatus) => {
  if (status === 'complete') return 'Report ready'
  if (status === 'failed') return 'Run stopped'
  if (status === 'queued') return 'Queued'
  return 'Simulating'
}

function App() {
  const [view, setView] = useState<View>('new')
  const [report, setReport] = useState<RunReport | null>(null)
  const [runStatus, setRunStatus] = useState<RunReport | null>(null)
  const [activeTab, setActiveTab] = useState<ReportTab>('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({
    website: 'https://acmecloud.dev',
    task: 'Find the cheapest paid plan and start signing up for it.',
    personas: 15,
  })

  useEffect(() => {
    if (!runStatus || (runStatus.status !== 'queued' && runStatus.status !== 'running')) return
    const poll = window.setInterval(async () => {
      try {
        const response = await fetch('/api/runs/' + runStatus.id)
        if (!response.ok) return
        const next = (await response.json()) as RunReport
        setRunStatus(next)
        if (next.status === 'complete') {
          setReport(next)
          setView('report')
        }
      } catch {
        // The current run remains visible while the server is temporarily unavailable.
      }
    }, 600)
    return () => window.clearInterval(poll)
  }, [runStatus?.id, runStatus?.status])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  const isRunning = runStatus && (runStatus.status === 'queued' || runStatus.status === 'running')

  const openDemoReport = async () => {
    setLoadingDemo(true)
    try {
      const response = await fetch('/api/runs/demo')
      const next = (await response.json()) as RunReport
      setReport(next)
      setActiveTab('overview')
      setView('report')
    } finally {
      setLoadingDemo(false)
    }
  }

  const startRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = (await response.json()) as RunReport & { error?: string }
      if (!response.ok) {
        setFormError(payload.error || 'Could not start the run.')
        return
      }
      setRunStatus(payload)
    } catch {
      setFormError('The Ghost User API is not reachable. Start the app with npm run dev and try again.')
    }
  }

  const navigate = (nextView: View) => {
    setView(nextView)
    setMobileNavOpen(false)
    if (nextView === 'new') {
      setRunStatus(null)
      setFormError('')
    }
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={navigate} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <main className="main-shell">
        <Topbar
          view={view}
          domain={report?.domain}
          onMenu={() => setMobileNavOpen(true)}
          onNewTest={() => navigate('new')}
          onReports={() => navigate('reports')}
        />
        {view === 'new' && (
          <NewTestPage
            form={form}
            error={formError}
            onChange={setForm}
            onSubmit={startRun}
            onViewDemo={openDemoReport}
            loadingDemo={loadingDemo}
          />
        )}
        {view === 'reports' && <ReportsPage onViewReport={openDemoReport} onNewTest={() => navigate('new')} />}
        {view === 'report' && report && (
          <ReportPage
            report={report}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onNewTest={() => navigate('new')}
          />
        )}
      </main>
      {isRunning && runStatus && (
        <RunProgressModal
          run={runStatus}
          onCancel={async () => {
            await fetch('/api/runs/' + runStatus.id + '/cancel', { method: 'POST' })
            setRunStatus(null)
          }}
        />
      )}
    </div>
  )
}

function Sidebar({
  view,
  onNavigate,
  mobileOpen,
  onClose,
}: {
  view: View
  onNavigate: (view: View) => void
  mobileOpen: boolean
  onClose: () => void
}) {
  return (
    <>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={'sidebar ' + (mobileOpen ? 'sidebar-open' : '')}>
        <div className="brand-lockup">
          <div className="brand-mark"><Ghost size={19} strokeWidth={2.4} /></div>
          <span>ghost user</span>
          <span className="brand-beta">beta</span>
          <button className="mobile-close" onClick={onClose} aria-label="Close navigation"><X size={16} /></button>
        </div>
        <div className="workspace-switcher">
          <div className="workspace-avatar">G</div>
          <div>
            <span className="workspace-name">Ghost User</span>
            <span className="workspace-label">Personal workspace</span>
          </div>
          <ChevronDown size={15} className="muted-icon" />
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <span className="nav-section-label">Workspace</span>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = view === item.id || (view === 'report' && item.id === 'reports')
            return (
              <button
                key={item.id}
                className={'nav-item ' + (active ? 'nav-item-active' : '')}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
                {item.id === 'reports' && <span className="nav-count">3</span>}
              </button>
            )
          })}
          <span className="nav-section-label nav-section-spaced">Learn</span>
          <button className="nav-item" onClick={() => window.open('https://github.com', '_blank')}>
            <CircleHelp size={17} />
            <span>How it works</span>
            <ExternalLink size={13} className="nav-external" />
          </button>
          <button className="nav-item" onClick={() => window.open('https://github.com', '_blank')}>
            <FileText size={17} />
            <span>Docs</span>
            <ExternalLink size={13} className="nav-external" />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-heading"><span>Monthly runs</span><span>12 / 50</span></div>
            <div className="usage-track"><div className="usage-fill" /></div>
            <span className="usage-caption">38 runs left this cycle</span>
          </div>
          <button className="nav-item muted-nav"><Settings2 size={17} /><span>Settings</span></button>
          <div className="account-row">
            <div className="account-avatar">SJ</div>
            <div className="account-details"><span>Shaurya Jain</span><span>Free plan</span></div>
            <MoreHorizontal size={17} className="muted-icon" />
          </div>
        </div>
      </aside>
    </>
  )
}

function Topbar({
  view,
  domain,
  onMenu,
  onNewTest,
  onReports,
}: {
  view: View
  domain?: string
  onMenu: () => void
  onNewTest: () => void
  onReports: () => void
}) {
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button>
      <div className="breadcrumbs">
        <span className="crumb-muted">Workspace</span>
        <span className="crumb-separator">/</span>
        <span>{view === 'new' ? 'New test' : view === 'reports' ? 'Reports' : domain || 'Report'}</span>
      </div>
      <div className="topbar-actions">
        <span className="live-status"><span className="live-dot" /> All systems operational</span>
        <button className="topbar-icon-button" aria-label="Help"><CircleHelp size={17} /></button>
        {view !== 'reports' && (
          <button className="topbar-secondary-button" onClick={onReports}><BarChart3 size={15} /> Reports</button>
        )}
        <button className="topbar-primary-button" onClick={onNewTest}><Plus size={16} /> New test</button>
      </div>
    </header>
  )
}

function NewTestPage({
  form,
  error,
  onChange,
  onSubmit,
  onViewDemo,
  loadingDemo,
}: {
  form: { website: string; task: string; personas: number }
  error: string
  onChange: (form: { website: string; task: string; personas: number }) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onViewDemo: () => void
  loadingDemo: boolean
}) {
  return (
    <div className="page-content new-test-page">
      <div className="page-intro">
        <div className="eyebrow"><span className="eyebrow-mark" /> AI user experience lab <span className="eyebrow-line" /> <span>New simulation</span></div>
        <div className="intro-grid">
          <div>
            <h1>See your site through <span>15 unfamiliar eyes.</span></h1>
            <p className="intro-copy">Ghost User puts realistic AI personas in front of your website, then shows you the exact moments they hesitate, backtrack, and give up.</p>
          </div>
          <div className="intro-aside">
            <div className="aside-orbit"><Radar size={19} /><span>One task</span><strong>15 paths</strong><span>honest signal</span></div>
            <p>Run a test before confusion becomes a support ticket.</p>
          </div>
        </div>
      </div>

      <div className="new-test-grid">
        <form className="test-form-card panel" onSubmit={onSubmit}>
          <div className="card-heading-row">
            <div>
              <span className="card-kicker">01 / SETUP</span>
              <h2>Give them a job to do</h2>
            </div>
            <span className="secure-pill"><LockKeyhole size={12} /> Safe by default</span>
          </div>
          <div className="form-fields">
            <label className="field-label" htmlFor="website">Website URL <span>Public pages only</span></label>
            <div className="input-shell url-input">
              <Globe2 size={17} />
              <input
                id="website"
                type="url"
                value={form.website}
                onChange={(event) => onChange({ ...form, website: event.target.value })}
                placeholder="https://yourwebsite.com"
                required
              />
              <span className="input-valid"><Check size={13} /> Valid URL</span>
            </div>
            <label className="field-label" htmlFor="task">Task <span>What should the user accomplish?</span></label>
            <div className="textarea-shell">
              <Target size={17} />
              <textarea
                id="task"
                value={form.task}
                onChange={(event) => onChange({ ...form, task: event.target.value })}
                placeholder="e.g. Find the cheapest paid plan and start signing up for it."
                rows={3}
                required
              />
              <span className="character-count">{form.task.length}/240</span>
            </div>
          </div>
          <div className="form-options">
            <div className="option-block">
              <span className="field-label">AI users <span>Default recommended</span></span>
              <div className="persona-selector">
                {[10, 15].map((count) => (
                  <button
                    type="button"
                    key={count}
                    className={form.personas === count ? 'persona-option selected' : 'persona-option'}
                    onClick={() => onChange({ ...form, personas: count })}
                  >
                    <Users size={14} /> {count}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-block run-limit">
              <span className="field-label">Session limit <span>Per user</span></span>
              <div className="limit-value"><Clock3 size={14} /> 30 steps <ChevronDown size={14} /></div>
            </div>
          </div>
          {error && <div className="form-error"><TriangleAlert size={16} /> {error}</div>}
          <div className="form-submit-row">
            <span className="form-footnote"><ShieldCheck size={14} /> Stops before signup, payment, or destructive actions.</span>
            <button className="run-button" type="submit"><Play size={16} fill="currentColor" /> Run user test <ArrowRight size={16} /></button>
          </div>
        </form>

        <div className="setup-side">
          <div className="what-card panel">
            <div className="card-heading-row compact">
              <span className="card-kicker">02 / WHAT YOU’LL GET</span>
              <Sparkles size={17} className="lime-icon" />
            </div>
            <div className="promise-list">
              <PromiseRow icon={<Eye size={17} />} title="Real user paths" text="Every persona chooses their own next step." />
              <PromiseRow icon={<TriangleAlert size={17} />} title="Friction, clustered" text="Repeated confusion becomes one actionable issue." />
              <PromiseRow icon={<Lightbulb size={17} />} title="Evidence, not vibes" text="See the page, the pause, and the recommended fix." />
            </div>
          </div>
          <div className="sample-card">
            <div className="sample-glow" />
            <div className="sample-topline"><span className="sample-badge">TRY A SAMPLE</span><span>2 min</span></div>
            <h3>See a finished report</h3>
            <p>Explore a sample run on Acme Cloud and see what a clear signal looks like.</p>
            <button className="sample-link" onClick={onViewDemo} disabled={loadingDemo}>
              {loadingDemo ? <Loader2 size={15} className="spin" /> : <ArrowRight size={15} />} View sample report
            </button>
          </div>
        </div>
      </div>

      <section className="recent-section">
        <div className="section-heading-row">
          <div><span className="card-kicker">RECENT RUNS</span><h2>Keep an eye on your most important flows.</h2></div>
          <button className="text-button" onClick={onViewDemo}>View all reports <ArrowRight size={14} /></button>
        </div>
        <div className="recent-table panel">
          <div className="recent-table-head"><span>Website</span><span>Task</span><span>Run</span><span>Result</span><span /></div>
          {sampleRuns.map((run) => (
            <button className="recent-row" key={run.domain} onClick={onViewDemo}>
              <span className="website-cell"><span className="site-favicon">{run.domain.slice(0, 1).toUpperCase()}</span>{run.domain}</span>
              <span className="task-cell">{run.task}</span>
              <span className="time-cell">{run.time}</span>
              <span className="result-cell"><span className={'result-dot ' + run.tone} />{run.result} <small>{run.status}</small></span>
              <ArrowRight size={16} className="row-arrow" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function PromiseRow({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="promise-row"><div className="promise-icon">{icon}</div><div><strong>{title}</strong><span>{text}</span></div><Check size={15} className="promise-check" /></div>
}

function RunProgressModal({ run, onCancel }: { run: RunReport; onCancel: () => void }) {
  return (
    <div className="modal-scrim">
      <div className="progress-modal panel">
        <div className="progress-modal-top"><div className="modal-live"><span className="live-dot" /> LIVE JEV SIMULATION</div><button className="icon-button" onClick={onCancel} aria-label="Cancel run"><X size={18} /></button></div>
        <div className="progress-orb"><div className="orb-core"><Ghost size={26} /></div><div className="orb-ring ring-one" /><div className="orb-ring ring-two" /></div>
        <span className="card-kicker">{run.personasCount} AI USERS ARE EXPLORING</span>
        <h2>Watching them find their way.</h2>
        <p className="progress-copy">Each persona is navigating in an isolated session. They can click, type, scroll, change their mind, and stop when the path no longer makes sense.</p>
        <div className="progress-status-row"><span><span className="status-pulse" /> {run.phase}</span><strong>{run.progress}%</strong></div>
        <div className="progress-track"><div className="progress-fill" style={{ width: run.progress + '%' }} /></div>
        <div className="progress-steps">
          <ProgressStep label="Prepare personas" done={run.progress > 14} active={run.progress <= 14} />
          <ProgressStep label="Run browser sessions" done={run.progress > 53} active={run.progress > 29 && run.progress <= 53} />
          <ProgressStep label="Cluster friction" done={run.progress > 91} active={run.progress > 75 && run.progress <= 91} />
          <ProgressStep label="Write report" done={false} active={run.progress > 91} />
        </div>
        <button className="cancel-button" onClick={onCancel}>Stop simulation</button>
      </div>
    </div>
  )
}

function ProgressStep({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return <div className={'progress-step ' + (done ? 'done' : '') + (active ? ' active' : '')}><span>{done ? <Check size={12} /> : active ? <span className="mini-dot" /> : ''}</span>{label}</div>
}

function ReportsPage({ onViewReport, onNewTest }: { onViewReport: () => void; onNewTest: () => void }) {
  return (
    <div className="page-content reports-page">
      <div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-mark" /> Workspace / Reports</div><h1>Your user tests.</h1><p>Every run becomes a clearer picture of where people get lost.</p></div><button className="run-button" onClick={onNewTest}><Plus size={16} /> New test</button></div>
      <div className="report-summary-strip">
        <div><span>Total simulations</span><strong>12</strong><small>+3 this month</small></div>
        <div><span>Avg. completion rate</span><strong>78%</strong><small className="positive">↑ 8% vs last month</small></div>
        <div><span>Open issues</span><strong>14</strong><small className="warning-text">3 high priority</small></div>
        <div><span>Users simulated</span><strong>180</strong><small>Across 12 flows</small></div>
      </div>
      <div className="reports-toolbar"><div className="search-shell"><Search size={16} /><input placeholder="Search websites or tasks" /></div><button className="filter-button">All statuses <ChevronDown size={15} /></button><button className="filter-button">Newest first <ChevronDown size={15} /></button></div>
      <div className="reports-list panel">
        <div className="reports-list-head"><span>Website / task</span><span>Users</span><span>Completion</span><span>Created</span><span>Status</span><span /></div>
        {sampleRuns.concat([
          { domain: 'lumahealth.io', task: 'Find the cancellation policy.', time: 'Sep 11, 2026', result: '88%', status: 'Ready', tone: 'ready' },
        ]).map((run) => (
          <button className="report-list-row" key={run.domain} onClick={onViewReport}>
            <span className="report-name-cell"><span className="site-favicon">{run.domain.slice(0, 1).toUpperCase()}</span><span><strong>{run.domain}</strong><small>{run.task}</small></span></span>
            <span className="users-cell">15 <small>personas</small></span>
            <span className="completion-cell"><span className="mini-bar"><span style={{ width: run.result }} /></span><strong>{run.result}</strong></span>
            <span className="date-cell">{run.time}</span>
            <span className={'status-pill ' + run.tone}>{run.status}</span>
            <ArrowRight size={16} className="row-arrow" />
          </button>
        ))}
      </div>
    </div>
  )
}

function ReportPage({
  report,
  activeTab,
  onTabChange,
  onNewTest,
}: {
  report: RunReport
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
  onNewTest: () => void
}) {
  const reportLabel = report.executionMode === 'live' ? 'Live JEV report' : report.executionMode === 'fallback' ? 'Preview fallback' : 'Sample preview'
  const tabItems: Array<{ id: ReportTab; label: string; count?: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'journeys', label: 'User journeys' },
    { id: 'friction', label: 'Friction map', count: String(report.issues.length) },
    { id: 'personas', label: 'Personas', count: String(report.personasCount) },
  ]
  return (
    <div className="page-content report-page">
      <div className="report-header">
        <div>
          <button className="back-link" onClick={onNewTest}><ArrowLeft size={15} /> New test</button>
          <div className="report-domain-row"><span className="site-favicon large">{report.domain.slice(0, 1).toUpperCase()}</span><span>{report.domain}</span><span className={'report-status ' + report.executionMode}><span className="result-dot ready" /> {reportLabel}</span></div>
          <h1>{report.task}</h1>
          <div className="report-meta"><span><Globe2 size={14} /> {report.website}</span><span><Clock3 size={14} /> Ran 34 minutes ago</span><span><Users size={14} /> {report.personasCount} personas</span></div>
        </div>
        <div className="report-header-actions"><button className="outline-button"><Download size={15} /> Export report</button><button className="icon-button bordered" aria-label="More actions"><MoreHorizontal size={18} /></button></div>
      </div>
      <div className="report-tabs" role="tablist">
        {tabItems.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'report-tab active' : 'report-tab'} onClick={() => onTabChange(tab.id)}>{tab.label}{tab.count && <span>{tab.count}</span>}</button>)}
      </div>
      {activeTab === 'overview' && <OverviewTab report={report} onTabChange={onTabChange} />}
      {activeTab === 'journeys' && <JourneysTab report={report} />}
      {activeTab === 'friction' && <FrictionTab report={report} />}
      {activeTab === 'personas' && <PersonasTab report={report} />}
    </div>
  )
}

function OverviewTab({ report, onTabChange }: { report: RunReport; onTabChange: (tab: ReportTab) => void }) {
  const [selectedIssue, setSelectedIssue] = useState(report.issues[0])
  return (
    <>
      <div className="report-summary-banner panel">
        <div className="summary-icon"><Sparkles size={19} /></div>
        <div><span className="card-kicker">{report.executionMode === 'live' ? 'LIVE JEV EXECUTIVE SUMMARY' : 'AI EXECUTIVE SUMMARY'}</span><p>{report.summary} <strong>{report.summaryAccent}</strong></p>{report.errorMessage && <span className="fallback-warning"><TriangleAlert size={13} /> {report.errorMessage}</span>}</div>
        <button className="summary-link" onClick={() => onTabChange('friction')}>See all findings <ArrowRight size={15} /></button>
      </div>
      <section className="metrics-grid">
        <MetricCard label="Task completion" value={report.metrics.completionRate + '%'} detail={report.metrics.completed + ' / ' + report.metrics.total + ' users completed'} tone="lime" visual={<CompletionRing rate={report.metrics.completionRate} />} />
        <MetricCard label="Avg. steps" value={report.metrics.avgSteps.toString()} detail={'Success ' + report.metrics.successfulAvgSteps + ' · Failed ' + report.metrics.failedAvgSteps} tone="neutral" visual={<MiniBarChart />} />
        <MetricCard label="Avg. confidence" value={report.metrics.avgConfidence + '%'} detail="Across all decisions" tone="blue" visual={<ConfidenceGauge value={report.metrics.avgConfidence} />} />
        <MetricCard label="Avg. backtracks" value={report.metrics.avgBacktracks.toString()} detail="Per simulated user" tone="orange" visual={<BacktrackVisual />} />
      </section>
      <div className="overview-grid">
        <section className="section-block journey-block">
          <div className="section-heading-row">
            <div><span className="card-kicker">PATH ANALYSIS</span><h2>How users found their way.</h2><p>The most common routes through the task, including where intent changed.</p></div>
            <button className="text-button" onClick={() => onTabChange('journeys')}>Open journey map <ArrowRight size={14} /></button>
          </div>
          <JourneyMap report={report} compact />
        </section>
        <section className="section-block dropoff-block">
          <div className="section-heading-row"><div><span className="card-kicker">BIGGEST DROP-OFF</span><h2>Pricing → Plan selection</h2></div><TriangleAlert size={18} className="orange-icon" /></div>
          <div className="dropoff-number"><strong>{report.metrics.biggestDropOffCount}</strong><span>of {report.metrics.total} users struggled here</span></div>
          <div className="dropoff-visual"><div className="dropoff-line"><span className="dropoff-node filled" /><span className="dropoff-connector" /><span className="dropoff-node warning" /><span className="dropoff-connector faded" /><span className="dropoff-node empty" /></div><div className="dropoff-labels"><span>Pricing</span><span>Plan choice</span><span>Signup</span></div></div>
          <p className="block-note">Users understood where to look, but hesitated when the plan cards asked them to make a choice.</p>
          <button className="issue-preview" onClick={() => { setSelectedIssue(report.issues[1]); onTabChange('friction') }}><span className="issue-mini-icon"><Lightbulb size={14} /></span><span><strong>Plan differentiation needs stronger hierarchy</strong><small>Medium severity · 5 users affected</small></span><ArrowRight size={15} /></button>
        </section>
      </div>
      <section className="section-block friction-overview">
        <div className="section-heading-row"><div><span className="card-kicker">WHERE USERS STRUGGLED</span><h2>Four patterns worth fixing.</h2><p>Repeated behaviour across personas, clustered into actionable findings.</p></div><button className="text-button" onClick={() => onTabChange('friction')}>View friction map <ArrowRight size={14} /></button></div>
        <div className="friction-table panel">
          <div className="friction-table-head"><span>Page</span><span>Finding</span><span>Users affected</span><span>Severity</span><span /></div>
          {report.issues.map((issue) => <FrictionRow key={issue.id} issue={issue} onClick={() => { setSelectedIssue(issue); onTabChange('friction') }} />)}
        </div>
      </section>
      <section className="section-block personas-preview">
        <div className="section-heading-row"><div><span className="card-kicker">PERSONA SIGNAL</span><h2>Different people, same moment of doubt.</h2><p>Preview the users behind the aggregate score.</p></div><button className="text-button" onClick={() => onTabChange('personas')}>Browse all personas <ArrowRight size={14} /></button></div>
        <PersonaStrip personas={report.personas.slice(0, 8)} />
      </section>
      <div className="guardrail-banner"><ShieldCheck size={17} /><span>{report.guardrailNote}</span></div>
    </>
  )
}

function MetricCard({ label, value, detail, tone, visual }: { label: string; value: string; detail: string; tone: string; visual: ReactNode }) {
  return <div className={'metric-card panel ' + tone}><div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></div><div className="metric-visual">{visual}</div></div>
}

function CompletionRing({ rate }: { rate: number }) {
  return <div className="completion-ring" style={{ '--completion': rate * 3.6 + 'deg' } as CSSProperties}><div><strong>{rate}</strong><span>%</span></div></div>
}

function MiniBarChart() {
  return <div className="mini-bars">{[34, 48, 43, 68, 55, 82, 72, 92].map((height, index) => <span key={index} style={{ height: height + '%' }} />)}</div>
}

function ConfidenceGauge({ value }: { value: number }) {
  return <div className="confidence-gauge"><div className="gauge-track"><span style={{ transform: 'rotate(' + (value * 1.8 - 90) + 'deg)' }} /></div><div className="gauge-label"><Gauge size={15} /><span>steady</span></div></div>
}

function BacktrackVisual() {
  return <div className="backtrack-visual"><span /><span /><span /><ArrowLeft size={15} /><span className="backtrack-dash" /></div>
}

function JourneyMap({ report, compact = false }: { report: RunReport; compact?: boolean }) {
  const nodeById = useMemo(() => new Map(report.journeyNodes.map((node) => [node.id, node])), [report.journeyNodes])
  return (
    <div className={'journey-map ' + (compact ? 'journey-map-compact' : '')}>
      <svg className="journey-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="arrow-lime" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="#c7ff55" /></marker>
          <marker id="arrow-orange" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="#ffb46f" /></marker>
          <marker id="arrow-red" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="#ff7777" /></marker>
        </defs>
        {report.journeyEdges.map((edge) => {
          const from = nodeById.get(edge.from)
          const to = nodeById.get(edge.to)
          if (!from || !to) return null
          const curve = Math.abs(to.y - from.y) > 20 ? (from.y < to.y ? 13 : -13) : 0
          return <g key={edge.from + edge.to}><path className={'journey-edge ' + edge.tone} d={'M ' + from.x + ' ' + from.y + ' C ' + (from.x + 12) + ' ' + (from.y + curve) + ' ' + (to.x - 12) + ' ' + (to.y - curve) + ' ' + to.x + ' ' + to.y} markerEnd={'url(#arrow-' + (edge.tone === 'default' ? 'lime' : edge.tone) + ')'} /><text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 3} className={'journey-edge-label ' + edge.tone}>{edge.label}</text></g>
        })}
      </svg>
      {report.journeyNodes.map((node) => <div key={node.id} className={'journey-node ' + node.tone} style={{ left: node.x + '%', top: node.y + '%', transform: node.x < 20 ? 'translate(0, -50%)' : node.x > 80 ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)' }}><span className="journey-node-dot" /><strong>{node.label}</strong><small>{node.meta}</small></div>)}
      <div className="journey-legend"><span><i className="legend-dot lime" />Successful path</span><span><i className="legend-dot orange" />Detour</span><span><i className="legend-dot red" />Drop-off</span></div>
    </div>
  )
}

function FrictionRow({ issue, onClick }: { issue: FrictionIssue; onClick: () => void }) {
  return <button className="friction-row" onClick={onClick}><span className="page-chip">{issue.page}</span><span className="finding-cell"><strong>{issue.title}</strong><small>{issue.description}</small></span><span className="affected-cell"><strong>{issue.usersAffected} / 15</strong><span className="affected-bar"><i style={{ width: issue.usersAffected / 15 * 100 + '%' }} /></span></span><span className={'severity-pill ' + issue.severityTone}><i />{issue.severity}</span><ArrowRight size={15} className="row-arrow" /></button>
}

function PersonaStrip({ personas }: { personas: PersonaResult[] }) {
  return <div className="persona-strip">{personas.map((persona) => <div className="persona-mini" key={persona.id}><div className="persona-avatar" style={{ background: persona.color }}>{persona.initials}</div><span>{persona.name}</span><small className={persona.outcome === 'failed' ? 'failed-text' : 'success-text'}>{persona.outcomeLabel}</small></div>)}</div>
}

function JourneysTab({ report }: { report: RunReport }) {
  const successfulRoutes = report.personas.filter((persona) => persona.outcome !== 'failed').length
  return <div className="tab-content"><section className="section-block"><div className="section-heading-row"><div><span className="card-kicker">NAVIGATION TRACE</span><h2>Every route is a signal.</h2><p>Where users went, where intent changed, and which path got them to the boundary.</p></div><div className="journey-stat"><strong>{successfulRoutes}</strong><span>successful routes</span></div></div><JourneyMap report={report} /></section><ScreenshotTimeline screenshots={report.screenshots} /></div>
}

function ScreenshotTimeline({ screenshots }: { screenshots: ScreenshotFrame[] }) {
  const [selected, setSelected] = useState(0)
  const frame = screenshots[selected]
  return <section className="section-block screenshot-section"><div className="section-heading-row"><div><span className="card-kicker">SCREENSHOT TIMELINE</span><h2>See the moment they hesitated.</h2><p>Each frame is captured from a user session, with their selected element called out.</p></div><span className="capture-label"><span className="live-dot" /> {frame.src ? 'Live capture' : 'Preview capture'}</span></div><div className="screenshot-layout"><div className="browser-preview"><div className="browser-top"><span /><span /><span /><small>{frame.page.toLowerCase()}.acmecloud.dev</small></div><div className="browser-page">{frame.src && <img className="actual-screenshot" src={frame.src} alt={frame.caption} />}<div className="preview-nav"><span className="preview-logo">acme</span><span>Product</span><span className={frame.page === 'Pricing' ? 'preview-selected' : ''}>Pricing</span><span>Resources</span><button>Get started</button></div><div className="preview-body"><div className="preview-title-line" /><div className="preview-title-line short" /><div className="preview-copy-lines"><span /><span /><span /></div><div className="preview-cards"><div className={frame.selected === 'Starter' ? 'preview-card selected' : 'preview-card'}><span className="preview-card-title">Starter</span><strong>$19</strong><span className="preview-card-line" /><span className="preview-card-line short" /><button>Start free trial</button></div><div className="preview-card"><span className="preview-card-title">Pro</span><strong>$49</strong><span className="preview-card-line" /><span className="preview-card-line short" /><button>Compare plan</button></div><div className="preview-card faded"><span className="preview-card-title">Scale</span><strong>$99</strong><span className="preview-card-line" /><span className="preview-card-line short" /></div></div></div>{frame.selected && <div className={'selection-callout ' + frame.tone}><span className="callout-line" /><span><Eye size={12} /> Selected: {frame.selected}</span></div>}</div></div><div className="screenshot-steps">{screenshots.map((item, index) => <button key={item.step} className={'screenshot-step ' + (selected === index ? 'selected' : '')} onClick={() => setSelected(index)}><span className="step-number">{String(item.step).padStart(2, '0')}</span><span><strong>{item.page}</strong><small>{item.caption}</small></span><span className={'step-state ' + item.tone}>{item.tone === 'success' ? <Check size={13} /> : <TriangleAlert size={13} />}</span></button>)}</div></div></section>
}

function FrictionTab({ report }: { report: RunReport }) {
  const [selected, setSelected] = useState(report.issues[0])
  return <div className="tab-content"><div className="friction-tab-grid"><section className="section-block"><div className="section-heading-row"><div><span className="card-kicker">ISSUE CLUSTERS</span><h2>Where users struggled.</h2><p>Similar behaviour grouped into one fixable pattern.</p></div><span className="issue-count-badge">{report.issues.length} findings</span></div><div className="friction-stack">{report.issues.map((issue) => <button key={issue.id} className={'friction-card ' + (selected.id === issue.id ? 'selected' : '')} onClick={() => setSelected(issue)}><div className={'issue-number ' + issue.severityTone}>0{report.issues.indexOf(issue) + 1}</div><div className="friction-card-copy"><div className="friction-card-topline"><span>{issue.page}</span><span className={'severity-pill ' + issue.severityTone}><i />{issue.severity}</span></div><h3>{issue.title}</h3><p>{issue.description}</p><div className="friction-card-bottom"><strong>{issue.usersAffected} <small>users affected</small></strong><span>View evidence <ArrowRight size={14} /></span></div></div></button>)}</div></section><IssueDetail issue={selected} /></div></div>
}

function IssueDetail({ issue }: { issue: FrictionIssue }) {
  return <aside className="issue-detail panel"><div className="detail-top"><span className="card-kicker">FINDING DETAIL</span><span className={'severity-pill ' + issue.severityTone}><i />{issue.severity}</span></div><span className="detail-page">{issue.page} / observation cluster</span><h2>{issue.title}</h2><p>{issue.description}</p><div className="detail-stat"><strong>{issue.usersAffected}<span>/15</span></strong><span>users affected</span><div className="detail-stat-bar"><i style={{ width: issue.usersAffected / 15 * 100 + '%' }} /></div></div><div className="detail-section"><span className="detail-label">Evidence from sessions</span>{issue.evidence.map((evidence) => <div className="evidence-row" key={evidence}><Check size={14} />{evidence}</div>)}</div><div className="recommendation-box"><div className="recommendation-icon"><Lightbulb size={16} /></div><div><span className="detail-label">Suggested fix</span><p>{issue.recommendation}</p></div></div><button className="detail-action">Create issue in Linear <ExternalLink size={14} /></button></aside>
}

function PersonasTab({ report }: { report: RunReport }) {
  const [selected, setSelected] = useState(report.personas[0])
  const completedCount = report.personas.filter((persona) => persona.outcome !== 'failed').length
  const failedCount = report.personas.filter((persona) => persona.outcome === 'failed').length
  return <div className="tab-content personas-tab"><section className="section-block"><div className="section-heading-row"><div><span className="card-kicker">{report.personasCount} SIMULATED USERS</span><h2>Different minds. One task.</h2><p>Each persona carries a distinct tolerance for ambiguity, risk, and exploration.</p></div><div className="persona-filter"><button className="active">All <span>{report.personasCount}</span></button><button>Completed <span>{completedCount}</span></button><button>Failed <span>{failedCount}</span></button></div></div><div className="persona-grid">{report.personas.map((persona) => <button className={'persona-card ' + (selected.id === persona.id ? 'selected' : '')} key={persona.id} onClick={() => setSelected(persona)}><div className="persona-card-top"><div className="persona-avatar large" style={{ background: persona.color }}>{persona.initials}</div><span className={'outcome-indicator ' + persona.outcome}><i />{persona.outcomeLabel}</span></div><h3>{persona.name}</h3><p>{persona.description}</p><div className="persona-card-stats"><span><strong>{persona.steps}</strong> steps</span><span><strong>{Math.round(persona.confidence * 100)}%</strong> confidence</span><span><strong>{persona.backtracks}</strong> backtracks</span></div></button>)}</div></section><PersonaDetail persona={selected} /></div>
}

function PersonaDetail({ persona }: { persona: PersonaResult }) {
  return <section className="persona-detail panel"><div className="persona-detail-header"><div className="persona-avatar large" style={{ background: persona.color }}>{persona.initials}</div><div><span className="card-kicker">SELECTED PERSONA</span><h2>{persona.name}</h2><p>{persona.description}</p></div><span className={'outcome-indicator ' + persona.outcome}><i />{persona.outcomeLabel}</span></div><div className="persona-detail-grid"><div><span className="detail-label">Journey</span><div className="persona-path">{persona.path.map((path, index) => <span key={path}><b>{index + 1}</b>{path}{index < persona.path.length - 1 && <ArrowRight size={13} />}</span>)}</div></div><div><span className="detail-label">Primary signal</span><p className="persona-problem">{persona.primaryProblem}</p>{persona.confidenceDrop && <span className="confidence-drop"><TriangleAlert size={13} /> {persona.confidenceDrop}</span>}</div></div></section>
}

export default App
