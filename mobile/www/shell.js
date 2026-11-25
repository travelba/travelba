/* Même décision que chooseShellTarget dans lib/crm/client-shell.ts. */
(function () {
  var HOME = "https://travelba.fr/mon-compte";
  var BLOCKED = "https://travelba.fr/connexion?error=application";
  var mode = document.body.getAttribute("data-mode") || "boot";

  function clip(value, max) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function paint(shell) {
    var hello = document.getElementById("hello");
    var stays = document.getElementById("stays");
    if (!stays) return;
    var list = shell && Array.isArray(shell.stays) ? shell.stays : [];
    if (shell && shell.greeting && hello) hello.textContent = "Bonjour " + clip(shell.greeting, 40);
    if (!list.length && shell && shell.title) {
      list = [{ title: shell.title, when: shell.when || "", place: "", upcoming: true }];
    }
    var shown = list.filter(function (stay) { return stay && stay.upcoming !== false; }).slice(0, 4);
    if (!shown.length) shown = list.slice(0, 4);
    if (!shown.length) {
      stays.innerHTML = '<div class="skel"></div>';
      return;
    }
    stays.innerHTML = shown.map(function (stay) {
      var when = clip(stay.when, 80);
      var title = clip(stay.title, 140) || "Séjour";
      var place = clip(stay.place, 140);
      return '<article class="card"><div class="body">' +
        (when ? '<p class="when"></p>' : "") +
        '<h2></h2>' +
        (place ? '<p class="place"></p>' : "") +
        "</div></article>";
    }).join("");
    var nodes = stays.querySelectorAll(".card");
    shown.forEach(function (stay, index) {
      var node = nodes[index];
      if (!node) return;
      var whenNode = node.querySelector(".when");
      var titleNode = node.querySelector("h2");
      var placeNode = node.querySelector(".place");
      if (whenNode) whenNode.textContent = clip(stay.when, 80);
      if (titleNode) titleNode.textContent = clip(stay.title, 140) || "Séjour";
      if (placeNode) placeNode.textContent = clip(stay.place, 140);
    });
    stays.removeAttribute("aria-busy");
  }

  function plugin(name) {
    var cap = window.Capacitor;
    return cap && cap.Plugins ? cap.Plugins[name] : null;
  }

  function readCache() {
    var prefs = plugin("Preferences");
    var read = prefs && prefs.get;
    if (!read && window.Capacitor && typeof window.Capacitor.nativePromise === "function") {
      read = function (options) { return window.Capacitor.nativePromise("Preferences", "get", options); };
    }
    if (!read) return Promise.resolve(null);
    return Promise.resolve(read({ key: "tba.espace" })).then(function (res) {
      if (res && res.value) return JSON.parse(res.value);
      return Promise.resolve(read({ key: "tba.trip" })).then(function (trip) {
        if (!trip || !trip.value) return null;
        return JSON.parse(trip.value);
      });
    }).catch(function () { return null; });
  }

  function portalPath(url) {
    try {
      var parsed = new URL(url, HOME);
    } catch (error) {
      return "home";
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "home";
    var host = parsed.hostname.toLowerCase();
    if (host !== "travelba.fr" && host !== "www.travelba.fr") return "home";
    var path = parsed.pathname || "/";
    if (path === "/admin" || path.indexOf("/admin/") === 0 || path === "/api/admin" || path.indexOf("/api/admin/") === 0 || path === "/api/mcp" || path.indexOf("/api/mcp/") === 0) {
      return "blocked";
    }
    if (path === "/connexion" || path.indexOf("/connexion/") === 0 || path === "/mon-compte" || path.indexOf("/mon-compte/") === 0 || path === "/auth" || path.indexOf("/auth/") === 0 || path === "/e" || path.indexOf("/e/") === 0 || path === "/acces" || path.indexOf("/acces/") === 0) {
      parsed.protocol = "https:";
      parsed.hostname = "travelba.fr";
      return parsed.toString();
    }
    return "home";
  }

  function targetFrom(launchUrl, pushUrl) {
    if (pushUrl && pushUrl.charAt(0) === "/" && pushUrl.indexOf("//") !== 0 && pushUrl.indexOf("\\") < 0 && pushUrl.indexOf("..") < 0) {
      var path = pushUrl.split("?")[0] || "";
      if (path === "/mon-compte" || path.indexOf("/mon-compte/") === 0) return HOME.replace(/\/mon-compte$/, "") + pushUrl.slice(0, 300);
    }
    if (!launchUrl) return HOME;
    var decision = portalPath(launchUrl);
    if (decision === "blocked") return BLOCKED;
    if (decision === "home") return HOME;
    return decision;
  }

  function hideSplash() {
    var splash = plugin("SplashScreen");
    if (splash && splash.hide) {
      try {
        var hidden = splash.hide();
        if (hidden && hidden.catch) hidden.catch(function () {});
      } catch (error) {}
    }
  }

  function askNotifications() {
    var push = plugin("PushNotifications");
    if (!push || !push.checkPermissions || !push.requestPermissions) return;
    Promise.resolve(push.checkPermissions()).then(function (current) {
      var receive = current && current.receive;
      if (receive !== "prompt" && receive !== "prompt-with-rationale") return null;
      return push.requestPermissions();
    }).catch(function () {});
  }

  function boot() {
    hideSplash();
    askNotifications();
    readCache().then(paint);
    var retry = document.getElementById("retry");
    if (retry) {
      retry.addEventListener("click", function () {
        if (mode === "offline") location.replace(HOME);
        else location.reload();
      });
    }
    if (mode !== "boot") {
      var note = document.getElementById("offline");
      if (note) note.hidden = false;
      if (retry) retry.hidden = false;
      return;
    }
    if (!navigator.onLine) {
      var offline = document.getElementById("offline");
      if (offline) offline.hidden = false;
      if (retry) retry.hidden = false;
      window.addEventListener("online", function () { location.replace(HOME); });
      return;
    }
    var launch = "";
    var app = plugin("App");
    var launchPromise = app && app.getLaunchUrl
      ? Promise.race([
          Promise.resolve(app.getLaunchUrl()).catch(function () { return null; }),
          new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 400); }),
        ])
      : Promise.resolve(null);
    var pushPromise = new Promise(function (resolve) {
      var timer = setTimeout(function () { resolve(""); }, 120);
      var push = plugin("PushNotifications");
      if (!push || !push.addListener) return;
      try {
        push.addListener("pushNotificationActionPerformed", function (action) {
          clearTimeout(timer);
          var url = action && action.notification && action.notification.data && action.notification.data.url;
          resolve(typeof url === "string" ? url : "");
        });
      } catch (error) {
        clearTimeout(timer);
        resolve("");
      }
    });
    Promise.all([launchPromise, pushPromise]).then(function (result) {
      var opened = result[0];
      if (opened && opened.url) launch = opened.url;
      location.replace(targetFrom(launch, result[1]));
    }).catch(function () {
      location.replace(HOME);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
