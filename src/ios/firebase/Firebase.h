#import <FirebaseCore/FirebaseCore.h>

#if !defined(__has_include)
  #error "Firebase.h won't import anything if your compiler doesn't support __has_include. Please \
          import the headers individually."
#else

  #if __has_include(<FirebaseMessaging/FirebaseMessaging.h>)
    #import <FirebaseMessaging/FirebaseMessaging.h>
  #endif

#endif  // defined(__has_include)
