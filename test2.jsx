const { useRef, useEffect, useCallback, useMemo, useState } = os.appHooks;
import { formatYear } from 'eventTimeline.components.utils';
import { getStyleOf } from 'eventTimeline.styles.styler';
import { getContainerDimensions } from 'eventTimeline.components.utils';

const EventDisplay = ({ data, selection, onScrollInfoChange, containerRef }) => {
    const internalRef = useRef(null);
    const [manualScrollPosition, setManualScrollPosition] = useState(0);
    const [containerHeight, setContainerHeight] = useState(400);

    const actualRef = containerRef || internalRef;

    if (!data.length || !selection) {
        return (
            <>
                <div className="event-display-container">Loading events...</div>
                <style>{getStyleOf('event-display.css')}</style>
            </>
        );
    }

    const groupedEvents = useMemo(() => {
        const [startYear, endYear] = selection;

        const filtered = data.filter(d => {
            const startDate = d.fields.startDate;
            const result = startDate >= startYear && startDate <= endYear;
            return result;
        });
        
        const groups = filtered.reduce((acc, event) => {
            const key = event.fields.startDate;
            if (!acc[key]) acc[key] = [];
            acc[key].push(event);
            return acc;
        }, {});
        
        const sortedKeys = Object.keys(groups).sort((a, b) => Number(a) - Number(b));
        
        return sortedKeys.map(key => ({
            year: Number(key),
            events: groups[key]
        }));
    }, [data, selection]);

    // Calculate virtual content dimensions
    const virtualDimensions = useMemo(() => {
        const margin = 20;
        const padding = 10;
        const yearHeader = 26;
        const eventItem = 20;

        const totalHeight = groupedEvents.reduce((total, group) => {
            return total + yearHeader + margin + padding + (group.events.length * eventItem);
        }, 0);
        
        return {
            contentHeight: totalHeight,
            viewportHeight: containerHeight
        };
    }, [groupedEvents, containerHeight]);

    // Update container height using getContainerDimensions
    useEffect(() => {
        try {
            const dimensions = getContainerDimensions();
            setContainerHeight(dimensions.height);
        } catch (error) {
            console.error('[ERROR] Failed to get container dimensions:', error);
            // Fallback to a reasonable default
            setContainerHeight(400);
        }
    }, []);

    const calculateScrollInfo = useCallback(() => {
        if (!groupedEvents.length) return;

        const { contentHeight, viewportHeight } = virtualDimensions;
        const maxScroll = Math.max(0, contentHeight - viewportHeight);
        
        let scrollPercentage = 0;
        if (maxScroll > 0) {
            scrollPercentage = Math.max(0, Math.min(1, manualScrollPosition / maxScroll));
        }
        
        // Calculate topVisibleYear based on scroll position and content
        let topVisibleYear;
        
        if (scrollPercentage === 0) {
            topVisibleYear = groupedEvents[0].year;
        } else if (scrollPercentage === 1) {
            topVisibleYear = groupedEvents[groupedEvents.length - 1].year;
        } else {
            // Interpolate based on scroll percentage
            const totalYears = groupedEvents.length;
            const yearIndex = scrollPercentage * (totalYears - 1);
            const lowerIndex = Math.floor(yearIndex);
            const upperIndex = Math.min(lowerIndex + 1, totalYears - 1);
            
            if (lowerIndex === upperIndex) {
                topVisibleYear = groupedEvents[lowerIndex].year;
            } else {
                // Interpolate between the two years
                const fraction = yearIndex - lowerIndex;
                const lowerYear = groupedEvents[lowerIndex].year;
                const upperYear = groupedEvents[upperIndex].year;
                topVisibleYear = lowerYear + (fraction * (upperYear - lowerYear));
            }
        }
        
        const scrollInfo = {
            topVisibleYear,
            scrollPercentage,
            selectionRange: selection
        };
        
        console.log('[DEBUG] EventDisplay manual scroll info:', {
            manualScrollPosition,
            contentHeight,
            viewportHeight,
            maxScroll,
            scrollPercentage,
            topVisibleYear,
            groupedEventsLength: groupedEvents.length
        });
        
        onScrollInfoChange(scrollInfo);
    }, [groupedEvents, onScrollInfoChange, selection, manualScrollPosition, virtualDimensions]);

    // Handle scroll events by tracking deltaY manually
    const handleScroll = useCallback((event) => {
        const deltaY = event.deltaY || 0;
        const scrollSpeed = 3; // Adjust scroll sensitivity
        
        setManualScrollPosition(prev => {
            const { contentHeight, viewportHeight } = virtualDimensions;
            const maxScroll = Math.max(0, contentHeight - viewportHeight);
            const newPosition = Math.max(0, Math.min(maxScroll, prev + (deltaY * scrollSpeed)));
            
            console.log('[DEBUG] Manual scroll update:', {
                deltaY,
                prevPosition: prev,
                newPosition,
                maxScroll,
                contentHeight,
                viewportHeight
            });
            
            return newPosition;
        });
        
        event.preventDefault();
    }, [virtualDimensions]);

    // Handle external scroll (from era scrollbar wheel events)
    const handleExternalScroll = useCallback((deltaY) => {
        const scrollSpeed = 3;
        
        setManualScrollPosition(prev => {
            const { contentHeight, viewportHeight } = virtualDimensions;
            const maxScroll = Math.max(0, contentHeight - viewportHeight);
            const newPosition = Math.max(0, Math.min(maxScroll, prev + (deltaY * scrollSpeed)));
            return newPosition;
        });
    }, [virtualDimensions]);

    // Expose external scroll handler to parent
    useEffect(() => {
        if (actualRef.current && actualRef.current.handleExternalScroll !== handleExternalScroll) {
            actualRef.current.handleExternalScroll = handleExternalScroll;
        }
    }, [handleExternalScroll]);

    // Calculate scroll info whenever manual position changes
    useEffect(() => {
        const timer = setTimeout(calculateScrollInfo, 0);
        return () => clearTimeout(timer);
    }, [calculateScrollInfo]);

    // Reset scroll position when selection changes
    useEffect(() => {
        setManualScrollPosition(0);
    }, [selection]);

    return (
        <>
            <div 
                className="event-display-container" 
                ref={actualRef} 
                onWheel={handleScroll}
                style={{
                    overflow: 'hidden', // Disable native scrolling
                    position: 'relative'
                }}
            >
                <div 
                    style={{
                        transform: `translateY(-${manualScrollPosition}px)`,
                        transition: 'none' // No transition for smooth manual scrolling
                    }}
                >
                    {groupedEvents.length === 0
                        ? <p>No events in the selected time range.</p>
                        : groupedEvents.map(group => (
                            <div className="event-group" key={group.year}>
                                <h3>{formatYear(group.year)}</h3>
                                {group.events.map(event => (
                                    <div className="event-item" key={event.fields.title}>{event.fields.title}</div>
                                ))}
                            </div>
                        ))
                    }
                </div>
            </div>
            <style>{getStyleOf('event-display.css')}</style>
        </>
    );
};

export default EventDisplay;