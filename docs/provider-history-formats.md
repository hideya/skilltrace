# Agent Execution Log Formats

Status: observed field guide for the implemented Codex, Claude Code, and Gemini
CLI adapters; not a stable client API contract

This document records the local agent execution-log formats inspected while
designing and implementing SkillTrace's `provider_history` event source. It
describes what can be retrieved, how SkillTrace may use it, what the parser may
inspect transiently, and what SkillTrace should intentionally ignore.

In user-facing prose, **agent execution logs** refers to the source files and
**execution-log event stream** to their normalized SkillTrace projection.
Raw schema fields and stable internal identifiers retain names such as
`provider`, `provider_session_id`, and `provider_history`.

The architectural proposal is in
[Agent Execution Log Event Source](./provider-history-event-source.md).
The cross-source retention, evidence, reasoning, and future research policy is
in [Data And Evidence Management](./data-and-evidence-management.md).
Concrete client, version, model, and validation combinations are tracked
separately in
[Tested Clients And Models](./tested-clients-and-models.md).

## Scope And Date

The initial observations were made on one macOS machine on 2026-07-21. The
matching SkillTrace runs occurred between 2026-06-28 and 2026-07-09. A follow-up
inspection on 2026-07-23 examined a newer Codex run, the current `ctx` Codex
adapter, two native Claude Code validation runs, and two native Gemini CLI
execution-log validation runs without broadening the machine or platform
sample.

Observed client versions included:

- Codex CLI `0.143.0`
- Codex Desktop CLI `0.145.0-alpha.18`
- Claude Code `2.1.198` and `2.1.218`
- Gemini CLI `0.46.0`; its selected chat records did not include an obvious
  client-version field

The paths, schemas, record names, and field names in this document are owned by
their agent clients. They can change without notice. Adapters must treat this
as format reconnaissance, not as a stable API specification.

## Privacy Method Used For This Investigation

The investigation selected known test runs and examined:

- filenames and project mappings
- record types and object keys
- session IDs, timestamps, working directories, and client versions
- tool names, tool-call IDs, file-path arguments, result status, and terminal
  markers
- whether non-SkillTrace tool calls contained the same skill paths captured by
  passive probing

It did not need user prompt text, assistant response text, reasoning content,
or raw tool output to reach the design conclusions.

The same boundary should apply to the implementation. A parser may encounter
private fields while decoding a record, but those fields must not leave the
client adapter.

## Data Disposition Vocabulary

Each raw field or record category is assigned one of four dispositions:

| Disposition | Meaning |
| --- | --- |
| Retain | Store a minimal normalized value in a SkillTrace event |
| Inspect only | Read transiently to match, classify, normalize, or validate; never store or send raw |
| Ignore | Do not use for the first implementation |
| Never read | Exclude the file or data store from discovery entirely |

`Inspect only` is not permission to log the value. Debug logs, thrown errors,
snapshots, and test failures must follow the same retention boundary.

## Common Data Categories

| Raw category | Typical examples | Disposition | SkillTrace use |
| --- | --- | --- | --- |
| Agent log session ID | thread ID, session UUID | Retain | Association and provenance |
| Record and tool-call ID | call UUID, message UUID | Retain selectively | In-source deduplication and provenance |
| Event timestamp | record or tool timestamp | Retain | Timeline placement and run slicing |
| Working directory | absolute `cwd`, project-root mapping | Inspect only | Session association and path normalization |
| Agent and client version | agent name, CLI version | Retain | Adapter diagnostics and format drift analysis |
| Model ID | client-recorded model name | Retain when structurally available | Recorded execution context and cross-agent comparison |
| Tool name | `Read`, `read_file`, `exec_command` | Retain | Evidence and operation classification |
| Tool arguments | path or command object | Inspect only | Extract safe paths and classify operations |
| Tool status | success, error, interrupted, exit status | Retain as normalized outcome | Evidence validation and execution outcome |
| Tool output | command stdout, file contents, result text | Inspect structured or wrapper status and exit metadata only | Never retain content |
| Prompt text | user messages, last prompt | Ignore | Not required for evidence |
| Assistant response | model messages and summaries | Ignore | Not required for evidence |
| Reasoning | thinking, encrypted reasoning, summaries | Ignore | Sensitive, client-dependent, and not authoritative evidence; see the future decision-signal policy |
| Token usage | input, output, cached, reasoning tokens | Ignore | Unrelated to skill evidence |
| Git metadata | branch, commit, origin | Inspect only | Cross-check the SkillTrace run snapshot; do not duplicate agent-log values initially |
| Structured edit target | `file_path`, replace target, patch target | Retain normalized path and outcome | Recorded execution context, not proof of prior influence |
| Patch or snapshot content | backups, structured patches, old and new strings | Ignore | Private content is unnecessary once safe target paths are projected |
| Attachments | images, pasted text, attachment metadata | Ignore | Private and unrelated |
| Conversation title | thread name, generated title, preview | Ignore | Often derived from prompt text |
| Permissions and sandbox state | approval policy, permission mode | Ignore initially | Potential future execution context, but not yet normalized consistently |
| Telemetry and application logs | diagnostics, failed telemetry events | Never read | Not agent-session evidence |
| Authentication and account state | tokens, cookies, account files | Never read | Sensitive and unnecessary |

## Common Evidence Rules

### Skill Paths

The adapter should recognize paths through the existing SkillTrace location
policy, including current `.agents/skills/` locations and observed legacy
`.skills/` locations. It should also handle configured global skill roots.

The raw absolute path is used transiently. The retained value should be the
normalized project-relative or policy-approved display path.

### Direct Read Tools

A structured direct-read operation can produce evidence when all of these are
true:

- the tool is recognized by the client adapter
- an exact file path can be extracted from structured input
- the path identifies a skill entrypoint or reference file
- the operation completed successfully
- the tool call is not a SkillTrace MCP call

### Shell Read Commands

Shell commands require stricter parsing because a path mention alone proves
very little.

Observed positive examples included:

```text
cat .skills/type-fix/SKILL.md
sed -n '1,220p' .agents/skills/type-fix/SKILL.md
cat .skills/type-fix/references/checklist.md
```

The first allowlist should cover commands whose primary operation reads file
content, such as:

- `cat`
- `sed` when used to print selected input
- `head`
- `tail`

Content-search commands such as `rg` or `grep` need command-aware checks. For
example, `rg pattern path/to/SKILL.md` reads the file, while `rg --files` only
discovers names. Listings such as `ls`, `find`, and client `glob` tools do not
prove that guidance content was read.

Compound commands must be parsed into operations. SkillTrace should classify
only the specific operation that reads the path. It should not retain the full
command line.

### Result Correlation

A tool invocation and its result may appear in separate records. The adapter
must correlate them through the client-native call ID where available.

Positive evidence requires a successful result. Failed, cancelled,
interrupted, or missing results should not produce a successful file-read
event. A safely classified operation may still become execution context with a
failed or aborted outcome.

### Circular SkillTrace Calls

All three inspected agent clients persisted SkillTrace MCP calls alongside
normal tools. The adapter must identify them by client-specific tool name and
remove them before evidence classification.

Their arguments can contain:

- the SkillTrace run ID
- the skill path
- reference paths
- declared start and finish events
- context and reflection data

These values are copies of SkillTrace instrumentation. They may help associate
an agent log session with a run, but they do not independently prove a read.

## Common Execution-Context Projection

The adapter should project recognized execution-log operations into a small
shared taxonomy in addition to extracting consistency evidence.

| Operation kind | Typical raw operations | Safe retained facts |
| --- | --- | --- |
| `file_read` | `Read`, `read_file`, content-reading shell command | Timestamp, normalized path, outcome, client-native IDs |
| `file_search` | content search, glob, directory search | Timestamp, safe search scope or returned paths, outcome |
| `file_edit` | edit, write, replace, apply-patch target | Timestamp, normalized target paths, outcome |
| `test` | recognized test runner command | Timestamp, outcome, exit code, duration |
| `typecheck` | recognized compiler or typecheck command | Timestamp, outcome, exit code, duration |
| `lint` | recognized lint command | Timestamp, outcome, exit code, duration |
| `build` | recognized build command | Timestamp, outcome, exit code, duration |
| `artifact` | structured output or generated artifact | Timestamp, normalized artifact references, outcome |
| `other` | useful structured operation outside the taxonomy | Timestamp, safe classifier, outcome |

The classification must come from tool structure or an allowlisted command
family, not prompt or response prose. The full command, arguments, output,
patch, and file contents remain private.

Repository-relative paths can be retained for execution context even when they
are not skill files. Absolute paths outside approved roots should be redacted or
omitted.

### Verification Outcomes

Test, typecheck, lint, and build records are especially useful because they
connect an operation to a mechanical result. A normalized verification fact
may retain:

- operation kind
- start and finish timestamps or duration
- success, failure, or aborted outcome
- numeric exit code when structurally available
- safe repository-relative paths or artifact references
- agent log session and tool-call provenance
- classification confidence

It must not retain the command line, test names derived only from output,
stdout, stderr, stack traces, or agent-client-generated verification summaries.

### Influence And Outcome Limits

An edit after a skill read is part of the execution sequence, but the log alone
does not prove the skill caused that edit. A successful test proves only that
the recorded verification command succeeded, not that the user's task was
correctly solved.

These facts support later analysis when combined with passive observation,
semantic declarations, reflection, Git state, and human judgment.

## Agent Log Summary

| Agent | Primary observed log | Project/session locator | Strongest file evidence | Completion signal |
| --- | --- | --- | --- | --- |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Session metadata and optional local index | Parsed successful shell content-read command | `task_complete` or `turn_aborted` when present |
| Claude Code | `~/.claude/projects/<encoded-project>/<session-id>.jsonl` | Encoded project directory plus `sessionId` and `cwd` | Structured `Read` tool use and result | File stability; no general terminal record observed |
| Gemini CLI | `~/.gemini/tmp/<project-key>/chats/session-*.jsonl` | `.project_root` plus session header | Structured successful `activate_skill` or `read_file` call | `lastUpdated` plus file stability |

## Codex

### Observed Locations

Primary session records:

```text
~/.codex/sessions/YYYY/MM/DD/rollout-<local-date>-<session-id>.jsonl
```

Additional observed indexes and stores:

```text
~/.codex/state_5.sqlite
~/.codex/session_index.jsonl
~/.codex/history.jsonl
~/.codex/logs_2.sqlite
```

The numeric SQLite suffix is client-owned and must not be assumed stable.

### Source Selection

| Location | Disposition | Reason |
| --- | --- | --- |
| `sessions/.../rollout-*.jsonl` | Primary source | Contains session metadata, operation calls, results, and lifecycle events |
| `state_5.sqlite` | Optional inspect-only index | Observed `threads` rows map session IDs, rollout paths, working directories, and times |
| `session_index.jsonl` | Ignore initially | Contains IDs, generated thread names, and update times; names may reveal prompt-derived text |
| `history.jsonl` | Never read | Global prompt history is unnecessary and privacy-sensitive |
| `logs_2.sqlite` | Never read | Application diagnostics are not canonical session evidence |
| `auth.json`, configuration, attachments, shell snapshots | Never read | Sensitive or unrelated to normalized skill evidence |

The first adapter can discover recent rollout files directly. The state index
may later make candidate lookup faster, but it introduces another versioned
schema and should not be required for correctness.

### Envelope

The inspected rollout files were JSONL with one object per physical line. The
common envelope was:

```json
{
  "timestamp": "2026-07-09T09:30:56.063Z",
  "type": "response_item",
  "payload": {}
}
```

Observed top-level record types included:

- `session_meta`
- `turn_context`
- `response_item`
- `event_msg`
- `world_state` in some sessions

The set is not exhaustive.

### Sanitized Read Sequence

This synthetic example mirrors the observed shape without reproducing session
content:

```json
{"timestamp":"<time>","type":"session_meta","payload":{"id":"<session-id>","cwd":"<repo>","cli_version":"0.143.0","source":"cli"}}
{"timestamp":"<time>","type":"response_item","payload":{"type":"function_call","name":"exec_command","call_id":"<call-id>","arguments":"{\"cmd\":\"sed -n '1,220p' .agents/skills/type-fix/SKILL.md\"}"}}
{"timestamp":"<time>","type":"response_item","payload":{"type":"function_call_output","call_id":"<call-id>","output":"<private output omitted>"}}
{"timestamp":"<time>","type":"event_msg","payload":{"type":"task_complete"}}
```

The command is inspected to classify an exact file read. The retained event
contains only the normalized path, tool classifier, outcome, timestamp, call ID,
and minimal provenance. The `arguments` and `output` strings are not retained.

### `session_meta`

Observed payload keys included:

```text
base_instructions
cli_version
context_window
cwd
git
history_mode
id
model_provider
originator
session_id
source
thread_source
timestamp
```

| Field | Disposition | Use |
| --- | --- | --- |
| `id`, `session_id` | Retain one normalized ID | Agent-log session association |
| `timestamp` | Retain | Session timing |
| `cwd` | Inspect only | Match target root and normalize paths |
| `cli_version` | Retain | Adapter diagnostics |
| `source`, `originator`, `thread_source`, `model_provider` | Retain selectively | Agent-runtime execution context |
| `git` | Ignore | SkillTrace already captures run Git state |
| `base_instructions` | Ignore | Large, private, and irrelevant to file evidence |
| `context_window`, `history_mode` | Ignore | Execution-log operation metadata, not evidence |

### `turn_context`

Observed fields included `turn_id`, `cwd`, model, current date, timezone,
approval and sandbox policies, workspace roots, permission profile, effort,
personality, collaboration mode, and summary data.

| Field | Disposition | Use |
| --- | --- | --- |
| `turn_id` | Inspect only or retain when needed | Correlate multi-turn records |
| `cwd` | Inspect and project only an exact target-root match | Confirm directory for resumed turns without retaining unrelated paths |
| model | Retain when structurally available | Recorded execution context |
| approval and sandbox policy | Retain normalized scalar values | Effective execution constraints |
| permission profile | Inspect and retain only policy labels | Filesystem and network constraints without roots or raw configuration |
| effort, personality, collaboration, and multi-agent mode | Retain selectively | Execution-log-recorded operating mode for later run interpretation |
| current date and timezone | Retain normalized values | Effective temporal context presented to the agent |
| workspace roots | Inspect only | Derive whether the target is the sole root, included among roots, or outside scope |
| summary and embedded instructions | Ignore | Private model or developer content |

The adapter retains the first effective in-window configuration. If a later
`turn_context` changes an allowlisted field, the summary records only the
normalized field name in `changed_fields`; it does not retain alternate raw
policy objects or unrelated workspace paths.

The adapter must not treat a resumed turn as a new session automatically. It
should slice the selected agent log session by the SkillTrace run interval.

### `response_item`

Observed payload subtypes included:

- `message`
- `reasoning`
- `function_call`
- `function_call_output`
- `custom_tool_call`
- `custom_tool_call_output`

Observed payload keys included `name`, `namespace`, `call_id`, `arguments`,
`input`, `output`, `status`, `role`, `content`, `summary`, and
`encrypted_content`.

| Subtype or field | Disposition | Use |
| --- | --- | --- |
| `function_call.name` | Retain | Identify `exec_command` or circular MCP tools |
| `function_call.call_id` | Retain | Result correlation and deduplication |
| `function_call.arguments` | Inspect only | Parse exact path and command semantics |
| `function_call_output` status envelope | Inspect only | Determine successful completion |
| `function_call_output.output` | Ignore | May contain complete files, command output, and secrets |
| `message.content` | Ignore | Prompt or response content |
| `reasoning`, `summary`, `encrypted_content` | Ignore | Private model reasoning and summaries |
| patch and custom-tool target paths | Inspect and project selectively | Normalize file-edit context without patch content |

In the inspected SkillTrace runs, Codex skill reads appeared in successful
`exec_command` calls using `cat` and `sed`. Directory listings and `rg --files`
also mentioned skill paths, but they should not become read evidence.

Recognized shell commands can also provide test, typecheck, lint, build, search,
and artifact operations. Their classification and outcome may be retained as
execution context, but not their full command or output.

### Observed Tool-Envelope Drift

A follow-up inspection on 2026-07-23 compared two Codex CLI `0.143.0` rollout
files created through the same client and originator. A run using GPT-5.5
recorded agent operations as direct `function_call` items such as
`exec_command`. A later run using GPT-5.6 recorded most operations inside a
`custom_tool_call` named `exec`; its `input` was a JavaScript program that called
nested `tools.*` functions. A direct `function_call` for `wait` was also present.

This is evidence of envelope variation associated with the model change, not
proof that the model alone caused it. A simultaneous client-side tool-protocol
change remains possible.

Before shape-aware extraction was added, the Codex first cut matched the later
session successfully but emitted no normalized execution-log events for its
nested operations. It reported eight unsupported calls. Static inspection of the
program-like inputs recovered the following operations without reading prompt,
response, reasoning, or tool-output content:

- two skill or reference content-read commands
- two typecheck executions, first failing and then succeeding
- one patch application
- five nested SkillTrace MCP calls that should remain circular evidence

Replaying that same rollout through the shape-aware adapter produces five
normalized context operations: two skill/reference read attempts with unknown
outcomes, a failed typecheck with exit code 2, one file edit with an unknown
outcome, and a successful typecheck with exit code 0. The five SkillTrace calls
remain excluded as circular. The reads do not become positive consistency
evidence because their custom-call outputs contain content but no structurally
correlated exit status; this is intentional uncertainty, not a collection
failure.

This result separates two health questions that must remain visible:

- **Collection health:** the correct agent log session and records were found.
- **Extraction health:** the adapter understood enough of those records to emit
  normalized facts.

Collection succeeded in the original import; extraction coverage did not. The
other SkillTrace streams continued to describe the run, so the missing
execution-log projection did not invalidate the trace. The shape-aware replay
now restores
the recoverable operation and outcome detail while keeping uncorrelated read
outcomes explicit.

The implemented adapter therefore dispatches by observed envelope shape rather
than by model name. It distinguishes direct calls from program-like custom calls
and uses bounded static analysis for literal `tools.*` invocations. Each derived
operation retains the outer call ID, source record, `static_js` extraction
method, and confidence. Dynamic or undecodable input remains visible through
partial or unsupported extraction diagnostics instead of appearing as an empty
successful import.

### `event_msg`

Observed event payload types included:

- `task_started`
- `task_complete`
- `turn_aborted`
- `user_message`
- `agent_message`
- `token_count`
- `mcp_tool_call_end`
- `patch_apply_end`

| Event | Disposition | Use |
| --- | --- | --- |
| `task_started` | Inspect only | Session timing and slicing |
| `task_complete` | Retain as normalized completeness | `explicit_complete` |
| `turn_aborted` | Retain as normalized completeness | `explicit_aborted` |
| `mcp_tool_call_end` | Inspect only | Result correlation if needed |
| message events | Ignore | Duplicate conversational content |
| token events | Ignore | Not required for execution-context goals |
| patch events | Inspect only | Correlate a structured edit outcome without retaining patch data |

A single rollout can contain multiple turns and more than one terminal-looking
event. Completion applies to the imported run slice, not permanently to the
whole agent log session.

### Codex-Specific Risks

- File access is usually inside a general shell command rather than a dedicated
  file-read operation.
- Commands can be compound, quoted, redirected, or invoke another interpreter.
- Tool output may contain the entire skill file and must never be retained.
- A session can be resumed after SkillTrace stops.
- Agent log indexes and SQLite schema suffixes can change independently of the
  rollout format.
- Newer records may include encrypted or summarized reasoning. SkillTrace does
  not inspect it in normal collection; possible semantic value does not justify
  widening the current privacy boundary.

## Claude Code

### Observed Location

```text
~/.claude/projects/<encoded-absolute-project-path>/<session-id>.jsonl
```

The project directory name encodes the working directory. Records also carry
`sessionId` and, for message records, `cwd`.

The implemented adapter derives exactly one encoded project directory from the
SkillTrace target root; it does not crawl unrelated Claude projects or read the
global prompt history.

Additional observed files included `~/.claude/history.jsonl`, settings, stats,
telemetry, cache, and backup data. They are not part of session evidence.

### Source Selection

| Location | Disposition | Reason |
| --- | --- | --- |
| `projects/<project>/<session>.jsonl` | Primary source | Contains structured messages, tool uses, results, and metadata |
| `history.jsonl` | Never read | Global prompt history is unnecessary and privacy-sensitive |
| telemetry, stats, cache, backups | Never read | Not canonical session evidence |
| settings, account, IDE lock files | Never read | Sensitive or unrelated |

### Envelope And Record Types

The inspected files were JSONL with one record per line. Common top-level fields
included:

```text
type
uuid
parentUuid
sessionId
timestamp
cwd
version
gitBranch
isSidechain
message
toolUseResult
```

Observed record types included:

- `assistant`
- `user`
- `system`
- `file-history-snapshot`
- `attachment`
- `ai-title`
- `last-prompt`
- `mode`
- `permission-mode`

### Sanitized Read Sequence

```json
{"type":"assistant","sessionId":"<session-id>","cwd":"<repo>","timestamp":"<time>","uuid":"<record-id>","message":{"role":"assistant","content":[{"type":"tool_use","id":"<call-id>","name":"Read","input":{"file_path":"<repo>/.agents/skills/type-fix/SKILL.md"}}]}}
{"type":"user","sessionId":"<session-id>","cwd":"<repo>","timestamp":"<time>","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"<call-id>","is_error":false,"content":"<private file content omitted>"}]}}
```

The `Read` input provides direct high-confidence path evidence. A correlated
`tool_result` confirms completion: observed successful results sometimes omit
`is_error`, while failed results use `is_error: true`. Its `content` is the file
content and is not retained.

### Message Records

Observed message keys included:

```text
id
model
role
content
stop_reason
stop_sequence
stop_details
usage
diagnostics
```

Content blocks included:

- `text`
- `thinking`
- `tool_use`
- `tool_result`

| Block or field | Disposition | Use |
| --- | --- | --- |
| `tool_use.id` | Retain | Correlation and deduplication |
| `tool_use.name` | Retain | Evidence and circularity classification |
| `tool_use.input` | Inspect only | Extract path or parse command |
| `tool_result.tool_use_id` | Retain | Match result to invocation |
| `tool_result.is_error` | Retain as normalized outcome | `true` is failed; a correlated result without `true` is successful |
| `tool_result.content` | Ignore | May contain full file or command output |
| `text`, `thinking` | Ignore | Conversation and reasoning content |
| model | Retain when structurally available | Recorded execution context |
| usage and diagnostics | Ignore | Not required for skill or outcome analysis |

### Tool Uses

Observed tool-use keys were:

```text
type
id
name
input
caller
```

Relevant observed operations included:

| Tool | Classification |
| --- | --- |
| `Read` | Direct file-read evidence after successful result |
| `Bash` | Parse through the shell command classifier |
| `Edit`, `Write` | File-edit execution context; target path and outcome only |
| `ToolSearch` | Tool discovery, not file evidence |
| SkillTrace MCP tools | Circular; association hint only |

Every passive skill path in the four associated Claude Code runs also appeared
in a structured `Read` invocation in the agent execution logs.

### Top-Level Result Metadata

Some records included `toolUseResult` with fields such as stdout, stderr,
matches, file paths, structured patches, interruption state, and user-modified
state.

The adapter should use only the minimum result status, exit code, timing, and
safe target paths needed to validate and classify the operation. It must not
retain stdout, stderr, patches, old or new strings, file contents, or search
matches.

### Non-Message Records

| Record | Disposition | Reason |
| --- | --- | --- |
| `system` with `turn_duration` | Inspect only | Useful final activity timestamp, not a terminal guarantee |
| `file-history-snapshot` | Ignore | Contains tracked file backups and is not proof of skill influence |
| `attachment` | Ignore | May contain private content and tool inventory metadata |
| `ai-title`, `last-prompt` | Ignore | Prompt-derived conversational content |
| `mode`, `permission-mode` records | Ignore | Standalone mode records are not skill evidence |

The safe top-level `permissionMode` value on in-window message records is
retained separately as recorded agent configuration. The records' other
content is not retained.

### Sidechains And Parent Links

Claude records can include `parentUuid`, `isSidechain`, and source-tool
metadata. A sidechain tool call may represent real agent work, but its exact
semantics need more validation.

The parser should preserve sidechain status only in its private intermediate
record. The first release should accept a direct successful file read from a
sidechain only when it falls inside the selected session and run interval, and
should retain a normalized `sidechain: true` provenance flag for later review.

### Completion

The inspected files did not contain a general session-complete record. A final
timed record could be a `system` event with subtype `turn_duration`, followed by
untimed metadata or snapshot records.

Therefore Claude Code completeness should normally be `stable_at_stop`. Message
`stop_reason` is a model-message stop condition and must not be promoted to a
guarantee that the agent log session file will never receive another turn.

### Implementation Validation

Two native Claude Code `2.1.218` runs on 2026-07-23 exercised the implemented
adapter against the type-fix demo.

The exploratory run exposed two useful gaps:

- the demo's logical `.claude/skills` root is a symlink to `.agents/skills`,
  while Claude recorded the resolved `.agents/skills/...` paths
- unclassified `Bash` records made the execution-log stream lose the typecheck
  failure and recovery sequence

SkillTrace now supplies both logical and resolved skill roots to the shared
passive probe, compares execution-log paths through the same realpath-aware alias
policy, and sends Claude `Bash` commands through the shared conservative shell
reader and verification classifier.

The refined validation run produced 22 events across all four streams:

| Observation | Refined result |
| --- | --- |
| Passive evidence | One skill read and one reference read |
| Execution-log evidence | The same skill and reference reads |
| Execution-log operations | Three typechecks, one ordinary file read, and three file edits |
| Typecheck outcomes | `failed`, `failed`, `success` |
| Semantic stream | Run context, skill start, reference read, skill finish, and reflection |
| Session stream | Start, injection/probe state, collection summary, cleanup, and finish |
| Agent log match | One candidate, `high` confidence, stable source |
| Recorded agent identity | `claude-sonnet-5`, Claude Code `2.1.218`, `sdk-cli`, `acceptEdits` |
| Completeness | `stable_at_stop` |
| Unclassified calls | One `Bash` call counted as unsupported and not retained |

Claude used both evidence forms across the two runs: structured `Read` in one
and successful `Bash` content-read commands in the other. This supports keeping
both paths while assigning stronger classification confidence to direct reads.

The retained projection contained only agent/session and tool-call
provenance, normalized paths, operation kinds, outcomes, durations, confidence,
client version, model, entrypoint, working directory, and permission mode. It
did not retain prompts, responses, reasoning, commands, file contents, command
output, edit strings, patches, snapshots, or generated metadata.

### Claude-Specific Risks

- A result is serialized as a user-role message even though it is mechanical
  tool output; role alone cannot classify it.
- File snapshots and patch details can be large and private.
- Sidechains can duplicate or complicate the apparent operation sequence.
- Generated titles and last-prompt records are particularly easy to ingest by
  accident and provide no skill evidence.
- No explicit general terminal marker was observed.

## Gemini CLI

### Observed Locations

Project mapping:

```text
~/.gemini/tmp/<project-key>/.project_root
```

Chat sessions:

```text
~/.gemini/tmp/<project-key>/chats/session-<timestamp>-<short-id>.jsonl
```

The `.project_root` file contains the corresponding absolute project path and
is a strong candidate-discovery signal.

Other observed files included `logs.json`, checkpoint-like repositories under
`~/.gemini/history/`, account and configuration files, and unrelated Gemini
applications such as Antigravity. They are outside the Gemini CLI chat source.

### Source Selection

| Location | Disposition | Reason |
| --- | --- | --- |
| `tmp/<project-key>/.project_root` | Inspect only | Maps a project key to the run target root |
| `tmp/<project-key>/chats/session-*.jsonl` | Primary source | Contains session header, message records, and structured tool calls |
| `tmp/<project-key>/logs.json` | Never read | Diagnostic log, not canonical chat evidence |
| `history/<project-key>/` | Ignore initially | Checkpoint or shadow Git data duplicates richer Git and structured-operation evidence |
| account and configuration files | Never read | Sensitive and unnecessary |
| Antigravity stores and browser profiles | Never read | Different product and substantial privacy exposure |

### Stream Shape

The inspected chat files contained one JSON object per physical line. The file
behaved as an append-oriented stream with three important shapes:

1. a session header
2. message or information records
3. `$set` update records

The session header contained:

```text
sessionId
projectHash
startTime
lastUpdated
kind
```

Observed message record types were:

- `user`
- `gemini`
- `info`

Gemini message records included combinations of:

```text
id
type
timestamp
content
model
thoughts
tokens
toolCalls
```

Observed `$set` records updated `lastUpdated` and sometimes carried a `messages`
snapshot.

### Sanitized Read Sequence

```json
{"sessionId":"<session-id>","projectHash":"<project-hash>","startTime":"<time>","lastUpdated":"<time>","kind":"main"}
{"type":"gemini","id":"<message-id>","timestamp":"<time>","content":"<response omitted>","toolCalls":[{"id":"<activation-id>","name":"activate_skill","args":{"name":"type-fix"},"status":"success","result":"<private skill body omitted>"},{"id":"<read-id>","name":"read_file","args":{"file_path":".agents/skills/type-fix/references/checklist.md"},"status":"success","result":"<private file content omitted>"}]}
{"$set":{"lastUpdated":"<time>"}}
```

The `activate_skill` call provides a structured skill name and status. Gemini
CLI 0.46.0 resolves that name, activates the skill, and returns its complete
body to the model. SkillTrace resolves the name only against configured skill
roots and retains this as `direct_skill_activation` evidence. The `read_file`
call provides a structured exact path and status. `content`, `thoughts`,
`result`, and `resultDisplay` are not retained.

### Session Header

| Field | Disposition | Use |
| --- | --- | --- |
| `sessionId` | Retain | Agent-log session association and provenance |
| `startTime` | Retain | Candidate matching and timeline bounds |
| `lastUpdated` | Inspect and retain normalized completeness time | Stability and run slicing |
| `projectHash` | Inspect only | Confirm project mapping if needed |
| `kind` | Retain selectively | Distinguish main sessions from future variants |

The selected files did not expose a clear Gemini CLI version in the session
header. Absence of a version must not make the adapter unusable; the parser
should identify its own adapter-format version separately.

### Message Records

| Field | Disposition | Use |
| --- | --- | --- |
| `id` | Retain selectively | Message-level provenance when no tool ID exists |
| `type` | Inspect only | Distinguish user, Gemini, and info records |
| `timestamp` | Retain for evidence records | Timeline placement |
| `toolCalls` | Inspect and project | Primary evidence source |
| `content` | Ignore | Prompt, response, or informational text |
| `thoughts` | Ignore | Reasoning content |
| `tokens` | Ignore | Usage information |
| `model` | Retain when structurally available | Recorded execution context |

### Tool Calls

Observed tool-call fields were:

```text
id
name
displayName
description
args
status
result
resultDisplay
timestamp
renderOutputAsMarkdown
```

| Field | Disposition | Use |
| --- | --- | --- |
| `id` | Retain | Result identity and deduplication |
| `name` | Retain | Evidence and circularity classification |
| `args` | Inspect only | Extract exact path or shell command |
| `status` | Retain as normalized outcome | Require success for positive evidence |
| `timestamp` | Retain | Timeline placement |
| `result`, `resultDisplay` | Ignore | May contain full file or command output |
| display and rendering fields | Ignore | UI metadata, not evidence |

Relevant observed operations included:

| Tool | Classification |
| --- | --- |
| `activate_skill` | Direct high-confidence skill evidence after successful status and unique configured-root resolution |
| `read_file` | Direct high-confidence read after successful status |
| `run_shell_command` | Parse through the shell command classifier |
| `glob` | File-search execution context, not content-read evidence |
| `replace` | File-edit execution context; target path and outcome only |
| `update_topic` | Conversation metadata, not evidence |
| `mcp_skilltrace_*` | Circular; association hint only |

Every passive skill path in the four earlier associated Gemini CLI runs also
appeared in a successful `read_file` call. In two Gemini CLI 0.46.0 validation
runs on 2026-07-23, the selected skill was first recorded through
`activate_skill`. One run did not separately read `SKILL.md`; the other did.
This is why the adapter recognizes envelope semantics rather than assuming that
skill access always appears under one tool name.

The final validation run matched one session at high confidence, reached
`stable_at_stop`, and retained three execution-log evidence events: successful
activation, a separate direct `SKILL.md` read, and a checklist read. It also
retained ten context-only read, edit, and typecheck operations with no
unsupported calls or privacy warnings.

### `$set` Records And Deduplication

`$set.lastUpdated` is useful for identifying the latest persisted update. A
`$set.messages` value can contain a snapshot of messages that also appear as
incremental records elsewhere in the file.

The adapter should:

- use `$set.lastUpdated` as inspect-only stability metadata
- avoid extracting evidence directly from `$set.messages` when equivalent
  primary records exist
- deduplicate any unavoidable overlap by tool-call ID
- never retain the messages snapshot

Without this rule, the same `read_file` operation can be counted more than once.

### Completion

No general task-complete record was observed. The session header and `$set`
updates maintained `lastUpdated`, and the selected files became stable before
SkillTrace stopped.

Gemini CLI completeness should therefore normally be `stable_at_stop`. A
successful final tool call is not itself proof that the session has ended.

### Gemini-Specific Risks

- Snapshot and incremental records can duplicate tool calls.
- `$set` records are state updates, not ordinary timeline events.
- `result` can contain the full contents of a read file or activated skill.
- `activate_skill` names must resolve to one configured skill root before they
  become local skill evidence.
- Project keys are not sufficient without `.project_root` validation.
- Other products under `~/.gemini` have unrelated and highly sensitive stores.
- No explicit terminal event or client-version field was observed in selected
  chat records.

## Normalization Mapping

| Agent log raw record | Required validation | Consistency event | Execution-context event |
| --- | --- | --- | --- |
| Codex `exec_command` with `cat` or printing `sed`, exact path, successful result | Parse command operation and correlate output status | `skill_file_read` or `skill_reference_read` when path qualifies | Read sequence represented by the evidence event |
| Codex `rg` or `grep` with an exact file operand | Prove content-search form, reject `--files` and listing forms | Matching read event when a skill file qualifies | `file_search` for other safe scopes |
| Codex recognized test, typecheck, lint, or build command | Validate command family and correlated exit | None | `execution_operation_observed` with operation kind and outcome |
| Codex apply-patch or structured edit target | Extract target path without retaining patch | None | `file_edit` operation |
| Claude `Read` with `file_path` and non-error result | Correlate `tool_use.id` and `tool_result.tool_use_id` | Matching read event when path qualifies | Read sequence represented by the evidence event |
| Claude `Bash` classified command | Apply shared shell classifier and result check | Matching read event when applicable | Classified search, verification, build, or artifact operation |
| Claude `Edit` or `Write` | Extract structured target path and result | None | `file_edit` operation |
| Gemini `activate_skill` with safe `name` and `status: success` | Resolve one existing `SKILL.md` under configured skill roots | `skill_file_read` with `direct_skill_activation` provenance | Activation sequence represented by the evidence event |
| Gemini `read_file` with `file_path` and `status: success` | Deduplicate by tool ID | Matching read event when path qualifies | Read sequence represented by the evidence event |
| Gemini `run_shell_command` classified command | Apply shared shell classifier and status check | Matching read event when applicable | Classified search, verification, build, or artifact operation |
| Gemini `replace` | Extract structured target path and status | None | `file_edit` operation |
| Agent log listing, glob, or find | Recognize operation and safe scope | No read event | `file_search` when useful and safely bounded |
| Failed classified operation | Correlate failure, abort, or interruption | No positive read event | Same operation kind with failed or aborted outcome |
| Arbitrary path mention | No mechanical operation | No event | No event |
| Any SkillTrace MCP tool | Circular instrumentation | No execution-log evidence | No execution operation |

## Data Explicitly Not Used In Version 1

The following information may be technically retrievable but is intentionally
outside the first implementation:

### Conversation Semantics

- user intent inferred from prompts
- assistant claims about which skill it used
- response quality or correctness
- reasoning traces and hidden thoughts
- agent-client-generated summaries or titles

SkillTrace already has explicit semantic and reflection channels. Mining prose
would add privacy risk and weak, client-dependent inference. Some reasoning
content may contain useful planning or uncertainty clues, but the normal path
should capture those through explicit declarations and bounded decision
categories instead. Any agent-log-text experiment belongs behind the separate
research-mode gate in
[Data And Evidence Management](./data-and-evidence-management.md).

### Raw Change Detail

- file-history snapshots
- checkpoint repositories
- patch bodies
- replacement old and new strings
- full edited file contents
- backup files

Structured edit target paths and outcomes may be retained as normalized
execution context. The underlying change content remains excluded. A write does
not prove that a file influenced the agent before it was changed, and agent-log
snapshots should not duplicate SkillTrace's Git evidence.

### Tool Output And File Contents

- contents returned by `Read` or `read_file`
- stdout and stderr
- search matches
- directory listings
- patch bodies

The safe path, operation category, and normalized outcome are enough for the
implemented evidence and execution context. Retaining content would make
SkillTrace a transcript and source-code archive, which is explicitly not the
goal.

### Usage And Runtime Diagnostics

- token counts
- cache usage
- context windows
- model stop sequences
- per-message generation latency and client-internal timing
- telemetry, internal logs, and crash data

These values are not yet normalized consistently across clients. They can be
added later through a separately justified efficiency or cost-analysis feature.
Operation duration and final activity time remain eligible execution-context
facts when they are structurally reliable.

### Security And Account Data

- authentication tokens
- cookies
- account identifiers
- agent-client configuration containing secrets
- browser profiles
- shell snapshots

Agent log discovery must use an allowlist of known session locations. It must
never recursively crawl an entire agent-client home and then decide what looked
interesting.

## Safe Adapter Intermediate Form

Agent log parsers should project raw records immediately into a private type
similar to:

```ts
type ProviderOperation = {
  provider: 'codex' | 'claude_code' | 'gemini_cli'
  format: string
  sessionId: string
  recordIndex: number
  timestamp?: string
  cwd?: string
  toolCallId?: string
  toolName?: string
  input?: unknown
  operationKind?:
    | 'file_read'
    | 'file_search'
    | 'file_edit'
    | 'test'
    | 'typecheck'
    | 'lint'
    | 'build'
    | 'artifact'
    | 'other'
  paths?: string[]
  outcome?: 'success' | 'failed' | 'aborted' | 'unknown'
  exitCode?: number
  durationMs?: number
  terminal?: 'complete' | 'aborted'
  sidechain?: boolean
}
```

This type is private and still contains `input`, so it must not be stored,
logged, returned by an API, or passed to the UI. The privacy projector should
consume it immediately and produce a much smaller trace event.

An even safer implementation can avoid materializing full message objects by
streaming records and projecting only recognized operation envelopes.

## Format Drift Policy

Agent log formats will change. Adapters should be strict about evidence and
liberal only about harmless unknown fields.

- Ignore unknown record and object keys.
- Require known minimal shapes before emitting evidence.
- Do not search arbitrary JSON text for filenames as a fallback.
- Do not infer a successful read when result correlation changes unexpectedly.
- Version the SkillTrace adapter format independently of the client version.
- Record safe unsupported-shape counters for diagnostics.
- Fail closed with `unsupported_format` when required structure disappears.
- Keep client fixtures small, synthetic, and free of real conversation text.

An adapter update should include:

- a fixture for the new shape
- an explanation of changed extraction behavior
- circularity-filter regression coverage
- privacy-projection regression coverage
- a test showing the old supported fixture still behaves intentionally, or a
  clear decision that the old format is no longer supported

Backward compatibility should be driven by formats still observed in supported
client installations, not by speculative parsers for every historical shape.

## Fixture Guidance

Fixtures should contain only the minimum records needed to test:

- session identification
- working-directory and time matching
- one direct skill-file read
- one reference-file read
- one failed read
- one listing or glob that must not become a read
- one structured edit whose target becomes context without patch content
- one successful and one failed verification command
- one circular SkillTrace MCP call
- one terminal or final-update signal
- one duplicate snapshot copy where the agent log format can produce it

Use invented project names, IDs, timestamps, and file contents. Tool results
should use placeholders rather than copied source or guidance text.

## Questions For Future Field Work

- Do newer or older client versions retain the same call and result IDs?
- Can native session IDs be obtained without reading conversational data?
- How do agent clients serialize subagents, parallel tools, and resumed
  sessions?
- What happens when history persistence is disabled or redacted?
- Are writes atomic, append-only, or rewritten for each client version?
- How do Windows and Linux installations map project roots and separators?
- Do global skills appear with canonical, symlinked, or copied paths?
- Which unsupported shell readers appear often enough to justify safe
  classifiers?
- Can agent log files be rotated or compacted between agent exit and
  `skilltrace stop`?

Answers should update this field guide as observations. Changes to the durable
SkillTrace behavior belong in
[Agent Execution Log Event Source](./provider-history-event-source.md) or a later
architecture decision.
