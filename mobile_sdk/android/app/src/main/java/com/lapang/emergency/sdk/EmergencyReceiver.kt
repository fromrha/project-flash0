package com.lapang.emergency.sdk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import org.json.JSONObject

class EmergencyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val extras = intent.extras ?: return
        val data = JSONObject()
        var hasVictim = false
        
        for (key in extras.keySet()) {
            val value = extras.get(key)
            if (value != null) {
                data.put(key, value.toString())
                if (key == "victim_name") {
                    hasVictim = true
                }
            }
        }
        
        if (hasVictim) {
            try {
                val launchIntent = Intent(context, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    addFlags(Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
                    putExtra("alert_data", data.toString())
                }
                context.startActivity(launchIntent)
            } catch (e: Exception) {
                // Background launch fallback
            }
        }
    }
}
