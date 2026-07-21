# Provider History Event Source

Status: planned, not implemented

This document proposes a fourth SkillTrace evidence source derived from the
local history persisted by agent clients. It defines the intended behavior,
trust boundaries, collection lifecycle, normalized events, failure policy, and
implementation phases.

Detailed observations of the Codex, Claude Code, and Gemini CLI file formats
live in [Provider History Formats](./provider-history-formats.md). Those
observations are deliberately separate because provider-owned formats can
change independently of this design.

## Summary

Agent clients already persist session metadata, messages, tool calls, tool
results, and file-related operations in local history files. SkillTrace can
inspect the history for the session that overlaps an active run and extract a
small, privacy-preserving set of skill evidence.

The proposed source is:

```text
provider_history
```

The first implementation should collect it during `skilltrace stop`, before
the run is marked finished. Collection is best effort. Missing, ambiguous,
changing, or unsupported provider history must never prevent the run from
stopping.

Provider history is useful because it can reveal structured operations that
the passive operating-system probe cannot understand. For example:

- Claude Code records a `Read` tool call with an exact `file_path`.
- Gemini CLI records a `read_file` call with arguments and completion status.
- Codex records an `exec_command` call whose command can explicitly read a
  skill file with `cat` or `sed`.

This evidence is not a replacement for passive observation. It is another
view of the same agent work, with different strengths and failure modes.

## Origin Of The Idea

The [`ctxrs/ctx`](https://github.com/ctxrs/ctx) project demonstrated a useful
general approach: discover provider-owned local history, parse each provider
through a dedicated adapter, and normalize the result for retrieval.

SkillTrace does not need to integrate with `ctx`, import its database, or copy
its full-session model. The narrower opportunity is to learn from its source
discovery and adapter approach while extracting only evidence relevant to a
single SkillTrace run.

## Evidence Status

The design is based on a read-only inspection of this Mac and the active
SkillTrace development database on 2026-07-21. Transcript and reasoning text
were not used in the analysis.

### Observed Results

| Observation | Result |
| --- | --- |
| Finished runs in the development database | 21 |
| Trace modes | 19 full, 1 passive plus reflection, 1 passive only |
| Runs associated with local provider sessions | 17 |
| Associated Codex sessions | 9 |
| Associated Claude Code sessions | 4 |
| Associated Gemini CLI sessions | 4 |
| Associations containing a SkillTrace run ID | 15 |
| Associations recovered from time and working directory without a run ID | 2 |
| Runs without a matching record in the inspected provider stores | 4 |
| Per-run passive skill-path observations in associated sessions | 32 |
| Passive path observations also found in non-SkillTrace provider tool input | 32 |

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
- Work for passive-only runs without requiring agent cooperation.
- Collect at the natural `skilltrace stop` boundary.
- Keep provider-specific parsing outside the common trace model.
- Retain only normalized evidence and minimal provenance.
- Make missing or ambiguous history visible without blocking normal use.
- Preserve the distinction between observation, declaration, and reflection.

## Non-Goals

- Import complete conversations into SkillTrace.
- Index prompts, responses, reasoning, or attachments.
- Reproduce `ctx` as a general session search system.
- Depend on `ctx` or its SQLite database at runtime.
- Treat provider history as an official or stable provider API.
- Infer model intent from prose.
- Capture every file touched by an agent in the first release.
- Replace the passive probe, semantic MCP logger, or final reflection.
- Make provider history mandatory for a passing run initially.
- Parse browser profiles, telemetry, credentials, or unrelated application
  state.

## Trust Model

SkillTrace currently compares evidence with different origins:

| Evidence | Origin | Primary strength | Primary weakness |
| --- | --- | --- | --- |
| Passive file access | Operating-system probe | Independent mechanical observation | Weak intent and operation semantics |
| Semantic MCP events | Agent declaration during work | Explicit skill lifecycle and intent | Cooperative self-report |
| Final reflection | Agent declaration after work | Attribution, omissions, and uncertainty | Retrospective self-report |
| Provider history | Agent client's persisted operation record | Structured tool and outcome details | Provider-owned, local, and format-unstable |

Provider history is independent of SkillTrace instrumentation when it records
an ordinary provider tool such as `Read`, `read_file`, or `exec_command`.
However, the same provider history also records calls to SkillTrace's own MCP
tools. Those calls are circular and must not be treated as independent
corroboration.

Provider history should be described as client-recorded evidence, not ground
truth. A provider can omit events, buffer writes, redact data, or change its
serialization. Local files can also be edited after the fact.

## Proposed Event Model

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
    "provider": "gemini_cli",
    "provider_session_id": "<provider-session-id>",
    "tool_name": "read_file",
    "tool_call_id": "<provider-tool-call-id>",
    "outcome": "success",
    "evidence_kind": "direct_file_read",
    "confidence": "high",
    "format": "gemini_cli_json_stream_v1",
    "source_record_index": 42,
    "source_fingerprint": "<non-content fingerprint>"
  }
}
```

This is a proposed shape, not an implemented API.

### Evidence Event Types

The first version should reuse path-oriented event types where their meaning is
already understood:

- `skill_file_read`
- `skill_reference_read`

The `source` distinguishes provider evidence from passive evidence. Reusing
the event type also lets the consistency layer align records by normalized
path without pretending the evidence was captured by the passive harness.

Provider operations that only list, glob, or discover a path should not become
read events. A future design may add a neutral discovery event if those records
prove useful.

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
  "match_confidence": "high",
  "completeness": "explicit_complete",
  "evidence_event_count": 2,
  "ignored_circular_call_count": 5,
  "ignored_unsupported_call_count": 3,
  "warnings": []
}
```

Allowed collection statuses should be:

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

| Raw operation | Required checks | Normalized result | Confidence |
| --- | --- | --- | --- |
| Structured file-read tool | Exact path, successful result | Skill or reference read | High |
| Shell content-read command | Recognized reader, exact path, successful exit | Skill or reference read | Medium |
| Shell content search | Exact file target, command semantics prove content access, successful exit | Skill or reference read | Medium |
| Glob, list, or find | Exact path may be returned but content is not read | No read event | None |
| Edit, write, replace, or patch | File was changed, but read influence is not proven | No v1 event | None |
| Prompt or assistant prose mentioning a path | No mechanical operation | No event | None |
| SkillTrace MCP call | Circular instrumentation record | No provider evidence | None |
| Failed or cancelled tool call | Operation did not complete successfully | No positive read event | None |

For shell commands, the normalized payload should retain a classifier such as
`shell_content_read`, not the full command. Full command text may contain
secrets, user data, or unrelated paths.

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

| Outcome | Meaning | Collector behavior |
| --- | --- | --- |
| High-confidence match | Native ID, or exact run ID plus compatible directory and time | Import eligible evidence |
| Medium-confidence match | One exact-directory candidate with strong interval overlap | Import evidence and retain confidence |
| Ambiguous | Multiple candidates remain plausible | Import nothing and report ambiguity |
| Unavailable | No supported candidate exists | Import nothing and report unavailable |
| Conflict | Strong signals disagree | Import nothing and report ambiguity with a conflict code |

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
8. Filter circular, failed, unsupported, and non-evidence operations.
9. Normalize paths and build provider-history events.
10. Post all normalized evidence and the collection summary as one logical
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

| Value | Meaning |
| --- | --- |
| `explicit_complete` | Provider recorded a positive terminal event |
| `explicit_aborted` | Provider recorded an abort or cancellation event |
| `stable_at_stop` | No terminal event exists, but the source became stable |
| `possibly_incomplete` | Source remained active or changed through the timeout |
| `unknown` | Adapter cannot assess completion |

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
- normalized event timestamp
- normalized skill or reference path
- tool name or shell-operation classifier
- success, failure, abort, or completeness state
- match and evidence confidence
- non-content source fingerprint and record position
- aggregate ignored-record counts and safe warning codes

### Inspected Transiently But Not Retained

- tool arguments needed to extract an exact path
- shell command text needed to classify a content read
- tool-result metadata needed to determine success
- working directory needed for association and path normalization
- provider timestamps and file metadata needed for matching and stability

### Never Retained Or Sent To The Server

- user prompts
- assistant responses
- reasoning, thinking, summaries, or hidden model content
- raw tool output
- complete shell commands
- file contents
- patches, edits, or snapshots
- attachments or images
- token counts and billing data
- credentials, authentication state, cookies, or account data
- telemetry and unrelated application logs
- provider-generated titles or conversation previews

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

Provider-history evidence must not be deduplicated against passive evidence.
The fact that two independent sources observed the same path is the point.

Deduplication should occur only within `provider_history`. A proposed identity
is:

```text
run_id
+ provider
+ provider_session_id
+ provider_tool_call_id or source_record_index
+ normalized_event_type
+ normalized_path
```

When a provider repeats the same logical tool call in a snapshot and an
incremental record, the adapter must collapse it using the provider tool-call
ID. Gemini's observed `$set.messages` snapshots make this especially important.

The source fingerprint should be based on stable, non-content metadata such as
provider, session ID, source filename basename, bounded byte length, and record
position. It should not hash or persist prompt or response text merely to prove
provenance.

## Consistency And UI Policy

Provider history should initially be observational:

- show it in the run timeline
- add a provider-history column or detail to the consistency view
- show collection status and confidence
- align provider paths with passive, semantic, and reflection paths
- do not require provider history for `pass`
- do not let `unavailable`, `ambiguous`, or unsupported history turn a run into
  a warning
- do not let provider evidence silently substitute for expected passive or
  semantic evidence

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
- Unknown formats fail closed: no evidence is emitted.
- Ambiguous matching emits no evidence.
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

| Component | Responsibility |
| --- | --- |
| Source discovery | Find supported provider stores and candidate sessions |
| Session matcher | Resolve one provider session for one SkillTrace run |
| Stability reader | Select a bounded, stable source snapshot |
| Provider adapter | Parse provider records into a private intermediate form |
| Circularity filter | Remove SkillTrace instrumentation records |
| Evidence classifier | Recognize successful skill-file operations |
| Path normalizer | Align provider paths with SkillTrace paths |
| Privacy projector | Produce the minimal normalized event payload |
| Batch sender | Post evidence and collection summary before run finish |

Provider adapters should be pure where practical: bytes or parsed records in,
normalized private records out. Discovery, filesystem access, matching, and HTTP
submission should remain outside the parser.

## Implementation Phases

### Phase 0: Fixtures And Contracts

- Create synthetic, sanitized fixtures for the observed provider shapes.
- Define private adapter output and public normalized event schemas.
- Add tests that fail if prompt, response, reasoning, command, or output fields
  escape the privacy projector.
- Record observed provider client versions with the fixtures.

### Phase 1: Read-Only Collector

- Implement discovery and adapters for Codex, Claude Code, and Gemini CLI.
- Run against fixtures and explicitly selected local files.
- Produce a local diagnostic report without changing SkillTrace runs.
- Measure candidate ambiguity and extraction precision.

### Phase 2: Stop Integration

- Invoke collection from `skilltrace stop` before `/api/sessions/end`.
- Add a batch endpoint for normalized provider events.
- Store collection status for unavailable and unsupported cases.
- Keep current run verdicts unchanged.

### Phase 3: UI Correlation

- Display provider-history events and collection status.
- Add the source to timeline filters and run-source summaries.
- Add an observational provider column to the consistency matrix.
- Explain evidence confidence and circular filtering in compact UI copy.

### Phase 4: Reliability Review

- Compare provider evidence with passive events over real runs.
- Review missed, extra, ambiguous, and incomplete records.
- Decide whether any provider evidence should affect verdicts.
- Consider an explicit reconciliation command only if stop-time incompleteness is
  common enough to justify it.

## Test Plan

### Adapter Tests

- parses supported session metadata
- extracts direct file-read calls
- classifies allowed shell content reads
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
- warnings redact the home directory
- logs do not serialize raw provider records

### Stop Lifecycle Tests

- stable file is collected before session finish
- changing file reaches the timeout without blocking stop
- adapter error still finishes the run
- server error during provider submission still finishes the run with a warning
- discard skips provider discovery and parsing
- repeated stop does not duplicate provider evidence

## Acceptance Criteria For The First Integrated Release

- Supported provider sessions can be matched without relying on SkillTrace MCP
  calls.
- Direct successful skill and reference reads become normalized
  `provider_history` events.
- Circular SkillTrace calls never become provider evidence.
- No prompt, response, reasoning, raw output, full command, or file content is
  stored in SkillTrace.
- Missing, ambiguous, unsupported, and incomplete history are visible but
  nonfatal.
- Existing run verdicts do not change merely because provider history is absent.
- `skilltrace stop` remains bounded and responsive.
- Provider-specific fixtures and privacy regression tests cover every adapter.

## Open Questions

- Can a native session ID be captured cheaply for each provider, or should
  matching remain entirely file based?
- Is a start-time filename and size baseline necessary in real concurrent use?
- Should collection status be represented only as a trace event, or also in the
  run bag for faster diagnostics?
- Should structured file-edit tools produce a separate future touched-file
  event?
- How should provider evidence for global skills outside the target root be
  displayed without exposing the user's home path?
- Should low-confidence shell evidence be stored as diagnostic evidence or
  omitted entirely?
- Is later reconciliation useful enough to justify another command and state
  transition?
- Which provider and parser version details are safe and useful to expose in
  exported traces?

## Documentation Boundary

This document describes planned behavior. Until implementation lands:

- the README correctly describes three evidence streams
- `provider_history` is not a supported trace source
- `skilltrace stop` does not read provider history
- the consistency matrix does not include provider history

When each phase is implemented, current-state documentation should be updated
in the same change rather than treating this planning document as proof that the
feature already exists.
