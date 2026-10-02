import ActivityKit
import WidgetKit
import SwiftUI

struct FlightAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var route: String
    var time: String
    var title: String
  }

  var reference: String
}

struct TravelbaLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FlightAttributes.self) { context in
      HStack {
        Text("TBA")
          .font(.caption.weight(.bold))
        Text(context.state.route)
          .font(.headline)
        Spacer()
        Text(context.state.time)
      }
      .padding()
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(context.state.route)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.time)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(context.state.title)
        }
      } compactLeading: {
        Text("TBA")
      } compactTrailing: {
        Text(context.state.time)
      } minimal: {
        Text("TBA")
      }
    }
  }
}
