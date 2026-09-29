import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionQualityBanner } from "./ConnectionQualityBanner";

describe("ConnectionQualityBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing when connection is good and connected", () => {
    const { container } = render(
      <ConnectionQualityBanner
        connectionState="connected"
        quality="good"
        videoEnabled
        onDisableVideo={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the reconnecting banner, taking priority over quality", () => {
    render(
      <ConnectionQualityBanner
        connectionState="reconnecting"
        quality="poor"
        videoEnabled
        onDisableVideo={vi.fn()}
      />,
    );
    expect(screen.getByText("Переподключение…")).toBeInTheDocument();
  });

  it("shows a poor-connection banner without the video prompt at first", () => {
    render(
      <ConnectionQualityBanner
        connectionState="connected"
        quality="poor"
        videoEnabled
        onDisableVideo={vi.fn()}
      />,
    );
    expect(screen.getByText("Слабая связь")).toBeInTheDocument();
    expect(screen.queryByText("Выключить видео?")).not.toBeInTheDocument();
  });

  it("adds the 'Выключить видео?' prompt after 8s of sustained poor quality with video on", () => {
    const onDisableVideo = vi.fn();
    render(
      <ConnectionQualityBanner
        connectionState="connected"
        quality="poor"
        videoEnabled
        onDisableVideo={onDisableVideo}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    const prompt = screen.getByText("Выключить видео?");
    fireEvent.click(prompt);
    expect(onDisableVideo).toHaveBeenCalled();
  });

  it("never shows the video prompt when video is already off", () => {
    render(
      <ConnectionQualityBanner
        connectionState="connected"
        quality="poor"
        videoEnabled={false}
        onDisableVideo={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText("Выключить видео?")).not.toBeInTheDocument();
  });
});
