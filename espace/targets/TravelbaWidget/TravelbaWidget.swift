import WidgetKit
import SwiftUI

struct StayEntry: TimelineEntry {
  let date: Date
  let title: String
  let countdown: String
  let place: String
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> StayEntry {
    StayEntry(date: Date(), title: "Votre séjour", countdown: "", place: "")
  }

  func getSnapshot(in context: Context, completion: @escaping (StayEntry) -> Void) {
    completion(readEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StayEntry>) -> Void) {
    let entry = readEntry()
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(3600))))
  }

  func readEntry() -> StayEntry {
    let defaults = UserDefaults(suiteName: "group.fr.travelba.espace")
    return StayEntry(
      date: Date(),
      title: defaults?.string(forKey: "title") ?? "Ouvrez TBA",
      countdown: defaults?.string(forKey: "countdown") ?? "",
      place: defaults?.string(forKey: "place") ?? ""
    )
  }
}

struct TravelbaWidgetEntryView: View {
  var entry: StayEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("TBA")
        .font(.caption.weight(.bold))
        .foregroundStyle(Color(red: 0.77, green: 0.66, blue: 0.50))
      Text(entry.title)
        .font(.headline)
        .foregroundStyle(Color(red: 0.04, green: 0.10, blue: 0.17))
      if !entry.countdown.isEmpty {
        Text(entry.countdown)
          .font(.subheadline.weight(.semibold))
      }
      if !entry.place.isEmpty {
        Text(entry.place)
          .font(.caption)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding()
  }
}

@main
struct TravelbaWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "TravelbaWidget", provider: Provider()) { entry in
      TravelbaWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Prochain séjour")
    .description("Le séjour publié par l’agence.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
