// ==UserScript==
// @name         NodeSeek 多账号签到（带Loon通知）
// @compatible   loon
// @version      1.5
// @description  NodeSeek 多账号签到 + 网络重试 + TG推送 + Loon本地通知 + 模式选择
// ==/UserScript==

// ------------ 环境变量说明 --------------
// NODESEEK_COOKIE=账号A@cookie1&账号B@cookie2&账号C@cookie3
// TG_TOKEN=123456789:ABCDEF_xxxxxxx
// TG_CHATID=123456789
// TG_PROXY=策略名（如需TG走代理）
// DEFAULT=true  # true=随机领取鸡腿，未设置=固定5个
// ---------------------------------------

const cookiesStr = $persistentStore.read("NODESEEK_COOKIE");
const tgToken = $persistentStore.read("TG_TOKEN");
const tgChatID = $persistentStore.read("TG_CHATID");
const tgproxy = $persistentStore.read("TG_PROXY") || "";

// 获取签到模式
const defaultEnv = ($persistentStore.read("DEFAULT") || "").trim().toLowerCase();
const defaultMode = defaultEnv === "true";
const signModeText = defaultMode ? "随机领取鸡腿" : "固定领取 5 个鸡腿";

if (!cookiesStr) {
  $notification.post("❌ NodeSeek 签到失败", "环境变量 NODESEEK_COOKIE 未配置", "");
  $done();
}
if (!tgToken || !tgChatID) {
  $notification.post("❌ Telegram 推送失败", "TG_TOKEN 或 TG_CHATID 未配置", "");
  $done();
}

const cookies = cookiesStr.split("&");
const signUrl = "https://www.nodeseek.com/api/attendance";
const headersBase = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Referer": "https://www.nodeseek.com/board",
  "Origin": "https://www.nodeseek.com",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "Accept": "*/*"
};

let results = [];
let successCount = 0;
let failCount = 0;

function retryRequest(attempt, max, fn) {
  return fn().catch(err => {
    if (attempt + 1 < max) return retryRequest(attempt + 1, max, fn);
    throw err;
  });
}

function signIn(index = 0) {
  if (index >= cookies.length) {
    sendTgPush();
    return;
  }

  const entry = cookies[index];
  const [name, cookie] = entry.includes("@") ? entry.split("@") : [`账号${index + 1}`, entry];
  const headers = { ...headersBase, Cookie: cookie.trim() };

  retryRequest(0, 3, () => {
    return new Promise((resolve, reject) => {
      $httpClient.post({ url: signUrl, headers, body: "{}" }, (err, resp, body) => {
        if (err) {
          results.push(`👤:${name} ❌ 失败，网络异常`);
          $notification.post("❌ NodeSeek 签到失败", `账号:${name}`, "网络错误");
          failCount++;
          return reject("网络错误");
        }

        try {
          const json = JSON.parse(body);
          const msg = json.message || json.Message || "未知消息";

          if (msg.includes("签到收益")) {
            const match = msg.match(/(\d+)/);
            const amount = match ? match[1] : (defaultMode ? "?" : "5"); // 默认 5 个
            results.push(`👤:${name} ✅ 成功，签到收益${amount} 个🍗`);
            $notification.post("✅ NodeSeek 签到成功", `账号:${name}`, msg);
            successCount++;
          } else if (msg.includes("重复") || msg.includes("请勿重复")) {
            results.push(`👤:${name} ❌ 失败，今天重复签到`);
            $notification.post("❌ NodeSeek 签到失败", `账号:${name}`, simplifiedMsg);
            failCount++;
          } else {
            results.push(`👤:${name} ❌ 失败，${msg}`);
            failCount++;
          }

          resolve();
        } catch (e) {
          results.push(`👤:${name} ❌ 失败，返回解析异常`);
          $notification.post("❌ NodeSeek 返回解析失败", `账号:${name}`, e.message || body);
          failCount++;
          reject("返回解析失败");
        }
      });
    });
  }).then(() => {
    signIn(index + 1);
  }).catch((err) => {
    results.push(`👤:${name} ❌ 失败，${err}`);
    $notification.post("NodeSeek 签到异常", `账号:${name}`, err);
    failCount++;
    signIn(index + 1);
  });
}

function sendTgPush() {
  const text =
    `📋 *NodeSeek 签到结果*\n\n` +
    `🛠 当前模式：${signModeText}\n` +
    `✅ 成功 ${successCount} 个 ｜❌ 失败 ${failCount} 个\n\n` +
    results.join("\n");

  const tgUrl = `https://api.telegram.org/bot${tgToken}/sendMessage`;
  const body = {
    chat_id: tgChatID,
    text,
    parse_mode: "Markdown"
  };

  const options = {
    url: tgUrl,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };

  if (tgproxy) {
    options.opts = { policy: tgproxy };
  }

  $httpClient.post(options, (err, resp, data) => {
    if (err) {
      $notification.post("❌ TG 推送失败", "", JSON.stringify(err));
    } else {
      $notification.post("✅ TG 推送成功", "", "");
    }
    $done();
  });
}

// 延迟函数（单位毫秒）
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 开始前随机延迟 0 ~ 120 秒
(async () => {
  const delay = Math.floor(Math.random() * 120000); // 0-120000 毫秒
  console.log(`⏱ 延迟执行 ${Math.floor(delay / 1000)} 秒...`);
  await sleep(delay);
  signIn();
})();
