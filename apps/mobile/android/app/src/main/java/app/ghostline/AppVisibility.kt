package app.ghostline

/**
 * Whether the app's activity is on screen. While it is, a push is already visible through the
 * page's own socket, so [app.ghostline.push.GhostlineMessagingService] stays quiet (ADR-0010).
 */
object AppVisibility {
    @Volatile
    var foreground = false
}
