import React, { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { TIME_RANGES } from '../../utils/constants.js';
import './macroChart.css';
import { EQUAL_DISTRIBUTION_AREA, PROPORTIONATE_DISTRIBUTION_AREA } from '../../utils/constants.js';

// Constants
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

const MacroChart = ({ data, onBrush, onIndicatorChange, scrollInfo, externalSelection }) => {
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

    const calculateDimensions = useCallback((container) => {
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
        brush.move(brushGroup, [y0, y1]);
    }, []);

    const createDragHandler = useCallback((dimensions, brush, brushGroup, resizeZone) => {
        return function(event) {
            isUserInteractingRef.current = true;
            const rect = this.getBoundingClientRect();
            const mouseY = event.clientY - rect.top;
            
            let mode = 'drag';
            if (mouseY <= resizeZone) {
                mode = 'resize-top';
                this.style.cursor = 'ns-resize';
            } else if (mouseY >= rect.height - resizeZone) {
                mode = 'resize-bottom';
                this.style.cursor = 'ns-resize';
            }
            
            const startMouseY = event.clientY;
            const [currentY0, currentY1] = brushBoundsRef.current;
            
            const handleMove = (moveEvent) => {
                const deltaY = moveEvent.clientY - startMouseY;
                let newY0 = currentY0, newY1 = currentY1;
                
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
            };
            
            const handleUp = () => {
                this.style.cursor = 'move';
                isUserInteractingRef.current = false;
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
            };
            
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
            event.preventDefault();
        };
    }, [updateBrush]);

    const createHandleMouseDown = useCallback((dimensions, brush, brushGroup, isTop) => {
        return function(event) {
            const startMouseY = event.clientY;
            const [currentY0, currentY1] = brushBoundsRef.current;
            
            const handleMove = (moveEvent) => {
                const deltaY = moveEvent.clientY - startMouseY;
                
                if (isTop) {
                    const newY0 = Math.max(0, Math.min(currentY1 - MIN_SELECTION_HEIGHT, currentY0 + deltaY));
                    updateBrush(brush, brushGroup, newY0, currentY1);
                } else {
                    const newY1 = Math.min(dimensions.height, Math.max(currentY0 + MIN_SELECTION_HEIGHT, currentY1 + deltaY));
                    updateBrush(brush, brushGroup, currentY0, newY1);
                }
            };
            
            const handleUp = () => {
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
            };
            
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
            event.preventDefault();
            event.stopPropagation();
        };
    }, [updateBrush]);

    const createOverlayElements = useCallback((container, dimensions, brush, brushGroup) => {
        const resizeZone = dimensions.height * RESIZE_ZONE_RATIO;
        const handleWidth = dimensions.width * HANDLE_WIDTH_RATIO;
        // Center the handle on the selection overlay
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
                    const rect = this.getBoundingClientRect();
                    const mouseY = event.clientY - rect.top;
                    
                    if (mouseY <= resizeZone || mouseY >= rect.height - resizeZone) {
                        this.style.cursor = 'ns-resize';
                    } else {
                        this.style.cursor = 'move';
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

        return { overlay, topHandle, bottomHandle };
    }, [createDragHandler, createHandleMouseDown]);

    const updateOverlayPositions = useCallback((elements, dimensions, y0, y1) => {
        const { overlay, topHandle, bottomHandle } = elements;
        
        overlay
            .style('top', `${y0}px`)
            .style('height', `${y1 - y0}px`)
            .style('width', `${dimensions.width}px`);
        
        // Center the handles on the overlay edges
        topHandle.style('top', `${y0 - (HANDLE_HEIGHT / 2)}px`);
        bottomHandle.style('top', `${y1 - (HANDLE_HEIGHT / 2)}px`);
    }, []);

    const render = useCallback(() => {
        if (!svgRef.current || !containerRef.current) return;

        const dimensions = calculateDimensions(containerRef.current);
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
        
        if (currentBounds[0] === 0 && currentBounds[1] === 0) {
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
        
        brush.move(brushGroup, [newY0, newY1]);
        brushBoundsRef.current = [newY0, newY1];

        const overlayElements = createOverlayElements(containerRef.current, dimensions, brush, brushGroup);
        overlayElementsRef.current = overlayElements;

        updateOverlayPositions(overlayElements, dimensions, newY0, newY1);

        brush.on('brush end', (event) => {
            if (event.selection) {
                const [y0, y1] = event.selection;
                brushBoundsRef.current = [y0, y1];
                
                updateOverlayPositions(overlayElements, dimensions, y0, y1);
                
                if (!isExternalUpdateRef.current) {
                    const startYear = converters.pixelToYear(y0);
                    const endYear = converters.pixelToYear(y1);
                    onBrush([startYear, endYear]);
                }
            }
        });
    }, [calculateDimensions, calculateLayout, createConverters, createColorBars, 
        createYearMarkers, createBrush, createOverlayElements, updateOverlayPositions, onBrush]);

    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(() => render());
        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;

        render();

        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
        };
    }, [render]);

    useEffect(() => {
        if (isUserInteractingRef.current || !externalSelection || !scaleInfoRef.current || 
            !brushRef.current || !brushGroupRef.current || !overlayElementsRef.current) return;

        const { yearToPixel, dimensions } = scaleInfoRef.current;
        const [startYear, endYear] = externalSelection;
        
        const y0 = yearToPixel(startYear);
        const y1 = yearToPixel(endYear);
        
        isExternalUpdateRef.current = true;
        
        updateBrush(brushRef.current, brushGroupRef.current, y0, y1);
        updateOverlayPositions(overlayElementsRef.current, dimensions, y0, y1);
        
        brushBoundsRef.current = [y0, y1];
        
        requestAnimationFrame(() => {
            isExternalUpdateRef.current = false;
        });
        
    }, [externalSelection, updateBrush, updateOverlayPositions]);

    useEffect(() => {
        if (!scrollInfo || !scaleInfoRef.current || !data || !data.length || scrollInfo.topVisibleYear === undefined) return;

        const { topVisibleYear, scrollPercentage } = scrollInfo;
        const { yearToPixel } = scaleInfoRef.current;
        
        // Use all events in the dataset, not just those in selection range
        const allEvents = data;

        if (allEvents.length === 0) {
            onIndicatorChange(null);
            return;
        }

        let indicatorY = null;

        if (scrollPercentage === 1) {
            // Snap to the last event in the entire dataset
            const lastEvent = allEvents[allEvents.length - 1];
            indicatorY = yearToPixel(lastEvent.fields.startDate);
        } else {
            // Find the closest event to topVisibleYear from all events
            let closest = null;
            let minDistance = Infinity;

            for (let i = 0; i < allEvents.length; i++) {
                const event = allEvents[i];
                const distance = Math.abs(event.fields.startDate - topVisibleYear);
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = event;
                }
            }

            if (closest) {
                indicatorY = yearToPixel(closest.fields.startDate);
            }
        }
        
        onIndicatorChange(indicatorY);
    }, [scrollInfo?.topVisibleYear, scrollInfo?.scrollPercentage, data, onIndicatorChange]);

    return (
        <div ref={containerRef} className="macrochart-root">
            <svg ref={svgRef}></svg>
            <div className="selection-overlay"></div>
            <div className="top-handle"></div>
            <div className="bottom-handle"></div>
        </div>
    );
};

export default MacroChart;