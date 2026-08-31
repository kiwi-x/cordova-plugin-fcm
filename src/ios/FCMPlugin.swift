//###########################################
//  FCMPlugin.swift
//###########################################

#if canImport(Cordova)
import Cordova
#endif
import FirebaseCore
import FirebaseMessaging
import UIKit
import UserNotifications

/// Posted by the app's own AppDelegate to forward
/// `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`, since a Cordova
/// plugin does not own AppDelegate and can no longer swizzle it safely. See the plugin's
/// README for the AppDelegate.swift snippet that must post this notification.
public let FCMPluginDidReceiveRemoteNotification = Notification.Name("FCMPluginDidReceiveRemoteNotification")

@objc(FCMPlugin)
class FCMPlugin: CDVPlugin, MessagingDelegate, UNUserNotificationCenterDelegate {

    private static let notificationCallback = "FCMPlugin.onNotificationReceived"
    private static let tokenRefreshCallback = "FCMPlugin.onTokenRefreshReceived"

    private static var lastPush: [AnyHashable: Any]?
    private static var initialPushPayload: [AnyHashable: Any]?

    override func pluginInitialize() {
        super.pluginInitialize()

        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }

        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self

        let authOptions: UNAuthorizationOptions = [.alert, .sound, .badge]
        UNUserNotificationCenter.current().requestAuthorization(options: authOptions) { _, _ in }
        UIApplication.shared.registerForRemoteNotifications()

        NotificationCenter.default.addObserver(
            self, selector: #selector(appEnterForeground),
            name: UIApplication.didBecomeActiveNotification, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(appEnterBackground),
            name: UIApplication.didEnterBackgroundNotification, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleBackgroundRemoteNotification(_:)),
            name: FCMPluginDidReceiveRemoteNotification, object: nil
        )
    }

    // MARK: - JS actions

    @objc func ready(_ command: CDVInvokedUrlCommand) {
        NSLog("FCM -> Cordova view ready")
        commandDelegate.run(inBackground: {
            let pluginResult = CDVPluginResult(status: .ok)
            self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
        })
    }

    // GET TOKEN //
    @objc func getToken(_ command: CDVInvokedUrlCommand) {
        NSLog("FCM -> Get Token")
        commandDelegate.run(inBackground: {
            Messaging.messaging().token { token, error in
                guard let token = token else {
                    NSLog("FCM -> Error retrieving token")
                    return
                }
                let pluginResult = CDVPluginResult(status: .ok, messageAs: token)
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            }
        })
    }

    @objc func getInitialPushPayload(_ command: CDVInvokedUrlCommand) {
        NSLog("FCM -> Get Initial Push Payload")
        commandDelegate.run(inBackground: {
            let pluginResult: CDVPluginResult
            if let payload = FCMPlugin.consumeInitialPushPayload() as? [String: Any] {
                NSLog("FCM -> Initial Push Payload \(payload)")
                pluginResult = CDVPluginResult(status: .ok, messageAs: payload)
            } else {
                pluginResult = CDVPluginResult(status: .ok, messageAs: nil as String?)
            }
            self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
        })
    }

    // UN/SUBSCRIBE TOPIC //
    @objc func subscribeToTopic(_ command: CDVInvokedUrlCommand) {
        let topic = command.arguments[0] as? String
        NSLog("FCM -> subscribe To Topic \(topic ?? "")")
        commandDelegate.run(inBackground: {
            if let topic = topic {
                Messaging.messaging().subscribe(toTopic: topic)
            }
            let pluginResult = CDVPluginResult(status: .ok, messageAs: topic)
            self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
        })
    }

    @objc func unsubscribeFromTopic(_ command: CDVInvokedUrlCommand) {
        let topic = command.arguments[0] as? String
        NSLog("FCM -> unsubscribe From Topic \(topic ?? "")")
        commandDelegate.run(inBackground: {
            if let topic = topic {
                Messaging.messaging().unsubscribe(fromTopic: topic)
            }
            let pluginResult = CDVPluginResult(status: .ok, messageAs: topic)
            self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
        })
    }

    @objc func registerNotification(_ command: CDVInvokedUrlCommand) {
        NSLog("FCM -> view registered for notifications")

        if let lastPush = FCMPlugin.getLastPush() {
            notifyOfMessage(lastPush)
        }

        let pluginResult = CDVPluginResult(status: .ok)
        commandDelegate.send(pluginResult, callbackId: command.callbackId)
    }

    // MARK: - Notify JS

    private func notifyOfMessage(_ payload: [AnyHashable: Any]) {
        guard
            let jsonData = try? JSONSerialization.data(withJSONObject: payload),
            let jsonString = String(data: jsonData, encoding: .utf8)
        else {
            NSLog("FCM -> Unable to serialize push payload: \(payload)")
            return
        }

        let notifyJS = "\(FCMPlugin.notificationCallback)(\(jsonString));"
        NSLog("FCM -> evaluateJavaScript \(notifyJS)")
        webViewEngine.evaluateJavaScript(notifyJS, completionHandler: nil)
    }

    private func notifyOfTokenRefresh(_ token: String) {
        let notifyJS = "\(FCMPlugin.tokenRefreshCallback)('\(token)');"
        NSLog("FCM -> evaluateJavaScript \(notifyJS)")
        webViewEngine.evaluateJavaScript(notifyJS, completionHandler: nil)
    }

    // MARK: - App lifecycle

    @objc private func appEnterBackground() {
        NSLog("FCM -> Set state background")
    }

    @objc private func appEnterForeground() {
        NSLog("FCM -> Set state foreground")
        if let lastPush = FCMPlugin.getLastPush() {
            notifyOfMessage(lastPush)
        }
    }

    // MARK: - Background / silent data messages
    //
    // Apple only delivers a silent (content-available, no alert) remote notification to
    // `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` on the app's real
    // AppDelegate. This plugin can't intercept that on its own, so the app's AppDelegate.swift
    // must forward it here via NotificationCenter (see README "iOS compilation details").
    @objc private func handleBackgroundRemoteNotification(_ notification: Notification) {
        guard let userInfo = notification.userInfo else { return }
        let completionHandler = notification.object as? (UIBackgroundFetchResult) -> Void

        var data = userInfo
        data["wasTapped"] = false
        notifyOfMessage(data)

        completionHandler?(.newData)
    }

    // MARK: - MessagingDelegate

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken = fcmToken else { return }
        NSLog("FCM -> Registration token: \(fcmToken)")
        notifyOfTokenRefresh(fcmToken)
    }

    // MARK: - UNUserNotificationCenterDelegate

    // Handle incoming notification messages while app is in the foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        NSLog("FCM -> receiving_message while app is in the foreground")
        notifyOfMessage(notification.request.content.userInfo)
        // Change this to your preferred presentation option.
        completionHandler([])
    }

    // Handle notification messages after a displayed notification is tapped by the user.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        NSLog("FCM -> receiving_message with completion handler")
        var userInfo = response.notification.request.content.userInfo
        userInfo["wasTapped"] = true

        FCMPlugin.lastPush = userInfo
        FCMPlugin.setInitialPushPayload(userInfo)

        completionHandler()
    }

    // MARK: - Shared push payload state

    private static func getLastPush() -> [AnyHashable: Any]? {
        let payload = lastPush
        lastPush = nil
        return payload
    }

    private static func setInitialPushPayload(_ payload: [AnyHashable: Any]?) {
        initialPushPayload = payload
    }

    private static func consumeInitialPushPayload() -> [AnyHashable: Any]? {
        let payload = initialPushPayload
        initialPushPayload = nil
        if payload != nil {
            lastPush = nil
        }
        return payload
    }
}
