package app.ghostline.calls

import android.content.pm.ServiceInfo
import android.os.Build

/**
 * The foreground-service types [OngoingCallService] may start with. `phoneCall` always; `microphone` and
 * `camera` only with their runtime permission, because Android throws a `SecurityException` from
 * `startForeground` for a type whose permission is missing — and a call without the microphone is still
 * a call to hang up from the notification. Before Android 11 the two types don't exist.
 */
fun ongoingForegroundTypes(sdk: Int, micGranted: Boolean, cameraGranted: Boolean, video: Boolean): Int {
    var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
    if (sdk >= Build.VERSION_CODES.R) {
        if (micGranted) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        if (video && cameraGranted) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
    }
    return types
}

/** What the ongoing-call notification says about the phase; the timer takes over once there is an `answeredAt`. */
fun ongoingStatus(phase: CallPhase, answeredAt: Long?): String = when {
    phase == CallPhase.Reconnecting -> "Переподключение…"
    answeredAt != null -> "Идёт звонок"
    phase == CallPhase.Outgoing -> "Вызов…"
    else -> "Соединение…"
}

/** "Идёт звонок · Анна", "Вызов… · Анна". */
fun ongoingTitle(phase: CallPhase, answeredAt: Long?, peerName: String): String {
    val status = ongoingStatus(phase, answeredAt)
    return if (peerName.isBlank()) status else "$status · $peerName"
}

/** The notification timer counts from `now - base`; an `answeredAt` ahead of this phone's clock would show a negative time. */
fun chronometerBase(answeredAtMs: Long, nowMs: Long): Long = minOf(answeredAtMs, nowMs)

fun muteActionLabel(muted: Boolean): String = if (muted) "Микрофон выкл." else "Микрофон"
