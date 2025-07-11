import React, { useRef, useMemo, useCallback, useEffect } from 'react';
import { formatYear } from '../../utils/utils.js';
import './eventDisplay.css';

const EventDisplay = ({ data, selection, onScrollInfoChange, containerRef }) => {
    const internalRef = useRef(null);
    const ref = containerRef || internalRef;

    const groupedEvents = useMemo(() => {
        if (!data.length || !selection) return [];
        
        const [startYear, endYear] = selection;
        const filtered = data.filter(d => d.fields.startDate >= startYear && d.fields.startDate <= endYear);
        const groups = {};
        
        filtered.forEach(event => {
            const key = event.fields.startDate;
            if (!groups[key]) groups[key] = [];
            groups[key].push(event);
        });
        
        return Object.keys(groups)
            .sort((a, b) => Number(a) - Number(b))
            .map(key => ({
                year: Number(key),
                events: groups[key]
            }));
    }, [data, selection]);

    const calculateYearAtPosition = useCallback((scrollTop, elements) => {
        if (!elements.length) return groupedEvents[0]?.year || 0;

        // Find the first element that extends past the scroll position
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const elementBottom = element.offsetTop + element.offsetHeight;
            
            if (elementBottom > scrollTop) {
                const currentYear = groupedEvents[i].year;
                const nextYear = groupedEvents[i + 1]?.year;
                
                // If no next year or element height is 0, return current year
                if (!nextYear || element.offsetHeight === 0) return currentYear;
                
                // Calculate how far we've scrolled into this element
                const scrollIntoElement = Math.max(0, scrollTop - element.offsetTop);
                const progress = Math.min(1, scrollIntoElement / element.offsetHeight);
                
                // Interpolate between current and next year
                return currentYear + (progress * (nextYear - currentYear));
            }
        }
        
        return groupedEvents[groupedEvents.length - 1]?.year || 0;
    }, [groupedEvents]);

    const handleScroll = useCallback(() => {
        if (!ref.current || !groupedEvents.length) return;

        const container = ref.current;
        const { scrollTop, scrollHeight, clientHeight } = container;
        const elements = container.querySelectorAll('.event-group');
        
        if (!elements.length) return;

        // Calculate scroll percentage
        const maxScroll = scrollHeight - clientHeight;
        const scrollPercentage = maxScroll > 0 ? 
            Math.max(0, Math.min(1, scrollTop / maxScroll)) : 1;

        const topVisibleYear = calculateYearAtPosition(scrollTop, elements);
        
        onScrollInfoChange({
            topVisibleYear,
            scrollPercentage,
            selectionRange: selection
        });
    }, [groupedEvents, onScrollInfoChange, selection, calculateYearAtPosition, ref]);

    useEffect(() => {
        handleScroll();
    }, [handleScroll, groupedEvents]);

    if (!data.length || !selection) {
        return <div className="event-display-container">Loading events...</div>;
    }

    return (
        <div className="event-display-container" ref={ref} onScroll={handleScroll}>
            {groupedEvents.length === 0 ? (
                <p>No events in the selected time range.</p>
            ) : (
                groupedEvents.map(group => (
                    <div className="event-group" key={group.year}>
                        <h3>{formatYear(group.year)}</h3>
                        {group.events.map(event => (
                            <div className="event-item" key={event.fields.title}>
                                {event.fields.title}
                            </div>
                        ))}
                    </div>
                ))
            )}
        </div>
    );
};

export default EventDisplay;