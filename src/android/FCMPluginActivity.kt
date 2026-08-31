package com.gae.scaffolder.plugin

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.os.Bundle
import android.util.Log

class FCMPluginActivity : Activity() {

    /*
     * this activity will be started if the user touches a notification that we own.
     * We send it's data off to the push plugin for processing.
     * If needed, we boot up the main activity to kickstart the application.
     * @see android.app.Activity#onCreate(android.os.Bundle)
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "onCreate")

        /*
         * Open received push notification.
         * Note: Dynamic Links are considerate as notification when app is closed
         */
        intent.extras?.let { extras ->
            val data = HashMap<String, Any?>()
            for (key in extras.keySet()) {
                data[key] = extras.getString(key)
            }
            // Tapped from notification center
            if (!data.containsKey("com.android.browser.application_id")) {
                Log.d(TAG, "User tapped notification")
                data["wasTapped"] = true
                FCMPlugin.sendPushPayload(data)
            }
        }

        finish()
        forceMainActivityReload()
    }

    private fun forceMainActivityReload() {
        val launchIntent = packageManager.getLaunchIntentForPackage(applicationContext.packageName)
        startActivity(launchIntent!!)
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "onResume")
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancelAll()
    }

    override fun onStart() {
        super.onStart()
        Log.d(TAG, "onStart")
    }

    override fun onStop() {
        super.onStop()
        Log.d(TAG, "onStop")
    }

    companion object {
        private const val TAG = "FCMPluginActivity"
    }
}
