import { useSearchParams } from "@solidjs/router"
import {
  batch,
  createEffect,
  createMemo,
  createResource,
  ErrorBoundary,
  For,
  on,
  onCleanup,
  Show,
  untrack,
  type JSX,
} from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { useTheme } from "@opencode/ui/theme"
import { motionGlobals, motionTuning } from "@opencode/ui/motion-tuning"
import type { Field } from "knobs"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerProvider } from "@/runtime/server/current"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { SessionPanelFrame, SessionRouteFrame } from "@/session/session-frame"
import {
  labControls,
  labEntry,
  stateArgs,
  type LabControl,
  type LabEntry,
  type StoryArgs,
  type StoryModule,
} from "./catalog"

// How long Play holds each state at full speed. Slow motion doubles it while the motion itself runs 4× longer, so
// a transition still finishes and Play keeps moving.
const hold = 1600

// Vite needs the patterns as literals in each call.
const modules = import.meta.glob<StoryModule>([
  "../**/*.stories.tsx",
  "../../../ui/src/**/*.stories.tsx",
  "../../../session-ui/src/**/*.stories.tsx",
  "../../../gui-extensions/src/**/*.stories.tsx",
])

// Each file's text, for the order its states were written in.
const sources = import.meta.glob<string>(
  [
    "../**/*.stories.tsx",
    "../../../ui/src/**/*.stories.tsx",
    "../../../session-ui/src/**/*.stories.tsx",
    "../../../gui-extensions/src/**/*.stories.tsx",
  ],
  { query: "?raw", import: "default" },
)

/** Loads every story file. A file that fails to import is reported rather than hiding the rest. */
async function loadCatalog() {
  const results = await Promise.allSettled(
    Object.entries(modules).map(async ([file, load]) => {
      const [module, source] = await Promise.all([load(), sources[file]?.() ?? ""])

      return labEntry(file, module, source)
    }),
  )

  return {
    entries: results
      .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
      .toSorted((a, b) => a.title.localeCompare(b.title)),
    failed: results.flatMap((result, index) =>
      result.status === "rejected" ? [{ file: Object.keys(modules)[index] ?? "", error: String(result.reason) }] : [],
    ),
  }
}

/** The development components lab: every story file, rendered with the app's own providers and theme. */
export default function ComponentsLab() {
  const language = useLanguage()
  const theme = useTheme()
  const [params, setParams] = useSearchParams<{ story?: string }>()
  const [catalog] = createResource(loadCatalog)
  const [ui, setUi] = createStore<{ query: string; scheme: "dark" | "light" }>({ query: "", scheme: "dark" })

  createEffect(() => theme.previewColorScheme(ui.scheme))
  onCleanup(() => theme.cancelPreview())

  const entries = () => catalog()?.entries ?? []
  const selected = createMemo(() => entries().find((entry) => entry.title === params.story))

  const sections = createMemo(() => {
    const query = ui.query.trim().toLowerCase()
    const matches = entries().filter((entry) => entry.title.toLowerCase().includes(query))

    return [...new Set(matches.map((entry) => section(entry.title)))].map((name) => ({
      name,
      entries: matches.filter((entry) => section(entry.title) === name),
    }))
  })

  return (
    <SessionRouteFrame padded>
      <SessionPanelFrame raised>
        <div data-component="components-lab" class="flex min-h-0 flex-1">
          <nav class="flex w-[248px] shrink-0 flex-col border-e border-v2-border-border-muted">
            <div class="flex flex-col gap-2 p-3">
              <a href="/" class="flex h-7 items-center px-2 text-[13px] leading-4 text-v2-text-text-muted">
                {language.t("lab.back")}
              </a>
              <TextInput
                class="w-full"
                value={ui.query}
                placeholder={language.t("lab.search")}
                aria-label={language.t("lab.search")}
                onInput={(event) => setUi("query", event.currentTarget.value)}
              />
            </div>
            <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
              <For each={sections()}>
                {(group) => (
                  <div class="flex flex-col">
                    <div class="flex h-7 items-center px-2 text-[12px] leading-4 text-v2-text-text-faint">
                      {group.name}
                    </div>
                    <For each={group.entries}>
                      {(entry) => (
                        <button
                          type="button"
                          class="flex h-8 w-full items-center rounded-[6px] px-2 text-start text-[13px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                          classList={{
                            "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base": entry === selected(),
                          }}
                          onClick={() => setParams({ story: entry.title })}
                        >
                          <span class="min-w-0 truncate">
                            {entry.title.split("/").slice(1).join(" / ") || entry.title}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                )}
              </For>
              <Show when={catalog()?.failed.length}>
                <div class="px-2 text-[12px] leading-4 text-v2-state-fg-danger">
                  {language.plural("lab.failed", catalog()?.failed.length ?? 0)}
                </div>
              </Show>
            </div>
          </nav>
          <Show
            when={selected()}
            keyed
            fallback={
              <div class="flex flex-1 items-center justify-center text-[13px] leading-4 text-v2-text-text-faint">
                {language.t("lab.pick")}
              </div>
            }
          >
            {(entry) => (
              <Stage
                entry={entry}
                scheme={ui.scheme}
                onScheme={() => setUi("scheme", ui.scheme === "dark" ? "light" : "dark")}
              />
            )}
          </Show>
        </div>
      </SessionPanelFrame>
    </SessionRouteFrame>
  )
}

function Stage(props: { entry: LabEntry; scheme: "dark" | "light"; onScheme: () => void }) {
  const language = useLanguage()
  const entry = props.entry
  const controls = labControls(entry)
  const [args, setArgs] = createStore<StoryArgs>(stateArgs(entry, 0))
  const [view, setView] = createStore({ index: 0, playing: false, slow: motionGlobals.slow.value })
  const component = entry.component
  const fallback = component && ((values: StoryArgs) => <Dynamic component={component} {...values} />)
  // Switching to a state that shares the current render function keeps the mounted instance, so its transitions play.
  const render = () => entry.states[view.index]?.render ?? entry.render ?? fallback
  let knobs: { sync: (values: KnobValues) => void } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let panel!: HTMLDivElement

  // One batch, so a state with its own render function never renders with the previous state's args.
  const select = (index: number) => {
    const next = stateArgs(entry, index)
    batch(() => {
      setArgs(reconcile(next))
      setView("index", index)
    })
    knobs?.sync(knobValues(controls, next))
  }

  const step = () => select((view.index + 1) % Math.max(1, entry.states.length))

  const play = () => {
    clearTimeout(timer)

    if (!view.playing) return
    timer = setTimeout(
      () => {
        step()
        play()
      },
      (hold * (motionGlobals.slow.value ? 2 : 1)) / motionGlobals.speed.value,
    )
  }

  onCleanup(() => clearTimeout(timer))
  onCleanup(motionTuning.subscribe(() => setView("slow", motionGlobals.slow.value)))

  createEffect(
    on(
      () => props.scheme,
      (scheme) => {
        let disposed = false
        let unmount: (() => void) | undefined

        void import("knobs").then(({ choice, defineControls, knob, toggle }) => {
          if (disposed) return

          const schema = Object.fromEntries(
            controls.flatMap((control): [string, Field][] => {
              if (control.kind === "toggle") return [[control.key, toggle(control.value, { random: true })]]

              if (control.kind === "number") {
                const meta = { min: control.min, max: control.max, step: control.step }

                return [[control.key, knob(control.value, meta)]]
              }

              const [first, ...rest] = control.kind === "choice" ? control.options.map(String) : []

              return first === undefined ? [] : [[control.key, choice(control.value, [first, ...rest])]]
            }),
          )

          if (Object.keys(schema).length === 0) return

          const store = defineControls("components-lab", schema, {
            enabled: true,
            storage: null,
            persist: "none",
            onChange: (patch) => setArgs(fromKnobs(controls, patch)),
          })

          store.sync(
            knobValues(
              controls,
              untrack(() => ({ ...args })),
            ),
          )
          knobs = { sync: (values) => store.sync(values) }
          unmount = store.mount(panel, {
            theme: scheme,
            header: { title: false, buttons: ["undo", "redo", "reset"] },
            variants: false,
            session: false,
          })
        })

        onCleanup(() => {
          disposed = true
          knobs = undefined
          unmount?.()
        })
      },
    ),
  )

  return (
    <div class="flex min-w-0 flex-1">
      <section class="flex min-w-0 flex-1 flex-col">
        <header class="flex min-h-12 shrink-0 items-center gap-3 border-b border-v2-border-border-muted px-4 py-2">
          <h1 class="min-w-0 flex-1 truncate text-[13px] leading-4 font-medium text-v2-text-text-base">
            {entry.title.split("/").join(" / ")}
          </h1>
          <Show when={entry.states.length > 1}>
            <Button size="small" variant="ghost" onClick={step}>
              {language.t("lab.step")}
            </Button>
            <Button
              size="small"
              variant={view.playing ? "neutral" : "ghost"}
              onClick={() => {
                setView("playing", !view.playing)
                play()
              }}
            >
              {language.t(view.playing ? "lab.pause" : "lab.play")}
            </Button>
          </Show>
          <Button
            size="small"
            variant={view.slow ? "neutral" : "ghost"}
            onClick={() => motionTuning.set(motionGlobals.slow, !view.slow)}
          >
            {language.t("lab.slow")}
          </Button>
          <Button size="small" variant="ghost" onClick={props.onScheme}>
            {language.t(props.scheme === "dark" ? "lab.light" : "lab.dark")}
          </Button>
        </header>
        <Show when={entry.states.length > 1}>
          <div class="flex shrink-0 gap-1 overflow-x-auto border-b border-v2-border-border-muted px-3 py-2">
            <For each={entry.states}>
              {(state, index) => (
                <button
                  type="button"
                  aria-pressed={index() === view.index}
                  class="flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-[13px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                  classList={{ "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base": index() === view.index }}
                  onClick={() => select(index())}
                >
                  <span class="text-v2-text-text-faint [font-variant-numeric:tabular-nums]">{index() + 1}</span>
                  {state.name}
                </button>
              )}
            </For>
          </div>
        </Show>
        <div
          class="flex min-h-0 flex-1 overflow-auto"
          classList={{ "items-center justify-center p-8": !entry.fullscreen, "flex-col": entry.fullscreen }}
        >
          <Server>
            <Show when={render()} keyed fallback={language.t("lab.empty")}>
              {(fn) => (
                <ErrorBoundary
                  fallback={(error, reset) => {
                    // A failing state does not stick: the next state or edit tries again.
                    createEffect(on(() => ({ ...args }), reset, { defer: true }))

                    return (
                      <pre class="max-w-full whitespace-pre-wrap font-mono text-[12px] leading-4 text-v2-state-fg-danger">
                        {String(error)}
                      </pre>
                    )
                  }}
                >
                  {untrack(() => fn(args))}
                </ErrorBoundary>
              )}
            </Show>
          </Server>
        </div>
      </section>
      <aside class="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-s border-v2-border-border-muted p-3">
        <div ref={panel} />
        <For each={controls.filter((control) => control.kind === "text")}>
          {(control) => (
            <label class="flex flex-col gap-1.5 text-[12px] leading-4 text-v2-text-text-muted">
              {control.key}
              <TextInput
                value={String(args[control.key] ?? "")}
                onInput={(event) => setArgs(control.key, event.currentTarget.value)}
              />
            </label>
          )}
        </For>
      </aside>
    </div>
  )
}

// Stories that read the current server (a question dock replying, a provider list) get the first healthy one.
function Server(props: { children: JSX.Element }) {
  const servers = useServers()
  const global = useGlobal()
  const healthy = () => servers.list.find((conn) => global.servers.health[ServerConnection.key(conn)]?.healthy)

  return (
    <Show when={healthy()} keyed fallback={props.children}>
      {(conn) => <ServerProvider conn={conn}>{props.children}</ServerProvider>}
    </Show>
  )
}

function section(title: string) {
  return title.split("/")[0] ?? title
}

type KnobValues = { [key: string]: string | number | boolean }

function knobValues(controls: LabControl[], args: StoryArgs): KnobValues {
  return Object.fromEntries(
    controls.flatMap((control): [string, string | number | boolean][] => {
      const value = args[control.key]

      if (control.kind === "toggle") return [[control.key, value === true]]

      if (control.kind === "choice") return [[control.key, String(value ?? control.value)]]

      if (control.kind === "number") return [[control.key, Number(value ?? control.value)]]

      return []
    }),
  )
}

function fromKnobs(controls: LabControl[], patch: StoryArgs) {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => {
      const control = controls.find((item) => item.key === key)

      return [key, control?.kind === "choice" ? control.options.find((option) => String(option) === value) : value]
    }),
  )
}
