// Password strength meter — DESIGN-BRIEF §7.1: 4 segments, red → yellow →
// accent, labelled "Слишком короткий / Средний / Надёжный / Очень надёжный".
export type PasswordStrengthTone = "empty" | "danger" | "warning" | "accent";

export interface PasswordStrength {
  /** How many of the 4 segments are filled. */
  filled: 0 | 1 | 2 | 3 | 4;
  tone: PasswordStrengthTone;
  label: string;
}

const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];

function countCharacterClasses(password: string): number {
  return CHARACTER_CLASSES.reduce((count, pattern) => count + (pattern.test(password) ? 1 : 0), 0);
}

/** RegisterRequestSchema requires 8+ chars — mirrored here for the live hint. */
export const MIN_PASSWORD_LENGTH = 8;

export function scorePasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return { filled: 0, tone: "empty", label: "" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { filled: 1, tone: "danger", label: "Слишком короткий" };
  }

  const variety = countCharacterClasses(password);
  if (variety <= 1) {
    return { filled: 2, tone: "warning", label: "Средний" };
  }
  if (variety === 2 || password.length < 12) {
    return { filled: 3, tone: "accent", label: "Надёжный" };
  }
  return { filled: 4, tone: "accent", label: "Очень надёжный" };
}
