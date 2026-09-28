/**
 * Avatar — DESIGN-BRIEF §4/§7.2: circle, initials fallback, optional
 * accent ring (profile header) and online dot (accent fill, `bg` outline
 * so it reads against whatever's behind it). In the Terminal theme,
 * `--color-avatar`/`--color-avatar-fg` are pre-filled with the accent
 * (ThemeManifest.effects.avatarFilled, §8.3) — this component doesn't
 * special-case that theme, it just consumes the tokens.
 */
export interface AvatarProps {
  name: string;
  src?: string;
  size?: number;
  online?: boolean;
  ring?: boolean;
  className?: string;
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function Avatar({ name, src, size = 44, online, ring, className }: AvatarProps) {
  return (
    <span
      className={["relative inline-flex shrink-0", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    >
      <span
        className={[
          "flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-line bg-avatar text-avatar-fg",
          ring ? "[box-shadow:0_0_0_2px_var(--color-accent)]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ fontSize: Math.round(size * 0.32) }}
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden>{initials(name)}</span>
        )}
      </span>
      {online !== undefined && (
        <span
          role="status"
          aria-label={online ? "в сети" : "не в сети"}
          className={[
            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg",
            online ? "[background:var(--color-accent)]" : "bg-mute",
          ].join(" ")}
        />
      )}
    </span>
  );
}
