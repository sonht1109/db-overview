In a single-node database, "who decides what is true?" has an obvious answer: the one machine running the engine. But once you spread data across multiple nodes — for fault tolerance, scalability, or geography — that question becomes surprisingly hard. **Consensus** is the family of algorithms that let a group of nodes agree on a single value or a sequence of decisions, even when some nodes crash or messages are delayed. Understanding what consensus *solves* is the foundation for making sense of everything from leader election to distributed commits.

## The Core Problem: Agreeing in the Face of Failure

Imagine three database replicas — A, B, and C — that all hold the same data and accept writes. A client sends a write to node A. A applies it locally and tells B and C. Simple enough — until node A crashes mid-broadcast. Now B has the new value but C does not. Which one is "right"? And if B becomes the new leader, does C silently fall behind forever?

This is not an edge case. Networks drop packets. Servers reboot. A "slow" node is indistinguishable from a dead one. Without a protocol that handles these failures, distributed systems either:

- **Give up consistency** — different nodes may return different answers for the same query, or
- **Give up availability** — they refuse to serve requests until every node is reachable.

Consensus protocols take a third path: they guarantee that a **quorum** (a majority) of nodes always agrees on the next value, so the system stays correct even when a minority of nodes fail.

## What "Agreement" Actually Means

A consensus protocol must satisfy three properties simultaneously:

| Property | Plain meaning |
|---|---|
| **Agreement** | No two correct nodes decide differently |
| **Validity** | The decided value must be one that some node actually proposed |
| **Termination** | Every correct node eventually decides (it doesn't loop forever) |

These sound obvious, but they are surprisingly hard to achieve together when nodes can fail. The famous **FLP impossibility result** (Fischer, Lynch, Paterson 1985) proves that no deterministic consensus algorithm can guarantee *all three* properties in a purely asynchronous network where even one node might crash. Real systems work around this by adding **timeouts** and **randomization** — accepting that in pathological network conditions they may slow down, but in practice they make progress quickly.

> **Note:** "Consensus" in distributed systems is not just about agreement on data values. It underpins leader election (who is the primary?), distributed transactions (did everyone commit?), and log replication (what is the next entry?).

## The Classic Failure Scenario

<figure class="diagram">
<svg viewBox="0 0 620 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing a split-brain scenario without consensus versus coordinated agreement with consensus">
  <!-- Labels -->
  <text x="10" y="22" font-size="13" font-weight="bold" fill="var(--text)">Without consensus</text>
  <text x="340" y="22" font-size="13" font-weight="bold" fill="var(--text)">With consensus (quorum)</text>
  <!-- Divider -->
  <line x1="315" y1="10" x2="315" y2="300" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 3"/>

  <!-- LEFT SIDE: no consensus -->
  <!-- Nodes -->
  <rect x="20" y="40" width="70" height="30" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="55" y="60" font-size="13" text-anchor="middle" fill="var(--text)">Node A</text>
  <rect x="110" y="40" width="70" height="30" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="145" y="60" font-size="13" text-anchor="middle" fill="var(--text)">Node B</text>
  <rect x="200" y="40" width="70" height="30" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="235" y="60" font-size="13" text-anchor="middle" fill="var(--text)">Node C</text>

  <!-- Timeline lines -->
  <line x1="55" y1="70" x2="55" y2="280" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="145" y1="70" x2="145" y2="280" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="235" y1="70" x2="235" y2="280" stroke="var(--border)" stroke-width="1.5"/>

  <!-- Write arrives at A -->
  <text x="10" y="100" font-size="11" fill="var(--text)">write x=5</text>
  <line x1="55" y1="95" x2="55" y2="95" stroke="var(--accent)" stroke-width="2"/>
  <circle cx="55" cy="97" r="4" fill="var(--accent)"/>

  <!-- A replicates to B -->
  <line x1="55" y1="115" x2="145" y2="130" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 2"/>
  <circle cx="145" cy="130" r="4" fill="var(--accent)"/>
  <text x="80" y="118" font-size="11" fill="var(--text)">x=5 →</text>

  <!-- A crashes before reaching C -->
  <text x="30" y="165" font-size="11" fill="#e05c5c">CRASH</text>
  <line x1="45" y1="155" x2="68" y2="175" stroke="#e05c5c" stroke-width="2"/>
  <line x1="68" y1="155" x2="45" y2="175" stroke="#e05c5c" stroke-width="2"/>

  <!-- C still has old value -->
  <circle cx="235" cy="200" r="4" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="200" y="220" font-size="11" fill="#e05c5c">x = ??? </text>
  <text x="195" y="234" font-size="11" fill="#e05c5c">(stale)</text>

  <!-- B has new value -->
  <text x="110" y="220" font-size="11" fill="var(--text)">x = 5</text>

  <!-- Conflict label -->
  <text x="30" y="270" font-size="11" fill="#e05c5c">Split brain — nodes disagree</text>

  <!-- RIGHT SIDE: with consensus -->
  <!-- Nodes -->
  <rect x="340" y="40" width="70" height="30" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="375" y="60" font-size="13" text-anchor="middle" fill="var(--text)">Node A</text>
  <rect x="428" y="40" width="70" height="30" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="463" y="60" font-size="13" text-anchor="middle" fill="var(--text)">Node B</text>
  <rect x="516" y="40" width="70" height="30" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="551" y="60" font-size="13" text-anchor="middle" fill="var(--text)">Node C</text>

  <line x1="375" y1="70" x2="375" y2="280" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="463" y1="70" x2="463" y2="280" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="551" y1="70" x2="551" y2="280" stroke="var(--border)" stroke-width="1.5"/>

  <!-- Leader proposes -->
  <circle cx="375" cy="97" r="4" fill="var(--accent)"/>
  <text x="340" y="100" font-size="11" fill="var(--text)">propose x=5</text>

  <!-- Propose messages -->
  <line x1="375" y1="110" x2="463" y2="125" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 2"/>
  <line x1="375" y1="110" x2="551" y2="125" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 2"/>
  <circle cx="463" cy="125" r="4" fill="var(--accent)"/>
  <circle cx="551" cy="125" r="4" fill="var(--accent)"/>

  <!-- Acks back -->
  <line x1="463" y1="140" x2="375" y2="155" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 2"/>
  <line x1="551" y1="140" x2="375" y2="155" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="380" y="155" font-size="11" fill="var(--text)">✓ quorum</text>

  <!-- Commit broadcast -->
  <line x1="375" y1="168" x2="463" y2="183" stroke="var(--accent)" stroke-width="1.5"/>
  <line x1="375" y1="168" x2="551" y2="183" stroke="var(--accent)" stroke-width="1.5"/>
  <circle cx="463" cy="183" r="4" fill="var(--accent)"/>
  <circle cx="551" cy="183" r="4" fill="var(--accent)"/>

  <!-- All committed -->
  <text x="428" y="215" font-size="11" fill="var(--text)">x = 5</text>
  <text x="516" y="215" font-size="11" fill="var(--text)">x = 5</text>
  <text x="344" y="215" font-size="11" fill="var(--text)">x = 5</text>

  <!-- Success label -->
  <text x="345" y="270" font-size="11" fill="var(--accent)">All nodes agree — even if A crashes now</text>
</svg>
<figcaption>Left: without consensus, a node crash creates disagreement. Right: with a quorum-based protocol, the value is committed once a majority acknowledges it.</figcaption>
</figure>

## How Consensus Is Used in Real Databases

Consensus algorithms are rarely something an application developer calls directly. They are built into the infrastructure layer and surface through familiar database features:

### Leader election
When the current primary crashes, surviving nodes must elect a new one. Consensus ensures exactly one node becomes leader — preventing two primaries from accepting conflicting writes simultaneously (the "split-brain" problem shown above).

### Replicated state machines
Systems like **etcd** (used inside Kubernetes), **CockroachDB**, and **YugabyteDB** model every write as an entry in a replicated log. The Raft consensus algorithm guarantees all replicas apply log entries in the same order — so every replica ends up with identical state.

### Distributed commit coordination
When a transaction spans multiple shards or databases, **two-phase commit (2PC)** needs all participants to agree on "commit" or "abort". Consensus provides the coordinator's decision log, ensuring a node crash mid-protocol doesn't leave the transaction stranded in an unknown state forever.

The table below summarizes where consensus appears in practice:

| Use case | What nodes must agree on | Algorithm commonly used |
|---|---|---|
| Leader election | Which node is the current primary | Raft, Multi-Paxos |
| Log replication | The next entry in the write-ahead log | Raft, Paxos |
| Distributed commit | Commit or abort a cross-shard transaction | 2PC + Paxos for coordinator durability |
| Configuration management | Current cluster membership / schema version | Raft (etcd) |

> **Note:** Consensus has a real cost — each decision requires at least one round-trip between a majority of nodes. This is why databases often batch many writes into a single consensus round (a technique called **log pipelining**) rather than running the protocol once per row.

## Think Before You Reveal

Try to answer this before expanding:

<details class="reveal"><summary>Reveal: Why can't nodes just pick the value held by the majority after a crash, without a consensus protocol?</summary><div class="reveal-body">

Because you need **consensus to agree on what the majority even is**. After a crash you don't know whether a node's last value was durably replicated or arrived only at that one node before it died. Counting "most common value" only works if you already know *which nodes participated in the last write* — and establishing that fact is itself a consensus problem. Without a protocol like Raft or Paxos, a recovering cluster has no safe way to distinguish "this value reached a quorum" from "this value existed only on the crashed node."

</div></details>

Understanding consensus as the engine behind agreement sets the stage for the next topic: **Raft**, the algorithm that made consensus legible enough to implement correctly at scale.
