# Lore Project Evolution - Product Requirements Document

Version: 0.1.0
Status: Draft for Community Review
Date: 2026-08-18

---

## 1. Executive Summary

Lore currently provides institutional engineering memory for AI-driven development teams.
It captures lessons, patterns, development sessions, review findings, and cross-project
propagation so teams and AI agents do not repeat mistakes that were already solved.

Project Evolution expands Lore without replacing any existing capability. It gives each
project an evidence-backed, time-aware memory of:

- what the project currently requires;
- which important decisions shaped it;
- when its requirements, scope, constraints, or direction changed;
- why each accepted change happened;
- which evidence supports the current state; and
- how the current state relates to implementation sessions, lessons, and patterns.

The intended outcome is that an AI agent, developer, product lead, or new contributor can
ask both "What is true now?" and "How did the project get here?" and receive a concise,
source-backed answer.

Lore will not become a communication archive or a provider-integration platform. Slack,
Gmail, meeting, tracker, and document integrations may exist as optional applications that
push selected context through a provider-neutral Lore capture contract. Lore Core owns the
project memory, lifecycle, relationships, retrieval, and governance.

---

## 2. Background and Problem

### 2.1 Current Lore Scope

Lore's existing Engineering Memory stores:

- lessons learned from implementation and code review;
- reusable engineering patterns;
- task-linked development sessions and their decisions;
- applied and consulted lessons; and
- cross-project lesson propagation.

These capabilities remain supported and continue to evolve independently.

### 2.2 Missing Project Context

Projects change continuously. Their direction may be affected by:

- product and engineering discussions;
- customer or stakeholder feedback;
- research findings;
- technical limitations;
- business or regulatory constraints;
- architecture discoveries;
- revised requirements; and
- deliberate scope expansion or reduction.

This context is usually scattered across messages, meetings, documents, task trackers, and
individual memory. The latest document may show the result without showing why it changed.
Old documents may remain available without clearly indicating that they are obsolete.

Consequences include:

1. AI agents implement superseded requirements.
2. Teams repeatedly reconstruct the rationale for prior decisions.
3. New contributors learn the current state but not the constraints that produced it.
4. Important discussions disappear after a meeting or message thread ends.
5. Conflicting statements are resolved informally and remain unresolved in project memory.
6. Engineering lessons remain disconnected from the product decisions that caused the work.

### 2.3 Core Problem Statement

Projects lack a trusted, queryable record that separates discussion from accepted truth and
connects current requirements to the evidence and decisions that shaped them.

---

## 3. Product Definition

> Lore Project Evolution is the evidence-backed, time-aware memory of what a project is,
> how it changed, and why it changed.

Project Evolution is additive to Engineering Memory:

```text
Lore
|-- Engineering Memory (existing)
|   |-- Lessons
|   |-- Patterns
|   |-- Sessions
|   `-- Cross-project propagation
|
`-- Project Evolution (new)
    |-- Requirements
    |-- Decisions
    |-- Scope changes
    |-- Constraints
    |-- Research findings
    |-- Evidence and provenance
    `-- Current state and history
```

### 3.1 Product Boundary

Lore Core owns:

- normalized project evolution items;
- proposal, review, acceptance, rejection, and supersession;
- evidence references and excerpts;
- relationships between project knowledge;
- current-state derivation;
- semantic, textual, temporal, and relationship-aware retrieval;
- project isolation and auditability; and
- links to existing Lore sessions, lessons, patterns, and external tasks.

Lore Core does not own:

- Slack, Gmail, Microsoft 365, or other provider OAuth;
- continuous mailbox or channel synchronization;
- meeting recording or transcription;
- provider-specific webhooks and rate limits;
- task tracker ownership;
- full communication archival; or
- automatic approval of project truth.

---

## 4. Product Principles

### 4.1 Project-Centric, Not Channel-Centric

The project is the primary boundary. Slack, email, meetings, documents, research, tasks,
and people are possible sources of evidence, not the organizing structure of the product.

### 4.2 Current Truth and History Are Both Required

Normal work should receive the current accepted state. Historical versions remain available
for explanation, audit, onboarding, and conflict resolution.

### 4.3 Discussion Is Not a Decision

AI confidence, message recency, or author seniority alone must not turn a discussion into
accepted project truth. Extracted changes enter a reviewable lifecycle.

### 4.4 Canonical History Is Append-Only

Project Evolution items, revisions, evidence, review actions, and relationship actions are
never overwritten. Corrections append a new revision or item, and accepted changes explicitly
supersede prior knowledge. Rebuildable current-state projections may update, but the canonical
history and original evidence remain available.

### 4.5 Capture Evidence, Not Entire Communication Systems

Lore stores the relevant excerpt, source reference, and normalized project impact. It does
not need to copy an entire mailbox, channel, or meeting archive.

### 4.6 AI May Capture; Authorized Humans Ratify

AI may extract, classify, deduplicate, link, and automatically save high-confidence
candidates. AI-generated candidates remain proposed until accepted by an authorized actor
or trusted deterministic workflow. In the initial release, authenticated project members may
ratify through the Web UI, REST, or Lore MCP using the existing project authentication model.

### 4.7 Knowledge Graph Semantics Without Premature Infrastructure

Project knowledge is modeled as connected entities and typed relationships from day one.
The initial implementation uses Lore's existing PostgreSQL and pgvector stack. A dedicated
graph database is not required for the first implementation.

### 4.8 Existing Lore Capabilities Remain First-Class

Project Evolution must not weaken, rename, or overload lessons, patterns, sessions, review
capture, or propagation.

---

## 5. Goals and Non-Goals

### 5.1 Goals

- **G1:** Maintain a trustworthy current view of project requirements, scope, decisions,
  constraints, and accepted research findings.
- **G2:** Preserve the evidence-backed history of how that view changed.
- **G3:** Let humans and AI retrieve relevant current context without loading the entire
  project history.
- **G4:** Distinguish proposed, accepted, rejected, and superseded information.
- **G5:** Detect and surface conflicting or superseded project context.
- **G6:** Connect project evolution to existing Lore engineering memory.
- **G7:** Provide a provider-neutral capture contract for humans, agents, workflows, and
  optional third-party applications.
- **G8:** Support manual capture, AI-assisted capture, AI suggestions, and controlled
  automatic capture.
- **G9:** Remain self-hostable and useful without proprietary communication integrations.
- **G10:** Make the data model graph-ready while reusing PostgreSQL and pgvector.

### 5.2 Non-Goals

- **NOT** a replacement for existing Lore Engineering Memory.
- **NOT** a Slack, Gmail, meeting, or document synchronization service.
- **NOT** a project management or task tracking system.
- **NOT** a complete communication archive.
- **NOT** an autonomous product owner that approves project direction.
- **NOT** a general-purpose enterprise knowledge management platform.
- **NOT** a requirement to operate a separate graph database.
- **NOT** a requirement to ingest every conversation automatically.
- **NOT** a system that treats the newest statement as authoritative by default.

---

## 6. Users and Personas

### 6.1 Developer

Needs the current requirements, constraints, and relevant rationale before implementation.
Needs to know whether a task description or document has been superseded.

### 6.2 Product or Project Lead

Reviews proposed project updates, accepts or rejects changes, resolves conflicts, and
maintains trusted current project context.

### 6.3 Technical Lead or Architect

Records technical constraints and architecture decisions, connects research to direction
changes, and queries why the current architecture exists.

### 6.4 New Contributor

Needs a concise current project brief plus an evidence-backed path through important changes.

### 6.5 AI Agent

Queries current project context before planning or implementation, proposes updates from
relevant material, and cites Lore evidence when explaining decisions.

### 6.6 Integration Developer

Builds optional channel applications, editor extensions, agents, or workflows against a
stable provider-neutral capture API without changing Lore Core.

---

## 7. Core Concepts

### 7.1 Project Evolution Item

The smallest reviewable unit of project knowledge. Initial item types are:

| Type               | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `requirement`      | A capability or behavior the project must provide              |
| `decision`         | An accepted choice between alternatives                        |
| `scope_change`     | An explicit expansion, reduction, or movement of project scope |
| `constraint`       | A technical, business, legal, time, or resource limitation     |
| `research_finding` | A vetted finding that materially informs project direction     |

Each item contains at minimum:

- project identity;
- type;
- concise title;
- normalized statement;
- rationale when known;
- lifecycle status;
- author or proposing actor;
- occurrence timestamp;
- creation and review timestamps; and
- one or more evidence records before acceptance.

### 7.2 Lifecycle Status

| Status       | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `proposed`   | Captured but not yet part of trusted current state         |
| `accepted`   | Ratified and eligible to contribute to current state       |
| `rejected`   | Reviewed and explicitly excluded from current state        |
| `superseded` | Previously accepted, then replaced by another accepted item |

### 7.3 Evidence

Evidence records the relevant source without requiring Lore to own that source system.

Evidence includes:

- source kind, such as manual, Slack, email, meeting, document, research, task, or review;
- stable source reference or URL when available;
- relevant excerpt or summary;
- source author or speaker when known;
- source occurrence time;
- external source ID for idempotency when available; and
- capture actor and timestamp.

### 7.4 Typed Relationship

Relationships form the logical project knowledge graph.

Initial relation types are:

| Relation      | Meaning                                                   |
| ------------- | --------------------------------------------------------- |
| `supersedes`  | A new item replaces a previously accepted item            |
| `supports`    | One item provides support for another                      |
| `contradicts` | Two items contain materially conflicting project context  |
| `caused_by`   | A decision or change was caused by another item            |
| `implements`  | Work or a decision implements a requirement or scope item  |
| `related_to`  | Relevant association without stronger declared semantics   |

### 7.5 Current Project State

Current state is derived, not manually maintained as a separate untraceable summary.

By default it includes accepted requirements, decisions, scope changes, constraints, and
research findings that have not been superseded. Unresolved contradictions are returned as
warnings alongside the current state.

### 7.6 Project Timeline

The timeline is the chronological sequence of proposals, reviews, acceptances, rejections,
supersessions, evidence additions, and links to implementation work.

---

## 8. Key User Journeys

### 8.1 Manual Project Update

```text
User opens Lore
  -> selects a project
  -> enters an important requirement, decision, scope change, or constraint
  -> adds source reference and relevant evidence
  -> saves as proposed
  -> authorized reviewer submits a revised version when needed and accepts it
  -> current project state updates
```

### 8.2 Save From an Optional Channel Application

```text
User selects "Save to Lore" in Slack, Gmail, or another application
  -> application sends only selected content and source metadata
  -> Lore AI extracts a proposed project update
  -> user confirms the project and proposal
  -> proposal enters the Lore review inbox
```

The optional application owns provider authentication. Lore receives a normalized request
through its generic capture contract.

### 8.3 AI-Suggested Capture

```text
AI sees a potentially important discussion
  -> identifies a possible project impact
  -> asks whether it should be saved
  -> user confirms
  -> Lore stores a proposed item with evidence and AI confidence
```

### 8.4 High-Confidence Automatic Capture

```text
Approved adapter or workflow detects an explicit project change
  -> policy gates and duplicate checks pass
  -> candidate is automatically saved
  -> status remains proposed
  -> reviewer accepts, revises, or rejects it
```

Automatic capture never grants automatic acceptance solely because an AI model is confident.

### 8.5 Requirement Change

```text
Requirement v1 is accepted
  -> research or discussion produces a change proposal
  -> Requirement v2 is reviewed and accepted
  -> v2 supersedes v1
  -> v1 remains visible in history
  -> normal context queries return v2
```

### 8.6 AI Starts New Work

```text
Agent receives a task
  -> queries Project Evolution using task context
  -> receives current requirements, constraints, decisions, and relevant rationale
  -> receives warnings about conflicts or superseded task context
  -> queries existing Lore lessons and patterns
  -> begins implementation with both product and engineering memory
```

### 8.7 New Contributor Onboarding

```text
Contributor asks "What is this project and how did it get here?"
  -> Lore returns a concise current project brief
  -> contributor expands selected decisions or requirements
  -> Lore shows the evidence-backed evolution path
```

---

## 9. Functional Requirements

### 9.1 Capture

- **FR-PE-01:** Lore must accept a proposed Project Evolution item through MCP and REST.
- **FR-PE-02:** Capture must support both structured input and raw evidence from which an AI
  assistant may propose structured fields.
- **FR-PE-03:** Every captured item must be scoped to exactly one project.
- **FR-PE-04:** Initial capture types must include requirement, decision, scope change,
  constraint, and research finding.
- **FR-PE-05:** Capture must support one or more evidence records.
- **FR-PE-06:** Capture must accept source kind, source reference, excerpt, author, occurrence
  time, and external source ID when available.
- **FR-PE-07:** Repeated requests with the same project, source kind, and external source ID
  must be idempotent.
- **FR-PE-08:** Lore must detect exact duplicates before semantic duplicate suggestions.
- **FR-PE-09:** Semantic duplicate detection may suggest an existing item but must not merge
  accepted project knowledge without review.
- **FR-PE-10:** Captured AI confidence and model metadata must be auditable when AI assistance
  was used.

### 9.2 Review and Lifecycle

- **FR-PE-11:** New items must default to proposed unless created by an explicitly configured
  trusted deterministic workflow.
- **FR-PE-12:** Authorized reviewers must be able to append a revised proposal version before
  acceptance. Existing proposal versions must remain unchanged.
- **FR-PE-13:** Any client authenticated for the project must be able to accept or reject
  proposed items through the Web UI, REST, and MCP in the initial release. Fine-grained review
  roles and permissions are deferred.
- **FR-PE-14:** Project Evolution items, versions, evidence, review actions, and relationship
  actions must not be edited in place.
- **FR-PE-15:** Changing accepted project knowledge must create a new item and an explicit
  supersedes relationship.
- **FR-PE-16:** Accepting a superseding item must atomically mark the replaced item as
  superseded.
- **FR-PE-17:** Lore must record proposing actor, reviewing actor, authenticating key identity,
  review action, and timestamps.
- **FR-PE-18:** An accepted item must have at least one evidence record.

### 9.3 Current State and Conflicts

- **FR-PE-19:** Lore must derive current project state from accepted, non-superseded items.
- **FR-PE-20:** The newest statement must not override older accepted knowledge unless an
  explicit accepted relationship establishes precedence.
- **FR-PE-21:** Lore must allow proposed and accepted items to be marked as contradictory.
- **FR-PE-22:** Current-state responses must surface unresolved contradictions as warnings.
- **FR-PE-23:** Rejected and superseded items must be excluded from default current-state
  results but remain queryable in history.

### 9.4 Evidence and Provenance

- **FR-PE-24:** Lore must preserve evidence independently from the mutable availability of the
  original provider.
- **FR-PE-25:** Evidence must retain its source reference and relevant excerpt.
- **FR-PE-26:** Evidence must record whether its excerpt was supplied by a human, adapter,
  workflow, or AI agent.
- **FR-PE-27:** Evidence corrections must append replacement evidence and a supersession record.
  Security- or legal-mandated content erasure must leave an audited tombstone and mark the item
  as missing or redacted evidence.
- **FR-PE-28:** Lore must not require storage of a complete channel, mailbox, meeting, or
  document to preserve evidence.

### 9.5 Relationships and Knowledge Graph

- **FR-PE-29:** Lore must store typed relationships between Project Evolution items.
- **FR-PE-30:** Lore must support supersedes, supports, contradicts, caused_by, implements,
  and related_to relationships.
- **FR-PE-31:** Relationship writes must validate that both endpoints belong to the same
  project unless a future cross-project policy explicitly allows otherwise.
- **FR-PE-32:** Lore must support one- and two-hop relationship expansion during context
  retrieval.
- **FR-PE-33:** The initial graph representation must use PostgreSQL tables and preserve
  referential integrity.
- **FR-PE-34:** A dedicated graph database must not be required for installation or operation.

### 9.6 Retrieval

- **FR-PE-35:** Lore must expose a project-context query that accepts natural-language or task
  context.
- **FR-PE-36:** Retrieval must combine semantic similarity, text matching, lifecycle status,
  recency, evidence availability, and relationship relevance.
- **FR-PE-37:** Default context queries must prioritize current accepted state over historical
  material.
- **FR-PE-38:** Results must include evidence references and the reason each item matched.
- **FR-PE-39:** Lore must expose an explicit history query with type, status, and date filters.
- **FR-PE-40:** History queries must show supersession and contradiction relationships.
- **FR-PE-41:** Context responses must remain bounded and must not return the entire project
  history by default.
- **FR-PE-42:** When a query matches superseded information, Lore must return the current
  replacement when one exists.

### 9.7 Existing Lore Integration

- **FR-PE-43:** Project Evolution must use the existing project and repository identities.
- **FR-PE-44:** Project isolation must continue to be enforced through PostgreSQL Row-Level
  Security.
- **FR-PE-45:** Project Evolution items must be linkable to external tasks and Lore sessions.
- **FR-PE-46:** Direct links from Project Evolution items to lessons and patterns are deferred
  to Phase 2. V1 uses task and session links, with lessons available indirectly through
  sessions.
- **FR-PE-47:** Existing lesson, pattern, session, propagation, CLI, and Web UI behavior must
  remain backward-compatible.
- **FR-PE-48:** BMAD and other agent workflows may query Project Evolution alongside existing
  lesson and pattern retrieval.

### 9.8 AI Assistance

- **FR-PE-49:** Lore Core must own AI classification, concise statement extraction, rationale
  extraction, duplicate suggestions, and relationship suggestions while also accepting
  pre-structured input from callers.
- **FR-PE-50:** AI-generated fields must be correctable through a new proposal revision while
  the item is proposed.
- **FR-PE-51:** AI confidence alone must never accept, reject, or supersede project knowledge.
- **FR-PE-52:** Automatic capture must save items as proposed.
- **FR-PE-53:** Automatic capture policies must be configurable per project and disabled by
  default.
- **FR-PE-54:** Lore must remain usable through structured manual capture when no generative AI
  provider is configured.

### 9.9 Provider-Neutral Adapter Contract

- **FR-PE-55:** Lore must expose one provider-neutral capture contract for optional external
  applications.
- **FR-PE-56:** Lore Core must not store Slack, Gmail, or other provider OAuth credentials.
- **FR-PE-57:** External applications must submit selected evidence rather than requiring Lore
  to fetch a complete source.
- **FR-PE-58:** The contract must support custom source kinds without a Lore Core release.
- **FR-PE-59:** An adapter must be able to submit a pre-structured proposal or request AI-assisted
  extraction from supplied evidence.

### 9.10 Web UI

- **FR-PE-60:** The Web UI must provide a review inbox for proposed items.
- **FR-PE-61:** Reviewers must be able to inspect evidence before accepting an item.
- **FR-PE-62:** The Web UI must provide a current project context view grouped by item type.
- **FR-PE-63:** The Web UI must provide a chronological project evolution timeline.
- **FR-PE-64:** Item detail must show status, rationale, evidence, review history, and typed
  relationships.
- **FR-PE-65:** The initial release does not require an interactive graph visualization.

---

## 10. Conceptual Data Model

The technical specification will finalize names and indexes. The minimum conceptual model is:

```text
projects
  `--< project_evolution_items
         |--< project_evolution_item_versions
         |--< project_evolution_evidence
         |--< project_evolution_events
         |--< project_evolution_relations >-- project_evolution_items
         `--< links to sessions, tasks, lessons, or patterns
```

### 10.1 Project Evolution Item

```text
id
project_id
type
revision
title
statement
rationale
status
proposed_by
approved_by
ai_confidence
ai_model
occurred_at
created_at
reviewed_at
```

### 10.2 Evidence

```text
id
item_id
source_kind
source_reference
external_source_id
excerpt
source_author
occurred_at
captured_by
created_at
```

### 10.3 Relationship

```text
id
project_id
from_item_id
to_item_id
relation_type
created_by
created_at
```

The model is a logical knowledge graph. PostgreSQL foreign keys provide integrity, pgvector
provides semantic seed retrieval, PostgreSQL full-text search provides lexical retrieval, and
relationship queries expand the relevant neighborhood.

---

## 11. Proposed MCP and REST Surface

Names are provisional until the technical specification is approved.

### 11.1 `propose_project_update`

Captures structured project knowledge and evidence, or accepts raw evidence for AI-assisted
extraction. Always returns a proposed item unless a trusted workflow policy applies.

### 11.2 `review_project_update`

Inspects, revises, accepts, or rejects a proposal. Revisions and review actions are appended;
existing records are not overwritten. Acceptance may declare that the proposal supersedes an
existing accepted item. The initial release uses Lore's existing project authentication;
fine-grained reviewer roles and scoped credentials are deferred.

### 11.3 `query_project_context`

Returns bounded current project context relevant to a natural-language question, task, or
workflow, including evidence citations, relevant relationships, and conflict warnings.

### 11.4 `get_project_history`

Returns filtered project evolution events and shows superseded, rejected, and contradictory
items.

### 11.5 `link_project_updates`

Creates or retracts validated typed relationships between project items and supported existing
Lore entities. Retraction appends an event rather than deleting the original relationship.

REST endpoints will mirror these capabilities for the Web UI and optional external adapters.

---

## 12. Delivery Scope

### 12.1 Phase 1 - Trusted Project Evolution Core

- Project Evolution item, evidence, review, and relation storage
- RLS policies and project isolation
- Manual Web UI and MCP/REST proposal capture
- Accept, revise, reject, and supersede workflow
- Current project context query
- Project history query and timeline
- PostgreSQL full-text, pgvector, and one- to two-hop relationship retrieval
- Links to tasks and Lore sessions

### 12.2 Phase 2 - AI-Assisted Capture

- Lore Core AI extraction from selected evidence, with pre-structured caller input supported
- Duplicate and relationship suggestions
- Configurable suggestion mode
- Capture confidence and model audit metadata
- Links from Project Evolution items to lessons and patterns

### 12.3 Future Adapter Ecosystem - Out of Current Scope

- Stable adapter SDK or documented capture contract
- Reference "Save to Lore" application for one communication provider
- Community-maintained Slack, Gmail, meeting, tracker, and editor adapters
- Per-project auto-capture policies that still create proposed items

### 12.4 Deferred Until Proven Necessary

- Dedicated graph database
- Interactive graph visualization
- Continuous provider synchronization
- Cross-project Project Evolution relationships
- Automated approval based only on model confidence
- Organization-wide identity and fine-grained evidence ACLs

---

## 13. Non-Functional Requirements

- **NFR-PE-01:** All Project Evolution data must be isolated by project using PostgreSQL RLS.
- **NFR-PE-02:** Existing Lore deployments must upgrade through additive, backward-compatible
  migrations.
- **NFR-PE-03:** Capture must acknowledge persisted proposals without waiting for embedding or
  AI extraction when those operations can run asynchronously.
- **NFR-PE-04:** Project-context retrieval should complete within 2 seconds at P95 for a project
  containing 10,000 evolution items under the documented reference deployment.
- **NFR-PE-05:** Accepted items and their evidence history must be auditable.
- **NFR-PE-06:** All write APIs must support idempotency.
- **NFR-PE-07:** Search and current-state results must be deterministic with respect to lifecycle
  status and supersession even when semantic services are unavailable.
- **NFR-PE-08:** Failure of AI extraction or embedding must not lose captured evidence.
- **NFR-PE-09:** Project Evolution must support both hosted and local embedding configurations
  already supported by Lore.
- **NFR-PE-10:** No proprietary communication provider must be required to use the feature.
- **NFR-PE-11:** Project history must be exportable as versioned JSON and streaming JSON Lines.
- **NFR-PE-12:** Logs must not include full evidence excerpts by default.
- **NFR-PE-13:** Canonical Project Evolution storage must be append-only. Any mutable current
  state projection must be fully rebuildable from canonical history.

---

## 14. Security and Privacy

Project Evolution may contain more sensitive information than engineering lessons. The first
release must therefore enforce the following:

1. Project isolation remains database-enforced.
2. Provider credentials remain outside Lore Core.
3. Adapters send selected evidence, not unrestricted source access.
4. Evidence excerpts are minimized to what supports the project item.
5. Security- or legal-mandated content erasure leaves an audited tombstone.
6. API and structured logs redact evidence content by default.
7. Automatic capture is opt-in and project-scoped.
8. Export and retention behavior is documented for self-hosted operators.

The initial release uses the existing project authentication boundary for review actions.
Fine-grained reviewer roles, scoped credentials, and separation-of-duty policies are deferred.

Fine-grained per-item access control is deferred. Projects that require different audiences
for sensitive evidence should initially use separate Lore project boundaries or store only an
approved summary and source reference.

---

## 15. Success Metrics

| Metric                                       | Initial Target                                      |
| -------------------------------------------- | --------------------------------------------------- |
| Accepted items with evidence                 | 100%                                                |
| AI-created items accepted without human review | 0                                                   |
| Duplicate creation from idempotent adapters  | 0                                                   |
| Canonical current-state query                | Returns accepted, non-superseded items consistently |
| Reference evolution scenario                | Correct current state, prior state, reason, evidence |
| Context query P95                            | Under 2 seconds at documented reference scale       |
| Existing Lore regression                     | Existing tests and public behavior remain green     |

Qualitative validation will ask developers and project leads whether they can answer these
questions without manually searching communication history:

- What is the current requirement?
- What did it replace?
- Why did it change?
- Which evidence supports the change?
- Which implementation work and lessons relate to it?

---

## 16. Open-Source and Extensibility Strategy

Project Evolution should create contribution surfaces without coupling Lore Core to every
provider.

Community contribution areas include:

- optional "Save to Lore" channel applications;
- editor and browser extensions;
- meeting transcript exporters;
- provider-neutral capture SDKs;
- alternative AI extraction providers;
- relationship extractors and ranking experiments;
- import/export tools; and
- timeline and relationship visualizations.

All adapters must target the documented generic capture contract. A provider-specific adapter
must not require provider-specific columns or credentials in Lore Core.

---

## 17. Risks and Mitigations

| Risk                                      | Mitigation                                                     |
| ----------------------------------------- | -------------------------------------------------------------- |
| Discussion mistaken for a decision       | Proposed lifecycle and explicit human review                   |
| Newest message treated as truth           | Accepted status and explicit supersession                      |
| AI extraction error                       | Editable proposals, evidence inspection, no confidence approval |
| Too much noisy context                     | Selected capture and bounded current-state retrieval           |
| Duplicate evidence across sources          | External IDs, hashes, and reviewable semantic suggestions      |
| Conflicting project statements             | Typed contradiction relationships and query warnings           |
| Provider integration scope growth          | Provider-neutral API and optional external applications         |
| Sensitive communication exposure           | Evidence minimization, RLS, redacted logs, audited deletion     |
| Graph infrastructure complexity            | Logical graph in PostgreSQL; dedicated graph database deferred  |
| Existing Lore concept becomes diluted      | Separate Project Evolution domain linked to Engineering Memory  |

---

## 18. Out of Scope for the First Release

- Built-in Slack or Gmail synchronization
- Provider-specific reference applications, including Slack or Gmail "Save to Lore" apps
- Full mailbox, channel, or meeting archives
- Provider OAuth management inside Lore Core
- Automatic acceptance of AI-generated project changes
- Dedicated graph database operation
- Interactive graph visualization
- Fine-grained evidence permissions within one project
- Cross-organization or public knowledge graphs
- Replacement of source documents or project trackers
- Automatic rewriting of external PRDs, tasks, or architecture documents

---

## 19. Open Questions

No product-scope questions remain open for this PRD. Technical design questions may be raised
in the architecture and technical specification.

---

## 20. MVP Acceptance Scenario

The first release is accepted when this flow works end to end:

1. A user records and accepts an initial project requirement.
2. A later discussion or research excerpt is captured as evidence for a proposed change.
3. Lore or the caller's AI assistant extracts a normalized replacement requirement.
4. An authorized reviewer appends a corrected revision when needed and accepts the proposal.
5. The replacement explicitly supersedes the original requirement.
6. A normal project-context query returns the replacement, not the original.
7. The response explains why the requirement changed and cites the evidence.
8. A history query returns both versions, their lifecycle actions, and their relationship.
9. The accepted requirement can be linked to a Lore session that implements it.
10. Existing lesson, pattern, session, and propagation workflows continue to work unchanged.

This scenario is the minimum proof that Lore can answer:

> What is the current project requirement, what was it before, why did it change, and which
> evidence confirms the change?
