// ==UserScript==
// @name         NodeSeek 多账号签到（带Loon通知）
// @compatible   loon
// @version      1.7
// @description  NodeSeek 多账号签到 + 网络重试 + TG推送 + Loon本地通知 + 模式选择 + 合并推送
// ==/UserScript==

const cookiesStr = $persistentStore.read("NODESEEK_COOKIE");
const tgToken = $persistentStore.read("TG_TOKEN");
const tgChatID = $persistentStore.read("TG_CHATID");
const tgproxy = $persistentStore.read("TG_PROXY") || "";

const defaultEnv = ($persistentStore.read("DEFAULT") || "").trim().toLowerCase();
const defaultMode = defaultEnv === "true"; // true 为随机模式
const signModeText = defaultMode ? "随机模式" : "固定模式";

if (!cookiesStr) {
  $notification.post("❌ NodeSeek 签到失败", "环境变量 NODESEEK_COOKIE 未配置", "");
  console.log("❌ 未配置 NODESEEK_COOKIE");
  $done();
}
if (!tgToken || !tgChatID) {
  $notification.post("❌ Telegram 推送失败", "TG_TOKEN 或 TG_CHATID 未配置", "");
  console.log("❌ 未配置 TG_TOKEN 或 TG_CHATID");
  $done();
}

const cookies = cookiesStr.split("&");
const baseUrl = "https://www.nodeseek.com/api/attendance";
const signUrl = baseUrl + "?random=" + (defaultMode ? "true" : "false");

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
let repeatCount = 0;
let failCount = 0;

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
      console.log(`请求 URL: ${signUrl}`);
      console.log(`请求 Headers（Cookie 已省略）: ${JSON.stringify({...headers, Cookie:"[隐藏]"})}`);

      $httpClient.post({ url: signUrl, headers, body: "" }, (err, resp, body) => {
        if (err || !body) {
          console.log(`❗ 第 ${attempt} 次请求失败，错误: ${err || "无响应"}`);
          if (attempt < 3) return resolve(attemptSign());
          const msg = `👤: ${name} 🚫，网络错误或无响应`;
          results.push(msg);
          failCount++;
          $notification.post("❌ NodeSeek 签到失败", `账号: ${name}`, "多次重试无响应");
          return resolve();
        }

        console.log(`【${name}】响应原始内容:\n${body}`);

        try {
          const json = JSON.parse(body);
          const msgRaw = json.message || json.Message || "未知消息";

          if (json.success === true) {
            const match = msgRaw.match(/(\d+)/);
            const amount = match ? match[1] : "未知";
            const msg = `👤: ${name} ✅ ，签到收益 ${amount}个🍗`;
            results.push(msg);
            successCount++;
            console.log(`✅ 签到成功，返回消息: ${msgRaw}`);
            $notification.post("✅ NodeSeek 签到成功", `账号: ${name}`, msgRaw);
          } else {
            const msg = `👤: ${name} ☑️，重复签到`;
            results.push(msg);
            repeatCount++;
            console.log(`☑️ 重复签到，返回消息: ${msgRaw}`);
            $notification.post("⚠️ NodeSeek 已签到", `账号: ${name}`, msgRaw);
          }
        } catch (e) {
          console.log(`❌ JSON解析失败: ${e.message}`);
          if (attempt < 3) return resolve(attemptSign());
          const msg = `👤: ${name} 🚫，返回解析异常`;
          results.push(msg);
          failCount++;
          $notification.post("❌ NodeSeek 解析异常", `账号: ${name}`, e.message || "JSON解析失败");
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

  console.log(`📤 正在推送 Telegram 消息...`);
  $httpClient.post(options, (err, resp, data) => {
    if (err) {
      console.log("❌ TG 推送失败: " + (typeof err === "string" ? err : JSON.stringify(err)));
      $notification.post("❌ TG 推送失败", "", String(err));
    } else {
      console.log("✅ TG 推送成功");
      $notification.post("✅ NodeSeek 签到完成", "TG 推送成功", `✅ ${successCount} ☑️ ${repeatCount} ｜🚫 ${failCount}`);
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
