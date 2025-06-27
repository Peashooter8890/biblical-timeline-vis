import { formatYear } from './utils.js';

const { useRef, useMemo, useCallback, useEffect } = preactHooks;
const html = htm.bind(preact.h);

const EventDisplay = ({ data, selection, onScrollInfoChange }) => {
    const containerRef = useRef(null);

    if (!data.length || !selection) {
        return html`<div class="event-display-container">Loading events...</div>`;
    }

    const groupedEvents = useMemo(() => {
        const [startYear, endYear] = selection;
        const filtered = data.filter(d => d.fields.startDate >= startYear && d.fields.startDate <= endYear);
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

    const handleScroll = useCallback(() => {
        if (!containerRef.current || !groupedEvents.length) return;

        const container = containerRef.current;
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const eventElements = container.querySelectorAll('.event-group');
        
        if (eventElements.length === 0) return;

        // Calculate scroll percentage (0 to 1)
        const maxScroll = scrollHeight - clientHeight;
        let scrollPercentage = 0;
        
        if (maxScroll > 0) {
            scrollPercentage = Math.max(0, Math.min(1, scrollTop / maxScroll));
        }

        // Find the continuous year at the top of the viewport
        let topVisibleYear = groupedEvents[0].year;
        
        for (let i = 0; i < eventElements.length; i++) {
            const element = eventElements[i];
            const elementTop = element.offsetTop;
            const elementBottom = elementTop + element.offsetHeight;
            
            if (elementBottom > scrollTop) {
                if (i === 0) {
                    // First element - interpolate from start of element
                    if (element.offsetHeight > 0) {
                        const scrollIntoElement = Math.max(0, scrollTop - elementTop);
                        const progressThroughElement = scrollIntoElement / element.offsetHeight;
                        
                        // If there's a next element, interpolate toward it
                        if (i + 1 < groupedEvents.length) {
                            const currentYear = groupedEvents[i].year;
                            const nextYear = groupedEvents[i + 1].year;
                            topVisibleYear = currentYear + (progressThroughElement * (nextYear - currentYear));
                        } else {
                            topVisibleYear = groupedEvents[i].year;
                        }
                    } else {
                        topVisibleYear = groupedEvents[i].year;
                    }
                } else {
                    // Check if we're between this element and the previous one
                    const prevElement = eventElements[i - 1];
                    const prevBottom = prevElement.offsetTop + prevElement.offsetHeight;
                    
                    if (scrollTop <= prevBottom && scrollTop >= elementTop) {
                        // We're between elements - interpolate
                        const prevYear = groupedEvents[i - 1].year;
                        const currentYear = groupedEvents[i].year;
                        const totalDistance = elementTop - prevBottom;
                        
                        if (totalDistance > 0) {
                            const progressBetween = (scrollTop - prevBottom) / totalDistance;
                            topVisibleYear = prevYear + (progressBetween * (currentYear - prevYear));
                        } else {
                            topVisibleYear = currentYear;
                        }
                    } else {
                        // We're in this element
                        const scrollIntoElement = Math.max(0, scrollTop - elementTop);
                        const progressThroughElement = element.offsetHeight > 0 ? 
                            scrollIntoElement / element.offsetHeight : 0;
                        
                        if (i + 1 < groupedEvents.length) {
                            const currentYear = groupedEvents[i].year;
                            const nextYear = groupedEvents[i + 1].year;
                            topVisibleYear = currentYear + (progressThroughElement * (nextYear - currentYear));
                        } else {
                            topVisibleYear = groupedEvents[i].year;
                        }
                    }
                }
                break;
            }
        }
        
        const scrollInfo = {
            topVisibleYear,
            scrollPercentage,
            selectionRange: selection
        };
        
        onScrollInfoChange(scrollInfo);
    }, [groupedEvents, onScrollInfoChange, selection]);

    useEffect(() => {
        // Call handleScroll when groupedEvents change to initialize
        const timer = setTimeout(handleScroll, 0);
        return () => clearTimeout(timer);
    }, [handleScroll, groupedEvents]);

    return html`
        <div class="event-display-container" ref=${containerRef} onScroll=${handleScroll}>
            ${groupedEvents.length === 0
                ? html`<p>No events in the selected time range.</p>`
                : groupedEvents.map(group => html`
                <div class="event-group" key=${group.year}>
                    <h3>${formatYear(group.year)}</h3>
                    ${group.events.map(event => html`
                        <div class="event-item" key=${event.fields.title}>${event.fields.title}</div>
                    `)}
                </div>
            `)}
        </div>
    `;
};

export default EventDisplay;