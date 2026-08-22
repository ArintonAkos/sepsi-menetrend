import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Analytics from "./Analytics";
import { KEY } from "@/lib/consent";

const GA_ID = "G-TESTID123";
const tag = () => document.getElementById("ga-tag") as HTMLScriptElement | null;

afterEach(() => {
  localStorage.clear();
  tag()?.remove();
  window.dataLayer = [];
});

describe("consent-gated analytics", () => {
  it("stays silent when no measurement id is configured", () => {
    render(<Analytics gaId={undefined} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(tag()).toBeNull();
  });

  it("asks for consent when nothing has been decided yet", () => {
    render(<Analytics gaId={GA_ID} />);
    expect(screen.getByRole("button", { name: /accept|elfogad/i })).toBeInTheDocument();
    expect(tag()).toBeNull();
  });

  it("loads nothing and remembers a decline", async () => {
    const user = userEvent.setup();
    render(<Analytics gaId={GA_ID} />);
    await user.click(screen.getByRole("button", { name: /decline|elutas/i }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(tag()).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("denied");
  });

  it("loads gtag and remembers acceptance", async () => {
    const user = userEvent.setup();
    render(<Analytics gaId={GA_ID} />);
    await user.click(screen.getByRole("button", { name: /accept|elfogad/i }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(tag()?.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
    expect(localStorage.getItem(KEY)).toBe("granted");
    const hasConfig = window.dataLayer.some(
      (entry) => Array.from(entry as unknown[]).includes("config") && Array.from(entry as unknown[]).includes(GA_ID),
    );
    expect(hasConfig).toBe(true);
  });

  it("loads gtag immediately, with no prompt, for a returning visitor who granted", () => {
    localStorage.setItem(KEY, "granted");
    render(<Analytics gaId={GA_ID} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(tag()).not.toBeNull();
  });

  it("stays silent, with no prompt, for a returning visitor who declined", () => {
    localStorage.setItem(KEY, "denied");
    render(<Analytics gaId={GA_ID} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(tag()).toBeNull();
  });
});
