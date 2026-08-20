/** Issue a development certificate that the phone will also accept.
 *
 *  `next dev --experimental-https` only covers localhost and 127.0.0.1, so a
 *  phone hitting the machine over wifi gets a name mismatch - and without a
 *  secure origin the browser refuses geolocation outright, without even asking.
 *
 *  This covers the machine's own addresses and its Bonjour name. The .local
 *  name is the one worth using: it survives the router handing out a new IP.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { networkInterfaces, hostname } from "node:os";

const DIR = "certificates";
const KEY = `${DIR}/dev-key.pem`;
const CERT = `${DIR}/dev.pem`;

const addresses = Object.values(networkInterfaces()).flat()
  .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
  .map((entry) => entry.address);

let bonjour = "";
try {
  bonjour = execFileSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8" }).trim();
} catch { bonjour = hostname().split(".")[0]; }

const names = [...new Set([
  "localhost", "127.0.0.1", "::1",
  `${bonjour}.local`, `${bonjour.toLowerCase()}.local`,
  ...addresses,
])].filter(Boolean);

mkdirSync(DIR, { recursive: true });
try {
  execFileSync("mkcert", ["-key-file", KEY, "-cert-file", CERT, ...names],
               { stdio: "inherit" });
} catch {
  console.error("\nmkcert is needed for this: brew install mkcert");
  console.error("Then run `mkcert -install` once, so this machine trusts the CA.");
  process.exit(1);
}

const root = execFileSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).trim();
console.log(`\n  certificate covers: ${names.join(", ")}`);
console.log(`  root CA: ${root}/rootCA.pem`);
console.log("\n  On the phone, once: open that rootCA.pem, install the profile,");
console.log("  then Settings > General > About > Certificate Trust Settings and");
console.log("  switch it on. After that there are no warnings and geolocation works.");
if (!existsSync(KEY)) process.exit(1);
