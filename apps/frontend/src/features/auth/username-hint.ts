import { MIN_USERNAME_LENGTH } from "../../entities/session";

// Live username hint — DESIGN-BRIEF §7.1: "Латиница, цифры и _" →
// "Минимум 3 символа" → "@имя свободно" (accent) / "@имя уже занято" (danger).
export interface UsernameHint {
  text: string;
  tone: "mute" | "accent" | "danger";
}

/** `a–z 0–9 _` only, lower-cased — mirrors RegisterRequestSchema's username regex. */
export function sanitizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function usernameHint(
  username: string,
  availability: { checking: boolean; available: boolean | undefined },
): UsernameHint {
  if (username.length === 0) {
    return { text: "Латиница, цифры и _", tone: "mute" };
  }
  if (username.length < MIN_USERNAME_LENGTH) {
    return { text: "Минимум 3 символа", tone: "mute" };
  }
  if (availability.checking || availability.available === undefined) {
    return { text: "Проверяем…", tone: "mute" };
  }
  return availability.available
    ? { text: `@${username} свободно`, tone: "accent" }
    : { text: `@${username} уже занято`, tone: "danger" };
}
