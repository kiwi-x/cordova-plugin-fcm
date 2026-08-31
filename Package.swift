// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "cordova-plugin-fcm-ng",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "cordova-plugin-fcm-ng", targets: ["cordova-plugin-fcm-ng"])
    ],
    dependencies: [
        .package(url: "https://github.com/apache/cordova-ios.git", branch: "master"),
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "12.18.0")
    ],
    targets: [
        .target(
            name: "cordova-plugin-fcm-ng",
            dependencies: [
                .product(name: "Cordova", package: "cordova-ios"),
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseMessaging", package: "firebase-ios-sdk")
            ],
            path: "src/ios",
            exclude: ["Assets", "GoogleService-Info.plist"]
        )
    ]
)
