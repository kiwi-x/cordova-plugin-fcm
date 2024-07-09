//###########################################
//  AppDelegate+FCMPlugin.m
//
//  Created by felipe on 12/06/16.
//
//  Modified by Gustavo Cortez (01/28/2021)
//
//###########################################

#import "AppDelegate+FCMPlugin.h"
#import "FCMPlugin.h"
#import <objc/runtime.h>
#import <Foundation/Foundation.h>

#import "Firebase.h"

#if defined(__IPHONE_10_0) && __IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_10_0
@import UserNotifications;
#endif

@import Firebase;

// Implement UNUserNotificationCenterDelegate to receive display notification via APNS for devices
// running iOS 10 and above. Implement FIRMessagingDelegate to receive data message via FCM for
// devices running iOS 10 and above.
#if defined(__IPHONE_10_0) && __IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_10_0
@interface AppDelegate () <UNUserNotificationCenterDelegate, FIRMessagingDelegate>
@end
#endif

// Copied from Apple's header in case it is missing in some cases (e.g. pre-Xcode 8 builds).
#ifndef NSFoundationVersionNumber_iOS_9_x_Max
#define NSFoundationVersionNumber_iOS_9_x_Max 1299
#endif

@implementation AppDelegate (MCPlugin)

static NSData *lastPush;
NSString *const kGCMMessageIDKey = @"gcm.message_id";

+ (void)load
{
    Method original =  class_getInstanceMethod(self, @selector(application:didFinishLaunchingWithOptions:));
    Method custom =    class_getInstanceMethod(self, @selector(application:customDidFinishLaunchingWithOptions:));
    method_exchangeImplementations(original, custom);
}

- (BOOL)application:(UIApplication *)application customDidFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    // [START configure_firebase]
    [FIRApp configure];
    // [END configure_firebase]
    
    [self application:application customDidFinishLaunchingWithOptions:launchOptions];
    
    NSLog(@"FCM -> DidFinishLaunchingWithOptions");
    
     UNAuthorizationOptions authOptions =
     UNAuthorizationOptionAlert
     | UNAuthorizationOptionSound
     | UNAuthorizationOptionBadge;
     [[UNUserNotificationCenter currentNotificationCenter] requestAuthorizationWithOptions:authOptions completionHandler:^(BOOL granted, NSError * _Nullable error) {
     }];

     // For iOS 10 display notification (sent via APNS)
     [UNUserNotificationCenter currentNotificationCenter].delegate = self;
     // For iOS 10 data message (sent via FCM)
     [FIRMessaging messaging].delegate = self;

    [[UIApplication sharedApplication] registerForRemoteNotifications];
         // [END register_for_notifications]

//     // Add observer for InstanceID token refresh callback.
//     [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(tokenRefreshNotification:)
//                                                  name:kFIRMessagingRegistrationTokenRefreshedNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(tokenRefreshNotification:)
                                                 name:FIRMessagingRegistrationTokenRefreshedNotification object:nil];
    return YES;
    
}

// [START message_handling]
// Receive displayed notifications for iOS 10 devices.

// Handle incoming notification messages while app is in the foreground.
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
    NSLog(@"FCM -> receiving_message while app is in the foreground");
    // Print message ID.
    NSDictionary *userInfo = notification.request.content.userInfo;
    if (userInfo[kGCMMessageIDKey]) {
        NSLog(@"FCM -> Message ID 1: %@", userInfo[kGCMMessageIDKey]);
    }
    
    // Print full message.
    NSLog(@"FCM -> Full message: %@", userInfo);
    
    NSError *error;
    NSDictionary *userInfoMutable = [userInfo mutableCopy];
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:userInfoMutable
                                                       options:0
                                                         error:&error];
    [FCMPlugin.fcmPlugin notifyOfMessage:jsonData];
    
    // Change this to your preferred presentation option
    completionHandler(UNNotificationPresentationOptionNone);
}

// Handle notification messages after display notification is tapped by the user.
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)())completionHandler {
    NSLog(@"FCM -> receiving_message with completion handler");
    NSDictionary *userInfo = response.notification.request.content.userInfo;
    if (userInfo[kGCMMessageIDKey]) {
        NSLog(@"FCM -> Message ID 2: %@", userInfo[kGCMMessageIDKey]);
    }
    
    // Print full message.
    NSLog(@"FCM -> Full Message (2): %@", userInfo);
    
    NSError *error;
    NSDictionary *userInfoMutable = [userInfo mutableCopy];
    
    
    NSLog(@"FCM -> New method with push callback: %@", userInfo);
    
    [userInfoMutable setValue:@(YES) forKey:@"wasTapped"];
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:userInfoMutable
                                                       options:0
                                                         error:&error];
    NSLog(@"FCM -> APP WAS CLOSED DURING PUSH RECEPTION Saved data: %@", jsonData);
    lastPush = jsonData;
    
    
    completionHandler();
}


// [START receive_message in background iOS < 10]

// Include the iOS < 10 methods for handling notifications for when running on iOS < 10.
// As in, even if you compile with iOS 10 SDK, when running on iOS 9 the only way to get
// notifications is the didReceiveRemoteNotification.

- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo
{
    NSLog(@"FCM -> receiving_message in background iOS < 10");
    // Short-circuit when actually running iOS 10+, let notification centre methods handle the notification.
    if (NSFoundationVersionNumber >= NSFoundationVersionNumber_iOS_9_x_Max) {
        return;
    }
    
    NSLog(@"FCM -> Message ID: %@", userInfo[@"gcm.message_id"]);
    
    NSError *error;
    NSDictionary *userInfoMutable = [userInfo mutableCopy];
    
    if (application.applicationState != UIApplicationStateActive) {
        NSLog(@"FCM -> New method with push callback: %@", userInfo);
        
        [userInfoMutable setValue:@(YES) forKey:@"wasTapped"];
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:userInfoMutable
                                                           options:0
                                                             error:&error];
        NSLog(@"FCM -> APP WAS CLOSED DURING PUSH RECEPTION Saved data: %@", jsonData);
        lastPush = jsonData;
    }
}
// [END receive_message in background] iOS < 10]

// [START receive_message iOS < 10]
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo
fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
    NSLog(@"FCM -> receiving_message iOS < 10");
    // Short-circuit when actually running iOS 10+, let notification centre methods handle the notification.
    if (NSFoundationVersionNumber >= NSFoundationVersionNumber_iOS_9_x_Max) {
        return;
    }
    
    // If you are receiving a notification message while your app is in the background,
    // this callback will not be fired till the user taps on the notification launching the application.
    // TODO: Handle data of notification
    
    // Print message ID.
    NSLog(@"FCM -> Message ID: %@", userInfo[@"gcm.message_id"]);
    
    // Pring full message.
    NSLog(@"FCM -> Full message: %@", userInfo);
    NSError *error;
    
    NSDictionary *userInfoMutable = [userInfo mutableCopy];
    
    // Has user tapped the notificaiton?
    // UIApplicationStateActive   - app is currently active
    // UIApplicationStateInactive - app is transitioning from background to
    //                              foreground (user taps notification)
    
    UIApplicationState state = application.applicationState;
    if (application.applicationState == UIApplicationStateActive
        || application.applicationState == UIApplicationStateInactive) {
        [userInfoMutable setValue:@(NO) forKey:@"wasTapped"];
        NSLog(@"FCM -> App active");
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:userInfoMutable
                                                           options:0
                                                             error:&error];
        [FCMPlugin.fcmPlugin notifyOfMessage:jsonData];
        
        // app is in background
    }
    
    completionHandler(UIBackgroundFetchResultNoData);
}
// [END receive_message iOS < 10]
// [END message_handling]

- (void)messaging:(FIRMessaging *)messaging didReceiveRegistrationToken:(NSString *)fcmToken {
    NSLog(@"FCM -> Registration token: %@", fcmToken);
    // Notify about received token.
    NSDictionary *dataDict = [NSDictionary dictionaryWithObject:fcmToken forKey:@"token"];
    [[NSNotificationCenter defaultCenter] postNotificationName:
     @"FCMToken" object:nil userInfo:dataDict];
    // TODO: If necessary send token to application server.
    // Note: This callback is fired at each app startup and whenever a new token is generated.
}

// [START refresh_token]
- (void)tokenRefreshNotification:(NSNotification *)notification
{
    
    [[FIRMessaging messaging] tokenWithCompletion:^(NSString *token, NSError *error) {
      if (error != nil) {
        NSLog(@"Error getting FCM registration token: %@", error);
      } else {
        NSLog(@"FCM registration token: %@", token);
        [FCMPlugin.fcmPlugin notifyOfTokenRefresh:token];
        [self connectToFcm];
        //self.fcmRegTokenMessage.text = token;
      }
    }];

    
}
// [END refresh_token]

// [START connect_to_fcm]
- (void)connectToFcm
{
//    [[FIRInstanceID instanceID] instanceIDWithHandler:^(FIRInstanceIDResult * _Nullable result,
//                                                        NSError * _Nullable error) {
    
    [[FIRMessaging messaging] tokenWithCompletion:^(NSString *token, NSError *error) {

        if (error != nil) {
            NSLog(@"FCM -> Error fetching remote instance ID: %@", error);
        } else {
            NSLog(@"FCM -> Remote instance ID token: %@", token);
            [[FIRMessaging messaging] subscribeToTopic:@"ios"];
            [[FIRMessaging messaging] subscribeToTopic:@"all"];
        }
    }];
}
// [END connect_to_fcm]

- (void)applicationDidBecomeActive:(UIApplication *)application
{
    NSLog(@"FCM -> App become active");
    [FCMPlugin.fcmPlugin appEnterForeground];
    [self connectToFcm];
}

// [START disconnect_from_fcm]
- (void)applicationDidEnterBackground:(UIApplication *)application
{
    NSLog(@"FCM -> App entered background");
    [FCMPlugin.fcmPlugin appEnterBackground];
    NSLog(@"FCM -> Disconnected from FCM");
}
// [END disconnect_from_fcm]

+(NSData*)getLastPush
{
    NSData* returnValue = lastPush;
    lastPush = nil;
    return returnValue;
}

@end
