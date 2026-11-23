import Foundation

/// Résumé écrit par l’application dans le groupe `group.fr.travelba.client`.
/// Les clés sont celles de `lib/crm/widget-snapshot.ts`.
enum TBAGroup {
    static let id = "group.fr.travelba.client"
    static let snapshotKey = "widget-snapshot"
}

struct WidgetTrip: Codable {
    var title: String
    var when: String
    var href: String
    var countdown: String
    var departureAt: Double?
}

struct WidgetFlight: Codable {
    var number: String
    var route: String
    var codes: String
    var time: String
    var scheduled: String
    var estimated: String
    var gate: String
    var terminal: String
    var status: String
    var place: String
}

struct WidgetWeather: Codable {
    var place: String
    var tempC: Int
    var label: String
    var icon: String
}

struct WidgetLiveAttributes: Codable {
    var flightNumber: String
    var route: String
    var scheduledDeparture: String
    var scheduledArrival: String
    var estimatedDeparture: String
    var estimatedArrival: String
}

struct WidgetLiveState: Codable {
    var status: String
    var gate: String
    var terminal: String
    var delayMinutes: Int
    var boardingCountdown: Int
}

struct WidgetLiveFile: Codable {
    var itemId: String
    var ending: Bool
    var attributes: WidgetLiveAttributes
    var state: WidgetLiveState
}

struct WidgetFile: Codable {
    var updatedAt: String?
    var trip: WidgetTrip?
    var flight: WidgetFlight?
    var weather: WidgetWeather?
    var live: WidgetLiveFile?

    static func load() -> WidgetFile? {
        guard let data = UserDefaults(suiteName: TBAGroup.id)?.data(forKey: TBAGroup.snapshotKey) else { return nil }
        return try? JSONDecoder().decode(WidgetFile.self, from: data)
    }

    static func store(_ json: String) -> WidgetFile? {
        guard let data = json.data(using: .utf8),
              let file = try? JSONDecoder().decode(WidgetFile.self, from: data),
              let defaults = UserDefaults(suiteName: TBAGroup.id) else { return nil }
        defaults.set(data, forKey: TBAGroup.snapshotKey)
        return file
    }
}

enum TBAWidgetCopy {
    static func tripCountdown(_ trip: WidgetTrip, now: Date) -> String {
        guard let ms = trip.departureAt else { return trip.countdown }
        let departure = Date(timeIntervalSince1970: ms / 1000)
        let seconds = Int(departure.timeIntervalSince(now))
        if seconds <= 0 { return trip.countdown.isEmpty ? "C’est l’heure" : trip.countdown }
        if seconds >= 36 * 3600 { return trip.countdown.isEmpty ? dayLabel(seconds) : trip.countdown }
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        if hours >= 1 { return "\(hours) h \(String(format: "%02d", minutes))" }
        return "\(max(minutes, 1)) min"
    }

    static func shortCountdown(_ trip: WidgetTrip, now: Date) -> String {
        let label = tripCountdown(trip, now: now)
        if label.hasPrefix("J - ") { return label.replacingOccurrences(of: "J - ", with: "") + " j" }
        return label
    }

    static func weatherSymbol(_ icon: String) -> String {
        switch icon {
        case "sun": return "sun.max.fill"
        case "cloud_sun": return "cloud.sun.fill"
        case "fog": return "cloud.fog.fill"
        case "rain": return "cloud.rain.fill"
        case "snow": return "cloud.snow.fill"
        case "storm": return "cloud.bolt.rain.fill"
        default: return "cloud.fill"
        }
    }

    private static func dayLabel(_ seconds: Int) -> String {
        let days = max(1, seconds / 86400)
        return "J - \(days)"
    }
}
