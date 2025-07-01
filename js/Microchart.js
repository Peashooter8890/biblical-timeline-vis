import { getRangeInfo, getEffectiveColumn, parseDuration } from './utils.js';

const { useEffect, useRef, useCallback } = preactHooks;
const html = htm.bind(preact.h);

const Microchart = ({ data, selection, onIndicatorChange, scrollInfo, onScroll }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const eventsRef = useRef([]);
    const resizeObserverRef = useRef(null);

    const renderChart = useCallback(() => {
        if (!svgRef.current || !containerRef.current || !data.length || !selection) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const dimensions = { 
            width: containerRect.width, 
            height: containerRect.height 
        };

        const [startYear, endYear] = selection;

        const yScale = d3.scaleLinear()
            .domain([startYear, endYear])
            .range([0, dimensions.height]);

        const filteredData = data.filter(d => d.fields.startDate >= startYear && d.fields.startDate <= endYear);

        // Create a map for quick lookup of events by start date and column
        const eventMap = new Map();
        filteredData.forEach(d => {
            const key = `${d.fields.startDate}|${getEffectiveColumn(d)}`;
            if (!eventMap.has(key)) {
                eventMap.set(key, []);
            }
            eventMap.get(key).push(d);
        });

        // Group events by era and calculate column distribution for each era
        const eventsByEra = {};
        const eraColumnCounts = {};
        
        filteredData.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color; // Using color as era identifier
            const effectiveColumn = getEffectiveColumn(d);
            
            if (!eventsByEra[era]) {
                eventsByEra[era] = [];
                eraColumnCounts[era] = 0;
            }
            
            eventsByEra[era].push(d);
            eraColumnCounts[era] = Math.max(eraColumnCounts[era], effectiveColumn);
        });

        const getColumnXForEra = (columnNum, maxColumnsInEra) => {
            // Distribute columns evenly across the full width based on era's max columns
            const columnWidth = dimensions.width / maxColumnsInEra;
            return (columnNum - 1) * columnWidth + (columnWidth / 2);
        };

        const events = [];
        const lines = [];
        
        // First pass: collect all events (visible ones for dots)
        Object.keys(eventsByEra).forEach(era => {
            const eraEvents = eventsByEra[era];
            const maxColumnsInEra = eraColumnCounts[era];
            
            eraEvents.forEach(d => {
                const rangeInfo = getRangeInfo(d.fields.startDate);
                const effectiveColumn = getEffectiveColumn(d);
                const startX = getColumnXForEra(effectiveColumn, maxColumnsInEra);
                const startY = yScale(d.fields.startDate);

                events.push({
                    ...d.fields,
                    color: rangeInfo.color,
                    columnX: startX,
                    y: startY
                });
            });
        });

        // Second pass: collect lines from ALL events in the dataset (not just filtered ones)
        // This ensures lines are drawn even when their start dot is outside the visible range
        const allEventsByEra = {};
        const allEraColumnCounts = {};
        
        data.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color;
            const effectiveColumn = getEffectiveColumn(d);
            
            if (!allEventsByEra[era]) {
                allEventsByEra[era] = [];
                allEraColumnCounts[era] = 0;
            }
            
            allEventsByEra[era].push(d);
            allEraColumnCounts[era] = Math.max(allEraColumnCounts[era], effectiveColumn);
        });

        Object.keys(allEventsByEra).forEach(era => {
            const eraEvents = allEventsByEra[era];
            const maxColumnsInEra = allEraColumnCounts[era];
            
            eraEvents.forEach(d => {
                const duration = parseDuration(d.fields.duration);
                if (duration >= 1) {
                    const rangeInfo = getRangeInfo(d.fields.startDate);
                    const effectiveColumn = getEffectiveColumn(d);
                    const startX = getColumnXForEra(effectiveColumn, maxColumnsInEra);
                    const startY = yScale(d.fields.startDate);
                    const eventEndDate = parseFloat(d.fields.startDate) + duration;
                    const endY = yScale(eventEndDate);

                    // Check if any part of the line is within the visible range
                    const lineStartYear = parseFloat(d.fields.startDate);
                    const lineEndYear = eventEndDate;
                    
                    const lineIntersectsRange = (
                        (lineStartYear >= startYear && lineStartYear <= endYear) || // Start is visible
                        (lineEndYear >= startYear && lineEndYear <= endYear) ||     // End is visible
                        (lineStartYear <= startYear && lineEndYear >= endYear)     // Line spans entire range
                    );

                    if (lineIntersectsRange) {
                        // Clamp the line to the visible range
                        const clampedStartY = Math.max(0, Math.min(dimensions.height, startY));
                        const clampedEndY = Math.max(0, Math.min(dimensions.height, endY));
                        
                        lines.push({
                            x1: startX,
                            y1: clampedStartY,
                            x2: startX,
                            y2: clampedEndY,
                            color: rangeInfo.color
                        });
                    }
                }
            });
        });

        // Sort events by year and store for indicator positioning
        events.sort((a, b) => a.startDate - b.startDate);
        eventsRef.current = events;

        const svg = d3.select(svgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible'); // Added to allow dots to overflow

        svg.selectAll('*').remove();

        const g = svg.append('g');

        // Draw lines first so dots are on top
        g.selectAll('.microchart-line')
            .data(lines)
            .enter()
            .append('line')
            .attr('class', 'microchart-line')
            .attr('x1', d => d.x1)
            .attr('y1', d => d.y1)
            .attr('x2', d => d.x2)
            .attr('y2', d => d.y2)
            .attr('stroke', d => d.color)
            .style('stroke-width', '2px');

        // Create tooltip div
        const tooltip = d3.select(containerRef.current)
            .append('div')
            .attr('class', 'microchart-tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', 'white')
            .style('padding', '8px')
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('z-index', '1000')
            .style('max-width', '200px')
            .style('word-wrap', 'break-word');

        g.selectAll('.microchart-dot')
            .data(events)
            .enter()
            .append('circle')
            .attr('class', 'microchart-dot')
            .attr('cx', d => d.columnX)
            .attr('cy', d => d.y)
            .attr('r', 3)
            .attr('fill', d => d.color)
            .on('mouseover', function(event, d) {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                tooltip.html(d.title)
                    .style('left', (event.layerX - 10) + 'px')
                    .style('top', (event.layerY - 50) + 'px');

                // Highlight the dot - only add black stroke, don't change size
                d3.select(this)
                    .transition()
                    .duration(100)
                    .style('stroke', '#000')
            })
            .on('mouseout', function(event, d) {
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);
                
                // Reset the dot - remove stroke, keep original size
                d3.select(this)
                    .transition()
                    .duration(100)
                    .style('stroke', '#fff')
            });

        // Cleanup function to remove tooltip when component unmounts or re-renders
        return () => {
            d3.select(containerRef.current).selectAll('.microchart-tooltip').remove();
        };
    }, [data, selection]);

    // Set up ResizeObserver to watch for container size changes
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(() => {
            renderChart();
        });

        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;

        // Initial render
        renderChart();

        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
        };
    }, [renderChart]);

    // Handle indicator positioning based on scroll info
    useEffect(() => {
        if (!scrollInfo || !eventsRef.current.length || !onIndicatorChange) return;

        const { topVisibleYear, scrollPercentage } = scrollInfo;
        const events = eventsRef.current;

        let indicatorY;

        if (scrollPercentage === 1) {
            // Fully scrolled to bottom or no scrolling available - position at last event
            const lastEvent = events[events.length - 1];
            indicatorY = lastEvent.y;
        } else {
            // Find the event that corresponds to the top visible year
            // Find the closest event to the top visible year
            let closestEvent = events[0];
            let minDistance = Math.abs(events[0].startDate - topVisibleYear);

            for (let i = 1; i < events.length; i++) {
                const distance = Math.abs(events[i].startDate - topVisibleYear);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestEvent = events[i];
                }
            }

            indicatorY = closestEvent.y;
        }

        onIndicatorChange(indicatorY);
    }, [scrollInfo, onIndicatorChange]);

    // Add wheel event handler
    const handleWheel = useCallback((event) => {
        if (onScroll) {
            event.preventDefault();
            onScroll(event.deltaY);
        }
    }, [onScroll]);

    return html`
        <div ref=${containerRef} style="width: 100%; height: 100%; border-left: 1px solid #ccc; position: relative;" onWheel=${handleWheel}>
            <svg ref=${svgRef}></svg>
        </div>
    `;
};

export default Microchart;
