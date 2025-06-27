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
            .attr('height', dimensions.height);

        svg.selectAll('*').remove();

        const g = svg.append('g');

        g.selectAll('.microchart-dot')
            .data(events)
            .enter()
            .append('circle')
            .attr('class', 'microchart-dot')
            .attr('cx', d => d.columnX)
            .attr('cy', d => yScale(d.startDate))
            .attr('r', 3)
            .attr('fill', d => d.color);

    }, [data, selection]);

    return html`
        <div ref=${containerRef} style="width: 100%; height: 100%; border-left: 1px solid #ccc;">
            <svg ref=${svgRef}></svg>
        </div>
    `;
};

export default Microchart;
