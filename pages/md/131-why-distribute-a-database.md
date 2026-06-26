For most of this guide, a single machine ran everything: one disk, one set of CPUs, one database engine answering every query. That model works remarkably well until it doesn't. This chapter explains the pressures that push databases beyond a single node — and why "just get a bigger server" is rarely the right answer for long.

## The Three Limits of a Single Machine

A single-node database fails in three distinct ways.

### 1. Capacity: you run out of storage or RAM

A relational table with a billion rows will eventually exceed what one disk can hold efficiently. In-memory databases run out of RAM even sooner. At some point there is simply no bigger machine available, or the cost of buying one exceeds the value of the data it holds.

### 2. Throughput: you run out of write bandwidth

Each additional write must flow through one set of I/O paths. A busy e-commerce site during a flash sale might need to record tens of thousands of orders per second. A single spinning disk tops out around 200 random writes/s; even an NVMe SSD maxes out in the low hundreds of thousands. When write load exceeds what one node can absorb, queries queue up and latency spikes.

### 3. Availability: one machine means one point of failure

Hardware fails. Kernels crash. Power is cut. A single-node database goes down when its host goes down — sometimes for minutes, sometimes for hours. For many applications, even five minutes of downtime per month is unacceptable.

<figure class="diagram">
<svg viewBox="0 0 640 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram comparing single-node limits against distributed database benefits">
  <!-- Single node side -->
  <rect x="20" y="20" width="270" height="270" rx="10" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="155" y="48" text-anchor="middle" font-size="14" font-weight="bold" fill="var(--text)">Single Node</text>

  <!-- DB box -->
  <rect x="95" y="62" width="120" height="48" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="155" y="82" text-anchor="middle" font-size="13" fill="var(--text)">Database</text>
  <text x="155" y="100" text-anchor="middle" font-size="12" fill="var(--text)">Server</text>

  <!-- Limits -->
  <rect x="50" y="132" width="220" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-dasharray="5,3" stroke-width="1.5"/>
  <text x="160" y="155" text-anchor="middle" font-size="12" fill="var(--accent)">Storage limit: 1 disk</text>

  <rect x="50" y="178" width="220" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-dasharray="5,3" stroke-width="1.5"/>
  <text x="160" y="201" text-anchor="middle" font-size="12" fill="var(--accent)">Throughput limit: 1 CPU/IO</text>

  <rect x="50" y="224" width="220" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-dasharray="5,3" stroke-width="1.5"/>
  <text x="160" y="247" text-anchor="middle" font-size="12" fill="var(--accent)">Availability: single failure = outage</text>

  <!-- Arrow between sides -->
  <line x1="300" y1="155" x2="340" y2="155" stroke="var(--border)" stroke-width="2" marker-end="url(#arr)"/>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
  </defs>
  <text x="320" y="148" text-anchor="middle" font-size="11" fill="var(--text)">distribute</text>

  <!-- Distributed side -->
  <rect x="350" y="20" width="270" height="270" rx="10" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="485" y="48" text-anchor="middle" font-size="14" font-weight="bold" fill="var(--text)">Distributed Cluster</text>

  <!-- Three nodes -->
  <rect x="370" y="62" width="76" height="44" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="408" y="82" text-anchor="middle" font-size="12" fill="var(--text)">Node A</text>
  <text x="408" y="97" text-anchor="middle" font-size="11" fill="var(--text)">(primary)</text>

  <rect x="458" y="62" width="76" height="44" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="496" y="82" text-anchor="middle" font-size="12" fill="var(--text)">Node B</text>
  <text x="496" y="97" text-anchor="middle" font-size="11" fill="var(--text)">(replica)</text>

  <rect x="546" y="62" width="66" height="44" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="579" y="82" text-anchor="middle" font-size="12" fill="var(--text)">Node C</text>
  <text x="579" y="97" text-anchor="middle" font-size="11" fill="var(--text)">(replica)</text>

  <!-- Benefits -->
  <rect x="370" y="132" width="230" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="485" y="155" text-anchor="middle" font-size="12" fill="var(--text)">Storage: data spread across nodes</text>

  <rect x="370" y="178" width="230" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="485" y="201" text-anchor="middle" font-size="12" fill="var(--text)">Throughput: parallel reads + writes</text>

  <rect x="370" y="224" width="230" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="485" y="247" text-anchor="middle" font-size="12" fill="var(--text)">Availability: failover to replica</text>
</svg>
<figcaption>Single-node limits (left) and how distributing across multiple nodes addresses each one (right).</figcaption>
</figure>

## Scaling Up vs. Scaling Out

The instinctive response to hitting a limit is to buy better hardware — more RAM, faster CPUs, bigger disks. This is called **vertical scaling** (or "scaling up"). It works, and should often be your first move, because a single powerful machine is much simpler to operate than a cluster.

But vertical scaling has a ceiling:

| Approach | What it buys you | Hard limit |
|---|---|---|
| Vertical (scale up) | More resources on one machine | Cost and hardware maximums |
| Horizontal (scale out) | More machines in a cluster | Theoretically unbounded, but complex |

Once you cannot fit the workload on one machine at a reasonable cost, you **scale out**: add more machines and let the database engine spread work across them. This is what "distributed database" means — a system that looks like one database to your application but runs on many physical or virtual nodes.

> **Note:** The cloud has blurred this line. Services like Amazon RDS offer instances with 128 vCPUs and 4 TB RAM. Vertical scaling now goes much further than it did on-premise. Still, for global companies processing millions of events per second, even the largest cloud instance is not enough.

## Latency and Geography

There is a fourth motivation that pure capacity arguments miss: **the speed of light**.

A database server in Frankfurt takes roughly 150 ms to respond to a user in Sydney — not because the software is slow, but because the network round-trip across half the planet takes that long. For interactive applications, 150 ms per query is painful. For five sequential queries it becomes a second of visible lag.

Distributing a database geographically — placing nodes close to the users who query them — can cut that 150 ms down to 10–20 ms. This is **geo-distribution**, and it is a key reason why global web services run database clusters across multiple continents.

## What You Gain (and What You Give Up)

Distribution is not free. The rest of Part IV covers the tradeoffs in detail, but here is the preview:

| Benefit | Cost |
|---|---|
| More storage | Data must be partitioned — deciding *where* each row lives is non-trivial |
| Higher throughput | Coordinating writes across nodes adds latency and complexity |
| Fault tolerance | The system must detect failures and route around them automatically |
| Geo-distribution | Keeping copies of data consistent across continents is a hard problem (CAP theorem) |

The goal of the next chapters is to give you the vocabulary and mental models to reason about those tradeoffs — starting with the two core techniques: **replication** (keeping copies of the same data on multiple nodes) and **sharding** (splitting data across nodes so each node owns a slice).

<details class="reveal"><summary>Reveal: When is a single-node database still the right choice?</summary><div class="reveal-body">

Almost always — for new projects. Distributed databases are complex to operate, debug, and reason about. If your dataset fits on one machine (even a moderately sized cloud instance) and your write throughput is below the node's I/O ceiling, a single well-tuned database with regular backups and a read replica is simpler, cheaper, and more reliable than a cluster. Distribute only when a real, measured limit forces you to.

</div></details>
