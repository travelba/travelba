import ActivityKit
import Foundation

/// Attributs de l’activité en direct. Le nom du type est celui du push `attributes-type`.
@available(iOS 16.2, *)
struct FlightActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var status: String
        var gate: String
        var terminal: String
        var delayMinutes: Int
        var boardingCountdown: Int
    }

    var flightNumber: String
    var route: String
    var scheduledDeparture: String
    var scheduledArrival: String
    var estimatedDeparture: String
    var estimatedArrival: String
}

@available(iOS 16.2, *)
enum FlightActivityCopy {
    static func status(_ code: String) -> String {
        switch code {
        case "scheduled": return "À l’heure"
        case "delayed": return "Retard"
        case "cancelled": return "Annulé"
        case "diverted": return "Dérouté"
        case "en_route": return "En vol"
        case "landed": return "Arrivé"
        case "boarding": return "Embarquement"
        default: return "Prévu"
        }
    }

    static func place(gate: String, terminal: String) -> String {
        var parts: [String] = []
        if !terminal.isEmpty {
            parts.append(terminal.lowercased().hasPrefix("terminal") ? terminal : "Terminal \(terminal)")
        }
        if !gate.isEmpty {
            parts.append(gate.lowercased().hasPrefix("porte") ? gate : "Porte \(gate)")
        }
        return parts.joined(separator: " · ")
    }

    static func clock(_ attributes: FlightActivityAttributes) -> String {
        let estimated = attributes.estimatedDeparture
        if !estimated.isEmpty { return estimated }
        return attributes.scheduledDeparture
    }

    static func boarding(_ seconds: Int) -> String? {
        if seconds < 0 { return nil }
        if seconds == 0 { return "Embarquement" }
        if seconds < 3600 { return "Embarquement \(max(1, seconds / 60)) min" }
        return "Embarquement \(seconds / 3600) h"
    }
}
