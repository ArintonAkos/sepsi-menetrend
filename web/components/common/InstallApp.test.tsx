import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InstallApp from "./InstallApp";
import { STRINGS } from "@/lib/i18n";

describe("InstallApp", () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    localStorage.clear();
    fireEvent(window, new Event("appinstalled"));
  });

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUserAgent });
  });

  it("opens a useful installation card when this browser cannot prompt", () => {
    render(<InstallApp t={STRINGS.hu} />);

    fireEvent.click(screen.getByRole("button", { name: "Alkalmazás telepítése" }));

    expect(screen.getByRole("dialog", { name: "Sepsi Menetrend" })).toBeInTheDocument();
    expect(screen.getByText("A telepítés a kiadott HTTPS-es oldalon, támogatott böngészőben érhető el."))
      .toBeInTheDocument();
  });

  it("shows the three iPhone home-screen steps after tapping install", () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone)" });

    render(<InstallApp t={STRINGS.hu} />);
    fireEvent.click(screen.getByRole("button", { name: "Alkalmazás telepítése" }));

    expect(screen.getByText("1. Nyomd meg a Megosztás gombot.")).toBeInTheDocument();
    expect(screen.getByText("2. Válaszd a „Főképernyőhöz adás” lehetőséget.")).toBeInTheDocument();
    expect(screen.getByText("3. Erősítsd meg a „Hozzáadás” gombbal.")).toBeInTheDocument();
  });

  it("starts the browser installation from the branded card when the prompt arrives", () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt");
    Object.defineProperty(event, "prompt", { value: prompt });
    fireEvent(window, event);

    render(<InstallApp t={STRINGS.hu} />);
    fireEvent.click(screen.getByRole("button", { name: "Alkalmazás telepítése" }));
    fireEvent.click(screen.getByRole("button", { name: "Telepítés" }));

    expect(prompt).toHaveBeenCalledOnce();
  });
});
