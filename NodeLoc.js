/*
📌 NodeLoc 签到脚本（带 Telegram 推送）
📅 2025-07-24
*/

const cookie = $persistentStore.read("NODELOC_COOKIE");
const csrf = $persistentStore.read("NODELOC_CSRF");

const TG_TOKEN = $persistentStore.read("TG_TOKEN");
const TG_CHATID = $persistentStore.read("TG_CHATID");
const TG_PROXY = $persistentStore.read("TG_PROXY");

const url = "https://nodeloc.cc/checkin";

const headers = {
  "cookie": cookie,
  "origin": "https://nodeloc.cc",
  "referer": "https://nodeloc.cc/latest",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "x-csrf-token": csrf,
  "x-requested-with": "XMLHttpRequest",
  "accept": "*/*",
  "content-length": "0"
};

const request = {
  url: url,
  method: "POST",
  headers: headers,
  body: ""
};

function sendTG(title, message) {
  if (!TG_TOKEN || !TG_CHATID) {
    console.log("❌ 未配置 TG_TOKEN 或 TG_CHATID");
    return;
  }

  const tgUrl = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  const body = {
    chat_id: TG_CHATID,
    text: `📢 *${title}*\n\n${message}`,
    parse_mode: "Markdown"
  };

  const tgOptions = {
    url: tgUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };

  if (TG_PROXY) {
    tgOptions["proxy"] = TG_PROXY;
  }

  $task.fetch(tgOptions).then(() => {
    console.log("✅ TG 推送成功");
  }).catch((err) => {
    console.log("❌ TG 推送失败: " + err);
  });
}

$task.fetch(request).then((response) => {
  const body = response.body;
  let msg = "";
  try {
    const json = JSON.parse(body);
    msg = json.message || "未知响应";
  } catch (e) {
    msg = body || "解析失败";
  }

  let title = "NodeLoc 签到";
  if (/成功/.test(msg)) title += " ✅";
  else if (/已经签到/.test(msg)) title += " ☑️ 已签";
  else title += " ❌";

  sendTG(title, msg);
  $notification.post(title, "", msg);
  $done();
}, (err) => {
  sendTG("❌ NodeLoc 签到失败", err);
  $notification.post("❌ NodeLoc 签到失败", "", err);
  $done();
});
