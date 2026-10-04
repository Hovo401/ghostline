import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  sanitizeUsername,
  useLogin,
  useRegister,
  useUsernameAvailability,
  usernameHint,
} from "../../entities/session";
import { Button } from "../../shared/ui/button";
import { GhostField } from "../../shared/ui/ghost-field";
import { Scramble } from "../../shared/ui/scramble";
import { SegmentedTabs } from "../../shared/ui/segmented-tabs";
import { TextField } from "../../shared/ui/text-field";

import { MIN_PASSWORD_LENGTH, scorePasswordStrength } from "./password-strength";

// Debounce for the live username-availability check (FR-AUTH-04) — long
// enough to skip mid-word keystrokes, short enough to feel live.
const USERNAME_CHECK_DEBOUNCE_MS = 400;

const AUTH_TABS = [
  { value: "login", label: "Вход" },
  { value: "register", label: "Регистрация" },
] as const;
type AuthTab = (typeof AUTH_TABS)[number]["value"];

const STRENGTH_TONE_CLASS = {
  empty: "bg-line",
  danger: "[background:var(--color-danger)]",
  warning: "[background:var(--color-warning)]",
  accent: "[background:var(--color-accent)]",
} as const;

const STRENGTH_LABEL_TONE_CLASS = {
  empty: "text-mute",
  danger: "text-danger",
  warning: "text-warning",
  accent: "text-accent-text",
} as const;

/**
 * Вход и регистрация — DESIGN-BRIEF §7.1. Registration is one step (username
 * + password only): the recovery-phrase step and a separate display-name
 * field are out of scope for this build (docs/tasks/BACKLOG.md "Отложено",
 * FR-AUTH-01 — "Отображаемое имя заполняется потом в профиле").
 */
export function Auth() {
  // `strict: false` reads the `/login` route's `tab` search param without
  // requiring this component to be mounted at that exact route — needed
  // for Auth.spec.tsx's minimal single-root-route test setup.
  const search = useSearch({ strict: false });
  const initialTab = search.tab === "register" ? "register" : "login";
  const [tab, setTab] = useState<AuthTab>(initialTab);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col gap-10 px-8 pt-[calc(1.75rem+var(--safe-top))] pb-[calc(2.5rem+var(--safe-bottom))] lg:px-14">
        <Link
          to="/"
          className="flex w-fit items-center gap-1.5 text-xl font-semibold tracking-tight"
        >
          ghostline
          <span aria-hidden className="block h-4.75 w-2.25 [background:var(--color-accent)]" />
        </Link>

        <div className="mx-auto flex w-full max-w-105 flex-1 flex-col justify-center gap-7">
          <SegmentedTabs options={AUTH_TABS} value={tab} onChange={setTab} className="self-start" />
          {tab === "login" ? (
            <LoginForm
              onSwitchToRegister={() => {
                setTab("register");
              }}
            />
          ) : (
            <RegisterForm />
          )}
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-line bg-bg2 lg:block">
        <GhostField layout="center" count={1600} className="absolute inset-0" />
        <div className="absolute right-10 bottom-9 left-10 flex flex-col gap-2 font-mono text-xs tracking-wide text-mute [text-shadow:0_0_12px_var(--color-bg2)]">
          <span>ВЕБ-МЕССЕНДЖЕР · БЕЗ УСТАНОВКИ</span>
          <span className="text-[15px] text-fg">
            <Scramble text="Откройте вкладку — и пишите." />
          </span>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const navigate = useNavigate();

  const canSubmit = username.length > 0 && password.length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        login.mutate(
          { username, password },
          { onSuccess: () => void navigate({ to: "/app", replace: true }) },
        );
      }}
      className="flex flex-col gap-5.5"
    >
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-4xl font-medium tracking-tight">С возвращением</h1>
        <p className="m-0 text-[15px] leading-[1.55] text-mute">
          Войдите по имени пользователя. Номер телефона не нужен.
        </p>
      </div>

      <TextField
        label="Имя пользователя"
        name="username"
        placeholder="@имя"
        autoComplete="username"
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
        }}
      />
      <TextField
        label="Пароль"
        name="password"
        type="password"
        placeholder="••••••••"
        autoComplete="current-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />

      {login.isError && (
        <p className="m-0 font-mono text-xs text-danger">
          Не удалось войти. Проверьте имя пользователя и пароль.
        </p>
      )}

      <Button
        type="submit"
        disabled={!canSubmit || login.isPending}
        className="h-13 w-full disabled:cursor-not-allowed disabled:opacity-[.45]"
      >
        Войти
      </Button>

      {/* Recovery-phrase login is deferred (BACKLOG.md "Отложено", T-002) — hidden, not just unlinked. */}
      <div className="flex justify-end text-sm text-mute">
        <span className="cursor-pointer" onClick={onSwitchToRegister}>
          Создать аккаунт
        </span>
      </div>
    </form>
  );
}

function RegisterForm() {
  const [rawUsername, setRawUsername] = useState("");
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [password, setPassword] = useState("");
  const register = useRegister();
  const navigate = useNavigate();

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedUsername(rawUsername);
    }, USERNAME_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [rawUsername]);

  const availability = useUsernameAvailability(debouncedUsername);
  const checkingAvailability = rawUsername !== debouncedUsername || availability.isFetching;
  const hint = usernameHint(rawUsername, {
    checking: checkingAvailability,
    available: availability.data?.available,
  });
  const strength = scorePasswordStrength(password);

  const canSubmit =
    rawUsername.length >= 3 &&
    hint.tone !== "danger" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !checkingAvailability;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        // Display name isn't collected at registration (FR-AUTH-01) —
        // default it to the username; editable later in profile settings.
        register.mutate(
          { username: rawUsername, password, displayName: rawUsername },
          { onSuccess: () => void navigate({ to: "/app", replace: true }) },
        );
      }}
      className="flex flex-col gap-5.5"
    >
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-4xl font-medium tracking-tight">Новый аккаунт</h1>
        <p className="m-0 text-[15px] leading-[1.55] text-mute">
          Только имя и пароль — номер телефона не понадобится.
        </p>
      </div>

      <TextField
        label="Имя пользователя"
        name="username"
        placeholder="например, tihiy_veter"
        autoComplete="username"
        value={rawUsername}
        onChange={(e) => {
          setRawUsername(sanitizeUsername(e.target.value));
        }}
        hint={hint.text}
        hintTone={hint.tone}
      />
      <TextField
        label="Пароль"
        name="password"
        type="password"
        placeholder="Минимум 8 символов"
        autoComplete="new-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
        hint={
          <>
            <div className="grid grid-cols-4 gap-1">
              {([1, 2, 3, 4] as const).map((segment) => (
                <div
                  key={segment}
                  className={[
                    "h-1 rounded-full transition-colors duration-200",
                    segment <= strength.filled ? STRENGTH_TONE_CLASS[strength.tone] : "bg-line",
                  ].join(" ")}
                />
              ))}
            </div>
            {strength.label && (
              <span className={STRENGTH_LABEL_TONE_CLASS[strength.tone]}>{strength.label}</span>
            )}
          </>
        }
      />

      {register.isError && (
        <p className="m-0 font-mono text-xs text-danger">
          Не удалось создать аккаунт. Попробуйте ещё раз.
        </p>
      )}

      <Button
        type="submit"
        disabled={!canSubmit || register.isPending}
        className="h-13 w-full disabled:cursor-not-allowed disabled:opacity-[.45]"
      >
        Создать аккаунт
      </Button>
    </form>
  );
}
