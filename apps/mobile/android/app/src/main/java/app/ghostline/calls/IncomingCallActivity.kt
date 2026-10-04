package app.ghostline.calls

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color as AndroidColor
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import app.ghostline.R
import app.ghostline.push.PushNotifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The full-screen ringing screen over the lock screen. It takes everything it shows from its
 * intent (the process may be cold) and closes itself as soon as [IncomingCallState] stops naming
 * its call — answered, declined, timed out or closed elsewhere.
 */
class IncomingCallActivity : ComponentActivity() {
    private lateinit var call: IncomingCall

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val incoming = IncomingCall.from(intent)
        if (incoming == null) {
            finish()
            return
        }
        call = incoming
        showOverLockScreen()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
        )
        // The notification's "Ответить" lands here (see IncomingCallService); nothing to draw.
        if (intent.action == ACTION_ANSWER) {
            answer()
            return
        }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.CREATED) {
                IncomingCallState.call.collect { if (it?.callId != call.callId) finish() }
            }
        }
        setContent {
            CallScreen(
                call = call,
                onDecline = ::decline,
                onAnswer = ::answer,
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // The heads-up "Ответить" tapped while this screen is already up.
        if (intent.action == ACTION_ANSWER) answer()
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun decline() {
        sendBroadcast(CallActionReceiver.intent(this, CallActionReceiver.ACTION_DECLINE, call))
        finish()
    }

    // Straight from this (visible) activity: a receiver would not be allowed to open the chat.
    private fun answer() {
        IncomingCallService.stopFor(this, call.callId)
        // TODO(T-086): accept the call
        startActivity(PushNotifier.openChatIntent(this, call.chatId).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }

    companion object {
        const val ACTION_ANSWER = "app.ghostline.action.ANSWER_FROM_NOTIFICATION"
    }
}

private val AVATAR_SIZE = 148.dp
private val BUTTON_SIZE = 76.dp
private val SWIPE_ANSWER_DISTANCE = 96.dp
private const val HANDSET_START_DEG = 200f
private const val HANDSET_SWEEP_DEG = 140f
private const val HANGUP_ROTATION = 0f
private const val PICKUP_ROTATION = 135f
private const val RING_PERIOD_MS = 2_400
private const val RING_COUNT = 3
private const val ENTER_MS = 450
private const val AVATAR_MAX_PX = 1024
private const val AVATAR_TIMEOUT_MS = 5_000
private const val AVATAR_MAX_BYTES = 5L * 1024 * 1024

@Composable
private fun CallScreen(call: IncomingCall, onDecline: () -> Unit, onAnswer: () -> Unit) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    val avatar by produceAvatar(call.callerAvatarUrl)

    Box(Modifier.fillMaxSize()) {
        Background(avatar)
        AnimatedVisibility(
            visible = shown,
            enter = fadeIn(tween(ENTER_MS)) + slideInVertically(tween(ENTER_MS)) { it / 10 },
        ) {
            Column(
                Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.weight(1f))
                CallerAvatar(call.callerName, avatar)
                Spacer(Modifier.height(40.dp))
                Text(
                    text = if (call.isTest) "Тестовый звонок" else call.callerName,
                    color = colorResource(R.color.call_text),
                    fontSize = 32.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = IncomingCallService.callSubtitle(call.video),
                    color = colorResource(R.color.call_text_dim),
                    fontSize = 16.sp,
                )
                Spacer(Modifier.weight(1.4f))
                Row(Modifier.fillMaxWidth().padding(bottom = 48.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                    DeclineButton(onDecline)
                    AnswerButton(onAnswer)
                }
            }
        }
    }
}

/** The caller's photo, once downloaded (`null` while loading, with no URL, or on any error). */
@Composable
private fun produceAvatar(url: String?) = produceState<Bitmap?>(null, url) {
    value = if (url == null) null else withContext(Dispatchers.IO) { downloadAvatar(url) }
}

private fun downloadAvatar(url: String): Bitmap? {
    var connection: HttpURLConnection? = null
    return try {
        val parsed = URL(url)
        if (parsed.protocol != "https") return null
        connection = parsed.openConnection() as HttpURLConnection
        connection.connectTimeout = AVATAR_TIMEOUT_MS
        connection.readTimeout = AVATAR_TIMEOUT_MS
        if (connection.contentLengthLong > AVATAR_MAX_BYTES) return null
        val bytes = connection.inputStream.use { readAtMost(it, AVATAR_MAX_BYTES) } ?: return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= AVATAR_MAX_PX || bounds.outHeight / (sample * 2) >= AVATAR_MAX_PX) sample *= 2
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    } catch (_: Exception) {
        null
    } finally {
        connection?.disconnect()
    }
}

/** The whole stream, or `null` if it is longer than [limit] bytes (a missing or lying Content-Length). */
private fun readAtMost(stream: InputStream, limit: Long): ByteArray? {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(8 * 1024)
    var total = 0L
    while (true) {
        val n = stream.read(buffer)
        if (n < 0) return out.toByteArray()
        total += n
        if (total > limit) return null
        out.write(buffer, 0, n)
    }
}

@Composable
private fun Background(avatar: Bitmap?) {
    Box(Modifier.fillMaxSize()) {
        if (avatar != null) {
            // Blur works on Android 12+ (RenderEffect); older versions fall back to the scrim alone.
            val blur = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Modifier.blur(32.dp) else Modifier
            Image(
                bitmap = avatar.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().then(blur),
            )
            Box(Modifier.fillMaxSize().background(colorResource(R.color.call_scrim)))
        } else {
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(listOf(colorResource(R.color.call_bg_top), colorResource(R.color.call_bg_bottom))),
                ),
            )
        }
    }
}

@Composable
private fun CallerAvatar(name: String, avatar: Bitmap?) {
    val transition = rememberInfiniteTransition(label = "rings")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(RING_PERIOD_MS, easing = LinearEasing), RepeatMode.Restart),
        label = "ring",
    )
    val ringColor = colorResource(R.color.call_ring)
    Box(Modifier.size(AVATAR_SIZE * 2), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val inner = AVATAR_SIZE.toPx() / 2
            val reach = size.minDimension / 2 - inner
            repeat(RING_COUNT) { i ->
                val phase = (progress + i.toFloat() / RING_COUNT) % 1f
                drawCircle(
                    color = ringColor.copy(alpha = ringColor.alpha * (1f - phase)),
                    radius = inner + reach * phase,
                    style = Stroke(width = 3.dp.toPx()),
                )
            }
        }
        Box(
            Modifier.size(AVATAR_SIZE).clip(CircleShape).background(colorResource(R.color.call_avatar_bg)),
            contentAlignment = Alignment.Center,
        ) {
            if (avatar != null) {
                Image(avatar.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            } else {
                Text(initialsOf(name), color = colorResource(R.color.call_text), fontSize = 52.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun DeclineButton(onDecline: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    CallButton(
        label = "Отклонить",
        background = colorResource(R.color.call_decline),
        ink = colorResource(R.color.call_decline_ink),
        handsetRotation = HANGUP_ROTATION,
        modifier = Modifier.clickable {
            haptics.performHapticFeedback(HapticFeedbackType.Reject)
            onDecline()
        },
    )
}

@Composable
private fun AnswerButton(onAnswer: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    val threshold = with(LocalDensity.current) { SWIPE_ANSWER_DISTANCE.toPx() }
    var drag by remember { mutableFloatStateOf(0f) }
    val gesture = Modifier
        .offset { IntOffset(0, drag.roundToInt()) }
        .pointerInput(threshold) {
            var answered = false
            detectVerticalDragGestures(
                onDragStart = { answered = false },
                onDragEnd = { drag = 0f },
                onDragCancel = { drag = 0f },
            ) { _, delta ->
                drag = (drag + delta).coerceIn(-threshold, 0f)
                if (!answered && drag <= -threshold) {
                    answered = true
                    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                    onAnswer()
                }
            }
        }
        .clickable {
            haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            onAnswer()
        }
    CallButton(
        label = "Ответить",
        background = colorResource(R.color.call_accept),
        ink = colorResource(R.color.call_accept_ink),
        handsetRotation = PICKUP_ROTATION,
        modifier = gesture,
    )
}

@Composable
private fun CallButton(label: String, background: Color, ink: Color, handsetRotation: Float, modifier: Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(modifier.size(BUTTON_SIZE).clip(CircleShape).background(background), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(BUTTON_SIZE / 2)) { drawHandset(ink, handsetRotation) }
        }
        Spacer(Modifier.height(12.dp))
        Text(label, color = colorResource(R.color.call_text_dim), fontSize = 14.sp)
    }
}

/** A handset: a thick arc with a blunt tip at each end, turned by [rotation] degrees. */
private fun DrawScope.drawHandset(color: Color, rotation: Float) {
    val w = size.width
    val stroke = w * 0.2f
    val arcSize = w * 0.8f
    val topLeft = Offset(w * 0.1f, w * 0.3f)
    rotate(rotation) {
        drawArc(
            color = color,
            startAngle = HANDSET_START_DEG,
            sweepAngle = HANDSET_SWEEP_DEG,
            useCenter = false,
            topLeft = topLeft,
            size = Size(arcSize, arcSize),
            style = Stroke(width = stroke, cap = StrokeCap.Round),
        )
        for (angle in listOf(HANDSET_START_DEG, HANDSET_START_DEG + HANDSET_SWEEP_DEG)) {
            val rad = Math.toRadians(angle.toDouble())
            val tip = Offset(
                topLeft.x + arcSize / 2 + (arcSize / 2 * cos(rad)).toFloat(),
                topLeft.y + arcSize / 2 + (arcSize / 2 * sin(rad)).toFloat(),
            )
            drawLine(color, tip, tip + Offset(0f, w * 0.18f), strokeWidth = stroke * 1.3f, cap = StrokeCap.Round)
        }
    }
}
