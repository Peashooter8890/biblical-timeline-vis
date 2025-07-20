import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { eventsFullData, peopleFullData, placesFullData } from './teststuff.js';
import { parseDuration, getRangeInfo, formatYear, calculateColumns, getEffectiveColumn, throttle, 
    parseUrlParams, findMatchingPeriod, updateUrl, formatDuration, formatLocations, formatParticipants, 
    formatVerses } from './utils.jsx';
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
const FULL_RANGE = [-4100, 150];
const SCROLL_SENSITIVITY = 125;
const STATIC_COLUMN_COUNT = 10;

// MacroChart constants
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

// Microchart constants
const DOT_RADIUS = 3;
const LINE_STROKE_WIDTH = 2;
const TOOLTIP_OFFSET_X = 10;
const TOOLTIP_OFFSET_Y = 50;

const EventsTimelineOld = () => {
    // Minimal React state - only for things that need to trigger re-renders
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const [isCustomRange, setIsCustomRange] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [expandedEvents, setExpandedEvents] = useState(new Set());
    const [floatingHeaderYear, setFloatingHeaderYear] = useState(null);

    // Refs for direct DOM access
    const macroSvgRef = useRef(null);
    const macroContainerRef = useRef(null);
    const microSvgRef = useRef(null);
    const microContainerRef = useRef(null);
    const eventDisplayRef = useRef(null);
    const macroIndicatorRef = useRef(null);
    const microIndicatorRef = useRef(null);
    
    // Event listener cleanup tracking
    const eventListenersRef = useRef(new Set());
    const lastRenderedRange = useRef([0, 0]);
    const macroOverlayCleanupRef = useRef(null);
    
    // Add refs to track overlay elements for proper cleanup
    const overlayElementsRef = useRef({
        overlay: null,
        topHandle: null,
        bottomHandle: null,
        topHandleText: null,
        bottomHandleText: null,
        cleanup: null
    });
    
    // Additional optimization: Use AbortController for better event cleanup
    const abortControllerRef = useRef(null);

    // Internal state (no React re-renders)
    const stateRef = useRef({
        events: calculateColumns(eventsFullData),
        selection: TIME_PERIODS.all,
        scrollOffset: 0,
        currentViewRange: TIME_PERIODS.all,
        groupedEvents: [],
        isUserInteracting: false,
        pendingSelection: null
    });

    // Macro chart state
    const macroStateRef = useRef({
        scaleInfo: null,
        brushBounds: [0, 0],
        brush: null,
        brushGroup: null,
        overlayElements: null,
        isExternalUpdate: false
    });

    // Micro chart state
    const microStateRef = useRef({
        processedEvents: [],
        lastIndicatorY: null
    });

    const isInitialLoad = useRef(true);

    // Enhanced cleanup for overlay elements
    const cleanupOverlayElements = useCallback(() => {
        const elements = overlayElementsRef.current;
        const container = macroContainerRef.current;
        
        if (container && elements.cleanup) {
            elements.cleanup();
        }
        
        // Remove DOM elements completely instead of reusing
        ['overlay', 'topHandle', 'bottomHandle', 'topHandleText', 'bottomHandleText'].forEach(key => {
            if (elements[key] && elements[key].parentNode) {
                elements[key].parentNode.removeChild(elements[key]);
            }
            elements[key] = null;
        });
        
        elements.cleanup = null;
        
        // Clear the macroOverlayCleanupRef
        if (macroOverlayCleanupRef.current) {
            macroOverlayCleanupRef.current = null;
        }
        
        // Clear overlay state
        macroStateRef.current.overlayElements = null;
    }, []);

    const addEventListenerWithCleanup = useCallback((element, event, handler, options = {}) => {
        if (!abortControllerRef.current) {
            abortControllerRef.current = new AbortController();
        }
        
        element.addEventListener(event, handler, {
            ...options,
            signal: abortControllerRef.current.signal
        });
    }, []);

    // Memory monitoring utility (development only)
    const logMemoryUsage = useCallback(() => {
        if (typeof window !== 'undefined' && window.performance?.memory) {
            console.log('Memory Usage:', {
                used: Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB',
                total: Math.round(window.performance.memory.totalJSHeapSize / 1024 / 1024) + ' MB',
                limit: Math.round(window.performance.memory.jsHeapSizeLimit / 1024 / 1024) + ' MB'
            });
        }
    }, []);

    // Utility functions
    const calculateDimensions = useCallback((container) => {
        if (!container) return { width: 0, height: 0 };
        const rect = container.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }, []);

    const groupEventsByYear = useCallback((events) => {
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
    }, []);

    // MacroChart functions
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

    const updateMacroIndicator = useCallback((year) => {
        if (!macroIndicatorRef.current || !macroStateRef.current.scaleInfo) return;
        
        const { yearToPixel } = macroStateRef.current.scaleInfo;
        const y = yearToPixel(year);
        macroIndicatorRef.current.style.top = `${y}px`;
        macroIndicatorRef.current.style.opacity = '1';
    }, []);

    const updateMicroIndicator = useCallback((y) => {
        if (!microIndicatorRef.current) return;
        
        if (y !== null) {
            microIndicatorRef.current.style.top = `${y}px`;
            microIndicatorRef.current.style.opacity = '1';
        } else {
            microIndicatorRef.current.style.opacity = '0';
        }
    }, []);

    // Enhanced throttle with proper cleanup
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
        
        // Add cleanup method
        throttledFn.cancel = () => {
            clearTimeout(timeoutId);
        };
        
        return throttledFn;
    }, []);

    // Selection handling
    const handleSelectionChange = useCallback((newSelection) => {
        if (isInitialLoad.current) return;

        const roundedSelection = [Math.round(newSelection[0]), Math.round(newSelection[1])];
        const minYear = TIME_PERIODS.all[0];
        const maxYear = TIME_PERIODS.all[1];

        const boundedSelection = [
            Math.max(minYear, Math.min(maxYear, roundedSelection[0])),
            Math.max(minYear, Math.min(maxYear, roundedSelection[1])),
        ];

        if (boundedSelection[0] >= boundedSelection[1]) {
            boundedSelection[1] = Math.min(maxYear, boundedSelection[0] + 1);
        }

        stateRef.current.selection = boundedSelection;
        stateRef.current.scrollOffset = 0;
        stateRef.current.currentViewRange = boundedSelection;

        const matchingPeriod = findMatchingPeriod(boundedSelection);

        if (matchingPeriod) {
            setSelectedPeriod(matchingPeriod);
            setIsCustomRange(false);
        } else {
            setSelectedPeriod(null);
            setIsCustomRange(true);
        }

        stateRef.current.pendingSelection = boundedSelection;
        
        // Update event display immediately
        updateEventDisplay();
        
        // Update microchart
        renderMicrochart();
    }, []);

    // Replace the existing throttledHandleSelectionChange with the enhanced version
    const throttledHandleSelectionChange = useMemo(
        () => createThrottledFunction(handleSelectionChange, 10),
        [handleSelectionChange, createThrottledFunction]
    );

    // Enhanced renderMacrochart with better cleanup
    const renderMacrochart = useCallback(() => {
        if (!macroSvgRef.current || !macroContainerRef.current) return;

        // Clean up previous overlay before creating new one
        cleanupOverlayElements();

        const dimensions = calculateDimensions(macroContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;

        const layout = calculateMacroLayout(dimensions);
        const converters = createMacroConverters(dimensions, layout);
        const oldScaleInfo = macroStateRef.current.scaleInfo;

        const svg = d3.select(macroSvgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        // More thorough D3 cleanup
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

        // Create brush
        const brush = d3.brushY()
            .extent([[0, 0], [dimensions.width, dimensions.height]])
            .on('brush end', (event) => {
                if (event.selection && !macroStateRef.current.isExternalUpdate) {
                    const [y0, y1] = event.selection;
                    macroStateRef.current.brushBounds = [y0, y1];
                    
                    const startYear = converters.pixelToYear(y0);
                    const endYear = converters.pixelToYear(y1);
                    throttledHandleSelectionChange([startYear, endYear]);
                }
            })
            .on('brush', (event) => {
                if (event.selection) {
                    macroStateRef.current.brushBounds = event.selection;
                }
            });

        const brushGroup = svg.append('g').attr('class', 'brush').call(brush);
        svg.selectAll('.brush .selection').style('display', 'none');
        svg.selectAll('.brush .overlay').style('pointer-events', 'none');

        macroStateRef.current.brush = brush;
        macroStateRef.current.brushGroup = brushGroup;

        // Calculate initial brush position
        const currentBounds = macroStateRef.current.brushBounds;
        let newY0, newY1;

        if (stateRef.current.isUserInteracting && currentBounds[0] !== 0 && currentBounds[1] !== 0) {
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

        macroStateRef.current.scaleInfo = { ...converters, dimensions };
        macroStateRef.current.isExternalUpdate = true;
        brush.move(brushGroup, [newY0, newY1]);
        macroStateRef.current.isExternalUpdate = false;
        macroStateRef.current.brushBounds = [newY0, newY1];

        // Setup overlay with the optimized version
        const cleanup = setupMacroOverlay(dimensions, brush, brushGroup);
        macroOverlayCleanupRef.current = cleanup;
    }, [calculateDimensions, calculateMacroLayout, createMacroConverters, throttledHandleSelectionChange, cleanupOverlayElements]);

    // Optimized setupMacroOverlay with proper memory management
    const setupMacroOverlay = useCallback((dimensions, brush, brushGroup) => {
        const container = macroContainerRef.current;
        if (!container) return () => {};

        // Clean up existing overlay first
        cleanupOverlayElements();

        const handleWidth = dimensions.width * HANDLE_WIDTH_RATIO;
        const handleLeft = (dimensions.width - handleWidth) / 2;

        // Create fresh elements (don't reuse to avoid stale references)
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

        // Store references for cleanup
        overlayElementsRef.current = {
            overlay,
            topHandle,
            bottomHandle,
            topHandleText,
            bottomHandleText,
            cleanup: null
        };

        // Lightweight update function that doesn't create closures over DOM elements
        const updateOverlayPositions = (y0, y1) => {
            if (!macroStateRef.current.scaleInfo) return;

            const height = y1 - y0;
            if (height < MIN_SELECTION_HEIGHT) return;

            // Use refs instead of closures to avoid memory leaks
            const elements = overlayElementsRef.current;
            if (!elements.overlay) return;

            elements.overlay.style.cssText = `
                position: absolute; cursor: move;
                left: 0px; top: ${y0}px;
                width: ${dimensions.width}px; height: ${height}px;`;

            elements.topHandle.style.cssText = `
                position: absolute; cursor: ns-resize;
                left: ${handleLeft}px; top: ${y0 - HANDLE_HEIGHT / 2}px;
                width: ${handleWidth}px; height: ${HANDLE_HEIGHT}px;`;

            elements.bottomHandle.style.cssText = `
                position: absolute; cursor: ns-resize;
                left: ${handleLeft}px; top: ${y1 - HANDLE_HEIGHT / 2}px;
                width: ${handleWidth}px; height: ${HANDLE_HEIGHT}px;`;
            
            const { pixelToYear } = macroStateRef.current.scaleInfo;
            const commonTextStyle = `position: absolute; pointer-events: none; text-align: center;
                width: ${handleWidth}px; left: ${handleLeft}px;
                font-size: 10px; line-height: ${HANDLE_HEIGHT}px;`;

            elements.topHandleText.style.cssText = commonTextStyle + `top: ${y0 - HANDLE_HEIGHT / 2}px;`;
            elements.topHandleText.textContent = formatYear(Math.round(pixelToYear(y0)));

            elements.bottomHandleText.style.cssText = commonTextStyle + `top: ${y1 - HANDLE_HEIGHT / 2}px;`;
            elements.bottomHandleText.textContent = formatYear(Math.round(pixelToYear(y1)));
        };
        
        macroStateRef.current.overlayElements = { updateOverlayPositions };
        
        const [initialY0, initialY1] = macroStateRef.current.brushBounds;
        updateOverlayPositions(initialY0, initialY1);

        // Optimized drag handlers that clean up properly
        const createDragHandler = (mode) => (startEvent) => {
            startEvent.preventDefault();
            stateRef.current.isUserInteracting = true;
            
            const startMouseY = startEvent.clientY;
            const [startY0, startY1] = macroStateRef.current.brushBounds;
            
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

                macroStateRef.current.isExternalUpdate = true;
                brush.move(brushGroup, [newY0, newY1]);
                macroStateRef.current.isExternalUpdate = false;
                
                macroStateRef.current.brushBounds = [newY0, newY1];
                updateOverlayPositions(newY0, newY1);

                if (macroStateRef.current.scaleInfo?.pixelToYear) {
                    const { pixelToYear } = macroStateRef.current.scaleInfo;
                    throttledHandleSelectionChange([pixelToYear(newY0), pixelToYear(newY1)]);
                }
            };

            const handleUp = () => {
                stateRef.current.isUserInteracting = false;
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
            };

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
        };

        const dragHandler = createDragHandler('drag');
        const resizeTopHandler = createDragHandler('resize-top');
        const resizeBottomHandler = createDragHandler('resize-bottom');

        overlay.addEventListener('mousedown', dragHandler);
        topHandle.addEventListener('mousedown', resizeTopHandler);
        bottomHandle.addEventListener('mousedown', resizeBottomHandler);

        // Return comprehensive cleanup function
        const cleanup = () => {
            overlay.removeEventListener('mousedown', dragHandler);
            topHandle.removeEventListener('mousedown', resizeTopHandler);
            bottomHandle.removeEventListener('mousedown', resizeBottomHandler);
            
            // Remove elements from DOM
            [overlay, topHandle, bottomHandle, topHandleText, bottomHandleText].forEach(element => {
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            });
        };

        overlayElementsRef.current.cleanup = cleanup;
        return cleanup;
    }, [throttledHandleSelectionChange, cleanupOverlayElements]);

    // Microchart functions
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

    const renderMicrochart = useCallback(() => {
        if (!microSvgRef.current || !microContainerRef.current) return;

        const dimensions = calculateDimensions(microContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;

        const [startYear, endYear] = stateRef.current.currentViewRange;
        const events = stateRef.current.events;
        
        const eraLayout = calculateMicroEraLayout(dimensions, stateRef.current.currentViewRange);
        const yScale = eraLayout.yScale;

        const filtered = events.filter(d => 
            d.fields.startDate >= startYear && d.fields.startDate <= endYear);

        // Process events by era
        const byEra = {};
        
        events.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color;
            
            if (!byEra[era]) {
                byEra[era] = [];
            }
            
            byEra[era].push(d);
        });

        // Create events
        const processedEvents = [];
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

                processedEvents.push({
                    ...d.fields,
                    color: rangeInfo.color,
                    columnX: x,
                    y
                });

                // Add lines
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

        microStateRef.current.processedEvents = processedEvents.sort((a, b) => a.startDate - b.startDate);

        // Remove old tooltip
        const oldTooltip = microContainerRef.current.querySelector('.microchart-tooltip');
        if (oldTooltip) {
            oldTooltip.remove();
        }

        const svg = d3.select(microSvgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        // More selective D3 cleanup - only remove our specific group
        svg.select('.microchart-group').remove();
        const g = svg.append('g').attr('class', 'microchart-group');

        // Batch D3 operations
        const lineSelection = g.selectAll('.microchart-line')
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

        // Create tooltip once
        let tooltip = d3.select(microContainerRef.current).select('.microchart-tooltip');
        if (tooltip.empty()) {
            tooltip = d3.select(microContainerRef.current)
                .append('div')
                .attr('class', 'microchart-tooltip')
                .style('opacity', 0);
        }

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
    }, [calculateDimensions, calculateMicroEraLayout]);

    // Event display functions
    const updateEventDisplay = useCallback(() => {
        if (!eventDisplayRef.current) return;

        const events = stateRef.current.events;
        const groupedEvents = groupEventsByYear(events);
        stateRef.current.groupedEvents = groupedEvents;

        const container = eventDisplayRef.current;
        
        // Clean up old event listeners first
        eventListenersRef.current.forEach(cleanup => cleanup());
        eventListenersRef.current.clear();
        
        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        
        // Add floating header
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
                // Create year header
                const yearHeader = document.createElement('h3');
                yearHeader.className = 'event-year-header';
                yearHeader.textContent = formatYear(group.year);
                fragment.appendChild(yearHeader);

                // Create events for this year
                group.events.forEach(event => {
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

                        // Add detail fields
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
                                detail.textContent = `${field.label}: ${value}`;
                                eventContent.appendChild(detail);
                            }
                        });
                    }

                    // Add click handler with proper cleanup tracking
                    const clickHandler = () => {
                        const newExpanded = new Set(expandedEvents);
                        if (newExpanded.has(event.fields.title)) {
                            newExpanded.delete(event.fields.title);
                        } else {
                            newExpanded.add(event.fields.title);
                        }
                        setExpandedEvents(newExpanded);
                    };
                    
                    triangle.addEventListener('click', clickHandler);
                    
                    // Track cleanup function
                    const cleanup = () => triangle.removeEventListener('click', clickHandler);
                    eventListenersRef.current.add(cleanup);

                    eventItem.appendChild(triangle);
                    eventItem.appendChild(eventContent);
                    fragment.appendChild(eventItem);
                });
            });
        }

        // Single DOM update
        container.innerHTML = '';
        container.appendChild(fragment);
    }, [groupEventsByYear, expandedEvents]);

    // Add debounce utility
    const debounce = useCallback((func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }, []);

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

        // Update indicators
        updateMacroIndicator(topVisibleYear);

        // Update micro indicator
        const events = microStateRef.current.processedEvents;
        const [viewStart, viewEnd] = stateRef.current.currentViewRange;

        let microIndicatorY = null;

        if (topVisibleYear < viewStart || topVisibleYear > viewEnd) {
            microIndicatorY = null;
        } else if (scrollPercentage === 1 && events.length > 0) {
            const lastEvent = events[events.length - 1];
            microIndicatorY = lastEvent.y;
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
                microIndicatorY = closest.y;
            }
        }

        if (microIndicatorY !== microStateRef.current.lastIndicatorY) {
            microStateRef.current.lastIndicatorY = microIndicatorY;
            updateMicroIndicator(microIndicatorY);
        }
    }, [updateMacroIndicator, updateMicroIndicator]);

    // Microchart scroll handling
    const handleMicroScroll = useCallback((event) => {
        event.preventDefault();
        
        const delta = event.deltaY > 0 ? SCROLL_SENSITIVITY : -SCROLL_SENSITIVITY;
        const [fullStart, fullEnd] = FULL_RANGE;
        const selection = stateRef.current.selection;
        const currentOffset = stateRef.current.scrollOffset;
        
        // Calculate new view range
        const calculateViewRange = (selectionRange, offset) => {
            const [selStart, selEnd] = selectionRange;
            const windowSize = selEnd - selStart;
            
            let viewStart = selStart + offset;
            let viewEnd = selEnd + offset;
            
            if (viewStart < fullStart) {
                viewStart = fullStart;
                viewEnd = fullStart + windowSize;
            }
            if (viewEnd > fullEnd) {
                viewEnd = fullEnd;
                viewStart = fullEnd - windowSize;
            }
            
            return [viewStart, viewEnd];
        };

        const currentRange = calculateViewRange(selection, currentOffset);
        
        const atTopBound = currentRange[0] <= fullStart;
        const atBottomBound = currentRange[1] >= fullEnd;
        const scrollingUp = delta < 0;
        const scrollingDown = delta > 0;
        
        if ((atTopBound && scrollingUp) || (atBottomBound && scrollingDown)) {
            return;
        }
        
        const newOffset = currentOffset + delta;
        const testRange = calculateViewRange(selection, newOffset);
        
        if (testRange[0] >= fullStart && testRange[1] <= fullEnd) {
            stateRef.current.scrollOffset = newOffset;
            stateRef.current.currentViewRange = testRange;
            renderMicrochart();
        }
    }, [renderMicrochart]);

    // Period change handler
    const handlePeriodChange = useCallback((event) => {
        const period = event.target.value;
        
        if (isInitialLoad.current || !TIME_PERIODS[period]) {
            return;
        }
        
        setSelectedPeriod(period);
        setIsCustomRange(false);
        
        const newRange = TIME_PERIODS[period];
        
        stateRef.current.selection = newRange;
        stateRef.current.scrollOffset = 0;
        stateRef.current.currentViewRange = newRange;
        
        // Update URL
        updateUrl(newRange);
        
        // Update displays
        updateEventDisplay();
        renderMicrochart();
        
        // Update macro chart
        if (macroStateRef.current.scaleInfo && macroStateRef.current.brush && macroStateRef.current.brushGroup) {
            const { yearToPixel } = macroStateRef.current.scaleInfo;
            const newY0 = yearToPixel(newRange[0]);
            const newY1 = yearToPixel(newRange[1]);
            
            macroStateRef.current.isExternalUpdate = true;
            macroStateRef.current.brush.move(macroStateRef.current.brushGroup, [newY0, newY1]);
            macroStateRef.current.isExternalUpdate = false;
            
            macroStateRef.current.brushBounds = [newY0, newY1];
            
            if (macroStateRef.current.overlayElements) {
                macroStateRef.current.overlayElements.updateOverlayPositions(newY0, newY1);
            }
        }
        
        // Scroll to start of period
        if (eventDisplayRef.current && stateRef.current.groupedEvents.length) {
            const [startYear] = newRange;
            const targetGroup = stateRef.current.groupedEvents.find(group => group.year >= startYear);
            
            if (targetGroup) {
                const container = eventDisplayRef.current;
                const elements = container.querySelectorAll('.event-year-header');
                
                for (let i = 0; i < elements.length; i++) {
                    const element = elements[i];
                    const groupYear = stateRef.current.groupedEvents[i].year;
                    
                    if (groupYear === targetGroup.year) {
                        const containerRect = container.getBoundingClientRect();
                        const elementRect = element.getBoundingClientRect();
                        const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
                        container.scrollTop = relativeTop;
                        break;
                    }
                }
            }
        }
    }, [updateEventDisplay, renderMicrochart]);

    // Initialize
    useEffect(() => {
        const urlRange = parseUrlParams();
        
        if (urlRange) {
            const matchingPeriod = findMatchingPeriod(urlRange);
            stateRef.current.selection = urlRange;
            stateRef.current.currentViewRange = urlRange;
            
            if (matchingPeriod) {
                setSelectedPeriod(matchingPeriod);
                setIsCustomRange(false);
            } else {
                setSelectedPeriod(null);
                setIsCustomRange(true);
            }
        } else {
            const defaultRange = TIME_PERIODS.all;
            stateRef.current.selection = defaultRange;
            stateRef.current.currentViewRange = defaultRange;
            setSelectedPeriod('all');
            setIsCustomRange(false);
            updateUrl(defaultRange);
        }
        
        // Initialize grouped events
        stateRef.current.groupedEvents = groupEventsByYear(stateRef.current.events);
        
        setIsInitialized(true);
        
        setTimeout(() => {
            isInitialLoad.current = false;
        }, 100);
    }, [groupEventsByYear]);

    // Setup resize observers and initial renders
    useEffect(() => {
        if (!isInitialized) return;

        const setupResizeObserver = (ref, renderFn) => {
            if (!ref.current) return null;
            
            const onResize = () => {
                window.requestAnimationFrame(() => {
                    if (ref.current) {
                        renderFn();
                    }
                });
            };
            
            const resizeObserver = new ResizeObserver(onResize);
            resizeObserver.observe(ref.current);
            
            // Initial render
            renderFn();
            
            return resizeObserver;
        };

        const macroObserver = setupResizeObserver(macroContainerRef, renderMacrochart);
        const microObserver = setupResizeObserver(microContainerRef, renderMicrochart);
        
        // Setup event display
        updateEventDisplay();
        
        // Setup event listeners
        const eventContainer = eventDisplayRef.current;
        const microContainer = microContainerRef.current;
        
        // Create debounced scroll handler
        const debouncedHandleEventScroll = debounce(handleEventScroll, 16); // ~60fps
        
        if (eventContainer) {
            eventContainer.addEventListener('scroll', debouncedHandleEventScroll);
        }
        
        if (microContainer) {
            microContainer.addEventListener('wheel', handleMicroScroll, { passive: false });
        }

        // Handle mouse up for URL updates
        const handleMouseUp = () => {
            if (stateRef.current.pendingSelection) {
                updateUrl(stateRef.current.pendingSelection);
                stateRef.current.pendingSelection = null;
            }
        };
        document.addEventListener('mouseup', handleMouseUp);

        // Handle popstate for browser navigation
        const handlePopState = () => {
            const urlRange = parseUrlParams();
            
            if (urlRange) {
                const matchingPeriod = findMatchingPeriod(urlRange);
                
                stateRef.current.selection = urlRange;
                stateRef.current.scrollOffset = 0;
                stateRef.current.currentViewRange = urlRange;
                
                if (matchingPeriod) {
                    setSelectedPeriod(matchingPeriod);
                    setIsCustomRange(false);
                } else {
                    setSelectedPeriod(null);
                    setIsCustomRange(true);
                }
                
                updateEventDisplay();
                renderMicrochart();
                
                // Update macro chart if initialized
                if (macroStateRef.current.scaleInfo && macroStateRef.current.brush && macroStateRef.current.brushGroup) {
                    const { yearToPixel } = macroStateRef.current.scaleInfo;
                    const newY0 = yearToPixel(urlRange[0]);
                    const newY1 = yearToPixel(urlRange[1]);
                    
                    macroStateRef.current.isExternalUpdate = true;
                    macroStateRef.current.brush.move(macroStateRef.current.brushGroup, [newY0, newY1]);
                    macroStateRef.current.isExternalUpdate = false;
                    
                    macroStateRef.current.brushBounds = [newY0, newY1];
                    
                    if (macroStateRef.current.overlayElements) {
                        macroStateRef.current.overlayElements.updateOverlayPositions(newY0, newY1);
                    }
                }
            }
        };

        window.addEventListener('popstate', handlePopState);

        return () => {
            if (macroObserver) macroObserver.disconnect();
            if (microObserver) microObserver.disconnect();
            if (eventContainer) eventContainer.removeEventListener('scroll', debouncedHandleEventScroll);
            if (microContainer) microContainer.removeEventListener('wheel', handleMicroScroll);
            document.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [isInitialized, renderMacrochart, renderMicrochart, updateEventDisplay, handleEventScroll, handleMicroScroll]);

    // Re-render event display when expandedEvents changes
    useEffect(() => {
        if (isInitialized) {
            updateEventDisplay();
        }
    }, [expandedEvents, updateEventDisplay, isInitialized]);

    // Add cleanup on component unmount
    useEffect(() => {
        return () => {
            // Cancel throttled functions
            if (throttledHandleSelectionChange?.cancel) {
                throttledHandleSelectionChange.cancel();
            }
            
            // Clean up overlay elements
            cleanupOverlayElements();
            
            // Clean up all event listeners
            eventListenersRef.current.forEach(cleanup => cleanup());
            eventListenersRef.current.clear();
            
            // Abort all event listeners at once
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
            
            // Clear D3 selections completely
            if (microSvgRef.current) {
                d3.select(microSvgRef.current).selectAll('*').remove();
                d3.select(microSvgRef.current).on('.brush', null);
            }
            if (macroSvgRef.current) {
                d3.select(macroSvgRef.current).selectAll('*').remove();
                d3.select(macroSvgRef.current).on('.brush', null);
            }
            
            // Clear all refs
            macroStateRef.current = {
                scaleInfo: null,
                brushBounds: [0, 0],
                brush: null,
                brushGroup: null,
                overlayElements: null,
                isExternalUpdate: false
            };
            
            microStateRef.current = {
                processedEvents: [],
                lastIndicatorY: null
            };
            
            // Force garbage collection in development (if available)
            if (process.env.NODE_ENV === 'development' && window.gc) {
                setTimeout(() => window.gc(), 100);
            }
            
            logMemoryUsage();
        };
    }, [cleanupOverlayElements, throttledHandleSelectionChange, logMemoryUsage]);

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
                        <div className="macrochart-container" ref={macroContainerRef}>
                            <svg ref={macroSvgRef}></svg>
                            <div ref={macroIndicatorRef} className="position-indicator"></div>
                        </div>
                        <div className="microchart-container" ref={microContainerRef}>
                            <svg ref={microSvgRef}></svg>
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
    <EventsTimelineOld />
  </React.StrictMode>
);