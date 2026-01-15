/**
 * Utility functions for YouTrack MCP Server
 */

/**
 * Format a date value safely, handling various input formats
 */
export function formatDate(dateValue: any): string {
  if (!dateValue) {
    return 'Not set';
  }

  let date: Date;
  
  // Handle different input types
  if (typeof dateValue === 'number') {
    // Unix timestamp (YouTrack typically uses milliseconds)
    date = new Date(dateValue);
  } else if (typeof dateValue === 'string') {
    // ISO string or other string format
    date = new Date(dateValue);
  } else if (dateValue instanceof Date) {
    date = dateValue;
  } else {
    return 'Invalid date format';
  }

  // Validate the date
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }

  return date.toLocaleString();
}

/**
 * Format custom field values based on their type and structure
 */
export function formatCustomFieldValue(field: any): string {
  if (!field || field.value === null || field.value === undefined) {
    return 'Not set';
  }

  const value = field.value;
  
  // Handle different value types
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  // Handle array values (multi-select fields)
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'Not set';
    }
    return value.map(item => {
      if (typeof item === 'object' && item.name) {
        return item.name;
      }
      if (typeof item === 'object' && item.fullName) {
        return item.fullName;
      }
      return String(item);
    }).join(', ');
  }

  // Handle object values (user fields, enum fields, etc.)
  if (typeof value === 'object') {
    // User field
    if (value.fullName) {
      return value.fullName;
    }
    // Enum field or other named objects
    if (value.name) {
      return value.name;
    }
    // Date field
    if (value.timestamp || value.date) {
      return formatDate(value.timestamp || value.date);
    }
    // Period field
    if (value.minutes !== undefined) {
      const hours = Math.floor(value.minutes / 60);
      const mins = value.minutes % 60;
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    }
    // Fallback for other object types
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Create a proper YouTrack date query for recent issues
 */
export function createDateRangeQuery(days: number): string {
  const now = new Date();
  const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  
  // Format dates as YYYY-MM-DD which YouTrack accepts
  const formatDateForQuery = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };
  
  const startDateStr = formatDateForQuery(startDate);
  const endDateStr = formatDateForQuery(now);
  
  return `updated: ${startDateStr} .. ${endDateStr}`;
}

/**
 * Add a small delay to handle API eventual consistency
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enhanced error message formatting
 */
export function formatApiError(error: any): string {
  if (error.response?.data?.error_description) {
    return error.response.data.error_description;
  }
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  if (error.response?.status === 404) {
    return 'Resource not found. Check permissions or verify the ID exists.';
  }
  if (error.response?.status === 403) {
    return 'Access denied. Check API token permissions.';
  }
  if (error.response?.status === 400) {
    return 'Bad request. Check query syntax and parameters.';
  }
  return error.message || 'Unknown error occurred';
}

/**
 * Build a proper date custom field object for YouTrack API
 */
export function buildDateCustomField(name: string, dateValue: number | string | Date, timezone?: string): any {
  let timestamp: number;

  // Convert various date formats to timestamp
  if (typeof dateValue === 'number') {
    timestamp = dateValue;
  } else if (typeof dateValue === 'string') {
    timestamp = new Date(dateValue).getTime();
  } else if (dateValue instanceof Date) {
    timestamp = dateValue.getTime();
  } else {
    throw new Error(`Invalid date value for field ${name}: ${dateValue}`);
  }

  // Validate the timestamp
  if (isNaN(timestamp)) {
    throw new Error(`Invalid date value for field ${name}: ${dateValue}`);
  }

  return {
    name,
    value: timestamp,
    $type: 'DateIssueCustomField'
  };
}

/**
 * Parse date field value from YouTrack API response
 */
export function parseDateFieldValue(fieldValue: any): number | undefined {
  if (!fieldValue) {
    return undefined;
  }

  // Handle different YouTrack date field formats
  if (typeof fieldValue === 'number') {
    return fieldValue;
  }

  if (typeof fieldValue === 'string') {
    const parsed = new Date(fieldValue).getTime();
    return isNaN(parsed) ? undefined : parsed;
  }

  if (typeof fieldValue === 'object') {
    // YouTrack might return { timestamp: number } or similar
    if (fieldValue.timestamp && typeof fieldValue.timestamp === 'number') {
      return fieldValue.timestamp;
    }

    // Try to parse as date object
    try {
      const parsed = new Date(fieldValue).getTime();
      return isNaN(parsed) ? undefined : parsed;
    } catch (e) {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Format date for specific timezone
 */
export function formatDateForTimezone(timestamp: number, timezone?: string, format: 'iso' | 'locale' | 'date-only' = 'iso'): string {
  const date = new Date(timestamp);

  if (format === 'date-only') {
    return date.toISOString().split('T')[0];
  }

  if (format === 'locale') {
    return timezone ? date.toLocaleString('en-US', { timeZone: timezone }) : date.toLocaleString();
  }

  // Default to ISO format
  return date.toISOString();
}

/**
 * Validate if a date field name is likely to be a start date field
 */
export function isStartDateField(fieldName: string): boolean {
  const name = fieldName.toLowerCase();
  return (name.includes('start') && name.includes('date')) ||
         name === 'start date' ||
         name === 'startdate' ||
         name === 'start_date';
}

/**
 * Validate if a date field name is likely to be a due/end date field
 */
export function isDueDateField(fieldName: string): boolean {
  const name = fieldName.toLowerCase();
  return (name.includes('due') && name.includes('date')) ||
         (name.includes('end') && name.includes('date')) ||
         (name.includes('target') && name.includes('date')) ||
         name === 'due date' ||
         name === 'duedate' ||
         name === 'due_date' ||
         name === 'end date' ||
         name === 'enddate' ||
         name === 'end_date' ||
         name === 'target date' ||
         name === 'targetdate' ||
         name === 'target_date';
}
