import React, { useRef, useEffect, useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import * as d3 from 'd3';
import { eventsFullData, peopleFullData, placesFullData } from './teststuff.js';
import { 
    formatYear, 
    parseDuration, 
    getRangeInfo, 
    calculateColumns, 
    getEffectiveColumn, 
    calculateDimensions,
    formatDuration,
    formatParticipants,
    formatLocations,
    formatVerses
} from './utils.jsx';
import { PERIODS, DETAIL_FIELDS, TIME_RANGES } from './const.js';
import './testindex.css';

// Macrochart constants
const EQUAL_DISTRIBUTION_AREA = 0.5;
const PROPORTIONATE_DISTRIBUTION_AREA = 0.5;
const YEAR_LABEL_INTERVAL = 500;
const YEAR_LABEL_RANGE_START = -4000;
const YEAR_LABEL_RANGE_END = 0;
const LABEL_MARGIN = 15;
const LABEL_LINE_LENGTH = 10;
const COLOR_BAR_WIDTH_RATIO = 1/6;

// Microchart constants
const DOT_RADIUS = 3;
const LINE_STROKE_WIDTH = 2;
const TOOLTIP_OFFSET_X = 10;
const TOOLTIP_OFFSET_Y = 50;
const STATIC_COLUMN_COUNT = 10;
const FULL_RANGE = [-4100, 150];

const EventsTimeline = () => {
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const [expandedEvents, setExpandedEvents] = useState(new Set());

    const macroContainerRef = useRef(null);
    const macroSvgRef = useRef(null);
    const microContainerRef = useRef(null);
    const microSvgRef = useRef(null);
    const eventDisplayRef = useRef(null);
    const macroIndicatorRef = useRef(null);
    const microIndicatorRef = useRef(null);

    // Process events with proper column calculation on mount
    const [processedEvents, setProcessedEvents] = useState([]);

    useEffect(() => {
        const eventsWithColumns = calculateColumns(eventsFullData);
        setProcessedEvents(eventsWithColumns);
    }, []);

    // Calculate macro layout
    const calculateMacroLayout = useCallback((dimensions) => {
        const totalSpan = TIME_RANGES.reduce((sum, range) => 
            sum + Math.abs(range.end - range.start), 0);
        
        const numRanges = TIME_RANGES.length;
        const equalPortionHeight = dimensions.height * EQUAL_DISTRIBUTION_AREA;
        const proportionalPortionHeight = dimensions.height * PROPORTIONATE_DISTRIBUTION_AREA;
        const equalHeightPerRange = equalPortionHeight / numRanges;
        
        const heights = TIME_RANGES.map(range => {
            const span = Math.abs(range.end - range.start);
            const proportionalHeight = (span / totalSpan) * proportionalPortionHeight;
            return equalHeightPerRange + proportionalHeight;
        });

        const positions = [];
        let currentY = 0;
        for (const height of heights) {
            positions.push(currentY);
            currentY += height;
        }

        return { heights, positions };
    }, []);

    // Create macro converters
    const createMacroConverters = useCallback((dimensions, { heights, positions }) => {
        const yearToPixel = (year) => {
            const rangeIndex = TIME_RANGES.findIndex(range => 
                year >= range.start && year <= range.end);
            
            if (rangeIndex === -1) {
                if (year < TIME_RANGES[0].start) return positions[0];
                if (year > TIME_RANGES[TIME_RANGES.length - 1].end) return dimensions.height;
                return 0;
            }
            
            const range = TIME_RANGES[rangeIndex];
            const rangeSpan = range.end - range.start;
            const positionInRange = (year - range.start) / rangeSpan;
            
            return positions[rangeIndex] + (positionInRange * heights[rangeIndex]);
        };

        const pixelToYear = (pixel) => {
            let rangeIndex = TIME_RANGES.length - 1;
            for (let i = 0; i < positions.length - 1; i++) {
                if (pixel < positions[i + 1]) {
                    rangeIndex = i;
                    break;
                }
            }

            const range = TIME_RANGES[rangeIndex];
            const rangeStart = positions[rangeIndex];
            const rangeHeight = heights[rangeIndex];

            if (rangeHeight <= 0) return range.start;

            const pixelIntoRange = pixel - rangeStart;
            const proportion = pixelIntoRange / rangeHeight;
            const yearSpan = range.end - range.start;
            return range.start + (proportion * yearSpan);
        };

        return { yearToPixel, pixelToYear };
    }, []);

    // Calculate micro era layout
    const calculateMicroEraLayout = useCallback((dimensions, viewRange) => {
        const [startYear, endYear] = viewRange;
        
        const relevantRanges = TIME_RANGES.filter(range => 
            !(range.end < startYear || range.start > endYear)
        );
        
        if (relevantRanges.length === 0) {
            return {
                ranges: [],
                heights: [],
                positions: [],
                yScale: (year) => {
                    const progress = (year - startYear) / (endYear - startYear);
                    return progress * dimensions.height;
                }
            };
        }
        
        const actualSpans = relevantRanges.map(range => {
            const actualStart = Math.max(range.start, startYear);
            const actualEnd = Math.min(range.end, endYear);
            return actualEnd - actualStart;
        });
        
        const totalSpan = actualSpans.reduce((sum, span) => sum + span, 0);
        const numRanges = relevantRanges.length;
        
        const equalPortionHeight = dimensions.height * EQUAL_DISTRIBUTION_AREA;
        const proportionalPortionHeight = dimensions.height * PROPORTIONATE_DISTRIBUTION_AREA;
        const equalHeightPerRange = equalPortionHeight / numRanges;
        
        const heights = actualSpans.map(span => {
            const proportionalHeight = (span / totalSpan) * proportionalPortionHeight;
            return equalHeightPerRange + proportionalHeight;
        });
        
        const positions = [];
        let currentY = 0;
        for (const height of heights) {
            positions.push(currentY);
            currentY += height;
        }
        
        const yScale = (year) => {
            const rangeIndex = relevantRanges.findIndex(range => 
                year >= Math.max(range.start, startYear) && 
                year <= Math.min(range.end, endYear)
            );
            
            if (rangeIndex === -1) {
                if (year < startYear) return 0;
                if (year > endYear) return dimensions.height;
                
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
        
        return { ranges: relevantRanges, heights, positions, yScale };
    }, []);

    // Render macrochart
    const renderMacrochart = useCallback(() => {
        if (!macroSvgRef.current || !macroContainerRef.current) return;

        const dimensions = calculateDimensions(macroContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;

        const layout = calculateMacroLayout(dimensions);
        const converters = createMacroConverters(dimensions, layout);

        const svg = d3.select(macroSvgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        // Clear previous content
        svg.selectAll('*').remove();

        // Create color bars
        const width = dimensions.width * COLOR_BAR_WIDTH_RATIO;
        const x = dimensions.width - width;
        
        svg.selectAll('.era-rect')
            .data(TIME_RANGES)
            .enter()
            .append('rect')
            .attr('class', 'era-rect')
            .attr('x', x)
            .attr('y', (d, i) => layout.positions[i])
            .attr('width', width)
            .attr('height', (d, i) => layout.heights[i])
            .attr('fill', d => d.color);

        // Create year markers
        const lineStart = x - LABEL_LINE_LENGTH;
        const years = [];
        for (let year = YEAR_LABEL_RANGE_START; year <= YEAR_LABEL_RANGE_END; year += YEAR_LABEL_INTERVAL) {
            years.push(year);
        }
        if (!years.includes(YEAR_LABEL_RANGE_END)) {
            years.push(YEAR_LABEL_RANGE_END);
        }

        svg.selectAll('.year-line')
            .data(years)
            .enter()
            .append('line')
            .attr('class', 'year-line')
            .attr('x1', lineStart)
            .attr('y1', converters.yearToPixel)
            .attr('x2', x)
            .attr('y2', converters.yearToPixel)
            .attr('stroke', '#000')
            .attr('stroke-width', 1);

        svg.selectAll('.year-label')
            .data(years)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', x - LABEL_MARGIN)
            .attr('y', d => converters.yearToPixel(d) + 5)
            .attr('text-anchor', 'end')
            .attr('font-size', '12px')
            .attr('fill', '#000')
            .text(d => d === 0 ? 'BC|AD' : `${Math.abs(d)} BC`);
    }, [calculateMacroLayout, createMacroConverters]);

    // Render microchart
    const renderMicrochart = useCallback(() => {
        if (!microSvgRef.current || !microContainerRef.current || !processedEvents.length) return;

        const dimensions = calculateDimensions(microContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;

        // Use full range for initial load
        const currentViewRange = FULL_RANGE;
        const [startYear, endYear] = currentViewRange;
        
        const eraLayout = calculateMicroEraLayout(dimensions, currentViewRange);
        const yScale = eraLayout.yScale;

        const filtered = processedEvents.filter(d => 
            d.fields.startDate >= startYear && d.fields.startDate <= endYear);

        // Process events by era
        const byEra = {};
        
        processedEvents.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color;
            
            if (!byEra[era]) {
                byEra[era] = [];
            }
            
            byEra[era].push(d);
        });

        // Create events and lines
        const processedEventsForDisplay = [];
        const lines = [];
        
        Object.keys(byEra).forEach(era => {
            const eraEvents = byEra[era].filter(d => filtered.includes(d));
            const maxColumns = STATIC_COLUMN_COUNT;
            
            eraEvents.forEach(d => {
                const rangeInfo = getRangeInfo(d.fields.startDate);
                const column = getEffectiveColumn(d);
                const columnWidth = dimensions.width / maxColumns;
                const x = (column - 1) * columnWidth + (columnWidth / 2);
                const y = yScale(d.fields.startDate);

                processedEventsForDisplay.push({
                    ...d.fields,
                    color: rangeInfo.color,
                    columnX: x,
                    y
                });

                // Add lines for events with duration
                const duration = parseDuration(d.fields.duration);
                if (duration >= 1) {
                    const lineStart = parseFloat(d.fields.startDate);
                    const lineEnd = lineStart + duration;
                    
                    const intersects = (
                        (lineStart >= startYear && lineStart <= endYear) ||
                        (lineEnd >= startYear && lineEnd <= endYear) ||
                        (lineStart <= startYear && lineEnd >= endYear)
                    );

                    if (intersects) {
                        const startY = yScale(lineStart);
                        const endY = yScale(lineEnd);
                        
                        const buffer = dimensions.height * 0.1;
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
                }
            });
        });

        // Remove old tooltip
        const oldTooltip = microContainerRef.current.querySelector('.microchart-tooltip');
        if (oldTooltip) {
            oldTooltip.remove();
        }

        const svg = d3.select(microSvgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        // Clear previous content
        svg.selectAll('*').remove();
        const g = svg.append('g').attr('class', 'microchart-group');

        // Draw lines
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

        // Create tooltip
        let tooltip = d3.select(microContainerRef.current).select('.microchart-tooltip');
        if (tooltip.empty()) {
            tooltip = d3.select(microContainerRef.current)
                .append('div')
                .attr('class', 'microchart-tooltip')
                .style('opacity', 0)
                .style('position', 'absolute')
                .style('background', 'rgba(0, 0, 0, 0.8)')
                .style('color', 'white')
                .style('padding', '5px')
                .style('border-radius', '3px')
                .style('font-size', '12px')
                .style('pointer-events', 'none');
        }

        // Draw dots
        g.selectAll('.microchart-dot')
            .data(processedEventsForDisplay)
            .enter()
            .append('circle')
            .attr('class', 'microchart-dot')
            .attr('cx', d => d.columnX)
            .attr('cy', d => d.y)
            .attr('r', DOT_RADIUS)
            .attr('fill', d => d.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
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
    }, [calculateMicroEraLayout, processedEvents]);

    // Events stuff
    const groupEventsByYear = useCallback((events) => {
        const groups = {};
        
        events.forEach(event => {
            const key = event.fields.startDate;
            if (!groups[key]) groups[key] = [];
            groups[key].push(event);
        });
        
        return Object.keys(groups)
            .sort((a, b) => Number(a) - Number(b))
            .map(key => ({ year: Number(key), events: groups[key] }));
    }, []);

    const createEventItem = useCallback((event) => {
        const eventItem = document.createElement('div');
        eventItem.className = 'event-item';

        const triangle = document.createElement('button');
        triangle.className = 'event-triangle';
        triangle.textContent = '▶';
        triangle.setAttribute('aria-label', 'Expand event details');

        const eventContent = document.createElement('div');
        eventContent.className = 'event-content';

        const eventTitle = document.createElement('div');
        eventTitle.className = 'event-title';
        eventTitle.textContent = event.fields.title;
        eventContent.appendChild(eventTitle);

        const isExpanded = expandedEvents.has(event.fields.title);
        if (isExpanded) {
            triangle.classList.add('expanded');
            triangle.setAttribute('aria-label', 'Collapse event details');

            // Add detail fields using proper formatters
            const detailFields = [
                { key: 'duration', label: 'Duration', formatter: formatDuration },
                { key: 'participants', label: 'Participants', formatter: (val) => formatParticipants(val, peopleFullData) },
                { key: 'groups', label: 'Groups' },
                { key: 'locations', label: 'Locations', formatter: (val) => formatLocations(val, placesFullData) },
                { key: 'verses', label: 'Verses', formatter: formatVerses },
                { key: 'partOf', label: 'Part Of' },
                { key: 'predecessor', label: 'Predecessor' },
                { key: 'lag', label: 'Lag', formatter: formatDuration },
                { key: 'lagType', label: 'Lag Type' },
                { key: 'notes', label: 'Notes' }
            ];

            detailFields.forEach(field => {
                if (event.fields[field.key]) {
                    const detail = document.createElement('div');
                    detail.className = 'event-detail';
                    const value = field.formatter ? field.formatter(event.fields[field.key]) : event.fields[field.key];
                    
                    // Handle React elements (like formatted participants/locations/verses)
                    if (React.isValidElement(value)) {
                        const tempDiv = document.createElement('div');
                        ReactDOM.render(value, tempDiv);
                        detail.innerHTML = `${field.label}: ${tempDiv.innerHTML}`;
                    } else {
                        detail.textContent = `${field.label}: ${value}`;
                    }
                    eventContent.appendChild(detail);
                }
            });
        }

        triangle.addEventListener('click', () => {
            const newExpanded = new Set(expandedEvents);
            if (newExpanded.has(event.fields.title)) {
                newExpanded.delete(event.fields.title);
            } else {
                newExpanded.add(event.fields.title);
            }
            setExpandedEvents(newExpanded);
        });

        eventItem.appendChild(triangle);
        eventItem.appendChild(eventContent);
        return eventItem;
    }, [expandedEvents]);

    const updateEventDisplay = useCallback(() => {
        if (!eventDisplayRef.current || !processedEvents.length) return;

        const groupedEvents = groupEventsByYear(processedEvents);
        const container = eventDisplayRef.current;
        const fragment = document.createDocumentFragment();
        
        const floatingHeader = document.createElement('div');
        floatingHeader.className = 'floating-header';
        floatingHeader.style.display = 'none';
        fragment.appendChild(floatingHeader);

        if (groupedEvents.length === 0) {
            const noEvents = document.createElement('p');
            noEvents.textContent = 'No events to display.';
            fragment.appendChild(noEvents);
        } else {
            groupedEvents.forEach(group => {
                const yearHeader = document.createElement('h3');
                yearHeader.className = 'event-year-header';
                yearHeader.textContent = formatYear(group.year);
                fragment.appendChild(yearHeader);

                group.events.forEach(event => {
                    fragment.appendChild(createEventItem(event));
                });
            });
        }

        container.innerHTML = '';
        container.appendChild(fragment);
    }, [groupEventsByYear, createEventItem, processedEvents]);

    const handlePeriodChange = useCallback((event) => {
        setSelectedPeriod(event.target.value);
    }, []);

    // Refactored chart setup with shared ResizeObserver logic
    const setupChart = useCallback((containerRef, svgRef, renderFunction, chartName) => {
        if (!containerRef.current) return null;

        // Create SVG element if it doesn't exist
        if (!svgRef.current) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            containerRef.current.appendChild(svg);
            svgRef.current = svg;
        }

        // Initial render
        renderFunction();

        // Setup resize observer
        const resizeObserver = new ResizeObserver(() => {
            window.requestAnimationFrame(() => {
                if (containerRef.current) {
                    renderFunction();
                }
            });
        });

        resizeObserver.observe(containerRef.current);

        return resizeObserver;
    }, []);

    // Setup charts on mount and resize
    useEffect(() => {
        if (!processedEvents.length) return;

        const macroObserver = setupChart(macroContainerRef, macroSvgRef, renderMacrochart, 'macro');
        const microObserver = setupChart(microContainerRef, microSvgRef, renderMicrochart, 'micro');

        return () => {
            if (macroObserver) macroObserver.disconnect();
            if (microObserver) microObserver.disconnect();
        };
    }, [setupChart, renderMacrochart, renderMicrochart, processedEvents]);

    useEffect(() => {
        updateEventDisplay();
    }, [updateEventDisplay, expandedEvents]);

    return (
        <div className="page-container">
            <div className="content-wrapper">
                <header className="header">
                    <h1 style={{ color: "black" }}><i>Timeline of the Bible</i></h1>
                    <div className="header-controls">
                        <div className="order-1">
                            <form>
                                <ul id="people-legend">
                                    {PERIODS.map(period => (
                                        <li key={period.value}>
                                            <input 
                                                id={`people-legend-${period.value}`}
                                                type="radio" 
                                                name="people-legend" 
                                                value={period.value}
                                                checked={selectedPeriod === period.value}
                                                onChange={handlePeriodChange} 
                                            />
                                            <label htmlFor={`people-legend-${period.value}`}>
                                                {period.label}
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            </form>
                        </div>
                    </div>
                </header>
                <div className="timeline-container">
                    <div className="sidebar">
                        <div className="macrochart-container" ref={macroContainerRef}>
                            <div ref={macroIndicatorRef} className="position-indicator"></div>
                        </div>
                        <div className="microchart-container" ref={microContainerRef}>
                            <div ref={microIndicatorRef} className="microchart-position-indicator"></div>
                        </div>
                    </div>
                    <div className="event-display-container" ref={eventDisplayRef}></div>
                </div>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EventsTimeline />
  </React.StrictMode>
);