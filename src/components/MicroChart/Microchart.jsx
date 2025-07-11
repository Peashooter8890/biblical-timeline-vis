import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { getRangeInfo, getEffectiveColumn, parseDuration } from '../../utils/utils.js';
import './microChart.css';

// Constants
const DOT_RADIUS = 3;
const LINE_STROKE_WIDTH = 2;
const TOOLTIP_OFFSET_X = 10;
const TOOLTIP_OFFSET_Y = 50;
const FULL_RANGE = [-4100, 150];
const SCROLL_SENSITIVITY = 50; // Years per scroll unit

const Microchart = ({ data, selection, onIndicatorChange, scrollInfo }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const eventsRef = useRef([]);
    const resizeObserverRef = useRef(null);
    const [scrollOffset, setScrollOffset] = useState(0);
    const [currentViewRange, setCurrentViewRange] = useState(selection);

    const getDimensions = () => {
        const rect = containerRef.current.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    };

    // Calculate the actual view range based on selection and scroll offset
    const calculateViewRange = useCallback((selectionRange, offset) => {
        const [selStart, selEnd] = selectionRange;
        const windowSize = selEnd - selStart;
        const [fullStart, fullEnd] = FULL_RANGE;
        
        // Apply scroll offset
        let viewStart = selStart + offset;
        let viewEnd = selEnd + offset;
        
        // Clamp to full range
        if (viewStart < fullStart) {
            viewStart = fullStart;
            viewEnd = fullStart + windowSize;
        }
        if (viewEnd > fullEnd) {
            viewEnd = fullEnd;
            viewStart = fullEnd - windowSize;
        }
        
        return [viewStart, viewEnd];
    }, []);

    // Handle scroll events
    useEffect(() => {
        const handleWheel = (event) => {
            event.preventDefault();
            
            const delta = event.deltaY > 0 ? SCROLL_SENSITIVITY : -SCROLL_SENSITIVITY;
            const currentRange = calculateViewRange(selection, scrollOffset);
            const [fullStart, fullEnd] = FULL_RANGE;
            
            // Check if we're at bounds and trying to scroll further in that direction
            const atTopBound = currentRange[0] <= fullStart;
            const atBottomBound = currentRange[1] >= fullEnd;
            const scrollingUp = delta < 0;
            const scrollingDown = delta > 0;
            
            // Don't accumulate scroll if we're at bounds and trying to scroll further
            if ((atTopBound && scrollingUp) || (atBottomBound && scrollingDown)) {
                return;
            }
            
            const newOffset = scrollOffset + delta;
            const testRange = calculateViewRange(selection, newOffset);
            
            // Only update if the new range is within bounds
            if (testRange[0] >= fullStart && testRange[1] <= fullEnd) {
                setScrollOffset(newOffset);
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
            return () => container.removeEventListener('wheel', handleWheel);
        }
    }, [scrollOffset, selection, calculateViewRange]);

    // Update current view range when selection or scroll offset changes
    useEffect(() => {
        const newViewRange = calculateViewRange(selection, scrollOffset);
        setCurrentViewRange(newViewRange);
    }, [selection, scrollOffset, calculateViewRange]);

    // Reset scroll offset when selection changes significantly
    useEffect(() => {
        setScrollOffset(0);
    }, [selection]);

    const processEraData = useCallback((dataset) => {
        const byEra = {};
        const columnCounts = {};
        
        dataset.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color;
            const column = getEffectiveColumn(d);
            
            if (!byEra[era]) {
                byEra[era] = [];
                columnCounts[era] = 0;
            }
            
            byEra[era].push(d);
            columnCounts[era] = Math.max(columnCounts[era], column);
        });

        return { byEra, columnCounts };
    }, []);

    const getColumnX = useCallback((columnNum, maxColumns, width) => {
        const columnWidth = width / maxColumns;
        return (columnNum - 1) * columnWidth + (columnWidth / 2);
    }, []);

    const createEvents = useCallback((filtered, yScale, dimensions, eraData) => {
        const events = [];
        const { byEra, columnCounts } = eraData;
        
        Object.keys(byEra).forEach(era => {
            const eraEvents = byEra[era].filter(d => filtered.includes(d));
            const maxColumns = columnCounts[era];
            
            eraEvents.forEach(d => {
                const rangeInfo = getRangeInfo(d.fields.startDate);
                const column = getEffectiveColumn(d);
                const x = getColumnX(column, maxColumns, dimensions.width);
                const y = yScale(d.fields.startDate);

                events.push({
                    ...d.fields,
                    color: rangeInfo.color,
                    columnX: x,
                    y
                });
            });
        });

        return events.sort((a, b) => a.startDate - b.startDate);
    }, [getColumnX]);

    const createLines = useCallback((yScale, dimensions, eraData, viewRange) => {
        const lines = [];
        const { byEra, columnCounts } = eraData;
        const [startYear, endYear] = viewRange;
        
        Object.keys(byEra).forEach(era => {
            const maxColumns = columnCounts[era];
            
            byEra[era].forEach(d => {
                const duration = parseDuration(d.fields.duration);
                if (duration < 1) return;

                const rangeInfo = getRangeInfo(d.fields.startDate);
                const column = getEffectiveColumn(d);
                const x = getColumnX(column, maxColumns, dimensions.width);
                const startY = yScale(d.fields.startDate);
                const endY = yScale(parseFloat(d.fields.startDate) + duration);

                const lineStart = parseFloat(d.fields.startDate);
                const lineEnd = lineStart + duration;
                
                const intersects = (
                    (lineStart >= startYear && lineStart <= endYear) ||
                    (lineEnd >= startYear && lineEnd <= endYear) ||
                    (lineStart <= startYear && lineEnd >= endYear)
                );

                if (intersects) {
                    lines.push({
                        x1: x,
                        y1: Math.max(0, Math.min(dimensions.height, startY)),
                        x2: x,
                        y2: Math.max(0, Math.min(dimensions.height, endY)),
                        color: rangeInfo.color
                    });
                }
            });
        });

        return lines;
    }, [getColumnX]);

    const createTooltip = useCallback((container) => {
        return d3.select(container)
            .append('div')
            .attr('class', 'microchart-tooltip')
            .style('opacity', 0);
    }, []);

    const renderChart = useCallback(() => {
        if (!svgRef.current || !containerRef.current || !data.length) return;

        const dimensions = getDimensions();
        const [startYear, endYear] = currentViewRange;
        const yScale = d3.scaleLinear()
            .domain([startYear, endYear])
            .range([0, dimensions.height]);

        const filtered = data.filter(d => 
            d.fields.startDate >= startYear && d.fields.startDate <= endYear);

        const filteredEraData = processEraData(filtered);
        const allEraData = processEraData(data);

        const events = createEvents(filtered, yScale, dimensions, filteredEraData);
        const lines = createLines(yScale, dimensions, allEraData, currentViewRange);

        eventsRef.current = events;

        d3.select(containerRef.current).selectAll('.microchart-tooltip').remove();

        const svg = d3.select(svgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        svg.selectAll('*').remove();

        const g = svg.append('g');

        // Draw lines first
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
            .style('stroke-width', `${LINE_STROKE_WIDTH}px`);

        const tooltip = createTooltip(containerRef.current);

        // Draw dots
        g.selectAll('.microchart-dot')
            .data(events)
            .enter()
            .append('circle')
            .attr('class', 'microchart-dot')
            .attr('cx', d => d.columnX)
            .attr('cy', d => d.y)
            .attr('r', DOT_RADIUS)
            .attr('fill', d => d.color)
            .on('mouseover', function(event, d) {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                tooltip.html(d.title)
                    .style('left', (event.layerX - TOOLTIP_OFFSET_X) + 'px')
                    .style('top', (event.layerY - TOOLTIP_OFFSET_Y) + 'px');

                d3.select(this)
                    .transition()
                    .duration(100)
                    .style('stroke', '#000');
            })
            .on('mouseout', function() {
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);
                
                d3.select(this)
                    .transition()
                    .duration(100)
                    .style('stroke', '#fff');
            });

        return () => {
            d3.select(containerRef.current).selectAll('.microchart-tooltip').remove();
        };
    }, [data, currentViewRange, getDimensions, processEraData, createEvents, createLines, createTooltip]);

    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(() => renderChart());
        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;

        renderChart();

        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
        };
    }, [renderChart]);

    useEffect(() => {
        if (!scrollInfo || !eventsRef.current.length || !onIndicatorChange) return;

        const { topVisibleYear, scrollPercentage } = scrollInfo;
        const events = eventsRef.current;
        const [viewStart, viewEnd] = currentViewRange;

        let indicatorY = null;

        // Only show indicator if the topVisibleYear is within our current view range
        if (topVisibleYear < viewStart || topVisibleYear > viewEnd) {
            onIndicatorChange(null);
            return;
        }

        if (scrollPercentage === 1 && events.length > 0) {
            const lastEvent = events[events.length - 1];
            // Double-check the last event is within view (should be, but being safe)
            if (lastEvent.startDate >= viewStart && lastEvent.startDate <= viewEnd) {
                indicatorY = lastEvent.y;
            }
        } else {
            let closest = null;
            let minDistance = Infinity;

            for (let i = 0; i < events.length; i++) {
                const event = events[i];
                // Events should all be in view, but double-checking
                if (event.startDate >= viewStart && event.startDate <= viewEnd) {
                    const distance = Math.abs(event.startDate - topVisibleYear);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closest = event;
                    }
                }
            }

            if (closest) {
                indicatorY = closest.y;
            }
        }

        onIndicatorChange(indicatorY);
    }, [scrollInfo, onIndicatorChange, currentViewRange]);

    return (
        <div ref={containerRef} className="microchart-root">
            <svg ref={svgRef}></svg>
        </div>
    );
};

export default Microchart;