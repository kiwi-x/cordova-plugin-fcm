package com.gae.scaffolder.plugin

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Created by Felipe Echanique on 08/06/2016.
 */
class MyFirebaseMessagingService : FirebaseMessagingService() {

    /**
     * Called when message is received.
     *
     * @param remoteMessage Object representing the message received from Firebase Cloud Messaging.
     */
    // [START receive_message]
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        // TODO(developer): Handle FCM messages here.
        // If the application is in the foreground handle both data and notification messages here.
        // Also if you intend on generating your own notifications as a result of a received FCM
        // message, here is where that should be initiated. See sendNotification method below.
        Log.d(TAG, "==> MyFirebaseMessagingService onMessageReceived")

        remoteMessage.notification?.let {
            Log.d(TAG, "\tNotification Title: ${it.title}")
            Log.d(TAG, "\tNotification Message: ${it.body}")
        }

        val data = HashMap<String, Any?>()
        data["wasTapped"] = false
        for ((key, value) in remoteMessage.data) {
            Log.d(TAG, "\tKey: $key Value: $value")
            data[key] = value
        }

        Log.d(TAG, "\tNotification Data: $data")
        FCMPlugin.sendPushPayload(data)
        // sendNotification(remoteMessage.notification?.title, remoteMessage.notification?.body, remoteMessage.data)
    }
    // [END receive_message]

    /**
     * Called if InstanceID token is updated. This may occur if the security of
     * the previous token had been compromised. Note that this is called when the InstanceID token
     * is initially generated so this is where you would retrieve the token.
     */
    override fun onNewToken(refreshedToken: String) {
        super.onNewToken(refreshedToken)
        Log.e("NEW_TOKEN", refreshedToken)
        Log.d(TAG, "Refreshed token: $refreshedToken")
        FCMPlugin.sendTokenRefresh(refreshedToken)
    }

    /**
     * Create and show a simple notification containing the received FCM message.
     */
    private fun sendNotification(title: String?, messageBody: String?, data: Map<String, Any?>) {
        val intent = Intent(this, FCMPluginActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
        for ((key, value) in data) {
            intent.putExtra(key, value?.toString())
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0 /* Request code */, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT
        )

        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val notificationBuilder = NotificationCompat.Builder(this)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(messageBody)
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setContentIntent(pendingIntent)

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        notificationManager.notify(0 /* ID of notification */, notificationBuilder.build())
    }

    companion object {
        private const val TAG = "FCMPlugin"
    }
}
