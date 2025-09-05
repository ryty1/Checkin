const fs = require('fs');
const path = require('path');
const cloudscraper = require('cloudscraper');

const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function writeLog(message) {
  const filePath = path.join(LOG_DIR, `${new Date().toLocaleDateString('sv-SE')}.log`);
  const time = new Date().toLocaleString('zh-CN', { hour12: false });
  fs.appendFileSync(filePath, `[${time}] ${message}\n`);
}

function chunkString(str, length = 1000) {
  const chunks = [];
  for (let i = 0; i < str.length; i += length) {
    chunks.push(str.slice(i, i + length));
  }
  return chunks;
}

async function signSingle(name, cookie, randomMode = false) {
  const url = `https://www.nodeseek.com/api/attendance?random=${randomMode ? 'true' : 'false'}`;
  const maskedCookie = cookie.length > 15
    ? cookie.slice(0, 8) + '...' + cookie.slice(-5)
    : cookie;

  const maxRetries = 3;
  let lastErrorResult = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    writeLog(`==== 开始签到: ${name} (第 ${attempt} 次尝试) ====`);
    writeLog(`请求 URL: ${url}`);
    writeLog(`使用 Cookie(部分隐藏): ${maskedCookie}`);
    writeLog(`随机模式: ${randomMode}`);

    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'cookie': cookie,
      'Content-Length': '0',
      'Origin': 'https://www.nodeseek.com',
      'Referer': 'https://www.nodeseek.com/board',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    };

    try {
      const res = await cloudscraper.post({
        uri: url,
        headers,
        resolveWithFullResponse: true,
        body: '',
        simple: false,
        json: false,
      });

      const text = res.body;
      writeLog(`响应正文长度: ${text.length}`);
      chunkString(text, 2000).forEach((chunk, i) => {
        writeLog(`响应正文第 ${i + 1} 段:\n${chunk}`);
      });

      try {
        const data = JSON.parse(text);
        const msgRaw = (data.message || '').toLowerCase();

        if (res.statusCode === 403) {
          const msg = `🚫 风控拦截`;
          writeLog(`${name} 签到结果: ${msg}`);
          return { name, result: msg, time: new Date().toLocaleString() };
        }

        if (data.success) {
          const amountMatch = data.message.match(/(\d+)/);
          const amount = amountMatch ? amountMatch[1] : '未知';
          const msg = `✅ 签到收益 ${amount} 个 🍗`;
          writeLog(`${name} 签到结果: ${msg}`);
          return { name, result: msg, time: new Date().toLocaleString() };
        } else if (msgRaw.includes('重复') || msgRaw.includes('already')) {
          const msg = `☑️ 已签到`;
          writeLog(`${name} 签到结果: ${msg}`);
          return { name, result: msg, time: new Date().toLocaleString() };
        } else {
          const msg = `🚫 签到失败：${data.message || '未知错误'}`;
          writeLog(`${name} 签到结果: ${msg}`);
          lastErrorResult = { name, result: msg, time: new Date().toLocaleString() };
        }
      } catch (jsonErr) {
        writeLog(`${name} 响应解析异常: ${jsonErr.stack || jsonErr.message}`);
        const msg = `🚫 响应解析失败，非 JSON 格式或登录失效`;
        writeLog(`${name} 签到结果: ${msg}`);
        lastErrorResult = { name, result: msg, time: new Date().toLocaleString() };
      }
    } catch (err) {
      writeLog(`${name} 请求异常: ${err.stack || err.message}`);
      const msg = `🚫 请求异常：${err.message}`;
      writeLog(`${name} 签到结果: ${msg}`);
      lastErrorResult = { name, result: msg, time: new Date().toLocaleString() };
    }

    if (attempt < maxRetries) {
      await new Promise(res => setTimeout(res, 500));
    }
  }

  return lastErrorResult || { name, result: '🚫 未知错误', time: new Date().toLocaleString() };
}

// 安全版 signAccounts
async function signAccounts(targets, userModes) {
  const results = {};
  for (const userId in targets) {
    results[userId] = [];
    const accounts = targets[userId];
    const mode = userModes[userId] || false;

    for (const [name, cookie] of Object.entries(accounts)) {
      try {
        const res = await signSingle(name, cookie, mode);
        results[userId].push(res);
      } catch (e) {
        results[userId].push({
          name,
          result: `🚫 签到异常: ${e.message}`,
          time: new Date().toLocaleString()
        });
        writeLog(`⚠️ 用户 ${userId} 账号 ${name} 签到异常: ${e.stack || e.message}`);
      }
    }
  }
  return results;
}

module.exports = { signSingle, signAccounts };

// ✅ CLI 入口：供 Python 调用
if (require.main === module) {
  (async () => {
    try {
      const payload = JSON.parse(process.argv[2]);
      const { targets, userModes } = payload;
      const results = await signAccounts(targets, userModes);
      console.log(JSON.stringify(results));
    } catch (err) {
      console.error("sign.js 运行出错:", err.message);
      process.exit(1);
    }
  })();
}
