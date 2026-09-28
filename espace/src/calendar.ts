import * as Calendar from "expo-calendar";

export type CalendarEventInput = {
  id: string;
  title: string;
  notes: string;
  start: string;
  end: string | null;
  allDay: boolean;
};

export async function addStayToCalendar(events: CalendarEventInput[]) {
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) throw new Error("Calendrier refusé.");
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((row) => row.allowsModifications) || calendars[0];
  if (!writable) throw new Error("Aucun calendrier.");
  for (const event of events) {
    await Calendar.createEventAsync(writable.id, {
      title: event.title,
      notes: event.notes,
      startDate: new Date(event.start),
      endDate: new Date(event.end || event.start),
      allDay: event.allDay,
    });
  }
}
