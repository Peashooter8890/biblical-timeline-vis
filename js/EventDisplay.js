import { formatYear } from './utils.js';

const { useRef, useMemo, useCallback, useEffect } = preactHooks;
const html = htm.bind(preact.h);

// Load EventDisplay-specific CSS
const loadCSS = (href) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
};

// Load EventDisplay CSS if not already loaded
if (!document.querySelector('link[href="css/event-display.css"]')) {
    loadCSS('css/event-display.css');
}

const EventDisplay = ({ data, selection, onScrollInfoChange, containerRef }) => {
    const internalRef = useRef(null);

    const actualRef = containerRef || internalRef;

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
        if (!actualRef.current || !groupedEvents.length) return;

        const container = actualRef.current;
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const eventElements = container.querySelectorAll('.event-group');
        
        if (eventElements.length === 0) return;

        const maxScroll = scrollHeight - clientHeight;
        let scrollPercentage = 0;
        
        if (maxScroll > 0) {
            scrollPercentage = Math.max(0, Math.min(1, scrollTop / maxScroll));
        } else {
            // No scrolling possible - all content fits in view
            // Force scrollPercentage to 1 to position indicator at bottom
            scrollPercentage = 1;
        }

        let topVisibleYear = groupedEvents[0].year;
        
        for (let i = 0; i < eventElements.length; i++) {
            const element = eventElements[i];
            const elementTop = element.offsetTop;
            const elementBottom = elementTop + element.offsetHeight;
            
            if (elementBottom > scrollTop) {
                if (i === 0) {
                    if (element.offsetHeight > 0) {
                        const scrollIntoElement = Math.max(0, scrollTop - elementTop);
                        const progressThroughElement = scrollIntoElement / element.offsetHeight;
                        
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
                    const prevElement = eventElements[i - 1];
                    const prevBottom = prevElement.offsetTop + prevElement.offsetHeight;
                    
                    if (scrollTop <= prevBottom && scrollTop >= elementTop) {
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
        const timer = setTimeout(handleScroll, 0);
        return () => clearTimeout(timer);
    }, [handleScroll, groupedEvents]);

    return html`
        <div class="event-display-container" ref=${actualRef} onScroll=${handleScroll}>
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