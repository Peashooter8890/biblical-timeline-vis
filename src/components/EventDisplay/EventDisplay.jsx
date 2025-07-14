import React, { Fragment, useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { formatYear } from '../../utils/utils.js';
import './eventDisplay.css';

const EventDisplay = ({ data, selection, onScrollInfoChange, containerRef }) => {
    const internalRef = useRef(null);
    const ref = containerRef || internalRef;
    const previousSelectionRef = useRef(null);
    const [expandedEvents, setExpandedEvents] = useState(new Set());
    const [peopleData, setPeopleData] = useState([]);

    // Load people data
    useEffect(() => {
        const loadPeopleData = async () => {
            try {
                const response = await fetch('/data/people.json');
                const people = await response.json();
                setPeopleData(people);
            } catch (error) {
                console.error('Error loading people data:', error);
            }
        };
        loadPeopleData();
    }, []);

    const formatDuration = useCallback((duration) => {
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
    }, []);

    const formatParticipants = useCallback((participants) => {
        if (!participants || !peopleData.length) return participants;
        
        const participantIds = participants.split(',').map(id => id.trim());
        const names = participantIds.map(id => {
            const person = peopleData.find(p => p.fields.personLookup === id);
            return person ? person.fields.name : id;
        });
        
        return names.join(', ');
    }, [peopleData]);

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

    const findTopVisibleYear = useCallback((scrollTop, container) => {
        if (!groupedEvents.length) return null;

        const headers = container.querySelectorAll('.event-year-header');
        if (!headers.length) return null;

        // Check if we're at the very bottom of the scroll
        const { scrollHeight, clientHeight } = container;
        const maxScroll = scrollHeight - clientHeight;
        const atBottom = maxScroll > 0 && scrollTop >= maxScroll - 5; // 5px tolerance

        if (atBottom) {
            // Return the last year when at bottom
            return {
                year: groupedEvents[groupedEvents.length - 1].year,
                isAtBottom: true
            };
        }

        // Use getBoundingClientRect to find which header is at the top of the viewport
        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top;
        
        let activeHeaderIndex = 0;
        
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            const headerRect = header.getBoundingClientRect();
            const headerTop = headerRect.top;
            
            if (headerTop <= containerTop) {
                activeHeaderIndex = i;
            } else {
                break;
            }
        }

        return {
            year: groupedEvents[activeHeaderIndex].year,
            isAtBottom: false
        };
    }, [groupedEvents]);

    const handleScroll = useCallback(() => {
        if (!ref.current || !groupedEvents.length || !selection) return;

        const container = ref.current;
        const { scrollTop, scrollHeight, clientHeight } = container;
        
        const maxScroll = scrollHeight - clientHeight;
        const scrollPercentage = maxScroll > 0 ? 
            Math.max(0, Math.min(1, scrollTop / maxScroll)) : 1;

        const topVisibleInfo = findTopVisibleYear(scrollTop, container);
        
        if (topVisibleInfo) {
            onScrollInfoChange({
                topVisibleYear: topVisibleInfo.year,
                scrollPercentage,
                isAtBottom: topVisibleInfo.isAtBottom,
                selectionRange: selection
            });
        }
    }, [groupedEvents, onScrollInfoChange, selection, findTopVisibleYear, ref]);

    const toggleEventExpansion = useCallback((eventTitle) => {
        setExpandedEvents(prev => {
            const newExpanded = new Set(prev);
            if (newExpanded.has(eventTitle)) {
                newExpanded.delete(eventTitle);
            } else {
                newExpanded.add(eventTitle);
            }
            return newExpanded;
        });
    }, []);

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
                    <Fragment key={group.year}>
                        <h3 className="event-year-header">
                            {formatYear(group.year)}
                        </h3>
                        {group.events.map(event => {
                            const isExpanded = expandedEvents.has(event.fields.title);
                            
                            return (
                                <div className="event-item" key={event.fields.title}>
                                    <button 
                                        className={`event-triangle ${isExpanded ? 'expanded' : ''}`}
                                        onClick={() => toggleEventExpansion(event.fields.title)}
                                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} event details`}
                                    >
                                        ▶
                                    </button>
                                    <div className="event-content">
                                        <div className="event-title">{event.fields.title}</div>
                                        {isExpanded && (
                                            <>
                                                {event.fields.duration && (
                                                    <div className="event-detail">
                                                        Duration: {formatDuration(event.fields.duration)}
                                                    </div>
                                                )}
                                                {event.fields.participants && (
                                                    <div className="event-detail">
                                                        Participants: {formatParticipants(event.fields.participants)}
                                                    </div>
                                                )}
                                                {event.fields.groups && (
                                                    <div className="event-detail">
                                                        Groups: {event.fields.groups}
                                                    </div>
                                                )}
                                                {event.fields.locations && (
                                                    <div className="event-detail">
                                                        Locations: {event.fields.locations}
                                                    </div>
                                                )}
                                                {event.fields.verses && (
                                                    <div className="event-detail">
                                                        Verses: {event.fields.verses}
                                                    </div>
                                                )}
                                                {event.fields.partOf && (
                                                    <div className="event-detail">
                                                        Part Of: {event.fields.partOf}
                                                    </div>
                                                )}
                                                {event.fields.predecessor && (
                                                    <div className="event-detail">
                                                        Predecessor: {event.fields.predecessor}
                                                    </div>
                                                )}
                                                {event.fields.lag && (
                                                    <div className="event-detail">
                                                        Lag: {event.fields.lag}
                                                    </div>
                                                )}
                                                {event.fields.lagType && (
                                                    <div className="event-detail">
                                                        Lag Type: {event.fields.lagType}
                                                    </div>
                                                )}
                                                {event.fields.notes && (
                                                    <div className="event-detail">
                                                        Notes: {event.fields.notes}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </Fragment>
                ))
            )}
        </div>
    );
};

export default EventDisplay;