export function toDateString(date: Date): string {
  const offset = date.getTimezoneOffset()
  const offsetDate = new Date(date.getTime() - offset * 60 * 1000)
  const [dateString] = offsetDate.toISOString().split('T')
  return dateString
}

export function calculateTimeDifference(
  sleepStartTimestampGMT: number,
  sleepEndTimestampGMT: number,
): { hours: number, minutes: number } {
  const timeDifferenceInSeconds = (sleepEndTimestampGMT - sleepStartTimestampGMT) / 1000
  const hours = Math.floor(timeDifferenceInSeconds / 3600)
  const minutes = Math.floor((timeDifferenceInSeconds % 3600) / 60)
  return { hours, minutes }
}

export function getLocalTimestamp(date: Date, timezone: string): string {
  const localTimestampISO = date.toISOString().substring(0, 23)
  const localTimestamp = new Date(localTimestampISO).toLocaleString('en-US', {
    timeZone: timezone,
    hour12: false,
  })
  const formattedLocalTimestamp = new Date(localTimestamp).toISOString().substring(0, 23)
  return formattedLocalTimestamp
}
