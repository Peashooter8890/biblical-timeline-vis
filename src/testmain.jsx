import React, { useState, useEffect, useCallback, useRef, useMemo, Fragment, useContext, createContext, memo } from 'react';
import ReactDOM from 'react-dom/client'
import { eventsFullData, peopleFullData, placesFullData } from './teststuff.js';
import { parseDuration, getRangeInfo, formatYear, calculateColumns, getEffectiveColumn, throttle, 
    parseUrlParams, findMatchingPeriod, updateUrl, formatDuration, formatLocations, formatParticipants, formatVerses } from './utils.jsx';
import './testindex.css'

const TIME_RANGES = [
    { start: -4100, end: -2200, color: '#5795ff' },
    { start: -2199, end: -1600, color: '#ff7f00' },
    { start: -1599, end: -1375, color: '#fc8eac' },
    { start: -1374, end: -1052, color: '#89b4c3' },
    { start: -1051, end: -931,  color: '#b2df8a' },
    { start: -930,  end: -715,  color: '#fdbf6f' },
    { start: -714,  end: -431,  color: '#cab2d6' },
    { start: -430,  end: -1,    color: '#FFB6C1' },
    { start: 0,     end: 150,    color: '#C4A484' }
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

const EQUAL_DISTRIBUTION_AREA = 0.5;
const PROPORTIONATE_DISTRIBUTION_AREA = 0.5;
const EVENTS_BOUND = [-4003, 57];

// CONTEXT

const TimelineContext = createContext();

const TimelineProvider = ({ children }) => {
    const [events, setEvents] = useState(calculateColumns(eventsFullData));
    const [selection, setSelection] = useState(TIME_PERIODS.all);
    const [indicatorY, setIndicatorY] = useState(0);
    const [microchartIndicatorY, setMicrochartIndicatorY] = useState(null);
    const [scrollInfo, setScrollInfo] = useState({ 
        topVisibleYear: EVENTS_BOUND[0], 
        selectionRange: TIME_PERIODS.all
    });
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const [isCustomRange, setIsCustomRange] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [externalSelection, setExternalSelection] = useState(null);

    const value = {
        events,
        setEvents,
        selection,
        setSelection,
        indicatorY,
        setIndicatorY,
        microchartIndicatorY,
        setMicrochartIndicatorY,
        scrollInfo,
        setScrollInfo,
        selectedPeriod,
        setSelectedPeriod,
        isCustomRange,
        setIsCustomRange,
        isInitialized,
        setIsInitialized,
        externalSelection,
        setExternalSelection
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
        throw new Error('useTimeline must be used within a TimelineProvider');
    }
    return context;
};

// ============================================================================
// MACRO CHART COMPONENT
// ============================================================================

const YEAR_LABEL_INTERVAL = 500;
const YEAR_LABEL_RANGE_START = -4000;
const YEAR_LABEL_RANGE_END = 0;
const LABEL_MARGIN = 15;
const LABEL_LINE_LENGTH = 10;
const COLOR_BAR_WIDTH_RATIO = 1/6;
const MIN_SELECTION_HEIGHT = 45;
const HANDLE_HEIGHT = 14;
const HANDLE_OFFSET = 4;
const RESIZE_ZONE_RATIO = 0.02;
const HANDLE_WIDTH_RATIO = 1/2;

const MacroChart = ({ onBrush, onExternalSelectionProcessed }) => {
    const { events, indicatorY, setIndicatorY, scrollInfo, externalSelection } = useTimeline();
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const scaleInfoRef = useRef(null);
    const brushBoundsRef = useRef([0, 0]);
    const brushRef = useRef(null);
    const brushGroupRef = useRef(null);
    const overlayElementsRef = useRef(null);
    const isExternalUpdateRef = useRef(false);
    const isUserInteractingRef = useRef(false);
    const resizeObserverRef = useRef(null);

    // Memoize calculateDimensions to prevent unnecessary re-renders
    const calculateDimensions = useCallback((container) => {
        if (!container) return { width: 0, height: 0 };
        const rect = container.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }, []);

    const calculateLayout = useCallback((dimensions) => {
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

    const createConverters = useCallback((dimensions, { heights, positions }) => {
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

    const generateYearLabels = useCallback(() => {
        const years = [];
        for (let year = YEAR_LABEL_RANGE_START; year <= YEAR_LABEL_RANGE_END; year += YEAR_LABEL_INTERVAL) {
            years.push(year);
        }
        if (!years.includes(YEAR_LABEL_RANGE_END)) {
            years.push(YEAR_LABEL_RANGE_END);
        }
        return years;
    }, []);

    const createColorBars = useCallback((svg, dimensions, { heights, positions }) => {
        const width = dimensions.width * COLOR_BAR_WIDTH_RATIO;
        const x = dimensions.width - width;
        
        svg.selectAll('.era-rect')
            .data(TIME_RANGES)
            .enter()
            .append('rect')
            .attr('class', 'era-rect')
            .attr('x', x)
            .attr('y', (d, i) => positions[i])
            .attr('width', width)
            .attr('height', (d, i) => heights[i])
            .attr('fill', d => d.color);

        return { width, x };
    }, []);

    const createYearMarkers = useCallback((svg, dimensions, { yearToPixel }, { x }) => {
        const lineStart = x - LABEL_LINE_LENGTH;
        const years = generateYearLabels();

        svg.selectAll('.year-line')
            .data(years)
            .enter()
            .append('line')
            .attr('class', 'year-line')
            .attr('x1', lineStart)
            .attr('y1', yearToPixel)
            .attr('x2', x)
            .attr('y2', yearToPixel);

        svg.selectAll('.year-label')
            .data(years)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', x - LABEL_MARGIN)
            .attr('y', d => yearToPixel(d) + 5)
            .text(d => d === 0 ? 'BC|AD' : `${Math.abs(d)} BC`);
    }, [generateYearLabels]);

    const createBrush = useCallback((dimensions, { pixelToYear }) => {
        return d3.brushY()
            .extent([[0, 0], [dimensions.width, dimensions.height]])
            .on('brush end', (event) => {
                if (event.selection && !isExternalUpdateRef.current) {
                    const [y0, y1] = event.selection;
                    brushBoundsRef.current = [y0, y1];
                    
                    const startYear = pixelToYear(y0);
                    const endYear = pixelToYear(y1);
                    onBrush([startYear, endYear]);
                }
            })
            .on('brush', (event) => {
                if (event.selection) {
                    brushBoundsRef.current = event.selection;
                }
            });
    }, [onBrush]);

    const updateBrush = useCallback((brush, brushGroup, y0, y1) => {
        if (brush && brushGroup) {
            isExternalUpdateRef.current = true;
            brush.move(brushGroup, [y0, y1]);
            isExternalUpdateRef.current = false;
        }
    }, []);

    const updateOverlayPositions = useCallback((elements, dimensions, y0, y1) => {
        if (!elements) return;
        
        const { overlay, topHandle, bottomHandle, topHandleText, bottomHandleText } = elements;
        
        overlay
            .style('top', `${y0}px`)
            .style('height', `${y1 - y0}px`)
            .style('width', `${dimensions.width}px`);
        
        topHandle.style('top', `${y0 - (HANDLE_HEIGHT / 2)}px`);
        bottomHandle.style('top', `${y1 - (HANDLE_HEIGHT / 2)}px`);
        
        if (scaleInfoRef.current && scaleInfoRef.current.pixelToYear) {
            const { pixelToYear } = scaleInfoRef.current;
            const topYear = pixelToYear(y0);
            const bottomYear = pixelToYear(y1);
            
            topHandleText
                .style('top', `${y0 - (HANDLE_HEIGHT / 2)}px`)
                .text(formatYear(Math.round(topYear)));
            
            bottomHandleText
                .style('top', `${y1 - (HANDLE_HEIGHT / 2)}px`)
                .text(formatYear(Math.round(bottomYear)));
        }
    }, []);

    const createDragHandler = useCallback((dimensions, brush, brushGroup, resizeZone) => {
        return function (event) {
            isUserInteractingRef.current = true;
            const element = event.currentTarget;
            const rect = element.getBoundingClientRect();
            const mouseY = event.clientY - rect.top;

            let mode = 'drag';
            if (mouseY <= resizeZone) {
                mode = 'resize-top';
                element.style.cursor = 'ns-resize';
            } else if (mouseY >= rect.height - resizeZone) {
                mode = 'resize-bottom';
                element.style.cursor = 'ns-resize';
            }

            const startMouseY = event.clientY;
            const [currentY0, currentY1] = brushBoundsRef.current;

            const handleMove = (moveEvent) => {
                const deltaY = moveEvent.clientY - startMouseY;
                let newY0 = currentY0,
                    newY1 = currentY1;

                switch (mode) {
                    case 'resize-top':
                        newY0 = Math.max(0, Math.min(currentY1 - MIN_SELECTION_HEIGHT, currentY0 + deltaY));
                        break;
                    case 'resize-bottom':
                        newY1 = Math.min(dimensions.height, Math.max(currentY0 + MIN_SELECTION_HEIGHT, currentY1 + deltaY));
                        break;
                    case 'drag':
                        const height = currentY1 - currentY0;
                        newY0 = Math.max(0, Math.min(dimensions.height - height, currentY0 + deltaY));
                        newY1 = newY0 + height;
                        break;
                }

                updateBrush(brush, brushGroup, newY0, newY1);
                updateOverlayPositions(overlayElementsRef.current, dimensions, newY0, newY1);
                
                // Call onBrush during drag to update the app state
                if (scaleInfoRef.current && scaleInfoRef.current.pixelToYear) {
                    const { pixelToYear } = scaleInfoRef.current;
                    const startYear = pixelToYear(newY0);
                    const endYear = pixelToYear(newY1);
                    onBrush([startYear, endYear]);
                }
            };

            const handleUp = () => {
                element.style.cursor = 'move';
                isUserInteractingRef.current = false;
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
            };

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
            event.preventDefault();
        };
    }, [updateBrush, updateOverlayPositions, onBrush]);

    const createHandleMouseDown = useCallback((dimensions, brush, brushGroup, isTop) => {
        return function (event) {
            isUserInteractingRef.current = true;
            const startMouseY = event.clientY;
            const [currentY0, currentY1] = brushBoundsRef.current;

            const handleMove = (moveEvent) => {
                const deltaY = moveEvent.clientY - startMouseY;
                let newY0 = currentY0;
                let newY1 = currentY1;

                if (isTop) {
                    newY0 = Math.max(0, Math.min(currentY1 - MIN_SELECTION_HEIGHT, currentY0 + deltaY));
                    updateBrush(brush, brushGroup, newY0, currentY1);
                    updateOverlayPositions(overlayElementsRef.current, dimensions, newY0, currentY1);
                } else {
                    newY1 = Math.min(dimensions.height, Math.max(currentY0 + MIN_SELECTION_HEIGHT, currentY1 + deltaY));
                    updateBrush(brush, brushGroup, currentY0, newY1);
                    updateOverlayPositions(overlayElementsRef.current, dimensions, currentY0, newY1);
                }
                
                // Call onBrush during handle drag to update the app state
                if (scaleInfoRef.current && scaleInfoRef.current.pixelToYear) {
                    const { pixelToYear } = scaleInfoRef.current;
                    const startYear = pixelToYear(isTop ? newY0 : currentY0);
                    const endYear = pixelToYear(isTop ? currentY1 : newY1);
                    onBrush([startYear, endYear]);
                }
            };

            const handleUp = () => {
                isUserInteractingRef.current = false;
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
            };

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
            event.preventDefault();
            event.stopPropagation();
        };
    }, [updateBrush, updateOverlayPositions, onBrush]);

    const createOverlayElements = useCallback((container, dimensions, brush, brushGroup) => {
        const resizeZone = dimensions.height * RESIZE_ZONE_RATIO;
        const handleWidth = dimensions.width * HANDLE_WIDTH_RATIO;
        const overlayWidth = dimensions.width;
        const handleLeft = (overlayWidth - handleWidth) / 2;

        const overlay = d3.select(container)
            .select('.selection-overlay')
            .style('top', '0px')
            .style('left', '0px')
            .style('width', `${dimensions.width}px`)
            .style('height', `${dimensions.height}px`)
            .on('mousedown', createDragHandler(dimensions, brush, brushGroup, resizeZone))
            .on('mousemove', function(event) {
                if (event.buttons === 0) {
                    const element = event.currentTarget;
                    const rect = element.getBoundingClientRect();
                    const mouseY = event.clientY - rect.top;
                    
                    if (mouseY <= resizeZone || mouseY >= rect.height - resizeZone) {
                        element.style.cursor = 'ns-resize';
                    } else {
                        element.style.cursor = 'move';
                    }
                }
            });

        const topHandle = d3.select(container)
            .select('.top-handle')
            .style('width', `${handleWidth}px`)
            .style('height', `${HANDLE_HEIGHT}px`)
            .style('left', `${handleLeft}px`)
            .style('top', `-${HANDLE_OFFSET}px`)
            .on('mousedown', createHandleMouseDown(dimensions, brush, brushGroup, true));

        const bottomHandle = d3.select(container)
            .select('.bottom-handle')
            .style('width', `${handleWidth}px`)
            .style('height', `${HANDLE_HEIGHT}px`)
            .style('left', `${handleLeft}px`)
            .style('bottom', `-${HANDLE_OFFSET}px`)
            .on('mousedown', createHandleMouseDown(dimensions, brush, brushGroup, false));

        const topHandleText = d3.select(container)
            .select('.top-handle-text')
            .style('width', `${handleWidth}px`)
            .style('left', `${handleLeft}px`)
            .style('line-height', `${HANDLE_HEIGHT}px`);

        const bottomHandleText = d3.select(container)
            .select('.bottom-handle-text')
            .style('width', `${handleWidth}px`)
            .style('left', `${handleLeft}px`)
            .style('line-height', `${HANDLE_HEIGHT}px`);

        return { overlay, topHandle, bottomHandle, topHandleText, bottomHandleText };
    }, [createDragHandler, createHandleMouseDown]);

    // Update the render function to use useCallback properly
    const render = useCallback(() => {
        if (!svgRef.current || !containerRef.current) return;

        const dimensions = calculateDimensions(containerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;

        const layout = calculateLayout(dimensions);
        const converters = createConverters(dimensions, layout);
        const oldScaleInfo = scaleInfoRef.current;

        const svg = d3.select(svgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        svg.selectAll('*').remove();

        const colorBarLayout = createColorBars(svg, dimensions, layout);
        createYearMarkers(svg, dimensions, converters, colorBarLayout);

        const brush = createBrush(dimensions, converters);
        const brushGroup = svg.append('g').attr('class', 'brush').call(brush);

        brushRef.current = brush;
        brushGroupRef.current = brushGroup;

        svg.selectAll('.brush .selection').style('display', 'none');
        svg.selectAll('.brush .overlay').style('pointer-events', 'none');

        const currentBounds = brushBoundsRef.current;
        let newY0, newY1;

        if (isUserInteractingRef.current && currentBounds[0] !== 0 && currentBounds[1] !== 0) {
            newY0 = currentBounds[0];
            newY1 = currentBounds[1];
        } else if (currentBounds[0] === 0 && currentBounds[1] === 0) {
            newY0 = 0;
            newY1 = dimensions.height;
        } else {
            if (oldScaleInfo && oldScaleInfo.pixelToYear) {
                const startYear = oldScaleInfo.pixelToYear(currentBounds[0]);
                const endYear = oldScaleInfo.pixelToYear(currentBounds[1]);
                newY0 = converters.yearToPixel(startYear);
                newY1 = converters.yearToPixel(endYear);
            } else {
                const oldHeight = oldScaleInfo?.dimensions?.height || dimensions.height;
                const ratio = dimensions.height / oldHeight;
                newY0 = currentBounds[0] * ratio;
                newY1 = currentBounds[1] * ratio;
            }
        }

        scaleInfoRef.current = { ...converters, dimensions };
        isExternalUpdateRef.current = true;
        brush.move(brushGroup, [newY0, newY1]);
        isExternalUpdateRef.current = false;
        brushBoundsRef.current = [newY0, newY1];

        const overlayElements = createOverlayElements(containerRef.current, dimensions, brush, brushGroup);
        overlayElementsRef.current = overlayElements;

        updateOverlayPositions(overlayElements, dimensions, newY0, newY1);
    }, [
        calculateDimensions, 
        calculateLayout, 
        createConverters, 
        createColorBars, 
        createYearMarkers, 
        createBrush, 
        createOverlayElements, 
        updateOverlayPositions
    ]);

    // Handle external selection updates (from App.jsx)
    useEffect(() => {
        if (externalSelection && scaleInfoRef.current) {
            const { yearToPixel } = scaleInfoRef.current;
            const [startYear, endYear] = externalSelection;
            
            const newY0 = yearToPixel(startYear);
            const newY1 = yearToPixel(endYear);
            
            isExternalUpdateRef.current = true;
            if (brushRef.current && brushGroupRef.current) {
                brushRef.current.move(brushGroupRef.current, [newY0, newY1]);
            }
            isExternalUpdateRef.current = false;
            
            brushBoundsRef.current = [newY0, newY1];
            
            if (overlayElementsRef.current) {
                const dimensions = calculateDimensions(containerRef.current);
                updateOverlayPositions(overlayElementsRef.current, dimensions, newY0, newY1);
            }
            
            // Notify App.jsx that we've processed the external selection
            if (onExternalSelectionProcessed) {
                onExternalSelectionProcessed();
            }
        }
    }, [externalSelection, onExternalSelectionProcessed, calculateDimensions, updateOverlayPositions]);

    // Setup resize observer and initial render
    useEffect(() => {
        if (!containerRef.current) return;

        // The function to be called on resize.
        const onResize = () => {
            // Use requestAnimationFrame to debounce resize events and prevent layout thrashing.
            window.requestAnimationFrame(() => {
                if (containerRef.current) { // Check if component is still mounted
                    render();
                }
            });
        };

        // Create the observer with the callback.
        const resizeObserver = new ResizeObserver(onResize);
        
        // Start observing the container element.
        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;

        // Initial render.
        render();

        // Cleanup function to disconnect the observer when the component unmounts.
        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
        };
    }, [render]);

    useEffect(() => {
        if (!scrollInfo || !scaleInfoRef.current || !events || !events.length || scrollInfo.topVisibleYear === undefined) return;

        const { topVisibleYear, isAtBottom } = scrollInfo;
        const { yearToPixel } = scaleInfoRef.current;
        
        const allEvents = events;

        if (allEvents.length === 0) {
            setIndicatorY(null);
            return;
        }

        let indicatorY = null;

        if (isAtBottom) {
            const lastEvent = allEvents[allEvents.length - 1];
            indicatorY = yearToPixel(lastEvent.fields.startDate);
        } else {
            indicatorY = yearToPixel(topVisibleYear);
        }
        
        setIndicatorY(indicatorY);
    }, [scrollInfo?.topVisibleYear, scrollInfo?.isAtBottom, events, setIndicatorY]);
    
    return (
        <div ref={containerRef} className="macrochart-root">
            <svg ref={svgRef}></svg>
            <div className="selection-overlay"></div>
            <div className="top-handle"></div>
            <div className="bottom-handle"></div>
            <div className="top-handle-text"></div>
            <div className="bottom-handle-text"></div>
        </div>
    );
};
// ============================================================================
// MICRO CHART COMPONENT
// ============================================================================

const DOT_RADIUS = 3;
const LINE_STROKE_WIDTH = 2;
const TOOLTIP_OFFSET_X = 10;
const TOOLTIP_OFFSET_Y = 50;
const FULL_RANGE = [-4100, 150];
const SCROLL_SENSITIVITY = 125;
const STATIC_COLUMN_COUNT = 10;

const Microchart = () => {
    const { events, selection, setMicrochartIndicatorY, scrollInfo } = useTimeline();
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const eventsRef = useRef([]);
    const resizeObserverRef = useRef(null);
    const lastIndicatorYRef = useRef(null);
    const [scrollOffset, setScrollOffset] = useState(0);
    const [currentViewRange, setCurrentViewRange] = useState(selection);

    // Memoize getDimensions to prevent unnecessary re-renders
    const getDimensions = useCallback(() => {
        if (!containerRef.current) return { width: 0, height: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }, []);

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

    // Optimized renderChart with proper memoization
    const renderChart = useCallback(() => {
        if (!svgRef.current || !containerRef.current || !events.length) return;

        const dimensions = getDimensions();
        if (dimensions.width === 0 || dimensions.height === 0) return;

        const [startYear, endYear] = currentViewRange;
        
        const eraLayout = calculateEraLayout(dimensions, currentViewRange);
        const yScale = eraLayout.yScale;

        const filtered = events.filter(d => 
            d.fields.startDate >= startYear && d.fields.startDate <= endYear);

        const allEraData = processEraData(events);
        const processedEvents = createEvents(filtered, yScale, dimensions, allEraData);
        const lines = createLines(yScale, dimensions, allEraData, currentViewRange);

        eventsRef.current = processedEvents;

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
            .data(processedEvents)
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
    }, [events, currentViewRange, getDimensions, calculateEraLayout, processEraData, createEvents, createLines, createTooltip]);

    // Handle scroll events
    useEffect(() => {
        const handleWheel = (event) => {
            event.preventDefault();
            
            const delta = event.deltaY > 0 ? SCROLL_SENSITIVITY : -SCROLL_SENSITIVITY;
            const currentRange = calculateViewRange(selection, scrollOffset);
            const [fullStart, fullEnd] = FULL_RANGE;
            
            const atTopBound = currentRange[0] <= fullStart;
            const atBottomBound = currentRange[1] >= fullEnd;
            const scrollingUp = delta < 0;
            const scrollingDown = delta > 0;
            
            if ((atTopBound && scrollingUp) || (atBottomBound && scrollingDown)) {
                return;
            }
            
            const newOffset = scrollOffset + delta;
            const testRange = calculateViewRange(selection, newOffset);
            
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

    // Render chart and setup resize observer
    useEffect(() => {
        if (!containerRef.current) return;

        // The function to be called on resize.
        const onResize = () => {
            // Use requestAnimationFrame to debounce resize events and prevent layout thrashing.
            window.requestAnimationFrame(() => {
                if (containerRef.current) { // Check if component is still mounted
                    renderChart();
                }
            });
        };

        // Create the observer with the callback.
        const resizeObserver = new ResizeObserver(onResize);
        
        // Start observing the container element.
        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;

        // Initial render.
        renderChart();

        // Cleanup function to disconnect the observer when the component unmounts.
        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
        };
    }, [renderChart]);

    // Handle indicator updates
    useEffect(() => {
        if (!scrollInfo || !eventsRef.current.length || !setMicrochartIndicatorY) return;

        const { topVisibleYear, scrollPercentage } = scrollInfo;
        const events = eventsRef.current;
        const [viewStart, viewEnd] = currentViewRange;

        let indicatorY = null;

        if (topVisibleYear < viewStart || topVisibleYear > viewEnd) {
            indicatorY = null;
        } else if (scrollPercentage === 1 && events.length > 0) {
            const lastEvent = events[events.length - 1];
            indicatorY = lastEvent.y;
        } else {
            let closest = null;
            let minDistance = Infinity;

            for (let i = 0; i < events.length; i++) {
                const event = events[i];
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

        // Only call setMicrochartIndicatorY if the value has actually changed
        if (indicatorY !== lastIndicatorYRef.current) {
            lastIndicatorYRef.current = indicatorY;
            setMicrochartIndicatorY(indicatorY);
        }
    }, [scrollInfo?.topVisibleYear, scrollInfo?.scrollPercentage, setMicrochartIndicatorY, currentViewRange]);

    return (
        <div ref={containerRef} className="microchart-root">
            <svg ref={svgRef}></svg>
        </div>
    );
};

// ============================================================================
// EVENT DISPLAY COMPONENT
// ============================================================================

const EventDisplay = ({ containerRef }) => {
    const { events, selection, setScrollInfo } = useTimeline();
    const internalRef = useRef(null);
    const ref = containerRef || internalRef;
    const previousSelectionRef = useRef(null);
    const previousScrollInfoRef = useRef(null);
    const [expandedEvents, setExpandedEvents] = useState(new Set());
    const [floatingHeaderYear, setFloatingHeaderYear] = useState(null);
    const SWITCH_THRESHOLD = 20;

    // Memoize the grouping logic more efficiently
    const groupedEvents = useMemo(() => {
        if (!events.length) return [];
        
        const groups = {};
        
        for (const event of events) {
            const key = event.fields.startDate;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(event);
        }
        
        const sortedKeys = Object.keys(groups).sort((a, b) => Number(a) - Number(b));
        
        return sortedKeys.map(key => ({
            year: Number(key),
            events: groups[key]
        }));
    }, [events]);
    
    const findTopVisibleYear = useCallback((scrollTop, container) => {
        if (!groupedEvents.length) return null;

        const headers = container.querySelectorAll('.event-year-header');
        if (!headers.length) return null;

        const { scrollHeight, clientHeight } = container;
        const maxScroll = scrollHeight - clientHeight;
        const atBottom = maxScroll > 0 && scrollTop >= maxScroll - 5;

        if (atBottom) {
            return {
                year: groupedEvents[groupedEvents.length - 1].year,
                isAtBottom: true
            };
        }

        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top;
        
        let activeHeaderIndex = 0;
        
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            const headerRect = header.getBoundingClientRect();
            const headerTop = headerRect.top;
            
            if (headerTop <= containerTop + SWITCH_THRESHOLD) {
                activeHeaderIndex = i;
            } else {
                break;
            }
        }

        return {
            year: groupedEvents[activeHeaderIndex].year,
            isAtBottom: false
        };
    }, [groupedEvents]);

    // FIXED: Only call setScrollInfo when values actually change
    const handleScroll = useCallback(() => {
        if (!ref.current || !groupedEvents.length || !selection) return;

        const container = ref.current;
        const { scrollTop, scrollHeight, clientHeight } = container;
        
        const maxScroll = scrollHeight - clientHeight;
        const scrollPercentage = maxScroll > 0 ? 
            Math.max(0, Math.min(1, scrollTop / maxScroll)) : 1;

        const topVisibleInfo = findTopVisibleYear(scrollTop, container);
        
        if (topVisibleInfo) {
            // Update floating header
            setFloatingHeaderYear(topVisibleInfo.year);
            
            const newScrollInfo = {
                topVisibleYear: topVisibleInfo.year,
                scrollPercentage,
                isAtBottom: topVisibleInfo.isAtBottom,
                selectionRange: selection
            };

            // Only update if values have actually changed
            const prev = previousScrollInfoRef.current;
            if (!prev || 
                prev.topVisibleYear !== newScrollInfo.topVisibleYear ||
                Math.abs(prev.scrollPercentage - newScrollInfo.scrollPercentage) > 0.001 ||
                prev.isAtBottom !== newScrollInfo.isAtBottom ||
                prev.selectionRange[0] !== newScrollInfo.selectionRange[0] ||
                prev.selectionRange[1] !== newScrollInfo.selectionRange[1]) {
            
                previousScrollInfoRef.current = newScrollInfo;
                setScrollInfo(newScrollInfo);
            }
        }
    }, [groupedEvents, setScrollInfo, selection, findTopVisibleYear, ref]);

    // FIXED: Handle selection changes with proper dependency management
    useEffect(() => {
        if (!selection || !ref.current || !groupedEvents.length) return;
        
        const [startYear, endYear] = selection;
        
        if (previousSelectionRef.current) {
            const [prevStart, prevEnd] = previousSelectionRef.current;
            if (prevStart === startYear && prevEnd === endYear) return;
        }
        
        previousSelectionRef.current = selection;
        
        const targetGroup = groupedEvents.find(group => group.year >= startYear);
        
        if (targetGroup) {
            const container = ref.current;
            const elements = container.querySelectorAll('.event-year-header'); 
            
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                const groupYear = groupedEvents[i].year;
                
                if (groupYear === targetGroup.year) {
                    const containerRect = container.getBoundingClientRect();
                    const elementRect = element.getBoundingClientRect();
                    const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
                    container.scrollTop = relativeTop;
                    
                    // Set floating header to the target group year immediately
                    setFloatingHeaderYear(targetGroup.year);
                    break;
                }
            }
        }
    }, [selection, groupedEvents, ref]);

    const toggleEventExpansion = useCallback((eventTitle) => {
        setExpandedEvents(prev => {
            const newExpanded = new Set(prev);
            if (newExpanded.has(eventTitle)) {
                newExpanded.delete(eventTitle);
            } else {
                newExpanded.add(eventTitle);
            }
            return newExpanded;
        });
    }, []);

    // FIXED: Only call handleScroll once when component is ready
    useEffect(() => {
        if (groupedEvents.length > 0 && selection) {
            // Small delay to ensure DOM is ready
            const timeoutId = setTimeout(() => {
                // Find the first visible year in the selection range
                const [startYear] = selection;
                const targetGroup = groupedEvents.find(group => group.year >= startYear);
                if (targetGroup) {
                    setFloatingHeaderYear(targetGroup.year);
                }
                handleScroll();
            }, 0);
            
            return () => clearTimeout(timeoutId);
        }
    }, [groupedEvents.length, selection]); // Remove handleScroll from dependencies

    if (!events.length) {
        return <div className="event-display-container">Loading events...</div>;
    }

    return (
        <div className="event-display-container" ref={ref} onScroll={handleScroll}>
            {floatingHeaderYear && (
                <div className="floating-header">
                    {formatYear(floatingHeaderYear)}
                </div>
            )}
            {groupedEvents.length === 0 ? (
                <p>No events to display.</p>
            ) : (
                groupedEvents.map(group => (
                    <Fragment key={group.year}>
                        <h3 
                            className="event-year-header"
                            style={{ 
                                display: floatingHeaderYear === group.year ? 'none' : 'block' 
                            }}
                        >
                            {formatYear(group.year)}
                        </h3>
                        {group.events.map(event => {
                            const isExpanded = expandedEvents.has(event.fields.title);
                            
                            return (
                                <div className="event-item" key={event.fields.title}>
                                    <button 
                                        className={`event-triangle ${isExpanded ? 'expanded' : ''}`}
                                        onClick={() => toggleEventExpansion(event.fields.title)}
                                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} event details`}
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
                                                        Participants: {formatParticipants(event.fields.participants, peopleFullData)}
                                                    </div>
                                                )}
                                                {event.fields.groups && (
                                                    <div className="event-detail">
                                                        Groups: {event.fields.groups}
                                                    </div>
                                                )}
                                                {event.fields.locations && (
                                                    <div className="event-detail">
                                                        Locations: {formatLocations(event.fields.locations, placesFullData)}
                                                    </div>
                                                )}
                                                {event.fields.verses && (
                                                    <div className="event-detail">
                                                        Verses: {formatVerses(event.fields.verses)}
                                                    </div>
                                                )}
                                                {event.fields.partOf && (
                                                    <div className="event-detail">
                                                        Part Of: {event.fields.partOf}
                                                    </div>
                                                )}
                                                {event.fields.predecessor && (
                                                    <div className="event-detail">
                                                        Predecessor: {event.fields.predecessor}
                                                    </div>
                                                )}
                                                {event.fields.lag && (
                                                    <div className="event-detail">
                                                        Lag: {formatDuration(event.fields.lag)}
                                                    </div>
                                                )}
                                                {event.fields.lagType && (
                                                    <div className="event-detail">
                                                        Lag Type: {event.fields.lagType}
                                                    </div>
                                                )}
                                                {event.fields.notes && (
                                                    <div className="event-detail">
                                                        Notes: {event.fields.notes}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </Fragment>
                ))
            )}
        </div>
    );
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const EventTimeline = () => {
    const { 
        setSelection, 
        indicatorY, 
        microchartIndicatorY, 
        setScrollInfo, 
        selectedPeriod, 
        setSelectedPeriod, 
        isCustomRange, 
        setIsCustomRange, 
        isInitialized, 
        setIsInitialized, 
        setExternalSelection 
    } = useTimeline();
    
    const eventDisplayRef = useRef(null);
    const isInitialLoad = useRef(true);
    const pendingSelectionRef = useRef(null);

    useEffect(() => {
        const urlRange = parseUrlParams();
        
        if (urlRange) {
            const matchingPeriod = findMatchingPeriod(urlRange);
            setSelection(urlRange);
            setScrollInfo(prev => ({ ...prev, selectionRange: urlRange }));
            setExternalSelection(urlRange);
            if (matchingPeriod) {
                setSelectedPeriod(matchingPeriod);
                setIsCustomRange(false);
            } else {
                setSelectedPeriod(null);
                setIsCustomRange(true);
            }
        } else {
            const defaultRange = TIME_PERIODS.all;
            setSelection(defaultRange);
            setScrollInfo(prev => ({ ...prev, selectionRange: defaultRange }));
            setExternalSelection(defaultRange);
            setSelectedPeriod('all');
            setIsCustomRange(false);
            updateUrl(defaultRange);
        }
        
        setIsInitialized(true);
        
        setTimeout(() => {
            isInitialLoad.current = false;
        }, 100);
    }, []);

    // only called by MacroChart when user drags/resizes
    const handleBrush = useCallback((domain) => {
        if (isInitialLoad.current) {
            return;
        }

        const roundedDomain = [Math.round(domain[0]), Math.round(domain[1])];
        const minYear = TIME_PERIODS.all[0];
        const maxYear = TIME_PERIODS.all[1];

        const boundedDomain = [
            Math.max(minYear, Math.min(maxYear, roundedDomain[0])),
            Math.max(minYear, Math.min(maxYear, roundedDomain[1])),
        ];

        if (boundedDomain[0] >= boundedDomain[1]) {
            boundedDomain[1] = Math.min(maxYear, boundedDomain[0] + 1);
        }

        setSelection(boundedDomain);
        setScrollInfo((prev) => ({ ...prev, selectionRange: boundedDomain }));

        const matchingPeriod = findMatchingPeriod(boundedDomain);

        if (matchingPeriod) {
            setSelectedPeriod(matchingPeriod);
            setIsCustomRange(false);
        } else {
            setSelectedPeriod(null);
            setIsCustomRange(true);
        }

        pendingSelectionRef.current = boundedDomain;
    }, [setSelection, setScrollInfo, setSelectedPeriod, setIsCustomRange]);

    const throttledHandleBrush = useMemo(
        () => throttle(handleBrush, 10),
        [handleBrush]
    );

    useEffect(() => {
        const handleMouseUp = () => {
            if (pendingSelectionRef.current) {
                updateUrl(pendingSelectionRef.current);
                pendingSelectionRef.current = null;
            }
        };
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // This is called when user clicks period buttons
    const handlePeriodChange = useCallback((event) => {
        const period = event.target.value;
        
        if (isInitialLoad.current) {
            return;
        }
        
        if (!TIME_PERIODS[period]) {
            return;
        }
        
        setSelectedPeriod(period);
        setIsCustomRange(false);
        
        const newRange = TIME_PERIODS[period];
        
        setSelection(newRange);
        setScrollInfo(prev => ({ ...prev, selectionRange: newRange }));
        setExternalSelection(newRange);
        updateUrl(newRange);
    }, []);

    useEffect(() => {
        const handlePopState = () => {
            const urlRange = parseUrlParams();
            
            if (urlRange) {
                const matchingPeriod = findMatchingPeriod(urlRange);
                
                setSelection(urlRange);
                setScrollInfo(prev => ({ ...prev, selectionRange: urlRange }));
                setExternalSelection(urlRange); // Tell MacroChart to update
                
                if (matchingPeriod) {
                    setSelectedPeriod(matchingPeriod);
                    setIsCustomRange(false);
                } else {
                    setSelectedPeriod(null);
                    setIsCustomRange(true);
                }
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);

    const microchartIndicatorStyle = useMemo(() => ({
        top: `${microchartIndicatorY}px`,
        opacity: microchartIndicatorY !== null ? 1 : 0,
        transition: 'opacity 0.3s ease'
    }), [microchartIndicatorY]);

    const macroIndicatorStyle = useMemo(() => ({
        top: `${indicatorY}px`
    }), [indicatorY]);

    if (!isInitialized) {
        return <div className="page-container">Loading...</div>;
    }

    return (
        <>
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
                            </div>
                        </div>
                    </header>
                    <div className="timeline-container">
                        <div className="sidebar">
                            <div className="macrochart-container">
                            <MacroChart
                                    onBrush={throttledHandleBrush}
                                    onExternalSelectionProcessed={() => setExternalSelection(null)}
                                />
                            <div className="position-indicator" style={macroIndicatorStyle}></div>
                            </div>
                            <div className="microchart-container">
                                <Microchart />
                                {microchartIndicatorY !== null && (
                                    <div 
                                        className="microchart-position-indicator" 
                                        style={microchartIndicatorStyle}
                                    ></div>
                                )}
                            </div>
                        </div>
                        <EventDisplay containerRef={eventDisplayRef} />
                    </div>
                </div>
            </div>
        </>
    );
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TimelineProvider>
      <EventTimeline />
    </TimelineProvider>
  </React.StrictMode>,
)

// render(<EventTimeline />, document.body);