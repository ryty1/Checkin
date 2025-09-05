const fs = require('fs');
const path = require('path');
const cloudscraper = require('cloudscraper');
const tough = require('tough-cookie');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function writeLog(message) {
  // 北京时间
  const now = dayjs().tz("Asia/Shanghai");
  const filePath = path.join(LOG_DIR, `${now.format("YYYY-MM-DD")}.log`);
  const time = now.format("YYYY-MM-DD HH:mm:ss");
  fs.appendFileSync(filePath, `[${time}] ${message}\n`);
}

function chunkString(str, length = 1000) {
  const chunks = [];
  for (let i = 0; i < str.length; i += length) {
    chunks.push(str.slice(i, i + length));
  }
  return chunks;
}

// 统一 headers
function buildHeaders(cookie) {
  return {
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cookie': cookie,
    'Origin': 'https://www.nodeseek.com',
    'Referer': 'https://www.nodeseek.com/board',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  };
}

async function fetchCreditPage(page, cookie, jar) {
  const url = `https://www.nodeseek.com/api/account/credit/page-${page}`;
  try {
    const res = await cloudscraper.get({
      uri: url,
      headers: buildHeaders(cookie),
      resolveWithFullResponse: true,
      simple: false,
      json: false,
      jar,
    });

    const text = res.body;
    chunkString(text, 2000).forEach((chunk, i) => {
      writeLog(`信用记录第 ${page} 页 - 响应正文第 ${i + 1} 段:\n${chunk}`);
    });

    try {
      return JSON.parse(text);
    } catch (e) {
      writeLog(`⚠️ 信用记录解析异常: ${e.message}`);
      return null;
    }
  } catch (err) {
    writeLog(`⚠️ 请求信用记录异常: ${err.message}`);
    return null;
  }
}

async function getSigninStats(name, cookie, days = 30) {
  const maskedCookie = cookie.length > 15
    ? cookie.slice(0, 8) + '...' + cookie.slice(-5)
    : cookie;

  writeLog(`==== 开始统计收益: ${name}, Cookie(部分隐藏): ${maskedCookie}, 天数: ${days} ====`);
  const cutoff = dayjs().tz("Asia/Shanghai").subtract(days, 'day').toDate();

  const jar = new tough.CookieJar();

  try {
    await cloudscraper.get({
      uri: 'https://www.nodeseek.com/board',
      headers: buildHeaders(cookie),
      jar,
      simple: false
    });
    writeLog(`✅ ${name} 访问 /board 成功，尝试获取信用记录`);
  } catch (e) {
    writeLog(`⚠️ ${name} 访问 /board 失败: ${e.message}`);
  }

  let allRecords = [];
  for (let page = 1; page <= 20; page++) {
    const data = await fetchCreditPage(page, cookie, jar);
    if (!data || !data.success || !data.data) break;

    const records = data.data;
    if (!records.length) break;

    for (const record of records) {
      const [amount, balance, description, timestamp] = record;
      const recordTime = dayjs(timestamp).tz("Asia/Shanghai").toDate();
      if (recordTime >= cutoff) {
        allRecords.push({ amount, balance, description, time: recordTime });
      }
    }

    const lastTime = dayjs(records[records.length - 1][3]).tz("Asia/Shanghai").toDate();
    if (lastTime < cutoff) break;
  }

  const signinRecords = allRecords.filter(r =>
    r.description.includes("签到收益") && r.description.includes("鸡腿")
  );

  if (!signinRecords.length) {
    return {
      name,
      result: `⚠️ 近 ${days} 天没有签到记录`,
      stats: { total_amount: 0, average: 0, days_count: 0, records: [] }
    };
  }

  const totalAmount = signinRecords.reduce((sum, r) => sum + r.amount, 0);
  const daysCount = signinRecords.length;
  const average = (totalAmount / daysCount).toFixed(2);

  return {
    name,
    result: "✅ 查询成功",
    stats: {
      total_amount: totalAmount,
      average,
      days_count: daysCount,
      records: signinRecords.map(r => ({
        amount: r.amount,
        date: dayjs(r.time).tz("Asia/Shanghai").format("YYYY-MM-DD"),
        description: r.description
      }))
    }
  };
}

async function statsAccounts(targets, days = 30) {
  const results = {};
  for (const userId in targets) {
    results[userId] = [];
    const accounts = targets[userId];
    for (const [name, cookie] of Object.entries(accounts)) {
      try {
        const res = await getSigninStats(name, cookie, days);
        results[userId].push(res);
      } catch (e) {
        results[userId].push({ name, result: `🚫 查询异常: ${e.message}` });
        writeLog(`⚠️ 用户 ${userId} 账号 ${name} 统计异常: ${e.stack || e.message}`);
      }
    }
  }
  return results;
}

module.exports = { statsAccounts };

// CLI 入口
if (require.main === module) {
  (async () => {
    try {
      const payload = JSON.parse(process.argv[2]);
      const { targets, days } = payload;
      const results = await statsAccounts(targets, days || 30);
      console.log(JSON.stringify(results));
    } catch (err) {
      console.error("stats.js 运行出错:", err.message);
      process.exit(1);
    }
  })();
}
