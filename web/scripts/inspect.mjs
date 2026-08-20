/** Ask the browser what it actually laid out.
 *
 *  Headless screenshots of this app are unreliable - Mapbox keeps a WebGL frame
 *  loop running and the virtual clock never settles - and jsdom has no layout at
 *  all. Driving Chrome over the DevTools protocol gets real numbers out, and
 *  Node has had a WebSocket client built in since 22, so this needs no packages.
 *
 *  Usage: node scripts/inspect.mjs <url> [width] [height]
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const [url, width = "390", height = "860"] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--window-size=${width},${height}`, "--disable-gpu",
  "--hide-scrollbars", "--no-first-run", "--user-data-dir=/tmp/cdp-profile",
], { stdio: "ignore" });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await wait(250);
  }
  throw new Error("Chrome did not open a debugging port");
}

const socket = new WebSocket(await target());
await new Promise((r) => socket.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const n = ++id;
  pending.set(n, resolve);
  socket.send(JSON.stringify({ id: n, method, params }));
});

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",
           { width: +width, height: +height, deviceScaleFactor: 1, mobile: +width < 860 });
await send("Page.navigate", { url });
await wait(3500);

const { result } = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right),
               width: Math.round(r.width), height: Math.round(r.height) };
    };
    const widest = [...document.querySelectorAll("*")]
      .map((el) => ({ tag: el.tagName.toLowerCase(),
                      cls: (el.className.baseVal ?? el.className ?? "").toString().slice(0, 40),
                      right: Math.round(el.getBoundingClientRect().right) }))
      .filter((e) => e.right > window.innerWidth + 1)
      .sort((a, b) => b.right - a.right).slice(0, 6);
    return {
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      rail: box("aside"), panel: box("[class*='panel']"),
      fields: box("[class*='fields']"), overflowing: widest,
    };
  })()`,
});
console.log(JSON.stringify(result.value, null, 2));

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot?.data) {
  writeFileSync(process.env.SHOT ?? "/tmp/shot.png", Buffer.from(shot.data, "base64"));
  console.log(`screenshot: ${process.env.SHOT ?? "/tmp/shot.png"}`);
}
socket.close();
chrome.kill();
