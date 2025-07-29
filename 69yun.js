/**
 * 69云签到 + Telegram推送 + 自定义账号名 + 随机延迟 + 网络重试（Loon）
 */

const COOKIE_KEY = '69YUN_COOKIE';
const TG_BOT_TOKEN = $persistentStore.read('TG_TOKEN');
const TG_CHAT_ID = $persistentStore.read('TG_CHATID');

function randomDelay(maxSeconds = 120) {
  const ms = Math.floor(Math.random() * maxSeconds * 1000);
  console.log(`等待随机延迟 ${Math.floor(ms / 1000)} 秒`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpPostWithRetry(options, maxRetry = 3) {
  return new Promise((resolve) => {
    let attempt = 0;
    function tryRequest() {
      attempt++;
      $httpClient.post(options, (error, response, data) => {
        if (error) {
          console.log(`请求失败，第${attempt}次重试：${error}`);
          if (attempt < maxRetry) {
            setTimeout(tryRequest, 3000); // 3秒后重试
          } else {
            resolve({ error, response, data });
          }
        } else {
          resolve({ error, response, data });
        }
      });
    }
    tryRequest();
  });
}

async function signIn(cookie, name) {
  await randomDelay();

  const url = 'https://69yun69.com/user/checkin';
  const headers = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "zh-CN,zh;q=0.9",
    "content-length": "0",
    "origin": "https://69yun69.com",
    "priority": "u=1, i",
    "referer": "https://69yun69.com/user",
    "sec-ch-ua": `"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": `"macOS"`,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
    "cookie": cookie,
  };

  console.log(`${name} - 请求URL: ${url}`);
  console.log(`${name} - 请求头: ${JSON.stringify(headers, null, 2)}`);

  let { error, response, data } = await httpPostWithRetry({ url: url, headers: headers, body: '' }, 3);

  if (error) {
    console.log(`${name} - 请求异常: ${error}`);
    return `${name} - 请求异常: ${error}`;
  }

  console.log(`${name} - HTTP状态码: ${response.status}`);
  console.log(`${name} - 响应内容: ${data}`);

  try {
    let json = JSON.parse(data);
    if (json.ret === 1) {
      return `${name} - 签到成功: ${json.msg || ''}`;
    } else {
      if (/签到.*过了|已经签到|您似乎已经签到/.test(json.msg)) {
        return `${name} - 今日已签到，消息：${json.msg || ''}`;
      } else {
        return `${name} - 签到失败: ${json.msg || ''}`;
      }
    }
  } catch (e) {
    return `${name} - 解析响应失败: ${e.message}`;
  }
}

function escapeMarkdown(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function tgPush(message) {
  return new Promise((resolve) => {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
      console.log('未设置 TG_BOT_TOKEN 或 TG_CHAT_ID，跳过推送');
      resolve('未配置 Telegram 推送参数');
      return;
    }
    const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
    const body = {
      chat_id: TG_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    };
    $httpClient.post(
      {
        url: tgUrl,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      (error, response, data) => {
        if (error) {
          console.log('Telegram 推送失败: ' + error);
          resolve('Telegram 推送失败: ' + error);
        } else {
          resolve('Telegram 推送成功');
        }
      }
    );
  });
}

async function main() {
  let allCookies = $persistentStore.read(COOKIE_KEY);
  if (!allCookies) {
    $notification.post('69云签到', '', '未检测到环境变量 69YUN_COOKIE，请先设置');
    return $done();
  }

  let entries = allCookies.split('&').map(c => c.trim()).filter(c => c);
  let results = [];

  for (let entry of entries) {
    let splitIndex = entry.indexOf('@');
    let name = '未知账号';
    let cookie = '';
    if (splitIndex > 0) {
      name = entry.slice(0, splitIndex).trim();
      cookie = entry.slice(splitIndex + 1).trim();
    } else {
      cookie = entry;
    }
    let res = await signIn(cookie, name);
    results.push(res);
  }

  let summary = results.map(res => {
    const [name, rawMsg] = res.split(' - ');

    // 只取第一行，过滤 Emby 及账号信息
    let msg = rawMsg.split('\n')[0];
    // 去除所有 ... 和 \.\.\.
    msg = msg.replace(/(\\\.)+|\.{2,}/g, '');

    let formattedMsg = '';

    if (/签到成功/.test(msg)) {
      const trafficMatch = msg.match(/获得了\s+([\d.]+GB)/);
      const traffic = trafficMatch ? `*${trafficMatch[1]}*` : '未知流量';
      const cleanMsg = msg.replace(/获得了\s+[\d.]+GB/, `获得了 ${traffic}`);

      formattedMsg = `尊贵的「*${escapeMarkdown(name)}*」免费会员\n- ${escapeMarkdown(cleanMsg)}`;
    } else if (/已签到|签到.*过了|您似乎已经签到/.test(msg)) {
      formattedMsg = `尊贵的「*${escapeMarkdown(name)}*」免费会员\n- ⚠️ 今日已签到，消息：${escapeMarkdown(msg)}`;
    } else {
      formattedMsg = `尊贵的「*${escapeMarkdown(name)}*」免费会员\n- ❌ 签到失败: ${escapeMarkdown(msg)}`;
    }

    return formattedMsg;
  }).join('\n\n');

  let finalMsg = `*69云签到结果：*\n\n${summary}`;

  $notification.post('69云签到结果', '', summary);
  console.log('签到结果:\n' + summary);

  let tgResult = await tgPush(finalMsg);
  console.log(tgResult);

  $done();
}

main();
