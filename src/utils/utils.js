import { TIME_RANGES } from './constants.js';

export const parseDuration = (durationStr) => {
    // make 'D' (day) into 'Y' (year) format
    if (!durationStr) return 0;
    const value = parseFloat(durationStr);
    if (durationStr.toUpperCase().includes('D')) return value / 365.25;
    if (durationStr.toUpperCase().includes('Y')) return value;
    return value;
};

export const getRangeInfo = (startDate) => {
    const range = TIME_RANGES.find(r => startDate >= r.start && startDate <= r.end);
    if (!range) return { color: '#ccc', span: 1 };
    const span = Math.abs(range.end - range.start);
    return { ...range, span: span > 0 ? span : 1 };
};

export const formatYear = (year) => {
    // Format year as "YYYY BC" or "YYYY AD"
    if (year < 0) return `${Math.abs(year) + 1} BC`;
    if (year > 0) return `${year} AD`;
    return 0;
};

export const calculateColumns = (data) => {
    const eventsByDate = {};
    
    data.forEach((event, index) => {
        const startDate = event.fields.startDate;
        if (!eventsByDate[startDate]) {
            eventsByDate[startDate] = [];
        }
        eventsByDate[startDate].push({ ...event, originalIndex: index });
    });
    
    // Process each group of events with the same startDate
    Object.keys(eventsByDate).forEach(startDate => {
        const events = eventsByDate[startDate];
        
        if (events.length > 1) {
            // Sort events by sortKey in descending order (higher = leftmost)
            events.sort((a, b) => {
                return parseFloat(b.fields.sortKey) - parseFloat(a.fields.sortKey);
            });
            
            // Process consecutive groups of non-predefined events
            let i = 0;
            while (i < events.length) {
                const event = events[i];
                
                if (event.fields.column && event.fields.column.trim() !== '') {
                    // This event has a predefined column, skip it
                    i++;
                    continue;
                }
                
                // Found a non-predefined event, find the consecutive group
                const groupStart = i;
                let groupEnd = i;
                
                while (groupEnd < events.length && 
                       (!events[groupEnd].fields.column || events[groupEnd].fields.column.trim() === '')) {
                    groupEnd++;
                }
                groupEnd--; // groupEnd is now the last index in the group
                
                // Find left bound
                let leftBound = 0;
                if (groupStart > 0) {
                    const leftEvent = events[groupStart - 1];
                    if (leftEvent.fields.column && leftEvent.fields.column.trim() !== '') {
                        leftBound = parseFloat(leftEvent.fields.column);
                    }
                }
                
                // Find right bound
                let rightBound = 10;
                if (groupEnd < events.length - 1) {
                    const rightEvent = events[groupEnd + 1];
                    if (rightEvent.fields.column && rightEvent.fields.column.trim() !== '') {
                        rightBound = parseFloat(rightEvent.fields.column);
                    }
                }
                
                // Distribute events evenly within bounds
                const groupSize = groupEnd - groupStart + 1;
                for (let j = groupStart; j <= groupEnd; j++) {
                    const positionInGroup = j - groupStart;
                    const column = leftBound + (rightBound - leftBound) * (positionInGroup + 1) / (groupSize + 1);
                    events[j].fields.customColumn = column.toString();
                }
                
                i = groupEnd + 1;
            }
        } else if (events.length === 1) {
            // Single event with no predefined column should go in the middle (column 5)
            const event = events[0];
            if (!event.fields.column || event.fields.column.trim() === '') {
                event.fields.customColumn = '5';
            }
        }
    });
    
    const result = new Array(data.length);
    Object.values(eventsByDate).forEach(events => {
        events.forEach(event => {
            // Clean startDates that are of format ex. "0030-03-05" and make it into "0030"
            if (event.fields.startDate && event.fields.startDate.includes('-')) {
                const dashIndex = event.fields.startDate.indexOf('-');
                if (dashIndex > 0) {
                    event.fields.startDate = event.fields.startDate.substring(0, dashIndex);
                }
            }
            
            // Trim leading zeros from startDate
            if (event.fields.startDate && typeof event.fields.startDate === 'string') {
                event.fields.startDate = event.fields.startDate.replace(/^0+/, '') || '0';
            }
            
            result[event.originalIndex] = event;
            delete result[event.originalIndex].originalIndex;
        });
    });
    return result;
}

export const getEffectiveColumn = (event) => {
    // First check if there's a regular column value
    if (event.fields.column && event.fields.column.trim() !== '') {
        return parseFloat(event.fields.column);
    }
    
    // Then check if there's a calculated custom column
    if (event.fields.customColumn) {
        return parseFloat(event.fields.customColumn);
    }
    
    // Default to column 5 (middle) if no column is specified
    return 5;
};