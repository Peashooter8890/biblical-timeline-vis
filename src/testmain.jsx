import React, { useRef, useEffect, useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import * as d3 from 'd3';
import { eventsFullData, peopleFullData, placesFullData } from './teststuff.js';
const getStyleOf = (fileName) => {};
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
    formatVerses,
} from './utils.jsx';
import './testindex.css';

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

// Update frequency control
const UPDATE_THROTTLE_MS = 33; // 30fps, as requested

// Macrochart constants
const EQUAL_DISTRIBUTION_AREA = 0.5;
const PROPORTIONATE_DISTRIBUTION_AREA = 0.5;
const YEAR_LABEL_INTERVAL = 500;
const YEAR_LABEL_RANGE_START = -4000;
const YEAR_LABEL_RANGE_END = 0;
const LABEL_MARGIN = 15;
const LABEL_LINE_LENGTH = 10;
const COLOR_BAR_WIDTH_RATIO = 1/6;

// Selection overlay constants
const MIN_SELECTION_HEIGHT = 45;
const HANDLE_HEIGHT = 14;
const HANDLE_WIDTH_RATIO = 1/2;

// Microchart constants - UPDATED for dynamic sizing
const TOOLTIP_OFFSET_X = 10;
const TOOLTIP_OFFSET_Y = 50;
const FULL_RANGE = [-4100, 150];

// UI constants
const LAYOUT_CONFIG = {
    SIDEBAR_RATIO: 0.4,        // 2/5 of available width
    CONTENT_RATIO: 0.6,        // 3/5 of available width
    MICROCHART_GAP: 20,        // Gap between microchart and event display
    MACROCHART_WIDTH: 100,     // Fixed macrochart width
    MICROCHART_MIN_WIDTH: 100, // Hide microchart when less than this
};
const MICROCHART_MAX_DOT_DIAMETER = 10
const MICROCHART_COLUMNS = 10

const EventsTimeline = () => {
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const [isCustomRange, setIsCustomRange] = useState(false);
    const [expandedEvents, setExpandedEvents] = useState(new Set());
    const [floatingHeaderYear, setFloatingHeaderYear] = useState(null);

    const macroContainerRef = useRef(null);
    const macroSvgRef = useRef(null);
    const microContainerRef = useRef(null);
    const microSvgRef = useRef(null);
    const eventDisplayRef = useRef(null);
    const macroIndicatorRef = useRef(null);
    const microIndicatorRef = useRef(null);

    // Process events with proper column calculation on mount
    const [processedEvents, setProcessedEvents] = useState([]);

    // Master timeline scale (calculated once, never changes)
    const masterScale = useRef(null);

    // Selection state (not React state to avoid re-renders)
    const selectionState = useRef({
        pixelBounds: [0, 0],
        yearBounds: FULL_RANGE,
        macroScaleInfo: null,
        overlayElements: null,
        isDragging: false,
        currentViewRange: TIME_PERIODS.all
    });

    // Overlay element references for cleanup
    const overlayElementsRef = useRef({
        overlay: null,
        topHandle: null,
        bottomHandle: null,
        topHandleText: null,
        bottomHandleText: null,
        cleanup: null
    });

    const stateRef = useRef({
        events: [],
        selection: TIME_PERIODS.all,
        currentViewRange: TIME_PERIODS.all,
        groupedEvents: []
    });

    // Event listener cleanup tracking
    const eventListenersRef = useRef(new Set());

    // Calculate dynamic layout dimensions
    const calculateLayoutDimensions = useCallback(() => {
        if (!macroContainerRef.current) return null;
        
        const timelineContainer = macroContainerRef.current.closest('.timeline-container');
        if (!timelineContainer) return null;
        
        const containerStyle = window.getComputedStyle(timelineContainer);
        const containerWidth = timelineContainer.clientWidth; // Use clientWidth to exclude borders
        const gap = LAYOUT_CONFIG.MICROCHART_GAP;
        
        const availableWidth = containerWidth - gap;
        
        const sidebarWidth = Math.floor(availableWidth * LAYOUT_CONFIG.SIDEBAR_RATIO);
        const contentWidth = Math.floor(availableWidth * LAYOUT_CONFIG.CONTENT_RATIO);
        const microchartWidth = sidebarWidth - LAYOUT_CONFIG.MACROCHART_WIDTH;
        
        // Debug logging to check actual values
        console.log('Layout calculation:', {
            containerWidth,
            availableWidth,
            sidebarWidth,
            microchartWidth,
            minWidth: LAYOUT_CONFIG.MICROCHART_MIN_WIDTH
        });
        
        const showMicrochart = microchartWidth >= LAYOUT_CONFIG.MICROCHART_MIN_WIDTH;
        
        return {
            availableWidth,
            sidebarWidth: showMicrochart ? sidebarWidth : LAYOUT_CONFIG.MACROCHART_WIDTH,
            microchartWidth: showMicrochart ? microchartWidth : 0,
            contentWidth: showMicrochart ? contentWidth : availableWidth - LAYOUT_CONFIG.MACROCHART_WIDTH,
            showMicrochart
        };
    }, []);

    // Calculate master timeline scale (done once, never changes)
    const calculateMasterTimelineScale = useCallback(() => {
        const [fullStart, fullEnd] = FULL_RANGE;
        
        // Use a large reference height for precision
        const referenceHeight = 10000;
        
        const totalSpan = TIME_RANGES.reduce((sum, range) => 
            sum + Math.abs(range.end - range.start), 0);
        
        const numRanges = TIME_RANGES.length;
        const equalPortionHeight = referenceHeight * EQUAL_DISTRIBUTION_AREA;
        const proportionalPortionHeight = referenceHeight * PROPORTIONATE_DISTRIBUTION_AREA;
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

        const yearToPixel = (year) => {
            const rangeIndex = TIME_RANGES.findIndex(range => 
                year >= range.start && year <= range.end);
            
            if (rangeIndex === -1) {
                if (year < TIME_RANGES[0].start) return positions[0];
                if (year > TIME_RANGES[TIME_RANGES.length - 1].end) return referenceHeight;
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

        return { 
            yearToPixel, 
            pixelToYear, 
            totalHeight: referenceHeight,
            heights,
            positions
        };
    }, []);

    // Events grouping function
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

    useEffect(() => {
        const eventsWithColumns = calculateColumns(eventsFullData);
        setProcessedEvents(eventsWithColumns);
        
        // Initialize master scale (never changes after this)
        masterScale.current = calculateMasterTimelineScale();
        
        // Initialize state ref
        stateRef.current.events = eventsWithColumns;
        stateRef.current.groupedEvents = groupEventsByYear(eventsWithColumns);
    }, [calculateMasterTimelineScale, groupEventsByYear]);

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

        return { yearToPixel, pixelToYear, dimensions };
    }, []);

    // Enhanced cleanup for overlay elements
    const cleanupOverlayElements = useCallback(() => {
        const elements = overlayElementsRef.current;
        const container = macroContainerRef.current;
        
        if (container && elements.cleanup) {
            elements.cleanup();
        }
        
        // Remove DOM elements completely
        ['overlay', 'topHandle', 'bottomHandle', 'topHandleText', 'bottomHandleText'].forEach(key => {
            if (elements[key] && elements[key].parentNode) {
                elements[key].parentNode.removeChild(elements[key]);
            }
            elements[key] = null;
        });
        
        elements.cleanup = null;
        selectionState.current.overlayElements = null;
    }, []);

    // Create throttled update function
    const createThrottledFunction = useCallback((func, delay) => {
        let timeoutId;
        let lastExecTime = 0;
        
        const throttledFn = (...args) => {
            const currentTime = Date.now();
            
            if (currentTime - lastExecTime > delay) {
                func.apply(this, args);
                lastExecTime = currentTime;
            } else {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    func.apply(this, args);
                    lastExecTime = Date.now();
                }, delay - (currentTime - lastExecTime));
            }
        };
        
        throttledFn.cancel = () => {
            clearTimeout(timeoutId);
        };
        
        return throttledFn;
    }, []);

    // Scroll event display to a specific year
    const scrollToYear = useCallback((targetYear) => {
        if (!eventDisplayRef.current || !stateRef.current.events.length) return;

        const container = eventDisplayRef.current;
        const headers = container.querySelectorAll('.event-year-header');
        
        // Find the closest year header
        let closestHeader = null;
        let minDifference = Infinity;
        
        headers.forEach((header, index) => {
            const headerText = header.textContent;
            
            // Parse year correctly, handling BC years
            let year;
            if (headerText.includes('BC|AD')) {
                year = 0;
            } else if (headerText.includes('BC')) {
                // Extract the number and make it negative for BC years
                const match = headerText.match(/(\d+)\s*BC/);
                year = match ? -parseInt(match[1]) : 0;
            } else {
                // AD years (or other formats)
                const match = headerText.match(/(-?\d+)/);
                year = match ? parseInt(match[1]) : 0;
            }
            
            const difference = Math.abs(year - targetYear);
            
            if (difference < minDifference) {
                minDifference = difference;
                closestHeader = header;
            }
        });
        
        if (closestHeader) {
            const containerRect = container.getBoundingClientRect();
            const headerRect = closestHeader.getBoundingClientRect();
            const relativeTop = headerRect.top - containerRect.top + container.scrollTop;
            container.scrollTop = relativeTop;
        }
    }, [processedEvents]);

    // Calculate micro era layout - now uses selection bounds for view
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

    // Update position indicators based on scroll position
    const updatePositionIndicators = useCallback(() => {
        if (!eventDisplayRef.current || !macroIndicatorRef.current || !microIndicatorRef.current) return;
        if (!selectionState.current.macroScaleInfo || !stateRef.current.events.length || !masterScale.current) return;

        const container = eventDisplayRef.current;
        const headers = container.querySelectorAll('.event-year-header');
        
        if (headers.length === 0) return;

        // Find the topmost visible header
        let topVisibleHeader = null;
        let topVisibleYear = null;
        
        for (const header of headers) {
            const headerRect = header.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const relativeTop = headerRect.top - containerRect.top;
            
            if (relativeTop >= 0) {
                topVisibleHeader = header;
                break;
            }
        }
        
        // If no header is visible from the top, use the last one that's above the viewport
        if (!topVisibleHeader && headers.length > 0) {
            for (let i = headers.length - 1; i >= 0; i--) {
                const header = headers[i];
                const headerRect = header.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const relativeTop = headerRect.top - containerRect.top;
                
                if (relativeTop < 0) {
                    topVisibleHeader = header;
                    break;
                }
            }
        }
        
        if (!topVisibleHeader) {
            topVisibleHeader = headers[0];
        }
        
        // Parse year from header
        const headerText = topVisibleHeader.textContent;
        if (headerText.includes('BC|AD')) {
            topVisibleYear = 0;
        } else if (headerText.includes('BC')) {
            const match = headerText.match(/(\d+)\s*BC/);
            topVisibleYear = match ? -parseInt(match[1]) : 0;
        } else {
            const match = headerText.match(/(-?\d+)/);
            topVisibleYear = match ? parseInt(match[1]) : 0;
        }

        // Update floating header
        setFloatingHeaderYear(topVisibleYear);
        
        // Update macro indicator using CSS class
        const macroY = selectionState.current.macroScaleInfo.yearToPixel(topVisibleYear);
        const macroContainer = macroContainerRef.current;
        if (macroContainer) {
            const macroDimensions = calculateDimensions(macroContainer);
            macroIndicatorRef.current.style.top = `${Math.max(0, Math.min(macroDimensions.height - 2, macroY - 1))}px`;
        }
        
        // Update micro indicator using master scale with viewport mapping
        const microContainer = microContainerRef.current;
        if (microContainer && microSvgRef.current) {
            const microDimensions = calculateDimensions(microContainer);
            const [viewStart, viewEnd] = selectionState.current.yearBounds;
            
            // Use master scale for consistent positioning
            const masterViewStart = masterScale.current.yearToPixel(viewStart);
            const masterViewEnd = masterScale.current.yearToPixel(viewEnd);
            const masterViewHeight = masterViewEnd - masterViewStart;
            const masterYearPos = masterScale.current.yearToPixel(topVisibleYear);
            
            // Convert to viewport coordinates
            const microY = ((masterYearPos - masterViewStart) / masterViewHeight) * microDimensions.height;
            
            microIndicatorRef.current.style.top = `${Math.max(0, Math.min(microDimensions.height - 2, microY - 1))}px`;
        }
    }, [calculateDimensions, processedEvents]);

    // Enhanced scroll handler with floating header logic
    const handleEventScroll = useCallback(() => {
        if (!eventDisplayRef.current || !stateRef.current.groupedEvents.length) return;

        const container = eventDisplayRef.current;
        const { scrollTop, scrollHeight, clientHeight } = container;
        
        const maxScroll = scrollHeight - clientHeight;
        const scrollPercentage = maxScroll > 0 ? 
            Math.max(0, Math.min(1, scrollTop / maxScroll)) : 1;

        const headers = container.querySelectorAll('.event-year-header');
        if (!headers.length) return;

        const atBottom = maxScroll > 0 && scrollTop >= maxScroll - 5;
        const SWITCH_THRESHOLD = 20;

        let topVisibleYear;

        if (atBottom) {
            topVisibleYear = stateRef.current.groupedEvents[stateRef.current.groupedEvents.length - 1].year;
        } else {
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

            topVisibleYear = stateRef.current.groupedEvents[activeHeaderIndex].year;
        }

        // Update floating header
        const floatingHeader = container.querySelector('.floating-header');
        if (floatingHeader) {
            if (topVisibleYear !== null) {
                floatingHeader.textContent = formatYear(topVisibleYear);
                floatingHeader.style.display = 'block';
                setFloatingHeaderYear(topVisibleYear);
                
                // Hide corresponding regular header
                headers.forEach((header, index) => {
                    if (stateRef.current.groupedEvents[index]?.year === topVisibleYear) {
                        header.style.display = 'none';
                    } else {
                        header.style.display = 'block';
                    }
                });
            }
        }

        // Update position indicators
        updatePositionIndicators();
    }, [updatePositionIndicators]);

    // Create throttled indicator update
    const throttledIndicatorUpdate = useCallback(
        createThrottledFunction(updatePositionIndicators, UPDATE_THROTTLE_MS),
        [updatePositionIndicators, createThrottledFunction]
    );

    // Create throttled scroll handler
    const throttledScrollHandler = useCallback(
        createThrottledFunction(handleEventScroll, UPDATE_THROTTLE_MS),
        [handleEventScroll, createThrottledFunction]
    );

    // FIXED: Render microchart with dynamic sizing
    const renderMicrochart = useCallback(() => {
        if (!microSvgRef.current || !microContainerRef.current || !processedEvents.length || !masterScale.current) return;

        const layoutDims = calculateLayoutDimensions();
        if (!layoutDims || !layoutDims.showMicrochart) {
            // Hide microchart
            microContainerRef.current.classList.add('hidden');
            return;
        }

        // Show microchart and set dimensions
        microContainerRef.current.classList.remove('hidden');
        microContainerRef.current.style.width = `${layoutDims.microchartWidth}px`;

        const dimensions = calculateDimensions(microContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;
        
        const dynamicDotDiameter = Math.min(MICROCHART_MAX_DOT_DIAMETER, (dimensions.width / ((2 * MICROCHART_COLUMNS) - 1)));
        const dynamicDotRadius = dynamicDotDiameter / 2;
        console.log(dynamicDotDiameter)
        
        // FIXED: Scale line width proportionally (maintain aspect ratio with original constants)
        // Original ratio: LINE_STROKE_WIDTH / (DOT_RADIUS * 2) = 2 / (3 * 2) = 1/3
        const dynamicLineWidth = Math.max(1, dynamicDotDiameter / 3);

        // Use selection bounds for viewport clipping
        const [viewStart, viewEnd] = selectionState.current.yearBounds;
        
        // Calculate viewport bounds in master scale pixels
        const masterViewStart = masterScale.current.yearToPixel(viewStart);
        const masterViewEnd = masterScale.current.yearToPixel(viewEnd);
        const masterViewHeight = masterViewEnd - masterViewStart;

        // Show all events, positioned using master scale
        const allEvents = processedEvents;

        // Process events by era
        const byEra = {};
        
        allEvents.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color;
            
            if (!byEra[era]) {
                byEra[era] = [];
            }
            
            byEra[era].push(d);
        });

        // Create events for the view range (dots only)
        const processedEventsForDisplay = [];

        Object.keys(byEra).forEach(era => {
            const eraEvents = byEra[era].filter(d => 
                d.fields.startDate >= viewStart && d.fields.startDate <= viewEnd);
            
            eraEvents.forEach(d => {
                const rangeInfo = getRangeInfo(d.fields.startDate);
                const column = getEffectiveColumn(d);
                
                // FIXED: Distribute evenly across full width using dynamic sizing
                const effectiveColumn = Math.min(column - 1, MICROCHART_COLUMNS - 1); // 0-based
                // Position in center of each column's allocated space
                const columnWidth = dimensions.width / MICROCHART_COLUMNS;
                const x = (effectiveColumn * columnWidth) + (columnWidth / 2);
                
                // Position using master scale, then convert to viewport coordinates
                const masterY = masterScale.current.yearToPixel(d.fields.startDate);
                const viewportY = ((masterY - masterViewStart) / masterViewHeight) * dimensions.height;

                processedEventsForDisplay.push({
                    ...d.fields,
                    color: rangeInfo.color,
                    columnX: x,
                    y: viewportY
                });
            });
        });

        // FIXED: Process lines with dynamic sizing
        const lines = [];

        allEvents.forEach(d => {
            const duration = parseDuration(d.fields.duration);
            if (duration >= 1) {
                const lineStart = parseFloat(d.fields.startDate);
                const lineEnd = lineStart + duration;
                
                // Check if line intersects the viewport
                const intersects = (
                    (lineStart >= viewStart && lineStart <= viewEnd) ||
                    (lineEnd >= viewStart && lineEnd <= viewEnd) ||
                    (lineStart <= viewStart && lineEnd >= viewEnd)
                );

                if (intersects) {
                    const rangeInfo = getRangeInfo(d.fields.startDate);
                    const column = getEffectiveColumn(d);
                    
                    // FIXED: Use same positioning logic as dots
                    const effectiveColumn = Math.min(column - 1, MICROCHART_COLUMNS - 1); // 0-based
                    const columnWidth = dimensions.width / MICROCHART_COLUMNS;
                    const x = (effectiveColumn * columnWidth) + (columnWidth / 2);
                    
                    const masterStartY = masterScale.current.yearToPixel(lineStart);
                    const masterEndY = masterScale.current.yearToPixel(lineEnd);
                    
                    const startY = ((masterStartY - masterViewStart) / masterViewHeight) * dimensions.height;
                    const endY = ((masterEndY - masterViewStart) / masterViewHeight) * dimensions.height;
                    
                    // Constrain to viewport bounds
                    const y1 = Math.max(0, Math.min(dimensions.height, startY));
                    const y2 = Math.max(0, Math.min(dimensions.height, endY));
                    
                    lines.push({
                        x1: x,
                        y1: y1,
                        x2: x,
                        y2: y2,
                        color: rangeInfo.color,
                        eventData: d.fields
                    });
                }
            }
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
        const g = svg.append('g')
            .attr('class', 'microchart-group')
            // FIXED: Ensure group uses full width
            .attr('transform', `translate(0,0)`);

        // FIXED: Draw lines with dynamic width
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
            .style('stroke-width', `${dynamicLineWidth}px`) // FIXED: Dynamic line width
            .on('mouseover', function(event, d) {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                tooltip.html(d.eventData?.title || '')
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
                    .style('stroke', null);
            });

        // Create tooltip
        let tooltip = d3.select(microContainerRef.current).select('.microchart-tooltip');
        if (tooltip.empty()) {
            tooltip = d3.select(microContainerRef.current)
                .append('div')
                .attr('class', 'microchart-tooltip')
                .style('opacity', 0);
        }

        // FIXED: Draw dots with dynamic radius
        g.selectAll('.microchart-dot')
            .data(processedEventsForDisplay)
            .enter()
            .append('circle')
            .attr('class', 'microchart-dot')
            .attr('cx', d => d.columnX)
            .attr('cy', d => d.y)
            .attr('r', dynamicDotRadius) // FIXED: Dynamic radius
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

        // Update indicators after microchart renders
        throttledIndicatorUpdate();
    }, [calculateLayoutDimensions, calculateDimensions, processedEvents, throttledIndicatorUpdate]);

    // Update layout dimensions
    const updateLayout = useCallback(() => {
        const layoutDims = calculateLayoutDimensions();
        if (!layoutDims) return;

        // Update microchart width (or hide it)
        if (microContainerRef.current) {
            if (layoutDims.showMicrochart) {
                microContainerRef.current.classList.remove('hidden');
                microContainerRef.current.style.width = `${layoutDims.microchartWidth}px`;
            } else {
                microContainerRef.current.classList.add('hidden');
            }
        }

        // Update event display width
        if (eventDisplayRef.current) {
            eventDisplayRef.current.style.width = `${layoutDims.contentWidth}px`;
        }

        // Trigger microchart re-render if visible
        if (layoutDims.showMicrochart) {
            renderMicrochart();
        }
    }, [calculateLayoutDimensions, renderMicrochart]);

    // Handle selection changes (this will update microchart and scroll events)
    const handleSelectionChange = useCallback((startYear, endYear) => {
        // Update selection state
        selectionState.current.yearBounds = [startYear, endYear];
        
        // Check if this matches a predefined period
        const matchingPeriod = Object.keys(TIME_PERIODS).find(key => {
            const [pStart, pEnd] = TIME_PERIODS[key];
            return Math.abs(pStart - startYear) < 10 && Math.abs(pEnd - endYear) < 10;
        });

        if (matchingPeriod) {
            setSelectedPeriod(matchingPeriod);
            setIsCustomRange(false);
        } else {
            setSelectedPeriod('all');
            setIsCustomRange(true);
        }
        
        // Update microchart with new view range
        renderMicrochart();
        
        // Scroll event display to the start of the selection
        scrollToYear(startYear);
    }, [renderMicrochart, scrollToYear]);

    // Create throttled selection handler
    const throttledSelectionChange = useCallback(
        createThrottledFunction(handleSelectionChange, UPDATE_THROTTLE_MS),
        [handleSelectionChange, createThrottledFunction]
    );

    
    // Setup optimized macro overlay
    const setupMacroOverlay = useCallback((dimensions) => {
        const container = macroContainerRef.current;
        if (!container) return () => {};

        // Clean up existing overlay first
        cleanupOverlayElements();

        const handleWidth = dimensions.width * HANDLE_WIDTH_RATIO;
        const handleLeft = (dimensions.width - handleWidth) / 2;

        // Create fresh elements
        const overlay = document.createElement('div');
        overlay.className = 'selection-overlay';
        container.appendChild(overlay);

        const topHandle = document.createElement('div');
        topHandle.className = 'top-handle';
        container.appendChild(topHandle);

        const bottomHandle = document.createElement('div');
        bottomHandle.className = 'bottom-handle';
        container.appendChild(bottomHandle);
        
        const topHandleText = document.createElement('div');
        topHandleText.className = 'top-handle-text';
        container.appendChild(topHandleText);

        const bottomHandleText = document.createElement('div');
        bottomHandleText.className = 'bottom-handle-text';
        container.appendChild(bottomHandleText);

        // Store references
        overlayElementsRef.current = {
            overlay,
            topHandle,
            bottomHandle,
            topHandleText,
            bottomHandleText,
            cleanup: null
        };

        // Update overlay positions
        const updateOverlayPosition = (y0, y1) => {
            if (!selectionState.current.macroScaleInfo) return;

            const height = y1 - y0;
            if (height < MIN_SELECTION_HEIGHT) return;

            const elements = overlayElementsRef.current;
            if (!elements.overlay) return;

            // Update overlay
            overlay.style.left = '0px';
            overlay.style.top = y0 + 'px';
            overlay.style.width = dimensions.width + 'px';
            overlay.style.height = height + 'px';

            // Update handles
            topHandle.style.left = handleLeft + 'px';
            topHandle.style.top = (y0 - HANDLE_HEIGHT / 2) + 'px';
            topHandle.style.width = handleWidth + 'px';
            topHandle.style.height = HANDLE_HEIGHT + 'px';

            bottomHandle.style.left = handleLeft + 'px';
            bottomHandle.style.top = (y1 - HANDLE_HEIGHT / 2) + 'px';
            bottomHandle.style.width = handleWidth + 'px';
            bottomHandle.style.height = HANDLE_HEIGHT + 'px';

            // Update handle text
            const { pixelToYear } = selectionState.current.macroScaleInfo;
            const commonTextStyle = `line-height: ${HANDLE_HEIGHT}px; width: ${handleWidth}px; left: ${handleLeft}px;`;

            topHandleText.style.cssText += commonTextStyle + `top: ${y0 - HANDLE_HEIGHT / 2}px;`;
            topHandleText.textContent = formatYear(Math.round(pixelToYear(y0)));

            bottomHandleText.style.cssText += commonTextStyle + `top: ${y1 - HANDLE_HEIGHT / 2}px;`;
            bottomHandleText.textContent = formatYear(Math.round(pixelToYear(y1)));

            // Update pixel bounds
            selectionState.current.pixelBounds = [y0, y1];
            
            // Trigger throttled selection change
            const startYear = pixelToYear(y0);
            const endYear = pixelToYear(y1);
            throttledSelectionChange(startYear, endYear);
        };

        // Create drag handlers
        const createDragHandler = (mode) => (startEvent) => {
            startEvent.preventDefault();
            selectionState.current.isDragging = true;
            
            const startMouseY = startEvent.clientY;
            const [startY0, startY1] = selectionState.current.pixelBounds;
            
            const handleMove = (moveEvent) => {
                const deltaY = moveEvent.clientY - startMouseY;
                let newY0 = startY0;
                let newY1 = startY1;
                const startHeight = startY1 - startY0;

                if (mode === 'drag') {
                    newY0 = Math.max(0, Math.min(dimensions.height - startHeight, startY0 + deltaY));
                    newY1 = newY0 + startHeight;
                } else if (mode === 'resize-top') {
                    newY0 = Math.max(0, Math.min(startY1 - MIN_SELECTION_HEIGHT, startY0 + deltaY));
                } else if (mode === 'resize-bottom') {
                    newY1 = Math.min(dimensions.height, Math.max(startY0 + MIN_SELECTION_HEIGHT, startY1 + deltaY));
                }

                updateOverlayPosition(newY0, newY1);
            };

            const handleUp = () => {
                selectionState.current.isDragging = false;
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
            };

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
        };

        // Attach drag handlers
        const dragHandler = createDragHandler('drag');
        const resizeTopHandler = createDragHandler('resize-top');
        const resizeBottomHandler = createDragHandler('resize-bottom');

        overlay.addEventListener('mousedown', dragHandler);
        topHandle.addEventListener('mousedown', resizeTopHandler);
        bottomHandle.addEventListener('mousedown', resizeBottomHandler);

        // Store update function
        selectionState.current.overlayElements = { updateOverlayPosition };

        // Initialize position
        const initialY0 = selectionState.current.macroScaleInfo.yearToPixel(FULL_RANGE[0]);
        const initialY1 = selectionState.current.macroScaleInfo.yearToPixel(FULL_RANGE[1]);
        updateOverlayPosition(initialY0, initialY1);

        // Return cleanup function
        const cleanup = () => {
            overlay.removeEventListener('mousedown', dragHandler);
            topHandle.removeEventListener('mousedown', resizeTopHandler);
            bottomHandle.removeEventListener('mousedown', resizeBottomHandler);
            
            [overlay, topHandle, bottomHandle, topHandleText, bottomHandleText].forEach(element => {
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            });
        };

        overlayElementsRef.current.cleanup = cleanup;
        return cleanup;
    }, [cleanupOverlayElements, throttledSelectionChange]);


    // Render macrochart
    const renderMacrochart = useCallback(() => {
        if (!macroSvgRef.current || !macroContainerRef.current) return;

        // Clean up previous overlay
        cleanupOverlayElements();

        const dimensions = calculateDimensions(macroContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;

        const layout = calculateMacroLayout(dimensions);
        const converters = createMacroConverters(dimensions, layout);

        // Store scale info for selection overlay
        selectionState.current.macroScaleInfo = converters;

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
            .attr('y2', converters.yearToPixel);

        svg.selectAll('.year-label')
            .data(years)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', x - LABEL_MARGIN)
            .attr('y', d => converters.yearToPixel(d) + 5)
            .text(d => d === 0 ? 'BC|AD' : `${Math.abs(d)} BC`);

        // Setup selection overlay
        setupMacroOverlay(dimensions);

        // Update indicators after macrochart renders
        throttledIndicatorUpdate();

    }, [calculateDimensions, calculateMacroLayout, createMacroConverters, setupMacroOverlay, cleanupOverlayElements, throttledIndicatorUpdate]);

    // Events stuff - now shows filtered events
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
        if (!eventDisplayRef.current || !stateRef.current.events.length) return;

        const [startYear, endYear] = selectionState.current.currentViewRange;
        const filteredEvents = stateRef.current.events.filter(event => 
            event.fields.startDate >= startYear && event.fields.startDate <= endYear);
        const groupedEvents = groupEventsByYear(filteredEvents);
        stateRef.current.groupedEvents = groupedEvents;

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

        // Update indicators after event display is updated
        throttledIndicatorUpdate();
    }, [groupEventsByYear, createEventItem, throttledIndicatorUpdate]);

    const handlePeriodChange = useCallback((event) => {
        const period = event.target.value;
        
        setSelectedPeriod(period);
        setIsCustomRange(false);
        
        const newRange = TIME_PERIODS[period];
        
        stateRef.current.selection = newRange;
        stateRef.current.currentViewRange = newRange;
        
        // Update selection state
        selectionState.current.yearBounds = newRange;
        selectionState.current.currentViewRange = newRange;
        
        // Update displays
        updateEventDisplay();
        renderMicrochart();
        
        // Update macro chart selection if it's rendered
        if (selectionState.current.macroScaleInfo && selectionState.current.overlayElements) {
            const { yearToPixel } = selectionState.current.macroScaleInfo;
            const y0 = yearToPixel(newRange[0]);
            const y1 = yearToPixel(newRange[1]);
            selectionState.current.pixelBounds = [y0, y1];
            selectionState.current.overlayElements.updateOverlayPosition(y0, y1);
        }
        
        // Scroll to start of period
        if (period !== 'all' && newRange) {
            scrollToYear(newRange[0]);
        }
    }, [updateEventDisplay, renderMicrochart, scrollToYear]);

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
                    // Update layout first, then render
                    if (chartName === 'micro') {
                        updateLayout();
                    } else {
                        renderFunction();
                    }
                }
            });
        });

        resizeObserver.observe(containerRef.current.closest('.timeline-container') || containerRef.current);

        return resizeObserver;
    }, [updateLayout]);

    // Setup charts on mount and resize
    useEffect(() => {
        if (!processedEvents.length || !masterScale.current) return;

        const macroObserver = setupChart(macroContainerRef, macroSvgRef, renderMacrochart, 'macro');
        const microObserver = setupChart(microContainerRef, microSvgRef, renderMicrochart, 'micro');

        return () => {
            if (macroObserver) macroObserver.disconnect();
            if (microObserver) microObserver.disconnect();
            
            // Clean up throttled function
            if (throttledSelectionChange?.cancel) {
                throttledSelectionChange.cancel();
            }
            
            if (throttledIndicatorUpdate?.cancel) {
                throttledIndicatorUpdate.cancel();
            }
            
            if (throttledScrollHandler?.cancel) {
                throttledScrollHandler.cancel();
            }
            
            // Clean up overlay elements
            cleanupOverlayElements();
            
            // Clean up event listeners
            eventListenersRef.current.forEach(cleanup => cleanup());
            eventListenersRef.current.clear();
        };
    }, [setupChart, renderMacrochart, renderMicrochart, processedEvents, throttledSelectionChange, throttledIndicatorUpdate, throttledScrollHandler, cleanupOverlayElements]);

    // Setup scroll listener for position indicators
    useEffect(() => {
        if (!eventDisplayRef.current) return;

        const container = eventDisplayRef.current;
        
        const handleScroll = () => {
            throttledScrollHandler();
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        
        // Store cleanup reference
        const cleanup = () => {
            container.removeEventListener('scroll', handleScroll);
        };
        eventListenersRef.current.add(cleanup);

        return cleanup;
    }, [throttledScrollHandler]);

    useEffect(() => {
        updateEventDisplay();
    }, [updateEventDisplay, expandedEvents]);

    return (
        <>
        <style>{getStyleOf('style.css')}</style>
        <div className="page-container">
            <div className="content-wrapper">
                <header className="header">
                    <h1><i>Timeline of the Bible</i></h1>
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
        </>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EventsTimeline />
  </React.StrictMode>
);