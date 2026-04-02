var app = {
    config: {
        url: "https://nachrichtenbu.de",
        ui: {
            loader: "tryLoader",
            button: "tryButton",
            noConn: "noConnection"
        }
    },

    pendingPushUrl: null,
    isDeviceReady: false,

    initialize: function() {
        console.log("[Shell] initialize", {
            href: window.location.href,
            userAgent: navigator.userAgent
        });

        document.addEventListener("deviceready", this.onDeviceReady.bind(this), false);
        document.addEventListener("offline", this.onOffline.bind(this), false);
    },

    onDeviceReady: function() {
        this.isDeviceReady = true;

        console.log("[Shell] deviceready", {
            hasCordova: !!window.cordova,
            hasCordovaPlugin: !!(window.cordova && cordova.plugin),
            hasCordovaPlugins: !!(window.cordova && cordova.plugins),
            hasAdvancedHttpGlobal: !!(window.cordova && cordova.plugin && cordova.plugin.http),
            hasFcm: !!window.FCMPlugin,
            hasInitialPushApi: !!(window.FCMPlugin && typeof FCMPlugin.getInitialPushPayload === "function")
        });

        document.addEventListener("online", this.checkServerStatus.bind(this), false);
        document.addEventListener("resume", this.checkServerStatus.bind(this), false);

        if (window.universalLinks && typeof universalLinks.subscribe === "function") {
            universalLinks.subscribe("launchedAppFromLink", this.didLaunchAppFromLink.bind(this));
        }

        setTimeout(this.statusBarDarkMode.bind(this), 500);
        this.loadInitialPushPayloadAndContinue();
    },

    normalizeNotificationData: function(data) {
        if (!data) {
            return null;
        }

        if (typeof data === "string") {
            try {
                data = JSON.parse(data);
            } catch (error) {
                console.log("[Shell] Failed to parse push payload", error);
                return null;
            }
        }

        return data;
    },

    loadInitialPushPayloadAndContinue: function() {
        var self = this;

        if (!window.FCMPlugin || typeof FCMPlugin.getInitialPushPayload !== "function") {
            console.log("[Shell] Initial push payload API not available");
            this.checkServerStatus();
            return;
        }

        FCMPlugin.getInitialPushPayload(
            function(data) {
                self.setPendingNavigationFromPush(data, "initial");
                self.checkServerStatus();
            },
            function(error) {
                console.log("[Shell] Failed to load initial push payload", error);
                self.checkServerStatus();
            }
        );
    },

    setPendingNavigationFromPush: function(data, source) {
        data = this.normalizeNotificationData(data);

        if (!data) {
            console.log("[Shell] No initial push payload found");
            return;
        }

        console.log("[Shell] Initial push payload", {
            source: source,
            data: data
        });

        if (!data.wasTapped) {
            return;
        }

        var targetUrl = this.extractTargetUrlFromPushPayload(data);
        if (!targetUrl) {
            console.log("[Shell] No shell target resolved from push payload", data);
            return;
        }

        this.pendingPushUrl = targetUrl;
        console.log("[Shell] Pending push url set", {
            source: source,
            targetUrl: targetUrl
        });
    },

    normalizeTargetUrl: function(value) {
        if (typeof value !== "string" || value.length === 0) {
            return null;
        }

        try {
            var targetUrl = new URL(value, this.config.url);
            if (targetUrl.protocol === "http:" || targetUrl.protocol === "https:") {
                return targetUrl.toString();
            }
        } catch (error) {
            console.log("[Shell] Failed to normalize target url", {
                value: value,
                error: error
            });
        }

        return null;
    },

    extractTargetUrlFromPushPayload: function(data) {
        var directTargetUrl = this.normalizeTargetUrl(data.untrackedUri);
        if (!directTargetUrl) {
            return null;
        }

        try {
            var targetUrl = new URL(directTargetUrl);
            if (data.notificationId) {
                targetUrl.searchParams.set("notificationId", data.notificationId);
            }
            return targetUrl.toString();
        } catch (error) {
            console.log("[Shell] Failed to append notificationId to target url", {
                targetUrl: directTargetUrl,
                notificationId: data.notificationId,
                error: error
            });
        }

        return null;
    },

    statusBarDarkMode: function() {
        if (typeof StatusBar === "undefined") return;

        var isDarkMode = window.matchMedia("(prefers-color-scheme:dark)");

        if (isDarkMode.matches) {
            StatusBar.backgroundColorByHexString("#000");
        } else {
            StatusBar.backgroundColorByHexString("#fff");
        }

        if (!StatusBar.isVisible) {
            StatusBar.show();
        }
    },

    getAdvancedHttpClient: function() {
        if (window.cordova && cordova.plugin && cordova.plugin.http) {
            console.log("[Shell] Using advanced-http via cordova.plugin.http");
            return cordova.plugin.http;
        }

        try {
            var requiredClient = cordova.require("cordova-plugin-advanced-http.http");
            console.log("[Shell] Using advanced-http via cordova.require");
            return requiredClient;
        } catch (e) {
            console.log("[Shell] advanced-http not available", e);
            return null;
        }
    },

    buildTargetUrl: function() {
        if (this.pendingPushUrl) {
            return this.pendingPushUrl;
        }

        return new URL(this.config.url).toString();
    },

    checkServerStatus: function() {
        var self = this;
        var ui = this.config.ui;

        if (!this.isDeviceReady) {
            console.log("[Shell] checkServerStatus skipped before deviceready");
            return;
        }

        document.getElementById(ui.noConn).style.visibility = "hidden";
        document.getElementById(ui.button).style.visibility = "hidden";
        document.getElementById(ui.loader).style.visibility = "visible";

        var httpClient = this.getAdvancedHttpClient();

        if (httpClient) {
            console.log("[Shell] Checking server via native HTTP", this.config.url);

            httpClient.get(this.config.url, {}, {},
                function(response) {
                    console.log("[Shell] Native HTTP success", response);

                    if (response && response.status < 500) {
                        var target = self.buildTargetUrl();
                        console.log("[Shell] Navigating to", target);
                        window.location.replace(target);
                    } else {
                        self.showConnectionError("Server Error (500+): " + (response && response.status));
                    }
                },
                function(response) {
                    console.log("[Shell] Native HTTP error", response);

                    if (response && response.status && response.status > 0 && response.status < 500) {
                        var target = self.buildTargetUrl();
                        console.log("[Shell] Navigating to", target);
                        window.location.replace(target);
                    } else {
                        self.fetchFallbackNavigate();
                    }
                }
            );

            return;
        }

        this.fetchFallbackNavigate();
    },

    fetchFallbackNavigate: function() {
        var self = this;

        console.log("[Shell] Falling back to fetch", this.config.url);

        fetch(this.config.url, {
            method: "GET",
            mode: "no-cors",
            cache: "no-store"
        })
            .then(function() {
                var target = self.buildTargetUrl();
                console.log("[Shell] Fetch success, navigating to", target);
                window.location.replace(target);
            })
            .catch(function(error) {
                console.log("[Shell] Fetch failed", error);
                self.showConnectionError(error);
            });
    },

    showConnectionError: function(error) {
        var ui = this.config.ui;

        console.log("[Shell] Connection failed", error);

        setTimeout(function() {
            document.getElementById(ui.button).style.visibility = "visible";
            document.getElementById(ui.loader).style.visibility = "hidden";
            document.getElementById(ui.noConn).style.visibility = "visible";
        }, 3000);
    },

    receivedEvent: function(id) {
        var parentElement = document.getElementById(id);
        var listeningElement = parentElement.querySelector(".listening");
        var receivedElement = parentElement.querySelector(".received");

        listeningElement.setAttribute("style", "display:none;");
        receivedElement.setAttribute("style", "display:block;");
    },

    onOffline: function() {
        console.log("[Shell] offline");
        window.location.replace("offline.html");
        document.getElementById(this.config.ui.noConn).style.visibility = "hidden";
    },

    didLaunchAppFromLink: function(eventData) {
        console.log("[Shell] Universal link received", eventData);
        document.location.href = eventData.url;
    }
};

function tryAgain() {
    app.checkServerStatus();
}

app.initialize();
