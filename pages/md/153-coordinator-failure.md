In a distributed transaction, one node acts as the **coordinator** — it runs the two-phase commit (2PC) protocol by asking all participants to prepare, then issuing the final commit or abort. That design is clean and correct, but it hides a serious fragility: *what happens when the coordinator dies?*

## Why Coordinator Failure Is a Problem

During the prepare phase, participants lock their local resources and wait. Once a participant votes **Yes**, it has made a promise — it cannot unilaterally abort or commit without the coordinator's final instruction. If the coordinator crashes before sending that instruction, participants are left in a **blocking** state: they cannot release their locks, and they cannot safely make a decision on their own without risking inconsistency with other participants.

| Phase | Coordinator crashes here | Effect on participants |
|---|---|---|
| Before sending PREPARE | No participants voted yet | Participants time out and abort safely |
| After some participants vote YES | Mixed state — some locked | Remaining participants block indefinitely |
| After sending COMMIT/ABORT | Decision already delivered | Crash is harmless; participants finish |

The dangerous window is the middle case — some participants have voted Yes and locked rows, while others are still waiting. Neither side can act safely without the coordinator's decision.

> **Note:** This is why 2PC is called a *blocking* protocol. A coordinator crash in that window can hold locks open for minutes or hours.

## What Happens in Practice

Modern systems use three techniques to survive coordinator failure:

### 1. Persistent commit log

The coordinator writes COMMIT or ABORT to a durable write-ahead log **before** sending the message. If it crashes and restarts, it replays the log and re-sends. Participants accept duplicate messages gracefully (idempotent delivery).

### 2. Coordinator replication

If the coordinator is itself a replicated state machine, a surviving replica can be elected to take over. It reads the persisted log, finds the in-progress transaction, and either re-sends the decision or — if no decision was written — issues ABORT.

### 3. Participant escalation

Blocked participants can contact each other or a cluster manager to discover whether any sibling already received COMMIT or ABORT. If a quorum agrees on a decision, that decision is applied. This is the approach behind **Paxos Commit** and **3PC**, which add an extra round specifically to let participants make progress without the coordinator.

<figure class="diagram">
<svg viewBox="0 0 640 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing coordinator crash during two-phase commit and the blocking state it creates">
  <!-- Timeline axis -->
  <line x1="60" y1="40" x2="60" y2="270" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="300" y1="40" x2="300" y2="270" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="540" y1="40" x2="540" y2="270" stroke="var(--border)" stroke-width="1.5"/>

  <!-- Header labels -->
  <rect x="20" y="10" width="80" height="24" rx="4" fill="var(--accent)" opacity="0.15"/>
  <text x="60" y="26" text-anchor="middle" font-size="13" fill="var(--accent)" font-weight="bold">Coordinator</text>

  <rect x="260" y="10" width="80" height="24" rx="4" fill="var(--surface-2)"/>
  <text x="300" y="26" text-anchor="middle" font-size="13" fill="var(--text)">Participant A</text>

  <rect x="500" y="10" width="80" height="24" rx="4" fill="var(--surface-2)"/>
  <text x="540" y="26" text-anchor="middle" font-size="13" fill="var(--text)">Participant B</text>

  <!-- Step 1: PREPARE arrows -->
  <line x1="60" y1="70" x2="285" y2="95" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="60" y1="70" x2="525" y2="95" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="155" y="82" text-anchor="middle" font-size="12" fill="var(--text)">PREPARE</text>

  <!-- Step 2: YES votes -->
  <line x1="300" y1="110" x2="75" y2="130" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr)"/>
  <text x="195" y="118" text-anchor="middle" font-size="12" fill="var(--text)">YES</text>

  <line x1="540" y1="110" x2="75" y2="130" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr)"/>
  <text x="430" y="118" text-anchor="middle" font-size="12" fill="var(--text)">YES</text>

  <!-- Crash marker -->
  <line x1="30" y1="155" x2="90" y2="155" stroke="#e05" stroke-width="2"/>
  <line x1="30" y1="145" x2="90" y2="165" stroke="#e05" stroke-width="2"/>
  <line x1="30" y1="165" x2="90" y2="145" stroke="#e05" stroke-width="2"/>
  <text x="60" y="185" text-anchor="middle" font-size="12" fill="#e05" font-weight="bold">CRASH</text>

  <!-- Participants blocked -->
  <rect x="260" y="160" width="80" height="80" rx="4" fill="var(--surface-2)" stroke="#e05" stroke-width="1.5" stroke-dasharray="6,3"/>
  <text x="300" y="195" text-anchor="middle" font-size="12" fill="#e05">BLOCKED</text>
  <text x="300" y="212" text-anchor="middle" font-size="11" fill="var(--text)">(locks held)</text>

  <rect x="500" y="160" width="80" height="80" rx="4" fill="var(--surface-2)" stroke="#e05" stroke-width="1.5" stroke-dasharray="6,3"/>
  <text x="540" y="195" text-anchor="middle" font-size="12" fill="#e05">BLOCKED</text>
  <text x="540" y="212" text-anchor="middle" font-size="11" fill="var(--text)">(locks held)</text>

  <!-- Escalation arrow between participants -->
  <line x1="345" y1="200" x2="497" y2="200" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrc)"/>
  <line x1="497" y1="200" x2="345" y2="200" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="421" y="192" text-anchor="middle" font-size="11" fill="var(--accent)">escalate?</text>

  <!-- Time label -->
  <text x="10" y="275" font-size="11" fill="var(--text)" opacity="0.6">time →</text>
  <line x1="10" y1="270" x2="620" y2="270" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,4"/>

  <!-- Arrow markers -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
    <marker id="arrc" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>
</svg>
<figcaption>Coordinator crashes after both participants vote YES, leaving them blocked with locks held and unable to decide alone.</figcaption>
</figure>

## Three-Phase Commit: Avoiding the Block

3PC inserts a **pre-commit** phase between PREPARE and COMMIT. The coordinator sends `PRE-COMMIT` first, giving participants enough shared knowledge to decide unilaterally if the coordinator disappears:

- Never received `PRE-COMMIT` → no one committed yet → safe to abort.
- Received `PRE-COMMIT` → all participants voted YES → safe to commit.

The catch: 3PC still breaks down under *network partitions* (coordinator reachable by some nodes but not others). Production systems (Google Spanner, CockroachDB) prefer Paxos- or Raft-based consensus, which tolerates both crashes and partitions simultaneously.

<details class="reveal"><summary>Reveal: Can participants commit on their own after voting YES?</summary><div class="reveal-body">No — not in standard 2PC. Once a participant votes YES, it surrenders its right to decide unilaterally. It must wait for the coordinator's COMMIT or ABORT. If it committed on its own and another participant aborted (because it never received PREPARE), the transaction would be committed on one node and rolled back on another, violating atomicity. This is exactly the problem 3PC and Paxos Commit are designed to solve.</div></details>

## Key Takeaways

Coordinator failure reveals the core tension in distributed transactions: you need a single decision-maker to guarantee atomicity, but a single decision-maker is a single point of failure. Practical systems address this by writing decisions durably before sending them, replicating the coordinator, and ultimately moving toward consensus protocols (Paxos, Raft) that tolerate minority failures by design. This failure mode is why "just use 2PC" is never quite as simple as it sounds.
