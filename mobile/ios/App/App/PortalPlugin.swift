import Capacitor
import LocalAuthentication
import Security
import UIKit
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
        CAPPluginMethod(name: "saveUnlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readUnlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearUnlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveVaultKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readVaultKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearVaultKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    private let keychainService = "fr.travelba.client"
    private let unlockAccount = "device-unlock"
    private let vaultAccount = "offline-key"

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

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.resolve(["ok": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { ok in
                call.resolve(["ok": ok])
            }
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

    @objc func saveUnlock(_ call: CAPPluginCall) {
        let token = call.getString("token") ?? ""
        guard token.range(of: "^tu_[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
            call.resolve(["ok": false])
            return
        }
        DispatchQueue.main.async {
            call.resolve(["ok": self.writeSecret(account: self.unlockAccount, value: token, biometric: true)])
        }
    }

    @objc func readUnlock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let token = self.readSecret(account: self.unlockAccount), token.hasPrefix("tu_") {
                call.resolve(["ok": true, "token": token])
            } else {
                call.resolve(["ok": false])
            }
        }
    }

    @objc func clearUnlock(_ call: CAPPluginCall) {
        deleteSecret(account: unlockAccount)
        call.resolve(["ok": true])
    }

    @objc func saveVaultKey(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        guard key.count >= 16, key.count < 200 else {
            call.resolve(["ok": false])
            return
        }
        call.resolve(["ok": writeSecret(account: vaultAccount, value: key, biometric: false)])
    }

    @objc func readVaultKey(_ call: CAPPluginCall) {
        if let key = readSecret(account: vaultAccount) {
            call.resolve(["key": key])
        } else {
            call.resolve([:])
        }
    }

    @objc func clearVaultKey(_ call: CAPPluginCall) {
        deleteSecret(account: vaultAccount)
        call.resolve(["ok": true])
    }

    private func accessControl(biometric: Bool) -> SecAccessControl? {
        var error: Unmanaged<CFError>?
        let flags: SecAccessControlCreateFlags = biometric ? .biometryCurrentSet : []
        return SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, flags, &error)
    }

    private func writeSecret(account: String, value: String, biometric: Bool) -> Bool {
        deleteSecret(account: account)
        guard let control = accessControl(biometric: biometric), let data = value.data(using: .utf8) else { return false }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessControl as String: control,
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    private func readSecret(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func deleteSecret(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
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
