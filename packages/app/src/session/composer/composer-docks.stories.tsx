import { createSignal } from "solid-js"
import type { FormInfo } from "@opencode/client/promise"
import { activePermissionRequest, activeQuestionRequest } from "@opencode/session-ui/storybook"
import { Composer } from "@/composer/composer"
import { useLanguage } from "@/runtime/i18n/language"
import type { WebSearchRequestModel } from "@/session/requests/websearch"
import { createPromptController } from "@/session/story-model"
import { SessionQueuePanel } from "./queue-panel"
import type { SessionQueueView } from "./queue"
import { SessionComposerRegion, type SessionComposerRegionViewController } from "./session-composer-region"

const prompts = [
  "Compare the Alpha and Beta fixtures",
  "Rename the Alpha export",
  "Add a Beta regression test",
  "Summarize the Alpha changes",
  "Document the Beta settings",
  "Remove the unused Alpha helper",
]

const websearchRequest = {
  id: "frm_docks_websearch",
  sessionID: "ses_docks",
  title: "Web Search",
  metadata: { kind: "websearch.provider" },
  fields: [{ key: "choice", type: "string", required: true, custom: false }],
} satisfies FormInfo

type DocksProps = { queued: number; question: boolean; permission: boolean; websearch: boolean }

// The production composer region with its docks and queue, driven by args alone so a change of state animates in place.
function ComposerDocks(props: DocksProps) {
  const language = useLanguage()
  const [provider, setProvider] = createSignal("exa")
  const blocked = () => props.question || props.permission || props.websearch

  const prompt = createPromptController({
    initial: "",
    placeholder: language.t("ui.promptInput.placeholder.followUp", { slash: "/", at: "@" }),
    status: () => ({ type: "busy" }),
    onActivity() {},
    onSubmit() {},
    onStop() {},
  })

  const queue: SessionQueueView = {
    rows: () => prompts.slice(0, props.queued).map((text, index) => ({ id: `queued_${index}`, text, attachments: 0 })),
    editing: () => undefined,
    working: () => true,
    busy: () => false,
    steer: async () => undefined,
    remove: async () => undefined,
    undo: () => undefined,
    edit: () => false,
    reorder: async () => undefined,
  }

  const websearch = {
    request: () => (props.websearch ? websearchRequest : undefined),
    options: () => [
      { value: "exa", label: "Exa" },
      { value: "parallel", label: "Parallel" },
    ],
    selected: provider,
    specific: () => false,
    loading: () => false,
    loadFailed: () => false,
    failed: () => false,
    sending: () => false,
    connected: () => true,
    select: setProvider,
    retry() {},
    submit: async () => undefined,
  } satisfies WebSearchRequestModel

  const region = {
    state: {
      questionRequest: () => (props.question ? activeQuestionRequest : undefined),
      websearch,
      permissionRequest: () => (props.permission ? activePermissionRequest : undefined),
      permissionResponding: () => false,
      decide() {},
      blocked,
    },
    centered: () => false,
    onResponseSubmit() {},
    setDockRef() {},
    child: () => false,
    showComposer: () => true,
  } satisfies SessionComposerRegionViewController

  return (
    // Anchored to the bottom like the session screen, so the docks grow upward over a composer that stays put.
    <div class="flex h-[560px] w-[640px] max-w-full flex-col justify-end">
      <SessionComposerRegion
        controller={region}
        above={<SessionQueuePanel queue={queue} hidden={blocked()} />}
        composer={<Composer model={prompt.controller} borderUnderlay />}
        subagent={null}
      />
    </div>
  )
}

export default {
  title: "OpenCode/Session/Composer docks",
  id: "session-composer-docks",
  component: ComposerDocks,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Queued prompts and the question, permission and web search docks above the composer. Each story is a state of the same region, so stepping between them plays the real transitions.",
      },
    },
  },
  args: { queued: 0, question: false, permission: false, websearch: false } satisfies DocksProps,
  argTypes: {
    queued: { control: { type: "range", min: 0, max: prompts.length, step: 1 } },
  },
}

export const Empty = {}

export const QueueOne = { name: "Queue 1", args: { queued: 1 } }

export const QueueThree = { name: "Queue 3", args: { queued: 3 } }

export const Question = { args: { queued: 3, question: true } }

export const QuestionAndPermission = {
  name: "Question + permission",
  args: { queued: 3, question: true, permission: true },
}

export const Answered = { args: { queued: 2 } }

export const WebSearch = { name: "Web search", args: { queued: 2, websearch: true } }
