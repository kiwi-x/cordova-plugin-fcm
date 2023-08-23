package com.gae.scaffolder.plugin;

import android.app.NotificationManager;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ActivityCompat;

import android.util.Log;

import com.google.android.gms.tasks.OnFailureListener;
import com.google.android.gms.tasks.OnSuccessListener;
// import com.google.firebase.analytics.FirebaseAnalytics;
import com.google.firebase.dynamiclinks.FirebaseDynamicLinks;
import com.google.firebase.dynamiclinks.PendingDynamicLinkData;
import com.google.firebase.installations.FirebaseInstallations;
import com.google.firebase.messaging.FirebaseMessaging;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.apache.cordova.CordovaWebView;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.lang.reflect.Method;

import android.os.Build;
import android.os.Bundle;
import android.app.Notification;
import android.app.NotificationChannel;

// -- for new token
import com.google.android.gms.tasks.Task;
import com.google.firebase.installations.InstallationTokenResult;    

public class FCMPlugin extends CordovaPlugin {

  private static final String TAG = "FCMPlugin";

  // private FirebaseAnalytics mFirebaseAnalytics;

  private String domainUriPrefix;
  public static String notificationCallBackLink = "FCMPlugin.getDynamicLinkReceived";
  public static Map<String, Object> lastLink = null;

  public static CordovaWebView gWebView;
  public static String notificationCallBack = "FCMPlugin.onNotificationReceived";
  public static String tokenRefreshCallBack = "FCMPlugin.onTokenRefreshReceived";
  public static Boolean notificationCallBackReady = false;
  public static Map<String, Object> lastPush = null;
  private static Activity cordovaActivity = null;

  protected static final String POST_NOTIFICATIONS = "POST_NOTIFICATIONS";
  protected static final int POST_NOTIFICATIONS_PERMISSION_REQUEST_ID = 1;
  protected static FCMPlugin instance = null;
  private static CallbackContext postNotificationPermissionRequestCallbackContext;


  public FCMPlugin() {
  }

  public void initialize(CordovaInterface cordova, CordovaWebView webView) {
    final Context context = cordova.getActivity().getApplicationContext();
    super.initialize(cordova, webView);
    cordovaActivity = this.cordova.getActivity();
    instance = this;
    gWebView = webView;
    Log.d(TAG, "Initialize");
    FirebaseMessaging.getInstance().subscribeToTopic("android");
    FirebaseMessaging.getInstance().subscribeToTopic("all");

    Log.d(TAG, "Starting Analytics");
    // mFirebaseAnalytics = FirebaseAnalytics.getInstance(context);

    domainUriPrefix = preferences.getString("DYNAMIC_LINK_URIPREFIX", "");
    Log.d(TAG, "Dynamic Link Uri Prefix: " + domainUriPrefix);

    // Create the NotificationChannel, but only on API 26+ because
    // the NotificationChannel class is new and not in the support library
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

      CharSequence name = preferences.getString("FireBaseDefaultChannelName", "default");
      String description = preferences.getString("FireBaseDefaultChannelDescription", "Default");
      String channelId = preferences.getString("FireBaseDefaultChannelChannelId", "apicodo_default");
      int importance = NotificationManager.IMPORTANCE_DEFAULT;
      NotificationChannel channel = new NotificationChannel(channelId, name, importance);

      channel.setDescription(description);
      // Register the channel with the system; you can't change the importance
      // or other notification behaviors after this
      NotificationManager notificationManager = context.getSystemService(NotificationManager.class);
      notificationManager.createNotificationChannel(channel);
    }
  
    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        Log.d(TAG, "Check if there are notifications");
        Bundle extras = cordova.getActivity().getIntent().getExtras();
        if (extras != null && extras.size() > 1) {
          if (extras.containsKey("google.message_id")) {
            Log.d(TAG, "Set wasTapped true (app was closed)");
            extras.putString("wasTapped", "true");
            Map<String, Object> data = new HashMap<String, Object>();
            for (String key : extras.keySet()) {
              if (extras.get(key) instanceof String) {
                String value = extras.getString(key);
                data.put(key, value);
              }
            }
            FCMPlugin.sendPushPayload(data);
          }
        }
      }
    });
  }

  private void executeGlobalJavascript(final String jsString){
    if(cordovaActivity == null) return;
    cordovaActivity.runOnUiThread(new Runnable() {
        @Override
        public void run() {
            webView.loadUrl("javascript:" + jsString);
        }
    });
  }

  private String escapeDoubleQuotes(String string){
    String escapedString = string.replace("\"", "\\\"");
    escapedString = escapedString.replace("%22", "\\%22");
    return escapedString;
  }

  protected void logErrorToWebview(String msg){
    Log.e(TAG, msg);
    executeGlobalJavascript("console.error(\""+TAG+"[native]: "+escapeDoubleQuotes(msg)+"\")");
  }

  protected static void handleExceptionWithoutContext(Exception e){
    String msg = e.toString();
    Log.e(TAG, msg);
    if (instance != null) {
        instance.logErrorToWebview(msg);
    }
  }

  private int conformBooleanForPluginResult(boolean result){
    return result ? 1 : 0;
  }

  protected String qualifyPermission(String permission){
    if(permission.startsWith("android.permission.")){
        return permission;
    }else{
        return "android.permission."+permission;
    }
  }

  protected void sendEmptyPluginResultAndKeepCallback(CallbackContext callbackContext){
    PluginResult pluginresult = new PluginResult(PluginResult.Status.NO_RESULT);
    pluginresult.setKeepCallback(true);
    callbackContext.sendPluginResult(pluginresult);
  }


  protected boolean hasRuntimePermission(String permission) throws Exception{
    boolean hasRuntimePermission = true;
    String qualifiedPermission = qualifyPermission(permission);
    Method method = null;
    try {
        method = cordova.getClass().getMethod("hasPermission", qualifiedPermission.getClass());
        Boolean bool = (Boolean) method.invoke(cordova, qualifiedPermission);
        hasRuntimePermission = bool.booleanValue();
    } catch (NoSuchMethodException e) {
        Log.w(TAG, "Cordova v" + CordovaWebView.CORDOVA_VERSION + " does not support runtime permissions so defaulting to GRANTED for " + permission);
    }
    return hasRuntimePermission;
  }

  private void hasPermission(final CallbackContext callbackContext) {
    cordova.getThreadPool().execute(new Runnable() {
        public void run() {
            try {
                NotificationManagerCompat notificationManagerCompat = NotificationManagerCompat.from(cordovaActivity);
                boolean areNotificationsEnabled = notificationManagerCompat.areNotificationsEnabled();

                boolean hasRuntimePermission = true;
                if(Build.VERSION.SDK_INT >= 33){ // Android 13+
                    hasRuntimePermission = hasRuntimePermission(POST_NOTIFICATIONS);
                }

                callbackContext.success(conformBooleanForPluginResult(areNotificationsEnabled && hasRuntimePermission));
            } catch (Exception e) {
                Log.e(TAG, "Cannot ask for permissions.");
            }
        }
    });
  }

  protected void requestPermissions(CordovaPlugin plugin, int requestCode, String [] permissions) throws Exception{
    try {
        java.lang.reflect.Method method = cordova.getClass().getMethod("requestPermissions", org.apache.cordova.CordovaPlugin.class ,int.class, java.lang.String[].class);
        method.invoke(cordova, plugin, requestCode, permissions);
    } catch (NoSuchMethodException e) {
        throw new Exception("requestPermissions() method not found in CordovaInterface implementation of Cordova v" + CordovaWebView.CORDOVA_VERSION);
    }
}

  private void grantPermission(final CallbackContext callbackContext) {
      CordovaPlugin plugin = this;
      cordova.getThreadPool().execute(new Runnable() {
          public void run() {
              try {
                  if(Build.VERSION.SDK_INT >= 33){ // Android 13+
                      boolean hasRuntimePermission = hasRuntimePermission(POST_NOTIFICATIONS);
                      if(!hasRuntimePermission){
                          String[] permissions = new String[]{qualifyPermission(POST_NOTIFICATIONS)};
                          postNotificationPermissionRequestCallbackContext = callbackContext;
                          requestPermissions(plugin, POST_NOTIFICATIONS_PERMISSION_REQUEST_ID, permissions);
                          sendEmptyPluginResultAndKeepCallback(callbackContext);
                      }
                  }

              } catch (Exception e) {
                  Log.e(TAG, "Cannot grant permissions.");
              }
          }
      });
  }
  public boolean execute(final String action, final JSONArray args, final CallbackContext callbackContext) throws JSONException {

    Log.d(TAG, "Execute: " + action);

    try {
      // READY //
      if (action.equals("ready")) {
        callbackContext.success();
      }
      // GET TOKEN //
      else if (action.equals("getToken")) {
        cordova.getActivity().runOnUiThread(new Runnable() {
          public void run() {
            // FirebaseInstallations fbi = FirebaseInstallations.getInstance();
            FirebaseMessaging fbm = FirebaseMessaging.getInstance();
            Task<String> task = fbm.getToken();
            task.addOnSuccessListener(new OnSuccessListener<String>() {
                @Override
                public void onSuccess(String token) {
                    callbackContext.success(token);
                    Log.d(TAG, "Token: " + token);
                  }
            });
            task.addOnFailureListener(new OnFailureListener() {
                @Override
                public void onFailure(@NonNull Exception e) {
                  Log.d(TAG, "Error retrieving token");
                }
            });              
          }
        });
      }
      else if (action.equals("hasPermission")) {
        this.hasPermission(callbackContext);
      } 
      else if (action.equals("grantPermission")) {
        this.grantPermission(callbackContext);
      }
      // NOTIFICATION CALLBACK REGISTER //
      else if (action.equals("registerNotification")) {
        notificationCallBackReady = true;
        cordova.getActivity().runOnUiThread(new Runnable() {
          public void run() {
            if (lastLink != null) FCMPlugin.sendDynLink(lastLink);
            lastLink = null;
            if (lastPush != null) FCMPlugin.sendPushPayload(lastPush);
            lastPush = null;
            callbackContext.success();
          }
        });
      }
      // UN/SUBSCRIBE TOPICS //
      else if (action.equals("subscribeToTopic")) {
        cordova.getThreadPool().execute(new Runnable() {
          public void run() {
            try {
              FirebaseMessaging.getInstance().subscribeToTopic(args.getString(0));
              callbackContext.success();
            } catch (Exception e) {
              callbackContext.error(e.getMessage());
            }
          }
        });
      } else if (action.equals("unsubscribeFromTopic")) {
        cordova.getThreadPool().execute(new Runnable() {
          public void run() {
            try {
              FirebaseMessaging.getInstance().unsubscribeFromTopic(args.getString(0));
              // callbackContemFirebaseAnalyticsxt.success();
              callbackContext.success();
            } catch (Exception e) {
              callbackContext.error(e.getMessage());
            }
          }
        });
      } else if (action.equals("logEvent")) {
        cordova.getThreadPool().execute(new Runnable() {
          public void run() {
            try {
              logEvent(callbackContext, args.getString(0), args.getJSONObject(1));
              callbackContext.success();
            } catch (Exception e) {
              callbackContext.error(e.getMessage());
            }
          }
        });
      } else if (action.equals("setUserId")) {
        cordova.getThreadPool().execute(new Runnable() {
          public void run() {
            try {
              setUserId(callbackContext, args.getString(0));
              callbackContext.success();
            } catch (Exception e) {
              callbackContext.error(e.getMessage());
            }
          }
        });
      } else if (action.equals("setUserProperty")) {
        cordova.getThreadPool().execute(new Runnable() {
          public void run() {
            try {
              setUserProperty(callbackContext, args.getString(0), args.getString(1));
              callbackContext.success();
            } catch (Exception e) {
              callbackContext.error(e.getMessage());
            }
          }
        });
      } else if (action.equals("clearAllNotifications")) {
        cordova.getThreadPool().execute(new Runnable() {
          public void run() {
            try {
              clearAllNotifications(callbackContext);
              callbackContext.success();
            } catch (Exception e) {
              callbackContext.error(e.getMessage());
            }
          }
        });
      } else if (action.equals("getDynamicLink")) {
        cordova.getThreadPool().execute(new Runnable() {
          public void run() {
            try {
              getDynamicLink();
              callbackContext.success();
            } catch (Exception e) {
              callbackContext.error(e.getMessage());
            }
          }
        });
      } else {
        callbackContext.error("Error: method not found");
        return false;
      }
    } catch (Exception e) {
      Log.d(TAG, "Error: onPluginAction: " + e.getMessage());
      callbackContext.error(e.getMessage());
      return false;
    }
    return true;
  }

  public static void sendDynLink(Map<String, Object> dynlink) {
    Log.d(TAG, "sendDynLink");
    try {
      JSONObject jo = new JSONObject();
      for (String key : dynlink.keySet()) {
        jo.put(key, dynlink.get(key));
      }
      String callBack = "javascript:" + notificationCallBackLink + "(" + jo.toString() + ")";
      if (notificationCallBackReady && gWebView != null) {
        Log.d(TAG, "Dynamic Link to view: " + callBack);
        gWebView.sendJavascript(callBack);
      } else {
        Log.d(TAG, "View not ready. Dynamic Link saved: " + callBack);
        lastLink = dynlink;
      }
    } catch (Exception e) {
      Log.d(TAG, "Error: sendDynLink:Exception", e);
      lastLink = dynlink;
    }
  }

  public static void sendPushPayload(Map<String, Object> payload) {
    Log.d(TAG, "sendPushPayload");
    try {
      JSONObject jo = new JSONObject();
      for (String key : payload.keySet()) {
        jo.put(key, payload.get(key));
      }
      String callBack = "javascript:" + notificationCallBack + "(" + jo.toString() + ")";
      if (notificationCallBackReady && gWebView != null) {
        Log.d(TAG, "Sent Push Notification to view: " + callBack);
        gWebView.sendJavascript(callBack);
      } else {
        Log.d(TAG, "View not ready. Push Notification saved: " + callBack);
        lastPush = payload;
      }
    } catch (Exception e) {
      Log.d(TAG, "Error: sendPushToView. Push Notification saved: " + e.getMessage());
      lastPush = payload;
    }
  }

  public static void sendTokenRefresh(String token) {
    Log.d(TAG, "sendRefreshToken");
    try {
      String callBack = "javascript:" + tokenRefreshCallBack + "('" + token + "')";
      gWebView.sendJavascript(callBack);
    } catch (Exception e) {
      Log.d(TAG, "Error: sendRefreshToken: " + e.getMessage());
    }
  }

  public void logEvent(final CallbackContext callbackContext, final String name, final JSONObject params)
    throws JSONException {
    final Bundle bundle = new Bundle();
    Iterator iter = params.keys();
    while (iter.hasNext()) {
      String key = (String) iter.next();
      Object value = params.get(key);

      if (value instanceof Integer || value instanceof Double) {
        bundle.putFloat(key, ((Number) value).floatValue());
      } else {
        bundle.putString(key, value.toString());
      }
    }

    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        try {
          // mFirebaseAnalytics.logEvent(name, bundle);
          callbackContext.success();
        } catch (Exception e) {
          callbackContext.error(e.getMessage());
        }
      }
    });
  }

  public void setUserId(final CallbackContext callbackContext, final String id) {
    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        try {
          // mFirebaseAnalytics.setUserId(id);
          callbackContext.success();
        } catch (Exception e) {
          callbackContext.error(e.getMessage());
        }
      }
    });
  }

  public void setUserProperty(final CallbackContext callbackContext, final String name, final String value) {
    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        try {
          // mFirebaseAnalytics.setUserProperty(name, value);
          callbackContext.success();
        } catch (Exception e) {
          callbackContext.error(e.getMessage());
        }
      }
    });
  }

  public void clearAllNotifications(final CallbackContext callbackContext) {
    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        try {
          Context context = cordova.getActivity();
          NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
          nm.cancelAll();
          callbackContext.success();
        } catch (Exception e) {
          callbackContext.error(e.getMessage());
        }
      }
    });
  }

  private void getDynamicLink() {
    respondWithDynamicLink(cordova.getActivity().getIntent());
  }

  // App opened from Play Store (new installation)
  private void respondWithDynamicLink(Intent intent) {
    Log.d(TAG, "respondWithDynamicLink");
    FirebaseDynamicLinks.getInstance()
      .getDynamicLink(intent)
      .addOnSuccessListener(new OnSuccessListener<PendingDynamicLinkData>() {
        @Override
        public void onSuccess(PendingDynamicLinkData pendingDynamicLinkData) {
          Uri deepLink = null;
          if (pendingDynamicLinkData != null) {
            deepLink = pendingDynamicLinkData.getLink();
            if (deepLink != null) {
              Map<String, Object> linkData = new HashMap<String, Object>();
              linkData.put("deepLink", deepLink);
              linkData.put("clickTimestamp", pendingDynamicLinkData.getClickTimestamp());
              linkData.put("minimumAppVersion", pendingDynamicLinkData.getMinimumAppVersion());
              linkData.put("newInstall", true); // Send attribute to identify new install
              FCMPlugin.sendDynLink(linkData);
            }
          }
        }
      })
      .addOnFailureListener(new OnFailureListener() {
        @Override
        public void onFailure(@NonNull Exception e) {
          Log.d(TAG, "Error: respondWithDynamicLink:addOnFailureListener", e);
        }
      });
  }

  @Override
  public void onDestroy() {
    gWebView = null;
    notificationCallBackReady = false;
  }

  @Override
  public void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    final Bundle extras = intent.getExtras();
    Log.d(TAG, "onNewIntent (App is running in Background)");

    Map<String, Object> data = new HashMap<String, Object>();
    if (extras != null) {
      Log.d(TAG, "Set wasTapped true");
      data.put("wasTapped", true);
      for (String key : extras.keySet()) {
        if (extras.get(key) instanceof String) {
          String value = extras.getString(key);
          data.put(key, value);
        }
      }
      FCMPlugin.sendPushPayload(data);
    }
  }
}
