import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  ACCENT_IDS,
  BUBBLE_IDS,
  FONT_IDS,
  SCALE_IDS,
  THEME_IDS,
  useAppearanceStore,
} from "../../shared/theme/appearance-store";
import { Avatar } from "../../shared/ui/avatar";
import { Button } from "../../shared/ui/button";
import { Dots } from "../../shared/ui/dots";
import { GhostField } from "../../shared/ui/ghost-field";
import { IconButton } from "../../shared/ui/icon-button";
import { Rail } from "../../shared/ui/rail";
import { Scramble } from "../../shared/ui/scramble";
import { SegmentedTabs } from "../../shared/ui/segmented-tabs";
import { TextField } from "../../shared/ui/text-field";
import { Toggle } from "../../shared/ui/toggle";

/**
 * Component/theme showcase (DESIGN-BRIEF.md §8.3/§11 DR-19 — "витрина
 * `/dev/ui`"). Every shared UI primitive gets a swatch here as it's built,
 * so a theme/token change is checked in one place instead of clicking
 * through the whole app. Not part of the shipped `/app` bundle boundary-
 * wise, but not excluded from the build here either — that split is a
 * follow-up once there's more than a theme switcher to gate.
 */
export const Route = createFileRoute("/dev/ui")({
  component: DevUiPage,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
      <h2 className="font-mono text-xs uppercase tracking-widest text-mute">{title}</h2>
      {children}
    </section>
  );
}

function DevUiPage() {
  const theme = useAppearanceStore((state) => state.theme);
  const setTheme = useAppearanceStore((state) => state.setTheme);
  const accent = useAppearanceStore((state) => state.accent);
  const setAccent = useAppearanceStore((state) => state.setAccent);
  const font = useAppearanceStore((state) => state.font);
  const setFont = useAppearanceStore((state) => state.setFont);
  const scale = useAppearanceStore((state) => state.scale);
  const setScale = useAppearanceStore((state) => state.setScale);
  const bubble = useAppearanceStore((state) => state.bubble);
  const setBubble = useAppearanceStore((state) => state.setBubble);
  const decrypt = useAppearanceStore((state) => state.decrypt);
  const setDecrypt = useAppearanceStore((state) => state.setDecrypt);
  const customTheme = useAppearanceStore((state) => state.customTheme);
  const setCustomTheme = useAppearanceStore((state) => state.setCustomTheme);
  const customAccent = useAppearanceStore((state) => state.customAccent);
  const setCustomAccent = useAppearanceStore((state) => state.setCustomAccent);

  const [toggleOn, setToggleOn] = useState(true);
  const [scrambleKey, setScrambleKey] = useState(0);

  return (
    <main className="min-h-screen bg-bg p-8 text-fg">
      <h1 className="mb-6 font-mono text-xs uppercase tracking-widest text-mute">
        /dev/ui — витрина
      </h1>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-6">
          <Section title="Тема">
            <div className="flex flex-wrap gap-2">
              {THEME_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTheme(id);
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm"
                  aria-pressed={theme === id}
                >
                  {id}
                </button>
              ))}
            </div>
            {theme === "custom" && (
              <div className="flex flex-col gap-2 border-t border-dashed border-line pt-3">
                <label className="flex items-center justify-between gap-2 text-sm">
                  Фон
                  <input
                    type="color"
                    value={customTheme.bg}
                    onChange={(e) => {
                      setCustomTheme({ bg: e.target.value });
                    }}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm">
                  Текст
                  <input
                    type="color"
                    value={customTheme.fg}
                    onChange={(e) => {
                      setCustomTheme({ fg: e.target.value });
                    }}
                  />
                </label>
              </div>
            )}
          </Section>

          <Section title="Акцент">
            <div className="flex flex-wrap gap-2">
              {ACCENT_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setAccent(id);
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm"
                  aria-pressed={accent === id}
                >
                  {id}
                </button>
              ))}
            </div>
            {accent === "custom" && (
              <div className="flex flex-col gap-2 border-t border-dashed border-line pt-3">
                <label className="flex items-center justify-between gap-2 text-sm">
                  Цвет 1
                  <input
                    type="color"
                    value={customAccent.color1}
                    onChange={(e) => {
                      setCustomAccent({ color1: e.target.value });
                    }}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm">
                  Цвет 2
                  <input
                    type="color"
                    value={customAccent.color2}
                    onChange={(e) => {
                      setCustomAccent({ color2: e.target.value });
                    }}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm">
                  Градиент
                  <Toggle
                    checked={customAccent.gradient}
                    onChange={(gradient) => {
                      setCustomAccent({ gradient });
                    }}
                    label="Градиент"
                  />
                </label>
              </div>
            )}
          </Section>

          <Section title="Шрифт">
            <div className="flex flex-wrap gap-2">
              {FONT_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setFont(id);
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-lg"
                  aria-pressed={font === id}
                  style={{
                    fontFamily:
                      id === "mono"
                        ? "var(--font-mono)"
                        : id === "sans"
                          ? "Geologica, sans-serif"
                          : id === "pixel"
                            ? "'Pixelify Sans', sans-serif"
                            : "'PT Serif', serif",
                  }}
                >
                  Аа
                </button>
              ))}
            </div>
          </Section>

          <Section title="Размер текста">
            <SegmentedTabs
              options={SCALE_IDS.map((id) => ({ value: id, label: id }))}
              value={scale}
              onChange={setScale}
            />
          </Section>

          <Section title="Форма сообщений">
            <SegmentedTabs
              options={BUBBLE_IDS.map((id) => ({ value: id, label: id }))}
              value={bubble}
              onChange={setBubble}
            />
          </Section>

          <Section title="Анимация появления">
            <Toggle checked={decrypt} onChange={setDecrypt} label="Анимация появления" />
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Расшифровка / точки">
            <div className="flex items-center gap-4">
              <Scramble
                key={scrambleKey}
                text="Меньше шума. Больше разговора."
                className="text-lg"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  setScrambleKey((k) => k + 1);
                }}
              >
                Заново
              </Button>
              <span className="flex items-center gap-2 text-mute">
                печатает <Dots />
              </span>
            </div>
          </Section>

          <Section title="Кнопки, поле ввода">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Создать аккаунт</Button>
              <Button variant="secondary">Отмена</Button>
              <IconButton
                icon={<span aria-hidden>{"↑"}</span>}
                label="Отправить"
                variant="accent"
              />
              <IconButton icon={<span aria-hidden>{"…"}</span>} label="Меню" />
            </div>
            <TextField label="Имя пользователя" name="username" hint="Латиница, цифры и _" />
          </Section>

          <Section title="Toggle, avatar">
            <div className="flex items-center gap-6">
              <Toggle checked={toggleOn} onChange={setToggleOn} label="Уведомления" />
              <Avatar name="Алексей Громов" online ring />
              <Avatar name="Олег" />
            </div>
          </Section>

          <Section title="Rail">
            <div className="h-64">
              <Rail
                items={
                  <>
                    <span aria-hidden>○</span>
                    <span aria-hidden>◐</span>
                  </>
                }
                footer={<Avatar name="Я" size={36} />}
              />
            </div>
          </Section>

          <Section title="Пузыри сообщений">
            <div className="flex flex-col gap-2 rounded-2xl bg-bg2 p-4">
              <div className="max-w-[78%] self-start rounded-bubble border border-line bg-in px-3.5 py-2.5 text-msg">
                Встречаемся у библиотеки в семь?
              </div>
              <div className="max-w-[78%] self-end rounded-bubble [background:var(--color-accent)] px-3.5 py-2.5 text-msg text-ink shadow-glow">
                Буду вовремя
              </div>
            </div>
          </Section>

          <Section title="Ghost field">
            <div className="relative h-56 overflow-hidden rounded-2xl bg-bg2">
              <GhostField layout="center" count={800} />
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
