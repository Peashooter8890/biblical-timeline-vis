const TIME_RANGES = [
    { start: -4100, end: -2200, color: '#5795ff' },
    { start: -2199, end: -1600, color: '#ff7f00' },
    { start: -1599, end: -1375, color: '#fc8eac' },
    { start: -1374, end: -1052, color: '#89b4c3' },
    { start: -1051, end: -931,  color: '#b2df8a' },
    { start: -930,  end: -715,  color: '#fdbf6f' },
    { start: -714,  end: -431,  color: '#cab2d6' },
    { start: -430,  end: -1,    color: '#FFB6C1' },
    { start: 0,     end: 150,    color: '#C4A484' }
];

const TIME_PERIODS = {
    'all': [-4100, 150],
    'period1': [-4100, -3000],
    'period2': [-2999, -2000], 
    'period3': [-1999, -1000],
    'period4': [-999, 0],
    'period5': [1, 150]
};

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
    
    let result = new Array(data.length);
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
    result = result.sort((a, b) => a.fields.startDate - b.fields.startDate);
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

export const throttle = (func, limit) => {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

export const parseUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    const startYearParam = params.get('startYear');
    const endYearParam = params.get('endYear');
    
    if (!startYearParam && !endYearParam) {
        return null;
    }
    
    const minYear = TIME_PERIODS.all[0];
    const maxYear = TIME_PERIODS.all[1];
    
    let startYear, endYear;
    
    if (startYearParam) {
        startYear = Math.round(parseFloat(startYearParam));
        if (isNaN(startYear)) {
            return null;
        }
    } else {
        startYear = minYear;
    }
    
    if (endYearParam) {
        endYear = Math.round(parseFloat(endYearParam));
        if (isNaN(endYear)) {
            return null;
        }
    } else {
        endYear = maxYear;
    }
    
    if (startYear >= endYear) {
        return null;
    }
    
    const clampedStart = Math.max(minYear, Math.min(maxYear, startYear));
    const clampedEnd = Math.max(minYear, Math.min(maxYear, endYear));
    
    if (clampedStart >= clampedEnd) {
        return null;
    }
    
    return [clampedStart, clampedEnd];
};

export const findMatchingPeriod = (range) => {
    const entry = Object.entries(TIME_PERIODS).find(([key, periodRange]) => {
        return periodRange[0] === range[0] && periodRange[1] === range[1];
    });
    return entry ? entry[0] : null;
};

export const updateUrl = (range) => {
    const url = new URL(window.location.href);
    url.searchParams.set('startYear', range[0].toString());
    url.searchParams.set('endYear', range[1].toString());
    window.history.replaceState({}, '', url);
};

export const formatDuration = (duration) => {
    if (!duration) return '';
    
    const match = duration.match(/^(\d+)([DY])$/);
    if (!match) return duration;
    
    const [, number, unit] = match;
    const num = parseInt(number, 10);
    
    if (unit === 'D') {
        return num === 1 ? '1 Day' : `${num} Days`;
    } else if (unit === 'Y') {
        return num === 1 ? '1 Year' : `${num} Years`;
    }
    
    return duration;
}

export const formatParticipants = (participants, peopleData) => {
    if (!participants || !peopleData.length) return participants;
    
    const participantIds = participants.split(',').map(id => id.trim());
    
    return participantIds.map((id, index) => {
        const person = peopleData.find(p => p.fields.personLookup === id);
        const displayName = person ? person.fields.displayTitle : id;
        
        return (
            <span key={index}>
                <a 
                    href={`https://theographic.netlify.app/person/${id}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="event-link"
                >
                    {displayName}
                </a>
                {index < participantIds.length - 1 ? ', ' : ''}
            </span>
        );
    });
};

export const formatLocations = (locations, placesData) => {
    if (!locations || !placesData.length) return locations;
    
    const locationIds = locations.split(',').map(id => id.trim());
    
    return locationIds.map((id, index) => {
        const place = placesData.find(p => p.fields.placeLookup === id);
        const displayName = place ? place.fields.displayTitle : id;
        
        return (
            <span key={index}>
                <a 
                    href={`https://theographic.netlify.app/place/${id}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="event-link"
                >
                    {displayName}
                </a>
                {index < locationIds.length - 1 ? ', ' : ''}
            </span>
        );
    });
};

export const formatVerses = (verses) => {
    if (!verses) return verses;
    
    return verses.split(',').map((verse, index) => {
        const trimmedVerse = verse.trim();
        
        const verseMatch = trimmedVerse.match(/^([a-zA-Z0-9]+)\.(\d+)\.(\d+)$/);
        
        if (verseMatch) {
            const [, book, chapter, verseNum] = verseMatch;
            const url = `https://theographic.netlify.app/${book}#${book}.${chapter}.${verseNum}`;
            
            return (
                <span key={index}>
                    <a 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="event-link"
                    >
                        {trimmedVerse}
                    </a>
                    {index < verses.split(',').length - 1 ? ', ' : ''}
                </span>
            );
        }
        
        return (
            <span key={index}>
                {trimmedVerse}
                {index < verses.split(',').length - 1 ? ', ' : ''}
            </span>
        );
    });
};