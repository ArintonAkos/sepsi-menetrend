import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InstallApp from "./InstallApp";
import { STRINGS } from "@/lib/i18n";

describe("InstallApp", () => {
  beforeEach(() => {
    localStorage.clear();
    fireEvent(window, new Event("appinstalled"));
  });

  it("keeps a clear installation control visible when this browser cannot prompt", () => {
    render(<InstallApp t={STRINGS.hu} />);

    expect(screen.getByRole("button", { name: "Alkalmazás telepítése" })).toBeDisabled();
    expect(screen.getByText("A telepítés a kiadott HTTPS-es oldalon, támogatott böngészőben érhető el."))
      .toBeInTheDocument();
  });

  it("does not leave the installation section empty after a previous prompt", () => {
    localStorage.setItem("sepsi.install.dismissed", "1");

    render(<InstallApp t={STRINGS.hu} />);

    expect(screen.getByRole("button", { name: "Alkalmazás telepítése" })).toBeInTheDocument();
  });

  it("keeps the browser install offer when it arrives before settings is opened", () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt");
    Object.defineProperty(event, "prompt", { value: prompt });
    fireEvent(window, event);

    render(<InstallApp t={STRINGS.hu} />);

    expect(screen.getByRole("button", { name: "Alkalmazás telepítése" })).toBeInTheDocument();
  });
});
