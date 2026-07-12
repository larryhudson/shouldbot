# Shouldbot MVP Product Requirements Document

## Document status

- Status: Draft for implementation
- Product: Shouldbot
- MVP platform: Mobile-friendly web application backed by a self-hosted Flue service on a Linux server, with one ephemeral Docker sandbox per agent workflow and private access over Tailscale
- Primary user: A single configured user

## 1. Product summary

Shouldbot is a personal agent for the unresolved “I shoulds” in a person’s life.

Unlike a task manager, Shouldbot does not treat every should as a task to complete. It helps the user capture unstructured thoughts, understand why they matter, connect them to genuine personal value, and bring each should to an intentional resolution. Resolution can mean doing the thing, finding a better way to serve the underlying why, accepting the consequence of not doing it, or deciding that the should is not genuinely worth pursuing.

The primary interaction is a brain dump. The user can submit a long, unstructured reflection containing multiple new shoulds, updates to existing shoulds, completed actions, changing feelings, open questions, and unrelated life context. Shouldbot interprets the reflection as a whole, progressively loads relevant prior context from a Markdown workspace, updates that workspace, and returns a transparent batch response.

The MVP is an experiment in building a durable, filesystem-capable personal agent with the Flue framework.

## 2. Product thesis

The central product hypothesis is:

> When the real “why” behind a should is clear and kept present, the should becomes easier to assess, prioritize, act on, or intentionally release.

Shouldbot therefore treats a should as an unresolved tension connected to a desired life, personal value, need, relationship, consequence, or other meaningful truth. The action named in the should is a possible means, not necessarily the final goal.

For example:

- Should: Convert a foreign driving licence into a local licence.
- Practical consequence: Without a local licence, the user may be unable to share driving on a holiday.
- Relational why: The user's partner has already converted their licence and asked the user to do the same. Leaving the admin undone may place an avoidable burden on their partner and conflict with the kind of thoughtful, dependable partner the user wants to be.

## 3. Product principles

### 3.1 Brain-dump first

The user provides human-shaped input; Shouldbot does the structuring.

The user must be able to paste a long reflection containing any number of topics. The application must not require one should per submission, one question per answer, or completion of structured fields before capture.

### 3.2 The why is more durable than the action

Shouldbot should connect shoulds to their underlying reasons. It must remain open to the possibility that a different action would serve the same why better.

### 3.3 Match support to the source of friction

Different shoulds remain unresolved for different reasons. Shouldbot should distinguish, in its reasoning and response, between needs such as:

- Bounded administrative work
- Meaningful, emotionally significant planning
- Beneficial but non-urgent direction
- Recurring maintenance
- Behavioural practice or habit formation
- Exploration of an unresolved question
- Conscious release of an inherited or low-value obligation

These are prompt-level concepts in the MVP, not a required persisted schema.

### 3.4 Resolution is broader than completion

A should can be resolved because:

- The user did it.
- The user found a better way to serve its underlying why.
- Circumstances changed.
- The user decided it was not genuinely theirs or not worth doing.
- The user consciously accepted the consequence of not doing it.

Shouldbot must not equate deletion, abandonment, or release with failure.

### 3.5 Transparent interpretation

Shouldbot must distinguish what the user directly said from what the agent inferred. Important assumptions must be visible and easy to correct, refine, or reject.

### 3.6 Helpful rather than guilt-inducing

Shouldbot should reconnect the user with value and offer realistic next moves. It must not use shame, moralize missed actions, manufacture urgency, or turn every passing thought into a commitment.

### 3.7 Progressive context loading

The agent should not load the complete personal history for every interaction. It should first inspect document paths and descriptions, then read only the documents relevant to the current reflection or prompt-generation task.

### 3.8 The user remains the authority

Shouldbot maintains an evolving interpretation, not an objective psychological profile. Personal truths can change. The application must make material interpretations inspectable and correctable.

### 3.9 Brain dumps are primary, not exclusive

Brain dumps are the primary source of reflection, intention, meaning, uncertainty, and correction. They do not need to remain the only source of factual context.

The product should leave room for future integrations to contribute events such as a task being created, completed, postponed, or changed in a system like Todoist or Linear. These events can reduce the amount of activity reporting required in a brain dump, allowing the user to focus more on why something matters, how it feels, what has changed, and what the activity means.

External events are evidence, not self-interpreting truth. Completing a task does not necessarily resolve its underlying should; postponing one does not explain why; and a task-system label does not establish the user’s motivation. Shouldbot must preserve the source of external information and combine it with the user’s reflective context rather than silently treating it as authoritative personal meaning.

## 4. Goals for the MVP

The MVP will test whether Shouldbot can:

1. Accept a long, unstructured, multi-topic brain dump.
2. Reliably identify new shoulds and updates to existing shoulds within the same submission.
3. Preserve the original reflection as source material.
4. Progressively find and load relevant existing context.
5. Create and maintain useful Markdown documents about shoulds and broader personal context.
6. Capture meaningful whys without forcing a rigid data model.
7. Surface consequential assumptions and uncertainties.
8. Return a concise batch summary of what it heard and changed.
9. Generate dynamic, optional prompts for a later brain dump using prior reflections and current context.
10. Demonstrate a continuing, durable agent experience using Flue.
11. Keep the context-ingestion boundary extensible so future external events can inform the same context layer without redesigning the memory model.

## 5. Non-goals for the MVP

The MVP will not initially include:

- Direct audio upload or speech-to-text. Users can paste text or a transcript from another application.
- Push notifications, scheduled reminders, or background jobs.
- Calendar, email, task manager, job board, or other third-party integrations. The MVP leaves an ingestion boundary for them but does not build or authenticate any integration.
- Autonomous completion of external actions.
- A hard relational database schema for memories, truths, or shoulds.
- Multi-user support, shared shoulds, or collaboration with other people.
- Sophisticated semantic search or embeddings.
- Automatic psychological diagnosis or claims about hidden motivations.
- Native mobile applications.
- A comprehensive task-management interface.
- Concurrent context-writing agent interactions. The MVP assumes one active interaction at a time and fails loudly if the canonical GitHub branch changes during an interaction.

These may follow if the core reflection-and-memory loop proves useful.

## 6. Primary user experience

### 6.1 Reflection preparation

Before a brain dump, the user can ask for or view a small number of optional thinking prompts.

The prompts must be dynamically generated from current shoulds, prior reflections, open questions, helpful patterns, commitments, recent changes, and agent assumptions. They must not be a fixed checklist.

Example prompts:

- “A few weeks ago you wondered whether joining a local group would help you feel more connected. Where has that thinking gone?”
- “Laying out your clothes seemed to help with morning movement. Did that continue?”
- “The licence matters partly because you do not want holiday driving to fall entirely to your partner. Has anything moved there?”
- “What is taking up mental space that is not represented here yet?”

Prompts are invitations, not questions that must be answered individually. The interface must make it clear that the user can ignore them, address several at once, introduce unrelated topics, or roam freely.

### 6.2 Brain-dump submission

The application presents a large, mobile-friendly text input suitable for pasting a transcript or writing a long reflection.

A single submission can contain:

- Multiple new shoulds
- Updates about existing shoulds
- Completed or attempted actions
- Changed opinions or motivations
- New life circumstances
- Open questions
- Observations about what helped or hindered
- Corrections to Shouldbot’s prior understanding

The application must not require the user to label, split, categorize, or order these topics.

### 6.3 Agent processing

For each reflection, Shouldbot must:

1. Save the original submitted text as a dated reflection document before curating its meaning into other files.
2. List available Markdown documents with their descriptions.
3. Select and read the documents relevant to the reflection.
4. Identify new shoulds, updates, resolutions, contextual changes, patterns, open questions, and possible assumptions.
5. Create or update Markdown documents as appropriate.
6. Preserve uncertainty rather than fabricate missing facts.
7. Avoid marking a should completed unless the user’s words reasonably support that conclusion.
8. Update a document’s frontmatter description whenever its contents materially change.
9. Produce a batch response explaining its interpretation and material changes.

### 6.4 Batch response

The response should be organized around the reflection as a whole rather than forcing the user into a sequence of narrow follow-up questions.

Where applicable, it should include:

- What Shouldbot heard
- Existing shoulds that were updated
- New shoulds or contextual knowledge it recorded
- Shoulds that may have been resolved, replaced, or released
- Important assumptions or uncertainties
- A small number of possible next moves

The response should be concise relative to the submitted reflection. It may ask for clarification, but non-critical ambiguity should normally be recorded and revisited later instead of blocking the entire update.

The user must be able to correct several interpretations in a single natural-language reply.

### 6.5 Future event inputs

The MVP user interface only needs to submit brain dumps and conversational follow-ups. The application architecture should nevertheless distinguish the source reflection from the processing operation so a future version can invoke context processing with non-conversational events.

Potential future events include:

- A Todoist or Linear task being created, updated, completed, reopened, or deleted
- A calendar event approaching or finishing
- A recurring activity being recorded by another application
- A change from another user-authorized personal system

An external event should retain source provenance, including the originating system, external identifier where available, event time, ingestion time, event kind, and original payload or a lossless-enough representation. This is a future integration requirement, not a requirement to impose those fields on Markdown memory documents in the MVP.

The future event-processing path should be able to:

1. Preserve or reference the source event.
2. Progressively load relevant context using the same document index.
3. Update context conservatively when the event supports a factual change.
4. Record ambiguity when the event does not establish meaning or resolution.
5. Make the event available to later dynamic prompts and brain dumps.

Examples:

- A completed “Submit licence application” task is evidence that an action occurred, but Shouldbot may still need reflection or stronger evidence before resolving the broader licence should.
- Several postponed community-event tasks may be worth mentioning in a future prompt, but they do not prove laziness, loss of interest, or any other motivation.
- A task title may link to an existing should without becoming a new should document of its own.

## 7. Filesystem memory

### 7.1 Storage approach

The MVP stores durable agent context as Markdown files in a dedicated private GitHub repository. During an interaction, the self-hosted application provisions an ephemeral Docker sandbox on the Linux execution server, clones the repository into that sandbox, and makes the checkout available to the Flue agent through bounded tools.

The private GitHub repository is the canonical context store. A sandbox checkout is disposable working state and must never be treated as the only durable copy of the user’s context.

The organization may begin as:

```text
memory/
  reflections/
  shoulds/
  context/
  now.md
```

This layout is a convention, not a hard semantic schema. The agent may create appropriate subdirectories and documents as its understanding develops, subject to filesystem tool restrictions.

### 7.2 Suggested document responsibilities

- `memory/reflections/`: Dated source reflections. The original user submission must be preserved verbatim or in a clearly delimited verbatim section.
- `memory/shoulds/`: Evolving documents for significant unresolved shoulds and their histories.
- `memory/context/`: Flexible documents for broader context such as truths, assumptions, open questions, patterns, people, or strategies.
- `memory/now.md`: Optional compact orientation to the currently relevant threads and likely near-term revisit points.

The prompt may introduce these conventions, but the application must not validate a fixed set of headings or memory categories in the MVP.

### 7.3 Required frontmatter

Every Markdown document created or updated through the memory tools must contain YAML frontmatter with a non-empty string `description` field.

Example:

```markdown
---
description: >-
  An open administrative should about converting the user's foreign
  licence, motivated by sharing driving responsibilities with their partner.
---

# Convert foreign driving licence
```

The description must summarize the document’s current purpose and substance. It must be useful to an agent deciding whether to load the full document and should not merely repeat the filename or title.

Whenever the document changes materially, its description must also be reviewed and updated if necessary.

### 7.4 Progressive disclosure

Listing documents must return, at minimum:

- Workspace-relative path
- Frontmatter description

Listing must not return every document’s full content.

The agent uses these descriptions to choose which documents to read in full. The MVP should support recursively listing all Markdown documents and, if straightforward, limiting a listing to a subtree.

### 7.5 Source and interpretation

The filesystem must preserve the distinction between:

1. Original reflection: what the user submitted.
2. External source event: what an authorized integration reported, when integrations are added.
3. Agent interpretation: extracted meaning, links, uncertainties, and proposed assumptions.
4. Evolving record: the curated documents Shouldbot uses in future interactions.

The original reflection must remain available when a later correction or ambiguity needs to be checked.

Future external events must likewise retain their source provenance. The MVP does not need to create an events directory or implement an event schema, but its memory conventions must not assume that all future evidence originates in conversation.

## 8. Memory tools

The Flue agent must receive bounded tools rather than unrestricted access to the host filesystem.

### 8.1 List documents

`listDocuments(path?)` must:

- Operate only within the configured memory root.
- Recursively find Markdown files under the requested path.
- Parse each file’s frontmatter.
- Return its relative path and description.
- Report malformed or missing descriptions clearly.
- Return deterministic ordering.

### 8.2 Read document

`readDocument(path)` must:

- Operate only within the configured memory root.
- Read only Markdown documents.
- Return the document’s full content, including frontmatter.
- Produce a clear error for a missing, invalid, or disallowed path.

### 8.3 Write document

`writeDocument(path, content)` must:

- Operate only within the configured memory root.
- Create or replace only Markdown documents.
- Reject path traversal and paths outside the memory root.
- Parse and validate YAML frontmatter.
- Reject content without a non-empty string `description`.
- Return the saved path and description.
- Make it possible for the agent to correct a rejected write and try again.

### 8.4 Reflection preservation

The implementation must prevent accidental loss or silent replacement of the original reflection. This may use a dedicated `saveReflection` tool, create-only semantics for reflection paths, or another simple safeguard.

## 9. GitHub-backed persistence

### 9.1 Repository separation

Application source and personal context must be stored in separate repositories:

- The Shouldbot application repository contains source code, instructions, tools, tests, and synthetic fixtures.
- A dedicated private context repository contains the user’s real reflections and evolving Markdown memory.

The real context repository must not be committed into the application repository. Tests and local development must use synthetic or disposable context repositories unless the user explicitly configures the real repository.

### 9.2 Interaction transaction

One successfully processed agent interaction must produce one atomic Git commit containing all related context changes.

The application-owned interaction lifecycle is:

1. Obtain a short-lived credential for the configured private context repository.
2. Provision a fresh Docker sandbox on the Linux execution server, then clone or fetch the latest canonical default branch into it.
3. Record the starting remote commit SHA.
4. Save the original reflection.
5. Allow the agent to read and update context through bounded memory tools.
6. Validate the complete Markdown workspace and resulting diff.
7. Verify that the remote default branch still points to the starting SHA.
8. Commit the complete interaction as one changeset.
9. Push the commit to the canonical branch.
10. Return the agent response and persisted commit identifier.
11. Destroy the sandbox checkout and discard its credential when the run finishes.

The agent may propose and write document changes, but Git operations are owned by application code. The model must not receive Git shell access, GitHub credentials, or the ability to alter remotes or history.

If processing or validation fails before the push, no partial context update becomes canonical.

### 9.3 Commit contents

A commit should describe the interaction rather than each low-level file operation. Its message should identify the reflection date or interaction and summarize the material context changes without unnecessarily exposing sensitive detail in the commit subject.

The persisted commit SHA should be retained with the completed interaction and may be shown in the interface as a memory revision. A future interface may present a human-readable document diff, but a polished diff viewer is not required for the MVP.

### 9.4 Authentication

The application should authenticate with a dedicated GitHub App that:

- Is installed only for the configured private context repository.
- Has repository contents read and write permission and no unrelated repository, organization, or user permissions.
- Produces short-lived installation access tokens for sandbox interactions.
- Keeps the GitHub App private key and token-minting capability outside the model’s context and tools.

The short-lived installation token must be made available only to application-owned Git operations for the duration of the sandbox run. It must not be written into repository files, committed Git configuration, agent-visible tool output, application logs, or clone URLs that may be logged.

For local development, an alternative developer credential may be supported, but production architecture and documentation must use the GitHub App flow.

### 9.5 Remote-update failure policy

The MVP assumes only one context-writing agent interaction at a time and does not need to implement queues, locks, automatic merges, or concurrent retries.

Before committing or pushing, the application must compare the canonical remote branch with the SHA recorded at the start of the interaction. If it has changed, the interaction must fail loudly without pushing, overwriting, force-pushing, rebasing, or attempting an agent-authored merge. The failure must explain that the context changed during processing and that the interaction should be retried against the latest context.

### 9.6 Failure and recovery

- A failed push must leave the canonical remote history unchanged.
- The application must never force-push automatically.
- Temporary checkout data and credentials must be cleaned up after successful and failed runs.
- A sandbox disappearing after a successful push must not lose context.
- A sandbox disappearing before a successful push may lose the uncommitted attempt, but the original user request and failure must be reported clearly so it can be retried.

## 10. Agent memory and reasoning behaviour

Shouldbot’s instructions must establish the following behaviours.

### 10.1 Interpret shoulds in context

For a should, attempt to understand:

- What the user currently believes they should do
- Why it matters
- What happens if it remains undone
- Whether it serves a broader truth, value, need, relationship, or desired life
- What makes it difficult or easy to act on
- Whether it is still the right means to the underlying end

These are reasoning prompts, not mandatory document fields.

### 10.2 Maintain provenance

The agent must distinguish:

- Direct statements from the user
- Reasonable interpretations
- Speculative hypotheses

It must not silently promote an inference into a confirmed personal truth.

### 10.3 Surface assumptions selectively

The agent should surface assumptions when they:

- Materially affect prioritization or advice
- Connect multiple areas of the user’s life
- Conflict with new information
- Have remained influential without confirmation
- Concern a sensitive motivation or relationship

It need not enumerate every mundane inference.

When surfacing an assumption, it should use tentative language and make correction easy.

### 10.4 Allow personal context to evolve

Past statements must be treated as dated evidence, not permanent facts. The agent should revisit older understandings when later reflections contradict them or suggest change.

### 10.5 Avoid over-interrogation

The agent should not ask one question for every ambiguity. It should make safe updates, record uncertainty, and ask only the most useful clarifying questions. It must remain comfortable with a brain dump that spans many topics.

### 10.6 Avoid false progress

Thinking, researching, attempting, scheduling, and completing are meaningfully different. The agent must describe progress accurately and avoid claiming that an action was completed when the user only considered or began it.

### 10.7 Keep prompts dynamic and bounded

When generating reflection prompts, the agent should choose a small, varied set based on what is most likely to unlock useful reflection. It must not produce one prompt per open should or turn the reflection into a status meeting.

At least one prompt should ordinarily leave room for new or unrepresented concerns.

## 11. Initial example shoulds

The following examples will be useful as realistic development and evaluation material. They are not hard-coded application content.

### 11.1 Convert a foreign driving licence

The user moved countries and can no longer use their original licence locally. Their partner has already converted theirs and asked the user to do the same. If it remains undone, they may book a holiday where the partner is the only person able to drive. The should concerns sharing practical burdens and being a thoughtful partner, not merely completing admin.

### 11.2 Plan a meaningful personal event

A significant, personal, emotionally meaningful project requiring thought and research. The agent should help create reflective space and practical momentum without reducing it to a generic checklist or removing its personal character.

### 11.3 Explore local community activities

The user feels they may not be getting the most from where they live. The should is beneficial but not urgent and may require gentle momentum. There is an open question about whether joining an organized group is the true desired change or one possible route toward greater belonging and participation in the local community.

### 11.4 Replace the coffee-machine water filter

A small, periodic maintenance should that can be completed and revisited on a schedule, such as every two months.

### 11.5 Morning gym or walk

A behavioural practice rather than a conventional overdue task. The user knows morning movement improves the start of their day but often chooses immediate comfort. Missing one morning should not create a permanently overdue task; the agent should support a fresh choice and learn which strategies help.

## 12. Application interface

The MVP should provide a minimal, mobile-friendly web interface with:

- A large text area suitable for long brain dumps and pasted transcripts
- A clear way to submit a reflection
- A view of the agent’s streamed or final response
- A way to request or view dynamically generated reflection prompts
- A continuing conversation so the user can correct the agent or follow up naturally

An administrative memory browser is optional for the first MVP, provided the Markdown workspace is directly inspectable during development. A polished task-list interface is explicitly not required.

### 12.1 User authentication

The deployed web application must require GitHub authentication. It is a single-user application for the MVP and must authorize one configured GitHub numeric user ID rather than granting access to any GitHub user who can complete the login flow.

Authentication should use the GitHub App web application flow. After a successful callback, the application must verify the GitHub identity, create a secure application session, and avoid exposing the GitHub user access token to frontend code. Sessions must use secure, HTTP-only cookies and the OAuth flow must protect against login CSRF with validated state.

The same private GitHub App may provide both user authorization and installation-level access to the context repository, but these are distinct credentials and privileges:

- A user authorization flow establishes that the browser user is the configured GitHub account.
- A GitHub App installation token gives application-owned Git operations temporary access to the configured private context repository.

Signing in must not make the user authorization token available to the agent or use it for context Git operations.

## 13. Technical direction

- Use TypeScript.
- Use Flue to define the continuing Shouldbot agent and its tools.
- Deploy the Flue Node.js target on a trusted self-hosted Linux server and expose the application over a private network.
- Use a project-owned Flue sandbox adapter to provision one ephemeral Docker container per agent workflow on that server.
- Keep container creation, readiness checks, resource limits, timeout enforcement, and deletion application-owned. Containers must be removed after both successful and failed workflows.
- Do not mount the Docker control socket or other host-control interfaces into an agent sandbox.
- Use Pi’s `openai-codex` provider with the configured user's supported ChatGPT subscription as the initial model connection.
- Keep the exact `openai-codex/<model>` specifier configurable so the application can track models available to the subscription without code changes.
- Complete the Pi/OpenAI Codex OAuth login as an explicit setup step on a trusted machine. Store one or more resulting OAuth credential files in host-managed secret storage on the Linux server, make them available only to the Flue control-plane process at the configured auth directory, select configured subscriptions round-robin per workflow, and provide writable secure persistence for refreshed credentials and the selection cursor.
- Never place Pi’s OAuth auth file in the application repository, context repository, Docker sandbox, frontend bundle, or agent-visible memory tools.
- Use a dedicated private GitHub repository as the canonical durable context store.
- Clone the context repository into the sandbox for each interaction and discard the checkout afterwards.
- Commit all context changes from one successful interaction atomically and push them only after validation and a remote-SHA check.
- Use a narrowly scoped GitHub App and short-lived installation tokens for repository authentication.
- Keep the GitHub App private key and token-minting capability in the trusted control plane. A sandbox may receive only an interaction-scoped Git capability that cannot be accessed by model-directed tools or persisted in the checkout.
- Use the GitHub App web authorization flow for single-user login and allow only the configured GitHub numeric user ID.
- Keep Git credentials and Git operations outside the agent’s tools and model context.
- Keep the memory storage boundary behind typed tools so the Git or sandbox implementation can change later.
- Separate context processing from the brain-dump HTTP handler so future event sources can invoke the same progressive context-loading and update behaviour.
- Do not make the agent’s core instructions assume that all factual evidence must have been stated in a brain dump; require source-aware reasoning instead.
- Keep agent behaviour in a readable Markdown instruction file where practical.
- Do not commit user secrets or model-provider credentials.

## 14. Acceptance scenarios

### Scenario A: Multi-topic initial brain dump

Given an empty memory workspace, when the user submits one brain dump describing the five example shoulds, Shouldbot:

- Saves the original reflection.
- Creates useful documents for the distinct shoulds.
- Records meaningful whys expressed in the reflection.
- Does not require the user to resubmit each should separately.
- Returns one coherent batch summary.
- Clearly labels material assumptions rather than presenting them as facts.

### Scenario B: Multi-topic status update

Given existing documents for community activities, morning movement, coffee-filter maintenance, and the driving licence, when the user says they browsed local events twice, went to the gym twice, changed the filter, and still avoided the licence, Shouldbot:

- Loads the relevant existing documents based on their descriptions.
- Records job browsing as progress, not job application or completion.
- Records the gym activity and any stated helpful strategy.
- Resolves the current filter occurrence without closing the recurring concern forever.
- Keeps the licence open and updates relevant context.
- Produces a batch summary of all changes.

### Scenario C: Correction of an assumption

Given a persisted assumption that joining local events is primarily about belonging in the local community, when the user says that interpretation is wrong and the real concern is making time for a neglected hobby, Shouldbot:

- Preserves the correction in the new reflection.
- Updates or supersedes the assumption.
- Updates affected document descriptions if their substance has changed.
- Does not continue presenting the rejected interpretation as fact.

### Scenario D: Dynamic prompts

Given several weeks of reflections, should updates, open questions, and recorded strategies, when the user requests prompts for a new brain dump, Shouldbot:

- Generates a small number of prompts grounded in the stored history.
- Revisits at least one relevant earlier statement or unresolved question.
- Does not generate one prompt for every open should.
- Includes room for new topics.
- Uses tentative language for unconfirmed interpretations.

### Scenario E: Safe document operations

When the agent attempts to write a Markdown document without a description, write a non-Markdown file, overwrite protected reflection source text, or access a path outside the memory root, the tool rejects the operation with a clear, recoverable error.

### Scenario F: Atomic GitHub persistence

Given the configured private context repository has not changed during processing, when an interaction successfully updates several context documents, the application validates the changes, creates one commit for the complete interaction, pushes it to the canonical branch, and returns the persisted commit identifier.

### Scenario G: Remote branch changes during processing

Given the remote default branch points to commit A when an interaction begins, when another writer advances it to commit B before Shouldbot pushes, Shouldbot fails the interaction loudly and does not push, force-push, rebase, merge, or overwrite either history. The response tells the user that context changed and the interaction must be retried.

### Scenario H: Sandbox failure

Given an interaction is running in an ephemeral sandbox, when the sandbox fails before a successful push, the canonical context repository remains unchanged and the application reports that the interaction was not persisted. When the sandbox is destroyed after a successful push, a later sandbox can clone the repository and continue with the saved context.

## 15. Definition of done for the first MVP

The first MVP is done when:

1. A developer can install dependencies, configure a supported model and private GitHub context repository, and start the application using documented commands.
2. A user can open the mobile-friendly web interface and submit a long, multi-topic text reflection.
3. The request is handled by a continuing Flue agent rather than a stateless one-off text-generation call.
4. The original reflection is saved safely as a dated Markdown document.
5. The agent can recursively list Markdown memory with paths and frontmatter descriptions without loading every document body.
6. The agent can selectively read relevant Markdown documents.
7. The agent can create and update Markdown documents only through bounded filesystem tools.
8. Document writes enforce a non-empty frontmatter `description` and safe paths.
9. The agent can create several should documents and update several existing documents from one brain dump.
10. The agent’s response summarizes its material interpretations and changes as a batch.
11. The agent surfaces consequential assumptions or uncertainty and accepts natural-language correction.
12. The user can request dynamic prompts grounded in prior stored context.
13. The five initial example shoulds and the acceptance scenarios above are exercised through automated tests, repeatable evals, or documented manual test transcripts.
14. Agent interactions run in a fresh ephemeral Docker sandbox on the self-hosted Linux server whose checkout and container are destroyed after completion.
15. A successfully processed interaction creates exactly one validated commit in the private context repository and returns its SHA.
16. A new sandbox can clone the context repository and use context saved by an earlier sandbox.
17. GitHub authentication uses a repository-scoped GitHub App installation token held by the trusted control plane, and the token is not available to the model or persisted in repository files, container layers, process arguments, or logs.
18. If the remote branch changes during processing, the application fails loudly without pushing or attempting to merge histories.
19. Failed or interrupted processing does not leave a partial commit on the canonical branch.
20. Setup, architecture, GitHub App configuration, memory conventions, privacy limitations, and known MVP limitations are documented.
21. No API keys, GitHub credentials, personal secrets, or unintended private reflection data are committed to the application repository.
22. The documented architecture identifies a source-aware context-processing boundary that future API integrations can use without bypassing memory validation, provenance, or Git persistence.
23. The production path provisions and destroys a Docker sandbox for every workflow through application-owned code, applies documented resource and time limits, does not expose the Docker socket inside the sandbox, and passes only the capabilities required for the interaction.
24. The application successfully invokes a configurable `openai-codex` model using ChatGPT subscription OAuth credentials stored outside both Git repositories and outside the agent sandbox.
25. The deployed interface rejects unauthenticated requests and authenticated GitHub users other than the configured numeric user ID.
26. GitHub browser-login credentials and GitHub App installation credentials remain separate and neither is exposed to the model or frontend.

## 16. Success criteria for the experiment

The MVP should be considered promising if, during real use:

- A ten-minute brain dump feels easier than manually organizing the same thoughts.
- The resulting documents accurately preserve the important whys and distinctions between shoulds.
- The user rarely needs to correct factual status changes such as attempted versus completed.
- Corrections are easy and improve future behaviour.
- Dynamic prompts feel relevant and occasionally reveal a useful connection or changing belief.
- The agent’s memory makes it more useful over time without making it feel intrusive, rigid, or guilt-inducing.
- The user wants to return for another reflection without being externally compelled.

## 17. Risks and open questions

### Product risks

- The agent may over-structure reflective input and make it feel like task administration.
- It may infer motivations too confidently or surface sensitive context inappropriately.
- Generated prompts may become repetitive, guilt-inducing, or too focused on existing shoulds.
- Files and descriptions may drift, duplicate one another, or become stale.
- A growing document listing may eventually require search or indexing.
- The agent may mark progress or completion inaccurately.
- A GitHub credential may leak through logs, process arguments, Git configuration, or agent-visible tool output if the authentication boundary is implemented incorrectly.
- Highly personal context remains present in earlier Git history even after a document is edited or deleted.
- A Docker sandbox or self-hosted server failure before push may require the user to retry an interaction.
- Future external integrations may create noisy, duplicated, misleading, or overly granular events that crowd out reflective context.
- The agent may over-interpret task activity as evidence about motivation or treat task completion as equivalent to resolving a should.

### Open questions after the MVP

- Should the product add direct audio capture and transcription?
- Which prompts, reminders, or scheduled reflections are welcome, and how persistent should they be?
- Should users have a dedicated interface for inspecting and editing truths, assumptions, and shoulds?
- How should sensitive memories be marked so they are not proactively resurfaced?
- Which recurring concerns should become scheduled workflows?
- Which external actions should Shouldbot eventually be allowed to perform, and what approvals should they require?
- Which external system should provide the first read-only event integration, and which event types are useful enough to retain?
- Should high-volume external events be committed individually, batched, summarized, or kept outside the curated Markdown workspace?
- How should external events be deduplicated and linked to existing shoulds without creating a rigid universal event schema?
- Should context be encrypted before being stored remotely, accepting the loss of readable GitHub diffs?
- Should a future version serialize interactions with a queue or support optimistic retries when multiple interactions overlap?
- When should older context be archived, summarized, or forgotten?
