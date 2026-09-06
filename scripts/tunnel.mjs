/**
 * Runs the dev server behind a Cloudflare quick tunnel, so phones can reach it
 * over HTTPS without installing anything.
 *
 *   node scripts/tunnel.mjs        (or: npm run dev:tunnel)
 *
 * The camera is the reason this exists. Browsers only expose
 * `navigator.mediaDevices` in a secure context, so the scanner needs HTTPS on
 * whatever address the phone types. Serving from a LAN IP means minting a
 * certificate for it and teaching every phone to trust it (see `dev:lan`) —
 * and redoing that whenever the IP changes. A quick tunnel sidesteps both: it
 * hands out a real `*.trycloudflare.com` name whose certificate every phone
 * already trusts.
 *
 * The trade-off is that the URL is on the public internet, and this app has no
 * auth beyond a cookie holding a user id. The hostname is random and dies with
 * this process, but while it's up, anyone holding the link can log drinks as
 * anyone. That's fine for a party on a whim; it is not a way to host this.
 *
 * Both children share this process's lifetime — killing either one, or this
 * one, tears down the pair rather than orphaning a tunnel to a dead server.
 */

import { spawn } from "node:child_process";

const PORT = process.env.PORT ?? "3000";
const READY_TIMEOUT_MS = 60_000;

/** Cloudflare prints the assigned hostname once, inside a banner, on stderr. */
const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  process.exit(code);
}

function start(label, command, args) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);

  child.on("error", (error) => {
    console.error(`\n[${label}] failed to start: ${error.message}`);
    if (error.code === "ENOENT" && command === "cloudflared") {
      console.error("Install it with: brew install cloudflared");
    }
    shutdown(1);
  });

  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.error(`\n[${label}] exited (${code ?? "signalled"}) — stopping the other half.`);
    shutdown(code ?? 1);
  });

  return child;
}

/** Mirrors a child's output to ours, and resolves when `pattern` shows up. */
function waitFor(child, pattern, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} produced no match for ${pattern} in ${READY_TIMEOUT_MS / 1000}s`)),
      READY_TIMEOUT_MS,
    );

    let settled = false;
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        process.stderr.write(chunk);
        if (settled) return;
        const match = chunk.match(pattern);
        if (!match) return;
        settled = true;
        clearTimeout(timer);
        resolve(match[0]);
      });
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const next = start("next", "npx", ["next", "dev", "--port", PORT]);
await waitFor(next, /Ready in|started server/i, "next dev");

const tunnel = start("cloudflared", "cloudflared", [
  "tunnel",
  "--url",
  `http://localhost:${PORT}`,
]);
const url = await waitFor(tunnel, TUNNEL_URL, "cloudflared");

console.log(
  [
    "",
    "  ─────────────────────────────────────────────",
    "   Open this on your phone:",
    "",
    `     ${url}`,
    "",
    "   Tap 'Turn on camera' and allow the prompt.",
    "   Public while this runs. Ctrl+C stops both.",
    "  ─────────────────────────────────────────────",
    "",
  ].join("\n"),
);
