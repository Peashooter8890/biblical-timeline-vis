import React, { Fragment, useRef, useMemo, useCallback, useEffect } from 'react';
import { formatYear } from '../../utils/utils.js';
import './eventDisplay.css';

const EventDisplay = ({ data, selection, onScrollInfoChange, containerRef }) => {
    const internalRef = useRef(null);
    const ref = containerRef || internalRef;
    const previousSelectionRef = useRef(null);

    const groupedEvents = useMemo(() => {
        if (!data.length) return [];
        
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
    }, [data]);

    useEffect(() => {
        if (!selection || !ref.current || !groupedEvents.length) return;
        
        const [startYear, endYear] = selection;
        
        if (previousSelectionRef.current) {
            const [prevStart, prevEnd] = previousSelectionRef.current;
            if (prevStart === startYear && prevEnd === endYear) return;
        }
        
        previousSelectionRef.current = selection;
        
        const targetGroup = groupedEvents.find(group => group.year >= startYear);
        
        if (targetGroup) {
            const container = ref.current;
            const elements = container.querySelectorAll('.event-year-header'); 
            
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                const groupYear = groupedEvents[i].year;
                
                if (groupYear === targetGroup.year) {
                    const containerRect = container.getBoundingClientRect();
                    const elementRect = element.getBoundingClientRect();
                    const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
                    container.scrollTop = relativeTop;
                    break;
                }
            }
        }
    }, [selection, groupedEvents, ref]);

    const calculateYearAtPosition = useCallback((scrollTop, headers, scrollHeight) => {
        if (!headers.length) return groupedEvents[0]?.year || 0;

        // Find which year's "section" the scrollTop is in
        for (let i = 0; i < headers.length; i++) {
            const currentHeader = headers[i];
            const nextHeader = headers[i + 1];

            const sectionTop = currentHeader.offsetTop;
            // The bottom of the section is the top of the next header, or the total scroll height for the last one
            const sectionBottom = nextHeader ? nextHeader.offsetTop : scrollHeight;

            if (scrollTop >= sectionTop && scrollTop < sectionBottom) {
                const currentYear = groupedEvents[i].year;
                const nextYear = groupedEvents[i + 1]?.year;

                if (!nextYear) return currentYear; // We are in the last section

                const sectionHeight = sectionBottom - sectionTop;
                if (sectionHeight === 0) return currentYear;

                // Calculate how far we've scrolled into this section
                const scrollIntoSection = scrollTop - sectionTop;
                const progress = Math.min(1, scrollIntoSection / sectionHeight);

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
        
        const headers = container.querySelectorAll('.event-year-header');
        
        if (!headers.length) return;

        const maxScroll = scrollHeight - clientHeight;
        const scrollPercentage = maxScroll > 0 ? 
            Math.max(0, Math.min(1, scrollTop / maxScroll)) : 1;

        const topVisibleYear = calculateYearAtPosition(scrollTop, headers, scrollHeight);
        
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

    // JSX remains the same as the previous step (using Fragment)
    return (
        <div className="event-display-container" ref={ref} onScroll={handleScroll}>
            {groupedEvents.length === 0 ? (
                <p>No events to display.</p>
            ) : (
                groupedEvents.map(group => (
                    <Fragment key={group.year}>
                        <h3 className="event-year-header">
                            {formatYear(group.year)}
                        </h3>
                        {group.events.map(event => (
                            <div className="event-item" key={event.fields.title}>
                                {event.fields.title}
                            </div>
                        ))}
                    </Fragment>
                ))
            )}
        </div>
    );
};

export default EventDisplay;