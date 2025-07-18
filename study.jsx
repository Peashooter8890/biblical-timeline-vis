import React, { useState, useEffect, useRef, useMemo, useContext, createContext, memo } from 'react';
import ReactDOM from 'react-dom/client';
import { eventsFullData, peopleFullData, placesFullData } from './teststuff.js';

// ============================================================================
// CONSTANTS & UTILS
// ============================================================================

const TIME_RANGES = [
    { start: -4100, end: -2200, color: '#5795ff' },
    { start: -2199, end: -1600, color: '#ff7f00' },
    { start: -1599, end: -1375, color: '#fc8eac' },
    { start: -1374, end: -1052, color: '#89b4c3' },
    { start: -1051, end: -931,  color: '#b2df8a' },
    { start: -930,  end: -715,  color: '#fdbf6f' },
    { start: -714,  end: -431,  color: '#cab2d6' },
    { start: -430,  end: -1,    color: '#FFB6C1' },
    { start: 0,     end: 150,   color: '#C4A484' }
];

const TIME_PERIODS = {
    'all': [-4100, 150],
    'period1': [-4100, -3000],
    'period2': [-2999, -2000], 
    'period3': [-1999, -1000],
    'period4': [-999, 0],
    'period5': [1, 150]
};

const PERIODS = [
    { value: 'all', label: 'ALL' },
    { value: 'period1', label: '4101 BC - 3001 BC' },
    { value: 'period2', label: '3000 BC - 2001 BC' },
    { value: 'period3', label: '2000 BC - 1001 BC' },
    { value: 'period4', label: '1000 BC - 1 BC' },
    { value: 'period5', label: '1 AD - 150 AD' }
];

// Utility functions
const formatYear = (year) => {
    if (year < 0) return `${Math.abs(year) + 1} BC`;
    if (year > 0) return `${year} AD`;
    return 0;
};

const getRangeInfo = (startDate) => {
    const range = TIME_RANGES.find(r => startDate >= r.start && startDate <= r.end);
    if (!range) return { color: '#ccc', span: 1 };
    const span = Math.abs(range.end - range.start);
    return { ...range, span: span > 0 ? span : 1 };
};

const parseDuration = (durationStr) => {
    if (!durationStr) return 0;
    const value = parseFloat(durationStr);
    if (durationStr.toUpperCase().includes('D')) return value / 365.25;
    if (durationStr.toUpperCase().includes('Y')) return value;
    return value;
};

const getEffectiveColumn = (event) => {
    if (event.fields.column && event.fields.column.trim() !== '') {
        return parseFloat(event.fields.column);
    }
    if (event.fields.customColumn) {
        return parseFloat(event.fields.customColumn);
    }
    return 5;
};

// ============================================================================
// DATA PROCESSING
// ============================================================================

const processEventData = (rawData) => {
    // Process columns
    const eventsByDate = {};
    
    rawData.forEach((event, index) => {
        const startDate = event.fields.startDate;
        if (!eventsByDate[startDate]) {
            eventsByDate[startDate] = [];
        }
        eventsByDate[startDate].push({ ...event, originalIndex: index });
    });
    
    // Calculate custom columns for events without predefined columns
    Object.keys(eventsByDate).forEach(startDate => {
        const events = eventsByDate[startDate];
        
        if (events.length > 1) {
            events.sort((a, b) => parseFloat(b.fields.sortKey) - parseFloat(a.fields.sortKey));
            
            let i = 0;
            while (i < events.length) {
                const event = events[i];
                
                if (event.fields.column && event.fields.column.trim() !== '') {
                    i++;
                    continue;
                }
                
                const groupStart = i;
                let groupEnd = i;
                
                while (groupEnd < events.length && 
                       (!events[groupEnd].fields.column || events[groupEnd].fields.column.trim() === '')) {
                    groupEnd++;
                }
                groupEnd--;
                
                let leftBound = 0;
                if (groupStart > 0) {
                    const leftEvent = events[groupStart - 1];
                    if (leftEvent.fields.column && leftEvent.fields.column.trim() !== '') {
                        leftBound = parseFloat(leftEvent.fields.column);
                    }
                }
                
                let rightBound = 10;
                if (groupEnd < events.length - 1) {
                    const rightEvent = events[groupEnd + 1];
                    if (rightEvent.fields.column && rightEvent.fields.column.trim() !== '') {
                        rightBound = parseFloat(rightEvent.fields.column);
                    }
                }
                
                const groupSize = groupEnd - groupStart + 1;
                for (let j = groupStart; j <= groupEnd; j++) {
                    const positionInGroup = j - groupStart;
                    const column = leftBound + (rightBound - leftBound) * (positionInGroup + 1) / (groupSize + 1);
                    events[j].fields.customColumn = column.toString();
                }
                
                i = groupEnd + 1;
            }
        } else if (events.length === 1) {
            const event = events[0];
            if (!event.fields.column || event.fields.column.trim() === '') {
                event.fields.customColumn = '5';
            }
        }
    });
    
    // Clean and return processed data
    const result = new Array(rawData.length);
    Object.values(eventsByDate).forEach(events => {
        events.forEach(event => {
            // Clean date format
            if (event.fields.startDate && event.fields.startDate.includes('-')) {
                const dashIndex = event.fields.startDate.indexOf('-');
                if (dashIndex > 0) {
                    event.fields.startDate = event.fields.startDate.substring(0, dashIndex);
                }
            }
            
            // Trim leading zeros
            if (event.fields.startDate && typeof event.fields.startDate === 'string') {
                event.fields.startDate = event.fields.startDate.replace(/^0+/, '') || '0';
            }
            
            result[event.originalIndex] = event;
            delete result[event.originalIndex].originalIndex;
        });
    });
    
    return result.sort((a, b) => a.fields.startDate - b.fields.startDate);
};

// ============================================================================
// CONTEXT FOR SHARED STATE
// ============================================================================

const TimelineContext = createContext();

const TimelineProvider = ({ children }) => {
    const [events] = useState(() => processEventData(eventsFullData));
    const [selection, setSelection] = useState(TIME_PERIODS.all);
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const [isCustomRange, setIsCustomRange] = useState(false);
    const [scrollInfo, setScrollInfo] = useState(null);

    const value = {
        events,
        selection,
        setSelection,
        selectedPeriod,
        setSelectedPeriod,
        isCustomRange,
        setIsCustomRange,
        scrollInfo,
        setScrollInfo
    };

    return (
        <TimelineContext.Provider value={value}>
            {children}
        </TimelineContext.Provider>
    );
};

const useTimeline = () => {
    const context = useContext(TimelineContext);
    if (!context) {
        throw new Error('useTimeline must be used within TimelineProvider');
    }
    return context;
};

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

const useResizeObserver = (ref, callback) => {
    useEffect(() => {
        if (!ref.current) return;

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(callback);
        });

        resizeObserver.observe(ref.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, [callback]);
};

const useDimensions = (ref) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useResizeObserver(ref, () => {
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            setDimensions({ width: rect.width, height: rect.height });
        }
    });

    return dimensions;
};

// ============================================================================
// MACRO CHART COMPONENT
// ============================================================================

const MacroChart = memo(() => {
    const { events, selection, setSelection, setSelectedPeriod, setIsCustomRange } = useTimeline();
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const dimensions = useDimensions(containerRef);

    // Calculate layout
    const layout = useMemo(() => {
        if (dimensions.width === 0 || dimensions.height === 0) return null;

        const totalSpan = TIME_RANGES.reduce((sum, range) => 
            sum + Math.abs(range.end - range.start), 0);
        
        const numRanges = TIME_RANGES.length;
        const equalPortionHeight = dimensions.height * 0.5;
        const proportionalPortionHeight = dimensions.height * 0.5;
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
    }, [dimensions]);

    // Create scale functions
    const scales = useMemo(() => {
        if (!layout || !dimensions.height) return null;

        const { heights, positions } = layout;

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
    }, [layout, dimensions.height]);

    // Render chart
    useEffect(() => {
        if (!dimensions.width || !dimensions.height || !layout || !scales) return;

        const svg = d3.select(svgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height);

        svg.selectAll('*').remove();

        // Draw color bars
        const colorBarWidth = dimensions.width / 6;
        const colorBarX = dimensions.width - colorBarWidth;
        
        svg.selectAll('.era-rect')
            .data(TIME_RANGES)
            .enter()
            .append('rect')
            .attr('class', 'era-rect')
            .attr('x', colorBarX)
            .attr('y', (d, i) => layout.positions[i])
            .attr('width', colorBarWidth)
            .attr('height', (d, i) => layout.heights[i])
            .attr('fill', d => d.color);

        // Draw year markers
        const lineStart = colorBarX - 10;
        const years = [];
        for (let year = -4000; year <= 0; year += 500) {
            years.push(year);
        }
        if (!years.includes(0)) years.push(0);

        svg.selectAll('.year-line')
            .data(years)
            .enter()
            .append('line')
            .attr('class', 'year-line')
            .attr('x1', lineStart)
            .attr('y1', scales.yearToPixel)
            .attr('x2', colorBarX)
            .attr('y2', scales.yearToPixel)
            .attr('stroke', '#999')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '2,2');

        svg.selectAll('.year-label')
            .data(years)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', colorBarX - 15)
            .attr('y', d => scales.yearToPixel(d) + 5)
            .attr('text-anchor', 'end')
            .attr('font-size', '14px')
            .attr('fill', 'black')
            .text(d => d === 0 ? 'BC|AD' : `${Math.abs(d)} BC`);

        // Create brush
        const brush = d3.brushY()
            .extent([[0, 0], [dimensions.width, dimensions.height]])
            .on('brush end', (event) => {
                if (event.selection) {
                    const [y0, y1] = event.selection;
                    const startYear = Math.round(scales.pixelToYear(y0));
                    const endYear = Math.round(scales.pixelToYear(y1));
                    
                    if (startYear !== selection[0] || endYear !== selection[1]) {
                        const newSelection = [startYear, endYear];
                        setSelection(newSelection);
                        
                        // Update period selection
                        const matchingPeriod = Object.entries(TIME_PERIODS).find(
                            ([, range]) => range[0] === startYear && range[1] === endYear
                        );
                        
                        if (matchingPeriod) {
                            setSelectedPeriod(matchingPeriod[0]);
                            setIsCustomRange(false);
                        } else {
                            setSelectedPeriod(null);
                            setIsCustomRange(true);
                        }
                    }
                }
            });

        const brushGroup = svg.append('g').attr('class', 'brush').call(brush);
        
        // Set initial brush position
        const y0 = scales.yearToPixel(selection[0]);
        const y1 = scales.yearToPixel(selection[1]);
        brush.move(brushGroup, [y0, y1]);

        // Hide default brush selection
        svg.selectAll('.brush .selection').style('display', 'none');

    }, [dimensions, layout, scales, selection, setSelection, setSelectedPeriod, setIsCustomRange]);

    return (
        <div ref={containerRef} className="macrochart-container">
            <svg ref={svgRef}></svg>
        </div>
    );
});

// ============================================================================
// MICRO CHART COMPONENT
// ============================================================================

const MicroChart = memo(() => {
    const { events, selection } = useTimeline();
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const dimensions = useDimensions(containerRef);

    // Filter events for current selection
    const filteredEvents = useMemo(() => {
        const [startYear, endYear] = selection;
        return events.filter(event => 
            event.fields.startDate >= startYear && event.fields.startDate <= endYear
        );
    }, [events, selection]);

    // Create scale
    const yScale = useMemo(() => {
        if (!dimensions.height) return null;
        return d3.scaleLinear()
            .domain(selection)
            .range([0, dimensions.height]);
    }, [selection, dimensions.height]);

    // Process chart data
    const chartData = useMemo(() => {
        if (!yScale || !filteredEvents.length) return { dots: [], lines: [] };

        const dots = filteredEvents.map(event => {
            const rangeInfo = getRangeInfo(event.fields.startDate);
            const column = getEffectiveColumn(event);
            const x = (dimensions.width / 10) * (column - 0.5);
            const y = yScale(event.fields.startDate);

            return {
                x,
                y,
                color: rangeInfo.color,
                title: event.fields.title
            };
        });

        const lines = filteredEvents
            .filter(event => {
                const duration = parseDuration(event.fields.duration);
                return duration >= 1;
            })
            .map(event => {
                const rangeInfo = getRangeInfo(event.fields.startDate);
                const column = getEffectiveColumn(event);
                const x = (dimensions.width / 10) * (column - 0.5);
                const startY = yScale(event.fields.startDate);
                const endY = yScale(event.fields.startDate + parseDuration(event.fields.duration));

                return {
                    x,
                    y1: startY,
                    y2: endY,
                    color: rangeInfo.color
                };
            });

        return { dots, lines };
    }, [filteredEvents, yScale, dimensions.width]);

    // Render chart
    useEffect(() => {
        if (!dimensions.width || !dimensions.height || !chartData) return;

        const svg = d3.select(svgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height);

        svg.selectAll('*').remove();

        // Draw lines
        svg.selectAll('.line')
            .data(chartData.lines)
            .enter()
            .append('line')
            .attr('class', 'line')
            .attr('x1', d => d.x)
            .attr('y1', d => d.y1)
            .attr('x2', d => d.x)
            .attr('y2', d => d.y2)
            .attr('stroke', d => d.color)
            .attr('stroke-width', 2);

        // Create tooltip
        const tooltip = d3.select(containerRef.current)
            .selectAll('.tooltip')
            .data([null])
            .join('div')
            .attr('class', 'tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0,0,0,0.8)')
            .style('color', 'white')
            .style('padding', '8px')
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('opacity', 0)
            .style('z-index', 1000);

        // Draw dots
        svg.selectAll('.dot')
            .data(chartData.dots)
            .enter()
            .append('circle')
            .attr('class', 'dot')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', 3)
            .attr('fill', d => d.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .on('mouseover', function(event, d) {
                tooltip
                    .style('opacity', 0.9)
                    .html(d.title)
                    .style('left', (event.layerX + 10) + 'px')
                    .style('top', (event.layerY - 50) + 'px');
            })
            .on('mouseout', function() {
                tooltip.style('opacity', 0);
            });

    }, [dimensions, chartData]);

    return (
        <div ref={containerRef} className="microchart-container">
            <svg ref={svgRef}></svg>
        </div>
    );
});

// ============================================================================
// EVENT DISPLAY COMPONENT
// ============================================================================

const EventDisplay = memo(() => {
    const { events, selection, setScrollInfo } = useTimeline();
    const containerRef = useRef(null);
    const [expandedEvents, setExpandedEvents] = useState(new Set());

    // Group events by year
    const groupedEvents = useMemo(() => {
        const [startYear, endYear] = selection;
        const filtered = events.filter(event => 
            event.fields.startDate >= startYear && event.fields.startDate <= endYear
        );

        const groups = {};
        filtered.forEach(event => {
            const year = event.fields.startDate;
            if (!groups[year]) groups[year] = [];
            groups[year].push(event);
        });

        return Object.keys(groups)
            .sort((a, b) => Number(a) - Number(b))
            .map(year => ({
                year: Number(year),
                events: groups[year]
            }));
    }, [events, selection]);

    // Format functions
    const formatDuration = (duration) => {
        if (!duration) return '';
        const match = duration.match(/^(\d+)([DY])$/);
        if (!match) return duration;
        const [, number, unit] = match;
        const num = parseInt(number, 10);
        if (unit === 'D') return num === 1 ? '1 Day' : `${num} Days`;
        if (unit === 'Y') return num === 1 ? '1 Year' : `${num} Years`;
        return duration;
    };

    const formatParticipants = (participants) => {
        if (!participants) return participants;
        return participants.split(',').map((id, index) => {
            const person = peopleFullData.find(p => p.fields.personLookup === id.trim());
            const displayName = person ? person.fields.displayTitle : id.trim();
            return (
                <span key={index}>
                    <a href={`https://theographic.netlify.app/person/${id.trim()}`} 
                       target="_blank" rel="noopener noreferrer" className="event-link">
                        {displayName}
                    </a>
                    {index < participants.split(',').length - 1 ? ', ' : ''}
                </span>
            );
        });
    };

    const formatLocations = (locations) => {
        if (!locations) return locations;
        return locations.split(',').map((id, index) => {
            const place = placesFullData.find(p => p.fields.placeLookup === id.trim());
            const displayName = place ? place.fields.displayTitle : id.trim();
            return (
                <span key={index}>
                    <a href={`https://theographic.netlify.app/place/${id.trim()}`} 
                       target="_blank" rel="noopener noreferrer" className="event-link">
                        {displayName}
                    </a>
                    {index < locations.split(',').length - 1 ? ', ' : ''}
                </span>
            );
        });
    };

    const formatVerses = (verses) => {
        if (!verses) return verses;
        return verses.split(',').map((verse, index) => {
            const trimmedVerse = verse.trim();
            const verseMatch = trimmedVerse.match(/^([a-zA-Z0-9]+)\.(\d+)\.(\d+)$/);
            
            if (verseMatch) {
                const [, book, chapter, verseNum] = verseMatch;
                const url = `https://theographic.netlify.app/${book}#${book}.${chapter}.${verseNum}`;
                return (
                    <span key={index}>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="event-link">
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
    };

    // Handle scroll
    const handleScroll = () => {
        if (!containerRef.current || !groupedEvents.length) return;

        const container = containerRef.current;
        const { scrollTop, scrollHeight, clientHeight } = container;
        const scrollPercentage = scrollHeight > clientHeight ? 
            Math.max(0, Math.min(1, scrollTop / (scrollHeight - clientHeight))) : 1;

        // Find top visible year
        const headers = container.querySelectorAll('.event-year-header');
        if (headers.length > 0) {
            const containerRect = container.getBoundingClientRect();
            let topVisibleYear = groupedEvents[0].year;

            for (let i = 0; i < headers.length; i++) {
                const headerRect = headers[i].getBoundingClientRect();
                if (headerRect.top <= containerRect.top + 20) {
                    topVisibleYear = groupedEvents[i].year;
                }
            }

            setScrollInfo({
                topVisibleYear,
                scrollPercentage,
                isAtBottom: scrollPercentage >= 0.95
            });
        }
    };

    const toggleExpansion = (eventTitle) => {
        setExpandedEvents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(eventTitle)) {
                newSet.delete(eventTitle);
            } else {
                newSet.add(eventTitle);
            }
            return newSet;
        });
    };

    return (
        <div ref={containerRef} className="event-display-container" onScroll={handleScroll}>
            {groupedEvents.map(group => (
                <div key={group.year}>
                    <h3 className="event-year-header">{formatYear(group.year)}</h3>
                    {group.events.map(event => {
                        const isExpanded = expandedEvents.has(event.fields.title);
                        return (
                            <div className="event-item" key={event.fields.title}>
                                <button 
                                    className={`event-triangle ${isExpanded ? 'expanded' : ''}`}
                                    onClick={() => toggleExpansion(event.fields.title)}
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
                                                <div className="event-detail">Part Of: {event.fields.partOf}</div>
                                            )}
                                            {event.fields.predecessor && (
                                                <div className="event-detail">Predecessor: {event.fields.predecessor}</div>
                                            )}
                                            {event.fields.lag && (
                                                <div className="event-detail">
                                                    Lag: {formatDuration(event.fields.lag)}
                                                </div>
                                            )}
                                            {event.fields.lagType && (
                                                <div className="event-detail">Lag Type: {event.fields.lagType}</div>
                                            )}
                                            {event.fields.notes && (
                                                <div className="event-detail">Notes: {event.fields.notes}</div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
});

// ============================================================================
// PERIOD SELECTOR COMPONENT
// ============================================================================

const PeriodSelector = memo(() => {
    const { 
        selection, 
        setSelection, 
        selectedPeriod, 
        setSelectedPeriod, 
        isCustomRange, 
        setIsCustomRange 
    } = useTimeline();

    const handlePeriodChange = (event) => {
        const period = event.target.value;
        const newRange = TIME_PERIODS[period];
        
        setSelection(newRange);
        setSelectedPeriod(period);
        setIsCustomRange(false);
        
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('startYear', newRange[0].toString());
        url.searchParams.set('endYear', newRange[1].toString());
        window.history.replaceState({}, '', url);
    };

    return (
        <form>
            <ul id="people-legend">
                {PERIODS.map(period => (
                    <li key={period.value}>
                        <input 
                            id={`people-legend-${period.value}`}
                            type="radio" 
                            name="people-legend" 
                            value={period.value}
                            checked={!isCustomRange && selectedPeriod === period.value}
                            onChange={handlePeriodChange} 
                        />
                        <label htmlFor={`people-legend-${period.value}`}>
                            {period.label}
                        </label>
                    </li>
                ))}
            </ul>
        </form>
    );
});

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const EventTimeline = () => {
    // Initialize from URL parameters
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const startYearParam = params.get('startYear');
        const endYearParam = params.get('endYear');
        
        if (startYearParam && endYearParam) {
            const startYear = parseInt(startYearParam);
            const endYear = parseInt(endYearParam);
            
            if (!isNaN(startYear) && !isNaN(endYear) && startYear < endYear) {
                // URL parameters will be handled by the context initialization
                return;
            }
        }
        
        // Set default URL parameters
        const url = new URL(window.location.href);
        url.searchParams.set('startYear', TIME_PERIODS.all[0].toString());
        url.searchParams.set('endYear', TIME_PERIODS.all[1].toString());
        window.history.replaceState({}, '', url);
    }, []);

    return (
        <>
            <style>{`
                /* All your existing CSS styles remain the same */
                :root {
                    --tw-gray-100: rgb(241 245 249);
                    --tw-gray-300: rgb(203 213 225);
                    --tw-gray-800: rgb(30 41 59);
                    --tw-blue-500: rgb(14 165 233);
                }

                body, html {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'PT Sans', sans-serif;
                    background-color: var(--tw-gray-100);
                    color: #333;
                    overflow: hidden;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }

                body::-webkit-scrollbar {
                    display: none;
                }

                *, *:before, *:after {
                    box-sizing: inherit;
                }

                .page-container {
                    display: flex;
                    flex-direction: column;
                    min-height: 100vh;
                    max-height: 100vh;
                    padding: 0.75rem;
                }

                .content-wrapper {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    min-height: 0;
                }

                .header {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    align-items: center;
                    margin: 0.75rem 0;
                    padding: 0 0.5rem;
                }

                .header h1 {
                    margin: 0;
                    margin-left: 0.25rem;
                    font-family: 'Georgia', ui-serif, serif;
                    font-style: italic;
                    font-size: 1.5rem;
                    line-height: 2rem;
                    font-weight: normal;
                }

                .header-controls {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.5rem 0;
                }

                #people-legend {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    align-items: center;
                    gap: 0.5rem 0.5rem;
                    padding: 0.25rem;
                    margin: 0;
                    list-style: none;
                }

                #people-legend input[type="radio"] {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    white-space: nowrap;
                    border-width: 0;
                }

                #people-legend label {
                    cursor: pointer;
                    padding: 0.125rem 0.5rem 0.125rem;
                    padding-top: 0.25rem;
                    border-bottom: 4px solid var(--tw-gray-300);
                    user-select: none;
                }

                #people-legend-all + label { border-bottom-color: var(--tw-gray-300); }
                #people-legend-period1 + label { border-bottom-color: #5795ff; }
                #people-legend-period2 + label { border-bottom-color: #5795ff; }
                #people-legend-period3 + label { border-bottom-color: #ff7f00; }
                #people-legend-period4 + label { border-bottom-color: #fdbf6f; }
                #people-legend-period5 + label { border-bottom-color: #C4A484; }

                #people-legend input[type="radio"]:checked + label {
                    font-weight: 700;
                }

                #people-legend-all:checked + label { background-color: var(--tw-gray-300); color: black; }
                #people-legend-period1:checked + label { background-color: #5795ff; color: white; border-color: #5795ff; }
                #people-legend-period2:checked + label { background-color: #5795ff; color: white; border-color: #5795ff; }
                #people-legend-period3:checked + label { background-color: #ff7f00; color: white; border-color: #ff7f00; }
                #people-legend-period4:checked + label { background-color: #fdbf6f; color: black; border-color: #fdbf6f; }
                #people-legend-period5:checked + label { background-color: #C4A484; color: white; border-color: #C4A484; }

                .timeline-container {
                    display: flex;
                    flex-direction: row;
                    background-color: white;
                    border: 2px solid var(--tw-gray-300);
                    flex-grow: 1;
                    min-height: 0;
                    overflow: visible;
                }

                .sidebar {
                    display: flex;
                    flex-direction: row;
                    border-right: 1px solid #ccc;
                    background-color: #f0f0f0;
                }

                .macrochart-container, .microchart-container {
                    width: 100px;
                    height: 100%;
                    box-sizing: border-box;
                    position: relative;
                    padding: 0;
                    background-color: #f0f0f0;
                    overflow: visible;
                }

                .microchart-container {
                    border-left: 1px solid #ccc;
                }

                @media (max-width: 767px) {
                    .microchart-container {
                        display: none;
                    }
                }

                .event-display-container {
                    flex-grow: 1;
                    padding: 0 20px 10px 20px;
                    overflow-y: auto;
                    box-sizing: border-box;
                    background-color: #e8e8e8;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                    position: relative;
                }

                .event-display-container::-webkit-scrollbar {
                    display: none;
                }

                .event-year-header {
                    margin: 0;
                    padding: 10px 0 5px 0;
                    font-size: 1.1em;
                    color: #000;
                    font-weight: 600;
                    border-bottom: 1px solid black;
                }

                .event-item {
                    margin-bottom: 5px;
                    display: flex;
                    align-items: flex-start;
                    color: black;
                    gap: 8px;
                    width: 100%;
                    box-sizing: border-box;
                }

                .event-triangle {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 12px;
                    color: black;
                    padding: 0;
                    margin-top: 2px;
                    transition: transform 0.2s ease;
                    flex-shrink: 0;
                }

                .event-triangle:hover {
                    opacity: 0.5;
                }

                .event-triangle.expanded {
                    transform: rotate(90deg);
                }

                .event-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    overflow-wrap: break-word;
                    word-wrap: break-word;
                }

                .event-title {
                    line-height: 1.2;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                }

                .event-detail {
                    font-size: 0.8em;
                    color: black;
                    margin-top: 4px;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                    white-space: pre-wrap;
                    max-width: 100%;
                    box-sizing: border-box;
                }

                .event-link {
                    color: blue;
                }

                label {
                    color: black;
                }

                @media (min-width: 768px) {
                    .header-controls {
                        flex-direction: row;
                        justify-content: space-between;
                        width: auto;
                        gap: 1rem;
                    }
                    .header h1 {
                        margin-top: 0;
                    }
                }

                @media (min-width: 1024px) {
                    .header {
                        justify-content: space-between;
                    }
                    .header h1 {
                        font-size: 1.875rem;
                        line-height: 2.25rem;
                    }
                }
            `}</style>
            <TimelineProvider>
                <div className="page-container">
                    <div className="content-wrapper">
                        <header className="header">
                            <h1 style={{ color: "black" }}><i>Timeline of the Bible</i></h1>
                            <div className="header-controls">
                                <div className="order-1">
                                    <PeriodSelector />
                                </div>
                            </div>
                        </header>
                        <div className="timeline-container">
                            <div className="sidebar">
                                <MacroChart />
                                <MicroChart />
                            </div>
                            <EventDisplay />
                        </div>
                    </div>
                </div>
            </TimelineProvider>
        </>
    );
};

// Export for rendering
ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <EventTimeline />
    </React.StrictMode>
);