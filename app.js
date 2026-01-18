
let currentChart = null;
let weatherData = null;

// 自定义 tooltip
const getOrCreateTooltip = (chart) => {
    let tooltipEl = chart.canvas.parentNode.querySelector('div.chartjs-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'chartjs-tooltip';
        tooltipEl.style.cssText = 'background:rgba(0,0,0,0.8);border-radius:3px;color:white;opacity:1;pointer-events:none;position:absolute;transform:translate(-50%,0);transition:all .1s ease;padding:8px;font-size:12px;min-width:120px;max-width:200px;z-index:1000';
        
        const table = document.createElement('table');
        table.style.margin = '0px';
        table.style.width = '100%';
        tooltipEl.appendChild(table);
        chart.canvas.parentNode.appendChild(tooltipEl);
    }
    return tooltipEl;
};

const externalTooltipHandler = (context) => {
    const {chart, tooltip} = context;
    const tooltipEl = getOrCreateTooltip(chart);

    if (tooltip.opacity === 0) {
        tooltipEl.style.opacity = 0;
        return;
    }

    if (tooltip.body) {
        const titleLines = tooltip.title || [];
        const dataPoints = tooltip.dataPoints.map(item => ({
            label: item.dataset.label,
            value: item.parsed.y,
            color: item.dataset.borderColor
        })).sort((a, b) => {
            if (a.value === null) return 1;
            if (b.value === null) return -1;
            return b.value - a.value;
        });

        const tableHead = document.createElement('thead');
        titleLines.forEach(title => {
            const tr = document.createElement('tr');
            tr.style.borderWidth = 0;
            const th = document.createElement('th');
            th.style.cssText = 'border-width:0;padding-bottom:4px;text-align:left';
            th.appendChild(document.createTextNode(title));
            tr.appendChild(th);
            tableHead.appendChild(tr);
        });

        const tableBody = document.createElement('tbody');
        dataPoints.forEach(point => {
            const tr = document.createElement('tr');
            tr.style.cssText = 'background-color:inherit;border-width:0';
            const td = document.createElement('td');
            td.style.cssText = 'border-width:0;padding-top:2px;padding-bottom:2px;white-space:nowrap';

            const colorBox = document.createElement('span');
            colorBox.style.cssText = `background:${point.color};border:2px solid ${point.color};margin-right:6px;height:10px;width:10px;display:inline-block`;
            
            const text = document.createTextNode(
                point.label + ': ' + 
                (point.value !== null && point.value !== undefined ? point.value.toFixed(1) : '--')
            );

            td.appendChild(colorBox);
            td.appendChild(text);
            tr.appendChild(td);
            tableBody.appendChild(tr);
        });

        const tableRoot = tooltipEl.querySelector('table');
        while (tableRoot.firstChild) {
            tableRoot.firstChild.remove();
        }
        tableRoot.appendChild(tableHead);
        tableRoot.appendChild(tableBody);
    }

    const {offsetLeft: positionX, offsetTop: positionY} = chart.canvas;
    tooltipEl.style.opacity = 1;
    
    const tooltipWidth = tooltipEl.offsetWidth;
    const chartWidth = chart.width;
    let leftPos = positionX + tooltip.caretX;
    
    if (tooltip.caretX + tooltipWidth / 2 > chartWidth) {
        tooltipEl.style.transform = 'translate(-100%, 0)';
    } else if (tooltip.caretX - tooltipWidth / 2 < 0) {
        tooltipEl.style.transform = 'translate(0, 0)';
    } else {
        tooltipEl.style.transform = 'translate(-50%, 0)';
    }
    
    tooltipEl.style.left = leftPos + 'px';
    tooltipEl.style.top = positionY + tooltip.caretY + 'px';
};

// 加载数据
async function loadData() {
    try {
        const response = await fetch('data/weather_data.json?t=' + Date.now());
        if (!response.ok) throw new Error('数据加载失败');
        
        weatherData = await response.json();
        document.getElementById('updateTime').textContent = 
            `最后更新: ${weatherData.update_time}`;
        
        renderStats();
        switchChart('pressure');
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('error-container').innerHTML = 
            `<div class="error">数据加载失败: ${error.message}</div>`;
    }
}

// 渲染统计卡片
function renderStats() {
    const container = document.getElementById('stats-container');
    let html = '';
    
    Object.entries(weatherData.stations).forEach(([stationId, info]) => {
        const data = weatherData.data[stationId] || [];
        if (data.length === 0) {
            html += `<div class="station-card">
                <h3 style="border-color:${info.color}">${info.name}</h3>
                <p style="text-align:center;color:#999;font-size:12px">暂无数据</p>
            </div>`;
            return;
        }
        
        const latest = data[data.length - 1];
        html += `<div class="station-card">
            <h3 style="border-color:${info.color}">${info.name}</h3>
            <div class="stat-row">
                <span class="stat-label">温度</span>
                <span class="stat-value">${latest.temperature?.toFixed(1) || '--'} °C</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">湿度</span>
                <span class="stat-value">${latest.humidity?.toFixed(0) || '--'} %</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">气压</span>
                <span class="stat-value">${latest.pressure?.toFixed(1) || '--'} hPa</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">风速</span>
                <span class="stat-value">${latest.wind_speed?.toFixed(1) || '--'} m/s</span>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

// 切换图表
function switchChart(type) {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    const fieldMap = {
        'pressure': { field: 'pressure', label: '气压 (hPa)' },
        'temperature': { field: 'temperature', label: '温度 (°C)' },
        'humidity': { field: 'humidity', label: '湿度 (%)' },
        'wind': { field: 'wind_speed', label: '风速 (m/s)' },
        'rainfall': { field: 'rainfall', label: '降雨量 (mm)' },
        'visibility': { field: 'visibility', label: '能见度 (m)' }
    };
    
    const config = fieldMap[type];
    renderChart(config.field, config.label);
}

// 渲染图表
function renderChart(field, label) {
    if (currentChart) {
        currentChart.destroy();
    }
    
    const datasets = [];
    Object.entries(weatherData.stations).forEach(([stationId, info]) => {
        const data = weatherData.data[stationId] || [];
        if (data.length === 0) return;
        
        datasets.push({
            label: info.name,
            data: data.map(d => ({
                x: d.timestamp,
                y: d[field]
            })),
            borderColor: info.color,
            backgroundColor: info.color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
            tension: 0.4,
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4
        });
    });
    
    const ctx = document.getElementById('mainChart').getContext('2d');
    currentChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 8,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    enabled: false,
                    external: externalTooltipHandler
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'HH:mm'
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: label
                    }
                }
            }
        }
    });
}

// 初始化
window.addEventListener('load', loadData);
setInterval(loadData, 5 * 60 * 1000); // 每5分钟刷新
