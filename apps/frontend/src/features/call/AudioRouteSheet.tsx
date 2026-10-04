import type { NativeAudioRoute, NativeAudioRoutes } from "../../shared/native";
import { Backdrop } from "../../shared/ui/backdrop";

import { AudioRouteIcon } from "./AudioRouteIcon";

const ROUTE_LABELS: Record<NativeAudioRoute, string> = {
  earpiece: "Телефон",
  speaker: "Динамик",
  bluetooth: "Bluetooth",
  wired: "Наушники",
};

// The call screen is `z-50`, so the sheet and its backdrop sit above it.
const BACKDROP_Z = "z-60";

export interface AudioRouteSheetProps {
  routes: NativeAudioRoutes;
  onSelect: (route: NativeAudioRoute) => void;
  onClose: () => void;
}

/**
 * Bottom sheet that picks where the call's sound goes (T-087, FR-APP-04) — opened from the call
 * screen when the phone offers three or more routes. Mounted only while open.
 */
export function AudioRouteSheet({ routes, onSelect, onClose }: AudioRouteSheetProps) {
  return (
    <>
      <Backdrop open onClose={onClose} zClass={BACKDROP_Z} />
      <div
        role="menu"
        aria-label="Аудиовыход"
        className="pb-safe fixed inset-x-0 bottom-0 z-70 flex animate-dialog-in flex-col gap-1 rounded-t-2xl border-t border-line bg-panel p-2 text-fg"
      >
        {routes.available.map(({ route, name }) => {
          const selected = route === routes.current;
          const detail = route === "bluetooth" || route === "wired" ? name : "";
          return (
            <button
              key={route}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => {
                onSelect(route);
              }}
              className={[
                "flex h-13 w-full items-center gap-3 rounded-lg px-3 text-left text-[14.5px] hover:bg-bg2",
                selected ? "text-accent-text" : "",
              ].join(" ")}
            >
              <AudioRouteIcon route={route} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{ROUTE_LABELS[route]}</span>
                {detail && <span className="truncate text-xs text-mute">{detail}</span>}
              </span>
              {selected && <span aria-hidden>{"✓"}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
