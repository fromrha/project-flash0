package com.lapang.emergency.sdk

import android.content.Intent
import android.media.MediaPlayer
import android.media.AudioAttributes
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.lapang.emergency.sdk/overlay"
    private var methodChannel: MethodChannel? = null
    private var pendingAlertData: String? = null
    private var mediaPlayer: MediaPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
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
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
    }

    private fun clearLockscreenFlags() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(false)
            setTurnScreenOn(false)
        } else {
            @Suppress("DEPRECATION")
            window.clearFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
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
                    else -> result.notImplemented()
                }
            }
        }
        
        // If there was any pending data received during activity initialization, deliver it now
        pendingAlertData?.let {
            methodChannel?.invokeMethod("onAlertReceived", it)
        }
    }

    private fun startSiren() {
        if (isSirenPlaying) return
        try {
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
                    setVolume(0.8f, 0.8f)
                    prepare()
                    start()
                }
                isSirenPlaying = true
            } else if (!mediaPlayer!!.isPlaying) {
                mediaPlayer!!.start()
                isSirenPlaying = true
            }
        } catch (e: Exception) {
            // Fallback
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
