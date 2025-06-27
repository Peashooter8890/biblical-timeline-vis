import { TIME_RANGES } from './constants.js';

const { useEffect, useRef, useCallback } = preactHooks;
const html = htm.bind(preact.h);

const EraScrollbar = ({ onBrush, onIndicatorChange, scrollInfo }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const scaleInfoRef = useRef(null);
    const brushBoundsRef = useRef([0, 0]); // Store current brush bounds in pixels

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const dimensions = { 
            width: containerRect.width, 
            height: containerRect.height 
        };

        const totalSpan = TIME_RANGES.reduce((sum, range) => sum + Math.abs(range.end - range.start), 0);
        
        const rangeHeights = TIME_RANGES.map(range => {
            const span = Math.abs(range.end - range.start);
            return (span / totalSpan) * dimensions.height;
        });

        const rangePositions = [];
        let currentY = 0;
        for (let i = 0; i < TIME_RANGES.length; i++) {
            rangePositions.push(currentY);
            currentY += rangeHeights[i];
        }

        const yearToPixel = (year) => {
            const rangeIndex = TIME_RANGES.findIndex(range => 
                year >= range.start && year <= range.end
            );
            
            if (rangeIndex === -1) {
                // Handle edge cases - find closest range
                if (year < TIME_RANGES[0].start) return rangePositions[0];
                if (year > TIME_RANGES[TIME_RANGES.length - 1].end) return dimensions.height;
                return 0;
            }
            
            const range = TIME_RANGES[rangeIndex];
            const rangeSpan = range.end - range.start;
            const positionInRange = (year - range.start) / rangeSpan;
            
            return rangePositions[rangeIndex] + (positionInRange * rangeHeights[rangeIndex]);
        };

        const pixelToYear = (pixel) => {
            let rangeIndex = TIME_RANGES.length - 1;
            for (let i = 0; i < rangePositions.length - 1; i++) {
                if (pixel < rangePositions[i + 1]) {
                    rangeIndex = i;
                    break;
                }
            }

            const range = TIME_RANGES[rangeIndex];
            const rangeStartPixel = rangePositions[rangeIndex];
            const rangeHeight = rangeHeights[rangeIndex];

            if (rangeHeight <= 0) return range.start;

            const pixelIntoRange = pixel - rangeStartPixel;
            const proportion = pixelIntoRange / rangeHeight;
            const yearSpan = range.end - range.start;
            return range.start + (proportion * yearSpan);
        };

        // Store scale info
        scaleInfoRef.current = {
            yearToPixel,
            pixelToYear,
            dimensions
        };

        const svg = d3.select(svgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            // .attr('viewBox', `-2 0 ${dimensions.width + 4} ${dimensions.height}`);
        
        svg.selectAll('*').remove();

        const colorBarWidth = dimensions.width / 6;
        const colorBarX = dimensions.width - colorBarWidth;
        
        svg.selectAll('.era-rect')
            .data(TIME_RANGES)
            .enter()
            .append('rect')
            .attr('class', 'era-rect')
            .attr('x', colorBarX)
            .attr('y', (d, i) => rangePositions[i])
            .attr('width', colorBarWidth)
            .attr('height', (d, i) => rangeHeights[i])
            .attr('fill', d => d.color);

        const labelX = 15;
        const lineStartX = dimensions.width - colorBarWidth - 10;
        
        const yearScale = d3.scaleLinear()
            .domain([-4004, 30])
            .range([0, dimensions.height]);

        const intervals = [];
        for (let year = -4000; year <= 0; year += 500) {
            intervals.push(year);
        }
        intervals.push(0);

        svg.selectAll('.year-line')
            .data(intervals)
            .enter()
            .append('line')
            .attr('class', 'year-line')
            .attr('x1', lineStartX)
            .attr('y1', d => yearScale(d))
            .attr('x2', colorBarX)
            .attr('y2', d => yearScale(d))
            .attr('stroke', '#999')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '2,2');

        svg.selectAll('.year-label')
            .data(intervals)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', labelX)
            .attr('y', d => yearScale(d) + 5)
            .text(d => d === 0 ? 'BC|AD' : `${Math.abs(d)} BC`)
            .attr('font-size', '14px')
            .attr('fill', '#333')
            .attr('text-anchor', 'start');

        const brush = d3.brushY()
            .extent([[0, 0], [dimensions.width, dimensions.height]])
            .on('brush end', (event) => {
                if (event.selection) {
                    const [y0, y1] = event.selection;
                    // Store the brush bounds in pixels - these are the actual visual bounds
                    brushBoundsRef.current = [y0, y1];
                    
                    const startYear = pixelToYear(y0);
                    const endYear = pixelToYear(y1);
                    onBrush([startYear, endYear]);
                }
            })
            .on('brush', (event) => {
                // Also update during brushing (not just on end)
                if (event.selection) {
                    const [y0, y1] = event.selection;
                    brushBoundsRef.current = [y0, y1];
                }
            });

        const brushG = svg.append('g')
            .attr('class', 'brush')
            .call(brush);
        
        // Hide the default SVG selection rectangle
        svg.selectAll('.brush .selection')
            .style('display', 'none');

        // Initialize brush to full range and store bounds
        brush.move(brushG, [0, dimensions.height]);
        brushBoundsRef.current = [0, dimensions.height];

        // Add HTML overlay for visual selection
        const overlay = d3.select(containerRef.current)
            .select('.selection-overlay')
            .style('position', 'absolute')
            .style('background', 'rgba(119, 119, 119, 0.3)')
            .style('border', '3px solid #000')
            .style('border-radius', '8px')
            .style('pointer-events', 'none')
            .style('top', '0px')
            .style('left', '0px')
            .style('width', `${dimensions.width}px`)
            .style('height', `${dimensions.height}px`)
            .style('box-sizing', 'border-box');

        // Add top handle
        const topHandle = d3.select(containerRef.current)
            .select('.top-handle')
            .style('position', 'absolute')
            .style('background', '#000')
            .style('pointer-events', 'none')
            .style('width', `${dimensions.width / 3}px`)
            .style('height', '8px')
            .style('left', `${dimensions.width / 3}px`)
            .style('top', '-4px');

        // Add bottom handle
        const bottomHandle = d3.select(containerRef.current)
            .select('.bottom-handle')
            .style('position', 'absolute')
            .style('background', '#000')
            .style('pointer-events', 'none')
            .style('width', `${dimensions.width / 3}px`)
            .style('height', '8px')
            .style('left', `${dimensions.width / 3}px`)
            .style('bottom', '-4px');

        // Update overlay and handles on brush events
        brush.on('brush end', (event) => {
            if (event.selection) {
                const [y0, y1] = event.selection;
                brushBoundsRef.current = [y0, y1];
                
                // Update HTML overlay position
                overlay
                    .style('top', `${y0}px`)
                    .style('height', `${y1 - y0}px`)
                    .style('width', `${dimensions.width}px`);
                
                // Update handle positions
                topHandle
                    .style('top', `${y0 - 4}px`);
                
                bottomHandle
                    .style('top', `${y1 - 4}px`);
                
                const startYear = pixelToYear(y0);
                const endYear = pixelToYear(y1);
                onBrush([startYear, endYear]);
            }
        });

    }, [onBrush]);

    useEffect(() => {
        if (!scrollInfo || !scaleInfoRef.current || scrollInfo.topVisibleYear === undefined) return;

        const { topVisibleYear, scrollPercentage, selectionRange } = scrollInfo;
        const { yearToPixel } = scaleInfoRef.current;
        
        // Always calculate the current brush bounds from the current selection
        const currentBrushStart = yearToPixel(selectionRange[0]);
        const currentBrushEnd = yearToPixel(selectionRange[1]);
        
        let indicatorY;
        
        // Edge behavior: align with current selection bounds when fully scrolled
        if (scrollPercentage === 0) {
            // Fully scrolled to top - align with top edge of current selection
            indicatorY = currentBrushStart;
        } else if (scrollPercentage === 1) {
            // Fully scrolled to bottom - align with bottom edge of current selection
            indicatorY = currentBrushEnd;
        } else {
            // Normal case: position at the exact year
            indicatorY = yearToPixel(topVisibleYear);
        }
        
        onIndicatorChange(indicatorY);
    }, [scrollInfo, onIndicatorChange]);

    return html`
        <div ref=${containerRef} style="width: 100%; height: 100%; position: relative;">
            <svg ref=${svgRef}></svg>
            <div class="selection-overlay"></div>
            <div class="top-handle"></div>
            <div class="bottom-handle"></div>
        </div>
    `;
};

export default EraScrollbar;