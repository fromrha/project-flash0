package com.lapang.emergency.sdk

import android.content.Intent
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.lapang.emergency.sdk/overlay"
    private var methodChannel: MethodChannel? = null
    private var pendingAlertData: String? = null

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
            // If channel is already registered, send it immediately
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
                    else -> result.notImplemented()
                }
            }
        }
        
        // If there was any pending data received during activity initialization, deliver it now
        pendingAlertData?.let {
            methodChannel?.invokeMethod("onAlertReceived", it)
        }
    }
}
