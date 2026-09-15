/* redis.js — a tiny, dependency-free Redis simulator for the DB-learning pages.
 *
 * Why hand-rolled instead of a library?
 *   - No browser-ready Redis server emulator exists. ioredis-mock / redis-mock
 *     are Node libraries (async clients, Node built-ins, fengari/Lua for EVAL)
 *     and cannot be loaded as a plain <script> from a static site.
 *   - The chapter widgets need deterministic TTL demos, so the store runs on a
 *     virtual clock (see the ADVANCE command) rather than wall-clock time.
 *   - A CLI-style transcript is what teaches the key-value model; a client
 *     library would still need a custom renderer on top.
 *
 * Supported: strings, hashes, lists, sets, sorted sets (incl. ZRANGEBYLEX),
 * key expiry, 16 logical DBs, SCAN/KEYS glob matching, and the usual server
 * introspection commands. Unknown commands fail exactly like real Redis.
 */
(function (global) {
  "use strict";

  /* ================= reply helpers ================= */
  function ok() { return { type: "status", value: "OK" }; }
  function simple(v) { return { type: "status", value: v }; }
  function int(n) { return { type: "int", value: n }; }
  function bulk(v) { return { type: "bulk", value: v }; }
  function nil() { return { type: "bulk", value: null }; }
  function arr(v) { return { type: "array", value: v }; }
  function withNote(r, note) { r.note = note; return r; }

  function RedisError(msg, hint) {
    this.name = "RedisError";
    this.message = msg;
    this.hint = hint || null;
  }
  RedisError.prototype = Object.create(Error.prototype);

  function wrongType() {
    return new RedisError("WRONGTYPE Operation against a key holding the wrong kind of value");
  }
  function wrongArgs(cmd) {
    return new RedisError("wrong number of arguments for '" + cmd + "' command");
  }
  function arity(args, min, max, cmd) {
    if (args.length < min || (max !== null && max !== undefined && args.length > max)) {
      throw wrongArgs(cmd);
    }
  }

  /* ================= glob matching (KEYS / SCAN MATCH) ================= */
  var globCache = {};
  function escapeRe(c) { return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function globToRegExp(glob) {
    if (globCache[glob]) return globCache[glob];
    var re = "";
    for (var i = 0; i < glob.length; i++) {
      var c = glob[i];
      if (c === "*") re += "[\\s\\S]*";
      else if (c === "?") re += "[\\s\\S]";
      else if (c === "[") {
        var j = i + 1, neg = false;
        if (glob[j] === "^" || glob[j] === "!") { neg = true; j++; }
        var set = "", closed = false;
        for (; j < glob.length; j++) {
          if (glob[j] === "]") { closed = true; break; }
          if (glob[j] === "\\" && j + 1 < glob.length) { set += "\\" + glob[j + 1]; j++; }
          else set += glob[j];
        }
        if (closed) { re += "[" + (neg ? "^" : "") + set + "]"; i = j; }
        else re += "\\[";
      } else if (c === "\\" && i + 1 < glob.length) {
        re += escapeRe(glob[++i]);
      } else {
        re += escapeRe(c);
      }
    }
    var compiled = new RegExp("^" + re + "$");
    globCache[glob] = compiled;
    return compiled;
  }

  /* ================= command tokenizer (redis-cli-ish) ================= */
  function tokenize(line) {
    var out = [], i = 0, n = line.length;
    while (i < n) {
      while (i < n && /\s/.test(line[i])) i++;
      if (i >= n) break;
      var ch = line[i];
      if (ch === '"' || ch === "'") {
        var quote = ch; i++;
        var buf = "";
        while (i < n && line[i] !== quote) {
          if (line[i] === "\\" && i + 1 < n) {
            var nx = line[i + 1];
            if (quote === '"' && nx === "n") { buf += "\n"; i += 2; continue; }
            if (quote === '"' && nx === "r") { buf += "\r"; i += 2; continue; }
            if (quote === '"' && nx === "t") { buf += "\t"; i += 2; continue; }
            if (quote === '"' && nx === "x" && /^[0-9a-fA-F]{2}$/.test(line.substr(i + 2, 2))) {
              buf += String.fromCharCode(parseInt(line.substr(i + 2, 2), 16)); i += 4; continue;
            }
            buf += nx; i += 2; continue;
          }
          buf += line[i]; i++;
        }
        if (i < n) i++; // closing quote
        out.push(buf);
      } else {
        var start = i;
        while (i < n && !/\s/.test(line[i])) i++;
        out.push(line.slice(start, i));
      }
    }
    return out;
  }

  /* ================= server / store model ================= */
  var VIRTUAL_EPOCH = 1700000000; // fixed "now" so TTL demos are deterministic
  function createServer() {
    var dbs = [];
    for (var i = 0; i < 16; i++) dbs.push(new Map());
    return { dbs: dbs, db: 0, now: VIRTUAL_EPOCH };
  }
  function cur(srv) { return srv.dbs[srv.db]; }
  function expireIfNeeded(srv, key) {
    var m = cur(srv), e = m.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= srv.now) { m.delete(key); return null; }
    return e;
  }
  function getEntry(srv, key) { return expireIfNeeded(srv, key); }
  function putEntry(srv, key, e) { cur(srv).set(key, e); return e; }
  function newValue(type) {
    if (type === "hash") return new Map();
    if (type === "list") return [];
    if (type === "set") return new Set();
    if (type === "zset") return new Map();
    return "";
  }
  function getOrCreate(srv, key, type) {
    var e = getEntry(srv, key);
    if (!e) return putEntry(srv, key, { type: type, value: newValue(type), expiresAt: null });
    if (e.type !== type) throw wrongType();
    return e;
  }
  function getString(srv, key) {
    var e = getEntry(srv, key);
    if (!e) return null;
    if (e.type !== "string") throw wrongType();
    return e.value;
  }
  function putString(srv, key, value, expiresAt) {
    var old = getEntry(srv, key);
    var ttl = expiresAt === undefined ? (old ? old.expiresAt : null) : expiresAt;
    return putEntry(srv, key, { type: "string", value: value, expiresAt: ttl });
  }
  function liveKeys(srv) {
    var out = [];
    cur(srv).forEach(function (_e, k) { if (expireIfNeeded(srv, k)) out.push(k); });
    return out;
  }
  function isInt(s) { return /^[+-]?\d+$/.test(String(s).trim()); }
  function toInt(s) {
    if (!isInt(s)) throw new RedisError("value is not an integer or out of range");
    return parseInt(s, 10);
  }
  function fmtNum(n) {
    if (!isFinite(n)) return n > 0 ? "inf" : "-inf";
    return Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(17)));
  }

  /* ================= strings ================= */
  function cmdSet(srv, args) {
    arity(args, 2, null, "set");
    var key = args[0], val = args[1];
    var o = { nx: false, xx: false, get: false, keepttl: false, hasTtl: false, expiresAt: null };
    for (var i = 2; i < args.length; i++) {
      var f = args[i].toUpperCase();
      if (f === "NX") o.nx = true;
      else if (f === "XX") o.xx = true;
      else if (f === "GET") o.get = true;
      else if (f === "KEEPTTL") o.keepttl = true;
      else if (f === "EX" || f === "PX" || f === "EXAT" || f === "PXAT") {
        var n = parseFloat(args[++i]);
        if (isNaN(n)) throw new RedisError("value is not an integer or out of range");
        o.hasTtl = true;
        if (f === "EX") o.expiresAt = srv.now + n;
        else if (f === "PX") o.expiresAt = srv.now + n / 1000;
        else if (f === "EXAT") o.expiresAt = n;
        else o.expiresAt = n / 1000;
      } else throw new RedisError("syntax error");
    }
    var existing = getEntry(srv, key);
    if (o.get && existing && existing.type !== "string") throw wrongType();
    var oldVal = existing && existing.type === "string" ? existing.value : null;
    if (o.nx && existing) return o.get ? bulk(oldVal) : nil();
    if (o.xx && !existing) return o.get ? nil() : nil();
    var ttl = o.keepttl && existing ? existing.expiresAt : (o.hasTtl ? o.expiresAt : null);
    putEntry(srv, key, { type: "string", value: val, expiresAt: ttl });
    return o.get ? bulk(oldVal) : ok();
  }
  function cmdSetnx(srv, args) {
    arity(args, 2, 2, "setnx");
    if (getEntry(srv, args[0])) return int(0);
    putString(srv, args[0], args[1], null);
    return int(1);
  }
  function cmdSetex(srv, args, ms) {
    arity(args, 3, 3, ms ? "psetex" : "setex");
    var n = parseFloat(args[1]);
    if (isNaN(n)) throw new RedisError("value is not an integer or out of range");
    putString(srv, args[0], args[2], srv.now + (ms ? n / 1000 : n));
    return ok();
  }
  function cmdGet(srv, args) { arity(args, 1, 1, "get"); var v = getString(srv, args[0]); return v === null ? nil() : bulk(v); }
  function cmdGetset(srv, args) {
    arity(args, 2, 2, "getset");
    var old = getString(srv, args[0]);
    putString(srv, args[0], args[1]);
    return old === null ? nil() : bulk(old);
  }
  function cmdGetdel(srv, args) {
    arity(args, 1, 1, "getdel");
    var v = getString(srv, args[0]);
    if (v !== null) cur(srv).delete(args[0]);
    return v === null ? nil() : bulk(v);
  }
  function cmdGetex(srv, args) {
    arity(args, 1, null, "getex");
    var e = getEntry(srv, args[0]);
    if (!e) return nil();
    if (e.type !== "string") throw wrongType();
    for (var i = 1; i < args.length; i++) {
      var f = args[i].toUpperCase();
      if (f === "PERSIST") e.expiresAt = null;
      else if (f === "EX") e.expiresAt = srv.now + parseFloat(args[++i]);
      else if (f === "PX") e.expiresAt = srv.now + parseFloat(args[++i]) / 1000;
      else throw new RedisError("syntax error");
    }
    return bulk(e.value);
  }
  function cmdMset(srv, args) {
    if (args.length === 0 || args.length % 2 !== 0) throw wrongArgs("mset");
    for (var i = 0; i < args.length; i += 2) putString(srv, args[i], args[i + 1], null);
    return ok();
  }
  function cmdMget(srv, args) {
    arity(args, 1, null, "mget");
    return arr(args.map(function (k) {
      var e = getEntry(srv, k);
      if (!e) return nil();
      if (e.type !== "string") return nil();
      return bulk(e.value);
    }));
  }
  function cmdAppend(srv, args) {
    arity(args, 2, 2, "append");
    var v = getString(srv, args[0]);
    v = (v || "") + args[1];
    putString(srv, args[0], v);
    return int(v.length);
  }
  function cmdStrlen(srv, args) { arity(args, 1, 1, "strlen"); var v = getString(srv, args[0]); return int(v ? v.length : 0); }
  function incrBy(srv, key, delta) {
    var curVal = getString(srv, key);
    var n = curVal === null ? 0 : toInt(curVal);
    n += delta;
    putString(srv, key, String(n));
    return int(n);
  }
  function cmdIncr(srv, args) { arity(args, 1, 1, "incr"); return incrBy(srv, args[0], 1); }
  function cmdDecr(srv, args) { arity(args, 1, 1, "decr"); return incrBy(srv, args[0], -1); }
  function cmdIncrby(srv, args) { arity(args, 2, 2, "incrby"); return incrBy(srv, args[0], toInt(args[1])); }
  function cmdDecrby(srv, args) { arity(args, 2, 2, "decrby"); return incrBy(srv, args[0], -toInt(args[1])); }
  function cmdIncrbyfloat(srv, args) {
    arity(args, 2, 2, "incrbyfloat");
    var v = getString(srv, args[0]);
    var n = (v === null ? 0 : parseFloat(v)) + parseFloat(args[1]);
    if (isNaN(n)) throw new RedisError("value is not a valid float");
    putString(srv, args[0], fmtNum(n));
    return bulk(fmtNum(n));
  }

  /* ================= keys ================= */
  function cmdDel(srv, args) {
    arity(args, 1, null, "del");
    var n = 0;
    args.forEach(function (k) { if (getEntry(srv, k)) { cur(srv).delete(k); n++; } });
    return int(n);
  }
  function cmdExists(srv, args) {
    arity(args, 1, null, "exists");
    var n = 0;
    args.forEach(function (k) { if (getEntry(srv, k)) n++; });
    return int(n);
  }
  function expireCore(srv, args, opts) {
    arity(args, 2, 4, opts.cmd);
    var e = getEntry(srv, args[0]);
    var n = parseFloat(args[1]);
    if (isNaN(n)) throw new RedisError("value is not an integer or out of range");
    if (!e) return int(0);
    var at = opts.at ? (opts.ms ? n / 1000 : n) : srv.now + (opts.ms ? n / 1000 : n);
    if (at <= srv.now) { cur(srv).delete(args[0]); return int(1); }
    e.expiresAt = at;
    return int(1);
  }
  function ttlCore(srv, args, ms, cmd) {
    arity(args, 1, 1, cmd);
    var e = getEntry(srv, args[0]);
    if (!e) return int(-2);
    if (e.expiresAt === null) return int(-1);
    var rem = e.expiresAt - srv.now;
    return int(ms ? Math.round(rem * 1000) : Math.round(rem));
  }
  function cmdPersist(srv, args) {
    arity(args, 1, 1, "persist");
    var e = getEntry(srv, args[0]);
    if (!e || e.expiresAt === null) return int(0);
    e.expiresAt = null;
    return int(1);
  }
  function cmdType(srv, args) {
    arity(args, 1, 1, "type");
    var e = getEntry(srv, args[0]);
    return simple(e ? e.type : "none");
  }
  function cmdKeys(srv, args) {
    arity(args, 1, 1, "keys");
    var re = globToRegExp(args[0]);
    var out = liveKeys(srv).filter(function (k) { return re.test(k); }).sort().map(bulk);
    return withNote(arr(out), "KEYS walks the entire keyspace in O(N). Production code uses SCAN with MATCH instead.");
  }
  function cmdScan(srv, args) {
    arity(args, 1, null, "scan");
    var start = parseInt(args[0], 10);
    if (isNaN(start)) throw new RedisError("invalid cursor");
    var pattern = null, count = 10;
    for (var i = 1; i < args.length; i++) {
      var f = args[i].toUpperCase();
      if (f === "MATCH") pattern = args[++i];
      else if (f === "COUNT") count = parseInt(args[++i], 10) || 10;
      else if (f === "TYPE") { /* accepted, ignored for simplicity */ args[++i]; }
      else throw new RedisError("syntax error");
    }
    var keys = liveKeys(srv).sort();
    if (pattern) { var re = globToRegExp(pattern); keys = keys.filter(function (k) { return re.test(k); }); }
    var slice = keys.slice(start, start + count);
    var next = start + count >= keys.length ? "0" : String(start + count);
    return arr([bulk(next), arr(slice.map(bulk))]);
  }
  function cmdRandomkey(srv, args) {
    arity(args, 0, 0, "randomkey");
    var keys = liveKeys(srv);
    return keys.length ? bulk(keys[Math.floor(Math.random() * keys.length)]) : nil();
  }
  function cmdRename(srv, args, nx) {
    arity(args, 2, 2, nx ? "renamenx" : "rename");
    var e = getEntry(srv, args[0]);
    if (!e) throw new RedisError("no such key");
    if (nx && getEntry(srv, args[1])) return int(0);
    cur(srv).delete(args[0]);
    cur(srv).set(args[1], e);
    return nx ? int(1) : ok();
  }
  function cmdDbsize(srv, args) { arity(args, 0, 0, "dbsize"); return int(liveKeys(srv).length); }
  function cmdFlushdb(srv) { srv.dbs[srv.db] = new Map(); return ok(); }
  function cmdFlushall(srv) { for (var i = 0; i < 16; i++) srv.dbs[i] = new Map(); return ok(); }
  function cmdSelect(srv, args) {
    arity(args, 1, null, "select");
    var n = parseInt(args[0], 10);
    if (isNaN(n) || n < 0 || n > 15) throw new RedisError("DB index is out of range (0-15)");
    srv.db = n;
    return ok();
  }
  function encoding(e) {
    if (e.type === "string") {
      if (isInt(e.value) && String(e.value).length <= 20) return "int";
      return e.value.length <= 44 ? "embstr" : "raw";
    }
    if (e.type === "list") return e.value.length <= 128 ? "listpack" : "quicklist";
    if (e.type === "hash") return e.value.size <= 128 ? "listpack" : "hashtable";
    if (e.type === "set") {
      var allInt = true;
      e.value.forEach(function (m) { if (!isInt(m)) allInt = false; });
      return allInt ? "intset" : "hashtable";
    }
    if (e.type === "zset") return e.value.size <= 128 ? "listpack" : "skiplist";
    return "unknown";
  }
  function cmdObject(srv, args) {
    arity(args, 2, null, "object");
    var sub = args[0].toUpperCase();
    if (sub === "ENCODING" || sub === "REFCOUNT") {
      var e = getEntry(srv, args[1]);
      if (!e) return nil();
      return sub === "ENCODING" ? bulk(encoding(e)) : int(1);
    }
    if (sub === "HELP") return arr([bulk("OBJECT ENCODING <key>"), bulk("OBJECT REFCOUNT <key>")]);
    throw new RedisError("Unknown OBJECT subcommand or wrong number of arguments");
  }
  function cmdMemory(srv, args) {
    arity(args, 2, null, "memory");
    var sub = args[0].toUpperCase();
    if (sub === "USAGE") {
      var e = getEntry(srv, args[1]);
      if (!e) return nil();
      return int(JSON.stringify(compactValue(e)).length + 48);
    }
    if (sub === "DOCTOR") return bulk("Sam, I detected a few issues in this Redis instance memory implants:\n\n * High allocator fragmentation: nothing to worry about.");
    return ok();
  }

  /* ================= hashes ================= */
  function cmdHset(srv, args, nx) {
    if (args.length < 3 || args.length % 2 === 0) throw wrongArgs(nx ? "hsetnx" : "hset");
    if (nx) arity(args, 3, 3, "hsetnx");
    var e = getOrCreate(srv, args[0], "hash");
    var added = 0;
    for (var i = 1; i < args.length; i += 2) {
      var f = args[i], v = args[i + 1];
      if (nx && e.value.has(f)) return int(0);
      if (!e.value.has(f)) added++;
      e.value.set(f, v);
    }
    return int(added);
  }
  function cmdHget(srv, args) {
    arity(args, 2, 2, "hget");
    var e = getEntry(srv, args[0]);
    if (!e) return nil();
    if (e.type !== "hash") throw wrongType();
    var v = e.value.get(args[1]);
    return v === undefined ? nil() : bulk(v);
  }
  function cmdHmget(srv, args) {
    arity(args, 2, null, "hmget");
    var e = getEntry(srv, args[0]);
    if (e && e.type !== "hash") throw wrongType();
    return arr(args.slice(1).map(function (f) {
      if (!e) return nil();
      var v = e.value.get(f);
      return v === undefined ? nil() : bulk(v);
    }));
  }
  function cmdHgetall(srv, args) {
    arity(args, 1, 1, "hgetall");
    var e = getEntry(srv, args[0]);
    if (!e) return arr([]);
    if (e.type !== "hash") throw wrongType();
    var out = [];
    e.value.forEach(function (v, f) { out.push(bulk(f), bulk(v)); });
    return arr(out);
  }
  function cmdHdel(srv, args) {
    arity(args, 2, null, "hdel");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "hash") throw wrongType();
    var n = 0;
    args.slice(1).forEach(function (f) { if (e.value.delete(f)) n++; });
    return int(n);
  }
  function cmdHexists(srv, args) {
    arity(args, 2, 2, "hexists");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "hash") throw wrongType();
    return int(e.value.has(args[1]) ? 1 : 0);
  }
  function hashKeys(srv, args, cmd, pick) {
    arity(args, 1, 1, cmd);
    var e = getEntry(srv, args[0]);
    if (!e) return arr([]);
    if (e.type !== "hash") throw wrongType();
    var out = [];
    e.value.forEach(function (v, f) { out.push(bulk(pick === "v" ? v : f)); });
    return arr(out);
  }
  function cmdHincrby(srv, args, isFloat) {
    arity(args, 3, 3, isFloat ? "hincrbyfloat" : "hincrby");
    var e = getOrCreate(srv, args[0], "hash");
    var curVal = e.value.get(args[1]);
    if (curVal === undefined) curVal = "0";
    var delta = isFloat ? parseFloat(args[2]) : toInt(args[2]);
    if (isNaN(delta)) throw new RedisError("value is not a valid float");
    var n = (isFloat ? parseFloat(curVal) : toInt(curVal)) + delta;
    if (isNaN(n)) throw new RedisError("hash value is not a valid float");
    e.value.set(args[1], fmtNum(n));
    return isFloat ? bulk(fmtNum(n)) : int(n);
  }

  /* ================= lists ================= */
  function cmdPush(srv, args, left) {
    arity(args, 2, null, left ? "lpush" : "rpush");
    var e = getOrCreate(srv, args[0], "list");
    var vals = args.slice(1);
    vals.forEach(function (v) { if (left) e.value.unshift(v); else e.value.push(v); });
    return int(e.value.length);
  }
  function cmdPushx(srv, args, left) {
    arity(args, 2, null, left ? "lpushx" : "rpushx");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "list") throw wrongType();
    args.slice(1).forEach(function (v) { if (left) e.value.unshift(v); else e.value.push(v); });
    return int(e.value.length);
  }
  function cmdPop(srv, args, left) {
    arity(args, 1, 2, left ? "lpop" : "rpop");
    var e = getEntry(srv, args[0]);
    if (!e) return args.length === 2 ? nil() : nil();
    if (e.type !== "list") throw wrongType();
    if (args.length === 2) {
      var count = toInt(args[1]);
      var out = [];
      for (var i = 0; i < count && e.value.length; i++) out.push(bulk(left ? e.value.shift() : e.value.pop()));
      if (!e.value.length) cur(srv).delete(args[0]);
      return arr(out);
    }
    var v = left ? e.value.shift() : e.value.pop();
    if (!e.value.length) cur(srv).delete(args[0]);
    return bulk(v);
  }
  function cmdLlen(srv, args) {
    arity(args, 1, 1, "llen");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "list") throw wrongType();
    return int(e.value.length);
  }
  function normalizeRange(start, stop, len) {
    if (start < 0) start = len + start;
    if (stop < 0) stop = len + stop;
    if (start < 0) start = 0;
    if (stop >= len) stop = len - 1;
    return [start, stop];
  }
  function cmdLrange(srv, args) {
    arity(args, 3, 3, "lrange");
    var e = getEntry(srv, args[0]);
    if (!e) return arr([]);
    if (e.type !== "list") throw wrongType();
    var r = normalizeRange(toInt(args[1]), toInt(args[2]), e.value.length);
    if (r[0] > r[1]) return arr([]);
    return arr(e.value.slice(r[0], r[1] + 1).map(bulk));
  }
  function cmdLindex(srv, args) {
    arity(args, 2, 2, "lindex");
    var e = getEntry(srv, args[0]);
    if (!e) return nil();
    if (e.type !== "list") throw wrongType();
    var i = toInt(args[1]);
    if (i < 0) i += e.value.length;
    return (i >= 0 && i < e.value.length) ? bulk(e.value[i]) : nil();
  }
  function cmdLset(srv, args) {
    arity(args, 3, 3, "lset");
    var e = getEntry(srv, args[0]);
    if (!e) throw new RedisError("no such key");
    if (e.type !== "list") throw wrongType();
    var i = toInt(args[1]);
    if (i < 0) i += e.value.length;
    if (i < 0 || i >= e.value.length) throw new RedisError("index out of range");
    e.value[i] = args[2];
    return ok();
  }
  function cmdLtrim(srv, args) {
    arity(args, 3, 3, "ltrim");
    var e = getEntry(srv, args[0]);
    if (!e) return ok();
    if (e.type !== "list") throw wrongType();
    var r = normalizeRange(toInt(args[1]), toInt(args[2]), e.value.length);
    e.value = r[0] > r[1] ? [] : e.value.slice(r[0], r[1] + 1);
    if (!e.value.length) cur(srv).delete(args[0]);
    return ok();
  }
  function cmdLrem(srv, args) {
    arity(args, 3, 3, "lrem");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "list") throw wrongType();
    var count = toInt(args[1]), val = args[2], removed = 0;
    if (count >= 0) {
      for (var i = 0; i < e.value.length && (count === 0 || removed < count);) {
        if (e.value[i] === val) { e.value.splice(i, 1); removed++; } else i++;
      }
    } else {
      for (var j = e.value.length - 1; j >= 0 && removed < -count; j--) {
        if (e.value[j] === val) { e.value.splice(j, 1); removed++; }
      }
    }
    if (!e.value.length) cur(srv).delete(args[0]);
    return int(removed);
  }

  /* ================= sets ================= */
  function cmdSadd(srv, args) {
    arity(args, 2, null, "sadd");
    var e = getOrCreate(srv, args[0], "set");
    var n = 0;
    args.slice(1).forEach(function (m) { if (!e.value.has(m)) { e.value.add(m); n++; } });
    return int(n);
  }
  function cmdSrem(srv, args) {
    arity(args, 2, null, "srem");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "set") throw wrongType();
    var n = 0;
    args.slice(1).forEach(function (m) { if (e.value.delete(m)) n++; });
    return int(n);
  }
  function cmdSmembers(srv, args) {
    arity(args, 1, 1, "smembers");
    var e = getEntry(srv, args[0]);
    if (!e) return arr([]);
    if (e.type !== "set") throw wrongType();
    return arr(Array.from(e.value).sort().map(bulk));
  }
  function cmdSismember(srv, args) {
    arity(args, 2, 2, "sismember");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "set") throw wrongType();
    return int(e.value.has(args[1]) ? 1 : 0);
  }
  function cmdScard(srv, args) {
    arity(args, 1, 1, "scard");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "set") throw wrongType();
    return int(e.value.size);
  }
  function setOp(srv, args, cmd, op) {
    arity(args, 1, null, cmd);
    var sets = args.map(function (k) {
      var e = getEntry(srv, k);
      if (!e) return null;
      if (e.type !== "set") throw wrongType();
      return e.value;
    });
    var base = sets[0] || new Set();
    var result = new Set();
    base.forEach(function (m) {
      var inAll = true, inAny = false;
      sets.forEach(function (s) {
        if (s && s.has(m)) inAny = true; else inAll = false;
      });
      if (op === "inter" ? inAll : op === "union" ? inAny : (inAny && !sets.slice(1).some(function (s) { return s && s.has(m); }))) {
        result.add(m);
      }
    });
    if (op === "union") sets.forEach(function (s) { if (s) s.forEach(function (m) { result.add(m); }); });
    return arr(Array.from(result).sort().map(bulk));
  }

  /* ================= sorted sets ================= */
  function zsorted(e) {
    var a = [];
    e.value.forEach(function (score, member) { a.push({ member: member, score: score }); });
    a.sort(function (x, y) { return x.score - y.score || (x.member < y.member ? -1 : x.member > y.member ? 1 : 0); });
    return a;
  }
  function zRender(items, withScores) {
    var out = [];
    items.forEach(function (o) { out.push(bulk(o.member)); if (withScores) out.push(bulk(fmtNum(o.score))); });
    return arr(out);
  }
  function cmdZadd(srv, args) {
    if (args.length < 3) throw wrongArgs("zadd");
    var key = args[0], i = 1;
    var o = { nx: false, xx: false, gt: false, lt: false, ch: false, incr: false };
    for (; i < args.length; i++) {
      var f = args[i].toUpperCase();
      if (f === "NX") o.nx = true;
      else if (f === "XX") o.xx = true;
      else if (f === "GT") o.gt = true;
      else if (f === "LT") o.lt = true;
      else if (f === "CH") o.ch = true;
      else if (f === "INCR") o.incr = true;
      else break;
    }
    if ((args.length - i) % 2 !== 0) throw new RedisError("syntax error");
    var e = getOrCreate(srv, key, "zset");
    var added = 0, changed = 0, incrResult = null;
    for (; i < args.length; i += 2) {
      var score = parseFloat(args[i]), member = args[i + 1];
      if (isNaN(score)) throw new RedisError("value is not a valid float");
      var existing = e.value.get(member);
      if (o.nx && existing !== undefined) { if (o.incr) return nil(); continue; }
      if (o.xx && existing === undefined) { if (o.incr) return nil(); continue; }
      if (o.gt && existing !== undefined && score <= existing) { if (o.incr) return nil(); continue; }
      if (o.lt && existing !== undefined && score >= existing) { if (o.incr) return nil(); continue; }
      var ns = o.incr ? (existing || 0) + score : score;
      if (existing === undefined) added++; else changed++;
      e.value.set(member, ns);
      incrResult = ns;
    }
    if (o.incr) return bulk(fmtNum(incrResult));
    return int(o.ch ? added + changed : added);
  }
  function cmdZscore(srv, args) {
    arity(args, 2, 2, "zscore");
    var e = getEntry(srv, args[0]);
    if (!e) return nil();
    if (e.type !== "zset") throw wrongType();
    var s = e.value.get(args[1]);
    return s === undefined ? nil() : bulk(fmtNum(s));
  }
  function cmdZmscore(srv, args) {
    arity(args, 2, null, "zmscore");
    var e = getEntry(srv, args[0]);
    if (e && e.type !== "zset") throw wrongType();
    return arr(args.slice(1).map(function (m) {
      if (!e) return nil();
      var s = e.value.get(m);
      return s === undefined ? nil() : bulk(fmtNum(s));
    }));
  }
  function cmdZcard(srv, args) {
    arity(args, 1, 1, "zcard");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "zset") throw wrongType();
    return int(e.value.size);
  }
  function cmdZrange(srv, args, rev) {
    arity(args, 3, 4, rev ? "zrevrange" : "zrange");
    var e = getEntry(srv, args[0]);
    if (!e) return arr([]);
    if (e.type !== "zset") throw wrongType();
    var withScores = (args[3] || "").toUpperCase() === "WITHSCORES";
    var items = zsorted(e);
    if (rev) items.reverse();
    var r = normalizeRange(toInt(args[1]), toInt(args[2]), items.length);
    if (r[0] > r[1]) return arr([]);
    return zRender(items.slice(r[0], r[1] + 1), withScores);
  }
  function parseScoreBound(s, isMin) {
    if (s === "-inf" || s === "-") return { v: isMin ? -Infinity : -Infinity, ex: false };
    if (s === "+inf" || s === "+") return { v: Infinity, ex: false };
    var ex = false;
    if (s[0] === "(") { ex = true; s = s.slice(1); }
    var n = parseFloat(s);
    if (isNaN(n)) throw new RedisError("min or max is not a float");
    return { v: n, ex: ex };
  }
  function cmdZrangebyscore(srv, args, rev) {
    arity(args, 3, null, rev ? "zrevrangebyscore" : "zrangebyscore");
    var e = getEntry(srv, args[0]);
    if (!e) return arr([]);
    if (e.type !== "zset") throw wrongType();
    var lo = parseScoreBound(args[1], true), hi = parseScoreBound(args[2], false);
    if (rev) { var t = lo; lo = hi; hi = t; }
    var withScores = false, offset = 0, count = Infinity;
    for (var i = 3; i < args.length; i++) {
      var f = args[i].toUpperCase();
      if (f === "WITHSCORES") withScores = true;
      else if (f === "LIMIT") { offset = toInt(args[++i]); count = toInt(args[++i]); }
      else throw new RedisError("syntax error");
    }
    var items = zsorted(e).filter(function (o) {
      var okLo = lo.ex ? o.score > lo.v : o.score >= lo.v;
      var okHi = hi.ex ? o.score < hi.v : o.score <= hi.v;
      return okLo && okHi;
    });
    if (rev) items.reverse();
    items = items.slice(offset, count === Infinity ? undefined : offset + count);
    return zRender(items, withScores);
  }
  function parseLexBound(s) {
    if (s === "-") return { neg: true };
    if (s === "+") return { pos: true };
    if (s[0] === "[") return { v: s.slice(1), inc: true };
    if (s[0] === "(") return { v: s.slice(1), inc: false };
    throw new RedisError("min or max not valid string range item");
  }
  function cmdZrangebylex(srv, args, rev) {
    arity(args, 3, null, rev ? "zrevrangebylex" : "zrangebylex");
    var e = getEntry(srv, args[0]);
    if (!e) return arr([]);
    if (e.type !== "zset") throw wrongType();
    var lo = parseLexBound(args[1]), hi = parseLexBound(args[2]);
    var offset = 0, count = Infinity;
    for (var i = 3; i < args.length; i++) {
      if (args[i].toUpperCase() === "LIMIT") { offset = toInt(args[++i]); count = toInt(args[++i]); }
      else throw new RedisError("syntax error");
    }
    var members = Array.from(e.value.keys()).sort();
    var items = members.filter(function (m) {
      var okLo = lo.neg ? true : lo.pos ? false : (lo.inc ? m >= lo.v : m > lo.v);
      var okHi = hi.pos ? true : hi.neg ? false : (hi.inc ? m <= hi.v : m < hi.v);
      return okLo && okHi;
    }).map(function (m) { return { member: m, score: e.value.get(m) }; });
    if (rev) items.reverse();
    items = items.slice(offset, count === Infinity ? undefined : offset + count);
    return zRender(items, false);
  }
  function cmdZlexcount(srv, args) {
    arity(args, 3, 3, "zlexcount");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "zset") throw wrongType();
    var lo = parseLexBound(args[1]), hi = parseLexBound(args[2]);
    var n = 0;
    e.value.forEach(function (_s, m) {
      var okLo = lo.neg ? true : lo.pos ? false : (lo.inc ? m >= lo.v : m > lo.v);
      var okHi = hi.pos ? true : hi.neg ? false : (hi.inc ? m <= hi.v : m < hi.v);
      if (okLo && okHi) n++;
    });
    return int(n);
  }
  function cmdZcount(srv, args) {
    arity(args, 3, 3, "zcount");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "zset") throw wrongType();
    var lo = parseScoreBound(args[1], true), hi = parseScoreBound(args[2], false), n = 0;
    e.value.forEach(function (s) {
      var okLo = lo.ex ? s > lo.v : s >= lo.v;
      var okHi = hi.ex ? s < hi.v : s <= hi.v;
      if (okLo && okHi) n++;
    });
    return int(n);
  }
  function cmdZrank(srv, args, rev) {
    arity(args, 2, 2, rev ? "zrevrank" : "zrank");
    var e = getEntry(srv, args[0]);
    if (!e) return nil();
    if (e.type !== "zset") throw wrongType();
    var items = zsorted(e);
    if (rev) items.reverse();
    for (var i = 0; i < items.length; i++) if (items[i].member === args[1]) return int(i);
    return nil();
  }
  function cmdZincrby(srv, args) {
    arity(args, 3, 3, "zincrby");
    var e = getOrCreate(srv, args[0], "zset");
    var delta = parseFloat(args[1]);
    if (isNaN(delta)) throw new RedisError("value is not a valid float");
    var n = (e.value.get(args[2]) || 0) + delta;
    e.value.set(args[2], n);
    return bulk(fmtNum(n));
  }
  function cmdZrem(srv, args) {
    arity(args, 2, null, "zrem");
    var e = getEntry(srv, args[0]);
    if (!e) return int(0);
    if (e.type !== "zset") throw wrongType();
    var n = 0;
    args.slice(1).forEach(function (m) { if (e.value.delete(m)) n++; });
    return int(n);
  }

  /* ================= server / introspection ================= */
  function cmdPing(srv, args) { return args.length ? bulk(args[0]) : simple("PONG"); }
  function cmdEcho(srv, args) { arity(args, 1, 1, "echo"); return bulk(args[0]); }
  function cmdTime(srv) { return arr([bulk(String(Math.floor(srv.now))), bulk("0")]); }
  function cmdInfo(srv) {
    var lines = [
      "# Server", "redis_version:7.2.0-sim", "redis_mode:standalone", "os:js-simulator",
      "", "# Clients", "connected_clients:1", "",
      "# Memory", "used_memory_human:1.00M", "maxmemory:0", "maxmemory_policy:noeviction", "",
      "# Persistence", "loading:0", "rdb_changes_since_last_save:0", "aof_enabled:0", "",
      "# Keyspace", "db" + srv.db + ":keys=" + liveKeys(srv).length + ",expires=0,avg_ttl=0", ""
    ];
    return bulk(lines.join("\n"));
  }
  var CONFIG = { "maxmemory": "0", "maxmemory-policy": "noeviction", "appendonly": "no", "save": "3600 1 300 100 60 10000", "tcp-keepalive": "300" };
  function cmdConfig(srv, args) {
    arity(args, 1, null, "config");
    var sub = args[0].toUpperCase();
    if (sub === "GET") {
      var pat = args[1] ? args[1] : "*", re = globToRegExp(pat), out = [];
      Object.keys(CONFIG).forEach(function (k) { if (re.test(k)) { out.push(bulk(k), bulk(CONFIG[k])); } });
      return arr(out);
    }
    if (sub === "SET") {
      for (var i = 1; i < args.length; i += 2) CONFIG[args[i]] = args[i + 1];
      return ok();
    }
    if (sub === "RESETSTAT") return ok();
    throw new RedisError("Unknown CONFIG subcommand or wrong number of arguments");
  }
  function cmdAdvance(srv, args) {
    arity(args, 1, 1, "advance");
    var n = parseFloat(args[0]);
    if (isNaN(n)) throw new RedisError("value is not a valid number of seconds");
    srv.now += n;
    return withNote(int(Math.floor(srv.now)), "ADVANCE is a simulator-only helper that moves the virtual clock forward by " + fmtNum(n) + "s so TTL expiry is deterministic.");
  }
  function cmdDebug(srv, args) {
    var sub = (args[0] || "").toUpperCase();
    if (sub === "ADVANCE" || sub === "JUMP" || sub === "SETTIME") return cmdAdvance(srv, args.slice(1));
    if (sub === "OBJECT") { var e = getEntry(srv, args[1]); if (!e) return nil(); return simple("Value at:0x0 refcount:1 encoding:" + encoding(e) + " serializedlength:" + JSON.stringify(compactValue(e)).length); }
    if (sub === "SLEEP" || sub === "SET-ACTIVE-EXPIRE" || sub === "QUICKLIST-PACKED-THRESHOLD" || sub === "STRINGMATCH-LEN") return ok();
    return withNote(ok(), "DEBUG subcommand '" + (args[0] || "") + "' is accepted but not modeled by this simulator.");
  }
  function cmdHelp() {
    return arr([
      bulk("Keys      DEL EXISTS EXPIRE TTL PERSIST TYPE KEYS SCAN RENAME RANDOMKEY SELECT FLUSHDB DBSIZE"),
      bulk("Strings   SET GET SETEX SETNX MSET MGET APPEND STRLEN INCR DECR INCRBY INCRBYFLOAT GETSET GETDEL"),
      bulk("Hashes    HSET HGET HMSET HMGET HGETALL HDEL HEXISTS HINCRBY HKEYS HVALS HLEN"),
      bulk("Lists     LPUSH RPUSH LPOP RPOP LLEN LRANGE LINDEX LSET LTRIM LREM"),
      bulk("Sets      SADD SREM SMEMBERS SISMEMBER SCARD SINTER SUNION SDIFF"),
      bulk("ZSets     ZADD ZSCORE ZRANGE ZREVRANGE ZRANGEBYSCORE ZRANGEBYLEX ZRANK ZINCRBY ZCARD ZREM"),
      bulk("Server    PING ECHO TIME INFO CONFIG OBJECT MEMORY DEBUG"),
      bulk("Sim-only  ADVANCE <seconds>  — move the virtual clock so TTL demos are deterministic")
    ]);
  }

  /* ================= command table ================= */
  var COMMANDS = {
    set: cmdSet, setnx: cmdSetnx, setex: function (s, a) { return cmdSetex(s, a, false); }, psetex: function (s, a) { return cmdSetex(s, a, true); },
    get: cmdGet, getset: cmdGetset, getdel: cmdGetdel, getex: cmdGetex, mset: cmdMset, mget: cmdMget,
    append: cmdAppend, strlen: cmdStrlen, substr: function (s, a) { return cmdGet(s, [a[0]]); },
    incr: cmdIncr, decr: cmdDecr, incrby: cmdIncrby, decrby: cmdDecrby, incrbyfloat: cmdIncrbyfloat,
    del: cmdDel, unlink: cmdDel, exists: cmdExists, touch: cmdExists,
    expire: function (s, a) { return expireCore(s, a, { cmd: "expire" }); },
    pexpire: function (s, a) { return expireCore(s, a, { cmd: "pexpire", ms: true }); },
    expireat: function (s, a) { return expireCore(s, a, { cmd: "expireat", at: true }); },
    pexpireat: function (s, a) { return expireCore(s, a, { cmd: "pexpireat", at: true, ms: true }); },
    ttl: function (s, a) { return ttlCore(s, a, false, "ttl"); },
    pttl: function (s, a) { return ttlCore(s, a, true, "pttl"); },
    persist: cmdPersist, type: cmdType, keys: cmdKeys, scan: cmdScan, randomkey: cmdRandomkey,
    rename: function (s, a) { return cmdRename(s, a, false); }, renamenx: function (s, a) { return cmdRename(s, a, true); },
    dbsize: cmdDbsize, flushdb: cmdFlushdb, flushall: cmdFlushall, select: cmdSelect,
    object: cmdObject, memory: cmdMemory,
    hset: function (s, a) { return cmdHset(s, a, false); }, hmset: function (s, a) { var r = cmdHset(s, a, false); return r.type === "int" ? ok() : r; }, hsetnx: function (s, a) { return cmdHset(s, a, true); },
    hget: cmdHget, hmget: cmdHmget, hgetall: cmdHgetall, hdel: cmdHdel, hexists: cmdHexists,
    hkeys: function (s, a) { return hashKeys(s, a, "hkeys", "k"); }, hvals: function (s, a) { return hashKeys(s, a, "hvals", "v"); },
    hlen: function (s, a) { arity(a, 1, 1, "hlen"); var e = getEntry(s, a[0]); if (!e) return int(0); if (e.type !== "hash") throw wrongType(); return int(e.value.size); },
    hstrlen: function (s, a) { arity(a, 2, 2, "hstrlen"); var e = getEntry(s, a[0]); if (!e) return int(0); if (e.type !== "hash") throw wrongType(); var v = e.value.get(a[1]); return int(v ? v.length : 0); },
    hincrby: function (s, a) { return cmdHincrby(s, a, false); }, hincrbyfloat: function (s, a) { return cmdHincrby(s, a, true); },
    lpush: function (s, a) { return cmdPush(s, a, true); }, rpush: function (s, a) { return cmdPush(s, a, false); },
    lpushx: function (s, a) { return cmdPushx(s, a, true); }, rpushx: function (s, a) { return cmdPushx(s, a, false); },
    lpop: function (s, a) { return cmdPop(s, a, true); }, rpop: function (s, a) { return cmdPop(s, a, false); },
    llen: cmdLlen, lrange: cmdLrange, lindex: cmdLindex, lset: cmdLset, ltrim: cmdLtrim, lrem: cmdLrem,
    sadd: cmdSadd, srem: cmdSrem, smembers: cmdSmembers, sismember: cmdSismember, smismember: function (s, a) { arity(a, 2, null, "smismember"); return arr(a.slice(1).map(function (m) { var r = cmdSismember(s, [a[0], m]); return r; })); },
    scard: cmdScard,
    sinter: function (s, a) { return setOp(s, a, "sinter", "inter"); }, sunion: function (s, a) { return setOp(s, a, "sunion", "union"); }, sdiff: function (s, a) { return setOp(s, a, "sdiff", "diff"); },
    zadd: cmdZadd, zscore: cmdZscore, zmscore: cmdZmscore, zcard: cmdZcard,
    zrange: function (s, a) { return cmdZrange(s, a, false); }, zrevrange: function (s, a) { return cmdZrange(s, a, true); },
    zrangebyscore: function (s, a) { return cmdZrangebyscore(s, a, false); }, zrevrangebyscore: function (s, a) { return cmdZrangebyscore(s, a, true); },
    zrangebylex: function (s, a) { return cmdZrangebylex(s, a, false); }, zrevrangebylex: function (s, a) { return cmdZrangebylex(s, a, true); },
    zlexcount: cmdZlexcount, zcount: cmdZcount,
    zrank: function (s, a) { return cmdZrank(s, a, false); }, zrevrank: function (s, a) { return cmdZrank(s, a, true); },
    zincrby: cmdZincrby, zrem: cmdZrem,
    ping: cmdPing, echo: cmdEcho, time: cmdTime, info: cmdInfo, config: cmdConfig,
    advance: cmdAdvance, debug: cmdDebug, help: cmdHelp,
    command: function () { return withNote(arr([]), "COMMAND introspection is not modeled by this simulator."); }
  };

  /* ================= value compaction (for keyspace table) ================= */
  function compactValue(e) {
    if (e.type === "string") return e.value;
    if (e.type === "hash") { var h = {}; e.value.forEach(function (v, k) { h[k] = v; }); return h; }
    if (e.type === "list") return e.value.slice();
    if (e.type === "set") return Array.from(e.value).sort();
    if (e.type === "zset") { var z = {}; e.value.forEach(function (v, k) { z[k] = v; }); return z; }
    return null;
  }
  function compactText(e) {
    var s;
    if (e.type === "string") {
      s = e.value.replace(/\n/g, "\\n");
      s = s.length > 64 ? '"' + s.slice(0, 61) + '..."' : '"' + s + '"';
    } else if (e.type === "hash") {
      var parts = []; e.value.forEach(function (v, k) { parts.push(k + ": " + v); }); s = "{" + parts.join(", ") + "}";
    } else if (e.type === "list") {
      s = "[" + e.value.map(function (v) { return '"' + v + '"'; }).join(", ") + "]";
    } else if (e.type === "set") {
      s = "{" + Array.from(e.value).sort().join(", ") + "}";
    } else if (e.type === "zset") {
      var ps = []; zsorted(e).forEach(function (o) { ps.push(o.member + " (" + fmtNum(o.score) + ")"); }); s = "[" + ps.join(", ") + "]";
    } else {
      s = "";
    }
    return s.length > 88 ? s.slice(0, 85) + "..." : s;
  }

  /* ================= reply formatting (redis-cli style) ================= */
  function escapeBulk(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
      .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  }
  function fmtScalar(reply) {
    switch (reply.type) {
      case "status": return reply.value;
      case "error": return "(error) " + reply.value;
      case "int": return "(integer) " + reply.value;
      case "bulk":
        if (reply.value === null || reply.value === undefined) return "(nil)";
        if (String(reply.value).indexOf("\n") >= 0) return String(reply.value).replace(/\n$/, "");
        return '"' + escapeBulk(reply.value) + '"';
      default: return String(reply.value);
    }
  }
  function fmtReply(reply, indent) {
    indent = indent || "";
    if (reply.type === "array") {
      if (!reply.value.length) return indent + "(empty array)";
      return reply.value.map(function (v, i) {
        var idx = (i + 1) + ") ";
        if (v && v.type === "array") {
          var lines = fmtReply(v, indent + "   ").split("\n");
          var first = lines[0].slice((indent + "   ").length);
          return indent + idx + first + (lines.length > 1 ? "\n" + lines.slice(1).join("\n") : "");
        }
        return indent + idx + fmtScalar(v);
      }).join("\n");
    }
    return indent + fmtScalar(reply);
  }

  /* ================= execution ================= */
  function looksLikeSql(tokens) {
    var sql = ["FROM", "WHERE", "LIKE", "JOIN", "GROUP", "ORDER", "SUM", "COUNT", "AVG", "INSERT", "UPDATE", "DELETE", "CREATE", "TABLE", "VALUES", "SELECT"];
    return tokens.some(function (t) { return sql.indexOf(String(t).toUpperCase()) >= 0; });
  }
  var SQL_HINT = "Redis has no query language — no SELECT … FROM, WHERE, JOIN, or SUM. " +
    "You can only GET a key you already know, or maintain your own secondary index.";

  function prompt(srv) {
    return "127.0.0.1:6379" + (srv.db ? "[" + srv.db + "]" : "") + "> ";
  }

  // Strip an inline "# comment" that is outside quotes. Real redis-cli has no
  // comments at all; we allow them so teaching scripts can annotate commands.
  function stripInlineComment(line) {
    var quote = null;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (quote) {
        if (c === "\\") { i++; continue; }
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        return line.slice(0, i);
      }
    }
    return line;
  }

  function execute(srv, raw) {
    var line = String(raw).replace(/\s+$/, "");
    if (!line.trim()) return null;
    if (/^\s*(#|\/\/)/.test(line)) return { kind: "comment", text: line.trim() };
    var command = stripInlineComment(line).replace(/\s+$/, "");
    if (!command.trim()) return null;
    var p = prompt(srv);
    var tokens;
    try { tokens = tokenize(command); } catch (e) { return { kind: "cmd", prompt: p, line: command, error: e.message }; }
    if (!tokens.length) return null;
    var handler = COMMANDS[tokens[0].toLowerCase()];
    if (!handler) {
      return { kind: "cmd", prompt: p, line: command, error: "ERR unknown command '" + tokens[0] + "'", sql: looksLikeSql(tokens) };
    }
    try {
      var reply = handler(srv, tokens.slice(1));
      return { kind: "cmd", prompt: p, line: command, reply: reply };
    } catch (e) {
      var msg = e instanceof RedisError ? e.message : (e && e.message) || String(e);
      return { kind: "cmd", prompt: p, line: command, error: msg, sql: looksLikeSql(tokens) };
    }
  }

  /* ================= rendering ================= */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function Console(out) {
    this.pre = document.createElement("pre");
    this.pre.className = "redis-out";
    out.appendChild(this.pre);
  }
  Console.prototype.write = function (text, cls) {
    var span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text;
    this.pre.appendChild(span);
  };
  Console.prototype.nl = function () { this.pre.appendChild(document.createTextNode("\n")); };

  function writeResult(con, r) {
    if (r.kind === "comment") { con.write(r.text, "rcmt"); con.nl(); return; }
    con.write(r.prompt, "rp");
    con.write(r.line, "rc");
    con.nl();
    if (r.error) {
      con.write("(error) " + r.error, "rerr");
      con.nl();
      if (r.sql) { con.write("hint: " + SQL_HINT, "rhint"); con.nl(); }
      return;
    }
    con.write(fmtReply(r.reply), "rval");
    con.nl();
    if (r.reply && r.reply.note) { con.write("(note) " + r.reply.note, "rnote"); con.nl(); }
  }

  function renderKeyspace(out, srv) {
    var keys = liveKeys(srv).sort();
    var wrap = document.createElement("div");
    wrap.className = "redis-keyspace";
    var head = document.createElement("div");
    head.className = "rk-head";
    head.textContent = "Keyspace · db" + srv.db + " · " + keys.length + " key" + (keys.length === 1 ? "" : "s");
    wrap.appendChild(head);
    if (!keys.length) {
      var empty = document.createElement("div");
      empty.className = "rk-empty";
      empty.textContent = "(empty — no keys in this database)";
      wrap.appendChild(empty);
      out.appendChild(wrap);
      return;
    }
    var html = "<table><thead><tr><th>key</th><th>type</th><th>value</th><th>TTL</th></tr></thead><tbody>";
    keys.forEach(function (k) {
      var e = getEntry(srv, k);
      if (!e) return;
      var ttl = e.expiresAt === null ? "—" : Math.max(0, Math.round(e.expiresAt - srv.now)) + "s";
      html += "<tr><td><code>" + esc(k) + "</code></td><td>" + esc(e.type) + "</td><td>" + esc(compactText(e)) + "</td><td>" + esc(ttl) + "</td></tr>";
    });
    html += "</tbody></table>";
    var holder = document.createElement("div");
    holder.innerHTML = html;
    wrap.appendChild(holder);
    out.appendChild(wrap);
  }

  /* ================= widget mounting ================= */
  function loadSetup(srv, setup) {
    if (!setup) return;
    setup.split("\n").forEach(function (l) {
      if (!l.trim()) return;
      try { execute(srv, l); } catch (e) { /* setup errors are ignored */ }
    });
  }

  function mountRedis(widget) {
    var ta = widget.querySelector("textarea");
    if (!ta) return;
    var setup = ta.getAttribute("data-setup") || "";
    var body = widget.querySelector(".widget-body") || widget;

    var hint = document.createElement("div");
    hint.className = "redis-hint";
    hint.textContent = "Redis console — one command per line. Lines starting with # are comments. ADVANCE n moves the virtual clock. Type HELP for the command list.";
    if (ta.nextSibling) body.insertBefore(hint, ta.nextSibling); else body.appendChild(hint);

    var btn = document.createElement("button");
    btn.className = "run-btn";
    btn.textContent = "Run ▶";
    var out = document.createElement("div");
    out.className = "result";
    body.appendChild(btn);
    body.appendChild(out);

    btn.addEventListener("click", function () {
      out.innerHTML = "";
      var srv = createServer();
      loadSetup(srv, setup);
      var con = new Console(out);
      ta.value.split("\n").forEach(function (l) {
        var r = execute(srv, l);
        if (r) writeResult(con, r);
      });
      renderKeyspace(out, srv);
    });
  }

  function mountWidgets() {
    document.querySelectorAll('[data-widget="redis"]').forEach(mountRedis);
  }

  global.RedisSim = { mountWidgets: mountWidgets, createServer: createServer, execute: execute, tokenize: tokenize, fmtReply: fmtReply };
})(typeof window !== "undefined" ? window : this);
