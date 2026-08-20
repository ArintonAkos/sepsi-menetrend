import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const alias = { "@": resolve(import.meta.dirname, ".") };

export default defineConfig({
  test: {
    projects: [
      {
        // the engine is plain TypeScript and must stay runnable without a DOM
        resolve: { alias },
        test: { name: "engine", environment: "node", include: ["lib/**/*.test.ts"] },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui", environment: "jsdom",
          include: ["components/**/*.test.tsx", "components/**/*.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
          /* Every panel test builds the whole app over the real feed and then
             waits for React to settle. Testing Library allows one second for
             that by default, which is generous on an idle machine and not
             nearly enough on a busy one - the suite failed a different handful
             of tests on each run, which is worse than failing outright because
             it teaches you to re-run instead of to look. The test timeout has
             to clear the wait, or the test dies before the wait can report
             what it was waiting for. */
          testTimeout: 20_000,
        },
      },
    ],
  },
});
