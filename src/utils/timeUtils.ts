import { formatInTimeZone } from 'date-fns-tz';

const UK_TIMEZONE = 'Europe/London';

export function formatToUKTime(date: string | Date, format: string = 'HH:mm:ss'): string {
  return formatInTimeZone(date, UK_TIMEZONE, format);
}

export function formatToUKDate(date: string | Date, format: string = 'dd/MM/yyyy'): string {
  return formatInTimeZone(date, UK_TIMEZONE, format);
}

export function formatToUKDateTime(date: string | Date, format: string = 'dd/MM/yyyy HH:mm'): string {
  return formatInTimeZone(date, UK_TIMEZONE, format);
}