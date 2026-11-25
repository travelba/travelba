import Capacitor
import EventKit
import EventKitUI
import UIKit
import WebKit

/// Écrit les étapes dans Calendrier. La webview ne sait pas ouvrir un fichier
/// `text/calendar` : elle affiche le texte, sans bouton pour revenir.
final class CalendarBridge: NSObject, EKEventEditViewDelegate {
    static let shared = CalendarBridge()

    private let memoryKey = "fr.travelba.client.calendar-uids"
    private var store: EKEventStore?
    private var busy = false
    private var sheetCall: CAPPluginCall?
    private var sheetUid = ""

    private func eventStore() -> EKEventStore {
        if let store { return store }
        let created = EKEventStore()
        store = created
        return created
    }

    func add(events rows: [[String: Any]], call: CAPPluginCall, presenter: UIViewController?) {
        DispatchQueue.main.async {
            if self.busy {
                call.resolve(self.payload(ok: true, added: 0, already: 0, cancelled: false, reason: "busy"))
                return
            }
            let drafts = self.drafts(from: rows)
            guard !drafts.isEmpty else {
                call.resolve(self.payload(ok: false, added: 0, already: 0, cancelled: false, reason: "empty"))
                return
            }
            self.busy = true
            self.authorize { granted in
                guard granted else {
                    self.busy = false
                    call.resolve(self.payload(ok: false, added: 0, already: 0, cancelled: false, reason: "refused"))
                    return
                }
                self.write(drafts, call: call, presenter: presenter, announce: false)
            }
        }
    }

    /// Filet : un lien .ics qui part quand même dans la webview est annulé, puis écrit ici.
    func add(url: URL, presenter: UIViewController?, webView: WKWebView?) {
        DispatchQueue.main.async {
            guard !self.busy, let presenter, let webView else { return }
            self.busy = true
            webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
                var request = URLRequest(url: url)
                request.httpShouldHandleCookies = false
                let fields = HTTPCookie.requestHeaderFields(with: cookies)
                for (key, value) in fields {
                    request.setValue(value, forHTTPHeaderField: key)
                }
                request.setValue("application/json", forHTTPHeaderField: "Accept")
                URLSession.shared.dataTask(with: request) { data, response, _ in
                    DispatchQueue.main.async {
                        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                        let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                        if status == 400 {
                            self.busy = false
                            self.showNotice(presenter, "Aucune date à ajouter à l’agenda.", settings: false)
                            return
                        }
                        let drafts = self.drafts(fromBody: body)
                        guard status == 200, !drafts.isEmpty else {
                            self.busy = false
                            self.showNotice(presenter, "Impossible d’ajouter au calendrier.", settings: false)
                            return
                        }
                        self.authorize { granted in
                            guard granted else {
                                self.busy = false
                                self.showNotice(presenter, "L’accès au calendrier est refusé.", settings: true)
                                return
                            }
                            self.write(drafts, call: nil, presenter: presenter, announce: true)
                        }
                    }
                }.resume()
            }
        }
    }

    func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        let savedId = controller.event?.eventIdentifier
        controller.dismiss(animated: true) {
            let call = self.sheetCall
            let uid = self.sheetUid
            self.sheetCall = nil
            self.sheetUid = ""
            self.busy = false
            if action == .saved {
                if !uid.isEmpty, let savedId, !savedId.isEmpty {
                    self.remember(uid, savedId)
                }
                call?.resolve(self.payload(ok: true, added: 1, already: 0, cancelled: false, reason: ""))
            } else if action == .canceled {
                call?.resolve(self.payload(ok: true, added: 0, already: 0, cancelled: true, reason: ""))
            } else {
                call?.resolve(self.payload(ok: true, added: 0, already: 0, cancelled: false, reason: ""))
            }
        }
    }

    private func authorize(_ done: @escaping (Bool) -> Void) {
        let store = eventStore()
        if #available(iOS 17.0, *) {
            store.requestWriteOnlyAccessToEvents { granted, _ in
                DispatchQueue.main.async { done(granted) }
            }
        } else {
            store.requestAccess(to: .event) { granted, _ in
                DispatchQueue.main.async { done(granted) }
            }
        }
    }

    private func write(_ drafts: [CalendarDraft], call: CAPPluginCall?, presenter: UIViewController?, announce: Bool) {
        let store = eventStore()
        guard let calendar = store.defaultCalendarForNewEvents else {
            busy = false
            if let call {
                call.resolve(payload(ok: false, added: 0, already: 0, cancelled: false, reason: "unavailable"))
            } else if let presenter {
                showNotice(presenter, "Aucun calendrier n’est disponible sur cet iPhone.", settings: false)
            }
            return
        }
        // Un seul événement (prochain vol de l’accueil) : feuille système. nativeCalendarSurface.
        let fresh = drafts.count == 1 && !alreadySaved(drafts[0], store: store)
        if fresh, let only = drafts.first, let presenter, let event = makeEvent(only, calendar: calendar, store: store) {
            let visible = presenter.viewIfLoaded?.window != nil || presenter.presentedViewController != nil
            if visible {
                let editor = EKEventEditViewController()
                editor.eventStore = store
                editor.event = event
                editor.editViewDelegate = self
                sheetCall = call
                sheetUid = only.uid
                top(presenter).present(editor, animated: true)
                return
            }
        }
        var added = 0
        var already = 0
        for draft in drafts {
            if let id = memory()[draft.uid], store.event(withIdentifier: id) != nil {
                already += 1
                continue
            }
            guard let event = makeEvent(draft, calendar: calendar, store: store) else { continue }
            do {
                try store.save(event, span: .thisEvent, commit: true)
                if let id = event.eventIdentifier, !id.isEmpty {
                    remember(draft.uid, id)
                }
                added += 1
            } catch {
                continue
            }
        }
        busy = false
        if let call {
            let reason = added == 0 && already == 0 ? "error" : ""
            call.resolve(payload(ok: reason.isEmpty, added: added, already: already, cancelled: false, reason: reason))
        }
        guard announce, let presenter else { return }
        if added == 1 {
            showNotice(presenter, "Ajouté à votre calendrier.", settings: false)
        } else if added > 1 {
            showNotice(presenter, "\(added) événements ajoutés à votre calendrier.", settings: false)
        } else if already > 0 {
            showNotice(presenter, "Déjà dans votre calendrier.", settings: false)
        } else {
            showNotice(presenter, "Impossible d’ajouter au calendrier.", settings: false)
        }
    }

    private func makeEvent(_ draft: CalendarDraft, calendar: EKCalendar, store: EKEventStore) -> EKEvent? {
        let event = EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = draft.title
        if !draft.notes.isEmpty { event.notes = draft.notes }
        if !draft.location.isEmpty { event.location = draft.location }
        if draft.allDay {
            let zone = TimeZone.current
            guard let start = midnight(draft.startDate, zone), let end = midnight(draft.endDate, zone), end > start else {
                return nil
            }
            event.isAllDay = true
            event.timeZone = zone
            event.startDate = start
            event.endDate = end
            return event
        }
        let startZone = TimeZone(identifier: draft.timeZone) ?? TimeZone.current
        let endZone = TimeZone(identifier: draft.endTimeZone) ?? startZone
        guard let start = civil(draft.start, startZone) else { return nil }
        event.timeZone = TimeZone(identifier: draft.timeZone) ?? TimeZone.current
        event.startDate = start
        if let end = civil(draft.end, endZone), end > start {
            event.endDate = end
        } else {
            event.endDate = start.addingTimeInterval(3600)
        }
        return event
    }

    private func drafts(from rows: [[String: Any]]) -> [CalendarDraft] {
        var events: [CalendarDraft] = []
        for row in rows {
            if events.count >= 40 { break }
            if let draft = CalendarDraft(row) { events.append(draft) }
        }
        return events
    }

    private func drafts(fromBody body: String) -> [CalendarDraft] {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("{"),
           let data = trimmed.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let rows = json["events"] as? [[String: Any]] {
            return drafts(from: rows)
        }
        if trimmed.contains("BEGIN:VCALENDAR") {
            return drafts(from: IcsCalendarReader.events(in: body))
        }
        return []
    }

    private func alreadySaved(_ draft: CalendarDraft, store: EKEventStore) -> Bool {
        guard let id = memory()[draft.uid], !id.isEmpty else { return false }
        return store.event(withIdentifier: id) != nil
    }

    private func memory() -> [String: String] {
        UserDefaults.standard.dictionary(forKey: memoryKey) as? [String: String] ?? [:]
    }

    private func remember(_ uid: String, _ identifier: String) {
        var map = memory()
        map[uid] = identifier
        if map.count > 400 {
            for key in Array(map.keys.prefix(map.count - 400)) {
                map.removeValue(forKey: key)
            }
        }
        UserDefaults.standard.set(map, forKey: memoryKey)
    }

    private func payload(ok: Bool, added: Int, already: Int, cancelled: Bool, reason: String) -> [String: Any] {
        var body: [String: Any] = ["ok": ok, "added": added, "already": already, "cancelled": cancelled]
        if !reason.isEmpty { body["reason"] = reason }
        return body
    }

    private func top(_ presenter: UIViewController) -> UIViewController {
        var current = presenter
        while let next = current.presentedViewController { current = next }
        return current
    }

    private func showNotice(_ presenter: UIViewController, _ message: String, settings: Bool) {
        let alert = UIAlertController(title: "Calendrier", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        if settings {
            alert.addAction(UIAlertAction(title: "Réglages", style: .default) { _ in
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            })
        }
        top(presenter).present(alert, animated: true)
    }

    private func midnight(_ day: String, _ zone: TimeZone) -> Date? {
        let parts = day.split(separator: "-")
        guard parts.count == 3, let year = Int(parts[0]), let month = Int(parts[1]), let date = Int(parts[2]) else {
            return nil
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar.date(from: DateComponents(timeZone: zone, year: year, month: month, day: date))
    }

    private func civil(_ value: String, _ zone: TimeZone) -> Date? {
        guard value.count >= 19 else { return nil }
        let day = String(value.prefix(10))
        let clock = value.dropFirst(11).prefix(8).split(separator: ":")
        guard clock.count == 3, let hour = Int(clock[0]), let minute = Int(clock[1]), let second = Int(clock[2]) else {
            return nil
        }
        let parts = day.split(separator: "-")
        guard parts.count == 3, let year = Int(parts[0]), let month = Int(parts[1]), let date = Int(parts[2]) else {
            return nil
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar.date(from: DateComponents(
            timeZone: zone,
            year: year,
            month: month,
            day: date,
            hour: hour,
            minute: minute,
            second: second
        ))
    }
}

private struct CalendarDraft {
    var uid: String
    var title: String
    var notes: String
    var location: String
    var allDay: Bool
    var startDate: String
    var endDate: String
    var start: String
    var end: String
    var timeZone: String
    var endTimeZone: String

    init?(_ row: [String: Any]) {
        let title = CalendarDraft.clip(row["title"], 180)
        guard let rawUid = row["uid"] as? String, !rawUid.contains("\n"), !rawUid.contains("\r") else { return nil }
        let uid = CalendarDraft.clip(rawUid, 180)
        guard !title.isEmpty, !uid.isEmpty else { return nil }
        let allDay = CalendarDraft.flag(row["allDay"])
        let startDate = CalendarDraft.day(row["startDate"])
        let endDate = CalendarDraft.day(row["endDate"])
        let start = CalendarDraft.civil(row["start"])
        let end = CalendarDraft.civil(row["end"])
        let timeZone = CalendarDraft.zone(row["timeZone"])
        let endTimeZone = CalendarDraft.zone(row["endTimeZone"])
        if allDay {
            guard !startDate.isEmpty, !endDate.isEmpty, endDate > startDate else { return nil }
        } else if start.isEmpty {
            return nil
        }
        self.uid = uid
        self.title = title
        self.notes = CalendarDraft.clip(row["notes"], 2000)
        self.location = CalendarDraft.clip(row["location"], 300)
        self.allDay = allDay
        self.startDate = allDay ? startDate : ""
        self.endDate = allDay ? endDate : ""
        self.start = allDay ? "" : start
        self.end = allDay ? "" : end
        self.timeZone = allDay ? "" : timeZone
        self.endTimeZone = allDay ? "" : (endTimeZone.isEmpty ? timeZone : endTimeZone)
    }

    private static func clip(_ value: Any?, _ max: Int) -> String {
        guard let text = value as? String else { return "" }
        let cleaned = text.replacingOccurrences(of: "\u{0000}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.count <= max { return cleaned }
        return String(cleaned.prefix(max))
    }

    private static func flag(_ value: Any?) -> Bool {
        if let bit = value as? Bool { return bit }
        if let number = value as? NSNumber { return number.boolValue }
        return false
    }

    private static func day(_ value: Any?) -> String {
        guard let text = value as? String, text.count == 10 else { return "" }
        let parts = text.split(separator: "-")
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2 else { return "" }
        guard text.allSatisfy({ $0.isNumber || $0 == "-" }) else { return "" }
        return text
    }

    private static func civil(_ value: Any?) -> String {
        guard let text = value as? String, text.count == 19 else { return "" }
        let dayPart = String(text.prefix(10))
        guard !day(dayPart).isEmpty, text.dropFirst(10).first == "T" else { return "" }
        let clock = text.dropFirst(11).split(separator: ":")
        guard clock.count == 3, clock.allSatisfy({ $0.count == 2 && Int($0) != nil }) else { return "" }
        return text
    }

    private static func zone(_ value: Any?) -> String {
        guard let text = value as? String else { return "" }
        let name = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80, name.contains("/"), TimeZone(identifier: name) != nil else { return "" }
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_+-/")
        guard name.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return "" }
        return name
    }
}

private enum IcsCalendarReader {
    static func events(in text: String) -> [[String: Any]] {
        var rows: [[String: Any]] = []
        var inEvent = false
        var current: [String: String] = [:]
        var start = ""
        var end = ""
        var startZone = ""
        var endZone = ""
        var startAllDay = false

        func flush() {
            let title = unescape(current["SUMMARY"] ?? "")
            let uid = unescape(current["UID"] ?? "")
            guard !title.isEmpty else { return }
            if startAllDay {
                rows.append([
                    "uid": uid.isEmpty ? title : uid,
                    "title": title,
                    "notes": unescape(current["DESCRIPTION"] ?? ""),
                    "location": unescape(current["LOCATION"] ?? ""),
                    "allDay": true,
                    "startDate": day(start),
                    "endDate": day(end),
                ])
            } else if !start.isEmpty {
                rows.append([
                    "uid": uid.isEmpty ? title : uid,
                    "title": title,
                    "notes": unescape(current["DESCRIPTION"] ?? ""),
                    "location": unescape(current["LOCATION"] ?? ""),
                    "allDay": false,
                    "start": civil(start),
                    "end": end.isEmpty ? "" : civil(end),
                    "timeZone": startZone,
                    "endTimeZone": endZone.isEmpty ? startZone : endZone,
                ])
            }
        }

        for line in unfold(text) {
            if line == "BEGIN:VEVENT" {
                inEvent = true
                current = [:]
                start = ""
                end = ""
                startZone = ""
                endZone = ""
                startAllDay = false
                continue
            }
            if line == "END:VEVENT" {
                if inEvent { flush() }
                inEvent = false
                continue
            }
            guard inEvent, let parsed = property(line) else { continue }
            if parsed.name == "DTSTART" || parsed.name == "DTEND" {
                let allDay = parsed.params["VALUE"]?.uppercased() == "DATE" || !parsed.value.contains("T")
                let zone = parsed.params["TZID"] ?? ""
                if parsed.name == "DTSTART" {
                    start = parsed.value
                    startZone = zone
                    startAllDay = allDay
                } else {
                    end = parsed.value
                    endZone = zone
                }
                continue
            }
            if current[parsed.name] == nil {
                current[parsed.name] = parsed.value
            }
        }
        return rows
    }

    private static func unfold(_ text: String) -> [String] {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        var lines: [String] = []
        for raw in normalized.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(raw)
            if (line.hasPrefix(" ") || line.hasPrefix("\t")), let last = lines.popLast() {
                lines.append(last + line.dropFirst())
            } else {
                lines.append(line)
            }
        }
        return lines
    }

    private static func property(_ line: String) -> (name: String, params: [String: String], value: String)? {
        guard let colon = line.firstIndex(of: ":") else { return nil }
        let head = String(line[..<colon])
        let value = String(line[line.index(after: colon)...])
        let bits = head.split(separator: ";", omittingEmptySubsequences: false)
        guard let rawName = bits.first else { return nil }
        var params: [String: String] = [:]
        for bit in bits.dropFirst() {
            let pair = bit.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            if pair.count == 2 { params[String(pair[0]).uppercased()] = String(pair[1]) }
        }
        return (String(rawName).uppercased(), params, value)
    }

    private static func unescape(_ value: String) -> String {
        var out = ""
        var escaped = false
        for character in value {
            if escaped {
                if character == "n" || character == "N" { out.append("\n") }
                else { out.append(character) }
                escaped = false
            } else if character == "\\" {
                escaped = true
            } else {
                out.append(character)
            }
        }
        return out
    }

    private static func day(_ stamp: String) -> String {
        let digits = stamp.filter(\.isNumber)
        guard digits.count >= 8 else { return "" }
        let year = digits.prefix(4)
        let month = digits.dropFirst(4).prefix(2)
        let date = digits.dropFirst(6).prefix(2)
        return "\(year)-\(month)-\(date)"
    }

    private static func civil(_ stamp: String) -> String {
        let digits = stamp.filter(\.isNumber)
        guard digits.count >= 14 else { return "" }
        let year = digits.prefix(4)
        let month = digits.dropFirst(4).prefix(2)
        let date = digits.dropFirst(6).prefix(2)
        let hour = digits.dropFirst(8).prefix(2)
        let minute = digits.dropFirst(10).prefix(2)
        let second = digits.dropFirst(12).prefix(2)
        return "\(year)-\(month)-\(date)T\(hour):\(minute):\(second)"
    }
}
