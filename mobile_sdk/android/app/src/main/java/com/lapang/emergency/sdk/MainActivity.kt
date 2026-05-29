package com.lapang.emergency.sdk

import android.content.Intent
import android.media.MediaPlayer
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
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent != null && intent.hasExtra("alert_data")) {
            val data = intent.getStringExtra("alert_data")
            pendingAlertData = data
            // Clear the extra to prevent reprocessing on subsequent manual launches
            intent.removeExtra("alert_data")
            
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
                    "stopSiren" -> {
                        stopSiren()
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
        try {
            if (mediaPlayer == null) {
                val resId = resources.getIdentifier("siren", "raw", packageName)
                if (resId != 0) {
                    mediaPlayer = MediaPlayer.create(this, resId).apply {
                        isLooping = true
                        start()
                    }
                }
            } else if (!mediaPlayer!!.isPlaying) {
                mediaPlayer!!.start()
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
        } catch (e: Exception) {
            // Fallback
        }
    }

    override fun onDestroy() {
        stopSiren()
        super.onDestroy()
    }
}
