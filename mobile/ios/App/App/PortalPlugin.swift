import Capacitor
import LocalAuthentication
import WebKit

@objc(PortalPlugin)
public class PortalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PortalPlugin"
    public let jsName = "Portal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "canUnlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "armLiveActivities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncWidgets", returnType: CAPPluginReturnPromise),
    ]

    @objc func armLiveActivities(_ call: CAPPluginCall) {
        WidgetBridge.arm { [weak self] event in
            self?.notifyListeners("liveActivityToken", data: event)
        }
        call.resolve(["ok": true])
    }

    @objc func syncWidgets(_ call: CAPPluginCall) {
        guard let json = call.getString("snapshot") else {
            call.reject("Résumé indisponible.")
            return
        }
        let ok = WidgetBridge.sync(json: json) { [weak self] event in
            self?.notifyListeners("liveActivityToken", data: event)
        }
        if ok {
            call.resolve(["ok": true])
        } else {
            call.reject("Résumé illisible.")
        }
    }

    @objc func canUnlock(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        call.resolve(["available": available])
    }

    @objc func unlock(_ call: CAPPluginCall) {
        let context = LAContext()
        context.localizedFallbackTitle = ""
        context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Déverrouillez TBA pour retrouver votre séjour."
        ) { success, _ in
            call.resolve(["ok": success])
        }
    }

    @objc override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url, let host = url.host?.lowercased() else { return nil }
        guard host == "travelba.fr" || host == "www.travelba.fr" else { return nil }
        let path = url.path
        let blocked = path == "/admin" || path.hasPrefix("/admin/")
            || path == "/api/admin" || path.hasPrefix("/api/admin/")
            || path == "/api/mcp" || path.hasPrefix("/api/mcp/")
        guard blocked else { return nil }
        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.bridge?.webView,
                  let fallback = URL(string: "https://travelba.fr/connexion?error=application") else { return }
            webView.load(URLRequest(url: fallback))
        }
        return true
    }
}
