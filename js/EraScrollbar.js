import { TIME_RANGES } from './constants.js';

const { useEffect, useRef, useCallback } = preactHooks;
const html = htm.bind(preact.h);

// Constants
const YEAR_INTERVAL = 500;
const YEAR_RANGE_START = -4000;
const YEAR_RANGE_END = 0;
const MIN_SELECTION_HEIGHT = 5;
const COLOR_BAR_WIDTH_RATIO = 1/6;
const LABEL_MARGIN = 15;
const LINE_GAP = 10;
const HANDLE_HEIGHT = 8;
const HANDLE_OFFSET = 4;
const RESIZE_ZONE_RATIO = 0.025;

const EraScrollbar = ({ onBrush, onIndicatorChange, scrollInfo, onScroll }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const scaleInfoRef = useRef(null);
    const brushBoundsRef = useRef([0, 0]);

    const calculateDimensions = useCallback((container) => {
        const rect = container.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }, []);

    const calculateRangeLayout = useCallback((dimensions) => {
        const totalSpan = TIME_RANGES.reduce((sum, range) => 
            sum + Math.abs(range.end - range.start), 0);
        
        const heights = TIME_RANGES.map(range => {
            const span = Math.abs(range.end - range.start);
            return (span / totalSpan) * dimensions.height;
        });

        const positions = [];
        let currentY = 0;
        for (const height of heights) {
            positions.push(currentY);
            currentY += height;
        }

        return { heights, positions };
    }, []);

    const createScaleFunctions = useCallback((dimensions, rangeLayout) => {
        const { heights, positions } = rangeLayout;

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
            const rangeStartPixel = positions[rangeIndex];
            const rangeHeight = heights[rangeIndex];

            if (rangeHeight <= 0) return range.start;

            const pixelIntoRange = pixel - rangeStartPixel;
            const proportion = pixelIntoRange / rangeHeight;
            const yearSpan = range.end - range.start;
            return range.start + (proportion * yearSpan);
        };

        return { yearToPixel, pixelToYear };
    }, []);

    const generateYearIntervals = useCallback(() => {
        const intervals = [];
        for (let year = YEAR_RANGE_START; year <= YEAR_RANGE_END; year += YEAR_INTERVAL) {
            intervals.push(year);
        }
        if (!intervals.includes(YEAR_RANGE_END)) {
            intervals.push(YEAR_RANGE_END);
        }
        return intervals;
    }, []);

    const createColorBars = useCallback((svg, dimensions, rangeLayout) => {
        const { heights, positions } = rangeLayout;
        const colorBarWidth = dimensions.width * COLOR_BAR_WIDTH_RATIO;
        const colorBarX = dimensions.width - colorBarWidth;
        
        svg.selectAll('.era-rect')
            .data(TIME_RANGES)
            .enter()
            .append('rect')
            .attr('class', 'era-rect')
            .attr('x', colorBarX)
            .attr('y', (d, i) => positions[i])
            .attr('width', colorBarWidth)
            .attr('height', (d, i) => heights[i])
            .attr('fill', d => d.color);

        return { colorBarWidth, colorBarX };
    }, []);

    const createYearMarkers = useCallback((svg, dimensions, scaleFunctions, colorBarLayout) => {
        const { yearToPixel } = scaleFunctions;
        const { colorBarX } = colorBarLayout;
        const lineStartX = colorBarX - LINE_GAP;
        const intervals = generateYearIntervals();

        svg.selectAll('.year-line')
            .data(intervals)
            .enter()
            .append('line')
            .attr('class', 'year-line')
            .attr('x1', lineStartX)
            .attr('y1', yearToPixel)
            .attr('x2', colorBarX)
            .attr('y2', yearToPixel)
            .attr('stroke', '#999')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '2,2');

        svg.selectAll('.year-label')
            .data(intervals)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', colorBarX - LABEL_MARGIN)
            .attr('y', d => yearToPixel(d) + 5)
            .text(d => d === 0 ? 'BC|AD' : `${Math.abs(d)} BC`)
            .attr('font-size', '14px')
            .attr('fill', '#333')
            .attr('text-anchor', 'end');
    }, [generateYearIntervals]);

    const createBrushBehavior = useCallback((dimensions, scaleFunctions) => {
        const { pixelToYear } = scaleFunctions;

        return d3.brushY()
            .extent([[0, 0], [dimensions.width, dimensions.height]])
            .on('brush end', (event) => {
                if (event.selection) {
                    const [y0, y1] = event.selection;
                    brushBoundsRef.current = [y0, y1];
                    
                    const startYear = pixelToYear(y0);
                    const endYear = pixelToYear(y1);
                    onBrush([startYear, endYear]);
                }
            })
            .on('brush', (event) => {
                if (event.selection) {
                    const [y0, y1] = event.selection;
                    brushBoundsRef.current = [y0, y1];
                }
            });
    }, [onBrush]);

    const updateBrushPosition = useCallback((brush, brushG, y0, y1) => {
        brush.move(brushG, [y0, y1]);
    }, []);

    const createInteractionHandler = useCallback((dimensions, brush, brushG, resizeZoneSize) => {
        return function(event) {
            const overlayRect = this.getBoundingClientRect();
            const mouseY = event.clientY - overlayRect.top;
            
            let mode = 'drag';
            if (mouseY <= resizeZoneSize) {
                mode = 'resize-top';
                this.style.cursor = 'ns-resize';
            } else if (mouseY >= overlayRect.height - resizeZoneSize) {
                mode = 'resize-bottom';
                this.style.cursor = 'ns-resize';
            }
            
            const startMouseY = event.clientY;
            const currentBounds = brushBoundsRef.current;
            const [currentY0, currentY1] = currentBounds;
            
            const handleMouseMove = (moveEvent) => {
                const deltaY = moveEvent.clientY - startMouseY;
                let newY0 = currentY0;
                let newY1 = currentY1;
                
                switch (mode) {
                    case 'resize-top':
                        newY0 = Math.max(0, Math.min(currentY1 - MIN_SELECTION_HEIGHT, currentY0 + deltaY));
                        break;
                    case 'resize-bottom':
                        newY1 = Math.min(dimensions.height, Math.max(currentY0 + MIN_SELECTION_HEIGHT, currentY1 + deltaY));
                        break;
                    case 'drag':
                        const selectionHeight = currentY1 - currentY0;
                        newY0 = Math.max(0, Math.min(dimensions.height - selectionHeight, currentY0 + deltaY));
                        newY1 = newY0 + selectionHeight;
                        break;
                }
                
                updateBrushPosition(brush, brushG, newY0, newY1);
            };
            
            const handleMouseUp = () => {
                this.style.cursor = 'move';
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            event.preventDefault();
        };
    }, [updateBrushPosition]);

    const createHandleMouseDown = useCallback((dimensions, brush, brushG, isTop) => {
        return function(event) {
            const startMouseY = event.clientY;
            const currentBounds = brushBoundsRef.current;
            const [currentY0, currentY1] = currentBounds;
            
            const handleMouseMove = (moveEvent) => {
                const deltaY = moveEvent.clientY - startMouseY;
                
                if (isTop) {
                    const newY0 = Math.max(0, Math.min(currentY1 - MIN_SELECTION_HEIGHT, currentY0 + deltaY));
                    updateBrushPosition(brush, brushG, newY0, currentY1);
                } else {
                    const newY1 = Math.min(dimensions.height, Math.max(currentY0 + MIN_SELECTION_HEIGHT, currentY1 + deltaY));
                    updateBrushPosition(brush, brushG, currentY0, newY1);
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
    }, [updateBrushPosition]);

    const createOverlayElements = useCallback((container, dimensions, brush, brushG) => {
        const resizeZoneSize = dimensions.height * RESIZE_ZONE_RATIO;
        const handleWidth = dimensions.width / 3;
        const handleLeft = dimensions.width / 3;

        // Selection overlay
        const overlay = d3.select(container)
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
            .on('mousedown', createInteractionHandler(dimensions, brush, brushG, resizeZoneSize))
            .on('mousemove', function(event) {
                if (event.buttons === 0) {
                    const overlayRect = this.getBoundingClientRect();
                    const mouseY = event.clientY - overlayRect.top;
                    
                    if (mouseY <= resizeZoneSize || mouseY >= overlayRect.height - resizeZoneSize) {
                        this.style.cursor = 'ns-resize';
                    } else {
                        this.style.cursor = 'move';
                    }
                }
            });

        // Top handle
        const topHandle = d3.select(container)
            .select('.top-handle')
            .style('position', 'absolute')
            .style('background', '#000')
            .style('pointer-events', 'auto')
            .style('width', `${handleWidth}px`)
            .style('height', `${HANDLE_HEIGHT}px`)
            .style('left', `${handleLeft}px`)
            .style('top', `-${HANDLE_OFFSET}px`)
            .style('cursor', 'ns-resize')
            .on('mousedown', createHandleMouseDown(dimensions, brush, brushG, true));

        // Bottom handle
        const bottomHandle = d3.select(container)
            .select('.bottom-handle')
            .style('position', 'absolute')
            .style('background', '#000')
            .style('pointer-events', 'auto')
            .style('width', `${handleWidth}px`)
            .style('height', `${HANDLE_HEIGHT}px`)
            .style('left', `${handleLeft}px`)
            .style('bottom', `-${HANDLE_OFFSET}px`)
            .style('cursor', 'ns-resize')
            .on('mousedown', createHandleMouseDown(dimensions, brush, brushG, false));

        return { overlay, topHandle, bottomHandle };
    }, [createInteractionHandler, createHandleMouseDown]);

    const updateOverlayPositions = useCallback((overlayElements, dimensions, y0, y1) => {
        const { overlay, topHandle, bottomHandle } = overlayElements;
        
        overlay
            .style('top', `${y0}px`)
            .style('height', `${y1 - y0}px`)
            .style('width', `${dimensions.width}px`);
        
        topHandle.style('top', `${y0 - HANDLE_OFFSET}px`);
        bottomHandle.style('top', `${y1 - HANDLE_OFFSET}px`);
    }, []);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const dimensions = calculateDimensions(containerRef.current);
        const rangeLayout = calculateRangeLayout(dimensions);
        const scaleFunctions = createScaleFunctions(dimensions, rangeLayout);

        scaleInfoRef.current = { ...scaleFunctions, dimensions };

        const svg = d3.select(svgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');
        
        svg.selectAll('*').remove();

        const colorBarLayout = createColorBars(svg, dimensions, rangeLayout);
        createYearMarkers(svg, dimensions, scaleFunctions, colorBarLayout);

        const brush = createBrushBehavior(dimensions, scaleFunctions);
        const brushG = svg.append('g').attr('class', 'brush').call(brush);
        
        // Hide default brush UI
        svg.selectAll('.brush .selection').style('display', 'none');
        svg.selectAll('.brush .overlay').style('pointer-events', 'none');

        // Initialize brush and create overlay elements
        brush.move(brushG, [0, dimensions.height]);
        brushBoundsRef.current = [0, dimensions.height];

        const overlayElements = createOverlayElements(containerRef.current, dimensions, brush, brushG);

        // Enhanced brush event handler to update overlay positions
        brush.on('brush end', (event) => {
            if (event.selection) {
                const [y0, y1] = event.selection;
                brushBoundsRef.current = [y0, y1];
                
                updateOverlayPositions(overlayElements, dimensions, y0, y1);
                
                const startYear = scaleFunctions.pixelToYear(y0);
                const endYear = scaleFunctions.pixelToYear(y1);
                onBrush([startYear, endYear]);
            }
        });

    }, [onBrush, calculateDimensions, calculateRangeLayout, createScaleFunctions, 
        createColorBars, createYearMarkers, createBrushBehavior, createOverlayElements, 
        updateOverlayPositions]);

    useEffect(() => {
        if (!scrollInfo || !scaleInfoRef.current || scrollInfo.topVisibleYear === undefined) return;

        const { topVisibleYear, scrollPercentage, selectionRange } = scrollInfo;
        const { yearToPixel } = scaleInfoRef.current;
        
        // Calculate indicator position with edge behavior for scroll bounds
        const currentBrushStart = yearToPixel(selectionRange[0]);
        const currentBrushEnd = yearToPixel(selectionRange[1]);
        
        let indicatorY;
        if (scrollPercentage === 0) {
            indicatorY = currentBrushStart;
        } else if (scrollPercentage === 1) {
            indicatorY = currentBrushEnd;
        } else {
            indicatorY = yearToPixel(topVisibleYear);
        }
        
        onIndicatorChange(indicatorY);
    }, [scrollInfo, onIndicatorChange]);

    const handleWheel = useCallback((event) => {
        if (onScroll) {
            event.preventDefault();
            onScroll(event.deltaY);
        }
    }, [onScroll]);

    return html`
        <div ref=${containerRef} style="width: 100%; height: 100%; position: relative;" onWheel=${handleWheel}>
            <svg ref=${svgRef}></svg>
            <div class="selection-overlay"></div>
            <div class="top-handle"></div>
            <div class="bottom-handle"></div>
        </div>
    `;
};

export default EraScrollbar;