const http = require('http');
const fs = require('fs');
const path = require('path');

// 配置
const API_URL = 'ztq.soweather.com';
const API_PORT = 8096;
const API_PATH = '/ztq_sh_jc/service.do';

// 站点配置 - 12个站点
const STATIONS = {
    '58367': { name: '徐家汇', id: '58367' },
    '58361': { name: '宝山', id: '58361' },
    '58362': { name: '闵行', id: '58362' },
    '58363': { name: '长江口', id: '58363' },
    '58365': { name: '嘉定', id: '58365' },
    '58366': { name: '崇明', id: '58366' },
    '58369': { name: '南汇', id: '58369' },
    '58370': { name: '浦东', id: '58370' },
    '58460': { name: '金山', id: '58460' },
    '58461': { name: '青浦', id: '58461' },
    '58462': { name: '松江', id: '58462' },
    '58463': { name: '奉贤', id: '58463' },
    '58474': { name: '小洋山', id: '58474' }
};

// 数据存储目录
const DATA_DIR = path.join(__dirname, 'weather_data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// 获取东八区时间字符串
function getBeijingTime() {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
    const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 获取当前日期的文件名（东八区）
function getDataFileName(stationId) {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return path.join(DATA_DIR, `weather_${stationId}_${dateStr}.csv`);
}

// 确保CSV文件存在并有表头
function ensureCSVFile(filePath) {
    if (!fs.existsSync(filePath)) {
        const header = 'timestamp,wind_speed,rainfall,humidity,wind_dir,ct,vaporpressuser,visibility,upt\n';
        fs.writeFileSync(filePath, header, 'utf8');
        console.log(`创建新文件: ${filePath}`);
    }
}

// 发送GET请求获取气象数据
function fetchWeatherData(stationId) {
    return new Promise((resolve, reject) => {
        const API_PARAMS = {
            "b": {
                "fycx_sstq": {
                    "stationid": stationId
                }
            }
        };
        
        const queryString = 'p=' + encodeURIComponent(JSON.stringify(API_PARAMS));
        const url = `${API_PATH}?${queryString}`;
        
        const options = {
            hostname: API_URL,
            port: API_PORT,
            path: url,
            method: 'GET',
            headers: {
                'User-Agent': 'Node.js Weather Collector'
            },
            timeout: 10000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error(`JSON解析错误: ${error.message}\n响应内容: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });

        req.end();
    });
}

// 保存数据到CSV
function saveDataToCSV(weatherData, stationId) {
    const filePath = getDataFileName(stationId);
    ensureCSVFile(filePath);

    if (weatherData.h && weatherData.h.is !== 0) {
        console.error(`[${STATIONS[stationId].name}] API错误: ${weatherData.h.error}`);
        return false;
    }

    if (!weatherData.b || !weatherData.b.fycx_sstq) {
        console.error(`[${STATIONS[stationId].name}] 数据格式错误:`, JSON.stringify(weatherData, null, 2));
        return false;
    }

    const data = weatherData.b.fycx_sstq;
    const timestamp = getBeijingTime();

    const row = [
        timestamp,
        data.wind_speed || '',
        data.rainfall || '',
        data.humidity || '',
        data.wind_dir || '',
        data.ct || '',
        data.vaporpressuser || '',
        data.visibility || '',
        data.upt || ''
    ].join(',') + '\n';

    fs.appendFileSync(filePath, row, 'utf8');
    console.log(`✓ [${STATIONS[stationId].name}] 数据已保存: ${timestamp}`);
    console.log(`  风速: ${data.wind_speed} m/s | 降雨: ${data.rainfall} mm | 湿度: ${data.humidity}%`);
    console.log(`  温度: ${data.ct}°C | 气压: ${data.vaporpressuser} hPa | 能见度: ${data.visibility} m`);
    
    return true;
}

// 执行数据采集（所有站点）
async function collectData() {
    console.log(`\n[${'='.repeat(60)}]`);
    console.log(`[${getBeijingTime()}] 开始采集数据...`);
    
    const stationIds = Object.keys(STATIONS);
    let successCount = 0;
    
    for (const stationId of stationIds) {
        try {
            console.log(`\n--- 采集 ${STATIONS[stationId].name} (${stationId}) ---`);
            const weatherData = await fetchWeatherData(stationId);
            if (saveDataToCSV(weatherData, stationId)) {
                successCount++;
            }
            // 每个请求之间延迟500ms，避免请求过快
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`✗ [${STATIONS[stationId].name}] 数据采集失败: ${error.message}`);
        }
    }
    
    console.log(`\n📊 采集完成: ${successCount}/${stationIds.length} 个站点成功`);
    console.log(`[${'='.repeat(60)}]\n`);
}

// 计算下一次执行时间
function getNextExecutionDelay() {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentSecond = now.getSeconds();
    
    const targetMinutes = [3, 8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 58];
    let nextMinute = targetMinutes.find(m => m > currentMinute);
    
    if (!nextMinute) {
        nextMinute = targetMinutes[0];
    }
    
    let minutesToWait;
    if (nextMinute > currentMinute) {
        minutesToWait = nextMinute - currentMinute;
    } else {
        minutesToWait = 60 - currentMinute + nextMinute;
    }
    
    const secondsToWait = minutesToWait * 60 - currentSecond;
    return secondsToWait * 1000;
}

// 调度任务
function scheduleNextExecution() {
    const delay = getNextExecutionDelay();
    const nextTimeUTC = new Date(Date.now() + delay);
    const nextTimeBeijing = new Date(nextTimeUTC.getTime() + (8 * 60 * 60 * 1000));
    
    const year = nextTimeBeijing.getUTCFullYear();
    const month = String(nextTimeBeijing.getUTCMonth() + 1).padStart(2, '0');
    const day = String(nextTimeBeijing.getUTCDate()).padStart(2, '0');
    const hours = String(nextTimeBeijing.getUTCHours()).padStart(2, '0');
    const minutes = String(nextTimeBeijing.getUTCMinutes()).padStart(2, '0');
    const seconds = String(nextTimeBeijing.getUTCSeconds()).padStart(2, '0');
    
    const nextTimeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    console.log(`⏰ 下一次执行时间: ${nextTimeStr} (${Math.round(delay / 1000)}秒后)`);
    
    setTimeout(() => {
        collectData();
        scheduleNextExecution();
    }, delay);
}

// 主函数
async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('          🌤️  上海气象数据采集系统启动  🌤️');
    console.log('='.repeat(70));
    console.log(`📁 数据存储目录: ${DATA_DIR}`);
    console.log(`🌐 API地址: http://${API_URL}:${API_PORT}${API_PATH}`);
    console.log(`📊 监测站点 (共${Object.keys(STATIONS).length}个):`);
    
    // 按照区域分组显示
    const groups = [
        ['58367', '58370', '58362', '58369'],  // 中心区域
        ['58361', '58365', '58366'],           // 北部
        ['58460', '58461', '58462', '58463'],  // 西南部
        ['58363', '58474']                      // 沿海
    ];
    
    const groupNames = ['中心区域', '北部区域', '西南部区域', '沿海区域'];
    
    groups.forEach((group, index) => {
        console.log(`   ${groupNames[index]}:`);
        group.forEach(id => {
            if (STATIONS[id]) {
                console.log(`     - ${STATIONS[id].name} (${id})`);
            }
        });
    });
    
    console.log(`⏱️  采集间隔: 每5分钟 (3、8、13、18、23、28、33、38、43、48、53、58分)`);
    console.log(`🕐 时区: 东八区 (UTC+8)`);
    console.log('='.repeat(70) + '\n');
    
    await collectData();
    scheduleNextExecution();
}

process.on('SIGINT', () => {
    console.log('\n\n收到退出信号，程序即将关闭...');
    console.log('再见！👋\n');
    process.exit(0);
});

main();
