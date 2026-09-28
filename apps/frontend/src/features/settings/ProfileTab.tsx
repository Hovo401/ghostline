import { useEffect, useState, type ChangeEvent } from "react";

import { useUploadAttachment } from "../../entities/attachment";
import {
  sanitizeUsername,
  useMe,
  useUpdateMe,
  useUsernameAvailability,
  usernameHint,
} from "../../entities/session";
import { Avatar } from "../../shared/ui/avatar";
import { Button } from "../../shared/ui/button";
import { TextField } from "../../shared/ui/text-field";
import { Toggle } from "../../shared/ui/toggle";

import {
  diffProfileDraft,
  draftFromMe,
  isProfileDraftDirty,
  type ProfileDraft,
} from "./profile-draft";

const BIO_MAX_LENGTH = 140;
const USERNAME_CHECK_DEBOUNCE_MS = 400;
// "✓ Сохранено" fades in and back out — DESIGN-BRIEF §7.3.
const SAVED_CONFIRMATION_MS = 2000;

/** "Профиль" tab (DESIGN-BRIEF §7.3, FR-USER-01/03/04/07/08). */
export function ProfileTab() {
  const { data: me, isLoading } = useMe();
  const updateMe = useUpdateMe();
  const uploadAttachment = useUploadAttachment();

  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => {
      setJustSaved(false);
    }, SAVED_CONFIRMATION_MS);
    return () => {
      clearTimeout(id);
    };
  }, [justSaved]);

  const current = draft ?? (me ? draftFromMe(me) : null);

  const [debouncedUsername, setDebouncedUsername] = useState(current?.username ?? "");
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedUsername(current?.username ?? "");
    }, USERNAME_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [current?.username]);

  const usernameChanged = current !== null && me !== undefined && current.username !== me.username;
  const availability = useUsernameAvailability(usernameChanged ? debouncedUsername : "");
  const checkingUsername =
    usernameChanged && (current.username !== debouncedUsername || availability.isFetching);
  const usernameFieldHint =
    current && !usernameChanged
      ? { text: `ghostline.app/@${current.username}`, tone: "mute" as const }
      : usernameHint(current?.username ?? "", {
          checking: checkingUsername,
          available: availability.data?.available,
        });

  if (isLoading || !me || !current) {
    return <p className="p-14 font-mono text-xs text-mute">Загрузка…</p>;
  }

  const update = (patch: Partial<ProfileDraft>): void => {
    setDraft({ ...current, ...patch });
  };

  const dirty = isProfileDraftDirty(current, me);
  const canSave = dirty && !checkingUsername && usernameFieldHint.tone !== "danger";
  const avatarSrc = current.avatarPreviewUrl ?? me.avatarUrl ?? undefined;
  const displayName = current.displayName.trim() || "Без имени";

  const handleAvatarPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    uploadAttachment.mutate(
      { file, fileName: file.name, kind: "avatar" },
      {
        onSuccess: (attachment) => {
          update({ avatarAttachmentId: attachment.id, avatarPreviewUrl: attachment.url });
        },
      },
    );
  };

  return (
    <div className="flex max-w-180 flex-col gap-8 px-14 pt-8 pb-16">
      <h1 className="m-0 text-[32px] font-medium tracking-tight">Профиль</h1>

      <div className="flex flex-wrap items-center gap-5.5">
        <Avatar name={displayName} src={avatarSrc} size={104} ring />
        <div className="flex flex-none flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <label className="relative flex h-10 cursor-pointer items-center rounded-xl border border-line px-4 text-sm">
              {uploadAttachment.isPending ? "Загрузка…" : "Загрузить фото"}
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarPick}
                disabled={uploadAttachment.isPending}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            {current.avatarAttachmentId && (
              <button
                type="button"
                onClick={() => {
                  update({ avatarAttachmentId: null, avatarPreviewUrl: null });
                }}
                className="h-10 rounded-xl px-3.5 text-sm text-mute"
              >
                Удалить
              </button>
            )}
          </div>
          <span className="text-xs whitespace-nowrap text-mute">
            {uploadAttachment.isError ? (
              <span className="text-danger">Не удалось загрузить фото</span>
            ) : (
              "JPG или PNG, от 400 px"
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2">
        <TextField
          label="Имя"
          name="displayName"
          placeholder="Как вас называть"
          value={current.displayName}
          onChange={(e) => {
            update({ displayName: e.target.value.slice(0, 40) });
          }}
        />
        <TextField
          label="Имя пользователя"
          name="username"
          className="font-mono"
          value={current.username}
          onChange={(e) => {
            update({ username: sanitizeUsername(e.target.value) });
          }}
          hint={usernameFieldHint.text}
          hintTone={usernameFieldHint.tone}
        />
      </div>

      <label className="flex flex-col gap-2 text-xs text-mute">
        <span className="flex justify-between">
          О себе
          <span className="font-mono text-xs">
            {current.bio.length} / {BIO_MAX_LENGTH}
          </span>
        </span>
        <textarea
          value={current.bio}
          onChange={(e) => {
            update({ bio: e.target.value.slice(0, BIO_MAX_LENGTH) });
          }}
          rows={3}
          placeholder="Пара слов о вас"
          className="resize-y rounded-xl border border-line bg-panel px-3.5 py-3 text-[15px] text-fg outline-none focus-visible:border-accent-text"
        />
      </label>

      <div className="flex flex-col gap-3">
        <div className="text-base font-medium">Кто что видит</div>
        <div className="flex flex-col overflow-hidden rounded-[14px] border border-line">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px]">Статус «в сети»</span>
              <span className="text-xs text-mute">Собеседники видят, когда вы онлайн</span>
            </span>
            <Toggle
              checked={current.showOnline}
              onChange={(v) => {
                update({ showOnline: v });
              }}
              label="Статус «в сети»"
            />
          </div>
          <div className="h-px bg-line" />
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px]">Отчёты о прочтении</span>
              <span className="text-xs text-mute">
                Отключите — и вы тоже не увидите «прочитано»
              </span>
            </span>
            <Toggle
              checked={current.readReceipts}
              onChange={(v) => {
                update({ readReceipts: v });
              }}
              label="Отчёты о прочтении"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="font-mono text-[11px] tracking-widest text-mute uppercase">
          Так вас видят другие
        </div>
        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-bg2 p-4">
          <Avatar name={displayName} src={avatarSrc} size={52} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-base font-medium">{displayName}</span>
            <span className="font-mono text-xs text-accent-text">
              @{current.username} · {current.showOnline ? "в сети" : "был недавно"}
            </span>
            {current.bio.trim() && (
              <span className="truncate text-[13.5px] text-mute">{current.bio}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => {
            if (!canSave) return;
            updateMe.mutate(diffProfileDraft(current, me), {
              onSuccess: () => {
                setDraft(null);
                setJustSaved(true);
              },
            });
          }}
          disabled={!canSave || updateMe.isPending}
          className="disabled:cursor-not-allowed disabled:opacity-[.45]"
        >
          Сохранить
        </Button>
        {justSaved && <span className="font-mono text-xs text-accent-text">✓ Сохранено</span>}
        {updateMe.isError && (
          <span className="font-mono text-xs text-danger">Не удалось сохранить</span>
        )}
      </div>
    </div>
  );
}
