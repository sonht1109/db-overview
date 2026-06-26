Imagine three database nodes, each holding a copy of your data, and a write request arrives: "set the account balance to $500." All three nodes need to agree on that value before anyone confirms success to the client. If they don't — if one node says $500 while another still believes $300 — you have a split brain, and your data is silently wrong. **Consensus** is the mechanism that prevents this. It is the formal problem of getting a group of independent processes to agree on a single value, even when some of them crash or messages arrive late.

## The Core Problem

Consensus sounds simple: just ask everyone and take a majority vote. The hard part is that networks are unreliable. Messages can be delayed, duplicated, or dropped. A node can crash mid-vote and come back later claiming something different. You cannot tell whether a node is slow or dead.

Three properties every correct consensus algorithm must satisfy:

| Property | Meaning |
|---|---|
| **Agreement** | No two non-faulty nodes decide different values. |
| **Validity** | The decided value must have been proposed by some node — you cannot invent a value out of thin air. |
| **Termination** | Every non-faulty node eventually decides (the algorithm does not stall forever). |

The infamous **FLP impossibility result** (Fischer, Lynch, Paterson, 1985) proved that in a fully asynchronous network where even one node can fail, no algorithm can guarantee all three properties simultaneously. Real systems work around this by assuming *partial synchrony* — messages usually arrive within some time bound — which is why practical consensus protocols can exist.

## How Raft Works (the Friendly Version)

**Raft** is the consensus algorithm you will encounter most often in modern databases (etcd, CockroachDB, TiDB, YugabyteDB all use it). It was designed explicitly to be understandable.

Raft splits the problem into three pieces: **leader election**, **log replication**, and **safety**.

At any moment one node is the **leader**; the others are **followers**. Only the leader accepts writes. The leader appends each write to its local log, then replicates that log entry to followers. Once a **majority** (quorum) acknowledge the entry, the leader marks it **committed** and applies it to the state machine.

<figure class="diagram">
<svg viewBox="0 0 640 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Raft consensus: client sends write to leader, leader replicates to followers, majority ACK triggers commit">
  <!-- Background -->
  <rect x="0" y="0" width="640" height="310" fill="none"/>

  <!-- Client -->
  <rect x="20" y="120" width="90" height="44" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="65" y="147" text-anchor="middle" font-size="13" fill="var(--text)">Client</text>

  <!-- Leader node -->
  <rect x="175" y="100" width="110" height="84" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2.5"/>
  <text x="230" y="130" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--accent)">Leader</text>
  <text x="230" y="150" text-anchor="middle" font-size="11" fill="var(--text)">Node A</text>
  <rect x="192" y="158" width="76" height="16" rx="3" fill="var(--accent)" opacity="0.18"/>
  <text x="230" y="171" text-anchor="middle" font-size="10" fill="var(--text)">log: […, write]</text>

  <!-- Follower 1 -->
  <rect x="400" y="48" width="110" height="84" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="455" y="78" text-anchor="middle" font-size="13" fill="var(--text)">Follower</text>
  <text x="455" y="98" text-anchor="middle" font-size="11" fill="var(--text)">Node B</text>
  <rect x="417" y="106" width="76" height="16" rx="3" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="455" y="119" text-anchor="middle" font-size="10" fill="var(--text)">log: […, write]</text>

  <!-- Follower 2 -->
  <rect x="400" y="178" width="110" height="84" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="455" y="208" text-anchor="middle" font-size="13" fill="var(--text)">Follower</text>
  <text x="455" y="228" text-anchor="middle" font-size="11" fill="var(--text)">Node C</text>
  <rect x="417" y="236" width="76" height="16" rx="3" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="455" y="249" text-anchor="middle" font-size="10" fill="var(--text)">log: […, write]</text>

  <!-- Commit zone -->
  <rect x="570" y="120" width="58" height="44" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="599" y="143" text-anchor="middle" font-size="12" fill="var(--text)">Commit</text>

  <!-- Arrows: client -> leader -->
  <line x1="110" y1="142" x2="173" y2="142" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="141" y="136" text-anchor="middle" font-size="10" fill="var(--text)">write</text>

  <!-- Arrows: leader -> followers -->
  <line x1="285" y1="120" x2="398" y2="90" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr2)"/>
  <line x1="285" y1="160" x2="398" y2="220" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr2)"/>
  <text x="338" y="100" text-anchor="middle" font-size="10" fill="var(--accent)">AppendEntries</text>
  <text x="338" y="200" text-anchor="middle" font-size="10" fill="var(--accent)">AppendEntries</text>

  <!-- Arrows: followers -> leader (ACK) -->
  <line x1="400" y1="108" x2="287" y2="130" stroke="var(--border)" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#arr)"/>
  <line x1="400" y1="202" x2="287" y2="153" stroke="var(--border)" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#arr)"/>
  <text x="344" y="130" text-anchor="middle" font-size="10" fill="var(--text)">ACK</text>
  <text x="344" y="185" text-anchor="middle" font-size="10" fill="var(--text)">ACK</text>

  <!-- Leader -> Commit -->
  <line x1="285" y1="142" x2="568" y2="142" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr2)"/>
  <text x="430" y="136" text-anchor="middle" font-size="10" fill="var(--accent)">majority reached</text>

  <!-- Arrow markers -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
    <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- Step labels -->
  <text x="320" y="298" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.7">① Client writes to leader  ② Leader replicates  ③ Majority ACK → commit</text>
</svg>
<figcaption>Raft consensus flow: a write is committed only after a majority of nodes acknowledge it.</figcaption>
</figure>

A critical detail: a majority is `(n/2) + 1` nodes. In a 3-node cluster that means 2. If Node C is temporarily unreachable, Nodes A and B can still form a quorum and make progress — the cluster tolerates `floor(n/2)` failures.

If the leader crashes, followers notice it has stopped sending heartbeats, hold a new election, and a new leader emerges — all without human intervention. Raft guarantees that the new leader will always have every committed log entry.

## Consensus vs. Coordination Services

You rarely implement consensus yourself. Instead you use a **coordination service** that runs consensus internally and exposes a simpler API:

| Service | Used by | What it stores |
|---|---|---|
| **etcd** | Kubernetes | Cluster configuration, service discovery |
| **ZooKeeper** | Kafka, HBase | Distributed locks, leader election metadata |
| **Consul** | HashiCorp stack | Service health, key-value config |

Your database might use etcd to elect a primary node or to store shard placement — consensus happens underneath, invisible to application code.

> **Note:** Consensus is expensive compared to a single-node write. Every commit requires at least one round-trip to a quorum of nodes. This is why distributed databases expose tunable consistency levels: you can sometimes trade the guarantee of consensus for lower latency, accepting that a read might see slightly stale data.

## Think It Through

Before reading the answer, try to work this out yourself:

<details class="reveal"><summary>Reveal: Why can't you run a 2-node Raft cluster?</summary><div class="reveal-body">

In a 2-node cluster the quorum size is 2 (majority of 2 is 2). If either node fails, you cannot reach quorum — the cluster stalls completely and can make no progress. A 3-node cluster only needs 2 of 3, so it tolerates one failure. This is why production clusters always use **odd numbers** of nodes (3, 5, 7), and why adding a second node to a single-node cluster actually makes it *less* fault-tolerant than going straight to three.

</div></details>

The key insight to take away: consensus is not about everyone agreeing — it is about a **majority** agreeing, in a way that is provably safe across crashes and network partitions. That guarantee is what makes distributed transactions reliable, and it is the foundation everything else in this chapter builds on.
