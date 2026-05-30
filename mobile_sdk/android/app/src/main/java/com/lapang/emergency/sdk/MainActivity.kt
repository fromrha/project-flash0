package com.lapang.emergency.sdk

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.lapang.emergency.sdk/overlay"
    private var methodChannel: MethodChannel? = null
    private var pendingAlertData: String? = null
    private var mediaPlayer: MediaPlayer? = null
    private var audioFocusRequest: AudioFocusRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun setLockscreenFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
        // Dismiss keyguard (screen lock) to show the alert immediately
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val km = getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
            km.requestDismissKeyguard(this, null)
        }
    }

    private fun clearLockscreenFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(false)
            setTurnScreenOn(false)
        } else {
            @Suppress("DEPRECATION")
            window.clearFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
    }

    private fun handleIntent(intent: Intent?) {
        if (intent != null && intent.hasExtra("alert_data")) {
            val data = intent.getStringExtra("alert_data")
            pendingAlertData = data
            // Clear the extra to prevent reprocessing on subsequent manual launches
            intent.removeExtra("alert_data")

            setLockscreenFlags()
            // Play the alarm sound immediately
            startSiren()

            // If channel is already configured, send it immediately
            methodChannel?.invokeMethod("onAlertReceived", data)
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).apply {
            setMethodCallHandler { call, result ->
                when (call.method) {
                    "getPendingAlert" -> {
                        result.success(pendingAlertData)
                        pendingAlertData = null // clear after reading
                    }
                    "startSiren" -> {
                        startSiren()
                        result.success(true)
                    }
                    "stopSiren" -> {
                        stopSiren()
                        result.success(true)
                    }
                    "isSirenPlaying" -> {
                        result.success(isSirenPlaying)
                    }
                    "moveTaskToBack" -> {
                        moveTaskToBack(true)
                        result.success(true)
                    }
                    "exitEmergencyMode" -> {
                        stopSiren()
                        clearLockscreenFlags()
                        moveTaskToBack(true)
                        result.success(true)
                    }
                    // --- NEW: Force lockscreen wake from Flutter side (for foreground alerts) ---
                    "setLockscreenActive" -> {
                        setLockscreenFlags()
                        result.success(true)
                    }
                    // --- NEW: Permission Check & Navigation Handlers ---
                    "checkOverlayPermission" -> {
                        val canDraw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            Settings.canDrawOverlays(this@MainActivity)
                        } else {
                            true // Pre-M, always granted
                        }
                        result.success(canDraw)
                    }
                    "openOverlaySettings" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            val intent = Intent(
                                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:$packageName")
                            )
                            startActivity(intent)
                        }
                        result.success(true)
                    }
                    "checkLockscreenPermission" -> {
                        // showWhenLocked is an activity attribute, not a user-grantable permission.
                        // We check the manifest value: if android:showWhenLocked="true" in AndroidManifest,
                        // this is always true. We return based on OS capability.
                        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1
                        result.success(supported)
                    }
                    "openNotificationSettings" -> {
                        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                            putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        }
                        startActivity(intent)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
        }

        // If there was any pending data received during activity initialization, deliver it now
        pendingAlertData?.let {
            methodChannel?.invokeMethod("onAlertReceived", it)
        }
    }

    private fun requestAudioFocus() {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(attrs)
                .setWillPauseWhenDucked(false)
                .setAcceptsDelayedFocusGain(false)
                .build()
            audioManager.requestAudioFocus(audioFocusRequest!!)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                null,
                AudioManager.STREAM_ALARM,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
            )
        }
    }

    private fun abandonAudioFocus() {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
    }

    private fun startSiren() {
        if (isSirenPlaying) return
        try {
            requestAudioFocus()
            if (mediaPlayer == null) {
                val resId = resources.getIdentifier("siren", "raw", packageName)
                mediaPlayer = MediaPlayer().apply {
                    val audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                    setAudioAttributes(audioAttributes)
                    val afd = resources.openRawResourceFd(resId)
                    setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                    afd.close()
                    isLooping = true
                    setVolume(1.0f, 1.0f) // Max volume — emergency alarm takes priority
                    prepare()
                    start()
                }
                isSirenPlaying = true
            } else if (!mediaPlayer!!.isPlaying) {
                mediaPlayer!!.start()
                isSirenPlaying = true
            }
        } catch (e: Exception) {
            // Fallback: log error silently
        }
    }

    private fun stopSiren() {
        try {
            mediaPlayer?.let {
                if (it.isPlaying) {
                    it.stop()
                }
                it.release()
            }
            mediaPlayer = null
            isSirenPlaying = false
            abandonAudioFocus()
        } catch (e: Exception) {
            // Fallback
        }
    }

    override fun onDestroy() {
        stopSiren()
        super.onDestroy()
    }

    companion object {
        var isSirenPlaying = false
    }
}
