# Provider History Event Source

Status: Codex, Claude Code, and Gemini CLI adapters implemented

This document defines a fourth SkillTrace evidence source derived from the local
history persisted by agent clients. It records the implemented Codex, Claude
Code, and Gemini CLI adapters, the trust boundaries and collection lifecycle,
and the roadmap for broader operation support.

Detailed observations of the Codex, Claude Code, and Gemini CLI file formats
live in [Provider History Formats](./provider-history-formats.md). Those
observations are deliberately separate because provider-owned formats can
change independently of this design.

Dated workflow and provider-recorded model coverage lives in
[Tested Clients And Models](./tested-clients-and-models.md).

## Summary

Agent clients already persist session metadata, messages, tool calls, tool
results, and file-related operations in local history files. SkillTrace can
inspect the history for the session that overlaps an active run and extract a
small, privacy-preserving set of skill evidence and execution-context facts.

The implemented source is:

```text
provider_history
```

The provider-neutral dispatcher collects it during `skilltrace stop`, before
the run is marked finished. Collection is best effort. Missing, ambiguous,
changing, or unsupported provider history never prevents the run from stopping.

## Current Implementation

The shared collection path implements:

- a provider-neutral dispatcher that selects one uniquely matched Codex,
  Claude Code, or Gemini CLI session and fails closed on cross-provider
  ambiguity
- bounded stability checks before parsing
- normalized `provider_history` events plus a session-owned collection summary
- stop-time batch submission with per-run fingerprint deduplication
- filtering of SkillTrace MCP calls as circular evidence
- provider-recorded model/client precedence on the runs list and in Run context
- timeline display of tool, operation kind, normalized targets, and known
  outcome, plus a separate Recorded execution context summary
- path-aligned provider skill and reference reads in a verdict-neutral
  consistency column
- synthetic fixture, matching, ambiguity, schema, and privacy regression tests

The Codex adapter implements:

- direct discovery of recent Codex CLI rollout JSONL files under
  `~/.codex/sessions/YYYY/MM/DD`
- exact target-directory and run-window matching, using the SkillTrace run ID
  when available and failing closed when multiple candidates remain
- successful `cat`, printing `sed`, `head`, and `tail` reads under configured
  skill roots, from direct calls or statically recoverable nested calls
- context-only file-read operations with normalized targets when a recognized
  read cannot be correlated with a successful result
- recognized test, typecheck, lint, and build operations with correlated exit
  status and duration
- bounded static extraction of literal `tools.*` calls from Codex
  `custom_tool_call: exec` programs, without executing or retaining JavaScript
- normalized `apply_patch` target paths as context-only file-edit operations
- an allowlisted provider execution configuration from `session_meta` and the
  first in-window `turn_context`, with changed setting names when later turns
  differ
- extraction method, confidence, recognized, partial, unsupported, and
  intentionally ignored record diagnostics

The Claude Code adapter implements:

- direct discovery under
  `~/.claude/projects/<encoded-project>/<session-id>.jsonl`
- exact working-directory and run-window matching, with the SkillTrace run ID
  as the high-confidence discriminator
- structured `Read` correlation through `tool_use.id` and
  `tool_result.tool_use_id`; a result without `is_error: true` is successful
- direct skill/reference evidence for successful reads under configured logical
  or resolved skill roots, including symlinked `.claude/skills` aliases
- context-only ordinary or failed reads with normalized targets
- structured `Edit` and `Write` targets without retaining old/new strings,
  write bodies, patches, or returned content
- conservative `Bash` classification through the shared shell reader and
  verification classifier
- allowlisted client version, model, entrypoint, working directory, and
  permission mode
- `stable_at_stop` completeness because no general terminal marker is present
- safe counters for unsupported and intentionally ignored records

The Gemini CLI adapter implements:

- allowlisted discovery under
  `~/.gemini/tmp/<project-key>/chats/session-*.jsonl`, after validating the
  adjacent `.project_root` against the run target
- session-header validation, exact run-window slicing, and high-confidence run
  matching through structured SkillTrace tool-call arguments when available
- successful `activate_skill` projection as high-confidence skill-file
  evidence when its name resolves to one configured skill root
- successful structured `read_file` calls as direct skill/reference evidence
  or context-only ordinary project reads
- structured `replace` targets and conservative `run_shell_command`
  verification classification without retaining edit text, commands, results,
  or model output
- normalized tool status, model, working directory, session kind, and
  `lastUpdated` completeness metadata
- incremental-record extraction only; `$set.messages` snapshots are ignored,
  and tool-call IDs provide a second deduplication guard
- `stable_at_stop` completeness because no general terminal marker or
  client-version field is present in the selected history format

The current implementation does not yet include shell search and general
shell-edit operations or any provider-driven change to run verdicts. Provider
history remains observational.

Provider history is useful because it can reveal structured operations that
the passive operating-system probe cannot understand. For example:

- Claude Code records a `Read` tool call with an exact `file_path`.
- Gemini CLI records `activate_skill` and `read_file` calls with structured
  arguments and completion status.
- Codex records an `exec_command` call whose command can explicitly read a
  skill file with `cat` or `sed`.

This evidence is not a replacement for passive observation. It is another
view of the same agent work, with different strengths and failure modes.

Provider history also contains a useful mechanical middle between skill
consultation and final reflection: searches, reads, edits, verification
commands, tool outcomes, affected paths, and terminal state. SkillTrace should
preserve a compact normalized form of those facts. Positive skill and reference
reads participate only as advisory path alignment; operations and outcomes
remain execution context, and no provider fact affects the verdict. Future
versions can then reinterpret past runs without retaining transcripts or raw
tool data.

## Origin Of The Idea

The [`ctxrs/ctx`](https://github.com/ctxrs/ctx) project demonstrated a useful
general approach: discover provider-owned local history, parse each provider
through a dedicated adapter, and normalize the result for retrieval.

SkillTrace does not need to integrate with `ctx`, import its database, or copy
its full-session model. The narrower opportunity is to learn from its source
discovery and adapter approach while extracting only evidence and normalized
execution context relevant to a single SkillTrace run.

### Follow-Up Comparison With `ctx`

A follow-up source review on 2026-07-23 examined how `ctx` handles Codex format
variation. Its Codex adapter does not select behavior from model names. It reads
provider JSON as loose values, recognizes a bounded family of response-item
shapes, correlates calls and results by `call_id`, and accepts several equivalent
fields such as `arguments`, `input`, `action`, and `execution`.

The adapter explicitly treats `function_call` and `custom_tool_call` as tool-call
envelopes. Unknown parsed response-item subtypes fall back to a notice, while a
fast line filter and the default import policy omit records outside the useful
search projection. Successful tool output is normally skipped, failed output is
retained only as a bounded diagnostic preview, and the original provider file is
referenced rather than copied into the normalized store.

This provides useful tolerance for the newer Codex shape observed below: a
`custom_tool_call` named `exec` can still become one coarse tool-call event. The
current `ctx` adapter does not appear to parse the JavaScript program inside that
call into its nested `tools.*` operations, however. That tradeoff fits a session
search system better than it fits SkillTrace's evidence reconstruction goals.

The comparison refines the intended SkillTrace adapter design:

- select adapters by provider source format, never by model name
- parse harmless additive fields and known field aliases without rejecting the
  record
- recognize an ordered family of envelope shapes rather than one exact schema
- always preserve safe outer-call provenance before attempting deeper extraction
- treat nested-program extraction as a best-effort derived projection with its
  own method and confidence
- distinguish collected, recognized, partially extracted, unsupported, and
  intentionally ignored records in collection diagnostics
- retain a loss-visible unknown fallback instead of silently equating an
  extraction gap with an empty provider session

The relevant `ctx` implementation is in its
[`events.rs`](https://github.com/ctxrs/ctx/blob/main/crates/ctx-history-capture/src/provider/codex/events.rs),
[`session.rs`](https://github.com/ctxrs/ctx/blob/main/crates/ctx-history-capture/src/provider/codex/session.rs),
and
[`provider-import-policy.md`](https://github.com/ctxrs/ctx/blob/main/docs/provider-import-policy.md).

## Evidence Status

The design is based on a read-only inspection of this Mac and the active
SkillTrace development database on 2026-07-21. Transcript and reasoning text
were not used in the analysis.

### Observed Results

| Observation                                                                | Result                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| Finished runs in the development database                                  | 21                                                 |
| Trace modes                                                                | 19 full, 1 passive plus reflection, 1 passive only |
| Runs associated with local provider sessions                               | 17                                                 |
| Associated Codex sessions                                                  | 9                                                  |
| Associated Claude Code sessions                                            | 4                                                  |
| Associated Gemini CLI sessions                                             | 4                                                  |
| Associations containing a SkillTrace run ID                                | 15                                                 |
| Associations recovered from time and working directory without a run ID    | 2                                                  |
| Runs without a matching record in the inspected provider stores            | 4                                                  |
| Per-run passive skill-path observations in associated sessions             | 32                                                 |
| Passive path observations also found in non-SkillTrace provider tool input | 32                                                 |

For all 17 associated runs, the provider's last persisted timestamp preceded
the SkillTrace finish timestamp. The median margin was about 14 seconds. Sixteen
were within 41 seconds; one run remained open in SkillTrace for about seven
minutes after provider activity ended.

The passive-only run is an important case. Its Codex history contained no
SkillTrace run ID and no SkillTrace MCP call. Exact working-directory and time
matching selected one provider session, and its shell calls read the same
`SKILL.md` and reference file observed by the passive probe.

### Limits Of The Evidence

These results come from one machine, a small number of versions, and three
providers. They support a prototype; they do not establish a provider API or a
cross-platform guarantee.

Provider history may be disabled, moved, truncated, delayed, changed by a new
client release, or absent for API and hosted-agent runtimes. The four unmatched
runs show that `unavailable` is a normal outcome, not an exceptional failure.

## Goals

- Add provider history as a fourth, independently displayed evidence source.
- Corroborate skill and reference reads with provider-native tool records.
- Preserve normalized operation, verification, and outcome facts for future
  SkillTrace analysis.
- Let future versions reinterpret stored facts without retaining provider
  transcripts.
- Work for passive-only runs without requiring agent cooperation.
- Collect at the natural `skilltrace stop` boundary.
- Keep provider-specific parsing outside the common trace model.
- Retain only normalized evidence, execution facts, and minimal provenance.
- Make missing or ambiguous history visible without blocking normal use.
- Preserve the distinction between observation, declaration, and reflection.

## Non-Goals

- Import complete conversations into SkillTrace.
- Index prompts, responses, reasoning, or attachments.
- Reproduce `ctx` as a general session search system.
- Depend on `ctx` or its SQLite database at runtime.
- Treat provider history as an official or stable provider API.
- Infer model intent from prose.
- Build a complete forensic record of every process and file operation.
- Claim that operations following a skill read were caused by that skill.
- Replace the passive probe, semantic MCP logger, or final reflection.
- Make provider history mandatory for a passing run initially.
- Parse browser profiles, telemetry, credentials, or unrelated application
  state.

## Trust Model

SkillTrace currently compares evidence with different origins:

| Evidence            | Origin                                    | Primary strength                        | Primary weakness                           |
| ------------------- | ----------------------------------------- | --------------------------------------- | ------------------------------------------ |
| Passive file access | Operating-system probe                    | Independent mechanical observation      | Weak intent and operation semantics        |
| Semantic MCP events | Agent declaration during work             | Explicit skill lifecycle and intent     | Cooperative self-report                    |
| Final reflection    | Agent declaration after work              | Attribution, omissions, and uncertainty | Retrospective self-report                  |
| Provider history    | Agent client's persisted operation record | Structured tool and outcome details     | Provider-owned, local, and format-unstable |

Provider history is independent of SkillTrace instrumentation when it records
an ordinary provider tool such as `Read`, `read_file`, or `exec_command`.
However, the same provider history also records calls to SkillTrace's own MCP
tools. Those calls are circular and must not be treated as independent
corroboration.

Provider history should be described as client-recorded evidence, not ground
truth. A provider can omit events, buffer writes, redact data, or change its
serialization. Local files can also be edited after the fact.

## Semantic Coverage And Retention Principle

The guiding principle is:

> Be aggressive about semantic coverage, but conservative about retained
> content.

Aggressive semantic coverage means recognizing and preserving a broad set of
privacy-safe facts that may help future run postmortems and skill improvement:
skill and reference consultation, operation order, nesting, failures, retries,
recovery, verification transitions, affected paths, artifacts, terminal state,
and extraction uncertainty. It does not mean lowering the validation threshold
for consistency evidence or attempting to retain a complete forensic transcript.

Conservative retention means projecting those facts into a small allowlisted
schema. Raw commands, program wrappers, arguments, output, patches,
conversational content, and reasoning remain transient even when the adapter
uses them to classify an operation.

The collector should retain high-signal normalized operations individually when
their order or transition may matter later. In particular, it should not reduce
a failed verification, corrective edit, and successful retry to one final
success. Repetitive low-value activity may be summarized after preserving
failures, recovery, verification, and other meaningful transitions.

Storage and display have different needs. SkillTrace may retain more normalized
facts than the current timeline displays. Today's UI can summarize them while a
future analysis derives a new postmortem from the original normalized sequence.

## Normalized Event Model

Provider history produces two related projections:

1. consistency-oriented skill and reference evidence
2. normalized execution-context facts that do not initially affect verdicts

Both keep provider provenance. Neither stores conversational content. The event
envelope and Codex payload below are implemented. Provider-specific literals
and formats will be generalized when another adapter is added.

### Observation, Evidence Status, And Interpretation

SkillTrace must keep three concepts separate:

1. **Observation** records what the provider mechanically persisted and what the
   adapter safely normalized, including provenance and extraction uncertainty.
2. **Evidence status** records whether that observation currently qualifies for
   consistency checking, is context-only, is circular, or could not be
   sufficiently classified.
3. **Interpretation** is a later conclusion such as a generated postmortem,
   possible skill influence, or skill-improvement suggestion.

Observation is the durable input. Evidence status is a versioned policy decision
over observations. Interpretation is derived, revisable, and should cite the
observations and uncertainty that support it. An operation following a skill read
may be relevant to a postmortem without becoming proof that the skill caused it.

Provider events therefore retain enough safe provenance to support later
reclassification: provider and session identity, event order, outer and nested
call relationships, extraction method, confidence, and adapter format version.
Generated postmortem prose must not replace those underlying facts.

Evidence events use the existing trace envelope with a new `source`:

```json
{
  "source": "provider_history",
  "event_type": "skill_reference_read",
  "timestamp": "2026-07-09T02:44:01.123Z",
  "skill": {
    "path": ".agents/skills/type-fix/references/checklist.md"
  },
  "payload": {
    "provider": "codex",
    "provider_session_id": "<provider-session-id>",
    "tool_name": "exec_command",
    "tool_call_id": "<provider-tool-call-id>",
    "outcome": "success",
    "evidence_kind": "shell_content_read",
    "command_classifier": "cat",
    "confidence": "medium",
    "extraction_method": "direct_envelope",
    "extraction_confidence": "high",
    "match_confidence": "high",
    "format": "codex_rollout_jsonl_v1",
    "source_record_index": 42,
    "source_fingerprint": "sha256:<non-content fingerprint>"
  }
}
```

### Evidence Event Types

The provider adapters reuse path-oriented event types where their meaning is
already understood:

- `skill_file_read`
- `skill_reference_read`

The `source` distinguishes provider evidence from passive evidence. Reusing
the event type lets the current consistency matrix align matching paths without
pretending the evidence was captured by the passive harness.

Gemini's successful `activate_skill` is represented as `skill_file_read` only
when the structured skill name resolves to exactly one configured `SKILL.md`.
Its `evidence_kind: direct_skill_activation` distinguishes model-visible skill
activation from an ordinary `direct_file_read`.

Provider operations that only list, glob, or discover a path should not become
read events. They may still become neutral execution-context operations.

### Execution-Context Event Type

Provider operations that help explain how the run proceeded use:

```text
execution_operation_observed
```

An implemented normalized Codex event is:

```json
{
  "source": "provider_history",
  "event_type": "execution_operation_observed",
  "timestamp": "2026-07-09T02:44:18.500Z",
  "artifact_refs": ["src/example.ts"],
  "payload": {
    "provider": "codex",
    "provider_session_id": "<provider-session-id>",
    "tool_name": "apply_patch",
    "tool_call_id": "<provider-tool-call-id>",
    "operation_kind": "file_edit",
    "command_classifier": "apply_patch",
    "outcome": "success",
    "duration_ms": 1840,
    "classification_confidence": "high",
    "extraction_method": "direct_envelope",
    "extraction_confidence": "high",
    "match_confidence": "high",
    "evidence_status": "context_only",
    "format": "codex_rollout_jsonl_v1",
    "source_record_index": 57,
    "source_fingerprint": "sha256:<non-content fingerprint>"
  }
}
```

The implemented cross-provider operation kinds remain deliberately small:

- `file_read`
- `file_edit`
- `test`
- `typecheck`
- `lint`
- `build`

An operation that reads a skill file can create a `skill_file_read` or
`skill_reference_read` event when its successful result is structurally
correlated. If the target is recoverable but the outcome is failed or unknown,
the adapter instead creates a context-only `execution_operation_observed` with
`operation_kind: file_read` and the target in `artifact_refs`. It does not
promote an attempted or uncertain read into positive skill evidence. Provider
session and tool-call IDs place either projection in the operation sequence.

Program-like custom calls should first produce safe outer-call provenance. When
bounded static analysis can recover nested calls, each derived operation should
link to the outer call and record its extraction method and confidence. Failure
to recover nested operations is partial extraction, not evidence that no
operations occurred.

A future `other` category should be used sparingly. An unclassified arbitrary
command is not useful merely because it can be stored.

### Collection Status Event

Each non-discarded stop should append one session-owned summary event:

```text
provider_history_collection_finished
```

Its payload should contain only operational metadata:

```json
{
  "status": "collected",
  "provider": "codex",
  "provider_session_id": "<provider-session-id>",
  "provider_client_version": "0.143.0",
  "provider_model": "<model-id>",
  "provider_environment": {
    "provider": "codex",
    "client": "codex-tui",
    "client_version": "0.143.0",
    "source": "cli",
    "model": "<initial-model-id>",
    "approval_policy": "on-request",
    "sandbox": "workspace-write",
    "network_access": false,
    "reasoning_effort": "low"
  },
  "match_confidence": "high",
  "completeness": "explicit_complete",
  "recognized_record_count": 10,
  "partially_extracted_record_count": 1,
  "unsupported_record_count": 2,
  "intentionally_ignored_record_count": 14,
  "evidence_event_count": 2,
  "execution_operation_count": 8,
  "operation_counts": {
    "file_read": 2,
    "file_edit": 2,
    "typecheck": 3,
    "test": 1
  },
  "extraction_method_counts": {
    "direct_envelope": 5,
    "static_js": 5
  },
  "ignored_circular_call_count": 5,
  "warnings": []
}
```

`provider_environment.changed_fields` is omitted when no allowlisted setting
changed during the imported run slice.

The implemented adapter summaries report the recognized, partial, unsupported,
and intentionally ignored record counts above. They temporarily retain
`ignored_unsupported_call_count` as a coarse call-level diagnostic while the
newer fields establish their real-run value.

Allowed collection statuses are:

- `collected`
- `unavailable`
- `ambiguous`
- `unsupported_format`
- `possibly_incomplete`
- `failed`

This summary event belongs to `skilltrace_session`, not `provider_history`,
because it describes the collector rather than provider evidence.

## Evidence Classification

The collector should use an allowlist. It should never convert an arbitrary
path mention into a file-read event.

| Raw operation                               | Required checks                                   | Consistency evidence                               | Execution context                                  |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Structured file-read tool                   | Exact path, correlated result                     | Successful skill or reference read                 | Normalized read and outcome                        |
| Shell content-read command                  | Recognized reader, exact path, correlated exit    | Successful skill or reference read                 | Normalized read and outcome                        |
| Shell content search                        | Exact file target and proven content-search form  | Successful skill or reference read when applicable | Search operation and outcome                       |
| Glob, list, or find                         | Recognized discovery operation                    | No read evidence                                   | Search operation, safe paths only                  |
| Edit, write, replace, or patch              | Structured target path or safely parsed operation | No read evidence                                   | Edit operation, outcome, and safe paths            |
| Test, typecheck, lint, or build command     | Recognized command family and correlated exit     | No direct consistency evidence                     | Verification operation and outcome                 |
| Artifact-producing operation                | Recognized output path and successful result      | No direct consistency evidence                     | Artifact operation and safe references             |
| Prompt or assistant prose mentioning a path | No mechanical operation                           | No evidence                                        | No operation                                       |
| SkillTrace MCP call                         | Circular instrumentation record                   | No provider evidence                               | Excluded from agent-operation context              |
| Failed or cancelled tool call               | Correlated failure or cancellation                | No positive read evidence                          | Failed or aborted operation when safely classified |

For shell commands, the normalized payload should retain a classifier such as
`shell_content_read`, `test`, or `build`, not the full command. Full command
text may contain secrets, user data, or unrelated paths.

## Circularity Rules

The provider adapters must recognize SkillTrace tool names, including observed
forms such as:

```text
skill_trace_context
skill_trace_reflection
skill_log_event
mcp__skilltrace__skill_trace_context
mcp__skilltrace__skill_trace_reflection
mcp__skilltrace__skill_log_event
mcp_skilltrace_skill_trace_context
mcp_skilltrace_skill_trace_reflection
mcp_skilltrace_skill_log_event
```

These records may be counted in collector diagnostics but must not create
`provider_history` evidence. Their arguments may contain the run ID and the
same skill paths already sent to SkillTrace.

A SkillTrace run ID found only inside one of these calls is useful as a session
association hint. It is not evidence that the referenced skill was read.

## Session Matching

The collector must match a SkillTrace run to no more than one provider session.
It must not choose a convenient-looking session when multiple candidates remain.

### Candidate Signals

Signals are ordered from strongest to weakest:

1. A native provider session ID already associated with the run.
2. A SkillTrace run ID found in the candidate session.
3. Exact normalized working-directory match.
4. Provider session timestamps overlapping the SkillTrace run interval.
5. Candidate file creation or modification during the run.
6. Provider-specific project mapping, such as Gemini's `.project_root`.

The SkillTrace run ID is strong for association but usually comes from
SkillTrace MCP activity. It must not be required because passive-only runs do
not produce that activity.

### Matching Outcomes

| Outcome                 | Meaning                                                       | Collector behavior                                       |
| ----------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| High-confidence match   | Native ID, or exact run ID plus compatible directory and time | Import eligible evidence and execution context           |
| Medium-confidence match | One exact-directory candidate with strong interval overlap    | Import eligible facts and retain confidence              |
| Ambiguous               | Multiple candidates remain plausible                          | Import nothing and report ambiguity                      |
| Unavailable             | No supported candidate exists                                 | Import nothing and report unavailable                    |
| Conflict                | Strong signals disagree                                       | Import nothing and report ambiguity with a conflict code |

The two observed associations without a run ID were unambiguous because one
Codex session had the exact working directory and began inside each run window.

### Optional Start-Time Baseline

The first implementation can discover candidates entirely at stop. If
concurrent same-directory sessions make matching ambiguous, `skilltrace start`
may record a lightweight baseline of provider session filenames, sizes, and
modification times. It must not parse transcripts or copy provider data at
start.

This baseline is intentionally deferred until real ambiguity demonstrates the
need for it.

## Stop-Time Collection Lifecycle

Collection belongs in the CLI process because provider history is local to the
machine running the agent. A SkillTrace server may eventually be remote and
must not be expected to read the user's provider directories.

For a normal `skilltrace stop`:

1. Fetch the active SkillTrace session.
2. Capture `stop_requested_at` before waiting or parsing.
3. Discover provider-session candidates using run start, target root, and
   provider-specific indexes or directories.
4. Resolve one candidate or record `unavailable` or `ambiguous`.
5. Wait briefly for the candidate to become stable.
6. Parse a bounded snapshot through the provider adapter.
7. Consider only records inside the run interval, with a small documented
   timestamp tolerance for session startup.
8. Filter circular and unsupported records, then classify recognized
   operations and outcomes.
9. Normalize paths and build consistency evidence plus execution-context
   events.
10. Post all normalized events and the collection summary as one logical
    batch.
11. Clean up injected instructions.
12. Call `/api/sessions/end` and finish the run.

The precise relationship between provider collection and instruction cleanup
may change during implementation, but provider evidence must be posted before
the run is closed.

For `skilltrace stop --discard`, provider history should not be collected. The
run is about to be removed, and parsing private local history has no benefit.

## Flush And Completeness Policy

Provider processes may buffer their final write. Historical timing is
encouraging, but file flushing is not a documented cross-provider contract.

The collector should:

- stat the selected source before parsing
- wait approximately 150 to 250 milliseconds
- require unchanged size and modification time twice
- stop waiting after a total of one to two seconds
- parse only the byte length selected after the final stability check
- never wait indefinitely

Expected completeness values are:

| Value                 | Meaning                                                |
| --------------------- | ------------------------------------------------------ |
| `explicit_complete`   | Provider recorded a positive terminal event            |
| `explicit_aborted`    | Provider recorded an abort or cancellation event       |
| `stable_at_stop`      | No terminal event exists, but the source became stable |
| `possibly_incomplete` | Source remained active or changed through the timeout  |
| `unknown`             | Adapter cannot assess completion                       |

Codex can expose explicit `task_complete` and `turn_aborted` records. The
observed Claude Code and Gemini CLI files did not expose a general terminal
session record, so stability is the expected completion signal for them.

A provider session can be resumed later. SkillTrace should import only the
records within the current run's cutoff and should never claim that the entire
provider session is permanently complete.

## Privacy Boundary

The collector will necessarily parse records that contain private data. The
privacy guarantee depends on minimizing the data that leaves the parser.

### Retained

- provider name and format identifier
- provider-native session and tool-call IDs
- provider client version when available
- provider model ID when available and safe
- normalized provider execution configuration such as client surface, approval
  policy, sandbox kind, network availability, reasoning effort, collaboration
  mode, timezone, and target-workspace relationship
- provider-confirmed working directory only when it exactly matches the known
  SkillTrace target root
- names of allowlisted provider settings that changed during the run
- normalized event timestamp
- normalized skill or reference path
- normalized operation kind and repository-relative affected paths
- tool name or shell-operation classifier
- outer and nested call relationships and normalized operation order
- success, failure, abort, or completeness state
- exit code and duration when structurally available
- match, classification, and evidence confidence
- extraction method, extraction confidence, and partial-extraction status
- non-content source fingerprint and record position
- aggregate recognized, partial, unsupported, circular, and intentionally
  ignored record counts plus safe warning codes

### Inspected Transiently But Not Retained

- tool arguments needed to extract exact paths and operation kind
- shell command text needed to classify a read, edit, test, typecheck, lint,
  build, or artifact operation
- program-like custom-tool input needed for bounded nested-call extraction
- tool-result metadata needed to determine success
- provider working directories outside the confirmed target, inspected only for
  association and path normalization
- provider timestamps and file metadata needed for matching and stability
- complete workspace-root arrays and nested permission-policy structures needed
  only to derive bounded scope and access labels

### Never Retained Or Sent To The Server

- user prompts
- assistant responses
- reasoning, thinking, summaries, or hidden model content
- raw tool output
- complete shell commands
- JavaScript or other provider program wrappers
- file contents
- patch bodies, edited content, or file snapshots
- attachments or images
- token counts and billing data
- credentials, authentication state, cookies, or account data
- telemetry and unrelated application logs
- provider-generated titles or conversation previews
- base instructions, embedded developer instructions, turn summaries, and world
  state snapshots

The detailed field-by-field disposition is maintained in
[Provider History Formats](./provider-history-formats.md).

## Path Handling

Provider records may use absolute paths while passive events use paths relative
to the run target root. The collector should:

1. resolve lexical `.` and `..` segments without requiring the file to remain
   present
2. normalize separators for comparison
3. preserve case in display values while applying platform-appropriate matching
4. convert paths under the target root to project-relative display paths
5. recognize configured project and global skill roots
6. retain the original path only transiently

Symlink resolution should follow the existing SkillTrace skill-location policy.
The provider adapter should not invent a second path policy.

## Deduplication And Provenance

Provider-history events must not be deduplicated against passive evidence.
The fact that two independent sources observed the same path is the point.

Deduplication occurs only within `provider_history`. The implemented adapter
fingerprints are scoped by the run on the server and hash non-content event
identity such as:

```text
provider_session_id
+ provider_tool_call_id
+ normalized_event_type
+ normalized classifier or target paths
```

When a provider repeats the same logical tool call in a snapshot and an
incremental record, the adapter must collapse it using the provider tool-call
ID. Gemini's observed `$set.messages` snapshots make this especially important.

The source record index is retained separately as provenance. The fingerprint
does not hash or persist prompt, response, command, patch, or tool-output content
merely to prove identity.

## Recorded Execution Context

The execution-context projection exists to preserve concrete facts now while
allowing SkillTrace's interpretation to evolve later.

Useful facts include:

- provider, model, client, session, and completion metadata
- operation categories, ordering, and outer or nested call relationships
- normalized repository-relative input and output paths
- successful, failed, and aborted tool outcomes, including retries and recovery
- exit codes and durations when structurally available
- verification attempts and transitions such as a failing typecheck followed by
  an edit and a successful retry
- files edited and artifacts produced, without retaining their contents
- the interval between skill consultation and later operations
- extraction method, confidence, completeness, and unsupported-shape diagnostics

The stored facts should remain granular enough to derive a new summary in a
future version. SkillTrace should not store only a generated paragraph whose
interpretation cannot later be revised.

### Future Postmortems And Skill Improvement

Provider history is one input to future automatic postmortems and
skill-improvement candidates. The analysis must combine normalized observations
with source health, skill and instruction provenance, passive evidence, semantic
declarations, reflection, and repository outcomes without claiming causation
from temporal order alone.

The cross-source analysis model, output requirements, confidence rules, and
phased roadmap are documented in
[Postmortem And Skill Improvement Design](./postmortem-and-skill-improvement.md).

### Skill Influence Windows

A future analysis can derive a tentative skill influence window:

```text
skill or reference read
    -> subsequent normalized operations
    -> verification attempts
    -> affected files or artifacts
    -> terminal state and reflection
```

This is temporal association, not proof of causation. Confidence can increase
when passive observation, semantic declaration, provider operations, and
reflection agree. The UI and exports must not say that a skill caused an
operation or outcome merely because the operation followed a skill read.

### Outcome Levels

Provider history can contribute to several outcome levels:

| Level        | Example                                             | Provider-history contribution                     |
| ------------ | --------------------------------------------------- | ------------------------------------------------- |
| Operation    | A tool succeeded, failed, or was interrupted        | Strong when result status is structured           |
| Verification | Test, typecheck, lint, or build exited successfully | Strong when command family and exit are validated |
| Repository   | Files were edited or artifacts produced             | Moderate; paths are known but quality is not      |
| Task         | Session completed, aborted, or remained incomplete  | Provider-dependent                                |
| Evaluated    | Result was correct, useful, or accepted             | Not established by history alone                  |

Agent reflection and human judgment remain necessary for evaluated outcomes.

## Run Interpretation And Consistency UI

Provider records are not blended into reflection as though the agent reported
them. The current run-details view preserves source through three complementary
surfaces:

```text
Timeline
  Provider operations in event order: tool, operation kind, targets, outcome

Run context
  Declared context with matched provider model/client identity preferred
  Collapsed provider execution configuration and SkillTrace environment

Recorded execution context
  Provider identity, collection quality, and confirmed skill/reference reads
```

Agent reflection remains separate. Provider operations are not repeated in the
Recorded execution context card because the timeline now carries their order
and richer per-event context.

For an `execution_operation_observed` event, the compact timeline presents these
optional values in order:

```text
tool_name  operation_kind  artifact_refs  outcome
```

`artifact_refs` are operation targets, not proof of semantic skill use or
causal influence. Missing values are omitted. The normalized `unknown` outcome
remains stored and visible in event details but is omitted from the compact
header. Expanded event data retains confidence, extraction, exit-code, duration,
and provenance fields.

The runs list and primary Run context rows prefer model and client identity from
a matched provider session. Agent-declared identity remains the fallback when
provider history is unavailable, ambiguous, or lacks the corresponding value.

The current consistency view aligns provider paths with passive, semantic, and
reflection paths while preserving source boundaries. Confidence and extraction
details remain available in expanded event data rather than being collapsed
into the row verdict.

### Consistency Policy

Provider history remains observational:

- show it in the run timeline
- show a recorded execution-context summary beside agent reflection
- show collection status and confidence
- align positive skill and reference reads in an advisory Provider column
- show provider-only paths as neutral `not evaluated` rows
- do not require provider history for `pass`
- do not let `unavailable`, `ambiguous`, or unsupported history turn a run into
  a warning
- do not let provider evidence silently substitute for expected passive or
  semantic evidence

The consistency column uses an amber dot for a positive provider observation, a
neutral hollow dot when a completed collection did not observe the row, and a
dash when collection was unavailable, ambiguous, unsupported, failed, or
possibly incomplete. These display states never affect consistency status,
issue count, run result, or mode comparison.

Useful early discrepancies include:

- provider read plus passive read: independent corroboration
- provider read without passive read: possible passive-probe attribution gap
- passive read without provider read: unsupported provider operation, parser
  gap, or non-agent process access
- semantic declaration without provider or passive read: declaration lacks
  mechanical corroboration
- provider read omitted from reflection: possible attribution gap

After enough runs accumulate, SkillTrace can decide whether provider evidence
should influence verdicts. That policy should be a separate architecture
decision backed by measured false-positive and false-negative rates.

## Failure Policy

Provider collection is an enrichment step, not part of run durability.

- `skilltrace stop` succeeds even when collection fails.
- Parsing one provider must not scan unrelated provider data as a fallback.
- Unknown formats fail closed: no evidence or execution context is emitted.
- Ambiguous matching emits no provider events.
- Partial parsing emits only records that were fully validated and marks the
  collection `possibly_incomplete`.
- Errors shown to the user use safe codes and paths with the home directory
  abbreviated.
- Diagnostics may report provider availability, adapter version, candidate
  count, and the last collection status.
- Diagnostics must not print prompts, responses, commands, or tool output.

## Proposed Components

The exact filenames can follow repository conventions during implementation,
but the responsibilities should remain separate:

| Component            | Responsibility                                                             |
| -------------------- | -------------------------------------------------------------------------- |
| Source discovery     | Find supported provider stores and candidate sessions                      |
| Session matcher      | Resolve one provider session for one SkillTrace run                        |
| Stability reader     | Select a bounded, stable source snapshot                                   |
| Provider adapter     | Parse provider records into a private intermediate form                    |
| Circularity filter   | Remove SkillTrace instrumentation records                                  |
| Evidence classifier  | Recognize successful skill-file operations                                 |
| Operation classifier | Project safe execution and outcome facts                                   |
| Path normalizer      | Align provider paths with SkillTrace paths                                 |
| Privacy projector    | Produce the minimal normalized event payload                               |
| Batch sender         | Post evidence, execution context, and collection summary before run finish |

Provider adapters should be pure where practical: bytes or parsed records in,
normalized private records out. Discovery, filesystem access, matching, and HTTP
submission should remain outside the parser.

## Cross-Provider Implementation Phases

Phases 0 through 2 and the current timeline/context portion of Phase 3 are
implemented for Codex, Claude Code, and Gemini CLI. The consistency-view work
in Phase 3 remains deferred. Each additional provider should pass through the
same phases rather than being added directly to stop-time collection.

### Phase 0: Fixtures And Contracts

- Create synthetic, sanitized fixtures for the observed provider shapes.
- Define private adapter output, operation taxonomy, and public normalized event
  schemas.
- Add tests that fail if prompt, response, reasoning, command, or output fields
  escape the privacy projector.
- Record observed provider client versions with the fixtures.

### Phase 1: Read-Only Collector

- Implement discovery and a dedicated adapter for each provider. Codex, Claude
  Code, and Gemini CLI are implemented.
- Run against fixtures and explicitly selected local files.
- Produce a local diagnostic report without changing SkillTrace runs.
- Measure candidate ambiguity, evidence precision, and operation-classification
  coverage.

### Phase 2: Stop Integration

- Invoke collection from `skilltrace stop` before `/api/sessions/end`.
- Add a batch endpoint for normalized provider events.
- Store normalized execution-context operations alongside skill evidence.
- Store collection status for unavailable and unsupported cases.
- Keep current run verdicts unchanged.

### Phase 3: UI Correlation

Implemented for Codex, Claude Code, and Gemini CLI:

- Display provider-history events and collection status.
- Prefer matched provider identity and show the provider execution
  configuration.
- Keep Recorded execution context distinct from Agent reflection.
- Align provider skill and reference reads in a verdict-neutral consistency
  column.

Remaining:

- Add the source to timeline filters and run-source summaries.
- Derive summaries from normalized facts instead of stored prose.
- Explain evidence confidence and circular filtering in compact UI copy.

### Phase 4: Reliability Review

- Compare provider evidence with passive events over real runs.
- Review whether normalized operations illuminate skill influence and outcome
  without implying causation.
- Review missed, extra, ambiguous, and incomplete records.
- Decide whether any provider evidence should affect verdicts.
- Consider an explicit reconciliation command only if stop-time incompleteness is
  common enough to justify it.

## Test Plan

### Adapter Tests

- parses supported session metadata
- extracts direct file-read calls
- classifies allowed shell content reads
- classifies structured edits and recognized verification commands
- projects safe paths, outcomes, exit codes, and durations
- preserves operation order, outer-call provenance, and recovered nesting
- preserves failure, correction, retry, and success transitions
- records extraction method, confidence, and partial-extraction diagnostics
- rejects listings and path mentions as reads
- correlates tool call and result status
- filters every known SkillTrace MCP naming form
- deduplicates snapshot and incremental copies
- tolerates unknown fields
- fails closed on missing required structure

### Matcher Tests

- native session ID selects one candidate
- run ID plus compatible directory and time selects one candidate
- exact directory and interval select a passive-only candidate
- conflicting strong signals produce ambiguity
- concurrent same-directory candidates produce ambiguity
- no provider files produce unavailable
- resumed sessions are sliced at the run cutoff

### Privacy Tests

- normalized events contain no message content
- normalized events contain no reasoning or thinking content
- normalized events contain no raw tool output
- normalized events contain no complete shell command
- normalized events contain no JavaScript or provider program wrapper
- execution-context events contain no patch or edited content
- repository paths are normalized and home-directory paths are redacted
- warnings redact the home directory
- logs do not serialize raw provider records

### Stop Lifecycle Tests

- stable file is collected before session finish
- changing file reaches the timeout without blocking stop
- adapter error still finishes the run
- server error during provider submission still finishes the run with a warning
- discard skips provider discovery and parsing
- repeated stop does not duplicate provider evidence or execution context

## Acceptance Criteria For The First Integrated Release

- Supported provider sessions can be matched without relying on SkillTrace MCP
  calls.
- Direct and statically recoverable nested successful skill and reference reads
  become normalized `provider_history` events.
- Recognized operations become normalized execution-context facts with safe
  categories, outcomes, and paths.
- Failure, retry, recovery, nesting, and extraction health remain available for
  future analysis even when the current UI summarizes them.
- Run details can derive Recorded execution context separately from Agent
  reflection.
- Circular SkillTrace calls never become provider evidence.
- No prompt, response, reasoning, raw output, full command, or file content is
  stored in SkillTrace.
- Missing, ambiguous, unsupported, and incomplete history are visible but
  nonfatal.
- Provider-only consistency rows remain neutral and do not enter mode
  comparison.
- Existing run verdicts do not change merely because provider history is absent.
- `skilltrace stop` remains bounded and responsive.
- Provider-specific fixtures and privacy regression tests cover every adapter.

## Future Interpretation Phase

Future interpretation should begin only after collection coverage and privacy
boundaries are measured in real runs. It must operate on normalized observations,
preserve its policy version, cite supporting facts, and remain replaceable. See
[Postmortem And Skill Improvement Design](./postmortem-and-skill-improvement.md)
for the dedicated roadmap.

## Open Questions

- Can a native session ID be captured cheaply for each provider, or should
  matching remain entirely file based?
- Is a start-time filename and size baseline necessary in real concurrent use?
- Should collection status be represented only as a trace event, or also in the
  run bag for faster diagnostics?
- Should structured file-edit tools produce a separate future touched-file
  event or remain execution operations?
- Which operation taxonomy is small enough to stay stable but expressive enough
  for future analysis?
- How much operation detail should be retained before event volume becomes
  distracting?
- Should repeated low-level operations be stored individually or summarized
  after preserving verification and failure transitions?
- How should provider evidence for global skills outside the target root be
  displayed without exposing the user's home path?
- Should low-confidence shell evidence be stored as diagnostic evidence or
  omitted entirely?
- Is later reconciliation useful enough to justify another command and state
  transition?
- Which provider and parser version details are safe and useful to expose in
  exported traces?

## Documentation Boundary

This document now covers implemented Codex, Claude Code, and Gemini CLI
behavior plus the remaining roadmap. Current behavior is limited to the items
in Current Implementation. Later-phase language describes intended behavior,
not a supported feature.

In particular, the consistency matrix includes provider history only as an
advisory column. Existing verdicts do not change when provider history is
present, missing, ambiguous, incomplete, or unsupported.
