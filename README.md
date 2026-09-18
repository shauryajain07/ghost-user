# Ghost User

Ghost User is a full-stack AI UX simulation workspace. It lets a team submit a public website and a task, launches a run, then presents persona-level journeys, clustered friction, confidence drops, and safe stopping boundaries in a report.

## Run locally

    npm install
    cp .env.example .env
    # add your TypeSafe / Jev key to .env
    npm run dev

Open http://localhost:5173.

npm run dev starts the Vite client and the Express API together. The API listens on port 8787; the Vite dev server proxies /api requests to it.

## Structure

- src/App.tsx — workspace shell, new-test form, progress state, report tabs, journey map, screenshot timeline, findings, and persona views.
- src/styles.css — responsive dark workspace UI with the Ghost User visual system.
- server/index.ts — URL/task validation, run lifecycle, polling endpoints, and protected-boundary cancellation.
- server/types.ts — shared simulation contracts including PageState, BrowserAction, Persona, and AgentStep.
- server/simulation/fixtures.ts — clearly labeled sample report used by the sample-report button.
- server/simulation/jev-agent.ts — server-side JEV (TypeSafe System One) decision loop. It receives the goal, persona context, structured page state, and recent actions, then returns one typed next action.
- server/simulation/live.ts — live multi-persona Playwright runner, isolated sessions, screenshot capture, journey aggregation, and evidence-backed issue clustering.

The browser-facing contracts keep JEV reasoning separate from execution: JEV receives only a compact structured snapshot, chooses one typed action, Ghost User validates the action, and Playwright executes it. Live runs use isolated Playwright contexts with click, type, select, scroll, back, forward, reload, Enter, wait, and tab actions. Safe mode blocks sensitive inputs and destructive boundaries in code even if the model suggests them. Full action mode is opt-in, requires an explicit UI confirmation, `GHOST_USER_ALLOW_PROTECTED_ACTIONS=1`, and a host listed in `GHOST_USER_PROTECTED_HOSTS`; protected actions are audit-logged with sensitive values redacted. The sample-report button remains fixture-backed so it works without opening an external site.

The microphone is intentionally not part of this integration. The task text in the Ghost User form is the agent instruction, while the JEV model performs the same typed perception-and-action decision loop from the referenced voice-browser project.

Live runs use hidden browser sessions by default and mirror each persona's latest viewport frame, status, and action in the run modal's live agent stream. Headless runs process several isolated personas concurrently. Set `GHOST_USER_HEADLESS=0` in `.env` only when you explicitly want a visible Chrome session; restart the API after changing it.
