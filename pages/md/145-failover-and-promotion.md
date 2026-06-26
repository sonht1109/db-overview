When a leader node goes down, the system has to keep running. **Failover** is the process of detecting that the leader is unavailable and **promoting** one of the followers to become the new leader. Done well, it's nearly invisible to users; done poorly, it causes data loss, split-brain, or extended downtime. Understanding the mechanics tells you why "just promote the replica" is harder than it sounds.

## What Happens During Failover

A typical automated failover sequence looks like this:

1. **Detect failure** — a health-check agent notices the leader has stopped responding (TCP connection refused, heartbeat timeout, etc.).
2. **Agree on a new leader** — surviving nodes (or an external coordinator) run an election. The most up-to-date follower is the best candidate.
3. **Promote the winner** — that follower begins accepting writes; it is now the new leader.
4. **Redirect clients** — application connections are pointed at the new leader (via a virtual IP, DNS update, or proxy like HAProxy/PgBouncer).
5. **Rejoin old leader** — when the former leader recovers, it becomes a follower of the new leader and re-syncs.

<figure class="diagram">
<svg viewBox="0 0 660 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Failover timeline: leader crashes, follower is elected and promoted, clients reconnect">
  <defs>
    <marker id="farr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="garr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
  </defs>

  <!-- Timeline axis -->
  <line x1="40" y1="260" x2="620" y2="260" stroke="var(--border)" stroke-width="1.5"/>
  <text x="40" y="280" font-size="12" fill="var(--text)">t=0</text>
  <text x="185" y="280" font-size="12" fill="var(--text)">t=1 crash</text>
  <text x="330" y="280" font-size="12" fill="var(--text)">t=2 elect</text>
  <text x="470" y="280" font-size="12" fill="var(--text)">t=3 promote</text>

  <!-- Leader (healthy) -->
  <rect x="40" y="30" width="140" height="50" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="110" y="52" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Leader</text>
  <text x="110" y="70" text-anchor="middle" font-size="11" fill="var(--text)">accepting writes</text>

  <!-- Arrow: leader replicating -->
  <line x1="110" y1="80" x2="110" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#farr)"/>
  <text x="120" y="112" font-size="11" fill="var(--text)">replication</text>

  <!-- Follower (healthy) -->
  <rect x="40" y="130" width="140" height="50" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="110" y="152" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Follower</text>
  <text x="110" y="170" text-anchor="middle" font-size="11" fill="var(--text)">replica, reads only</text>

  <!-- Crash marker -->
  <line x1="200" y1="20" x2="200" y2="260" stroke="#e05" stroke-width="1.5" stroke-dasharray="5,4"/>
  <text x="202" y="18" font-size="11" fill="#e05">✕ leader crash</text>

  <!-- Leader crashed box -->
  <rect x="210" y="30" width="130" height="50" rx="6" fill="var(--surface-2)" stroke="#e05" stroke-width="2" stroke-dasharray="6,3"/>
  <text x="275" y="52" text-anchor="middle" font-size="13" fill="#e05" font-weight="bold">Leader</text>
  <text x="275" y="70" text-anchor="middle" font-size="11" fill="#e05">unreachable</text>

  <!-- Follower still alive -->
  <rect x="210" y="130" width="130" height="50" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="275" y="152" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Follower</text>
  <text x="275" y="170" text-anchor="middle" font-size="11" fill="var(--text)">election begins</text>

  <!-- Election marker -->
  <line x1="360" y1="20" x2="360" y2="260" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,4"/>

  <!-- Promotion marker -->
  <line x1="500" y1="20" x2="500" y2="260" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5,4"/>
  <text x="502" y="18" font-size="11" fill="var(--accent)">promoted</text>

  <!-- New leader box -->
  <rect x="370" y="130" width="140" height="50" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="440" y="152" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">New Leader</text>
  <text x="440" y="170" text-anchor="middle" font-size="11" fill="var(--text)">accepting writes</text>

  <!-- Client redirect arrow -->
  <line x1="510" y1="90" x2="510" y2="128" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#farr)"/>
  <rect x="460" y="50" width="120" height="38" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="520" y="66" text-anchor="middle" font-size="12" fill="var(--text)">App clients</text>
  <text x="520" y="82" text-anchor="middle" font-size="11" fill="var(--text)">reconnect here</text>
</svg>
<figcaption>Failover timeline: the leader crashes, a follower wins the election, gets promoted, and clients reconnect to the new leader.</figcaption>
</figure>

> **Note:** The window between the crash and the promotion — typically a few seconds to a minute — is when the system is unavailable for writes. Tuning the heartbeat timeout controls how fast failure is detected, but too-short timeouts cause false positives (network blips look like crashes).

## The Tricky Parts

### Replication Lag and Data Loss

Asynchronous followers might not have received all of the leader's writes at the moment of the crash. Any writes that were acknowledged by the old leader but not yet replicated are **lost** when the follower becomes the new leader. The gap is measured in terms of the **replication lag** — how far behind the follower was.

| Replication mode | Data loss risk | Write latency |
|---|---|---|
| Fully synchronous | Zero — follower confirmed every write | Higher (waits for ack) |
| Semi-synchronous | Low — at least one replica is current | Moderate |
| Fully asynchronous | Possible — lagging replica may miss writes | Lowest |

PostgreSQL's `synchronous_commit = on` guarantees that at least one synchronous standby has the write before the transaction is confirmed to the client.

### Split-Brain

If the old leader recovers but doesn't know it was replaced, you end up with **two nodes both believing they are the leader**. Both accept writes; the data diverges. This is one of the most dangerous failure modes in distributed systems.

Safe systems avoid split-brain by:
- Using **fencing tokens** — only the current leader holds a valid token; an old leader's writes are rejected.
- Requiring a **quorum** — a node can only act as leader if the majority of nodes agree it is.
- Using **STONITH** ("Shoot The Other Node In The Head") — the cluster forcibly powers off a suspected split-brain node before promoting another.

### The "False Positive" Problem

A node that is actually alive but merely slow (under GC pause, network congestion) can be incorrectly declared dead. Promoting a replacement wastes effort and risks split-brain. Most tools use a combination of:
- Multiple independent health checkers
- Requiring a minimum number of missed heartbeats before declaring failure
- Human confirmation for manual failover in sensitive environments

## Tools That Handle Failover

You rarely implement failover logic yourself. Popular tools per database:

| Database | Failover tool | Mechanism |
|---|---|---|
| PostgreSQL | Patroni, repmgr | etcd/Consul/ZooKeeper for quorum; promotes best replica |
| MySQL / MariaDB | Orchestrator, MHA | Topology-aware; tracks replication graph |
| Redis | Redis Sentinel | Majority vote among Sentinel processes |
| MongoDB | Replica set | Built-in; primary election via Raft-like protocol |

These tools watch node health, run elections, update connection routing, and re-attach the old leader as a follower — all automatically.

The interactive example below lets you explore replication lag in a simulated replica log. The `replica_log` table mimics what a follower has received; notice which rows are missing compared to the leader.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Simulating replication lag and missing writes</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE leader_log (lsn INTEGER PRIMARY KEY, data TEXT, committed_at TEXT); INSERT INTO leader_log VALUES (1, 'INSERT users Alice', '10:00:01'); INSERT INTO leader_log VALUES (2, 'INSERT users Bob', '10:00:02'); INSERT INTO leader_log VALUES (3, 'UPDATE orders SET status=paid WHERE id=7', '10:00:03'); INSERT INTO leader_log VALUES (4, 'INSERT users Carol', '10:00:04'); INSERT INTO leader_log VALUES (5, 'DELETE orders WHERE id=2', '10:00:05'); CREATE TABLE replica_log (lsn INTEGER PRIMARY KEY, data TEXT, received_at TEXT); INSERT INTO replica_log VALUES (1, 'INSERT users Alice', '10:00:01'); INSERT INTO replica_log VALUES (2, 'INSERT users Bob', '10:00:02'); INSERT INTO replica_log VALUES (3, 'UPDATE orders SET status=paid WHERE id=7', '10:00:03');">-- Which writes did the leader commit that the replica has NOT yet received?
-- These would be LOST if we promoted this replica right now.
SELECT
  l.lsn,
  l.data          AS lost_write,
  l.committed_at
FROM leader_log l
LEFT JOIN replica_log r ON r.lsn = l.lsn
WHERE r.lsn IS NULL
ORDER BY l.lsn;

-- Try: INSERT INTO replica_log VALUES (4, 'INSERT users Carol', '10:00:04');
-- Then re-run to see the lag shrink.</textarea>
  </div>
</div>
