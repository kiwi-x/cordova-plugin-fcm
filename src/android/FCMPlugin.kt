package com.gae.scaffolder.plugin

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessaging
import org.apache.cordova.CallbackContext
import org.apache.cordova.CordovaInterface
import org.apache.cordova.CordovaPlugin
import org.apache.cordova.CordovaWebView
import org.apache.cordova.PluginResult
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

class FCMPlugin : CordovaPlugin() {

    override fun initialize(cordova: CordovaInterface, webView: CordovaWebView) {
        val context = cordova.activity.applicationContext
        super.initialize(cordova, webView)
        cordovaActivity = this.cordova.activity
        instance = this
        gWebView = webView
        Log.d(TAG, "Initialize")
        FirebaseMessaging.getInstance().subscribeToTopic("android")
        FirebaseMessaging.getInstance().subscribeToTopic("all")

        Log.d(TAG, "Starting Analytics")

        // Create the NotificationChannel, but only on API 26+ because
        // the NotificationChannel class is new and not in the support library
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = preferences.getString("FireBaseDefaultChannelName", "default")
            val description = preferences.getString("FireBaseDefaultChannelDescription", "Default")
            val channelId = preferences.getString("FireBaseDefaultChannelChannelId", "apicodo_default")
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel(channelId, name, importance)

            channel.description = description
            // Register the channel with the system; you can't change the importance
            // or other notification behaviors after this
            val notificationManager = context.getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }

        cordova.threadPool.execute {
            Log.d(TAG, "Check if there are notifications")
            val extras = cordova.activity.intent.extras
            if (extras != null && extras.size() > 1) {
                if (extras.containsKey("google.message_id")) {
                    Log.d(TAG, "Set wasTapped true (app was closed)")
                    extras.putString("wasTapped", "true")
                    val data = HashMap<String, Any?>()
                    for (key in extras.keySet()) {
                        if (extras.get(key) is String) {
                            data[key] = extras.getString(key)
                        }
                    }
                    setInitialPushPayload(data)
                    sendPushPayload(data)
                }
            }
        }
    }

    private fun executeGlobalJavascript(jsString: String) {
        val activity = cordovaActivity ?: return
        activity.runOnUiThread {
            webView.loadUrl("javascript:$jsString")
        }
    }

    private fun escapeDoubleQuotes(string: String): String {
        return string.replace("\"", "\\\"").replace("%22", "\\%22")
    }

    protected fun logErrorToWebview(msg: String) {
        Log.e(TAG, msg)
        executeGlobalJavascript("console.error(\"$TAG[native]: ${escapeDoubleQuotes(msg)}\")")
    }

    private fun conformBooleanForPluginResult(result: Boolean): Int = if (result) 1 else 0

    protected fun qualifyPermission(permission: String): String {
        return if (permission.startsWith("android.permission.")) {
            permission
        } else {
            "android.permission.$permission"
        }
    }

    protected fun sendEmptyPluginResultAndKeepCallback(callbackContext: CallbackContext) {
        val pluginResult = PluginResult(PluginResult.Status.NO_RESULT)
        pluginResult.keepCallback = true
        callbackContext.sendPluginResult(pluginResult)
    }

    @Throws(Exception::class)
    protected fun hasRuntimePermission(permission: String): Boolean {
        var granted = true
        val qualifiedPermission = qualifyPermission(permission)
        try {
            val method = cordova.javaClass.getMethod("hasPermission", String::class.java)
            granted = method.invoke(cordova, qualifiedPermission) as Boolean
        } catch (e: NoSuchMethodException) {
            Log.w(
                TAG,
                "Cordova v" + CordovaWebView.CORDOVA_VERSION +
                    " does not support runtime permissions so defaulting to GRANTED for " + permission
            )
        }
        return granted
    }

    private fun hasPermission(callbackContext: CallbackContext) {
        cordova.threadPool.execute {
            try {
                val notificationManagerCompat = NotificationManagerCompat.from(cordovaActivity!!)
                val areNotificationsEnabled = notificationManagerCompat.areNotificationsEnabled()

                var hasRuntimePerm = true
                if (Build.VERSION.SDK_INT >= 33) { // Android 13+
                    hasRuntimePerm = hasRuntimePermission(POST_NOTIFICATIONS)
                }

                callbackContext.success(conformBooleanForPluginResult(areNotificationsEnabled && hasRuntimePerm))
            } catch (e: Exception) {
                Log.e(TAG, "Cannot ask for permissions.")
            }
        }
    }

    @Throws(Exception::class)
    protected fun requestPermissions(plugin: CordovaPlugin, requestCode: Int, permissions: Array<String>) {
        try {
            val method = cordova.javaClass.getMethod(
                "requestPermissions",
                CordovaPlugin::class.java, Int::class.javaPrimitiveType, Array<String>::class.java
            )
            method.invoke(cordova, plugin, requestCode, permissions)
        } catch (e: NoSuchMethodException) {
            throw Exception(
                "requestPermissions() method not found in CordovaInterface implementation of Cordova v" +
                    CordovaWebView.CORDOVA_VERSION
            )
        }
    }

    private fun grantPermission(callbackContext: CallbackContext) {
        val plugin: CordovaPlugin = this
        cordova.threadPool.execute {
            try {
                if (Build.VERSION.SDK_INT >= 33) { // Android 13+
                    val hasRuntimePerm = hasRuntimePermission(POST_NOTIFICATIONS)
                    if (!hasRuntimePerm) {
                        val permissions = arrayOf(qualifyPermission(POST_NOTIFICATIONS))
                        postNotificationPermissionRequestCallbackContext = callbackContext
                        requestPermissions(plugin, POST_NOTIFICATIONS_PERMISSION_REQUEST_ID, permissions)
                        sendEmptyPluginResultAndKeepCallback(callbackContext)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Cannot grant permissions.")
            }
        }
    }

    @Throws(JSONException::class)
    override fun execute(action: String, args: JSONArray, callbackContext: CallbackContext): Boolean {
        Log.d(TAG, "Execute: $action")

        try {
            when (action) {
                // READY //
                "ready" -> callbackContext.success()

                // GET TOKEN //
                "getToken" -> cordova.activity.runOnUiThread {
                    val task = FirebaseMessaging.getInstance().token
                    task.addOnSuccessListener { token ->
                        callbackContext.success(token)
                        Log.d(TAG, "Token: $token")
                    }
                    task.addOnFailureListener {
                        Log.d(TAG, "Error retrieving token")
                    }
                }

                "getInitialPushPayload" -> cordova.activity.runOnUiThread {
                    try {
                        val payload = consumeInitialPushPayload()
                        if (payload == null) {
                            callbackContext.sendPluginResult(PluginResult(PluginResult.Status.OK, null as String?))
                        } else {
                            callbackContext.success(toJSONObject(payload))
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "Error retrieving initial push payload: " + e.message)
                        callbackContext.error(e.message)
                    }
                }

                "hasPermission" -> hasPermission(callbackContext)

                "grantPermission" -> grantPermission(callbackContext)

                // NOTIFICATION CALLBACK REGISTER //
                "registerNotification" -> {
                    notificationCallBackReady = true
                    cordova.activity.runOnUiThread {
                        // if (lastLink != null) FCMPlugin.sendDynLink(lastLink);
                        // lastLink = null;
                        lastPush?.let { sendPushPayload(it) }
                        lastPush = null
                        callbackContext.success()
                    }
                }

                // UN/SUBSCRIBE TOPICS //
                "subscribeToTopic" -> cordova.threadPool.execute {
                    try {
                        FirebaseMessaging.getInstance().subscribeToTopic(args.getString(0))
                        callbackContext.success()
                    } catch (e: Exception) {
                        callbackContext.error(e.message)
                    }
                }

                "unsubscribeFromTopic" -> cordova.threadPool.execute {
                    try {
                        FirebaseMessaging.getInstance().unsubscribeFromTopic(args.getString(0))
                        callbackContext.success()
                    } catch (e: Exception) {
                        callbackContext.error(e.message)
                    }
                }

                else -> {
                    callbackContext.error("Error: method not found")
                    return false
                }
            }
        } catch (e: Exception) {
            Log.d(TAG, "Error: onPluginAction: " + e.message)
            callbackContext.error(e.message)
            return false
        }
        return true
    }

    override fun onDestroy() {
        gWebView = null
        notificationCallBackReady = false
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val extras = intent.extras
        Log.d(TAG, "onNewIntent (App is running in Background)")

        if (extras != null) {
            Log.d(TAG, "Set wasTapped true")
            val data = HashMap<String, Any?>()
            data["wasTapped"] = true
            for (key in extras.keySet()) {
                if (extras.get(key) is String) {
                    data[key] = extras.getString(key)
                }
            }
            setInitialPushPayload(data)
            sendPushPayload(data)
        }
    }

    companion object {

        private const val TAG = "FCMPlugin"

        protected const val POST_NOTIFICATIONS = "POST_NOTIFICATIONS"
        protected const val POST_NOTIFICATIONS_PERMISSION_REQUEST_ID = 1

        // public static Map<String, Object> lastLink = null;
        // public static String notificationCallBackLink = "FCMPlugin.getDynamicLinkReceived";
        @JvmStatic
        var lastLink: Map<String, Any?>? = null

        @JvmStatic
        var gWebView: CordovaWebView? = null

        @JvmStatic
        var notificationCallBack = "FCMPlugin.onNotificationReceived"

        @JvmStatic
        var tokenRefreshCallBack = "FCMPlugin.onTokenRefreshReceived"

        @JvmStatic
        var notificationCallBackReady = false

        @JvmStatic
        var lastPush: Map<String, Any?>? = null

        @JvmStatic
        var initialPush: Map<String, Any?>? = null

        private var cordovaActivity: Activity? = null

        protected var instance: FCMPlugin? = null

        private var postNotificationPermissionRequestCallbackContext: CallbackContext? = null

        @Throws(JSONException::class)
        private fun toJSONObject(payload: Map<String, Any?>): JSONObject {
            val jo = JSONObject()
            for ((key, value) in payload) {
                jo.put(key, value)
            }
            return jo
        }

        @JvmStatic
        fun setInitialPushPayload(payload: Map<String, Any?>?) {
            initialPush = if (payload == null) null else HashMap(payload)
        }

        @JvmStatic
        fun consumeInitialPushPayload(): Map<String, Any?>? {
            val payload = initialPush
            initialPush = null
            if (payload != null) {
                lastPush = null
            }
            return payload
        }

        @JvmStatic
        fun handleExceptionWithoutContext(e: Exception) {
            val msg = e.toString()
            Log.e(TAG, msg)
            instance?.logErrorToWebview(msg)
        }

        @JvmStatic
        fun sendPushPayload(payload: Map<String, Any?>) {
            Log.d(TAG, "sendPushPayload")
            try {
                val jo = toJSONObject(payload)
                val callBack = "javascript:$notificationCallBack($jo)"
                val webView = gWebView
                if (notificationCallBackReady && webView != null) {
                    Log.d(TAG, "Sent Push Notification to view: $callBack")
                    webView.sendJavascript(callBack)
                } else {
                    Log.d(TAG, "View not ready. Push Notification saved: $callBack")
                    lastPush = payload
                }
            } catch (e: Exception) {
                Log.d(TAG, "Error: sendPushToView. Push Notification saved: " + e.message)
                lastPush = payload
            }
        }

        @JvmStatic
        fun sendTokenRefresh(token: String) {
            Log.d(TAG, "sendRefreshToken")
            try {
                val callBack = "javascript:$tokenRefreshCallBack('$token')"
                gWebView?.sendJavascript(callBack)
            } catch (e: Exception) {
                Log.d(TAG, "Error: sendRefreshToken: " + e.message)
            }
        }
    }
}
