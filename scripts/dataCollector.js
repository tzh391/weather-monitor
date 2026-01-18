const http = require('http');
const fs = require('fs');
const path = require('path');

// 配置
const API_URL = 'ztq.soweather.com';
const API_PORT = 8096;
const API_PATH = '/ztq_sh_jc/service.do';

// 站点配置 - 13个站点
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

// 数据存储目录 - 相对于项目根目录
const DATA_DIR = path.join(process.cwd(), 'weather_data');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📁 创建数据目录: ${DATA_DIR}`);
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
        console.log(`📄 创建新文件: ${path.basename(filePath)}`);
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
                'User-Agent': 'GitHub Actions Weather Collector'
            },
            timeout: 15000  // 增加超时时间
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
                    reject(new Error(`JSON解析错误: ${error.message}`));
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
        console.error(`❌ [${STATIONS[stationId].name}] API错误: ${weatherData.h.error}`);
        return false;
    }

    if (!weatherData.b || !weatherData.b.fycx_sstq) {
        console.error(`❌ [${STATIONS[stationId].name}] 数据格式错误`);
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
    console.log(`✅ [${STATIONS[stationId].name}] ${timestamp}`);
    console.log(`   🌡️  ${data.ct}°C | 💧 ${data.humidity}% | 🌬️  ${data.wind_speed} m/s | 🌧️  ${data.rainfall} mm`);
    
    return true;
}

// 执行数据采集（所有站点）
async function collectData() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🌤️  上海气象数据采集 - ${getBeijingTime()}`);
    console.log(`${'='.repeat(70)}\n`);
    
    const stationIds = Object.keys(STATIONS);
    let successCount = 0;
    let failedStations = [];
    
    for (const stationId of stationIds) {
        try {
            const weatherData = await fetchWeatherData(stationId);
            if (saveDataToCSV(weatherData, stationId)) {
                successCount++;
            } else {
                failedStations.push(STATIONS[stationId].name);
            }
            // 每个请求之间延迟800ms，避免请求过快
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (error) {
            console.error(`❌ [${STATIONS[stationId].name}] ${error.message}`);
            failedStations.push(STATIONS[stationId].name);
        }
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 采集结果: ${successCount}/${stationIds.length} 个站点成功`);
    if (failedStations.length > 0) {
        console.log(`⚠️  失败站点: ${failedStations.join(', ')}`);
    }
    console.log(`📁 数据保存于: ${DATA_DIR}`);
    console.log(`${'='.repeat(70)}\n`);
    
    // 返回状态码
    return successCount > 0 ? 0 : 1;
}

// 主函数
async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('          🌤️  上海气象数据采集系统  🌤️');
    console.log('='.repeat(70));
    console.log(`📁 数据目录: ${DATA_DIR}`);
    console.log(`🌐 API: http://${API_URL}:${API_PORT}${API_PATH}`);
    console.log(`📊 监测站点: ${Object.keys(STATIONS).length}个`);
    console.log(`🕐 时区: 东八区 (UTC+8)`);
    console.log('='.repeat(70) + '\n');
    
    try {
        const exitCode = await collectData();
        process.exit(exitCode);
    } catch (error) {
        console.error('❌ 程序执行错误:', error);
        process.exit(1);
    }
}

// 只在直接运行时执行（不是被 require 时）
if (require.main === module) {
    main();
}

module.exports = { collectData, STATIONS, DATA_DIR };
