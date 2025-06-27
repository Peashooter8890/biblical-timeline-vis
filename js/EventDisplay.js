import { formatYear } from './utils.js';

const { useRef, useMemo, useCallback, useEffect } = preactHooks;
const html = htm.bind(preact.h);

const EventDisplay = ({ data, selection, onTopEventChange }) => {
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
        
        const eventElements = container.querySelectorAll('.event-group');
        let topVisibleYear = groupedEvents[0].year;
        
        for (let i = 0; i < eventElements.length; i++) {
            const element = eventElements[i];
            const elementTop = element.offsetTop;
            const elementBottom = elementTop + element.offsetHeight;
            
            if (elementBottom > scrollTop) {
                topVisibleYear = groupedEvents[i].year;
                break;
            }
        }
        
        onTopEventChange(topVisibleYear);
    }, [groupedEvents, onTopEventChange]);

    useEffect(() => {
        handleScroll();
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
