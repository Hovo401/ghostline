import { Link } from "@tanstack/react-router";
import { useState } from "react";

import {
  ANDROID_APK_URL,
  ANDROID_INSTALL_HINT,
  IOS_INSTALL_HINT,
  usePwaInstall,
} from "../../shared/lib/pwa-install";
import { GhostField } from "../../shared/ui/ghost-field";
import { Scramble } from "../../shared/ui/scramble";

// Landing page — DESIGN-BRIEF §6. Hero variant A (center layout, "cloud" ghost-field)
// is the only one wired up; B/C were prototype-only comparison tabs, not part of the
// shipped product (BACKLOG.md F6).
const STAGES = [
  {
    label: "01 / ВХОД",
    title: "Одно имя вместо номера",
    text: "Регистрация по имени пользователя. Номер телефона и список контактов не нужны.",
    justify: "justify-start",
  },
  {
    label: "02 / СВЯЗЬ",
    title: "Два человека — один разговор",
    text: "Сообщения приходят мгновенно, а статусы видны сразу: отправлено, доставлено, прочитано.",
    justify: "justify-end",
  },
  {
    label: "03 / ТИШИНА",
    title: "Никакого лишнего шума",
    text: "Без рекламы, ленты и рекомендаций. Только ваши чаты.",
    justify: "justify-start",
  },
] as const;

const FACTS = [
  {
    n: "01",
    title: "Работает в браузере",
    text: "Без установки: откройте ссылку на компьютере или телефоне.",
  },
  {
    n: "02",
    title: "Исчезающие сообщения",
    text: "Таймер от 30 секунд до недели — отдельно для каждого чата.",
  },
  {
    n: "03",
    title: "Без номера телефона",
    text: "Регистрация по имени пользователя. Контакты не загружаются.",
  },
] as const;

function scrollToNextStage() {
  window.scrollTo({ top: window.innerHeight, behavior: "smooth" });
}

/** Nav "Установить" — only where the app can be installed and isn't yet
 * (`usePwaInstall`). iOS Safari has no install API, so there it reveals the
 * manual steps under the button instead; Android gets the APK. */
function InstallAppButton() {
  const { mode, install } = usePwaInstall();
  const [showHint, setShowHint] = useState(false);
  if (mode === null) return null;

  return (
    <div className="relative">
      {mode === "android-apk" ? (
        <a
          href={ANDROID_APK_URL}
          download
          onClick={() => {
            setShowHint(true);
          }}
          className="flex h-10 cursor-pointer items-center rounded-xl border border-line bg-bg px-4.5 text-sm"
        >
          Скачать для Android
        </a>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (mode === "prompt") void install();
            else setShowHint((shown) => !shown);
          }}
          className="flex h-10 cursor-pointer items-center rounded-xl border border-line bg-bg px-4.5 text-sm"
        >
          Установить
        </button>
      )}
      {showHint && (
        <p className="absolute top-12 right-0 w-56 rounded-xl border border-line bg-panel p-3 text-xs text-mute">
          {mode === "android-apk" ? ANDROID_INSTALL_HINT : IOS_INSTALL_HINT}
        </p>
      )}
    </div>
  );
}

export function Landing() {
  return (
    <div className="text-fg">
      <div data-morph-track className="relative">
        <div className="sticky top-0 z-0 h-screen overflow-hidden">
          <GhostField layout="center" count={2600} className="absolute inset-0" />
        </div>

        <div className="relative z-10 -mt-[100vh] pointer-events-none">
          <section className="relative flex min-h-screen flex-col">
            <div
              aria-hidden
              className="absolute inset-0 opacity-[.92] [background:radial-gradient(ellipse_60%_55%_at_50%_55%,var(--color-bg)_35%,transparent_100%)]"
            />

            <nav className="relative flex items-center gap-7 px-6 py-5.5 pointer-events-auto lg:px-14">
              <div className="flex items-center gap-1.5 text-xl font-semibold tracking-tight">
                ghostline
                <span
                  aria-hidden
                  className="block h-4.75 w-2.25 [background:var(--color-accent)]"
                />
              </div>
              <div className="flex-1" />
              <div className="hidden gap-7 text-sm text-mute lg:flex">
                <button type="button" onClick={scrollToNextStage} className="cursor-pointer">
                  Как это работает
                </button>
                <span>Возможности</span>
                <span>Помощь</span>
              </div>
              <InstallAppButton />
              <Link
                to="/login"
                search={{ tab: "login" }}
                className="flex h-10 items-center rounded-xl border border-line bg-bg px-4.5 text-sm"
              >
                Войти
              </Link>
            </nav>

            <div className="relative flex flex-1 flex-col items-center justify-center gap-5.5 px-6 pt-2 pb-10 text-center [text-shadow:0_0_28px_var(--color-bg),0_0_8px_var(--color-bg)] lg:px-14">
              <div className="font-mono text-xs tracking-[.14em] text-mute">
                ВЕБ-МЕССЕНДЖЕР · БЕЗ НОМЕРА ТЕЛЕФОНА
              </div>
              <h1 className="m-0 max-w-[11ch] text-[clamp(40px,min(6.6vw,10vh),108px)] leading-[.98] font-medium tracking-[-0.04em]">
                <Scramble text="Меньше шума. Больше разговора." />
              </h1>
              <p className="m-0 max-w-137 text-lg leading-[1.5] text-mute">
                Ghostline работает прямо в браузере: без установки, номера телефона, ленты и
                рекламы. Только люди, с которыми вы общаетесь.
              </p>
              <div className="flex flex-wrap justify-center gap-2.5 pointer-events-auto [text-shadow:none]">
                <Link
                  to="/login"
                  search={{ tab: "register" }}
                  className="flex h-13 items-center rounded-xl px-6 text-base font-semibold whitespace-nowrap text-ink [background:var(--color-accent)]"
                >
                  Создать аккаунт
                </Link>
                <button
                  type="button"
                  onClick={scrollToNextStage}
                  className="h-13 cursor-pointer rounded-xl border border-line bg-bg px-5.5 text-base whitespace-nowrap"
                >
                  Как это работает
                </button>
              </div>
            </div>

            <div className="relative flex justify-center px-6 pb-6 text-center font-mono text-[11px] tracking-[.12em] text-mute lg:px-14">
              <span className="hidden lg:inline">НАВЕДИТЕ КУРСОР НА ШУМ</span>
              <span className="lg:hidden">КОСНИТЕСЬ ЭКРАНА</span>
            </div>
          </section>

          {STAGES.map((stage) => (
            <section
              key={stage.label}
              className={`flex h-screen items-end px-6 lg:px-14 ${stage.justify}`}
            >
              <div className="-m-6 flex max-w-110 flex-col gap-4 rounded-2xl p-6 backdrop-blur-[6px] [background:color-mix(in_oklab,var(--color-bg)_82%,transparent)]">
                <div className="font-mono text-xs tracking-[.14em] text-accent-text">
                  {stage.label}
                </div>
                <h2 className="m-0 text-[30px] leading-[1.05] font-medium tracking-[-0.03em] lg:text-[44px]">
                  {stage.title}
                </h2>
                <p className="m-0 text-[17px] leading-[1.55] text-mute">{stage.text}</p>
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className="relative z-20 border-t border-line bg-bg px-6 py-18 lg:px-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          {FACTS.map((fact) => (
            <div key={fact.n} className="flex flex-col gap-3 border-t border-line pt-5">
              <div className="font-mono text-xs text-mute">{fact.n}</div>
              <div className="text-[22px] font-medium tracking-[-0.02em]">{fact.title}</div>
              <div className="text-[15px] leading-[1.55] text-mute">{fact.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-20 flex flex-col gap-16 bg-bg px-6 pt-12 pb-10 lg:px-14">
        <div className="flex flex-wrap items-end justify-between gap-7">
          <h2 className="m-0 text-[clamp(36px,min(6vw,9vh),97px)] leading-[.95] font-medium tracking-[-0.045em]">
            Попробуйте тишину.
          </h2>
          <Link
            to="/login"
            search={{ tab: "register" }}
            className="flex h-14 items-center rounded-xl px-7 text-[17px] font-semibold text-ink [background:var(--color-accent)]"
          >
            Открыть Ghostline
          </Link>
        </div>
        <div className="flex flex-wrap justify-between gap-5 border-t border-line pt-5.5 text-sm text-mute">
          <span>© 2026 Ghostline</span>
          <div className="flex flex-wrap gap-5">
            <a href="#">Помощь</a>
            <a href="#">Условия</a>
            <a href="#">Конфиденциальность</a>
          </div>
        </div>
      </section>
    </div>
  );
}
