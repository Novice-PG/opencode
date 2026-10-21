/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- CSF args are props each story owns; the lab forwards them */
import { Schema } from "effect"
import type { Component, JSX } from "solid-js"

// Storybook's CSF as the stories in this repository write it: a default meta and named stories with args.
export type StoryArg = string | number | boolean | null | undefined | object

export type StoryArgs = { [key: string]: StoryArg }

export type StoryRender = (args: StoryArgs) => JSX.Element

type ArgType = {
  control?: string | { type?: string; min?: number; max?: number; step?: number }
  options?: readonly (string | number)[]
}

// The default export (a meta) and each named story share this shape; a story may also be a bare render function.
type StoryObject = {
  title?: string
  name?: string
  component?: Component<StoryArgs>
  args?: StoryArgs
  argTypes?: { [key: string]: ArgType }
  render?: StoryRender
  parameters?: { layout?: string }
}

export type StoryModule = { [name: string]: StoryObject | StoryRender | string[] | undefined }

/** One named story: a state of its component that the lab can switch to. */
export type LabState = { name: string; args: StoryArgs; render?: StoryRender }

export type LabEntry = {
  file: string
  title: string
  component?: Component<StoryArgs>
  args: StoryArgs
  argTypes: { [key: string]: ArgType }
  render?: StoryRender
  fullscreen: boolean
  states: LabState[]
}

export type LabControl =
  | { key: string; kind: "toggle"; value: boolean }
  | { key: string; kind: "choice"; value: string; options: readonly (string | number)[] }
  | { key: string; kind: "number"; value: number; min: number; max: number; step: number }
  | { key: string; kind: "text"; value: string }

// A story file as the lab shows it. A module lists its exports alphabetically, so `source`, the file's text, gives the
// order the author wrote the states in.
export function labEntry(file: string, module: StoryModule, source: string): LabEntry {
  const meta = isStoryObject(module.default) ? module.default : {}
  const order = [...source.matchAll(/^export const (\w+)/gm)].map((match) => match[1])

  const position = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length)

  const states = Object.entries(module)
    .toSorted(([a], [b]) => position(a) - position(b))
    .flatMap(([key, value]): LabState[] => {
      if (key === "default" || key === "__namedExportsOrder" || !value || Array.isArray(value)) return []

      if (isRender(value)) return [{ name: storyName(key), args: {}, render: value }]

      return [{ name: value.name ?? storyName(key), args: value.args ?? {}, render: value.render }]
    })

  return {
    file,
    title: meta.title ?? file.replace(/^.*\//, "").replace(/\.stories\.tsx$/, ""),
    component: meta.component,
    args: meta.args ?? {},
    argTypes: {
      ...meta.argTypes,
      ...Object.assign(
        {},
        ...Object.values(module).flatMap((value) => (isStoryObject(value) && value.argTypes ? [value.argTypes] : [])),
      ),
    },
    render: meta.render,
    fullscreen: meta.parameters?.layout === "fullscreen",
    states,
  }
}

/** The args a state renders with: the meta's, then the state's own. */
export function stateArgs(entry: LabEntry, index: number) {
  return { ...entry.args, ...entry.states[index]?.args }
}

/** A control for every arg the meta or a state sets, typed by its argType or else by its value. */
export function labControls(entry: LabEntry): LabControl[] {
  const keys = new Set([
    ...Object.keys(entry.argTypes),
    ...Object.keys(entry.args),
    ...entry.states.flatMap((state) => Object.keys(state.args)),
  ])

  return [...keys].flatMap((key): LabControl[] => {
    const type = entry.argTypes[key]
    const value = entry.args[key] ?? entry.states.find((state) => key in state.args)?.args[key]
    const control = isText(type?.control) ? { type: type.control } : (type?.control ?? {})

    if (type?.options?.length) {
      return [{ key, kind: "choice", value: String(value ?? type.options[0]), options: type.options }]
    }

    if (control.type === "boolean" || isBoolean(value)) return [{ key, kind: "toggle", value: value === true }]

    if (control.type === "number" || control.type === "range" || isNumber(value)) {
      const start = isNumber(value) ? value : 0

      return [
        {
          key,
          kind: "number",
          value: start,
          min: "min" in control && control.min !== undefined ? control.min : Math.min(0, start),
          max: "max" in control && control.max !== undefined ? control.max : Math.max(10, start * 4),
          step: "step" in control && control.step !== undefined ? control.step : Number.isInteger(start) ? 1 : 0.01,
        },
      ]
    }

    if (control.type === "text" || isText(value)) return [{ key, kind: "text", value: isText(value) ? value : "" }]

    return []
  })
}

// Storybook's name for an export: `QuestionAndPermission` reads "Question And Permission".
function storyName(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
}

function isRender(value: StoryObject | StoryRender): value is StoryRender {
  return value instanceof Function
}

function isStoryObject(value: StoryObject | StoryRender | string[] | undefined): value is StoryObject {
  return value !== undefined && !Array.isArray(value) && !isRender(value)
}

const isBoolean = Schema.is(Schema.Boolean)

const isNumber = Schema.is(Schema.Number)

const isText = Schema.is(Schema.String)
