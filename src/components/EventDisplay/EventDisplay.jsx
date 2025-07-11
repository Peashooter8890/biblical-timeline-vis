import React, { useRef, useMemo, useCallback, useEffect } from 'react';
import { formatYear } from '../../utils/utils.js';
import './eventDisplay.css';

const EventDisplay = ({ data, selection, onScrollInfoChange, containerRef }) => {
    const internalRef = useRef(null);
    const ref = containerRef || internalRef;
    const previousSelectionRef = useRef(null);

    const groupedEvents = useMemo(() => {
        if (!data.length) return [];
        
        // Always show ALL events, no filtering by selection
        const groups = {};
        
        data.forEach(event => {
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
    }, [data]); // Removed selection dependency

    // Jump to selection range when selection changes
    useEffect(() => {
        if (!selection || !ref.current || !groupedEvents.length) return;
        
        const [startYear, endYear] = selection;
        
        // Check if selection actually changed
        if (previousSelectionRef.current) {
            const [prevStart, prevEnd] = previousSelectionRef.current;
            if (prevStart === startYear && prevEnd === endYear) return;
        }
        
        previousSelectionRef.current = selection;
        
        // Find the first event group that is >= startYear
        const targetGroup = groupedEvents.find(group => group.year >= startYear);
        
        if (targetGroup) {
            const container = ref.current;
            const elements = container.querySelectorAll('.event-group');
            
            // Find the corresponding DOM element
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                const groupYear = groupedEvents[i].year;
                
                if (groupYear === targetGroup.year) {
                    // Scroll to this element
                    container.scrollTop = element.offsetTop;
                    break;
                }
            }
        }
    }, [selection, groupedEvents, ref]);

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
        if (!ref.current || !groupedEvents.length || !selection) return;

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

    if (!data.length) {
        return <div className="event-display-container">Loading events...</div>;
    }

    return (
        <div className="event-display-container" ref={ref} onScroll={handleScroll}>
            {groupedEvents.length === 0 ? (
                <p>No events to display.</p>
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