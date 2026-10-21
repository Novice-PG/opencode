import { describe, expect, test } from "bun:test"
import { labControls, labEntry, stateArgs } from "./catalog"

const source = `
export default { title: "Lab/Docks" }
export const Empty = {}
export const QueueThree = { name: "Queue 3", args: { queued: 3 } }
export const Answered = { args: { queued: 2, question: false } }
`

const module = {
  default: {
    title: "Lab/Docks",
    args: { queued: 0, question: false, size: "normal", label: "Send" },
    argTypes: {
      size: { control: "select", options: ["small", "normal"] },
      queued: { control: { type: "range", max: 6 } },
    },
  },
  Answered: { args: { queued: 2, question: false } },
  Empty: {},
  QueueThree: { name: "Queue 3", args: { queued: 3 } },
}

describe("labEntry", () => {
  test("keeps the states in source order, each over the meta's args", () => {
    const entry = labEntry("docks.stories.tsx", module, source)

    expect(entry.states.map((state) => state.name)).toEqual(["Empty", "Queue 3", "Answered"])
    expect(stateArgs(entry, 1)).toEqual({ queued: 3, question: false, size: "normal", label: "Send" })
  })
})

describe("labControls", () => {
  test("types each arg by its argType, else by its value", () => {
    expect(labControls(labEntry("docks.stories.tsx", module, source))).toEqual([
      { key: "size", kind: "choice", value: "normal", options: ["small", "normal"] },
      { key: "queued", kind: "number", value: 0, min: 0, max: 6, step: 1 },
      { key: "question", kind: "toggle", value: false },
      { key: "label", kind: "text", value: "Send" },
    ])
  })
})
