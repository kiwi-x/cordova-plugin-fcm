const app = angular.module("app", ["angular.css.injector", "ui.router", "angulartics", "angulartics.piwik", "angulartics.google.analytics", "ngSanitize", "ui.bootstrap", "angular-loading-bar", "vjs.video", "angularLazyImg", "ct.ui.router.extras", "angular.bind.notifier", "ngFileUpload", "mm.iban", "ngTagsInput", "angular-inview"]);


// Deactivates piwik autotracking, we handle it in piwik-extention.js https://angulartics.github.io/
app.config(["$analyticsProvider", function ($analyticsProvider) {
    $analyticsProvider.virtualPageviews(false);
}]);

app.run([function () {
    var ua = navigator.userAgent || navigator.vendor || window.opera;

    if (ua && ua.indexOf("FBAN") === -1 && ua.indexOf("FBAV") === -1) {
        viewportUnitsBuggyfill.init();
    }
}]);

app.run(["$http", "$rootScope", "$window", "localStorageService", "$urlMatcherFactory", "ngxPopupService", function ($http, $rootScope, $window, localStorageService, $urlMatcherFactory, ngxPopupService) {
    $http.defaults.withCredentials = true;
    // Save a reference to the original $dismiss function
    const originalDismiss = $rootScope.$dismiss;
    // Override $dismiss globally
    $rootScope.$dismiss = function (reason) {
        // Notify Angular part about the dismissal      
        ngxPopupService.closeLast();
        // Call the original dismiss function
        if (originalDismiss) {
            originalDismiss.call($rootScope, reason);
        }
    };

    $urlMatcherFactory.caseInsensitive(true);
    var scope = $window.scope;
    $rootScope.scope = $window.scope;
    $rootScope.showSnipSlide = true;
    try {
        $rootScope.showSnipSlide = $rootScope.scope.currentScope.chapter.settings.configurations.showSnipsForUserRoleId != -1;
        if ($rootScope.showSnipSlide) {
            var roleId = $rootScope.scope.currentScope.chapter.settings.configurations.showSnipsForUserRoleId;
            if (typeof (roleId) === "number") {
                if (roleId > 0) {
                    $rootScope.showSnipSlide = $rootScope.scope.profile.chapterRoles ? $rootScope.scope.profile.chapterRoles.includes(roleId) : false;
                }
            }
        }
    } catch (e) {

    }

    var oculusConfig = {
        // chapterSlug and networkSlug may be injected in a more generic way
        chapterSlug: scope.currentScope.chapter ? scope.currentScope.chapter.slug : null,
        networkSlug: scope.currentScope.network.slug,
        threshold: scope.globalSettings.oculusImpressionThreshold,
        trackArticleWordReading: scope.globalSettings.oculusTrackArticleWordReading,
        idleTimeout: scope.globalSettings.oculusIdleTimeout,
        impressionThreshold: scope.globalSettings.oculusImpressionThreshold,
        impressionViewportThreshold: scope.globalSettings.oculusImpressionViewportThreshold,
        shipmentImpressionThreshold: scope.globalSettings.oculusShipmentImpressionThreshold,
        shipmentImpressionViewportThreshold: scope.globalSettings.oculusShipmentImpressionViewportThreshold,
        readingSpeed: scope.globalSettings.oculusReadingSpeed,
        readingThreshold: scope.globalSettings.oculusReadingThreshold,
        readingViewportThreshold: scope.globalSettings.oculusReadingViewportThreshold,
        trackArticleScrolling: scope.globalSettings.oculusTrackArticleScrolling,
        locationRequestEnable: scope.currentScope.network.settings.oculusLocationRequestEnable,
        locationRequestSuccessThrottleDays: scope.globalSettings.oculusLocationRequestSuccessThrottleDays,
        locationRequestFailedThrottleDays: scope.globalSettings.oculusLocationRequestFailedThrottleDays
    }

    scope.oculus = oculusConfig;

    if (localStorageService.enableOculusFeedback) {
        oculusConfig.feedback = true;
    }

    $window.Oculus = new Oculus(oculusConfig);
}]);

app.run(["$state", "$rootScope", "$previousState", "$window", "localStorageService", "profileService", "$analytics", "$uibModal", "$timeout", "notificationService", "$interval", "$location", "scopeService", "clickService", "hybridRouteTrackingService", function ($state, $rootScope, $previousState, $window, localStorageService, profileService, $analytics, $uibModal, $timeout, notificationService, $interval, $location, scopeService, clickService, hybridRouteTrackingService) {
    $rootScope.$state = $state;
    $rootScope.app = navigator.userAgent && navigator.userAgent.indexOf("Merkurist_IAB") !== -1;

    if ($rootScope.app) {
        $rootScope.appVersion = navigator.userAgent.replace(/.*\[Merkurist_IAB\/(.*)\]/gi, function (m, $1) { return $1 });
        $rootScope.appPlatform = navigator.userAgent.indexOf("Android") !== -1 ? "Android" : "iOS";
    }

    $rootScope.navigateUp = function () {
        $timeout(function () {
            if (window.history.state == null) {
                $state.go("app.main-news");
            }
            if ($state.params.back && !$state.params.back.abstract) {
                if (window.history.length <= 1) {
                    $state.go("app.main-news");
                }
                else {
                    window.history.back();
                }
            } else {
                var referrer = document.referrer;
                if (referrer.includes(window.location.hostname)) {
                    if (window.history.length <= 1) {
                        $state.go("app.main-news");
                    }
                    else {
                        window.history.back();
                    }
                } else {
                    $state.go("app.main-news");
                }
            };
        });
    };
    $rootScope.openChapterSwitch = function () {
        var m = $uibModal.open({
            templateUrl: "/ClientApp/src/legacy-app/index/chapterSwitchDialog.html",
            controller: "ChapterSwitchDialog",
            size: "lg",
            resolve: {}
        });

        $analytics.eventTrack("ShowChapterSwitchDialog", { category: "Navigation", label: scope.currentChapter.slug });

        m.result.then(function (slug) {
            $rootScope.switchChapter(slug);
        });
    };
    $rootScope.switchChapter = function (slug) {
        var chapter = null;

        scope.chapters.some(function (c) {
            return c.slug === slug ? ((chapter = c), true) : false;
        });

        if (chapter) {
            profileService.updateFavoriteChapter(chapter.slug).then(function () {

                var chapterPathTo = chapter.path;
                if (scope.currentScope.networkPath.length > 1) {
                    chapterPathTo = scope.currentScope.networkPath + chapter.path;
                }
                if (typeof cordova != 'undefined' && cordova.platformId === "android") {
                    var backlen = history.length - 1;
                    history.go(-backlen);
                    history.replaceState(null, null, chapterPathTo);
                    window.location.href = chapterPathTo;
                }
                else {
                    window.location.href = chapterPathTo;
                }
            });
        }
    };

    // notification
    $rootScope.notification = notificationService;

    var updateNotificationUnseenCount = function (full) {
        profileService.getProfile().then(function (profile) {
            if (profile.isRegistered) {
                notificationService.update(full);
            } else {
                notificationService.updateUnseenCount();
            }
        });
    };

    $rootScope.updateNotificationsTimed = function (override) {
        // console.log("updateNotificationsTimed called");
        var delay = 5 * 60 * 1000;
        if (window.updateNotificationsTimerHandle === undefined) {
            window.updateNotificationsTimerHandle = $timeout(
                function () {
                    $rootScope.updateNotificationsTimed();
                },
                delay
            );
            window.updateNotificationsTimerCreated = new Date();
            $rootScope.notification.getNotifications();
        } else {
            var currentDate = new Date();
            var updateNotificationsTimerSeconds = Math.round((currentDate - window.updateNotificationsTimerCreated) / 1000);
            if (updateNotificationsTimerSeconds >= 30 || override) {
                $timeout.cancel(window.updateNotificationsTimerHandle);
                window.updateNotificationsTimerHandle = $timeout(
                    function () {
                        $rootScope.updateNotificationsTimed();
                    },
                    delay
                );
                window.updateNotificationsTimerCreated = new Date();
                $rootScope.notification.getNotifications();
            }
        }
    };

    $rootScope.$on('$stateChangeSuccess', function (event, toState, toParams) {
        const currentRouteInfo = hybridRouteTrackingService.getCurrentRouteState();
        hybridRouteTrackingService.trackAngularJsStateChange(toState.name, toParams);
        profileService.getProfile().then(function (profile) {
            if (profile.isRegistered) {
                $rootScope.updateNotificationsTimed();
            }
        });
    });

    $rootScope.$on("authenticationStateChanged", function () {
        $rootScope.updateNotificationsTimed(true)
        updateNotificationUnseenCount(true)
    });

    profileService.getProfile().then(function (profile) {
        if (profile.isRegistered) {
            $rootScope.updateNotificationsTimed();
        }
    });

    if (!$rootScope.app) {
        var focus = document.hasFocus();

        $(window)
            .on("focus", function () {
                focus = true;
                updateNotificationUnseenCount();
            })
            .on("blur", function () {
                focus = false;
            });

        $interval(function () {
            updateNotificationUnseenCount();
        }, 20000);
    }

    // Cordova
    if ($rootScope.app) {
        var claimToken = function () {
            FCMPlugin.getToken(function (token) {
                if (!token) {
                    $timeout(function () {
                        FCMPlugin.getToken(function (token) {
                            if (token) {
                                notificationService.updateToken({ token: token });
                            }
                        }, function () {
                        });
                    }, 10000);
                } else {
                    notificationService.updateToken({ token: token });
                }
            }, function () {
                $timeout(function () {
                    FCMPlugin.getToken(function (token) {
                        if (token) {
                            notificationService.updateToken({ token: token });
                        }
                    }, function () {
                    });
                }, 10000);
            });
        };

        $rootScope.$on("authenticationStateChanged", function () {
            claimToken();
        });

        function normalizeNotificationData(data) {
            if (!data) {
                return null;
            }

            if (typeof data === "string") {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    return null;
                }
            }

            return data;
        }

        function getDirectNotificationTargetUrl(data) {
            data = normalizeNotificationData(data);
            if (!data) {
                return null;
            }

            var directUrlKeys = [
                "untrackedUri",
            ];

            for (var i = 0; i < directUrlKeys.length; i++) {
                var candidate = data[directUrlKeys[i]];
                if (typeof candidate !== "string" || candidate.length === 0) {
                    continue;
                }

                try {
                    var targetUrl = new URL(candidate, $window.location.origin);
                    if (targetUrl.protocol === "http:" || targetUrl.protocol === "https:") {
                        return targetUrl.toString();
                    }
                } catch (e) {
                    console.warn("Ignoring invalid notification target", directUrlKeys[i], candidate, e);
                }
            }

            return null;
        }

        function getTappedNotificationKey(data) {
            data = normalizeNotificationData(data);
            if (!data) {
                return null;
            }

            return [
                data.notificationId || "",
                getDirectNotificationTargetUrl(data) || "",
                data.wasTapped ? "1" : "0"
            ].join("|");
        }

        var lastHandledTappedNotificationKey = null;

        async function openTrackedNotificationById(notificationId) {
            try {
                const result = await clickService.clickNotification(notificationId);

                console.log("clickNotification result", result);

                if (!result || !result.uri) {
                    console.warn("clickNotification returned no uri", result);
                    return;
                }

                $window.location.replace(result.uri);
            } catch (err) {
                console.error("clickNotification failed", err);
            }
        }

        async function handleTappedNotification(data, source) {
            data = normalizeNotificationData(data);

            if (!data) {
                return;
            }

            var notificationKey = getTappedNotificationKey(data);
            if (notificationKey && notificationKey === lastHandledTappedNotificationKey) {
                console.log("Skipping duplicate tapped notification", source, data);
                return;
            }

            if (notificationKey) {
                lastHandledTappedNotificationKey = notificationKey;
            }

            console.log("Handling tapped notification", source, data);

            var directTargetUrl = getDirectNotificationTargetUrl(data);
            if (directTargetUrl) {
                $window.location.replace(directTargetUrl);
                return;
            }

            if (data.notificationId) {
                await openTrackedNotificationById(data.notificationId);
            }
        }

        var lastAppStateBeforeOffline = "app.main-news";
        var lastAppOfflineEvent = "";
        var lastAppOfflineTimeout = 0;
        var lastAppOfflineUrl = "";
        var cordovaApp = {
            initialize: function () {
                this.bindEvents();
            },
            bindEvents: function () {
                document.addEventListener("deviceready", this.onDeviceReady, false);
                document.addEventListener("offline", this.onOffline, false);
            },
            didLaunchAppFromLink: function (eventData) {
                if ((eventData.url.indexOf("/document/") == -1) && (eventData.url.indexOf("/pdf/") == -1) && (eventData.url.indexOf("/file/") == -1)) {
                    window.location.href = eventData.url;
                };
            },

            onOffline: function () {
                lastAppStateBeforeOffline = $state.current.name;
                lastAppOfflineUrl = window.location.href;
                lastAppOfflineTimeout = setTimeout(
                    function () {
                        lastAppOfflineTimeout = 0;
                        lastAppOfflineEvent = "offline";
                        $state.go("app.offline");
                    }, 5000);
            },
            onOnline: function () {
                // alert( "TimeOut: " + lastAppOfflineTimeout + " \n Last State: " + lastAppStateBeforeOffline +  "\n Last Url: " + lastAppOfflineUrl );
                if (lastAppOfflineTimeout > 0) {
                    clearTimeout(lastAppOfflineTimeout);
                    lastAppOfflineUrl = "";
                    lastAppOfflineTimeout = 0;
                } else {
                    if (lastAppOfflineEvent === "offline") {
                        if (lastAppStateBeforeOffline !== "app.main-news") {
                            window.location.href = lastAppOfflineUrl;
                            $state.go(lastAppStateBeforeOffline);
                        } else {
                            $state.go(lastAppStateBeforeOffline);
                        }
                        lastAppOfflineUrl = lastAppOfflineEvent = "";
                    }
                }
                $rootScope.updateNotificationsTimed();
            },
            onBackKeyDown: function () {
                console.log("backKey", history.length, history);
                if (window.history.state == null) {
                    $state.go("app.main-news");
                }
                history.back();
            },
            statusBarDarkMode: function () {
                var isDarkMode = window.matchMedia('(prefers-color-scheme:dark)');
                //console.log(isDarkMode.matches);
                //if (cordova.platformId == 'android' && cordova.platformVersion == '11.0.0') {
                if (cordova.platformId == 'android') {
                    if (isDarkMode.matches) {
                        //console.log("isDark");
                        StatusBar.styleLightContent(); // seams not to work anymore
                        //backcolor = getComputedStyle(document.body).getPropertyValue('--color1Dark');
                        StatusBar.backgroundColorByHexString('#000');
                    }
                    else {
                        //console.log("isLight");
                        StatusBar.styleDefault(); // seams not to work anymore
                        //backcolor = getComputedStyle(document.body).getPropertyValue('--color1');
                        StatusBar.backgroundColorByHexString('#fff');
                    }
                } else {
                    if (isDarkMode.matches) {
                        //console.log("isDark");
                        StatusBar.styleLightContent();
                        StatusBar.backgroundColorByHexString('#000');
                    }
                    else {
                        //console.log("isLight");
                        StatusBar.styleDefault();
                        StatusBar.backgroundColorByHexString('#fff');
                    }
                }
            },
            checkNotificationPermission: function (requested) {
                var firebasePlugin = window.FCMPlugin;
                firebasePlugin.hasPermission(
                    function (hasPermission) {
                        if (hasPermission) {
                            // Granted
                            console.log("Remote notifications permission granted");
                            claimToken();
                        } else if (!requested) {
                            // Request permission
                            console.log("Requesting remote notifications permission");
                            firebasePlugin.grantPermission(function () {
                                claimToken();
                            }, function (error) {
                                console.warn("Granting notification permission failed", error);
                            });
                        } else {
                            // Denied
                            console.log("Notifications won't be shown as permission is denied");
                        }
                    }
                );
            },
            onDeviceReady: function () {
                document.addEventListener("online", cordovaApp.onOnline, false);
                document.addEventListener("backbutton", cordovaApp.onBackKeyDown, false);

                navigator && navigator.splashscreen && navigator.splashscreen.hide();
                universalLinks.subscribe("launchedAppFromLink", cordovaApp.didLaunchAppFromLink);

                FCMPlugin.onNotification(function (data) {
                    $timeout(async function () {
                        console.log("FcmOnNotification", data);

                        data = normalizeNotificationData(data);

                        if (!data || !data.wasTapped) {
                            $rootScope.updateNotificationsTimed(true);
                            updateNotificationUnseenCount(true);
                            return;
                        }

                        await handleTappedNotification(data, "onNotification");
                    }, 0);
                }, function () {
                    updateNotificationUnseenCount();
                });

                profileService.getProfile().then(function () {
                    updateNotificationUnseenCount();
                });

                var lastStarted = new Date();
                var lastInvalidate = new Date();

                document.addEventListener("resume", function () {
                    setTimeout(function () {
                        currentDate = new Date();
                        var diffStartedDays = Math.round((currentDate - lastStarted) / 86400000);
                        if (diffStartedDays > 1) {
                            window.location.href = "/";
                        }
                        var diffInvalidateMins = Math.round((currentDate - lastInvalidate) / 60000);
                        if (diffInvalidateMins > 30) {
                            $rootScope.$emit("invalidateLists");
                            lastInvalidate = new Date();
                        }
                        $rootScope.updateNotificationsTimed();
                    }, 0);
                }, false);
                if (window.matchMedia) {
                    cordovaApp.statusBarDarkMode();
                    // window.matchMedia('(prefers-color-scheme: dark)').addListener() is deprecated
                    window.matchMedia('(prefers-color-scheme: dark)').addListener(function (e) {
                        cordovaApp.statusBarDarkMode();
                    });
                    ////TODO: possible solution - has to be checked first
                    //const wmmpcsd = window.matchMedia("(prefers-color-scheme: dark)");
                    //wmmpcsd.addEventListener("change", () => {
                    //    cordovaApp.statusBarDarkMode();
                    //});
                };
                // TODO: Remove if going live!
                // console.log("Platform and Version", $rootScope.appPlatform, $rootScope.appVersion);
                if ($rootScope.appPlatform === "Android" && $rootScope.appVersion > 6) {
                    cordovaApp.checkNotificationPermission();
                } else {
                    claimToken();
                }

                // Pull to Refresh :: START

                var startTouchPoint = 0;
                var isValidPullToRefresh = false;

                document.body.ontouchstart = function (event) {
                    if (window.visualViewport.pageTop > 10) {
                        isValidPullToRefresh = false;

                        return;
                    }
                    if (document.body.classList.contains('popup-open')) {
                        isValidPullToRefresh = false;
                        return;
                    }
                    isValidPullToRefresh = true;
                    startTouchPoint = event.targetTouches[0].pageY;
                };

                document.body.ontouchend = function (event) {
                    if (document.body.classList.contains('popup-open')) return;
                    if (!isValidPullToRefresh) return;
                    if (window.visualViewport.pageTop > 10) return;

                    var endTouchPoint = event.changedTouches[0].pageY;
                    var touchLengthThreshould = 150;
                    var touchLengthInThreshould = (endTouchPoint - startTouchPoint) > touchLengthThreshould;
                    if (!navigator.onLine) {
                        return;
                    }

                    if (touchLengthInThreshould) {
                        setTimeout(function () {
                            // console.log('pulled to refresh! Reloading...');
                            /* New behavior. Every page is reloaded on pull down. */
                            if (!(location.href.includes('/chat') || location.href.includes('/edit')))
                                location.reload();

                            //if (location.href.includes('/edit'))
                            //    location.reload();
                        }, 500);
                    }
                };
                // Pull to Refresh :: END

            }
        };
        cordovaApp.initialize();
    } else {
        profileService.getProfile().then(function () {
            $timeout(function () {
                updateNotificationUnseenCount();
            },
                2000);
        });

    }
}]);

app.config(["lazyImgConfigProvider", function (lazyImgConfigProvider) {
    lazyImgConfigProvider.setOptions({
        offset: 1334
    });
}]);

app.config(["$urlRouterProvider", "$stateProvider", "$locationProvider", "$compileProvider", "$qProvider", function ($urlRouterProvider, $stateProvider, $locationProvider, $compileProvider, $qProvider) {

    $locationProvider.html5Mode({ enabled: true, requireBase: false });
    $compileProvider.debugInfoEnabled(false);
    $qProvider.errorOnUnhandledRejections(false);
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|tel|webcal|local|file|data|blob|whatsapp):/);


    var sponsoredArticleResolver = ["$stateParams", "sponsoredArticleService", "parserService", "$location",
        function (parameters, sponsoredService, parser, $location) {
            var sponsoredArticleId = parameters.id;
            if (!sponsoredArticleId) {
                $location.path("/").replace();
            }
            var sponsoredArticleVariantId = parameters.v;

            return sponsoredService.getSponsoredArticle(sponsoredArticleId, sponsoredArticleVariantId).then(function (response) {
                parser.postProcessHtml(response);
                return response;
            },
                function () {
                    console.log("Error on the SponsoredDetail");
                });

        }
    ];

    var articleResolver = [
        "$stateParams", "articleService", "profileService", "parserService", "$location", function ($stateParams, articleService, profileService, parserService, $location) {
            var id = $stateParams.id;
            if (!id) {
                $location.path("/").replace();
            }
            var variantId = $stateParams.v;
            //variantId = null;
            // $location.search('v', null);
            return profileService.getProfile()
                .then(
                    function () {
                        return articleService.getArticleDetails(id, variantId).then(function (a) {
                            a.detailsLoaded = true;
                            parserService.postProcessHtml(a);
                            //$location.search('v', null);
                            return a;
                        }, function () {
                            return articleService.getArticleDetails(id, variantId).then(function (a) {
                                parserService.postProcessHtml(a);
                                //$location.search('v', null);
                                return a;
                            }, function () {
                                $location.path("/").replace();
                            });
                        });
                    });
        }
    ];

    var snipDetailResolve = [
        "$stateParams", "snipService", "profileService", "parserService", "$location", function ($stateParams, snipService, profileService, parserService, $location) {
            var id = $stateParams.id;
            if (!id) {
                $location.path("/").replace();
            }
            return profileService.getProfile().then(function () {
                return snipService.getSnipDetailsFromCache(id).then(function (a) {
                    snipService.getSnipDetails(id).then(function () {
                    });

                    return a;
                }, function () {
                    return snipService.getSnipDetails(id).then(function (a) {
                        return a;
                    }, function () {
                        $location.path("/").replace();
                    });
                });
            });
        }
    ];

    var articleReportResolve = {
        chapterReport: [
            "$stateParams", "articleService", "$location", function ($stateParams, articleService, $location) {
                return articleService.getReport($stateParams.id).then(function (a) {
                    return a;
                }, function () {
                    $location.path("/");
                });
            }
        ],
        article: [
            "$stateParams", "articleService", "parserService", function ($stateParams, articleService, parserService) {

                return articleService.getArticleFromCache($stateParams.id).then(function (a) {
                    articleService.getArticleDetails($stateParams.id).then(function () {
                    });

                    return a;
                }, function () {
                    return articleService.getArticleDetails($stateParams.id).then(function (a) {
                        return a;
                    });
                });
            }
        ]
    };

    var articleElasticReportResolve = {
        chapterReport: [
            "$stateParams", "articleService", "$location", function ($stateParams, articleService, $location) {
                return articleService.getElasticReport($stateParams.id).then(function (a) {
                    return a;
                }, function () {
                    $location.path("/");
                });
            }
        ],
        article: [
            "$stateParams", "articleService", "parserService", function ($stateParams, articleService, parserService) {
                return articleService.getArticleDetails($stateParams.id);
            }
        ]
    };

    var snipReportResolve = {
        chapterReport: [
            "$stateParams", "snipService", "parserService", function ($stateParams, snipService) {
                return snipService.getReport($stateParams.id);
            }
        ],
        snip: [
            "$stateParams", "snipService", "parserService", function ($stateParams, snipService, parserService) {

                return snipService.getSnipDetails($stateParams.id).then(function (s) {
                    return s;
                });
            }
        ]
    };

    $stateProvider
        .state("app.imprint", {
            url: "imprint",
            templateUrl: "/ClientApp/src/legacy-app/content/imprint.html"
        })
        .state("app.privacyPolicy", {
            url: "pp",
            controller: "DataPrivacyPolicyController",
            templateUrl: "/ClientApp/src/legacy-app/termsOfUse/dataPrivacyPolicy.html"
        })
        .state("app.privacyPolicy-merkurist-gmbh", {
            url: "pp-merkurist-gmbh",
            controller: "DataPrivacyPolicyController",
            templateUrl: "/ClientApp/src/legacy-app/termsOfUse/dataPrivacyPolicy-merkurist-gmbh.html"
        })
        .state("app.accessibility", {
            url: "accessibility",
            controller: "AccessibilityController",
            templateUrl: "/ClientApp/src/legacy-app/termsOfUse/accessibility.html"
        })
        .state("app.tos", {
            url: "tos",
            controller: "TermsOfUseController",
            templateUrl: "/ClientApp/src/legacy-app/termsOfUse/termsOfUse.html"
        })
        .state("app.optOut",
            {
                url: "optout",
                controller: "OptOutController",
                templateUrl: "/ClientApp/src/legacy-app/optOut/optOut.html"
            });

    if (scope.currentChapter.name) {
        var activateArticleDetailsForRedesign = false;
        var articleDetailsForRedesign = scope.currentScope.network.settings.configurations.contentRenderEngine === "Redesign2024" && activateArticleDetailsForRedesign;

        // Document in-app page is only for ik-up
        if (scope.currentScope.network.settings.languagePack.includes("business")) {
            $stateProvider.state("app.document-page",
                {
                    url: "file-inapp/{id}?filename",
                    controller: "",
                    templateUrl: "/ClientApp/src/redesign/common/documentPage.html"
                })
        }
        $stateProvider
            .state("app",
                {
                    url: "/",
                    sticky: true,
                    abstract: true,
                    controller: "RootController",
                    templateUrl: "/ClientApp/src/legacy-app/root/root.html"
                })
            .state("app.main-news",
                {
                    url: "",
                    translatable: true,
                    controller: "rootNewsCompomentController",
                    templateUrl: "/ClientApp/src/legacy-app/root/news/rootNewsComponent.html"
                })
            .state("app.main-snips",
                {
                    url: "snips",
                    controller: 'rootSnipsComponentController',
                    templateUrl: '/ClientApp/src/legacy-app/root/snips/rootSnipsComponent.html',
                    translatable: true
                })
            .state("app.main-login", {
                url: "login?closedToken",
                controller: 'rootLoginComponentController',
                templateUrl: '/ClientApp/src/legacy-app/root/login/rootLoginComponent.html'
            })
            .state("app.main-notifications", {
                url: "notifications",
                controller: 'rootNotificationsComponentController',
                templateUrl: "/ClientApp/src/legacy-app/root/notifications/rootNotificationsComponent.html"
            })
            .state("app.main-menu", {
                url: "menu",
                controller: 'rootMenuComponentController',
                templateUrl: '/ClientApp/src/legacy-app/root/menu/rootMenuComponent.html'
            })
            .state("app.articleStatistic",
                {
                    url: "{slug}_{id}/legacy-report",
                    controller: "ArticleReportController",
                    templateUrl: "/ClientApp/src/legacy-app/article/articleReport.html",
                    resolve: articleReportResolve
                })
            .state("app.articleElasticStatistic",
                {
                    url: "{slug}_{id}/{v}/report",
                    controller: "ArticleElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/article/articleElasticReport.html",
                    resolve: articleElasticReportResolve
                })
            .state("app.articleElasticStatisticAlt",
                {
                    url: "{slug}_{id}/report",
                    controller: "ArticleElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/article/articleElasticReport.html",
                    resolve: articleElasticReportResolve
                })
            .state("app.snipStatistic",
                {
                    url: "snips/{slug}_{id}/legacy-report",
                    controller: "SnipReportController",
                    templateUrl: "/ClientApp/src/legacy-app/snip/snipReport.html",
                    resolve: snipReportResolve
                })
            .state("app.snipElasticStatistic",
                {
                    url: "snips/{slug}_{id}/report",
                    controller: "SnipElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/snip/snipElasticReport.html"
                })
            .state("app.snipDetail",
                {
                    url: "snips/{slug}_{id}",
                    controller: "SnipDetailController",
                    templateUrl: "/ClientApp/src/legacy-app/snip/snipDetail.html",
                    resolve: {
                        snip: snipDetailResolve
                    },
                    translatable: true
                })
            .state("app.articleEditAlt",
                {
                    disableNavigation: true,
                    url: "{slug}_{id}/{v}/edit",
                    controller: "ArticleEditController",
                    templateUrl: "/ClientApp/src/legacy-app/article/articleEdit.html"
                })
            .state("app.articleEdit",
                {
                    disableNavigation: true,
                    url: "{slug}_{id}/edit",
                    controller: "ArticleEditController",
                    templateUrl: "/ClientApp/src/legacy-app/article/articleEdit.html"
                })
            .state("app.articleDetail", {
                url: "{slug}_{id}/{v}",
                controller: articleDetailsForRedesign ? null : "ArticleDetailController",
                templateUrl: "/ClientApp/src/legacy-app/article/articleDetail.html",

                resolve: articleDetailsForRedesign ? {} : {
                    article: articleResolver
                },
                translatable: true
            })
            .state("app.articleDetailAlt", {
                url: "{slug}_{id}",
                controller: articleDetailsForRedesign ? null : "ArticleDetailController",
                templateUrl: "/ClientApp/src/legacy-app/article/articleDetail.html",

                resolve: articleDetailsForRedesign ? {} : {
                    article: articleResolver
                },
                translatable: true
            })
            .state("app.sponsoredArticleEditAlt",
                {
                    disableNavigation: true,
                    url: "sparticles/{slug}_{id}/{v}/edit",
                    controller: "SponsoredArticleEditController",
                    templateUrl: "/ClientApp/src/legacy-app/sponsoredArticle/sponsoredArticleEdit.html"
                })
            .state("app.sponsoredArticleEdit",
                {
                    disableNavigation: true,
                    url: "sparticles/{slug}_{id}/edit",
                    controller: "SponsoredArticleEditController",
                    templateUrl: "/ClientApp/src/legacy-app/sponsoredArticle/sponsoredArticleEdit.html"
                })
            .state("app.sponsoredArticleDetail",
                {
                    url: "sparticles/{slug}_{id}",
                    controller: "SponsoredArticleDetailController",
                    templateUrl: "/ClientApp/src/legacy-app/sponsoredArticle/sponsoredArticleDetail.html",
                    resolve: {
                        sponsoredArticle: sponsoredArticleResolver
                    }
                })
            .state("app.sponsoredArticleDetailAlt",
                {
                    url: "sparticles/{slug}_{id}/{v}",
                    controller: "SponsoredArticleDetailController",
                    templateUrl: "/ClientApp/src/legacy-app/sponsoredArticle/sponsoredArticleDetail.html",
                    resolve: {
                        sponsoredArticle: sponsoredArticleResolver
                    }
                })

            .state("app.adminsettings",
                {
                    url: "adminsettings",
                    controller: "AdminSettingsController",
                    templateUrl: "/ClientApp/src/legacy-app/admin/adminSettings.html"
                })
            .state("app.notificationsettings",
                {
                    url: "notifications/settings/{privateUserGuid}?optOutAll",
                    controller: "NotificationSettingsController",
                    templateUrl: "/ClientApp/src/legacy-app/notification/notificationsettings.html"
                })
            .state("app.my-profile",
                {
                    url: "profile",
                    controller: "ProfileController",
                    templateUrl: "/ClientApp/src/legacy-app/user/profile.html"
                })
            .state("app.public-profile",
                {
                    url: "profile/{id}",
                    controller: "PublicProfileController",
                    templateUrl: "/ClientApp/src/legacy-app/user/publicProfile.html"
                })
            .state("app.loginSaml2",
                {
                    url: "login/saml2",
                    controller: "LoginSaml2Controller",
                    templateUrl: "/ClientApp/src/legacy-app/authentication/loginSaml2.html"
                })
            .state("app.register",
                {
                    url: "register?closedToken",
                    controller: "RegisterController",
                    templateUrl: "/ClientApp/src/legacy-app/authentication/register.html",
                    resolve: {
                        registerForNewsletter: function () {
                            return false;
                        }
                    }
                })
            .state("app.registerNewsletter",
                {
                    url: "newsletter-subscribe",
                    controller: "RegisterController",
                    templateUrl: "/ClientApp/src/legacy-app/authentication/register.html",
                    resolve: {
                        registerForNewsletter: function () {
                            return true;
                        }
                    }
                })
            .state("app.registrationcomplete",
                {
                    url: "account/registration-complete",
                    templateUrl: "/ClientApp/src/legacy-app/content/registrationcomplete.html"
                })
            .state("app.requestPassword",
                {
                    url: "account/request-password",
                    controller: "RequestPasswordController",
                    templateUrl: "/ClientApp/src/legacy-app/authentication/requestPassword.html"
                })
            .state("app.passwordResetComplete",
                {
                    url: "account/password-resetted",
                    templateUrl: "/ClientApp/src/legacy-app/content/passwordresetcomplete.html"
                })
            .state("app.requestPasswordComplete",
                {
                    url: "account/password-requested",
                    templateUrl: "/ClientApp/src/legacy-app/content/requestpasswordcomplete.html"
                })
            .state("app.unsubscribeNewsletter",
                {
                    url: "account/newsletter-unsubscribe/{id}",
                    controller: "UnsubscribeController",
                    templateUrl: "/ClientApp/src/legacy-app/user/unsubscribe.html"
                })
            .state("app.accountsettings",
                {
                    url: "settings",
                    controller: "AuthenticationSettingsController",
                    templateUrl: "/ClientApp/src/legacy-app/authentication/authenticationSettings.html"
                }).state("app.special",
                    {
                        url: "specials/{id}",
                        controller: "SpecialDetailController",
                        templateUrl: "/ClientApp/src/legacy-app/special/specialDetail.html",
                        resolve: {
                            special: [
                                "$stateParams", "specialService", function ($stateParams, specialService) {
                                    return specialService.getSpecial($stateParams.id);
                                }
                            ]
                        }
                    })
            .state("app.specialStatistics",
                {
                    url: "campaigns/specials/{id}/legacy-report",
                    controller: "SpecialReportController",
                    templateUrl: "/ClientApp/src/legacy-app/special/specialReport.html"
                })
            .state("app.surveyDetails",
                {
                    url: "surveys/{id}?preview",
                    controller: "SurveyDetailController",
                    templateUrl: "/ClientApp/src/legacy-app/survey/surveyDetail.html"
                })
            .state("app.workflow",
                {
                    url: "workflow/{id}?preview",
                    controller: "workflowController",
                    templateUrl: "/ClientApp/src/legacy-app/workflow/workflowTemplate.html"
                })
            .state("app.videoplay",
                {
                    url: scope.currentScope.prefixAppRoutes + "apicodo-video/{id}",
                    controller: "apicodoMediaPlayPageController",
                    templateUrl: "/ClientApp/src/legacy-app/media/apicodoMediaPlayPage.html"
                })
            .state("app.specialElasticStatistic",
                {
                    url: "campaigns/specials/{id}/report",
                    controller: "SpecialElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/special/specialElasticReport.html"
                })
            .state("app.search",
                {
                    url: "search?q&chapterIds",
                    controller: "SearchController",
                    templateUrl: "/ClientApp/src/legacy-app/search/search.html",
                    reloadOnSearch: false
                })
            .state("app.campaignStatistic",
                {
                    url: "campaigns/{pin}/report",
                    controller: "CampaignReportController",
                    templateUrl: "/ClientApp/src/legacy-app/campaign/campaignReport.html"
                })
            .state("app.campaignDetail",
                {
                    url: "campaigns/{pin}",
                    controller: "AdvertisementController",
                    templateUrl: "/ClientApp/src/legacy-app/campaign/shipments.html"
                })
            .state("app.authorDashboard",
                {
                    url: "dashboard",
                    controller: "DashboardController",
                    templateUrl: "/ClientApp/src/legacy-app/author/dashboard.html"
                })
            .state("app.snipApply",
                {
                    url: "snips/{slug}_{id}/apply",
                    controller: "SnipApplyController",
                    templateUrl: "/ClientApp/src/legacy-app/snip/snipApply.html"
                })
            .state("app.marketResearchStatistic",
                {
                    url: "campaigns/marketresearch/{id}/legacy-report",
                    controller: "MarketResearchReportController",
                    templateUrl: "/ClientApp/src/legacy-app/marketResearch/MarketResearchReport.html"
                })
            .state("app.marketResearchElasticStatistic",
                {
                    url: "campaigns/marketresearch/{id}/report",
                    controller: "MarketResearchElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/marketResearch/marketResearchElasticReport.html"
                })
            .state("app.brochureStatistic",
                {
                    url: "campaigns/brochures/{id}/legacy-report",
                    controller: "BrochureReportController",
                    templateUrl: "/ClientApp/src/legacy-app/brochure/BrochureReport.html"
                })
            .state("app.brochureElasticStatistic",
                {
                    url: "campaigns/brochures/{id}/report",
                    controller: "BrochureElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/brochure/brochureElasticReport.html"
                })
            .state("app.bannerCampaignStatistic",
                {
                    url: "campaigns/banners/{pin}/legacy-report",
                    controller: "bannerCampaignReportController",
                    templateUrl: "/ClientApp/src/legacy-app/bannerCampaign/bannerCampaignReport.html"
                })
            .state("app.bannerCampaignElasticStatistic",
                {
                    url: "campaigns/banners/{pin}/report",
                    controller: "BannerCampaignElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/bannerCampaign/bannerCampaignElasticReport.html"
                })
            .state("app.sponsoredArticleCampaignStatistic",
                {
                    url: "campaigns/sparticles/{pin}/legacy-report",
                    controller: "sponsoredArticleCampaignReportController",
                    templateUrl: "/ClientApp/src/legacy-app/sponsoredArticleCampaign/sponsoredArticleCampaignReport.html"
                })
            .state("app.sponsoredArticleCampaignElasticStatistic",
                {
                    url: "campaigns/sparticles/{pin}/report",
                    controller: "SponsoredArticleCampaignElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/sponsoredArticleCampaign/sponsoredArticleCampaignElasticReport.html"
                })
            .state("app.premiumStatistic",
                {
                    url: "campaigns/premiums/{pin}/legacy-report",
                    controller: "premiumReportController",
                    templateUrl: "/ClientApp/src/legacy-app/premium/premiumReport.html"
                })
            .state("app.premiumElasticStatistic",
                {
                    url: "campaigns/premiums/{pin}/report",
                    controller: "PremiumElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/premium/premiumElasticReport.html"

                })
            .state("app.superStatistic",
                {
                    url: "campaigns/super/{pin}/legacy-report",
                    controller: "superCampaignReportController",
                    templateUrl: "/ClientApp/src/legacy-app/superCampaign/superCampaignReport.html"
                })
            .state("app.superElasticStatistic",
                {
                    url: "campaigns/super/{pin}/report",
                    controller: "SuperCampaignElasticReportController",
                    templateUrl: "/ClientApp/src/legacy-app/superCampaign/superCampaignElasticReport.html"
                })
            .state("app.staticArticleEditAdmin",
                {
                    url: "staticarticles/{id}/edit",
                    controller: "StaticArticleEditController",
                    disableNavigation: true,
                    templateUrl: "/ClientApp/src/legacy-app/staticArticle/staticArticleEdit.html",
                    resolve: {
                        staticArticleId: [
                            "$stateParams", function ($stateParams) {
                                return $stateParams.id;
                            }
                        ]
                    }
                })
            .state("app.companyNews",
                {
                    url: "companyNews/{id}",
                    controller: "StaticArticleDetailController",
                    disableNavigation: true,
                    forceShowNavigationBranding: true,
                    templateUrl: "/ClientApp/src/legacy-app/staticArticle/staticArticleDetail.html",
                    resolve: {
                        staticArticle: [
                            "companyNewsService", "parserService", "$stateParams", function (companyNewsService, parserService, $stateParams) {
                                return companyNewsService.getCompanyNewsDetail($stateParams.id)
                                    .then(function (a) {
                                        parserService.postProcessHtml(a);
                                        return a;
                                    });
                            }
                        ]
                    }
                })
            .state("app.rubrics",
                {
                    url: "rubrics?q",
                    controller: "",
                    templateUrl: "/ClientApp/src/redesign/rubrics/rubrics.html"
                })
            .state("app.accessibility-easy-language",
                {
                    url: "accessibility-easy-language",
                    controller: "",
                    templateUrl: "/ClientApp/src/redesign/termsOfUse/accessibility_easy_language.html"
                })
            .state("app.sign-language",
                {
                    url: "sign-language",
                    controller: "",
                    templateUrl: "/ClientApp/src/redesign/termsOfUse/signLanguage.html"
                })
            .state("app.quiz", {
                url: "quiz/{id}?preview&downloadCertificate",
                templateUrl: "/ClientApp/src/redesign/quiz/quiz.html",
                resolve: {
                    quizId: ['$stateParams', sp => sp.id],
                    quizPreview: ['$stateParams', sp =>
                        sp.preview === true ||
                        sp.preview === 'true' ||
                        sp.preview === 1 ||
                        sp.preview === '1'
                    ],
                    quizDownloadCertificate: ['$stateParams', sp =>
                        sp.downloadCertificate === true ||
                        sp.downloadCertificate === 'true' ||
                        sp.downloadCertificate === 1 ||
                        sp.downloadCertificate === '1'
                    ]
                }
            });

        if (scope.currentChapter.settings.featureFeedback) {
            $stateProvider.state("app.feedback",
                {
                    url: "feedback",
                    controller: "FeedbackController",
                    templateUrl: "/ClientApp/src/legacy-app/user/feedback.html"
                });
        }
        if (scope.currentScope.network.settings.configurations.enableCalendar !== false) {
            $stateProvider.state("app.eventCalendar",
                {
                    url: "events",
                    controller: "EventCalendarController",
                    templateUrl: "/ClientApp/src/legacy-app/event/eventCalendar.html"
                });
        }
        if (scope.currentScope.network.settings.configurations.enableCalendar !== false && scope.currentScope.chapter.settings.configurations.enableEventCalendar) {
            $stateProvider.state("app.eventCalendarDetail",
                {
                    url: "events/{guid}",
                    controller: "EventCalendarDetailController",
                    templateUrl: "/ClientApp/src/legacy-app/event/eventCalendarDetail.html",
                    translatable: true,
                    resolve: {
                        event: [
                            "eventCalendarService", "$stateParams", "$state", function (eventCalendarService, $stateParams, $state) {
                                return eventCalendarService.getEvent($stateParams.guid)
                                    .then(function (event) {
                                        return event;
                                    },
                                        function () {
                                            $state.go("app.main-news");
                                        });
                            }
                        ]
                    }
                });
        }
        if (scope.currentScope.network.settings.configurations.enableCalendar !== false && scope.currentScope.chapter.settings.configurations.enableEventCalendar) {
            $stateProvider.state("app.eventCalendarEdit",
                {
                    disableNavigation: true,
                    url: "events/{guid}/edit",
                    controller: "EventCalendarEditController",
                    templateUrl: "/ClientApp/src/legacy-app/event/eventCalendarEdit.html",
                    resolve: {
                        event: [
                            "eventCalendarService", "$stateParams", "$state", function (eventCalendarService, $stateParams, $state) {
                                return eventCalendarService.getEventForEdit($stateParams.guid)
                                    .then(function (event) {
                                        return event;
                                    },
                                        function () {
                                            $state.go("app.main-news");
                                        });
                            }
                        ]
                    }
                });
        }
        if (scope.currentChapter.settings.featureSales) {
            $stateProvider
                .state("app.sponsoredArticleList",
                    {
                        url: "sparticles",
                        controller: "SponsoredArticleListController",
                        templateUrl: "/ClientApp/src/legacy-app/sponsoredArticle/sponsoredArticleList.html"
                    })
                .state("app.campaigns",
                    {
                        url: "campaigns",
                        controller: "CampaignController",
                        templateUrl: "/ClientApp/src/legacy-app/campaign/campaigns.html"
                    })
                .state("app.advertiserBillingInfo",
                    {
                        url: "advertisers/billinginfo",
                        controller: "AdvertiserBillingInfoController",
                        templateUrl: "/ClientApp/src/legacy-app/advertiser/advertiserBillingInfo.html"
                    })
                .state("app.consumeAdvertiserToken",
                    {
                        url: "advertisers/connect",
                        controller: "AdvertiserConsumeController",
                        templateUrl: "/ClientApp/src/legacy-app/advertiser/advertiserConsume.html"
                    })
                .state("app.advertiserConsumtionComplete",
                    {
                        url: "advertisers/connected",
                        templateUrl: "/ClientApp/src/legacy-app/advertiser/advertiserConsumationComplete.html"
                    });
        }

        if (scope.currentChapter.settings.featureAuthorBilling) {
            $stateProvider.state("app.authorBillingInfo",
                {
                    url: "author/billinginfo",
                    controller: "AuthorBillingInfoController",
                    templateUrl: "/ClientApp/src/legacy-app/author/authorBillingInfo.html"
                });
        }


        if (scope.currentChapter.managingParent.closed) {
            $stateProvider
                .state("app.closedChapter",
                    {
                        url: "closed?token=",
                        controller: "ClosedChapterController",
                        templateUrl: "/ClientApp/src/legacy-app/closedChapter/closedChapter.html"
                    })
                .state("app.ikUpLanding",
                    {
                        url: "landing",
                        controller: "IkUpLandingPageController",
                        templateUrl: "/ClientApp/src/legacy-app/ikUpLandingPage/ikUpLandingPage.html"
                    });
        }

        $stateProvider.state("app.authors",
            {
                url: "authors",
                controller: "AuthorListController",
                templateUrl: "/ClientApp/src/legacy-app/author/authorList.html"
            })
            .state("app.imagelicensing",
                {
                    url: "imagelicensing",
                    templateUrl: "/ClientApp/src/legacy-app/content/imagelicensing.html"
                });

        scope.currentScope.network.staticArticles.concat(scope.currentScope.chapter.staticArticles)
            .forEach(
                function (x) {
                    if (x.path) {
                        $stateProvider.state("app.staticArticles_" + x.id,
                            {
                                url: x.path.substring(1),
                                templateUrl: "/ClientApp/src/legacy-app/staticArticle/staticArticleDetail.html",
                                controller: "StaticArticleDetailController",
                                resolve: {
                                    staticArticle: [
                                        "staticArticleService", "parserService", function (staticArticleService, parserService) {
                                            return staticArticleService.getStaticArticle(x.id)
                                                .then(function (a) {
                                                    parserService.postProcessHtml(a);
                                                    return a;
                                                });
                                        }
                                    ]
                                }
                            }).state("app.staticArticles_" + x.id + ".edit",
                                {
                                    disableNavigation: true,
                                    url: "/edit",
                                    controller: "StaticArticleEditController",
                                    templateUrl: "/ClientApp/src/legacy-app/staticArticle/staticArticleEdit.html",
                                    resolve: {
                                        staticArticleId: function () {
                                            return x.id;
                                        }
                                    }
                                });
                    }
                });

        if (scope.currentScope.network.settings.appLinkAndroid || scope.currentScope.network.settings.appLinkITunes) {
            $stateProvider
                .state("app.appStore",
                    {
                        url: "app",
                        controller: "AppStoreController",
                        templateUrl: "/ClientApp/src/legacy-app/appStore/appStore.html"
                    });
        }

    } else {
        $stateProvider
            .state("app",
                {
                    url: "/",
                    abstract: true,
                    template: "<div ui-view></div>"
                });
    }

    if (navigator.userAgent && navigator.userAgent.indexOf("Merkurist_IAB") !== -1) {
        $stateProvider.state("clickNotification",
            {
                url: "/click/notification/{id}"
            })
            .state("clickSpecial",
                {
                    url: "/click/special/{guid}/{id}"
                })
            .state("clickPremiumBanner",
                {
                    url: "/click/premiumBanner/{guid}/{pin}"
                })
            .state("clickSuperBanner",
                {
                    url: "/click/superBanner/{guid}/{pin}"
                })
            .state("clickBanner",
                {
                    url: "/click/banner/{guid}/{pin}"
                })
            .state("clickSurveyBanner",
                {
                    url: "/click/surveyBanner/{guid}/{pin}"
                })
            .state("app.untrackedNotification",
                {
                    url: "/untracked/{untrackedUri}"
                })

            .state("app.documentDownload",
                {
                    url: "{route:pdf|document}/{id}"
                })
            .state("app.fileDownload",
                {
                    url: "file/{id}"
                })
            .state("app.offline",
                {
                    url: "appOffline",
                    templateUrl: "/ClientApp/src/legacy-app/content/appOffline.html"
                });

        if (!scope.currentChapter.name)
            $stateProvider.state("home",
                {
                    url: "/", //TODO pending to evaluate with more networks
                    controller: "AppLandingController",
                    templateUrl: "/ClientApp/src/legacy-app/landing/appLanding.html"
                });
    } else if (!scope.currentChapter.name) {
        $stateProvider
            .state("home",
                {
                    url: "/",
                    controller: "LandingController",
                    templateUrl: "/ClientApp/src/legacy-app/landing/landing.html"
                });
    }

    $urlRouterProvider.otherwise("/");


}]);

app.run(["$rootScope", "clickService", "profileService", "$location", "$timeout", "$state", "scopeService", "redirectService", "$window", function ($rootScope, clickService, profileService, $location, $timeout, $state, scopeService, redirectService, $window) {
    var allowedStates = ["app.closedChapter", "app.loginSaml2",
        "app.register", "app.registrationcomplete", "app.requestPassword", "app.passwordResetComplete",
        "app.requestPasswordComplete", "app.unsubscribeNewsletter", "app.main-login", "app.imprint",
        "app.privacyPolicy", "app.accessibility", "app.tos", "app.companyNews", "app.ikUpLanding", "app.documentDownload", "app.untrackedNotification",
        "app.offline", "app.fileDownload", "app.appStore", "app.optOut"
    ];

    var redirectTo = redirectService.redirectNotificationUrl;
    $rootScope.$on("$stateChangeSuccess", function (event, toState, toParams) {
        $timeout(function () {
            if (toState.name == "app.main-news") {
                return;
            }
            if ($rootScope.scope.network.settings.configurations.apicodoTranslationSystemConfiguration?.MultilanguagueFeatureEnabled === true) {

                var code = $rootScope.scope.network.settings.languagePack.split("-")[0];

                if ($rootScope.scope.profile.activeUserLanguage?.vendorLanguageCode != null && code != $rootScope.scope.profile.activeUserLanguage?.vendorLanguageCode) {
                    code = $rootScope.scope.profile.activeUserLanguage?.vendorLanguageCode;
                    moment.locale(code);
                    $rootScope.$broadcast('apicodo.translate', $rootScope.scope.profile.activeUserLanguage.vendorLanguageCode);
                }

            }
        })



    })
    $rootScope.$on("$stateChangeStart",
        function (event, toState, toParams) {
            if (scope.network.landingSwitch && toState.name !== "app.ikUpLanding" && toState.name !== "app.offline") {
                event.preventDefault();
                window.sessionStorage.setItem("returnUrl", $location.url());
                $state.go("app.ikUpLanding", {}, { location: "replace" });
            }
            profileService.getProfile().then(function (profile) {
                if (!profile.hasChapterAccess &&
                    allowedStates.indexOf(toState.name) === -1) {
                    window.sessionStorage.setItem("returnUrl", $location.url());
                    event.preventDefault();
                    $state.go("app.closedChapter", {}, { location: "replace" });
                } else if (profile.adminSetPassword && toState.name !== "app.requestPassword") {
                    window.sessionStorage.setItem("returnUrl", $location.url());
                    $state.go("app.requestPassword", {}, { location: "replace" });
                } else if (profile.hasChapterAccess) {
                    var returnUrl = window.sessionStorage.getItem("returnUrl");
                    if (returnUrl) {
                        event.preventDefault();
                        window.sessionStorage.removeItem("returnUrl");

                        $location.url(returnUrl);
                    }
                }
            });
            switch (toState.name) {
                case "app.main-snips":
                    var showSnipSlide = $rootScope.showSnipSlide;
                    if (!showSnipSlide) {
                        $state.go("app.main-news", {}, { location: "replace" });
                        event.preventDefault();
                    }
                    break;
                case "clickPremiumBanner":
                    clickService.clickPremium(toParams.guid, toParams.pin).then(function (result) {
                        redirectTo(result.uri);
                    });
                    event.preventDefault();
                    break;
                case "clickSuperBanner":
                    clickService.clickSuper(toParams.guid, toParams.pin).then(function (result) {
                        redirectTo(result.uri);
                    });
                    event.preventDefault();
                    break;
                case "clickBanner":
                    console.log("clickBanner toParams", toParams);
                    clickService.clickBanner(toParams.guid, toParams.pin).then(function (result) {
                        console.log("clickBanner result from api", result);
                        redirectTo(result.uri);
                    });
                    event.preventDefault();
                    break;
                case "clickSurveyBanner":
                    clickService.clickSurveyBanner(toParams.guid, toParams.pin).then(function (result) {
                        redirectTo(result.uri);
                    });
                    event.preventDefault();
                    break;
                case "clickSpecial":
                    clickService.clickSpecial(toParams.guid, toParams.id).then(function (result) {
                        redirectTo(result.uri);
                    });
                    event.preventDefault();
                    break;
                case "clickNotification":
                    clickService.clickNotification(toParams.id).then(function (result) {
                        redirectTo(result.uri);
                    });
                    event.preventDefault();
                    break;
                case "app.untrackedNotification":
                    redirectTo(toParams.untrackedUri);
                    event.preventDefault();
                    break;
                case "app.documentDownload":
                    clickService.clickDocument(toParams.id).then(downloadFile);
                    event.preventDefault();
                    break;
                case "app.fileDownload":
                    clickService.clickFile(toParams.id).then(downloadFile);
                    event.preventDefault();
                    break;
            }

            function downloadFile(result) {
                if (cordova.platformId === "android" && result.isPdf) {
                    cordova.InAppBrowser.open("/Content/pdfview/web/?file=" + result.uri,
                        "_blank",
                        "location=yes,hidenavigationbuttons=yes,hideurlbar=yes,closebuttoncaption=" + scope.currentScope.network.getResourceOrKeyName('web_appCordova_closebuttoncaption'));
                } else {
                    cordova.InAppBrowser.open(result.uri, "_system", "location=yes,closebuttoncaption=" + scope.currentScope.network.getResourceOrKeyName('web_appCordova_closebuttoncaption'));
                };
            }
        });
}]);

app.run([
    "$rootScope", "$window", "$location", "$uibModalStack", "$timeout", "$state", "metaService", "profileService",
    function ($rootScope, $window, $location, $uibModalStack, $timeout, $state, metaService, profileService) {
        // Expose profile to legacy parts
        $rootScope.profile = profileService.profile;
        window.scope = window.scope || {};
        window.scope.profile = profileService.profile;

        // Helper: check dynamically if the current network uses the redesign engine
        function isRedesign() {
            var s = $rootScope.scope || $window.scope;
            return !!(s && s.currentScope && s.currentScope.network &&
                s.currentScope.network.settings &&
                s.currentScope.network.settings.configurations &&
                s.currentScope.network.settings.configurations.contentRenderEngine === "Redesign2024");
        }
        $rootScope.scope.currentScope.network.settings.configurations.contentRenderEngine === "Redesign2024"
        // Disable browser-driven scroll restoration (only when redesign is active)
        if (isRedesign() && "scrollRestoration" in $window.history) {
            $window.history.scrollRestoration = "manual";
        }

        // --- SCROLL MEMORY for specific states ---
        // States that should restore to their last scroll position
        var MEMORY_STATES = {
            "app.main-news": true,
            "app.eventCalendar": true,
            "app.rubrics": true,
            "app.main-snips": true
        };


        var scrollMemory = Object.create(null);
        function getScrollY() {
            return $window.pageYOffset || document.documentElement.scrollTop || 0;
        }
        // Freeze/unfreeze machinery
        var isFrozen = false;
        var frozenY = 0;

        // Fix the current page visually at its position (prevents visible jumping during navigation)
        function freezeBody() {
            if (isFrozen) return;
            frozenY = $window.pageYOffset || document.documentElement.scrollTop || 0;
            document.body.classList.add("nav-freeze");    // requires CSS below
            document.body.style.top = (-frozenY) + "px";  // counteract fixed positioning
            isFrozen = true;
        }

        // Release the page and set the final scroll position
        function unfreezeBodyTo(targetY) {
            if (!isFrozen) return;

            var y = Math.max(0, targetY || 0);

            // Pre-position while still fixed: move the body to the exact target
            // This makes the visual position correct even before we unfix the body.
            document.body.style.top = (-y) + 'px';

            // Now release on the next frame and hard-set scroll (twice for iOS reliability)
            requestAnimationFrame(function () {
                document.body.classList.remove('nav-freeze');
                document.body.style.top = '';
                document.documentElement.style.scrollBehavior = 'auto';
                // Ensure the viewport scroll is exactly at y (iOS may need two frames)
                $window.scrollTo(0, y);
                requestAnimationFrame(function () { $window.scrollTo(0, y); });
            });

            isFrozen = false;
        }

        // Before route change:
        // 1) Close an open modal and cancel navigation (avoid freezing in that case).
        // 2) If redesign is active and target is NOT the main news list, freeze the body.
        $rootScope.$on("$stateChangeStart", function (event, toState, toParams, fromState, fromParams) {
            var topModal = $uibModalStack.getTop();
            if (topModal) {
                $uibModalStack.dismiss(topModal.key);
                event.preventDefault();
                // return; // do not freeze if navigation was cancelled
            }
            if (isRedesign() && toState) {
                if (fromState && MEMORY_STATES[fromState.name]) {
                    scrollMemory[fromState.name] = getScrollY();
                }
                freezeBody();
            }
        });

        // Strip trailing "?top" if present (legacy clean-up)
        $rootScope.$on("$locationChangeStart", function (event, next) {
            if (next.endsWith("?top")) {
                event.preventDefault();
                $location.url(next.replace(/^(?:\/\/|[^\/]+)*\//, "").replace(/\?top$/g, ""));
            }
        });

        // After route change:
        // If redesign: unfreeze and start at top for ALL pages except the main news list.
        // For main news and eventcalendar, unfreeze and restore the previous scroll position.
        $rootScope.$on("$stateChangeSuccess", function (event, toState, toParams, fromState, fromParams) {
            if (isRedesign()) {
                var targetY = 0;
                if (toState && MEMORY_STATES[toState.name]) {
                    targetY = scrollMemory[toState.name] || 0;
                }
                unfreezeBodyTo(targetY);
            } else if (isFrozen) {
                // Fallback: restore current Y
                unfreezeBodyTo(getScrollY());
            }
            else if (!isRedesign() && !$state.includes("app.main-news")) {
                $window.scrollTo(0, 0);
            }

            // --- existing integration hooks (unchanged) ---
            document.dispatchEvent(new CustomEvent("angularCustomEvent", {
                detail: { source: "stateChangeSuccess", toState: toState }
            }));

            function clone(obj) {
                if (null === obj || "object" !== typeof obj) return obj;
                var copy = obj.constructor();
                for (var attr in obj) {
                    if (obj.hasOwnProperty(attr) && typeof obj[attr] !== "object") copy[attr] = obj[attr];
                }
                return copy;
            }
            if (fromState && fromState !== toState && !toParams.back) {
                toParams.back = fromState;
                toParams.backParams = fromParams;
            } else if (fromState.name === toState.name && fromParams.back) {
                toParams.back = fromParams.back;
                toParams.backParams = fromParams.backParams;
            }

            if (fromParams && fromParams.backParams) {
                if (JSON.stringify(clone(toParams)) === JSON.stringify(clone(fromParams.backParams))) {
                    toParams.back = fromParams.backParams.back;
                    toParams.backParams = fromParams.backParams.backParams;
                }
            }
            metaService.stateChanged(toState);
        });

        // On errors/not found, unfreeze and restore previous position
        $rootScope.$on("$stateChangeError", function () { if (isFrozen) unfreezeBody(false); });
        $rootScope.$on("$stateNotFound", function () { if (isFrozen) unfreezeBody(false); });

        // Legacy analytics
        $rootScope.$on("$locationChangeSuccess", function (ev, newPath, oldPath) {
            if (newPath !== oldPath) {
                // TODO: check if push is necessary here
                Oculus.push();
                Oculus.navigate(oldPath);
            }
        });
    }
]);

app.directive("resolve", ["$controller", function ($controller) {
    return {
        scope: true,
        link: function (scope, elem, attrs) {
            var resolve = scope.$eval(attrs.resolve);
            angular.extend(resolve, { $scope: scope });
            $controller(attrs.resolveController, resolve);
        }
    };
}]);

(function () {
    objectFitImages();
})();
