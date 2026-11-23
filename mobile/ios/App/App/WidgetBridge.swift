import Foundation
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Écrit le résumé partagé et, le jour du vol, démarre l’activité en direct.
enum WidgetBridge {
    static func arm(onEvent: @escaping ([String: Any]) -> Void) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            LiveFlightCenter.arm(onEvent: onEvent)
        }
        #endif
    }

    @discardableResult
    static func sync(json: String, onEvent: @escaping ([String: Any]) -> Void) -> Bool {
        guard json.count <= 20_000, WidgetFile.store(json) != nil else { return false }
        WidgetCenter.shared.reloadAllTimelines()
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            LiveFlightCenter.arm(onEvent: onEvent)
            LiveFlightCenter.sync(json: json, onEvent: onEvent)
        }
        #endif
        return true
    }
}

#if canImport(ActivityKit)

@available(iOS 16.2, *)
enum LiveFlightCenter {
    private static var armed = false
    private static var observed = Set<String>()

    static func arm(onEvent: @escaping ([String: Any]) -> Void) {
        guard !armed else { return }
        armed = true
        for activity in Activity<FlightActivityAttributes>.activities {
            watch(activity, itemId: "", onEvent: onEvent)
        }
        if #available(iOS 17.2, *) {
            Task {
                for await data in Activity<FlightActivityAttributes>.pushToStartTokenUpdates {
                    emit(["pushToStartToken": hex(data)], onEvent: onEvent)
                }
            }
        }
    }

    static func sync(json: String, onEvent: @escaping ([String: Any]) -> Void) {
        guard let data = json.data(using: .utf8),
              let file = try? JSONDecoder().decode(WidgetFile.self, from: data) else { return }
        Task {
            guard let live = file.live else {
                await endAll(onEvent: onEvent)
                return
            }
            let attributes = FlightActivityAttributes(
                flightNumber: live.attributes.flightNumber,
                route: live.attributes.route,
                scheduledDeparture: live.attributes.scheduledDeparture,
                scheduledArrival: live.attributes.scheduledArrival,
                estimatedDeparture: live.attributes.estimatedDeparture,
                estimatedArrival: live.attributes.estimatedArrival
            )
            let state = FlightActivityAttributes.ContentState(
                status: live.state.status,
                gate: live.state.gate,
                terminal: live.state.terminal,
                delayMinutes: live.state.delayMinutes,
                boardingCountdown: live.state.boardingCountdown
            )
            let content = ActivityContent(state: state, staleDate: nil)
            let existing = Activity<FlightActivityAttributes>.activities
            if let same = existing.first(where: { $0.attributes.flightNumber == attributes.flightNumber }) {
                if live.ending {
                    await same.end(content, dismissalPolicy: .after(Date().addingTimeInterval(30 * 60)))
                    emit(["activityId": same.id, "ended": true], onEvent: onEvent)
                } else {
                    await same.update(content)
                    watch(same, itemId: live.itemId, onEvent: onEvent)
                }
                for other in existing where other.id != same.id {
                    await other.end(nil, dismissalPolicy: .immediate)
                }
                return
            }
            if live.ending {
                await endAll(onEvent: onEvent)
                return
            }
            for other in existing {
                await other.end(nil, dismissalPolicy: .immediate)
            }
            do {
                let created = try Activity.request(attributes: attributes, content: content, pushType: .token)
                watch(created, itemId: live.itemId, onEvent: onEvent)
            } catch {
                return
            }
        }
    }

    private static func watch(_ activity: Activity<FlightActivityAttributes>, itemId: String, onEvent: @escaping ([String: Any]) -> Void) {
        guard observed.insert(activity.id).inserted else { return }
        Task {
            for await data in activity.pushTokenUpdates {
                var event: [String: Any] = [
                    "activityId": activity.id,
                    "updateToken": hex(data),
                    "flightNumber": activity.attributes.flightNumber,
                ]
                if !itemId.isEmpty { event["itemId"] = itemId }
                emit(event, onEvent: onEvent)
            }
        }
    }

    private static func endAll(onEvent: @escaping ([String: Any]) -> Void) async {
        for activity in Activity<FlightActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .default)
            emit(["activityId": activity.id, "ended": true], onEvent: onEvent)
        }
    }

    private static func emit(_ event: [String: Any], onEvent: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async {
            onEvent(event)
        }
    }

    private static func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}
#endif
