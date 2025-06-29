const { useRef, useEffect, useCallback, useLayoutEffect } = os.appHooks;
import { TIME_RANGES } from 'eventTimeline.components.constants';
import { getStyleOf } from 'eventTimeline.styles.styler';

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
    const brushGroupRef = useRef(null);
    const overlayElementsRef = useRef(null);
    const isExternalUpdateRef = useRef(false);
    const isUserInteractingRef = useRef(false);

    // Bind methods to preserve 'this' context
    const boundOnBrush = useCallback((selection) => {
        console.log('[DEBUG] onBrush called with:', selection);
        try {
            if (onBrush && typeof onBrush === 'function') {
                onBrush(selection);
            }
        } catch (error) {
            console.error('[ERROR] onBrush failed:', error);
        }
    }, [onBrush]);

    const boundOnIndicatorChange = useCallback((position) => {
        console.log('[DEBUG] onIndicatorChange called with:', position);
        try {
            if (onIndicatorChange && typeof onIndicatorChange === 'function') {
                onIndicatorChange(position);
            }
        } catch (error) {
            console.error('[ERROR] onIndicatorChange failed:', error);
        }
    }, [onIndicatorChange]);

    const boundOnScroll = useCallback((deltaY) => {
        console.log('[DEBUG] onScroll called with:', deltaY);
        try {
            if (onScroll && typeof onScroll === 'function') {
                onScroll(deltaY);
            }
        } catch (error) {
            console.error('[ERROR] onScroll failed:', error);
        }
    }, [onScroll]);

    const calculateContainerDimensions = useCallback(() => {
        console.log('[DEBUG] Calculating container dimensions');
        const deviceWidth = window.innerWidth;
        const pageHeight = window.innerHeight;
        let headerHeight;
        
        if (deviceWidth <= 266) headerHeight = 192;
        else if (deviceWidth <= 335) headerHeight = 160;
        else if (deviceWidth <= 387) headerHeight = 132;
        else if (deviceWidth <= 718) headerHeight = 104;
        else if (deviceWidth <= 945) headerHeight = 76;
        else headerHeight = 44;
        
        const eraScrollbarHeight = pageHeight - headerHeight - 24;
        
        const dimensions = { 
            width: 100,
            height: eraScrollbarHeight 
        };
        
        console.log('[DEBUG] Container dimensions:', dimensions);
        return dimensions;
    }, []);

    const calculateTimeRangeLayout = useCallback((dimensions) => {
        console.log('[DEBUG] Calculating time range layout for dimensions:', dimensions);
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

        const result = { eraHeights, eraPositions };
        console.log('[DEBUG] Time range layout calculated:', result);
        return result;
    }, []);

    const createYearPixelConversionFunctions = useCallback((dimensions, timeRangeLayout) => {
        console.log('[DEBUG] Creating conversion functions');
        const { eraHeights, eraPositions } = timeRangeLayout;

        const convertYearToPixel = (year) => {
            const eraIndex = TIME_RANGES.findIndex(range => 
                year >= range.start && year <= range.end);
            
            if (eraIndex === -1) {
                if (year < TIME_RANGES[0].start) return eraPositions[0];
                if (year > TIME_RANGES[TIME_RANGES.length - 1].end) return dimensions.height;
                return 0;
            }
            
            const timeRange = TIME_RANGES[eraIndex];
            const eraTimeSpan = timeRange.end - timeRange.start;
            const yearPositionInEra = (year - timeRange.start) / eraTimeSpan;

            return eraPositions[eraIndex] + (yearPositionInEra * eraHeights[eraIndex]);
        };

        const convertPixelToYear = (pixelY) => {
            let eraIndex = TIME_RANGES.length - 1;
            for (let i = 0; i < eraPositions.length - 1; i++) {
                if (pixelY < eraPositions[i + 1]) {
                    eraIndex = i;
                    break;
                }
            }

            const timeRange = TIME_RANGES[eraIndex];
            const eraStartPixel = eraPositions[eraIndex];
            const eraPixelHeight = eraHeights[eraIndex];

            if (eraPixelHeight <= 0) return timeRange.start;

            const pixelOffsetInEra = pixelY - eraStartPixel;
            const pixelProportion = pixelOffsetInEra / eraPixelHeight;
            const eraYearSpan = timeRange.end - timeRange.start;
            return timeRange.start + (pixelProportion * eraYearSpan);
        };

        console.log('[DEBUG] Conversion functions created successfully');
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

    const createEraColorBars = useCallback((svg, dimensions, timeRangeLayout) => {
        console.log('[DEBUG] Creating era color bars');
        const { eraHeights, eraPositions } = timeRangeLayout;
        const colorBarWidth = dimensions.width * COLOR_BAR_WIDTH_RATIO;
        const colorBarXPosition = dimensions.width - colorBarWidth;

        try {
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

            console.log('[DEBUG] Era color bars created successfully');
            return { colorBarWidth, colorBarXPosition };
        } catch (error) {
            console.error('[ERROR] Failed to create era color bars:', error);
            return { colorBarWidth, colorBarXPosition };
        }
    }, []);

    const createYearMarkerLabels = useCallback((svg, dimensions, conversionFunctions, colorBarLayout) => {
        console.log('[DEBUG] Creating year marker labels');
        const { convertYearToPixel } = conversionFunctions;
        const { colorBarXPosition } = colorBarLayout;
        const markerLineStartX = colorBarXPosition - LABEL_LINE_LENGTH;
        const yearIntervals = generateYearLabelIntervals();

        try {
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
                
            console.log('[DEBUG] Year marker labels created successfully');
        } catch (error) {
            console.error('[ERROR] Failed to create year marker labels:', error);
        }
    }, [generateYearLabelIntervals]);

    const createBrushSelectionBehavior = useCallback((dimensions, conversionFunctions) => {
        console.log('[DEBUG] Creating brush selection behavior');
        const { convertPixelToYear } = conversionFunctions;

        try {
            return d3.brushY()
                .extent([[0, 0], [dimensions.width, dimensions.height]])
                .on('brush end', (event) => {
                    console.log('[DEBUG] Brush event triggered:', event);
                    if (event.selection && !isExternalUpdateRef.current) {
                        const [selectionTopY, selectionBottomY] = event.selection;
                        brushBoundsRef.current = [selectionTopY, selectionBottomY];
                        
                        const startYear = convertPixelToYear(selectionTopY);
                        const endYear = convertPixelToYear(selectionBottomY);
                        console.log('[DEBUG] Calling boundOnBrush with years:', [startYear, endYear]);
                        boundOnBrush([startYear, endYear]);
                    }
                })
                .on('brush', (event) => {
                    if (event.selection) {
                        const [selectionTopY, selectionBottomY] = event.selection;
                        brushBoundsRef.current = [selectionTopY, selectionBottomY];
                    }
                });
        } catch (error) {
            console.error('[ERROR] Failed to create brush selection behavior:', error);
            return null;
        }
    }, [boundOnBrush]);

    const updateBrushSelectionPosition = useCallback((brush, brushGroup, topY, bottomY) => {
        console.log('[DEBUG] Updating brush selection position:', { topY, bottomY });
        try {
            if (brush && brushGroup && typeof brush.move === 'function') {
                // Add defensive check for valid coordinates
                if (typeof topY === 'number' && typeof bottomY === 'number' && 
                    !isNaN(topY) && !isNaN(bottomY) && topY <= bottomY) {
                    brush.move(brushGroup, [topY, bottomY]);
                } else {
                    console.warn('[WARN] Invalid brush position coordinates:', { topY, bottomY });
                }
            } else {
                console.warn('[WARN] Invalid brush or brushGroup objects');
            }
        } catch (error) {
            console.error('[ERROR] Failed to update brush selection position:', error);
        }
    }, []);

    const createSelectionDragHandler = useCallback((dimensions, brush, brushGroup, resizeZoneSize) => {
        return function(event) {
            console.log('[DEBUG] Selection drag handler triggered');
            try {
                isUserInteractingRef.current = true;
                const overlayRect = this.getBoundingClientRect();
                const mouseYInOverlay = event.clientY - overlayRect.top;

                let interactionMode = 'drag';
                if (mouseYInOverlay <= resizeZoneSize) {
                    interactionMode = 'resize-top';
                    this.style.cursor = 'ns-resize';
                } else if (mouseYInOverlay >= overlayRect.height - resizeZoneSize) {
                    interactionMode = 'resize-bottom';
                    this.style.cursor = 'ns-resize';
                }
                
                const initialMouseY = event.clientY;
                const currentBounds = brushBoundsRef.current;
                const [currentTopY, currentBottomY] = currentBounds;

                const handleMouseMove = (moveEvent) => {
                    const mouseDeltaY = moveEvent.clientY - initialMouseY;
                    let newTopY = currentTopY;
                    let newBottomY = currentBottomY;

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
                    console.log('[DEBUG] Mouse up - ending drag interaction');
                    this.style.cursor = 'move';
                    isUserInteractingRef.current = false;
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                event.preventDefault();
            } catch (error) {
                console.error('[ERROR] Selection drag handler failed:', error);
            }
        };
    }, [updateBrushSelectionPosition]);

    const createResizeHandleMouseDown = useCallback((dimensions, brush, brushGroup, isTopHandle) => {
        return function(event) {
            console.log('[DEBUG] Resize handle mouse down:', { isTopHandle });
            try {
                const initialMouseY = event.clientY;
                const currentBounds = brushBoundsRef.current;
                const [currentTopY, currentBottomY] = currentBounds;

                const handleMouseMove = (moveEvent) => {
                    const mouseDeltaY = moveEvent.clientY - initialMouseY;
                    
                    if (isTopHandle) {
                        const newTopY = Math.max(0, Math.min(currentBottomY - MIN_SELECTION_HEIGHT, currentTopY + mouseDeltaY));
                        updateBrushSelectionPosition(brush, brushGroup, newTopY, currentBottomY);
                    } else {
                        const newBottomY = Math.min(dimensions.height, Math.max(currentTopY + MIN_SELECTION_HEIGHT, currentBottomY + mouseDeltaY));
                        updateBrushSelectionPosition(brush, brushGroup, currentTopY, newBottomY);
                    }
                };
                
                const handleMouseUp = () => {
                    console.log('[DEBUG] Resize handle mouse up');
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                event.preventDefault();
                event.stopPropagation();
            } catch (error) {
                console.error('[ERROR] Resize handle mouse down failed:', error);
            }
        };
    }, [updateBrushSelectionPosition]);

    const createSelectionOverlayElements = useCallback((container, dimensions, brush, brushGroup) => {
        console.log('[DEBUG] Creating selection overlay elements');
        try {
            const resizeZoneSize = dimensions.height * RESIZE_ZONE_RATIO;
            const handleWidth = dimensions.width / 3;
            const handleLeftPosition = dimensions.width / 3;

            // Selection overlay
            const selectionOverlay = d3.select(container)
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
                        const mouseYInOverlay = event.clientY - overlayRect.top;

                        if (mouseYInOverlay <= resizeZoneSize || mouseYInOverlay >= overlayRect.height - resizeZoneSize) {
                            this.style.cursor = 'ns-resize';
                        } else {
                            this.style.cursor = 'move';
                        }
                    }
                });

            // Top handle
            const topResizeHandle = d3.select(container)
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
            const bottomResizeHandle = d3.select(container)
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

            console.log('[DEBUG] Selection overlay elements created successfully');
            return { selectionOverlay, topResizeHandle, bottomResizeHandle };
        } catch (error) {
            console.error('[ERROR] Failed to create selection overlay elements:', error);
            return null;
        }
    }, [createSelectionDragHandler, createResizeHandleMouseDown]);

    const updateSelectionOverlayPositions = useCallback((overlayElements, dimensions, topY, bottomY) => {
        console.log('[DEBUG] Updating selection overlay positions:', { topY, bottomY });
        try {
            if (!overlayElements || !dimensions) {
                console.warn('[WARN] Missing overlayElements or dimensions');
                return;
            }
            
            // Add defensive checks for valid coordinates
            if (typeof topY !== 'number' || typeof bottomY !== 'number' || 
                isNaN(topY) || isNaN(bottomY) || topY > bottomY) {
                console.warn('[WARN] Invalid overlay position coordinates:', { topY, bottomY });
                return;
            }
            
            const { selectionOverlay, topResizeHandle, bottomResizeHandle } = overlayElements;
            
            if (selectionOverlay && typeof selectionOverlay.style === 'function') {
                selectionOverlay
                    .style('top', `${topY}px`)
                    .style('height', `${bottomY - topY}px`)
                    .style('width', `${dimensions.width}px`);
            }
            
            if (topResizeHandle && typeof topResizeHandle.style === 'function') {
                topResizeHandle.style('top', `${topY - HANDLE_OFFSET}px`);
            }
            
            if (bottomResizeHandle && typeof bottomResizeHandle.style === 'function') {
                bottomResizeHandle.style('top', `${bottomY - HANDLE_OFFSET}px`);
            }
        } catch (error) {
            console.error('[ERROR] Failed to update selection overlay positions:', error);
        }
    }, []);

    useLayoutEffect(() => {
        console.log('[DEBUG] useLayoutEffect triggered');
        
        if (!window.d3) {
            console.error('[ERROR] D3 is not available');
            return;
        }
        
        if (!svgRef.current || !containerRef.current) {
            console.log('[DEBUG] Refs not ready yet');
            return;
        }

        try {
            const containerDimensions = calculateContainerDimensions();
            const timeRangeLayout = calculateTimeRangeLayout(containerDimensions);
            const conversionFunctions = createYearPixelConversionFunctions(containerDimensions, timeRangeLayout);
            
            console.log('[DEBUG] Test conversion -4000:', conversionFunctions.convertYearToPixel(-4000));
            console.log('[DEBUG] Test conversion 0:', conversionFunctions.convertYearToPixel(0));
            
            scaleInfoRef.current = { ...conversionFunctions, dimensions: containerDimensions };

            const svgElement = d3.select(svgRef.current)
                .attr('width', containerDimensions.width)
                .attr('height', containerDimensions.height)
                .style('overflow', 'visible');
            
            svgElement.selectAll('*').remove();

            const colorBarLayout = createEraColorBars(svgElement, containerDimensions, timeRangeLayout);
            createYearMarkerLabels(svgElement, containerDimensions, conversionFunctions, colorBarLayout);

            const brushSelection = createBrushSelectionBehavior(containerDimensions, conversionFunctions);
            if (!brushSelection) {
                console.error('[ERROR] Failed to create brush selection behavior');
                return;
            }

            const brushGroup = svgElement.append('g').attr('class', 'brush').call(brushSelection);

            brushRef.current = brushSelection;
            brushGroupRef.current = brushGroup;
            
            svgElement.selectAll('.brush .selection').style('display', 'none');
            svgElement.selectAll('.brush .overlay').style('pointer-events', 'none');

            brushSelection.move(brushGroup, [0, containerDimensions.height]);
            brushBoundsRef.current = [0, containerDimensions.height];

            const overlayElements = createSelectionOverlayElements(containerRef.current, containerDimensions, brushSelection, brushGroup);
            overlayElementsRef.current = overlayElements;

            brushSelection.on('brush end', (event) => {
                if (event.selection) {
                    const [selectionTopY, selectionBottomY] = event.selection;
                    console.log('[DEBUG] Brush selection updated:', selectionTopY, selectionBottomY);
                    
                    brushBoundsRef.current = [selectionTopY, selectionBottomY];
                    
                    if (overlayElements) {
                        updateSelectionOverlayPositions(overlayElements, containerDimensions, selectionTopY, selectionBottomY);
                    }
                    
                    if (!isExternalUpdateRef.current) {
                        const startYear = conversionFunctions.convertPixelToYear(selectionTopY);
                        const endYear = conversionFunctions.convertPixelToYear(selectionBottomY);
                        console.log('[DEBUG] Converted years:', startYear, endYear);
                        boundOnBrush([startYear, endYear]);
                    }
                }
            });

            console.log('[DEBUG] EraScrollbar setup complete');
        } catch (error) {
            console.error('[ERROR] useLayoutEffect failed:', error);
        }
    }, [
        calculateContainerDimensions, 
        calculateTimeRangeLayout, 
        createYearPixelConversionFunctions, 
        createEraColorBars, 
        createYearMarkerLabels, 
        createBrushSelectionBehavior, 
        createSelectionOverlayElements, 
        updateSelectionOverlayPositions,
        boundOnBrush
    ]);

    // Handle external selection changes
    useEffect(() => {
        console.log('[DEBUG] External selection effect triggered:', externalSelection);
        
        if (isUserInteractingRef.current || !externalSelection || !scaleInfoRef.current || !brushRef.current || !brushGroupRef.current || !overlayElementsRef.current) {
            console.log('[DEBUG] Skipping external selection update');
            return;
        }

        try {
            const { convertYearToPixel, dimensions } = scaleInfoRef.current;
            const [startYear, endYear] = externalSelection;
            
            const selectionTopY = convertYearToPixel(startYear);
            const selectionBottomY = convertYearToPixel(endYear);
            
            isExternalUpdateRef.current = true;
            
            updateBrushSelectionPosition(brushRef.current, brushGroupRef.current, selectionTopY, selectionBottomY);
            updateSelectionOverlayPositions(overlayElementsRef.current, dimensions, selectionTopY, selectionBottomY);
            
            brushBoundsRef.current = [selectionTopY, selectionBottomY];
            
            // Fix: Use setTimeout instead of requestAnimationFrame to avoid context issues
            const timeoutId = setTimeout(() => {
                isExternalUpdateRef.current = false;
                console.log('[DEBUG] External update flag reset');
            }, 0);
            
            // Cleanup function
            return () => {
                clearTimeout(timeoutId);
                isExternalUpdateRef.current = false;
            };
            
            console.log('[DEBUG] External selection applied successfully');
        } catch (error) {
            console.error('[ERROR] External selection update failed:', error);
            // Reset flag on error
            isExternalUpdateRef.current = false;
        }
    }, [externalSelection, updateBrushSelectionPosition, updateSelectionOverlayPositions]);

    useEffect(() => {
        console.log('[DEBUG] Scroll info effect triggered:', scrollInfo);
        
        if (!scrollInfo || !scaleInfoRef.current || scrollInfo.topVisibleYear === undefined) {
            console.log('[DEBUG] Skipping scroll info update');
            return;
        }

        try {
            const { topVisibleYear, scrollPercentage, selectionRange } = scrollInfo;
            const { convertYearToPixel } = scaleInfoRef.current;
            
            const currentBrushStartY = convertYearToPixel(selectionRange[0]);
            const currentBrushEndY = convertYearToPixel(selectionRange[1]);

            let scrollIndicatorY;
            if (scrollPercentage === 0) {
                scrollIndicatorY = currentBrushStartY;
            } else if (scrollPercentage === 1) {
                scrollIndicatorY = currentBrushEndY;
            } else {
                scrollIndicatorY = convertYearToPixel(topVisibleYear);
            }
            
            console.log('[DEBUG] Calling boundOnIndicatorChange with:', scrollIndicatorY);
            boundOnIndicatorChange(scrollIndicatorY);
        } catch (error) {
            console.error('[ERROR] Scroll info update failed:', error);
        }
    }, [scrollInfo, boundOnIndicatorChange]);

    const handleWheelScroll = useCallback((event) => {
        console.log('[DEBUG] Wheel scroll event:', event.deltaY);
        try {
            if (boundOnScroll) {
                event.preventDefault();
                boundOnScroll(event.deltaY);
            }
        } catch (error) {
            console.error('[ERROR] Wheel scroll failed:', error);
        }
    }, [boundOnScroll]);

    return (
        <>
            <div 
                ref={containerRef} 
                style={{width: "100%", height: "100%", position: "relative"}} 
                onWheel={handleWheelScroll}
            >
                <svg ref={svgRef}></svg>
                <div class="selection-overlay"></div>
                <div class="top-handle"></div>
                <div class="bottom-handle"></div>
            </div>
            <style>{getStyleOf('era-scrollbar.css')}</style>
        </>
    );
};

export default EraScrollbar;