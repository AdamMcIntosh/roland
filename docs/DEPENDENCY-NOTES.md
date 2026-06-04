# Dependency notes

## Linux self-hosted installs

Roland Web on a Linux home server should use **Node.js 22+** (see `engines` in `package.json` files). The app uses Node’s built-in `node:sqlite` at runtime — no npm `sqlite3` binary is loaded by roland-web itself.

The npm package **`tar`** (pinned to `^7.5.16` via overrides) is a **build-time** dependency of `node-gyp` when installing `@cursor/sdk` → `sqlite3` native addons. It is not a wrapper around `/usr/bin/tar`. Overrides force `tar@7` so old `tar@6` CVEs and deprecations do not appear in the tree. On Linux, ensure `build-essential`, `python3`, and `make` are installed if `sqlite3` ever needs a local compile (prebuild binaries usually avoid that).

After changing overrides, regenerate the lockfile:

```bash
cd roland-web
rm -rf node_modules package-lock.json
npm install
npm audit
```

---

## `prebuild-install@7.1.3` deprecation warning

On `npm install`, you may still see:

```text
npm warn deprecated prebuild-install@7.1.3: No longer maintained.
```

**Source:** `@cursor/sdk` → `sqlite3@5.1.7` → `prebuild-install` (used to download prebuilt native binaries for the SQLite addon).

**Risk for Roland:** Low for typical use. Roland and roland-web do not call `prebuild-install` directly; it runs only when npm installs or rebuilds `sqlite3`. Our usage is the published `@cursor/sdk` client, not custom native code. The warning is maintenance/deprecation, not a reported CVE in this chain.

**What we already mitigate:** `package.json` overrides pin `node-gyp@^12.3.0`, `tar@^7.5.16`, `glob@^13.0.0`, and related transitive packages so the old `node-gyp@8` tree (`inflight`, `rimraf@3`, `npmlog`, `tar@6`, etc.) does not appear.

**When it goes away:** When `@cursor/sdk` stops depending on `sqlite3` or switches to a maintained install path (e.g. prebuild alternatives). Track `@cursor/sdk` releases; no local fork of `prebuild-install` is recommended.
