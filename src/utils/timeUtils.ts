import { formatInTimeZone } from 'date-fns-tz';
import { logger } from '@/utils/logger';

const UK_TIMEZONE = 'Europe/London';

export function formatToUKTime(date: string | Date | null | undefined, format: string = 'HH:mm:ss'): string {
  if (!date) return '--:--:--';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '--:--:--';
    
    return formatInTimeZone(dateObj, UK_TIMEZONE, format);
  } catch (error) {
    logger.warn('Invalid date provided to formatToUKTime', { date });
    return '--:--:--';
  }
}

export function formatToUKDate(date: string | Date | null | undefined, format: string = 'dd/MM/yyyy'): string {
  if (!date) return '--/--/----';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '--/--/----';
    
    return formatInTimeZone(dateObj, UK_TIMEZONE, format);
  } catch (error) {
    logger.warn('Invalid date provided to formatToUKDate', { date });
    return '--/--/----';
  }
}

export function formatToUKDateTime(date: string | Date | null | undefined, format: string = 'dd/MM/yyyy HH:mm'): string {
  if (!date) return '--/--/---- --:--';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '--/--/---- --:--';
    
    return formatInTimeZone(dateObj, UK_TIMEZONE, format);
  } catch (error) {
    logger.warn('Invalid date provided to formatToUKDateTime', { date });
    return '--/--/---- --:--';
  }
}