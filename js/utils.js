import { TIME_RANGES } from './constants.js';

const parseDuration = (durationStr) => {
    if (!durationStr) return 0;
    const value = parseFloat(durationStr);
    if (durationStr.toUpperCase().includes('D')) return value / 365.25;
    if (durationStr.toUpperCase().includes('Y')) return value;
    return value;
};

const getRangeInfo = (startDate) => {
    const range = TIME_RANGES.find(r => startDate >= r.start && startDate <= r.end);
    if (!range) return { color: '#ccc', span: 1 };
    const span = Math.abs(range.end - range.start);
    return { ...range, span: span > 0 ? span : 1 };
};

const formatYear = (year) => {
    if (year < 0) return `${Math.abs(year)} BC`;
    if (year >= 0) return `${year} AD`;
    return year;
};

const calculateColumns = (data) => {
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
            // Sort events by sortKey in descending order (higher sortKey = lower column number)
            events.sort((a, b) => {
                return parseFloat(b.fields.sortKey) - parseFloat(a.fields.sortKey);
            });
            
            // Find existing column assignments
            const existingColumns = events
                .filter(event => event.fields.column && event.fields.column.trim() !== '')
                .map(event => parseInt(event.fields.column))
                .sort((a, b) => a - b);
            
            // Assign columns
            let nextAvailableColumn = 1;
            
            events.forEach(event => {
                if (!event.fields.column || event.fields.column.trim() === '') {
                    // Find the next available column number
                    while (existingColumns.includes(nextAvailableColumn)) {
                        nextAvailableColumn++;
                    }
                    event.fields.customColumn = nextAvailableColumn.toString();
                    existingColumns.push(nextAvailableColumn);
                    existingColumns.sort((a, b) => a - b);
                    nextAvailableColumn++;
                }
            });
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
            
            result[event.originalIndex] = event;
            delete result[event.originalIndex].originalIndex;
        });
    });
    return result;
}

const getEffectiveColumn = (event) => {
    // First check if there's a regular column value
    if (event.fields.column && event.fields.column.trim() !== '') {
        return parseFloat(event.fields.column);
    }
    
    // Then check if there's a calculated custom column
    if (event.fields.customColumn) {
        return parseFloat(event.fields.customColumn);
    }
    
    // Default to column 1 if no column is specified
    return 1;
};

export {parseDuration, getRangeInfo, formatYear, calculateColumns, getEffectiveColumn};
