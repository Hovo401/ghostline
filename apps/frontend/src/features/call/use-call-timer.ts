import { useEffect, useState } from "react";

/**
 * Milliseconds elapsed since `answeredAt`, ticking every second while the
 * call is active — `CallScreen`'s header passes this through
 * `entities/message`'s `formatDuration` ("5:23") instead of a second mm:ss
 * formatter (that one already renders every voice/video bubble's duration).
 */
export function useElapsedMs(answeredAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!answeredAt) return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [answeredAt]);

  if (!answeredAt) return 0;
  return Math.max(0, now - new Date(answeredAt).getTime());
}
