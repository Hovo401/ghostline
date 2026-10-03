import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as PwaInstall from "../../shared/lib/pwa-install";
import { type PwaInstallMode, usePwaInstallStore } from "../../shared/lib/pwa-install";

import { InstallAppBanner } from "./InstallAppBanner";

const installMock = vi.fn();
let mode: PwaInstallMode = "prompt";
vi.mock("../../shared/lib/pwa-install", async (importOriginal) => {
  const actual = await importOriginal<typeof PwaInstall>();
  return { ...actual, usePwaInstall: () => ({ mode, install: installMock }) };
});

describe("InstallAppBanner", () => {
  beforeEach(() => {
    mode = "prompt";
    installMock.mockReset().mockResolvedValue(undefined);
    usePwaInstallStore.setState({ bannerDismissed: false });
  });

  afterEach(cleanup);

  it("renders nothing where the app can't be (or already is) installed", () => {
    mode = null;
    const { container } = render(<InstallAppBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the browser's install dialog", () => {
    render(<InstallAppBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Установить" }));
    expect(installMock).toHaveBeenCalledOnce();
  });

  it("on iOS shows the manual steps instead", () => {
    mode = "ios";
    render(<InstallAppBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Установить" }));
    expect(installMock).not.toHaveBeenCalled();
    expect(screen.getByText(/На экран «Домой»/)).toBeInTheDocument();
  });

  it("dismissing it persists and hides it", () => {
    const { container } = render(<InstallAppBanner />);
    fireEvent.click(screen.getByLabelText("Скрыть предложение установить"));
    expect(usePwaInstallStore.getState().bannerDismissed).toBe(true);
    expect(container).toBeEmptyDOMElement();
  });
});
