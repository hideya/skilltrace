# OKF and SkillTrace: From Knowledge Provenance to Execution Experience

> **Status:** Exploratory design note  
> **Scope:** A conceptual analysis of how the Open Knowledge Format (OKF) v0.2 and SkillTrace may complement each other. This document does not claim an official integration, conformance profile, or partnership.

## Executive summary

The Open Knowledge Format (OKF) and SkillTrace address two different but closely related problems in the emerging ecosystem of agent-readable, executable knowledge.

**OKF describes knowledge as a portable artifact.** It provides a minimal Markdown-and-YAML format for recording what a knowledge concept is, where it came from, who or what generated it, how it was verified, whether it is still current, and—when applicable—how a computation can be attested.

**SkillTrace observes knowledge in use.** It records and compares incomplete evidence about how an AI agent interacted with skill files and references during a run: file access, explicit MCP-based declarations, and post-run reflection.

A useful way to express the division of responsibility is:

> **OKF gives knowledge a résumé; SkillTrace gives it work experience.**

A résumé can describe origin, qualifications, verification, and current status. Work experience records what happened when that knowledge was applied under real conditions: where it helped, where it was ignored, where it broke, and how it should be improved.

The two systems are therefore more complementary than competitive:

- OKF can represent the curated knowledge artifacts that agents consume.
- SkillTrace can collect runtime evidence about how those artifacts were used.
- Reviews and postmortems can convert selected runtime evidence into durable knowledge.
- That new knowledge can then be written back into an OKF-compatible corpus.

Together, they suggest a possible feedback loop:

```text
Knowledge
   ↓
Agent execution
   ↓
Runtime evidence
   ↓
Review and generalization
   ↓
Improved knowledge
```

This loop is central to the idea that skills may mature from shared instructions into trustworthy units of executable collective knowledge.

---

## 1. The common problem

AI-agent skills occupy an unusual position between documentation and software.

Like documentation, a skill can be written primarily in natural language. It can contain procedures, constraints, judgment criteria, examples, references, and escalation conditions.

Like software, it is not merely read for understanding. An agent may select it, interpret it, apply it to a task, call tools under its guidance, produce side effects, and succeed or fail.

This creates a new knowledge-management problem.

It is no longer sufficient to ask:

- What does this document say?
- Who wrote it?
- Is it current?
- Is it trustworthy?

We must also ask:

- Was it actually read?
- Did the agent intend to use it?
- Which parts influenced the run?
- Did the agent comply with its constraints?
- Did the task succeed?
- Under which conditions did the skill fail?
- Was the failure converted into an improvement?

OKF v0.2 addresses the first group of questions. SkillTrace begins to address the second.

---

## 2. What OKF v0.2 contributes

[OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) defines a deliberately minimal format for representing knowledge as a directory of Markdown files with YAML frontmatter.

Its central unit is a **Concept**: one Markdown document describing an asset, definition, process, playbook, metric, reference, computation, or another unit of knowledge.

The v0.2 specification makes several properties first-class:

- **Provenance** through `sources`
- **Generation history** through `generated`
- **Verification history** through `verified`
- **Lifecycle state** through `status`
- **Freshness** through `stale_after`
- **Sanctioned computation and deterministic verification** through `Attested Computation`

This is important because an agent-maintained knowledge corpus cannot be treated as a timeless set of authoritative documents. A consumer needs to know not only what a concept says, but also where it came from and whether it remains dependable.

OKF intentionally does not prescribe:

- a fixed taxonomy,
- storage or query infrastructure,
- an agent runtime,
- a skill invocation protocol,
- a complete execution receipt transport,
- or an observability system.

That restraint is one of its strengths. OKF can serve as an interchange format without requiring every producer and consumer to adopt the same platform.

It also leaves an important gap: a knowledge artifact can describe itself, but it does not automatically know what happened when an agent attempted to use it.

---

## 3. What SkillTrace contributes

[SkillTrace](../README.md) focuses on a narrower runtime question:

> During an agent run, what evidence suggests that a skill or reference was accessed, declared as being used, and considered influential?

SkillTrace currently compares three evidence streams.

### 3.1 Passive file-access evidence

The operating system can reveal that a skill file or reference file was accessed during a run.

This is valuable because it does not depend on the agent voluntarily reporting its behavior.

However, file access proves only exposure. It does not prove comprehension, compliance, causal influence, or successful use.

### 3.2 Semantic declarations

An agent can call SkillTrace MCP tools to declare events such as starting a skill, reading a reference, or finishing skill use.

These declarations add semantic meaning that passive access events cannot provide.

They are nevertheless self-reports. An agent may omit an event, misidentify a file, report an intention that it did not follow, or fail to call the tool.

### 3.3 Post-run reflection

At the end of a run, the agent can reflect on which skills and references influenced the work, which steps it followed, and what uncertainty remains.

Reflection may reveal relationships that are not visible in low-level logs.

It is also retrospective self-reporting and must not be treated as definitive ground truth.

### 3.4 Disagreement is evidence

The important design choice is not that SkillTrace has found a perfect signal. It has not.

The important choice is to compare multiple imperfect signals.

Examples of useful disagreement include:

- A reference file was accessed but not mentioned in reflection.
- A skill was declared through MCP, but no corresponding file access was observed.
- A skill file was read, but the agent reports that it did not influence the task.
- The agent claims to have followed a step that is contradicted by deterministic execution evidence.
- The three evidence streams align closely.

SkillTrace is therefore not a truth oracle. It is an instrument for making uncertainty and inconsistency inspectable.

---

## 4. Static provenance and runtime provenance

The relationship between OKF and SkillTrace becomes clearer if we distinguish two kinds of provenance.

### 4.1 Static provenance

Static provenance describes how a knowledge artifact came to exist.

Examples include:

- source documents,
- generating agents or processes,
- human reviewers,
- modification dates,
- lifecycle state,
- and dependencies on other concepts.

This is the provenance represented by OKF.

### 4.2 Runtime provenance

Runtime provenance describes what happened when an artifact was used.

Examples include:

- the exact revision available during the run,
- whether the file was accessed,
- whether the agent declared an intention to use it,
- which references were opened,
- which procedures were reportedly followed,
- which tools were invoked,
- what result was produced,
- and how the run was evaluated.

This is the provenance SkillTrace begins to collect.

Neither form is sufficient alone.

A carefully reviewed skill may still be ignored or misapplied at runtime. Conversely, a successful run does not establish that the skill definition itself is generally valid, current, or safe.

A trustworthy ecosystem needs both.

---

## 5. Do not collapse different claims into one score

One of the most important design principles is to avoid treating “skill usage” as a single Boolean value or trust score.

At least six distinct claims may be involved:

| Dimension       | Question                                                             |
| --------------- | -------------------------------------------------------------------- |
| **Exposure**    | Was the skill or reference made available or accessed?               |
| **Intent**      | Did the agent declare that it intended to use the skill?             |
| **Attribution** | Did the agent later identify the skill as influential?               |
| **Compliance**  | Did the execution follow the skill's required steps and constraints? |
| **Outcome**     | Did the task produce an acceptable result?                           |
| **Review**      | Did a human or deterministic process verify any of the above?        |

These dimensions are related but not equivalent.

```text
Accessed
   ≠ understood
   ≠ followed
   ≠ causally influential
   ≠ successful
   ≠ independently verified
```

SkillTrace should preserve this separation as long as possible.

A summary score may eventually be useful for filtering or dashboards, but it should be derived from visible evidence rather than replacing it. Different consumers may reasonably weigh the evidence differently.

This is consistent with OKF's approach to trust: record objective signals and allow consumers to derive a judgment appropriate to their context.

---

## 6. Attested Computation as a bridge

OKF v0.2's **Attested Computation** is the closest point of contact with SkillTrace.

An Attested Computation can describe:

- a sanctioned computation,
- declared parameters,
- an executor,
- the expected shape of a receipt,
- and a deterministic attester.

The goal is to verify that a value was produced through the approved computation rather than merely asserted by an agent.

This establishes an important principle:

> Some runtime claims should be verified through deterministic evidence rather than model self-report.

SkillTrace can apply the same principle beyond numerical computation.

For example, a skill may require that an agent:

- run a test suite,
- read a specified file before modifying another file,
- avoid changes outside an allowed path,
- produce output matching a schema,
- execute a validation command,
- preserve a required section,
- or stop and escalate under a defined condition.

Some of these requirements can be checked deterministically.

SkillTrace could therefore distinguish among:

- **passive evidence** — observed externally,
- **semantic evidence** — declared by the agent,
- **deterministic attestations** — checked by code,
- **outcome evaluations** — judgments about result quality,
- **human review** — contextual confirmation.

The semantic parts of natural-language skill use may never be fully attestable. That does not make deterministic attestation unhelpful. It means the system should attest what it can and remain explicit about what it cannot.

---

## 7. A possible closed-loop architecture

A future integration could form a knowledge-learning cycle.

```text
┌───────────────────────────────────────────┐
│ OKF-compatible knowledge corpus           │
│                                           │
│  Skill                                    │
│  Policy                                   │
│  Reference                                │
│  Known Failure Mode                       │
│  Regression Case                          │
└─────────────────────┬─────────────────────┘
                      │ consumed by
                      ▼
┌───────────────────────────────────────────┐
│ Agent run                                 │
└─────────────────────┬─────────────────────┘
                      │ observed by
                      ▼
┌───────────────────────────────────────────┐
│ SkillTrace runtime evidence               │
│                                           │
│  File access                              │
│  Semantic declarations                    │
│  Reflection                               │
│  Revision snapshot                        │
│  Deterministic checks                     │
│  Outcome evaluation                       │
└─────────────────────┬─────────────────────┘
                      │ reviewed and distilled
                      ▼
┌───────────────────────────────────────────┐
│ Curated learning artifacts                │
│                                           │
│  Incident Report                          │
│  Postmortem                               │
│  Known Failure Mode                       │
│  Regression Case                          │
│  Skill revision                           │
└─────────────────────┬─────────────────────┘
                      │ written back to
                      └──────────────► OKF corpus
```

The crucial transformation occurs between runtime evidence and curated learning.

Raw traces are not automatically knowledge. They become knowledge only after someone or something:

1. identifies a meaningful event,
2. reconstructs what happened,
3. separates a local accident from a reusable pattern,
4. records the conditions under which the pattern applies,
5. proposes a change,
6. and verifies that the change reduces recurrence.

SkillTrace can supply evidence for this process. OKF can represent its durable results.

---

## 8. Raw traces should not be stored as ordinary OKF concepts

It may be tempting to export every runtime event as an OKF Markdown file. That would probably be a mistake.

Large volumes of raw traces have different requirements from curated knowledge:

- append-heavy storage,
- efficient querying,
- retention policies,
- privacy controls,
- redaction,
- potentially sensitive repository content,
- and high-cardinality event relationships.

A Git-friendly knowledge bundle is not necessarily the right event store.

A better separation is:

### SkillTrace trace store

Stores high-volume runtime evidence:

- run metadata,
- passive events,
- semantic events,
- reflections,
- snapshots,
- diffs,
- tool or validation receipts,
- evaluation results,
- and environment details.

### OKF-compatible knowledge corpus

Stores selected, curated artifacts:

- skills,
- policies,
- references,
- known failure modes,
- incident reports,
- postmortems,
- regression cases,
- and verification or lifecycle metadata.

The OKF concepts may link back to immutable SkillTrace run IDs or exported evidence packages without embedding the entire trace.

In other words:

> **SkillTrace stores experience; OKF stores knowledge distilled from experience.**

---

## 9. Identity must include revision

Runtime evidence is meaningful only if it points to the exact knowledge revision used during the run.

A path such as:

```text
.agents/skills/code-review/SKILL.md
```

is not enough. The file may change over time while retaining the same path.

A robust identity should include some combination of:

- repository identity,
- file path,
- Git commit,
- working-tree state,
- content hash,
- and hashes of relevant reference files.

Conceptually:

```text
Skill identity       = repository + path
Skill revision       = skill identity + content hash
Observed execution   = run + skill revision
```

OKF uses paths as Concept IDs within a bundle. SkillTrace can complement this by binding runtime events to immutable revisions.

This also enables meaningful longitudinal questions:

- Did failure frequency change after a particular revision?
- Which reference update altered agent behavior?
- Did a regression appear only in one model or environment?
- Was a successful run using committed content or local modifications?

Revision-aware evidence is foundational to treating skills as evolving executable knowledge.

---

## 10. An illustrative OKF extension

OKF allows producer-defined fields and unregistered concept types. SkillTrace could therefore export or maintain an optional profile without requiring changes to the core OKF specification.

The following example is illustrative, not an official OKF or SkillTrace schema:

```yaml
---
type: Skill
title: TypeScript Type-Fix Skill
description: Procedure for diagnosing and repairing a constrained TypeScript error.
resource: ../.agents/skills/type-fix/SKILL.md
status: stable

generated:
  by: human:maintainer
  at: 2026-07-20T10:00:00Z

verified:
  - by: human:maintainer
    at: 2026-07-21T08:30:00Z

sources:
  - id: implementation
    resource: ../.agents/skills/type-fix/SKILL.md
    title: Skill implementation

skilltrace:
  skill_id: .agents/skills/type-fix
  revision: sha256:example-content-hash
  evidence_summary:
    runs_observed: 42
    latest_run: skilltrace://runs/example-run-id
  related_concepts:
    known_failure_modes:
      - ./failure-modes/ambiguous-root-cause.md
    regression_cases:
      - ./regression-cases/type-only-import.md
---
```

Several cautions are important:

- `skilltrace` would be a producer-defined extension.
- Counts should be framed with a clear observation window.
- Evidence summaries should not be presented as universal quality scores.
- Sensitive trace data should remain outside the bundle.
- Derived summaries should identify how and when they were generated.
- Human review should remain distinct from automated confirmation.

The value of such an extension would be interoperability, not schema ownership. Other tools could ignore the extension and still consume the document as an ordinary OKF Concept.

---

## 11. Trace modes are experimental conditions

SkillTrace's trace modes are not merely UI preferences. They change the observation conditions.

A mode that injects instructions asking the agent to report skill usage may alter the agent's behavior. A passive-only mode reduces direct intervention but provides less semantic evidence.

Therefore, every run should preserve its observation mode as part of the evidence.

Potential comparisons include:

- the same task in `full` and `passive_only` modes,
- the same skill across different models,
- the same revision with and without reflection,
- and the same task before and after an instrumentation change.

These comparisons can help estimate observer effects.

This is an unusually valuable aspect of SkillTrace. The tool does not merely observe an agent; it can also make its own observational interference visible and testable.

---

## 12. Privacy and evidence minimization

A system that connects knowledge artifacts to execution traces can easily collect sensitive material.

Possible captured information includes:

- proprietary skill instructions,
- internal reference files,
- local modifications,
- repository metadata,
- agent summaries,
- file paths,
- validation outputs,
- and details about failed operations.

An OKF integration should not automatically make such information portable or shareable.

Useful principles include:

1. **Local by default**  
   Raw evidence should remain local unless explicitly exported.

2. **Curate before publishing**  
   Incident reports and failure modes should be generalized and reviewed.

3. **Link with access control**  
   A concept may reference a protected trace without embedding it.

4. **Redact at the boundary**  
   Export should remove secrets, personal data, proprietary paths, and irrelevant content.

5. **Record the transformation**  
   A generated postmortem should identify the process and source run IDs used to produce it.

6. **Do not confuse availability with authority**  
   A widely shared artifact is not necessarily a trustworthy one.

The goal is not to accumulate the maximum possible trace data. It is to preserve enough evidence to make skill behavior debuggable and learning possible.

---

## 13. Possible implementation roadmap

The following sequence would preserve SkillTrace's current focus while opening a path toward OKF interoperability.

### Phase 1: Revision-stable skill identity

- Bind every observed skill and reference to a content hash.
- Preserve repository, path, commit, and working-tree state.
- Make revision identity visible in the UI and exports.

### Phase 2: Evidence export

- Export a run summary with stable run and artifact identifiers.
- Keep passive, semantic, reflection, deterministic, and review evidence separate.
- Include trace mode and observation limitations.
- Avoid a single authoritative “used” Boolean.

### Phase 3: OKF-aware mapping

- Detect OKF frontmatter when present.
- Map skill or reference files to OKF Concept IDs.
- Preserve unknown OKF fields.
- Support links from OKF concepts to SkillTrace evidence.
- Treat OKF as an interchange layer rather than the internal event-store schema.

### Phase 4: Curated learning artifacts

- Allow a user to create an Incident Report from a run.
- Link the incident to exact skill revisions and evidence.
- Derive a Known Failure Mode only after review.
- Create or link a Regression Case.
- Record which skill revision addressed the failure.

### Phase 5: Deterministic attestation

- Let skills declare checkable requirements.
- Capture execution receipts.
- Run deterministic attesters where possible.
- Display attestation separately from semantic attribution and outcome quality.

### Phase 6: Longitudinal skill maturity

- Compare evidence across revisions, models, environments, and trace modes.
- Surface repeated failure patterns.
- Show whether a regression case remains resolved.
- Build evidence-backed maturity views without hiding the underlying uncertainty.

This roadmap does not require SkillTrace to become a generic knowledge catalog or a full agent-observability platform. Its differentiated role can remain focused:

> Make the use of natural-language executable knowledge inspectable, comparable, and learnable.

---

## 14. What SkillTrace should not become

The relationship with OKF may create pressure to broaden the product too quickly. Several boundaries are worth preserving.

SkillTrace does not need to become:

- an OKF editor,
- a general document-management platform,
- a universal agent trace backend,
- a skill marketplace,
- an automatic truth-scoring system,
- or an autonomous skill-rewriting engine.

Its unique contribution is narrower and deeper:

- natural-language skill use often dissolves into model context,
- no single observable event proves that a skill was used,
- multiple imperfect signals can still make the process investigable,
- and those observations can support debugging and learning.

OKF interoperability should strengthen that focus rather than dilute it.

---

## 15. Final perspective

OKF v0.2 and SkillTrace operate on opposite sides of the same boundary.

OKF asks:

> What knowledge artifact is this, where did it come from, and why should a consumer consider it usable?

SkillTrace asks:

> What happened when an agent encountered and attempted to use that artifact?

The first question gives knowledge provenance, lifecycle, and portable structure.

The second gives runtime evidence, discrepancies, failure experience, and the raw material for improvement.

This leads to a broader architectural view:

```text
Documents preserve descriptions.
Software preserves deterministic procedures.
Skills preserve agent-interpretable work practices.
OKF can preserve their provenance and status.
SkillTrace can preserve evidence of their use.
Postmortems and regression cases can turn that evidence into learning.
```

A mature skill should not be defined only by how clearly its `SKILL.md` is written.

It should also be defined by:

- the conditions under which it has been exercised,
- the failures it has encountered,
- the revisions that followed,
- the regression cases it now survives,
- and the limits it has learned to declare.

In that sense:

> **OKF gives knowledge a résumé. SkillTrace gives knowledge work experience. A trustworthy skill ecosystem will need both.**

---

## References

- [Open Knowledge Format v0.2 specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [Google Cloud: How the Open Knowledge Format can improve data sharing](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)
- [SkillTrace repository](../README.md)
