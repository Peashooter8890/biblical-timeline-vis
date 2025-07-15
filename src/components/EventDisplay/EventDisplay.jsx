import React, { Fragment, useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { formatYear } from '../../utils/utils.js';
import './eventDisplay.css';

const EventDisplay = ({ data, selection, onScrollInfoChange, containerRef }) => {
    const internalRef = useRef(null);
    const ref = containerRef || internalRef;
    const previousSelectionRef = useRef(null);
    const previousScrollInfoRef = useRef(null);
    const [expandedEvents, setExpandedEvents] = useState(new Set());
    const [peopleData, setPeopleData] = useState([]);
    const [placesData, setPlacesData] = useState([]);
    const [floatingHeaderYear, setFloatingHeaderYear] = useState(null);
    const SWITCH_THRESHOLD = 20;

    // Load people data
    useEffect(() => {
        const loadPeopleData = async () => {
            try {
                const response = await fetch(`${import.meta.env.BASE_URL}data/people.json`);
                const people = await response.json();
                setPeopleData(people);
            } catch (error) {
                console.error('Error loading people data:', error);
            }
        };
        loadPeopleData();
    }, []);

    // Load places data
    useEffect(() => {
        const loadPlacesData = async () => {
            try {
                const response = await fetch(`${import.meta.env.BASE_URL}data/places.json`);
                const places = await response.json();
                setPlacesData(places);
            } catch (error) {
                console.error('Error loading places data:', error);
            }
        };
        loadPlacesData();
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

    // Move formatParticipants and formatLocations to useCallback to prevent recreation
    const formatParticipants = useCallback((participants) => {
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
    }, [peopleData]);

    const formatLocations = useCallback((locations) => {
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
    }, [placesData]);

    const formatVerses = useCallback((verses) => {
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
    }, []);

    // Memoize the grouping logic more efficiently
    const groupedEvents = useMemo(() => {
        if (!data.length) return [];
        
        const groups = {};
        
        for (const event of data) {
            const key = event.fields.startDate;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(event);
        }
        
        const sortedKeys = Object.keys(groups).sort((a, b) => Number(a) - Number(b));
        
        return sortedKeys.map(key => ({
            year: Number(key),
            events: groups[key]
        }));
    }, [data]);

    const findTopVisibleYear = useCallback((scrollTop, container) => {
        if (!groupedEvents.length) return null;

        const headers = container.querySelectorAll('.event-year-header');
        if (!headers.length) return null;

        const { scrollHeight, clientHeight } = container;
        const maxScroll = scrollHeight - clientHeight;
        const atBottom = maxScroll > 0 && scrollTop >= maxScroll - 5;

        if (atBottom) {
            return {
                year: groupedEvents[groupedEvents.length - 1].year,
                isAtBottom: true
            };
        }

        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top;
        
        let activeHeaderIndex = 0;
        
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            const headerRect = header.getBoundingClientRect();
            const headerTop = headerRect.top;
            
            if (headerTop <= containerTop + SWITCH_THRESHOLD) {
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

    // FIXED: Only call onScrollInfoChange when values actually change
    const handleScroll = useCallback(() => {
        if (!ref.current || !groupedEvents.length || !selection) return;

        const container = ref.current;
        const { scrollTop, scrollHeight, clientHeight } = container;
        
        const maxScroll = scrollHeight - clientHeight;
        const scrollPercentage = maxScroll > 0 ? 
            Math.max(0, Math.min(1, scrollTop / maxScroll)) : 1;

        const topVisibleInfo = findTopVisibleYear(scrollTop, container);
        
        if (topVisibleInfo) {
            // Update floating header
            setFloatingHeaderYear(topVisibleInfo.year);
            
            const newScrollInfo = {
                topVisibleYear: topVisibleInfo.year,
                scrollPercentage,
                isAtBottom: topVisibleInfo.isAtBottom,
                selectionRange: selection
            };

            // Only update if values have actually changed
            const prev = previousScrollInfoRef.current;
            if (!prev || 
                prev.topVisibleYear !== newScrollInfo.topVisibleYear ||
                Math.abs(prev.scrollPercentage - newScrollInfo.scrollPercentage) > 0.001 ||
                prev.isAtBottom !== newScrollInfo.isAtBottom ||
                prev.selectionRange[0] !== newScrollInfo.selectionRange[0] ||
                prev.selectionRange[1] !== newScrollInfo.selectionRange[1]) {
            
                previousScrollInfoRef.current = newScrollInfo;
                onScrollInfoChange(newScrollInfo);
            }
        }
    }, [groupedEvents, onScrollInfoChange, selection, findTopVisibleYear, ref]);

    // FIXED: Handle selection changes with proper dependency management
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
                    
                    // Set floating header to the target group year immediately
                    setFloatingHeaderYear(targetGroup.year);
                    break;
                }
            }
        }
    }, [selection, groupedEvents, ref]);

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

    // FIXED: Only call handleScroll once when component is ready
    useEffect(() => {
        if (groupedEvents.length > 0 && selection) {
            // Small delay to ensure DOM is ready
            const timeoutId = setTimeout(() => {
                // Find the first visible year in the selection range
                const [startYear] = selection;
                const targetGroup = groupedEvents.find(group => group.year >= startYear);
                if (targetGroup) {
                    setFloatingHeaderYear(targetGroup.year);
                }
                handleScroll();
            }, 0);
            
            return () => clearTimeout(timeoutId);
        }
    }, [groupedEvents.length, selection]); // Remove handleScroll from dependencies

    if (!data.length) {
        return <div className="event-display-container">Loading events...</div>;
    }

    return (
        <div className="event-display-container" ref={ref} onScroll={handleScroll}>
            {floatingHeaderYear && (
                <div className="floating-header">
                    {formatYear(floatingHeaderYear)}
                </div>
            )}
            {groupedEvents.length === 0 ? (
                <p>No events to display.</p>
            ) : (
                groupedEvents.map(group => (
                    <Fragment key={group.year}>
                        <h3 
                            className="event-year-header"
                            style={{ 
                                display: floatingHeaderYear === group.year ? 'none' : 'block' 
                            }}
                        >
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
                                                        Locations: {formatLocations(event.fields.locations)}
                                                    </div>
                                                )}
                                                {event.fields.verses && (
                                                    <div className="event-detail">
                                                        Verses: {formatVerses(event.fields.verses)}
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
                                                        Lag: {formatDuration(event.fields.lag)}
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