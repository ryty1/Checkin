// ==UserScript==
// @name         NodeSeek 多账号签到（详细日志）
// @compatible   loon
// @version      1.7
// @description  NodeSeek 多账号签到 + 重试 + TG推送 + Loon通知 + 控制台详细日志
// ==/UserScript==

const cookiesStr = $persistentStore.read("NODESEEK_COOKIE");
const tgToken = $persistentStore.read("TG_TOKEN");
const tgChatID = $persistentStore.read("TG_CHATID");
const tgproxy = $persistentStore.read("TG_PROXY") || "";
const defaultEnv = ($persistentStore.read("DEFAULT") || "").trim().toLowerCase();
const defaultMode = defaultEnv === "true";
const signModeText = defaultMode ? "随机模式" : "固定模式";

if (!cookiesStr) {
  $notification.post("❌ NodeSeek 签到失败", "未配置 NODESEEK_COOKIE", "");
  console.log("❌ 未配置 NODESEEK_COOKIE");
  $done();
}
if (!tgToken || !tgChatID) {
  $notification.post("❌ Telegram 推送失败", "TG_TOKEN 或 TG_CHATID 未配置", "");
  console.log("❌ 未配置 TG_TOKEN 或 TG_CHATID");
  $done();
}

const cookies = cookiesStr.split("&");
const signUrl = "https://www.nodeseek.com/api/attendance";
const headersBase = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X)",
  "Referer": "https://www.nodeseek.com/board",
  "Origin": "https://www.nodeseek.com",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "Accept": "*/*"
};

let results = [];
let successCount = 0;
let repeatCount = 0;
let failCount = 0;

function safeLog(label, obj) {
  console.log(`📌 ${label}:\n${JSON.stringify(obj, null, 2)}\n`);
}

function signIn(index = 0) {
  if (index >= cookies.length) {
    sendTgPush();
    return;
  }

  const entry = cookies[index];
  const [name, cookie] = entry.includes("@") ? entry.split("@") : [`账号${index + 1}`, entry];
  const headers = { ...headersBase, Cookie: cookie.trim() };

  let attempt = 0;

  function attemptSign() {
    return new Promise((resolve) => {
      attempt++;
      console.log(`\n=== 📦 正在处理账号：${name} （尝试 ${attempt}/3） ===`);
      safeLog("请求 Headers（部分）", {
        ...headers,
        Cookie: "（已省略显示）"
      });

      $httpClient.post({ url: signUrl, headers, body: "{}" }, (err, resp, body) => {
        if (err || !body) {
          console.log(`❗ 第 ${attempt} 次请求失败，原因：${err || "无响应"}`);
          if (attempt < 3) return resolve(attemptSign());
          const msg = `👤: ${name} 🚫，网络错误`;
          results.push(msg);
          failCount++;
          console.log(msg);
          $notification.post("❌ NodeSeek 网络错误", name, "多次重试后仍失败");
          return resolve();
        }

        try {
          safeLog("响应内容", body);
          const json = typeof body === "string" ? JSON.parse(body) : body;
          const msgRaw = json.message || json.Message || "未知响应";

          if (json.success === true) {
            const match = msgRaw.match(/(\d+)/);
            const amount = match ? match[1] : "未知";
            const msg = `👤: ${name} ✅ ，签到收益 ${amount}个🍗`;
            results.push(msg);
            successCount++;
            console.log(`✅ 成功判断路径：success === true，msg="${msgRaw}"`);
            $notification.post("✅ NodeSeek 签到成功", name, msgRaw);
          } else {
            const msg = `👤: ${name} ☑️，重复签到`;
            results.push(msg);
            repeatCount++;
            console.log(`☑️ 重复判断路径：success === false，msg="${msgRaw}"`);
            $notification.post("⚠️ NodeSeek 已签到", name, msgRaw);
          }
        } catch (e) {
          console.log(`❌ JSON解析失败：${e.message}`);
          if (attempt < 3) return resolve(attemptSign());
          const msg = `👤: ${name} 🚫，响应解析失败`;
          results.push(msg);
          failCount++;
          $notification.post("❌ NodeSeek 异常", name, "响应内容非 JSON 或结构异常");
        }

        resolve();
      });
    });
  }

  attemptSign().then(() => signIn(index + 1));
}

function sendTgPush() {
  const text =
    `📋 *NodeSeek 签到结果*\n\n` +
    `✅ 成功 ${successCount} 个 ｜☑️ 已签 ${repeatCount} 个 ｜🚫 失败 ${failCount} 个\n` +
    `🛠 当前：${signModeText}\n\n` +
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

  if (tgproxy) options.opts = { policy: tgproxy };

  console.log(`📤 正在推送 TG...`);
  $httpClient.post(options, (err, resp, data) => {
    if (err) {
      console.log("❌ TG 推送失败：" + (typeof err === "string" ? err : JSON.stringify(err)));
      $notification.post("❌ TG 推送失败", "", String(err));
    } else {
      console.log("✅ TG 推送成功");
      $notification.post("✅ NodeSeek 签到完成", "TG 推送成功", `✅ ${successCount} ☑️ ${repeatCount} 🚫 ${failCount}`);
    }
    $done();
  });
}

// 延迟函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 启动流程
(async () => {
  const delay = Math.floor(Math.random() * 120000);
  console.log(`⏱ 延迟执行 ${Math.floor(delay / 1000)} 秒...`);
  await sleep(delay);
  signIn();
})();

