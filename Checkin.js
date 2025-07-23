// ==UserScript==
// @name         NodeSeek 多账号签到（带Loon通知）
// @compatible   loon
// @version      1.7
// @description  NodeSeek 多账号签到 + 网络重试 + TG推送 + Loon本地通知（每账号一次） + 模式选择
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

const defaultEnv = ($persistentStore.read("DEFAULT") || "").trim().toLowerCase();
const defaultMode = defaultEnv === "true";
const signModeText = defaultMode ? "随机模式" : "固定模式";

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
      $httpClient.post({ url: signUrl, headers, body: "{}" }, (err, resp, body) => {
        attempt++;

        if (err || !body || typeof body !== "string") {
          if (attempt < 3) return resolve(attemptSign());
          const msg = `👤:${name} ❌ 失败，网络错误或无响应`;
          results.push(msg);
          failCount++;
          $notification.post("❌ NodeSeek 签到失败", `账号: ${name}`, "网络错误或无响应");
          return resolve();
        }

        try {
          const json = JSON.parse(body);
          const msgRaw = json.message || json.Message || "未知消息";
          let msg = "";

          if (msgRaw.includes("签到收益")) {
            const match = msgRaw.match(/(\d+)/);
            const amount = match ? match[1] : "未知";
            msg = `👤:${name} ✅ 成功，签到收益 ${amount} 个🍗`;
            successCount++;
            $notification.post("✅ NodeSeek 签到成功", `账号: ${name}`, msgRaw);
          } else if (msgRaw.includes("重复") || msgRaw.includes("请勿重复")) {
            msg = `👤:${name} ❌ 失败，今天重复签到`;
            failCount++;
            $notification.post("⚠️ NodeSeek 签到提醒", `账号: ${name}`, msgRaw);
          } else {
            msg = `👤:${name} ❌ 失败，${msgRaw}`;
            failCount++;
            $notification.post("❌ NodeSeek 签到失败", `账号: ${name}`, msgRaw);
          }

          results.push(msg);
        } catch (e) {
          if (attempt < 3) return resolve(attemptSign());
          const msg = `👤:${name} ❌ 失败，返回解析异常`;
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
    `✅ 成功 ${successCount} 个 ｜❌ 失败 ${failCount} 个\n\n` +
    `🛠 当前模式：${signModeText}\n` +
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
      $notification.post("✅ NodeSeek 签到完成", "TG 推送成功", `✅ ${successCount} ｜❌ ${failCount}`);
    }
    $done();
  });
}

signIn();

