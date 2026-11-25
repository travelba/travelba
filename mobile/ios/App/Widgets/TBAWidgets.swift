import ActivityKit
import SwiftUI
import WidgetKit

/// Widgets et activité en direct dans la même extension : un seul identifiant à signer.
@main
struct TBAWidgets: WidgetBundle {
    var body: some Widget {
        TripCountdownWidget()
        NextFlightWidget()
        DestinationWeatherWidget()
        FlightLiveActivityWidget()
    }
}

private enum TBAColor {
    static let navy = Color(red: 11 / 255, green: 25 / 255, blue: 44 / 255)
    static let champagne = Color(red: 197 / 255, green: 168 / 255, blue: 128 / 255)
    static let cream = Color(red: 250 / 255, green: 249 / 255, blue: 246 / 255)
    static let mist = Color(red: 201 / 255, green: 191 / 255, blue: 178 / 255)
}

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetFile?
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: Date(), snapshot: SnapshotProvider.sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        let stored = WidgetFile.load()
        completion(SnapshotEntry(date: Date(), snapshot: stored ?? (context.isPreview ? SnapshotProvider.sample : nil)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let snapshot = WidgetFile.load()
        let now = Date()
        let entries = (0..<16).map { step in
            SnapshotEntry(date: now.addingTimeInterval(Double(step) * 15 * 60), snapshot: snapshot)
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(4 * 60 * 60))))
    }

    /// Gabarit du sélecteur de widgets. Ce n’est pas un séjour.
    private static let sample = WidgetFile(
        updatedAt: nil,
        trip: WidgetTrip(title: "Votre séjour", when: "", href: "/mon-compte", countdown: "J - 3", departureAt: nil),
        flight: WidgetFlight(
            number: "AF 123",
            route: "Paris → Rome",
            codes: "CDG → FCO",
            time: "14:30",
            scheduled: "14:30",
            estimated: "",
            gate: "A12",
            terminal: "2E",
            status: "À l’heure",
            place: "Terminal 2E · Porte A12"
        ),
        weather: WidgetWeather(place: "Rome", tempC: 22, label: "Ensoleillé", icon: "sun"),
        live: nil
    )
}

private extension View {
    @ViewBuilder
    func tbaHomeBackground(_ family: WidgetFamily) -> some View {
        if family == .systemSmall || family == .systemMedium {
            if #available(iOS 17.0, *) {
                self.containerBackground(TBAColor.navy, for: .widget)
            } else {
                self.background(TBAColor.navy)
            }
        } else if #available(iOS 17.0, *) {
            self.containerBackground(.clear, for: .widget)
        } else {
            self
        }
    }
}

struct TripCountdownWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fr.travelba.client.trip", provider: SnapshotProvider()) { entry in
            TripCountdownView(entry: entry)
        }
        .configurationDisplayName("Prochain séjour")
        .description("Le compte à rebours avant votre départ.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct NextFlightWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fr.travelba.client.flight", provider: SnapshotProvider()) { entry in
            NextFlightView(entry: entry)
        }
        .configurationDisplayName("Prochain vol")
        .description("Le numéro, l’heure, la porte et le statut.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct DestinationWeatherWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fr.travelba.client.weather", provider: SnapshotProvider()) { entry in
            DestinationWeatherView(entry: entry)
        }
        .configurationDisplayName("Météo")
        .description("Le temps à votre destination.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}

struct FlightLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightActivityAttributes.self) { context in
            FlightLockView(context: context)
                .activityBackgroundTint(TBAColor.navy)
                .activitySystemActionForegroundColor(TBAColor.champagne)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.flightNumber)
                        .font(.headline)
                        .foregroundStyle(TBAColor.cream)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(FlightActivityCopy.clock(context.attributes))
                        .font(.headline)
                        .foregroundStyle(TBAColor.champagne)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.route)
                        Text(islandDetail(context.state))
                            .foregroundStyle(TBAColor.champagne)
                    }
                    .font(.subheadline)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Text(context.attributes.flightNumber)
            } compactTrailing: {
                Text(FlightActivityCopy.clock(context.attributes))
            } minimal: {
                Image(systemName: "airplane")
            }
        }
    }
}

private struct TripCountdownView: View {
    var entry: SnapshotEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let trip = entry.snapshot?.trip
        Group {
            if let trip {
                switch family {
                case .accessoryCircular:
                    Text(TBAWidgetCopy.shortCountdown(trip, now: entry.date))
                        .font(.headline)
                        .minimumScaleFactor(0.6)
                case .accessoryInline:
                    Text("TBA · \(TBAWidgetCopy.tripCountdown(trip, now: entry.date)) · \(trip.title)")
                case .accessoryRectangular:
                    VStack(alignment: .leading, spacing: 2) {
                        Text(TBAWidgetCopy.tripCountdown(trip, now: entry.date))
                            .font(.headline)
                        Text(trip.title)
                            .font(.subheadline)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                default:
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TBA")
                            .font(.caption.weight(.bold))
                            .tracking(1.4)
                            .foregroundStyle(TBAColor.champagne)
                        Spacer(minLength: 0)
                        Text(TBAWidgetCopy.tripCountdown(trip, now: entry.date))
                            .font(.title2.weight(.bold))
                            .foregroundStyle(TBAColor.cream)
                            .minimumScaleFactor(0.7)
                        Text(trip.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(TBAColor.cream)
                            .lineLimit(2)
                        if !trip.when.isEmpty {
                            Text(trip.when)
                                .font(.caption2)
                                .foregroundStyle(TBAColor.mist)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                }
            } else {
                empty("Votre séjour", detail: "Ouvrez TBA", onNavy: family == .systemSmall)
            }
        }
        .tbaHomeBackground(family)
    }
}

private struct NextFlightView: View {
    var entry: SnapshotEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let flight = entry.snapshot?.flight
        Group {
            if let flight {
                switch family {
                case .accessoryInline:
                    Text(inlineFlight(flight))
                case .accessoryRectangular:
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(flight.number) · \(flight.time)")
                            .font(.headline)
                        Text(flight.place.isEmpty ? flight.route : flight.place)
                            .font(.caption)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                case .systemMedium:
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("TBA")
                                .font(.caption2.weight(.bold))
                                .tracking(1.2)
                                .foregroundStyle(TBAColor.champagne)
                            Text(flight.number)
                                .font(.title3.weight(.bold))
                                .foregroundStyle(TBAColor.cream)
                            Text(flight.route.isEmpty ? flight.codes : flight.route)
                                .font(.subheadline)
                                .foregroundStyle(TBAColor.cream)
                                .lineLimit(1)
                            Text(flight.status)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(TBAColor.champagne)
                        }
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(flight.time)
                                .font(.title.weight(.bold))
                                .foregroundStyle(TBAColor.cream)
                            if !flight.estimated.isEmpty && flight.estimated != flight.scheduled && !flight.scheduled.isEmpty {
                                Text("prévu \(flight.scheduled)")
                                    .font(.caption2)
                                    .foregroundStyle(TBAColor.mist)
                            }
                            if !flight.place.isEmpty {
                                Text(flight.place)
                                    .font(.caption)
                                    .foregroundStyle(TBAColor.cream)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                default:
                    VStack(alignment: .leading, spacing: 4) {
                        Text(flight.number)
                            .font(.headline)
                            .foregroundStyle(TBAColor.cream)
                        Text(flight.time)
                            .font(.title2.weight(.bold))
                            .foregroundStyle(TBAColor.champagne)
                        Text(flight.route.isEmpty ? flight.codes : flight.route)
                            .font(.caption)
                            .foregroundStyle(TBAColor.cream)
                            .lineLimit(1)
                        Text(flight.place.isEmpty ? flight.status : flight.place)
                            .font(.caption2)
                            .foregroundStyle(TBAColor.mist)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                }
            } else {
                empty("Prochain vol", detail: "Aucun vol", onNavy: family == .systemSmall || family == .systemMedium)
            }
        }
        .tbaHomeBackground(family)
    }
}

private struct DestinationWeatherView: View {
    var entry: SnapshotEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let weather = entry.snapshot?.weather
        Group {
            if let weather {
                switch family {
                case .accessoryCircular:
                    VStack(spacing: 0) {
                        Image(systemName: TBAWidgetCopy.weatherSymbol(weather.icon))
                        Text("\(weather.tempC)°")
                            .font(.headline)
                    }
                case .accessoryInline:
                    Text("\(weather.place) \(weather.tempC)° · \(weather.label)")
                default:
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TBA")
                            .font(.caption.weight(.bold))
                            .tracking(1.4)
                            .foregroundStyle(TBAColor.champagne)
                        Spacer(minLength: 0)
                        Image(systemName: TBAWidgetCopy.weatherSymbol(weather.icon))
                            .font(.title2)
                            .foregroundStyle(TBAColor.champagne)
                        Text("\(weather.tempC)°")
                            .font(.title.weight(.bold))
                            .foregroundStyle(TBAColor.cream)
                        Text(weather.place)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(TBAColor.cream)
                            .lineLimit(1)
                        Text(weather.label)
                            .font(.caption)
                            .foregroundStyle(TBAColor.mist)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                }
            } else {
                empty("Météo", detail: "Pas encore", onNavy: family == .systemSmall)
            }
        }
        .tbaHomeBackground(family)
    }
}

private struct FlightLockView: View {
    let context: ActivityViewContext<FlightActivityAttributes>

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("TBA")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(TBAColor.champagne)
                Text(context.attributes.flightNumber)
                    .font(.headline)
                    .foregroundStyle(TBAColor.cream)
                Text(context.attributes.route)
                    .font(.subheadline)
                    .foregroundStyle(TBAColor.cream)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 2) {
                Text(FlightActivityCopy.clock(context.attributes))
                    .font(.title3.weight(.bold))
                    .foregroundStyle(TBAColor.cream)
                Text(FlightActivityCopy.status(context.state.status))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(TBAColor.champagne)
                let place = FlightActivityCopy.place(gate: context.state.gate, terminal: context.state.terminal)
                if !place.isEmpty {
                    Text(place)
                        .font(.caption2)
                        .foregroundStyle(TBAColor.mist)
                        .multilineTextAlignment(.trailing)
                }
                if let boarding = FlightActivityCopy.boarding(context.state.boardingCountdown) {
                    Text(boarding)
                        .font(.caption2)
                        .foregroundStyle(TBAColor.cream)
                }
            }
        }
        .padding(.horizontal, 2)
    }
}

@ViewBuilder
private func empty(_ title: String, detail: String, onNavy: Bool) -> some View {
    VStack(alignment: .leading, spacing: 4) {
        Text("TBA")
            .font(.caption.weight(.bold))
            .foregroundStyle(onNavy ? AnyShapeStyle(TBAColor.champagne) : AnyShapeStyle(.primary))
        Text(title)
            .font(.headline)
            .foregroundStyle(onNavy ? AnyShapeStyle(TBAColor.cream) : AnyShapeStyle(.primary))
        Text(detail)
            .font(.caption)
            .foregroundStyle(onNavy ? AnyShapeStyle(TBAColor.mist) : AnyShapeStyle(.secondary))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
}

private func inlineFlight(_ flight: WidgetFlight) -> String {
    var parts = [flight.number, flight.time].filter { !$0.isEmpty }
    if !flight.gate.isEmpty { parts.append("porte \(flight.gate)") }
    else if !flight.status.isEmpty { parts.append(flight.status) }
    return parts.joined(separator: " · ")
}

private func islandDetail(_ state: FlightActivityAttributes.ContentState) -> String {
    let place = FlightActivityCopy.place(gate: state.gate, terminal: state.terminal)
    if let boarding = FlightActivityCopy.boarding(state.boardingCountdown) { return boarding }
    if state.delayMinutes > 0 { return "Retard \(state.delayMinutes) min" }
    if !place.isEmpty { return place }
    return FlightActivityCopy.status(state.status)
}
