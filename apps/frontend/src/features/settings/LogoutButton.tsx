import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { usePushSubscription } from "../../entities/notification";
import { useLogout } from "../../entities/session";

/**
 * "Выйти из аккаунта" (T-069). Drops this device's push subscription first —
 * the DELETE needs the still-valid session, and a shared device shouldn't
 * keep getting this account's notifications after sign-out.
 */
export function LogoutButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const { status: pushStatus, unsubscribe } = usePushSubscription();
  const [pending, setPending] = useState(false);

  const handleClick = async (): Promise<void> => {
    if (!window.confirm("Выйти из аккаунта на этом устройстве?")) return;
    setPending(true);
    if (pushStatus === "subscribed" || pushStatus === "pending") {
      await unsubscribe().catch((error: unknown) => {
        console.error("push unsubscribe on logout failed", error);
      });
    }
    logout.mutate(undefined, {
      onSettled: () => void navigate({ to: "/login" }),
    });
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={pending}
      className={[
        "h-10.5 rounded-xl px-3 text-left text-[14.5px] text-danger hover:bg-bg2 disabled:opacity-[.45]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      Выйти из аккаунта
    </button>
  );
}
