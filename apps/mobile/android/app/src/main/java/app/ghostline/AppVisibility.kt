package app.ghostline

/**
 * Whether the app's activity is on screen. While it is, a push is already visible through the
 * page's own socket, so [app.ghostline.push.GhostlineMessagingService] stays quiet (ADR-0010) — except
 * for a ringing call, which is always native and only changes how loud it is (T-094).
 */
object AppVisibility {
    /** Told after every change, on the thread that changed it; the ringing call's service sets it (T-094). */
    @Volatile
    var onChanged: (() -> Unit)? = null

    @Volatile
    var foreground = false
        set(value) {
            if (field == value) return
            field = value
            onChanged?.invoke()
        }
}
