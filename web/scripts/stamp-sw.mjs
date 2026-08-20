/** Stamp the built output's fingerprint into the service worker.
 *
 *  A service worker only updates when its own bytes change. Without this the
 *  browser keeps serving yesterday's app forever - the classic way a PWA goes
 *  stale - so the version is a hash of what was actually built.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";

function fingerprint(dir, hash = createHash("sha256")) {
  for (const name of readdirSync(dir).sort()) {
    if (name === "sw.js") continue;                 // it contains the answer
    if (name === "rootCA.pem") continue;            // a local dev aid, never shipped
    const path = join(dir, name);
    if (statSync(path).isDirectory()) fingerprint(path, hash);
    else hash.update(name).update(readFileSync(path));
  }
  return hash;
}

const version = fingerprint(OUT).digest("hex").slice(0, 12);
const path = join(OUT, "sw.js");
const stamped = readFileSync(path, "utf8").replace("__VERSION__", version);
writeFileSync(path, stamped);
console.log(`  service worker stamped ${version}`);
