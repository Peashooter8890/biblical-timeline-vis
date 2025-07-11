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

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const elementTop = element.offsetTop;
            const elementBottom = elementTop + element.offsetHeight;
            
            if (elementBottom > scrollTop) {
                const currentYear = groupedEvents[i].year;
                
                if (i === 0) {
                    // First element
                    if (element.offsetHeight > 0 && i + 1 < groupedEvents.length) {
                        const scrollIntoElement = Math.max(0, scrollTop - elementTop);
                        const progress = scrollIntoElement / element.offsetHeight;
                        const nextYear = groupedEvents[i + 1].year;
                        return currentYear + (progress * (nextYear - currentYear));
                    }
                    return currentYear;
                }
                
                // Check if between elements
                const prevElement = elements[i - 1];
                const prevBottom = prevElement.offsetTop + prevElement.offsetHeight;
                
                if (scrollTop <= prevBottom && scrollTop >= elementTop) {
                    const prevYear = groupedEvents[i - 1].year;
                    const distance = elementTop - prevBottom;
                    if (distance > 0) {
                        const progress = (scrollTop - prevBottom) / distance;
                        return prevYear + (progress * (currentYear - prevYear));
                    }
                    return currentYear;
                }
                
                // Within this element
                const scrollIntoElement = Math.max(0, scrollTop - elementTop);
                const progress = element.offsetHeight > 0 ? scrollIntoElement / element.offsetHeight : 0;
                
                if (i + 1 < groupedEvents.length) {
                    const nextYear = groupedEvents[i + 1].year;
                    return currentYear + (progress * (nextYear - currentYear));
                }
                return currentYear;
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
        const timer = setTimeout(handleScroll, 0);
        return () => clearTimeout(timer);
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