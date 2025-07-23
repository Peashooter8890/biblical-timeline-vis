import React, { useRef, useEffect, useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import * as d3 from 'd3';
import { eventsFullData } from './teststuff.js';
const getStyleOf = (fileName) => {};
import {
    TIME_RANGES,
    TIME_PERIODS,
    PERIODS,
    formatYear, 
    parseDuration, 
    getRangeInfo, 
    calculateColumns, 
    getEffectiveColumn, 
    calculateDimensions,
} from './utils.jsx';
import './testindex.css';

const UPDATE_THROTTLE_MS = 33; 
const SCROLL_THROTTLE_MS = 33;
const EQUAL_DISTRIBUTION_AREA = 0.5;
const PROPORTIONATE_DISTRIBUTION_AREA = 0.5;
const YEAR_LABEL_INTERVAL = 500;
const YEAR_LABEL_RANGE_START = -4000;
const YEAR_LABEL_RANGE_END = 0;
const LABEL_MARGIN = 15;
const LABEL_LINE_LENGTH = 10;
const COLOR_BAR_WIDTH_RATIO = 1/6;
const MIN_SELECTION_HEIGHT = 45;
const HANDLE_HEIGHT = 14;
const HANDLE_WIDTH_RATIO = 1/2;
const TOOLTIP_OFFSET_X = 10;
const TOOLTIP_OFFSET_Y = 50;
const FULL_RANGE = [-4150, 80];
const CHART_WHEEL_SENSITIVITY = 0.5;

const LAYOUT_CONFIG = {
    SIDEBAR_RATIO: 0.4,        
    CONTENT_RATIO: 0.6,        
    MICROCHART_GAP: 20,        
    MACROCHART_WIDTH: 100,     
    MICROCHART_MIN_WIDTH: 100, 
};
const MICROCHART_MAX_DOT_DIAMETER = 10
const MICROCHART_COLUMNS = 10

const EventsTimeline = () => {
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const [isCustomRange, setIsCustomRange] = useState(false);

    const macroContainerRef = useRef(null);
    const macroSvgRef = useRef(null);
    const microContainerRef = useRef(null);
    const microSvgRef = useRef(null);
    const eventDisplayRef = useRef(null);
    const macroIndicatorRef = useRef(null);
    const microIndicatorRef = useRef(null);
    const microIndicatorTextRef = useRef(null);
    const [processedEvents, setProcessedEvents] = useState([]);
    const masterScale = useRef(null);

    const selectionState = useRef({
        pixelBounds: [0, 0],
        yearBounds: FULL_RANGE,
        macroScaleInfo: null,
        overlayElements: null,
        isDragging: false,
        currentViewRange: TIME_PERIODS.all
    });

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

    const eventListenersRef = useRef(new Set());

    const scrollDirectionRef = useRef({
        lastScrollTop: 0,
        direction: 'none', // 'up', 'down', 'none'
        directionConfidenceCounter: 0,
        lastUpdateTime: 0
    });

    // UTILITY FUNCTIONS (no dependencies)
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

    // HELPER FUNCTIONS (basic calculations)
    const calculateLayoutDimensions = useCallback(() => {
        if (!macroContainerRef.current) return null;
        
        const timelineContainer = macroContainerRef.current.closest('.timeline-container');
        if (!timelineContainer) return null;

        const containerWidth = timelineContainer.clientWidth; 
        const gap = LAYOUT_CONFIG.MICROCHART_GAP;
        const availableWidth = containerWidth - gap;
        const sidebarWidth = Math.floor(availableWidth * LAYOUT_CONFIG.SIDEBAR_RATIO);
        const contentWidth = Math.floor(availableWidth * LAYOUT_CONFIG.CONTENT_RATIO);
        const microchartWidth = sidebarWidth - LAYOUT_CONFIG.MACROCHART_WIDTH;
        const showMicrochart = microchartWidth >= LAYOUT_CONFIG.MICROCHART_MIN_WIDTH;
        
        return {
            availableWidth,
            sidebarWidth: showMicrochart ? sidebarWidth : LAYOUT_CONFIG.MACROCHART_WIDTH,
            microchartWidth: showMicrochart ? microchartWidth : 0,
            contentWidth: showMicrochart ? contentWidth : availableWidth - LAYOUT_CONFIG.MACROCHART_WIDTH,
            showMicrochart
        };
    }, []);

    const calculateMasterTimelineScale = useCallback(() => {
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

        return { yearToPixel, pixelToYear, dimensions };
    }, []);

    const cleanupOverlayElements = useCallback(() => {
        const elements = overlayElementsRef.current;
        const container = macroContainerRef.current;
        
        if (container && elements.cleanup) {
            elements.cleanup();
        }

        ['overlay', 'topHandle', 'bottomHandle', 'topHandleText', 'bottomHandleText'].forEach(key => {
            if (elements[key] && elements[key].parentNode) {
                elements[key].parentNode.removeChild(elements[key]);
            }
            elements[key] = null;
        });
        
        elements.cleanup = null;
        selectionState.current.overlayElements = null;
    }, []);

    // With CSS sticky headers, we don't need complex scroll position constraints
    // The browser handles sticky positioning automatically

    // FORMATTING FUNCTIONS
    const formatDuration = useCallback((duration) => {
        if (!duration) return '';
        
        const match = duration.match(/^(\d+)([DY])$/);
        if (!match) return duration;
        
        const [, number, unit] = match;
        const num = parseInt(number, 10);
        
        if (unit === 'D') {
            return num === 1 ? '' : `${num} Days`;
        } else if (unit === 'Y') {
            return num === 1 ? '1 Year' : `${num} Years`;
        }
        
        return duration;
    }, []);

    const formatArrayField = useCallback((arrayValue) => {
        if (!arrayValue || !Array.isArray(arrayValue)) return '';
        return arrayValue.join(', ');
    }, []);

    const preserveExpandedStates = useCallback(() => {
        if (!eventDisplayRef.current) return new Map();
        
        const stateMap = new Map();
        const existingEvents = eventDisplayRef.current.querySelectorAll('[data-event-id]');
        
        existingEvents.forEach(element => {
            const eventId = element.getAttribute('data-event-id');
            const triangle = element.querySelector('.event-triangle');
            const isExpanded = triangle?.classList.contains('expanded') || false;
            stateMap.set(eventId, isExpanded);
        });
        
        return stateMap;
    }, []);

    // CORE FUNCTIONS (in dependency order)
    const findTopVisibleYear = useCallback(() => {
        if (!eventDisplayRef.current || !stateRef.current.groupedEvents.length) return null;

        const container = eventDisplayRef.current;
        const { scrollTop, scrollHeight, clientHeight } = container;
        const maxScroll = scrollHeight - clientHeight;
        const atBottom = maxScroll > 0 && scrollTop >= maxScroll - 5;

        if (atBottom) {
            return stateRef.current.groupedEvents[stateRef.current.groupedEvents.length - 1].year;
        }

        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top;
        
        const yearHeaders = container.querySelectorAll('.event-year-header');
        let activeGroupIndex = 0;
        
        for (let i = 0; i < yearHeaders.length; i++) {
            const header = yearHeaders[i];
            const headerRect = header.getBoundingClientRect();
            const headerTop = headerRect.top;
            
            if (headerTop <= containerTop + 20) {
                activeGroupIndex = i;
            } else {
                break;
            }
        }

        return stateRef.current.groupedEvents[activeGroupIndex]?.year || null;
    }, []);

    const findBottomVisibleYear = useCallback(() => {
        if (!eventDisplayRef.current || !stateRef.current.groupedEvents.length) return null;

        const container = eventDisplayRef.current;
        const containerRect = container.getBoundingClientRect();
        const containerBottom = containerRect.bottom;
        
        const yearHeaders = container.querySelectorAll('.event-year-header');
        let bottomVisibleYear = null;
        
        for (let i = yearHeaders.length - 1; i >= 0; i--) {
            const header = yearHeaders[i];
            const headerRect = header.getBoundingClientRect();
            
            if (headerRect.top <= containerBottom) {
                bottomVisibleYear = stateRef.current.groupedEvents[i]?.year;
                break;
            }
        }
        
        return bottomVisibleYear;
    }, []);

    const updatePositionIndicators = useCallback(() => {
        if (!eventDisplayRef.current || !macroIndicatorRef.current || !microIndicatorRef.current) return;
        if (!selectionState.current.macroScaleInfo || !stateRef.current.events.length || !masterScale.current) return;

        const topVisibleYear = findTopVisibleYear();
        
        if (topVisibleYear !== null) {
            const macroY = selectionState.current.macroScaleInfo.yearToPixel(topVisibleYear);
            const macroContainer = macroContainerRef.current;
            if (macroContainer) {
                const macroDimensions = calculateDimensions(macroContainer);
                macroIndicatorRef.current.style.top = `${Math.max(0, Math.min(macroDimensions.height - 2, macroY - 1))}px`;
            }

            const microContainer = microContainerRef.current;
            if (microContainer && microSvgRef.current) {
                const microDimensions = calculateDimensions(microContainer);
                const [viewStart, viewEnd] = selectionState.current.yearBounds;
                const masterViewStart = masterScale.current.yearToPixel(viewStart);
                const masterViewEnd = masterScale.current.yearToPixel(viewEnd);
                const masterViewHeight = masterViewEnd - masterViewStart;
                const masterYearPos = masterScale.current.yearToPixel(topVisibleYear);
                const microY = ((masterYearPos - masterViewStart) / masterViewHeight) * microDimensions.height;
                
                // Position the indicator line
                microIndicatorRef.current.style.top = `${Math.max(0, Math.min(microDimensions.height - 2, microY - 1))}px`;
                
                // Position the text box vertically centered relative to the indicator line
                if (microIndicatorTextRef.current) {
                    microIndicatorTextRef.current.textContent = formatYear(topVisibleYear);
                    
                    // Calculate position relative to the line indicator instead of recalculating
                    const lineTop = parseFloat(microIndicatorRef.current.style.top) || 0;
                    const textY = lineTop - 10;
                    microIndicatorTextRef.current.style.top = `${textY}px`;
                }
            }
        }
    }, [calculateDimensions, findTopVisibleYear]);

    const throttledIndicatorUpdate = useCallback(
        createThrottledFunction(updatePositionIndicators, UPDATE_THROTTLE_MS),
        [updatePositionIndicators, createThrottledFunction]
    );

    const throttledIndicatorUpdateScroll = useCallback(
        createThrottledFunction(updatePositionIndicators, SCROLL_THROTTLE_MS),
        [updatePositionIndicators, createThrottledFunction]
    );

    const applyConnectedHover = useCallback((eventID) => {
        if (!microSvgRef.current || !eventID) return;

        const svg = d3.select(microSvgRef.current);
        svg.selectAll(`[data-event-id="${eventID}"]`)
            .transition()
            .duration(100)
            .style('opacity', 0.5);
    }, []);

    const removeConnectedHover = useCallback((eventID) => {
        if (!microSvgRef.current || !eventID) return;

        const svg = d3.select(microSvgRef.current);
        svg.selectAll(`[data-event-id="${eventID}"]`)
            .transition()
            .duration(100)
            .style('opacity', 1.0);
    }, []);

    const scrollToYear = useCallback((targetYear) => {
        if (!eventDisplayRef.current || !stateRef.current.events.length) return;

        const container = eventDisplayRef.current;
        const headers = container.querySelectorAll('.event-year-header');
        
        // Find the exact year or the first year greater than or equal to target
        let targetHeader = null;
        let fallbackHeader = null;
        
        headers.forEach((header, index) => {
            const headerText = header.textContent;
            let year;
            if (headerText.includes('BC|AD')) {
                year = 0;
            } else if (headerText.includes('BC')) {
                const match = headerText.match(/(\d+)\s*BC/);
                year = match ? -parseInt(match[1]) : 0;
            } else {
                const match = headerText.match(/(-?\d+)/);
                year = match ? parseInt(match[1]) : 0;
            }
            
            // Exact match takes priority
            if (year === targetYear) {
                targetHeader = header;
            } 
            // If no exact match, find first year >= target
            else if (!targetHeader && year >= targetYear && !fallbackHeader) {
                fallbackHeader = header;
            }
        });
        
        // Use exact match if found, otherwise use fallback
        const headerToUse = targetHeader || fallbackHeader || headers[0];
        
        if (headerToUse) {
            // Always scroll to position the target year at the very top
            // Calculate the header's current position relative to the container
            const containerRect = container.getBoundingClientRect();
            const headerRect = headerToUse.getBoundingClientRect();
            const relativeTop = headerRect.top - containerRect.top + container.scrollTop;
            
            // Force scroll to put header at top, regardless of current visibility
            container.scrollTop = relativeTop;
        }
    }, []);

    const renderMicrochart = useCallback(() => {
        if (!microSvgRef.current || !microContainerRef.current || !processedEvents.length || !masterScale.current) return;

        const layoutDims = calculateLayoutDimensions();
        if (!layoutDims || !layoutDims.showMicrochart) {
            microContainerRef.current.classList.add('hidden');
            return;
        }

        microContainerRef.current.classList.remove('hidden');
        microContainerRef.current.style.width = `${layoutDims.microchartWidth}px`;

        const dimensions = calculateDimensions(microContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;
        
        const dynamicDotDiameter = Math.max(6, Math.min(
            MICROCHART_MAX_DOT_DIAMETER, 
            (dimensions.width / ((2 * MICROCHART_COLUMNS) - 1))
        ));
        const dynamicDotRadius = dynamicDotDiameter / 2;
        const dynamicLineWidth = Math.max(1, dynamicDotDiameter / 3);
        const [viewStart, viewEnd] = selectionState.current.yearBounds;
        const masterViewStart = masterScale.current.yearToPixel(viewStart);
        const masterViewEnd = masterScale.current.yearToPixel(viewEnd);
        const masterViewHeight = masterViewEnd - masterViewStart;
        const allEvents = processedEvents;
        const byEra = {};
        
        allEvents.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color;
            
            if (!byEra[era]) {
                byEra[era] = [];
            }
            
            byEra[era].push(d);
        });

       const processedEventsForDisplay = [];

        Object.keys(byEra).forEach(era => {
            const eraEvents = byEra[era].filter(d => 
                d.fields.startDate >= viewStart && d.fields.startDate <= viewEnd);
            
            eraEvents.forEach(d => {
                const rangeInfo = getRangeInfo(d.fields.startDate);
                const column = getEffectiveColumn(d);
                const effectiveColumn = Math.min(column - 1, MICROCHART_COLUMNS - 1); 
                const columnWidth = dimensions.width / MICROCHART_COLUMNS;
                const x = (effectiveColumn * columnWidth) + (columnWidth / 2);
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

        const lines = [];

        allEvents.forEach(d => {
            const duration = parseDuration(d.fields.duration);
            if (duration >= 1) {
                const lineStart = parseFloat(d.fields.startDate);
                const lineEnd = lineStart + duration;
                const intersects = (
                    (lineStart >= viewStart && lineStart <= viewEnd) ||
                    (lineEnd >= viewStart && lineEnd <= viewEnd) ||
                    (lineStart <= viewStart && lineEnd >= viewEnd)
                );

                if (intersects) {
                    const rangeInfo = getRangeInfo(d.fields.startDate);
                    const column = getEffectiveColumn(d);
                    const effectiveColumn = Math.min(column - 1, MICROCHART_COLUMNS - 1); 
                    const columnWidth = dimensions.width / MICROCHART_COLUMNS;
                    const x = (effectiveColumn * columnWidth) + (columnWidth / 2);
                    const masterStartY = masterScale.current.yearToPixel(lineStart);
                    const masterEndY = masterScale.current.yearToPixel(lineEnd);
                    const startY = ((masterStartY - masterViewStart) / masterViewHeight) * dimensions.height;
                    const endY = ((masterEndY - masterViewStart) / masterViewHeight) * dimensions.height;
                    const y1 = Math.max(0, Math.min(dimensions.height, startY));
                    const y2 = Math.max(0, Math.min(dimensions.height, endY));
                    
                    lines.push({
                        x1: x,
                        y1: y1,
                        x2: x,
                        y2: y2,
                        color: rangeInfo.color,
                        eventData: d.fields,
                        eventID: d.fields.eventID
                    });
                }
            }
        });

        const oldTooltip = microContainerRef.current.querySelector('.microchart-tooltip');
        if (oldTooltip) {
            oldTooltip.remove();
        }

        const svg = d3.select(microSvgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        svg.selectAll('*').remove();
        const g = svg.append('g')
            .attr('class', 'microchart-group')
            .attr('transform', `translate(0,0)`);

        const lineGroups = g.selectAll('.microchart-line-group')
            .data(lines)
            .enter()
            .append('g')
            .attr('class', 'microchart-line-group');

        lineGroups
            .append('line')
            .attr('class', 'microchart-line-main')
            .attr('data-event-id', d => d.eventID)
            .attr('x1', d => d.x1)
            .attr('y1', d => d.y1)
            .attr('x2', d => d.x2)
            .attr('y2', d => d.y2)
            .attr('stroke', d => d.color)
            .style('stroke-width', `${dynamicLineWidth}px`)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                tooltip.html(d.eventData?.title || '')
                    .style('left', (event.layerX - TOOLTIP_OFFSET_X) + 'px')
                    .style('top', (event.layerY - TOOLTIP_OFFSET_Y) + 'px');

                applyConnectedHover(d.eventID);
            })
            .on('mouseout', function(event, d) {
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);

                removeConnectedHover(d.eventID);
            })
            .on('click', function(event, d) {
                event.preventDefault();
                event.stopPropagation();
                
                // Create a safe wrapper function
                const safeScrollToEvent = () => {
                    try {
                        scrollToEvent(d.eventID, d);
                    } catch (error) {
                        console.error('Error scrolling to event:', error);
                    }
                };
                
                // Use both setTimeout and requestAnimationFrame for maximum compatibility
                window.requestAnimationFrame(() => {
                    window.setTimeout(safeScrollToEvent, 0);
                });
            });

        let tooltip = d3.select(microContainerRef.current).select('.microchart-tooltip');
        if (tooltip.empty()) {
            tooltip = d3.select(microContainerRef.current)
                .append('div')
                .attr('class', 'microchart-tooltip')
                .style('opacity', 0);
        }

        g.selectAll('.microchart-dot')
            .data(processedEventsForDisplay)
            .enter()
            .append('circle')
            .attr('class', 'microchart-dot')
            .attr('data-event-id', d => d.eventID)
            .attr('cx', d => d.columnX)
            .attr('cy', d => d.y)
            .attr('r', dynamicDotRadius) 
            .attr('fill', d => d.color)
            .style('stroke-width', `${Math.max(1, dynamicDotDiameter / 5)}px`)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                tooltip.html(d.title)
                    .style('left', (event.layerX - TOOLTIP_OFFSET_X) + 'px')
                    .style('top', (event.layerY - TOOLTIP_OFFSET_Y) + 'px');

                applyConnectedHover(d.eventID);
            })
            .on('mouseout', function(event, d) {
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);
                removeConnectedHover(d.eventID);
            })
            .on('click', function(event, d) {
                event.preventDefault();
                event.stopPropagation();
                
                // Create a safe wrapper function
                const safeScrollToEvent = () => {
                    try {
                        scrollToEvent(d.eventID, d);
                    } catch (error) {
                        console.error('Error scrolling to event:', error);
                    }
                };
                
                // Use both setTimeout and requestAnimationFrame for maximum compatibility
                window.requestAnimationFrame(() => {
                    window.setTimeout(safeScrollToEvent, 0);
                });
            });

        if (!microIndicatorTextRef.current && microContainerRef.current) {
            const textElement = document.createElement('div');
            textElement.className = 'microchart-indicator-text';
            microContainerRef.current.appendChild(textElement);
            microIndicatorTextRef.current = textElement;
        }
        throttledIndicatorUpdate();
    }, [calculateLayoutDimensions, calculateDimensions, processedEvents, throttledIndicatorUpdate, applyConnectedHover, removeConnectedHover]);

    const handleDynamicSelectionUpdate = useCallback(() => {
        if (!selectionState.current.macroScaleInfo) return;
        if (!eventDisplayRef.current) return;
        
        const topVisibleYear = findTopVisibleYear();
        const bottomVisibleYear = findBottomVisibleYear();
        const [currentStart, currentEnd] = selectionState.current.yearBounds;
        
        if (topVisibleYear === null || bottomVisibleYear === null) return;
        
        // Track scroll direction with confidence building
        const currentScrollTop = eventDisplayRef.current.scrollTop;
        const scrollDelta = currentScrollTop - scrollDirectionRef.current.lastScrollTop;
        const currentTime = Date.now();
        
        // Determine scroll direction with minimum threshold and debouncing
        if (Math.abs(scrollDelta) > 3 && currentTime - scrollDirectionRef.current.lastUpdateTime > 50) {
            const newDirection = scrollDelta > 0 ? 'down' : 'up';
            
            if (scrollDirectionRef.current.direction === newDirection) {
                scrollDirectionRef.current.directionConfidenceCounter++;
            } else {
                scrollDirectionRef.current.direction = newDirection;
                scrollDirectionRef.current.directionConfidenceCounter = 1;
            }
            
            scrollDirectionRef.current.lastUpdateTime = currentTime;
        }
        
        scrollDirectionRef.current.lastScrollTop = currentScrollTop;
        
        // Only proceed if we have confident direction
        if (scrollDirectionRef.current.directionConfidenceCounter < 2) return;
        
        const direction = scrollDirectionRef.current.direction;
        const { yearToPixel, pixelToYear } = selectionState.current.macroScaleInfo;
        
        // Calculate current pixel height to preserve it
        const currentPixelHeight = yearToPixel(currentEnd) - yearToPixel(currentStart);
        
        let newStart = currentStart;
        let newEnd = currentEnd;
        let needsUpdate = false;
        
        // Direction-specific logic - only move in the scroll direction
        if (direction === 'down' && bottomVisibleYear > currentEnd) {
            // Scrolling down: move selection down to include bottom visible year
            newEnd = bottomVisibleYear;
            const newEndPixel = yearToPixel(newEnd);
            const newStartPixel = newEndPixel - currentPixelHeight;
            newStart = pixelToYear(newStartPixel);
            needsUpdate = true;
            
        } else if (direction === 'up' && topVisibleYear < currentStart) {
            // Scrolling up: move selection up to include top visible year
            newStart = topVisibleYear;
            const newStartPixel = yearToPixel(newStart);
            const newEndPixel = newStartPixel + currentPixelHeight;
            newEnd = pixelToYear(newEndPixel);
            needsUpdate = true;
        }
        
        if (!needsUpdate) return;
        
        // Update internal state
        selectionState.current.yearBounds = [newStart, newEnd];
        
        // Update macro overlay position directly
        if (selectionState.current.overlayElements && selectionState.current.overlayElements.updateOverlayPosition) {
            const y0 = yearToPixel(newStart);
            const y1 = yearToPixel(newEnd);
            selectionState.current.pixelBounds = [y0, y1];
            // Update overlay visual position without triggering selection change
            const elements = overlayElementsRef.current;
            if (elements.overlay && selectionState.current.macroScaleInfo) {
                const { pixelToYear } = selectionState.current.macroScaleInfo;
                const height = y1 - y0;
                const handleWidth = selectionState.current.macroScaleInfo.dimensions.width * HANDLE_WIDTH_RATIO;
                const handleLeft = (selectionState.current.macroScaleInfo.dimensions.width - handleWidth) / 2;
                
                elements.overlay.style.top = y0 + 'px';
                elements.overlay.style.height = height + 'px';
                elements.topHandle.style.top = (y0 - HANDLE_HEIGHT / 2) + 'px';
                elements.bottomHandle.style.top = (y1 - HANDLE_HEIGHT / 2) + 'px';
                elements.topHandleText.style.top = (y0 - HANDLE_HEIGHT / 2) + 'px';
                elements.topHandleText.textContent = formatYear(Math.round(pixelToYear(y0)));
                elements.bottomHandleText.style.top = (y1 - HANDLE_HEIGHT / 2) + 'px';
                elements.bottomHandleText.textContent = formatYear(Math.round(pixelToYear(y1)));
            }
        }

        // Use auto selection change to update state without triggering scroll
        handleAutoSelectionChange(newStart, newEnd);
        
    }, [findTopVisibleYear, findBottomVisibleYear, renderMicrochart]);

    const throttledDynamicSelectionUpdate = useCallback(
        createThrottledFunction(handleDynamicSelectionUpdate, SCROLL_THROTTLE_MS),
        [handleDynamicSelectionUpdate, createThrottledFunction]
    );

    const handleEventScroll = useCallback(() => {
        if (!eventDisplayRef.current || !stateRef.current.groupedEvents.length) return;

        // With CSS sticky headers, no scroll constraints needed
        // The browser handles sticky positioning automatically
        
        throttledIndicatorUpdateScroll();
        throttledDynamicSelectionUpdate();
    }, [throttledIndicatorUpdateScroll, throttledDynamicSelectionUpdate]);

    const scrollToEvent = useCallback(async (eventID, eventData) => {
        if (!eventDisplayRef.current || !eventID) return;

        const container = eventDisplayRef.current;
        const eventElement = container.querySelector(`[data-event-id="${eventID}"]`);
        if (!eventElement) return;

        const triangle = eventElement.querySelector('.event-triangle');
        const eventDetails = eventElement.querySelector('.event-details');
        const isAlreadyExpanded = triangle?.classList.contains('expanded') || false;

        // Handle expansion if needed
        if (triangle && eventDetails && !isAlreadyExpanded) {
            triangle.classList.add('expanded');
            eventDetails.classList.remove('collapsed');
            eventDetails.classList.add('expanded');
            
            // Wait for expansion animation to complete
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Ensure all DOM updates are complete
        await new Promise(resolve => window.requestAnimationFrame(resolve));
        await new Promise(resolve => window.requestAnimationFrame(resolve));

        // Calculate and perform scroll with dynamic header height
        const containerRect = container.getBoundingClientRect();
        const elementRect = eventElement.getBoundingClientRect();
        
        if (containerRect.height > 0 && elementRect.height > 0) {
            // Get actual sticky header height instead of hardcoded 50px
            const getStickyHeaderHeight = () => {
                const stickyHeader = container.querySelector('.event-year-header');
                return stickyHeader ? stickyHeader.getBoundingClientRect().height : 50; // fallback to 50px
            };
            
            const currentElementTop = elementRect.top - containerRect.top + container.scrollTop;
            const headerHeight = getStickyHeaderHeight();
            const targetScrollTop = Math.max(0, currentElementTop - headerHeight);
            
            container.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
        }
    }, []);

    const throttledScrollHandler = useCallback(
        createThrottledFunction(handleEventScroll, UPDATE_THROTTLE_MS),
        [handleEventScroll, createThrottledFunction]
    );

    const updateLayout = useCallback(() => {
        const layoutDims = calculateLayoutDimensions();
        if (!layoutDims) return;

        if (microContainerRef.current) {
            if (layoutDims.showMicrochart) {
                microContainerRef.current.classList.remove('hidden');
                microContainerRef.current.style.width = `${layoutDims.microchartWidth}px`;
            } else {
                microContainerRef.current.classList.add('hidden');
            }
        }

        if (eventDisplayRef.current) {
            eventDisplayRef.current.style.width = `${layoutDims.contentWidth}px`;
        }

        if (layoutDims.showMicrochart) {
            renderMicrochart();
        }
    }, [calculateLayoutDimensions, renderMicrochart]);

    const handleUserSelectionChange = useCallback((startYear, endYear) => {
        selectionState.current.yearBounds = [startYear, endYear];
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

        renderMicrochart();
        scrollToYear(startYear); // This triggers navigation for user actions
    }, [renderMicrochart, scrollToYear]);

    const handleAutoSelectionChange = useCallback((startYear, endYear) => {
        selectionState.current.yearBounds = [startYear, endYear];
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

        renderMicrochart();
        // NO scrollToYear call here - prevents circular updates
    }, [renderMicrochart]);

    const throttledSelectionChange = useCallback(
        createThrottledFunction(handleUserSelectionChange, UPDATE_THROTTLE_MS),
        [handleUserSelectionChange, createThrottledFunction]
    );

    const setupMacroOverlay = useCallback((dimensions) => {
        const container = macroContainerRef.current;
        if (!container) return () => {};

        cleanupOverlayElements();

        const handleWidth = dimensions.width * HANDLE_WIDTH_RATIO;
        const handleLeft = (dimensions.width - handleWidth) / 2;
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

        overlayElementsRef.current = {
            overlay,
            topHandle,
            bottomHandle,
            topHandleText,
            bottomHandleText,
            cleanup: null
        };

        const updateOverlayPosition = (y0, y1) => {
            if (!selectionState.current.macroScaleInfo) return;

            const height = y1 - y0;
            if (height < MIN_SELECTION_HEIGHT) return;

            const elements = overlayElementsRef.current;
            if (!elements.overlay) return;

            overlay.style.left = '0px';
            overlay.style.top = y0 + 'px';
            overlay.style.width = dimensions.width + 'px';
            overlay.style.height = height + 'px';

            topHandle.style.left = handleLeft + 'px';
            topHandle.style.top = (y0 - HANDLE_HEIGHT / 2) + 'px';
            topHandle.style.width = handleWidth + 'px';
            topHandle.style.height = HANDLE_HEIGHT + 'px';

            bottomHandle.style.left = handleLeft + 'px';
            bottomHandle.style.top = (y1 - HANDLE_HEIGHT / 2) + 'px';
            bottomHandle.style.width = handleWidth + 'px';
            bottomHandle.style.height = HANDLE_HEIGHT + 'px';

            const { pixelToYear } = selectionState.current.macroScaleInfo;
            const commonTextStyle = `line-height: ${HANDLE_HEIGHT}px; width: ${handleWidth}px; left: ${handleLeft}px;`;

            topHandleText.style.cssText += commonTextStyle + `top: ${y0 - HANDLE_HEIGHT / 2}px;`;
            topHandleText.textContent = formatYear(Math.round(pixelToYear(y0)));

            bottomHandleText.style.cssText += commonTextStyle + `top: ${y1 - HANDLE_HEIGHT / 2}px;`;
            bottomHandleText.textContent = formatYear(Math.round(pixelToYear(y1)));

            selectionState.current.pixelBounds = [y0, y1];
            const startYear = pixelToYear(y0);
            const endYear = pixelToYear(y1);
            throttledSelectionChange(startYear, endYear);
        };

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

        const dragHandler = createDragHandler('drag');
        const resizeTopHandler = createDragHandler('resize-top');
        const resizeBottomHandler = createDragHandler('resize-bottom');

        overlay.addEventListener('mousedown', dragHandler);
        topHandle.addEventListener('mousedown', resizeTopHandler);
        bottomHandle.addEventListener('mousedown', resizeBottomHandler);

        selectionState.current.overlayElements = { updateOverlayPosition };
        const initialY0 = selectionState.current.macroScaleInfo.yearToPixel(FULL_RANGE[0]);
        const initialY1 = selectionState.current.macroScaleInfo.yearToPixel(FULL_RANGE[1]);
        updateOverlayPosition(initialY0, initialY1);

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

    const setupWheelScrolling = useCallback(() => {
        if (!macroContainerRef.current || !microContainerRef.current) return () => {};

        const macroWheelHandler = (event) => {
            // Only handle if we have a valid overlay and not currently dragging
            if (!selectionState.current.macroScaleInfo || 
                !overlayElementsRef.current.overlay || 
                selectionState.current.isDragging) {
                return;
            }

            event.preventDefault();
            
            const { dimensions } = selectionState.current.macroScaleInfo;
            const [currentY0, currentY1] = selectionState.current.pixelBounds;
            const currentHeight = currentY1 - currentY0;

            // Check if selection is already full range (nowhere to move)
            if (currentY0 <= 0 && currentY1 >= dimensions.height) {
                return;
            }
            
            // Calculate movement (adjust sensitivity as needed)
            const movement = event.deltaY * CHART_WHEEL_SENSITIVITY;
            let newY0 = currentY0 + movement;
            let newY1 = currentY1 + movement;
            
            // Constrain to bounds
            if (newY0 < 0) {
                newY0 = 0;
                newY1 = currentHeight;
            }
            if (newY1 > dimensions.height) {
                newY1 = dimensions.height;
                newY0 = dimensions.height - currentHeight;
            }
            
            // Update overlay position
            if (selectionState.current.overlayElements && selectionState.current.overlayElements.updateOverlayPosition) {
                selectionState.current.overlayElements.updateOverlayPosition(newY0, newY1);
            }
        };

        const microWheelHandler = (event) => {
            // Only handle if we have valid scales and not currently dragging
            if (!selectionState.current.macroScaleInfo || 
                !masterScale.current ||
                !overlayElementsRef.current.overlay || 
                selectionState.current.isDragging) {
                return;
            }

            event.preventDefault();
            
            const { dimensions } = selectionState.current.macroScaleInfo;
            const [currentY0, currentY1] = selectionState.current.pixelBounds;
            const currentHeight = currentY1 - currentY0;
            
            // Check if selection is already full range
            if (currentY0 <= 0 && currentY1 >= dimensions.height) {
                return;
            }
            
            // For microchart, we need to convert the wheel movement to macrochart coordinates
            // The microchart represents the currently selected range
            const microDimensions = calculateDimensions(microContainerRef.current);
            if (microDimensions.height === 0) return;
            
            // Calculate movement relative to the microchart height
            const microMovement = event.deltaY * CHART_WHEEL_SENSITIVITY;
            // Convert to macrochart movement (proportional to current selection size)
            const macroMovement = (microMovement / microDimensions.height) * currentHeight;
            
            let newY0 = currentY0 + macroMovement;
            let newY1 = currentY1 + macroMovement;
            
            // Constrain to bounds
            if (newY0 < 0) {
                newY0 = 0;
                newY1 = currentHeight;
            }
            if (newY1 > dimensions.height) {
                newY1 = dimensions.height;
                newY0 = dimensions.height - currentHeight;
            }
            
            // Update overlay position
            if (selectionState.current.overlayElements && selectionState.current.overlayElements.updateOverlayPosition) {
                selectionState.current.overlayElements.updateOverlayPosition(newY0, newY1);
            }
        };

        // Add event listeners
        macroContainerRef.current.addEventListener('wheel', macroWheelHandler, { passive: false });
        microContainerRef.current.addEventListener('wheel', microWheelHandler, { passive: false });

        // Return cleanup function
        return () => {
            if (macroContainerRef.current) {
                macroContainerRef.current.removeEventListener('wheel', macroWheelHandler);
            }
            if (microContainerRef.current) {
                microContainerRef.current.removeEventListener('wheel', microWheelHandler);
            }
        };
    }, [calculateDimensions]);

    const renderMacrochart = useCallback(() => {
        if (!macroSvgRef.current || !macroContainerRef.current) return;

        cleanupOverlayElements();

        const dimensions = calculateDimensions(macroContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;

        const layout = calculateMacroLayout(dimensions);
        const converters = createMacroConverters(dimensions, layout);
        selectionState.current.macroScaleInfo = converters;

        const svg = d3.select(macroSvgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        svg.selectAll('*').remove();
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

        setupMacroOverlay(dimensions);
        throttledIndicatorUpdate();

    }, [calculateDimensions, calculateMacroLayout, createMacroConverters, setupMacroOverlay, cleanupOverlayElements, throttledIndicatorUpdate]);

    const createEventItem = useCallback((event, expandedStatesMap) => {
        const eventItem = document.createElement('div');
        eventItem.className = 'event-item';
        eventItem.setAttribute('data-event-id', event.fields.eventID);

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

        const eventDetails = document.createElement('div');
        eventDetails.className = 'event-details';

        const detailFields = [
            { key: 'duration', label: 'Duration', formatter: formatDuration },
            { key: 'participants', label: 'Participants', formatter: formatArrayField },
            { key: 'groups', label: 'Groups', formatter: formatArrayField },
            { key: 'locations', label: 'Locations', formatter: formatArrayField },
            { key: 'verses', label: 'Verses', formatter: formatArrayField },
            { key: 'partOf', label: 'Part Of' },
            { key: 'notes', label: 'Notes' }
        ];

        detailFields.forEach(field => {
            if (event.fields[field.key]) {
                let formattedValue = field.formatter
                    ? field.formatter(event.fields[field.key])
                    : event.fields[field.key];

                if (field.key === 'duration' && formattedValue === '') return;

                const detail = document.createElement('div');
                detail.className = 'event-detail';
                detail.innerHTML = `<strong>${field.label}:</strong> ${formattedValue}`;
                eventDetails.appendChild(detail);
            }
        });

        // Updated children logic using eventsPartOf
        if (event.fields.eventsPartOf && Array.isArray(event.fields.eventsPartOf) && event.fields.eventsPartOf.length > 0) {
            const detail = document.createElement('div');
            detail.className = 'event-detail';
            detail.innerHTML = `<strong>Events Part of This:</strong> ${event.fields.eventsPartOf.join(', ')}`;
            eventDetails.appendChild(detail);
        }

        // Rest of the function remains the same...
        const isCurrentlyExpanded = expandedStatesMap.get(event.fields.eventID) || false;

        if (isCurrentlyExpanded) {
            triangle.classList.add('expanded');
            triangle.setAttribute('aria-label', 'Collapse event details');
            eventDetails.classList.add('expanded');
        } else {
            triangle.setAttribute('aria-label', 'Expand event details');
            eventDetails.classList.add('collapsed');
        }

        eventContent.appendChild(eventDetails);

        triangle.addEventListener('click', () => {
            const container = eventDisplayRef.current;
            const eventRect = eventItem.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const originalViewportPosition = eventRect.top - containerRect.top;
            
            const isCurrentlyExpanded = triangle.classList.contains('expanded');
            
            if (isCurrentlyExpanded) {
                triangle.classList.remove('expanded');
                triangle.setAttribute('aria-label', 'Expand event details');
                eventDetails.classList.remove('expanded');
                eventDetails.classList.add('collapsed');
            } else {
                triangle.classList.add('expanded');
                triangle.setAttribute('aria-label', 'Collapse event details');
                eventDetails.classList.remove('collapsed');
                eventDetails.classList.add('expanded');
            }
            
            setTimeout(() => {
                const newEventRect = eventItem.getBoundingClientRect();
                const newContainerRect = container.getBoundingClientRect();
                const newViewportPosition = newEventRect.top - newContainerRect.top;
                
                const drift = newViewportPosition - originalViewportPosition;
                container.scrollTop += drift;
            }, 300);
        });

        eventItem.appendChild(triangle);
        eventItem.appendChild(eventContent);
        return eventItem;
    }, [formatDuration, formatArrayField]);

    const updateEventDisplay = useCallback(() => {
        if (!eventDisplayRef.current || !stateRef.current.events.length) return;

        // Batch preserve states before rebuilding
        const expandedStatesMap = preserveExpandedStates();

        // Remove filtering - show all events
        const filteredEvents = stateRef.current.events;
        const groupedEvents = groupEventsByYear(filteredEvents);
        stateRef.current.groupedEvents = groupedEvents;

        const container = eventDisplayRef.current;
        const fragment = document.createDocumentFragment();
        
        // No floating header creation - using CSS sticky headers instead

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
                    // Pass the batched state map to avoid individual queries
                    fragment.appendChild(createEventItem(event, expandedStatesMap));
                });
            });
        }

        container.innerHTML = '';
        container.appendChild(fragment);
    }, [preserveExpandedStates, groupEventsByYear, createEventItem]);

    const handlePeriodChange = useCallback((event) => {
        const period = event.target.value;
        
        setSelectedPeriod(period);
        setIsCustomRange(false);
        
        const newRange = TIME_PERIODS[period];
        
        stateRef.current.selection = newRange;
        
        selectionState.current.yearBounds = newRange;
        
        // No need to call updateEventDisplay since we're not filtering anymore
        renderMicrochart();

        if (selectionState.current.macroScaleInfo && selectionState.current.overlayElements) {
            const { yearToPixel } = selectionState.current.macroScaleInfo;
            const y0 = yearToPixel(newRange[0]);
            const y1 = yearToPixel(newRange[1]);
            selectionState.current.pixelBounds = [y0, y1];
            selectionState.current.overlayElements.updateOverlayPosition(y0, y1);
        }

        if (period !== 'all' && newRange) {
            scrollToYear(newRange[0]);
        }
    }, [renderMicrochart, scrollToYear]);

    const setupChart = useCallback((containerRef, svgRef, renderFunction, chartName) => {
        if (!containerRef.current) return null;

        if (!svgRef.current) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            containerRef.current.appendChild(svg);
            svgRef.current = svg;
        }

        renderFunction();

        const resizeObserver = new ResizeObserver(() => {
            window.requestAnimationFrame(() => {
                if (containerRef.current) {
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

    // INITIALIZATION
    useEffect(() => {
        const eventsWithColumns = calculateColumns(eventsFullData);
        setProcessedEvents(eventsWithColumns);
        masterScale.current = calculateMasterTimelineScale();
        stateRef.current.events = eventsWithColumns;
        stateRef.current.groupedEvents = groupEventsByYear(eventsWithColumns);
    }, [calculateMasterTimelineScale, groupEventsByYear]);

    // MAIN CHART SETUP AND CLEANUP
    useEffect(() => {
        if (!processedEvents.length || !masterScale.current) return;

        const macroObserver = setupChart(macroContainerRef, macroSvgRef, renderMacrochart, 'macro');
        const microObserver = setupChart(microContainerRef, microSvgRef, renderMicrochart, 'micro');

        const wheelCleanup = setupWheelScrolling();

        return () => {
            if (macroObserver) macroObserver.disconnect();
            if (microObserver) microObserver.disconnect();

            if (wheelCleanup) wheelCleanup();

            if (throttledSelectionChange?.cancel) {
                throttledSelectionChange.cancel();
            }
            
            if (throttledIndicatorUpdate?.cancel) {
                throttledIndicatorUpdate.cancel();
            }
            
            if (throttledScrollHandler?.cancel) {
                throttledScrollHandler.cancel();
            }

            if (throttledDynamicSelectionUpdate?.cancel) {
                throttledDynamicSelectionUpdate.cancel();
            }
            
            if (microIndicatorTextRef.current && microIndicatorTextRef.current.parentNode) {
                microIndicatorTextRef.current.parentNode.removeChild(microIndicatorTextRef.current);
                microIndicatorTextRef.current = null;
            }

            cleanupOverlayElements();
            eventListenersRef.current.forEach(cleanup => cleanup());
            eventListenersRef.current.clear();
        };
    }, [setupChart, renderMacrochart, renderMicrochart, processedEvents, throttledSelectionChange, throttledIndicatorUpdate, throttledScrollHandler, throttledDynamicSelectionUpdate, cleanupOverlayElements]);
        
    // EVENT DISPLAY SCROLL LISTENERS
    useEffect(() => {
        if (!eventDisplayRef.current) return;

        const container = eventDisplayRef.current;

        // Simplified scroll listener
        container.addEventListener('scroll', handleEventScroll);

        return () => {
            container.removeEventListener('scroll', handleEventScroll);
        };
    }, [handleEventScroll]);

    // EVENT DISPLAY UPDATE
    useEffect(() => {
        updateEventDisplay();
    }, [updateEventDisplay]);

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