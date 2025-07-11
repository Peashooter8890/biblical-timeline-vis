import React, { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { getRangeInfo, getEffectiveColumn, parseDuration } from '../../utils/utils.js';
import './microChart.css';

const Microchart = ({ data, selection, onIndicatorChange, scrollInfo, onScroll }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const eventsRef = useRef([]);
    const resizeObserverRef = useRef(null);

    const getDimensions = useCallback(() => {
        const rect = containerRef.current.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }, []);

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

    const createLines = useCallback((yScale, dimensions, eraData, [startYear, endYear]) => {
        const lines = [];
        const { byEra, columnCounts } = eraData;
        
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
    }, []);

    const renderChart = useCallback(() => {
        if (!svgRef.current || !containerRef.current || !data.length || !selection) return;

        const dimensions = getDimensions();
        const [startYear, endYear] = selection;
        const yScale = d3.scaleLinear()
            .domain([startYear, endYear])
            .range([0, dimensions.height]);

        const filtered = data.filter(d => 
            d.fields.startDate >= startYear && d.fields.startDate <= endYear);

        const filteredEraData = processEraData(filtered);
        const allEraData = processEraData(data);

        const events = createEvents(filtered, yScale, dimensions, filteredEraData);
        const lines = createLines(yScale, dimensions, allEraData, selection);

        eventsRef.current = events;

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
            .style('stroke-width', '2px');

        const tooltip = createTooltip(containerRef.current);

        // Draw dots
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
    }, [data, selection, getDimensions, processEraData, createEvents, createLines, createTooltip]);

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

        let indicatorY;

        if (scrollPercentage === 1) {
            indicatorY = events[events.length - 1].y;
        } else {
            let closest = events[0];
            let minDistance = Math.abs(events[0].startDate - topVisibleYear);

            for (let i = 1; i < events.length; i++) {
                const distance = Math.abs(events[i].startDate - topVisibleYear);
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = events[i];
                }
            }

            indicatorY = closest.y;
        }

        onIndicatorChange(indicatorY);
    }, [scrollInfo, onIndicatorChange]);

    const handleWheel = useCallback((event) => {
        if (onScroll) {
            event.preventDefault();
            onScroll(event.deltaY);
        }
    }, [onScroll]);

    return (
        <div 
            ref={containerRef} 
            style={{width: '100%', height: '100%', borderLeft: '1px solid #ccc', position: 'relative'}} 
            onWheel={handleWheel}
        >
            <svg ref={svgRef}></svg>
        </div>
    );
};

export default Microchart;