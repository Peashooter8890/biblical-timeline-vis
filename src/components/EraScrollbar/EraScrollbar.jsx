import React, { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { TIME_RANGES } from '../../utils/constants.js';
import './eraScrollbar.css';

// year labels
const YEAR_LABEL_INTERVAL = 500;
const YEAR_LABEL_RANGE_START = -4000;
const YEAR_LABEL_RANGE_END = 0;
const LABEL_MARGIN = 15; // distance between year label and line
const LABEL_LINE_LENGTH = 10;

const COLOR_BAR_WIDTH_RATIO = 1/6;

// selection overlay
const MIN_SELECTION_HEIGHT = 5;
const HANDLE_HEIGHT = 8;
const HANDLE_OFFSET = 4;
const RESIZE_ZONE_RATIO = 0.025; // add a small resize zone at the top and bottom of the selection overlay for better UX

const EraScrollbar = ({ onBrush, onIndicatorChange, scrollInfo, onScroll, externalSelection }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const scaleInfoRef = useRef(null);
    const brushBoundsRef = useRef([0, 0]);
    const brushRef = useRef(null);
    const brushGroupRef = useRef(null); // renamed from brushGRef
    const overlayElementsRef = useRef(null);
    const isExternalUpdateRef = useRef(false);
    const isUserInteractingRef = useRef(false);
    const resizeObserverRef = useRef(null);

    const calculateContainerDimensions = useCallback((container) => {
        const rect = container.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }, []);

    // Map each era in TIME_RANGES to pixel positions and heights based on the container dimension
    const calculateTimeRangeLayout = useCallback((dimensions) => {
        const totalTimeSpan = TIME_RANGES.reduce((sum, range) => 
            sum + Math.abs(range.end - range.start), 0);
        
        const eraHeights = TIME_RANGES.map(range => {
            const span = Math.abs(range.end - range.start);
            return (span / totalTimeSpan) * dimensions.height;
        });

        const eraPositions = [];
        let currentY = 0;
        for (const height of eraHeights) {
            eraPositions.push(currentY);
            currentY += height;
        }

        return { eraHeights, eraPositions };
    }, []);

    const createYearPixelConversionFunctions = useCallback((dimensions, timeRangeLayout) => { // renamed from createScaleFunctions
        const { eraHeights, eraPositions } = timeRangeLayout;

        const convertYearToPixel = (year) => { // renamed from yearToPixel
            const eraIndex = TIME_RANGES.findIndex(range => 
                year >= range.start && year <= range.end);
            
            if (eraIndex === -1) {
                if (year < TIME_RANGES[0].start) return eraPositions[0];
                if (year > TIME_RANGES[TIME_RANGES.length - 1].end) return dimensions.height;
                return 0;
            }
            
            const timeRange = TIME_RANGES[eraIndex]; // renamed from range
            const eraTimeSpan = timeRange.end - timeRange.start; // renamed from rangeSpan
            const yearPositionInEra = (year - timeRange.start) / eraTimeSpan; // renamed from positionInRange
            
            return eraPositions[eraIndex] + (yearPositionInEra * eraHeights[eraIndex]);
        };

        const convertPixelToYear = (pixelY) => { // renamed from pixelToYear, parameter renamed from pixel
            let eraIndex = TIME_RANGES.length - 1; // renamed from rangeIndex
            for (let i = 0; i < eraPositions.length - 1; i++) {
                if (pixelY < eraPositions[i + 1]) {
                    eraIndex = i;
                    break;
                }
            }

            const timeRange = TIME_RANGES[eraIndex]; // renamed from range
            const eraStartPixel = eraPositions[eraIndex]; // renamed from rangeStartPixel
            const eraPixelHeight = eraHeights[eraIndex]; // renamed from rangeHeight

            if (eraPixelHeight <= 0) return timeRange.start;

            const pixelOffsetInEra = pixelY - eraStartPixel; // renamed from pixelIntoRange
            const pixelProportion = pixelOffsetInEra / eraPixelHeight; // renamed from proportion
            const eraYearSpan = timeRange.end - timeRange.start; // renamed from yearSpan
            return timeRange.start + (pixelProportion * eraYearSpan);
        };

        return { convertYearToPixel, convertPixelToYear };
    }, []);

    const generateYearLabelIntervals = useCallback(() => {
        const yearIntervals = [];
        for (let year = YEAR_LABEL_RANGE_START; year <= YEAR_LABEL_RANGE_END; year += YEAR_LABEL_INTERVAL) {
            yearIntervals.push(year);
        }
        if (!yearIntervals.includes(YEAR_LABEL_RANGE_END)) {
            yearIntervals.push(YEAR_LABEL_RANGE_END);
        }
        return yearIntervals;
    }, []);

    const createEraColorBars = useCallback((svg, dimensions, timeRangeLayout) => { // renamed from createColorBars
        const { eraHeights, eraPositions } = timeRangeLayout;
        const colorBarWidth = dimensions.width * COLOR_BAR_WIDTH_RATIO;
        const colorBarXPosition = dimensions.width - colorBarWidth; // renamed from colorBarX
        
        svg.selectAll('.era-rect')
            .data(TIME_RANGES)
            .enter()
            .append('rect')
            .attr('class', 'era-rect')
            .attr('x', colorBarXPosition)
            .attr('y', (d, i) => eraPositions[i])
            .attr('width', colorBarWidth)
            .attr('height', (d, i) => eraHeights[i])
            .attr('fill', d => d.color);

        return { colorBarWidth, colorBarXPosition };
    }, []);

    const createYearMarkerLabels = useCallback((svg, dimensions, conversionFunctions, colorBarLayout) => { // renamed from createYearMarkers
        const { convertYearToPixel } = conversionFunctions;
        const { colorBarXPosition } = colorBarLayout;
        const markerLineStartX = colorBarXPosition - LABEL_LINE_LENGTH; // renamed from lineStartX
        const yearIntervals = generateYearLabelIntervals();

        svg.selectAll('.year-line')
            .data(yearIntervals)
            .enter()
            .append('line')
            .attr('class', 'year-line')
            .attr('x1', markerLineStartX)
            .attr('y1', convertYearToPixel)
            .attr('x2', colorBarXPosition)
            .attr('y2', convertYearToPixel)
            .attr('stroke', '#999')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '2,2');

        svg.selectAll('.year-label')
            .data(yearIntervals)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', colorBarXPosition - LABEL_MARGIN)
            .attr('y', d => convertYearToPixel(d) + 5)
            .text(d => d === 0 ? 'BC|AD' : `${Math.abs(d)} BC`)
            .attr('font-size', '14px')
            .attr('fill', '#333')
            .attr('text-anchor', 'end');
    }, [generateYearLabelIntervals]);

    const createBrushSelectionBehavior = useCallback((dimensions, conversionFunctions) => { // renamed from createBrushBehavior
        const { convertPixelToYear } = conversionFunctions;

        return d3.brushY()
            .extent([[0, 0], [dimensions.width, dimensions.height]])
            .on('brush end', (event) => {
                if (event.selection && !isExternalUpdateRef.current) {
                    const [selectionTopY, selectionBottomY] = event.selection; // renamed from y0, y1
                    brushBoundsRef.current = [selectionTopY, selectionBottomY];
                    
                    const startYear = convertPixelToYear(selectionTopY);
                    const endYear = convertPixelToYear(selectionBottomY);
                    onBrush([startYear, endYear]);
                }
            })
            .on('brush', (event) => {
                if (event.selection) {
                    const [selectionTopY, selectionBottomY] = event.selection; // renamed from y0, y1
                    brushBoundsRef.current = [selectionTopY, selectionBottomY];
                }
            });
    }, [onBrush]);

    const updateBrushSelectionPosition = useCallback((brush, brushGroup, topY, bottomY) => { // renamed parameters
        brush.move(brushGroup, [topY, bottomY]);
    }, []);

    const createSelectionDragHandler = useCallback((dimensions, brush, brushGroup, resizeZoneSize) => {
        return function(event) {
            isUserInteractingRef.current = true; // Add this
            const overlayRect = this.getBoundingClientRect();
            const mouseYInOverlay = event.clientY - overlayRect.top; // renamed from mouseY
            
            let interactionMode = 'drag'; // renamed from mode
            if (mouseYInOverlay <= resizeZoneSize) {
                interactionMode = 'resize-top';
                this.style.cursor = 'ns-resize';
            } else if (mouseYInOverlay >= overlayRect.height - resizeZoneSize) {
                interactionMode = 'resize-bottom';
                this.style.cursor = 'ns-resize';
            }
            
            const initialMouseY = event.clientY; // renamed from startMouseY
            const currentBounds = brushBoundsRef.current;
            const [currentTopY, currentBottomY] = currentBounds; // renamed from currentY0, currentY1
            
            const handleMouseMove = (moveEvent) => {
                const mouseDeltaY = moveEvent.clientY - initialMouseY; // renamed from deltaY
                let newTopY = currentTopY; // renamed from newY0
                let newBottomY = currentBottomY; // renamed from newY1
                
                switch (interactionMode) {
                    case 'resize-top':
                        newTopY = Math.max(0, Math.min(currentBottomY - MIN_SELECTION_HEIGHT, currentTopY + mouseDeltaY));
                        break;
                    case 'resize-bottom':
                        newBottomY = Math.min(dimensions.height, Math.max(currentTopY + MIN_SELECTION_HEIGHT, currentBottomY + mouseDeltaY));
                        break;
                    case 'drag':
                        const selectionHeight = currentBottomY - currentTopY;
                        newTopY = Math.max(0, Math.min(dimensions.height - selectionHeight, currentTopY + mouseDeltaY));
                        newBottomY = newTopY + selectionHeight;
                        break;
                }
                
                updateBrushSelectionPosition(brush, brushGroup, newTopY, newBottomY);
            };
            
            const handleMouseUp = () => {
                this.style.cursor = 'move';
                isUserInteractingRef.current = false; // Add this
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            event.preventDefault();
        };
    }, [updateBrushSelectionPosition]);

    const createResizeHandleMouseDown = useCallback((dimensions, brush, brushGroup, isTopHandle) => { // renamed from createHandleMouseDown
        return function(event) {
            const initialMouseY = event.clientY; // renamed from startMouseY
            const currentBounds = brushBoundsRef.current;
            const [currentTopY, currentBottomY] = currentBounds; // renamed from currentY0, currentY1
            
            const handleMouseMove = (moveEvent) => {
                const mouseDeltaY = moveEvent.clientY - initialMouseY; // renamed from deltaY
                
                if (isTopHandle) {
                    const newTopY = Math.max(0, Math.min(currentBottomY - MIN_SELECTION_HEIGHT, currentTopY + mouseDeltaY)); // renamed from newY0
                    updateBrushSelectionPosition(brush, brushGroup, newTopY, currentBottomY);
                } else {
                    const newBottomY = Math.min(dimensions.height, Math.max(currentTopY + MIN_SELECTION_HEIGHT, currentBottomY + mouseDeltaY)); // renamed from newY1
                    updateBrushSelectionPosition(brush, brushGroup, currentTopY, newBottomY);
                }
            };
            
            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            event.preventDefault();
            event.stopPropagation();
        };
    }, [updateBrushSelectionPosition]);

    const createSelectionOverlayElements = useCallback((container, dimensions, brush, brushGroup) => { // renamed from createOverlayElements
        const resizeZoneSize = dimensions.height * RESIZE_ZONE_RATIO;
        const handleWidth = dimensions.width / 3;
        const handleLeftPosition = dimensions.width / 3; // renamed from handleLeft

        // Selection overlay
        const selectionOverlay = d3.select(container) // renamed from overlay
            .select('.selection-overlay')
            .style('position', 'absolute')
            .style('background', 'rgba(119, 119, 119, 0.3)')
            .style('border', '3px solid #000')
            .style('border-radius', '8px')
            .style('pointer-events', 'auto')
            .style('z-index', '20')
            .style('top', '0px')
            .style('left', '0px')
            .style('width', `${dimensions.width}px`)
            .style('height', `${dimensions.height}px`)
            .style('box-sizing', 'border-box')
            .style('cursor', 'move')
            .on('mousedown', createSelectionDragHandler(dimensions, brush, brushGroup, resizeZoneSize))
            .on('mousemove', function(event) {
                if (event.buttons === 0) {
                    const overlayRect = this.getBoundingClientRect();
                    const mouseYInOverlay = event.clientY - overlayRect.top; // renamed from mouseY
                    
                    if (mouseYInOverlay <= resizeZoneSize || mouseYInOverlay >= overlayRect.height - resizeZoneSize) {
                        this.style.cursor = 'ns-resize';
                    } else {
                        this.style.cursor = 'move';
                    }
                }
            });

        // Top handle
        const topResizeHandle = d3.select(container) // renamed from topHandle
            .select('.top-handle')
            .style('position', 'absolute')
            .style('background', '#000')
            .style('pointer-events', 'auto')
            .style('width', `${handleWidth}px`)
            .style('height', `${HANDLE_HEIGHT}px`)
            .style('left', `${handleLeftPosition}px`)
            .style('top', `-${HANDLE_OFFSET}px`)
            .style('cursor', 'ns-resize')
            .on('mousedown', createResizeHandleMouseDown(dimensions, brush, brushGroup, true));

        // Bottom handle
        const bottomResizeHandle = d3.select(container) // renamed from bottomHandle
            .select('.bottom-handle')
            .style('position', 'absolute')
            .style('background', '#000')
            .style('pointer-events', 'auto')
            .style('width', `${handleWidth}px`)
            .style('height', `${HANDLE_HEIGHT}px`)
            .style('left', `${handleLeftPosition}px`)
            .style('bottom', `-${HANDLE_OFFSET}px`)
            .style('cursor', 'ns-resize')
            .on('mousedown', createResizeHandleMouseDown(dimensions, brush, brushGroup, false));

        return { selectionOverlay, topResizeHandle, bottomResizeHandle };
    }, [createSelectionDragHandler, createResizeHandleMouseDown]);

    const updateSelectionOverlayPositions = useCallback((overlayElements, dimensions, topY, bottomY) => { // renamed from updateOverlayPositions
        const { selectionOverlay, topResizeHandle, bottomResizeHandle } = overlayElements;
        
        selectionOverlay
            .style('top', `${topY}px`)
            .style('height', `${bottomY - topY}px`)
            .style('width', `${dimensions.width}px`);
        
        topResizeHandle.style('top', `${topY - HANDLE_OFFSET}px`);
        bottomResizeHandle.style('top', `${bottomY - HANDLE_OFFSET}px`);
    }, []);

    const renderScrollbar = useCallback(() => {
        if (!svgRef.current || !containerRef.current) return;

        const containerDimensions = calculateContainerDimensions(containerRef.current);
        const timeRangeLayout = calculateTimeRangeLayout(containerDimensions);
        const conversionFunctions = createYearPixelConversionFunctions(containerDimensions, timeRangeLayout);

        // Store the OLD scale info before updating it
        const oldScaleInfo = scaleInfoRef.current;

        const svgElement = d3.select(svgRef.current)
            .attr('width', containerDimensions.width)
            .attr('height', containerDimensions.height)
            .style('overflow', 'visible');
        
        svgElement.selectAll('*').remove();

        const colorBarLayout = createEraColorBars(svgElement, containerDimensions, timeRangeLayout);
        createYearMarkerLabels(svgElement, containerDimensions, conversionFunctions, colorBarLayout);

        const brushSelection = createBrushSelectionBehavior(containerDimensions, conversionFunctions);
        const brushGroup = svgElement.append('g').attr('class', 'brush').call(brushSelection);
        
        // Store brush references
        brushRef.current = brushSelection;
        brushGroupRef.current = brushGroup;
        
        // Hide default brush UI
        svgElement.selectAll('.brush .selection').style('display', 'none');
        svgElement.selectAll('.brush .overlay').style('pointer-events', 'none');

        // Initialize brush and create overlay elements
        const currentBounds = brushBoundsRef.current;
        let newTopY, newBottomY;
        
        if (currentBounds[0] === 0 && currentBounds[1] === 0) {
            // First initialization
            newTopY = 0;
            newBottomY = containerDimensions.height;
        } else {
            // Preserve existing selection based on actual years, not proportions
            // Get the current year range from the previous bounds
            if (oldScaleInfo && oldScaleInfo.convertPixelToYear) {
                const startYear = oldScaleInfo.convertPixelToYear(currentBounds[0]);
                const endYear = oldScaleInfo.convertPixelToYear(currentBounds[1]);
                
                // Convert these years to new pixel positions using NEW conversion functions
                newTopY = conversionFunctions.convertYearToPixel(startYear);
                newBottomY = conversionFunctions.convertYearToPixel(endYear);
            } else {
                // Fallback to proportional scaling if no previous scale info
                const oldHeight = oldScaleInfo?.dimensions?.height || containerDimensions.height;
                const scaleRatio = containerDimensions.height / oldHeight;
                newTopY = currentBounds[0] * scaleRatio;
                newBottomY = currentBounds[1] * scaleRatio;
            }
        }
        
        // Update scaleInfoRef AFTER we've used the old one
        scaleInfoRef.current = { ...conversionFunctions, dimensions: containerDimensions };
        
        brushSelection.move(brushGroup, [newTopY, newBottomY]);
        brushBoundsRef.current = [newTopY, newBottomY];

        const overlayElements = createSelectionOverlayElements(containerRef.current, containerDimensions, brushSelection, brushGroup);
        overlayElementsRef.current = overlayElements;

        // Update overlay positions immediately after creation
        updateSelectionOverlayPositions(overlayElements, containerDimensions, newTopY, newBottomY);

        // Enhanced brush event handler to update overlay positions
        brushSelection.on('brush end', (event) => {
            if (event.selection) {
                const [selectionTopY, selectionBottomY] = event.selection;
                brushBoundsRef.current = [selectionTopY, selectionBottomY];
                
                updateSelectionOverlayPositions(overlayElements, containerDimensions, selectionTopY, selectionBottomY);
                
                if (!isExternalUpdateRef.current) {
                    const startYear = conversionFunctions.convertPixelToYear(selectionTopY);
                    const endYear = conversionFunctions.convertPixelToYear(selectionBottomY);
                    onBrush([startYear, endYear]);
                }
            }
        });
    }, [calculateContainerDimensions, calculateTimeRangeLayout, createYearPixelConversionFunctions, 
        createEraColorBars, createYearMarkerLabels, createBrushSelectionBehavior, createSelectionOverlayElements, 
        updateSelectionOverlayPositions, onBrush]);

    // Set up ResizeObserver to watch for container size changes
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(() => {
            renderScrollbar();
        });

        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;

        // Initial render
        renderScrollbar();

        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
        };
    }, [renderScrollbar]);

    // Handle external selection changes
    useEffect(() => {
        // Skip external updates during user interaction
        if (isUserInteractingRef.current || !externalSelection || !scaleInfoRef.current || !brushRef.current || !brushGroupRef.current || !overlayElementsRef.current) return;

        const { convertYearToPixel, dimensions } = scaleInfoRef.current;
        const [startYear, endYear] = externalSelection;
        
        const selectionTopY = convertYearToPixel(startYear);
        const selectionBottomY = convertYearToPixel(endYear);
        
        // Set flag to prevent triggering onBrush during external update
        isExternalUpdateRef.current = true;
        
        // Update brush position
        updateBrushSelectionPosition(brushRef.current, brushGroupRef.current, selectionTopY, selectionBottomY);
        
        // Update overlay positions
        updateSelectionOverlayPositions(overlayElementsRef.current, dimensions, selectionTopY, selectionBottomY);
        
        // Update bounds reference
        brushBoundsRef.current = [selectionTopY, selectionBottomY];
        
        // Reset flag immediately after updates instead of using timeout
        requestAnimationFrame(() => {
            isExternalUpdateRef.current = false;
        });
        
    }, [externalSelection, updateBrushSelectionPosition, updateSelectionOverlayPositions]);

    useEffect(() => {
        if (!scrollInfo || !scaleInfoRef.current || scrollInfo.topVisibleYear === undefined) return;

        const { topVisibleYear, scrollPercentage, selectionRange } = scrollInfo;
        const { convertYearToPixel } = scaleInfoRef.current;
        
        // Calculate indicator position with edge behavior for scroll bounds
        const currentBrushStartY = convertYearToPixel(selectionRange[0]); // renamed from currentBrushStart
        const currentBrushEndY = convertYearToPixel(selectionRange[1]); // renamed from currentBrushEnd
        
        let scrollIndicatorY; // renamed from indicatorY
        if (scrollPercentage === 0) {
            scrollIndicatorY = currentBrushStartY;
        } else if (scrollPercentage === 1) {
            scrollIndicatorY = currentBrushEndY;
        } else {
            scrollIndicatorY = convertYearToPixel(topVisibleYear);
        }
        
        onIndicatorChange(scrollIndicatorY);
    }, [scrollInfo, onIndicatorChange]);

    const handleWheelScroll = useCallback((event) => { // renamed from handleWheel
        if (onScroll) {
            event.preventDefault();
            onScroll(event.deltaY);
        }
    }, [onScroll]);

    return (
        <div ref={containerRef} style={{width: '100%', height: '100%', position: 'relative'}} onWheel={handleWheelScroll}>
            <svg ref={svgRef}></svg>
            <div className="selection-overlay"></div>
            <div className="top-handle"></div>
            <div className="bottom-handle"></div>
        </div>
    );
};

export default EraScrollbar;
