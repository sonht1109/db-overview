Chat is one of the most write-heavy and read-heavy workloads a relational database faces simultaneously. Messages pour in from thousands of clients; at the same time, users scroll history and expect instant delivery of new arrivals. This case study walks through a realistic chat schema, the ordering problem that breaks naive designs, and the read patterns that dictate indexes.

## Core Entities

A chat system involves: users, conversations (direct or group), messages, and delivery receipts (read/delivered status per user per message).

```sql
CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL,
  last_seen_at INTEGER
);

CREATE TABLE conversations (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT 'direct',  -- 'direct' or 'group'
  name       TEXT,           -- NULL for direct messages
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       INTEGER NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id              INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'text',  -- 'text','image','file'
  reply_to_id     INTEGER REFERENCES messages(id),
  sent_at         INTEGER NOT NULL,  -- client-assigned Unix epoch ms
  server_seq      INTEGER NOT NULL   -- server-assigned monotone sequence
);

CREATE TABLE message_receipts (
  message_id      INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'delivered',  -- 'delivered' | 'read'
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
```

## The Ordering Problem

Chat messages must arrive in the order they were sent — but clock skew between clients and servers makes `sent_at` (a client timestamp) unreliable as an ordering column. The fix is a **server-assigned sequence number** (`server_seq`) that is monotonically increasing per conversation.

```sql
CREATE UNIQUE INDEX idx_messages_conv_seq
  ON messages (conversation_id, server_seq);
```

Loading the last 50 messages in a conversation becomes:

```sql
SELECT * FROM messages
WHERE conversation_id = ?
ORDER BY server_seq DESC
LIMIT 50;
```

> **Note:** In distributed systems, generating a monotone global sequence is hard. Common solutions: a single sequence generator service, ULIDs (sortable UUIDs), or Snowflake IDs. For a single-node database, a plain `INTEGER PRIMARY KEY` (SQLite's rowid) already provides this ordering.

<figure class="diagram">
<svg viewBox="0 0 700 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chat schema: users belong to conversations via conversation_members; messages belong to conversations; message_receipts track delivery per user">
  <defs>
    <marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- users -->
  <rect x="10" y="130" width="140" height="100" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="10" y="130" width="140" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="80" y="148" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">users</text>
  <text x="24" y="172" font-size="11" fill="var(--muted)">PK id</text>
  <text x="24" y="188" font-size="11" fill="var(--text)">username UNIQUE</text>
  <text x="24" y="204" font-size="11" fill="var(--text)">display_name</text>
  <text x="24" y="220" font-size="11" fill="var(--text)">last_seen_at</text>

  <!-- conversations -->
  <rect x="250" y="20" width="170" height="100" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="250" y="20" width="170" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="335" y="38" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">conversations</text>
  <text x="264" y="62" font-size="11" fill="var(--muted)">PK id</text>
  <text x="264" y="78" font-size="11" fill="var(--text)">kind (direct/group)</text>
  <text x="264" y="94" font-size="11" fill="var(--text)">name, created_by</text>
  <text x="264" y="110" font-size="11" fill="var(--text)">created_at</text>

  <!-- conversation_members -->
  <rect x="250" y="155" width="170" height="90" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="250" y="155" width="170" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="335" y="173" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">conversation_members</text>
  <text x="264" y="197" font-size="11" fill="var(--muted)">PK/FK conversation_id</text>
  <text x="264" y="213" font-size="11" fill="var(--muted)">PK/FK user_id</text>
  <text x="264" y="229" font-size="11" fill="var(--text)">role, joined_at</text>

  <!-- messages -->
  <rect x="500" y="80" width="170" height="120" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="500" y="80" width="170" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="585" y="98" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">messages</text>
  <text x="514" y="122" font-size="11" fill="var(--muted)">PK id</text>
  <text x="514" y="138" font-size="11" fill="var(--text)">FK conversation_id</text>
  <text x="514" y="154" font-size="11" fill="var(--text)">FK sender_id</text>
  <text x="514" y="170" font-size="11" fill="var(--text)">body, kind, sent_at</text>
  <text x="514" y="186" font-size="11" fill="var(--text)">server_seq</text>

  <!-- message_receipts -->
  <rect x="500" y="230" width="170" height="90" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="500" y="230" width="170" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="585" y="248" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">message_receipts</text>
  <text x="514" y="272" font-size="11" fill="var(--muted)">PK/FK message_id</text>
  <text x="514" y="288" font-size="11" fill="var(--muted)">PK/FK user_id</text>
  <text x="514" y="304" font-size="11" fill="var(--text)">status, updated_at</text>

  <!-- Arrows -->
  <line x1="150" y1="170" x2="248" y2="195" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="150" y1="160" x2="248" y2="65" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="335" y1="120" x2="335" y2="153" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="420" y1="70" x2="498" y2="120" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="585" y1="200" x2="585" y2="228" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
</svg>
<figcaption>Chat schema: users join conversations via conversation_members; messages have a server_seq for reliable ordering; receipts track delivery state per user.</figcaption>
</figure>

## Critical Indexes

```sql
-- Primary read path: messages in a conversation, newest first
CREATE INDEX idx_messages_conv_seq ON messages (conversation_id, server_seq DESC);

-- Conversations a user belongs to (inbox view)
CREATE INDEX idx_members_user ON conversation_members (user_id, conversation_id);

-- Unread count: receipts per user
CREATE INDEX idx_receipts_user ON message_receipts (user_id, status, message_id);
```

## Unread Count

The "unread badge" on each conversation is one of the most queried numbers in a chat app. Two common approaches:

**Count on the fly:**
```sql
SELECT COUNT(*) FROM messages m
WHERE m.conversation_id = ?
  AND m.server_seq > (
    SELECT MAX(mr.message_id) FROM message_receipts mr
    WHERE mr.user_id = ? AND mr.status = 'read'
  );
```

**Cached counter:** Maintain an `unread_count` integer in `conversation_members`, increment on new message, reset on read. Faster reads, but requires careful transactional updates to stay consistent.

For high-volume systems, the cached counter wins; for a modest deployment, count-on-the-fly is simpler and correct.

## Pagination: Cursor vs. Offset

Loading message history should use **cursor-based pagination**, not `OFFSET`:

```sql
-- First page (newest)
SELECT * FROM messages
WHERE conversation_id = ?
ORDER BY server_seq DESC LIMIT 20;

-- Next page (older than last seen)
SELECT * FROM messages
WHERE conversation_id = ?
  AND server_seq < :last_seq
ORDER BY server_seq DESC LIMIT 20;
```

`OFFSET n` forces the database to scan and discard n rows on every page — painfully slow for deep history. A `WHERE server_seq < ?` condition skips directly to the right position in the B-tree index.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Chat Message Queries</span></div>
  <div class="widget-body">
    <textarea data-setup="
CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, display_name TEXT, created_at INTEGER);
CREATE TABLE conversations (id INTEGER PRIMARY KEY, kind TEXT DEFAULT 'direct', name TEXT, created_at INTEGER);
CREATE TABLE conversation_members (conversation_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'member', joined_at INTEGER, PRIMARY KEY(conversation_id, user_id));
CREATE TABLE messages (id INTEGER PRIMARY KEY, conversation_id INTEGER, sender_id INTEGER, body TEXT, kind TEXT DEFAULT 'text', server_seq INTEGER, sent_at INTEGER);
CREATE TABLE message_receipts (message_id INTEGER, user_id INTEGER, status TEXT DEFAULT 'delivered', updated_at INTEGER, PRIMARY KEY(message_id, user_id));
CREATE UNIQUE INDEX idx_msg_seq ON messages(conversation_id, server_seq);
INSERT INTO users VALUES (1,'alice','Alice',1700000000),(2,'bob','Bob',1700000100),(3,'carol','Carol',1700000200);
INSERT INTO conversations VALUES (1,'direct',NULL,1700001000),(2,'group','Project Chat',1700002000);
INSERT INTO conversation_members VALUES (1,1,'member',1700001000),(1,2,'member',1700001000),(2,1,'admin',1700002000),(2,2,'member',1700002000),(2,3,'member',1700002000);
INSERT INTO messages VALUES (1,1,1,'Hey Bob!','text',1,1700010000),(2,1,2,'Hi Alice!','text',2,1700010060),(3,1,1,'See you at the meeting.','text',3,1700010120),(4,2,1,'Kick-off at 3pm','text',1,1700020000),(5,2,3,'Got it!','text',2,1700020060),(6,2,2,'On my way','text',3,1700020120);
INSERT INTO message_receipts VALUES (1,2,'read',1700010060),(2,1,'read',1700010120),(3,2,'delivered',1700010125),(4,2,'read',1700020060),(4,3,'read',1700020060),(5,1,'read',1700020070),(6,1,'delivered',1700020125);
">-- Latest 5 messages in the group chat (cursor-based)
SELECT m.server_seq, u.display_name AS sender, m.body, m.sent_at
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.conversation_id = 2
ORDER BY m.server_seq DESC
LIMIT 5;

-- Try: unread messages for Alice in conversation 1
-- SELECT COUNT(*) AS unread FROM messages m
-- LEFT JOIN message_receipts mr ON mr.message_id = m.id AND mr.user_id = 1
-- WHERE m.conversation_id = 1
--   AND (mr.status IS NULL OR mr.status != 'read')
--   AND m.sender_id != 1;</textarea>
  </div>
</div>

## Key Takeaways

- Use a **server-assigned sequence number** (`server_seq`) as the canonical message order, not a client timestamp.
- **Cursor pagination** on `server_seq` is dramatically faster than `OFFSET` for deep history.
- **Junction tables** for conversation membership make group chats and direct messages use the same schema.
- Unread counts can be counted on the fly or cached in the membership row — choose based on read/write ratio.
- Delivery receipts grow linearly with messages × members; consider pruning old receipts after a retention window.
