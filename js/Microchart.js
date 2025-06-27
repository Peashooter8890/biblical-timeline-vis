import { getRangeInfo, getEffectiveColumn } from './utils.js';

const { useEffect, useRef } = preactHooks;
const html = htm.bind(preact.h);

const Microchart = ({ data, selection }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !data.length || !selection) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const dimensions = { 
            width: containerRect.width, 
            height: containerRect.height 
        };

        const [startYear, endYear] = selection;

        const yScale = d3.scaleLinear()
            .domain([startYear, endYear])
            .range([0, dimensions.height]);

        const filteredData = data.filter(d => d.fields.startDate >= startYear && d.fields.startDate <= endYear);

        // Group events by era and calculate column distribution for each era
        const eventsByEra = {};
        const eraColumnCounts = {};
        
        filteredData.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color; // Using color as era identifier
            const effectiveColumn = getEffectiveColumn(d);
            
            if (!eventsByEra[era]) {
                eventsByEra[era] = [];
                eraColumnCounts[era] = 0;
            }
            
            eventsByEra[era].push(d);
            eraColumnCounts[era] = Math.max(eraColumnCounts[era], effectiveColumn);
        });

        const getColumnXForEra = (columnNum, maxColumnsInEra) => {
            // Distribute columns evenly across the full width based on era's max columns
            const columnWidth = dimensions.width / maxColumnsInEra;
            return (columnNum - 1) * columnWidth + (columnWidth / 2);
        };

        const events = [];
        
        Object.keys(eventsByEra).forEach(era => {
            const eraEvents = eventsByEra[era];
            const maxColumnsInEra = eraColumnCounts[era];
            
            eraEvents.forEach(d => {
                const rangeInfo = getRangeInfo(d.fields.startDate);
                const effectiveColumn = getEffectiveColumn(d);
                events.push({
                    ...d.fields,
                    color: rangeInfo.color,
                    columnX: getColumnXForEra(effectiveColumn, maxColumnsInEra)
                });
            });
        });

        const svg = d3.select(svgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible'); // Added to allow dots to overflow

        svg.selectAll('*').remove();

        const g = svg.append('g');

        // Create tooltip div
        const tooltip = d3.select(containerRef.current)
            .append('div')
            .attr('class', 'microchart-tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', 'white')
            .style('padding', '8px')
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('z-index', '1000')
            .style('max-width', '200px')
            .style('word-wrap', 'break-word');

        g.selectAll('.microchart-dot')
            .data(events)
            .enter()
            .append('circle')
            .attr('class', 'microchart-dot')
            .attr('cx', d => d.columnX)
            .attr('cy', d => yScale(d.startDate))
            .attr('r', 3)
            .attr('fill', d => d.color)
            .on('mouseover', function(event, d) {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                tooltip.html(d.title)
                    .style('left', (event.layerX + 10) + 'px')
                    .style('top', (event.layerY - 10) + 'px');
                
                // Highlight the dot
                d3.select(this)
                    .transition()
                    .duration(100)
                    .attr('r', 4)
                    .style('stroke', '#000')
                    .style('stroke-width', '1px');
            })
            .on('mouseout', function(event, d) {
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);
                
                // Reset the dot
                d3.select(this)
                    .transition()
                    .duration(100)
                    .attr('r', 3)
                    .style('stroke', '#fff')
                    .style('stroke-width', '1px');
            });

        // Cleanup function to remove tooltip when component unmounts or re-renders
        return () => {
            d3.select(containerRef.current).selectAll('.microchart-tooltip').remove();
        };

    }, [data, selection]);

    return html`
        <div ref=${containerRef} style="width: 100%; height: 100%; border-left: 1px solid #ccc; position: relative;">
            <svg ref=${svgRef}></svg>
        </div>
    `;
};

export default Microchart;
