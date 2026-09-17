export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function customerFilePrefixes(customerId: string, bookingIds: string[]) {
  return [`customers/${customerId}`, ...bookingIds.map((id) => `bookings/${id}`)];
}
