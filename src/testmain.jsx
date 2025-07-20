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

    // Selection state (not React state to avoid re-renders)
    const selectionState = useRef({
        pixelBounds: [0, 0],
        yearBounds: FULL_RANGE,
        macroScaleInfo: null,
        overlayElements: null,
        isDragging: false
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

    // Event listener cleanup tracking
    const eventListenersRef = useRef(new Set());

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
        if (!eventDisplayRef.current || !processedEvents.length) return;

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
        if (!selectionState.current.macroScaleInfo || !processedEvents.length) return;

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
        
        // Update macro indicator
        const macroY = selectionState.current.macroScaleInfo.yearToPixel(topVisibleYear);
        const macroContainer = macroContainerRef.current;
        if (macroContainer) {
            const macroDimensions = calculateDimensions(macroContainer);
            macroIndicatorRef.current.style.cssText = `
                position: absolute;
                left: 0;
                top: ${Math.max(0, Math.min(macroDimensions.height - 2, macroY - 1))}px;
                width: 100%;
                height: 2px;
                background: #ff0000;
                z-index: 10;
                pointer-events: none;
                box-shadow: 0 0 2px rgba(255, 0, 0, 0.5);
            `;
        }
        
        // Update micro indicator if microchart has rendered
        const microContainer = microContainerRef.current;
        if (microContainer && microSvgRef.current) {
            const microDimensions = calculateDimensions(microContainer);
            // Use the same era layout calculation as the microchart
            const viewRange = selectionState.current.yearBounds;
            const eraLayout = calculateMicroEraLayout(microDimensions, viewRange);
            const microY = eraLayout.yScale(topVisibleYear);
            
            microIndicatorRef.current.style.cssText = `
                position: absolute;
                right: 0;
                top: ${Math.max(0, Math.min(microDimensions.height - 2, microY - 1))}px;
                width: 50%;
                height: 2px;
                background: #ff0000;
                z-index: 10;
                pointer-events: none;
                box-shadow: 0 0 2px rgba(255, 0, 0, 0.5);
            `;
        }
    }, [calculateDimensions, calculateMicroEraLayout, processedEvents]);

    // Create throttled indicator update
    const throttledIndicatorUpdate = useCallback(
        createThrottledFunction(updatePositionIndicators, UPDATE_THROTTLE_MS),
        [updatePositionIndicators, createThrottledFunction]
    );

    // Render microchart - now uses selection for view range but shows all events
    const renderMicrochart = useCallback(() => {
        if (!microSvgRef.current || !microContainerRef.current || !processedEvents.length) return;

        const dimensions = calculateDimensions(microContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;

        // Use selection bounds for view range, but filter to show all events in that range
        const viewRange = selectionState.current.yearBounds;
        const [startYear, endYear] = viewRange;
        
        const eraLayout = calculateMicroEraLayout(dimensions, viewRange);
        const yScale = eraLayout.yScale;

        // Show all events, not just filtered ones
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

        // Create events and lines for the view range
        const processedEventsForDisplay = [];
        const lines = [];
        
        Object.keys(byEra).forEach(era => {
            const eraEvents = byEra[era].filter(d => 
                d.fields.startDate >= startYear && d.fields.startDate <= endYear);
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

        // Update indicators after microchart renders
        throttledIndicatorUpdate();
    }, [calculateDimensions, calculateMicroEraLayout, processedEvents, throttledIndicatorUpdate]);

    // Handle selection changes (this will update microchart and scroll events)
    const handleSelectionChange = useCallback((startYear, endYear) => {
        // Update selection state
        selectionState.current.yearBounds = [startYear, endYear];
        
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
        overlay.style.cssText = 'position: absolute; cursor: move; border: 2px solid #333; background: rgba(119, 119, 119, 0.5); pointer-events: all;';
        container.appendChild(overlay);

        const topHandle = document.createElement('div');
        topHandle.className = 'top-handle';
        topHandle.style.cssText = 'position: absolute; cursor: ns-resize; background: #333; pointer-events: all;';
        container.appendChild(topHandle);

        const bottomHandle = document.createElement('div');
        bottomHandle.className = 'bottom-handle';
        bottomHandle.style.cssText = 'position: absolute; cursor: ns-resize; background: #333; pointer-events: all;';
        container.appendChild(bottomHandle);
        
        const topHandleText = document.createElement('div');
        topHandleText.className = 'top-handle-text';
        topHandleText.style.cssText = 'position: absolute; pointer-events: none; text-align: center; font-size: 10px; color: #fff;';
        container.appendChild(topHandleText);

        const bottomHandleText = document.createElement('div');
        bottomHandleText.className = 'bottom-handle-text';
        bottomHandleText.style.cssText = 'position: absolute; pointer-events: none; text-align: center; font-size: 10px; color: #fff;';
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

        // Setup selection overlay
        setupMacroOverlay(dimensions);

        // Update indicators after macrochart renders
        throttledIndicatorUpdate();

    }, [calculateDimensions, calculateMacroLayout, createMacroConverters, setupMacroOverlay, cleanupOverlayElements, throttledIndicatorUpdate]);

    // Events stuff - unchanged, still shows all events
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

        // Update indicators after event display is updated
        throttledIndicatorUpdate();
    }, [groupEventsByYear, createEventItem, processedEvents, throttledIndicatorUpdate]);

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
            
            // Clean up throttled function
            if (throttledSelectionChange?.cancel) {
                throttledSelectionChange.cancel();
            }
            
            if (throttledIndicatorUpdate?.cancel) {
                throttledIndicatorUpdate.cancel();
            }
            
            // Clean up overlay elements
            cleanupOverlayElements();
            
            // Clean up event listeners
            eventListenersRef.current.forEach(cleanup => cleanup());
            eventListenersRef.current.clear();
        };
    }, [setupChart, renderMacrochart, renderMicrochart, processedEvents, throttledSelectionChange, throttledIndicatorUpdate, cleanupOverlayElements]);

    // Setup scroll listener for position indicators
    useEffect(() => {
        if (!eventDisplayRef.current) return;

        const container = eventDisplayRef.current;
        
        const handleScroll = () => {
            throttledIndicatorUpdate();
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        
        // Store cleanup reference
        const cleanup = () => {
            container.removeEventListener('scroll', handleScroll);
        };
        eventListenersRef.current.add(cleanup);

        return cleanup;
    }, [throttledIndicatorUpdate]);

    useEffect(() => {
        updateEventDisplay();
    }, [updateEventDisplay, expandedEvents]);

    return (
        <>
        <style>{getStyleOf('style.css')}</style>
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
        </>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EventsTimeline />
  </React.StrictMode>
);