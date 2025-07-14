import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { getRangeInfo, getEffectiveColumn, parseDuration } from '../../utils/utils.js';
import { TIME_RANGES, EQUAL_DISTRIBUTION_AREA, PROPORTIONATE_DISTRIBUTION_AREA } from '../../utils/constants.js';
import './microChart.css';

// Constants
const DOT_RADIUS = 3;
const LINE_STROKE_WIDTH = 2;
const TOOLTIP_OFFSET_X = 10;
const TOOLTIP_OFFSET_Y = 50;
const FULL_RANGE = [-4100, 150];
const SCROLL_SENSITIVITY = 125;
const STATIC_COLUMN_COUNT = 10; // Static number of columns

const Microchart = ({ data, selection, onIndicatorChange, scrollInfo }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const eventsRef = useRef([]);
    const resizeObserverRef = useRef(null);
    const lastIndicatorYRef = useRef(null); // Add this ref
    const [scrollOffset, setScrollOffset] = useState(0);
    const [currentViewRange, setCurrentViewRange] = useState(selection);

    const getDimensions = () => {
        const rect = containerRef.current.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    };

    // Calculate era heights using the same logic as MacroChart
    const calculateEraLayout = useCallback((dimensions, viewRange) => {
        const [startYear, endYear] = viewRange;
        
        // Find which TIME_RANGES intersect with our view range
        const relevantRanges = TIME_RANGES.filter(range => 
            !(range.end < startYear || range.start > endYear)
        );
        
        if (relevantRanges.length === 0) {
            // Fallback to simple linear scale if no ranges found
            return {
                ranges: [],
                heights: [],
                positions: [],
                yScale: d3.scaleLinear().domain([startYear, endYear]).range([0, dimensions.height])
            };
        }
        
        // Calculate the actual span of each relevant range within our view
        const actualSpans = relevantRanges.map(range => {
            const actualStart = Math.max(range.start, startYear);
            const actualEnd = Math.min(range.end, endYear);
            return actualEnd - actualStart;
        });
        
        const totalSpan = actualSpans.reduce((sum, span) => sum + span, 0);
        const numRanges = relevantRanges.length;
        
        // Apply the same 75%/25% logic
        const equalPortionHeight = dimensions.height * EQUAL_DISTRIBUTION_AREA;
        const proportionalPortionHeight = dimensions.height * PROPORTIONATE_DISTRIBUTION_AREA;
        const equalHeightPerRange = equalPortionHeight / numRanges;
        
        const heights = actualSpans.map(span => {
            const proportionalHeight = (span / totalSpan) * proportionalPortionHeight;
            return equalHeightPerRange + proportionalHeight;
        });
        
        // Calculate positions
        const positions = [];
        let currentY = 0;
        for (const height of heights) {
            positions.push(currentY);
            currentY += height;
        }
        
        // Create a custom scale function
        const yScale = (year) => {
            // Find which range this year belongs to
            const rangeIndex = relevantRanges.findIndex(range => 
                year >= Math.max(range.start, startYear) && 
                year <= Math.min(range.end, endYear)
            );
            
            if (rangeIndex === -1) {
                // Year is outside our ranges, use linear interpolation
                if (year < startYear) return 0;
                if (year > endYear) return dimensions.height;
                
                // Fallback linear scale
                const progress = (year - startYear) / (endYear - startYear);
                return progress * dimensions.height;
            }
            
            const range = relevantRanges[rangeIndex];
            const rangeStart = Math.max(range.start, startYear);
            const rangeEnd = Math.min(range.end, endYear);
            const rangeSpan = rangeEnd - rangeStart;
            
            if (rangeSpan <= 0) return positions[rangeIndex];
            
            const positionInRange = (year - rangeStart) / rangeSpan;
            return positions[rangeIndex] + (positionInRange * heights[rangeIndex]);
        };
        
        return {
            ranges: relevantRanges,
            heights,
            positions,
            yScale
        };
    }, []);

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
        
        dataset.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color;
            
            if (!byEra[era]) {
                byEra[era] = [];
            }
            
            byEra[era].push(d);
        });

        return { byEra };
    }, []);

    const getColumnX = useCallback((columnNum, maxColumns, width) => {
        const columnWidth = width / maxColumns;
        return (columnNum - 1) * columnWidth + (columnWidth / 2);
    }, []);

    const createEvents = useCallback((filtered, yScale, dimensions, eraData) => {
        const events = [];
        const { byEra } = eraData;
        
        Object.keys(byEra).forEach(era => {
            const eraEvents = byEra[era].filter(d => filtered.includes(d));
            const maxColumns = STATIC_COLUMN_COUNT;
            
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

    // Fixed createLines function - now uses consistent era data and better clipping
    const createLines = useCallback((yScale, dimensions, eraData, viewRange) => {
        const lines = [];
        const { byEra } = eraData;
        const [startYear, endYear] = viewRange;
        
        Object.keys(byEra).forEach(era => {
            const maxColumns = STATIC_COLUMN_COUNT;
            
            byEra[era].forEach(d => {
                const duration = parseDuration(d.fields.duration);
                if (duration < 1) return;

                const rangeInfo = getRangeInfo(d.fields.startDate);
                const column = getEffectiveColumn(d);
                const x = getColumnX(column, maxColumns, dimensions.width);
                
                const lineStart = parseFloat(d.fields.startDate);
                const lineEnd = lineStart + duration;
                
                // Check if line intersects with view range
                const intersects = (
                    (lineStart >= startYear && lineStart <= endYear) ||
                    (lineEnd >= startYear && lineEnd <= endYear) ||
                    (lineStart <= startYear && lineEnd >= endYear)
                );

                if (intersects) {
                    // Calculate Y positions, but don't clamp them yet
                    const startY = yScale(lineStart);
                    const endY = yScale(lineEnd);
                    
                    // Only clamp to viewport if the line extends significantly beyond view
                    // This prevents visual artifacts while still keeping lines contained
                    const buffer = dimensions.height * 0.1; // 10% buffer
                    const y1 = Math.max(-buffer, Math.min(dimensions.height + buffer, startY));
                    const y2 = Math.max(-buffer, Math.min(dimensions.height + buffer, endY));
                    
                    lines.push({
                        x1: x,
                        y1: y1,
                        x2: x,
                        y2: y2,
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
        
        // Use the new era layout calculation
        const eraLayout = calculateEraLayout(dimensions, currentViewRange);
        const yScale = eraLayout.yScale;

        const filtered = data.filter(d => 
            d.fields.startDate >= startYear && d.fields.startDate <= endYear);

        // FIXED: Use the same era data (allEraData) for both events and lines
        // This ensures consistent column positioning
        const allEraData = processEraData(data);

        const events = createEvents(filtered, yScale, dimensions, allEraData);
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
    }, [data, currentViewRange, getDimensions, calculateEraLayout, processEraData, createEvents, createLines, createTooltip]);

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
            indicatorY = null;
        } else if (scrollPercentage === 1 && events.length > 0) {
            const lastEvent = events[events.length - 1];
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

        // Only call onIndicatorChange if the value has actually changed
        if (indicatorY !== lastIndicatorYRef.current) {
            lastIndicatorYRef.current = indicatorY;
            onIndicatorChange(indicatorY);
        }
    }, [scrollInfo?.topVisibleYear, scrollInfo?.scrollPercentage, onIndicatorChange, currentViewRange]);

    return (
        <div ref={containerRef} className="microchart-root">
            <svg ref={svgRef}></svg>
        </div>
    );
};

export default Microchart;