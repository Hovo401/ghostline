import type { NativeAudioRoute } from "../../shared/native";
import { BluetoothIcon, HeadsetIcon, PhoneIcon, SpeakerIcon } from "../../shared/ui/call-icons";

/** The glyph of one audio route (earpiece reuses the phone handset). */
export function AudioRouteIcon({ route }: { route: NativeAudioRoute }) {
  switch (route) {
    case "earpiece":
      return <PhoneIcon />;
    case "speaker":
      return <SpeakerIcon />;
    case "bluetooth":
      return <BluetoothIcon />;
    case "wired":
      return <HeadsetIcon />;
  }
}
