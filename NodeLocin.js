/*
📌 NodeLoc 签到（Loon 版，支持 TG 推送）
📅 2025-07-24
*/

const cookie = $persistentStore.read("NODELOC_COOKIE");
const csrf = $persistentStore.read("NODELOC_CSRF");

const TG_TOKEN = $persistentStore.read("TG_TOKEN");
const TG_CHATID = $persistentStore.read("TG_CHATID");
const TG_PROXY = $persistentStore.read("TG_PROXY"); // 可选

const request = {
  url: "https://nodeloc.cc/checkin",
  method: "POST",
  headers: {
    "cookie": cookie,
    "origin": "https://nodeloc.cc",
    "referer": "https://nodeloc.cc/latest",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "x-csrf-token": csrf,
    "x-requested-with": "XMLHttpRequest",
    "accept": "*/*"
  },
  body: ""
};

function sendTG(title, message) {
  if (!TG_TOKEN || !TG_CHATID) {
    console.log("❌ 未配置 TG_TOKEN 或 TG_CHATID");
    return;
  }

  const tgUrl = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  const tgBody = {
    chat_id: TG_CHATID,
    text: `📢 ${title}\n\n${message}`,
    parse_mode: "Markdown"
  };

  const tgOptions = {
    url: tgUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tgBody)
  };

  if (TG_PROXY) {
    tgOptions.proxy = TG_PROXY;
  }

  $httpClient.post(tgOptions, function (error, response, data) {
    if (error) {
      console.log("❌ TG 推送失败: " + error);
    } else {
      console.log("✅ TG 推送成功");
    }
  });
}

// 执行签到请求
$httpClient.post(request, function (error, response, data) {
  if (error) {
    const errMsg = "签到请求失败: " + error;
    sendTG("❌ NodeLoc 签到失败", errMsg);
    $notification.post("❌ NodeLoc 签到失败", "", errMsg);
    $done();
    return;
  }

  let msg = "";
  try {
    const json = JSON.parse(data);
    msg = json.message || "未知响应";
  } catch (e) {
    msg = data || "解析失败";
  }

  let title = "NodeLoc 签到";
  if (/成功/.test(msg)) title += " ✅";
  else if (/已经签到/.test(msg)) title += " ☑️ 已签";
  else title += " ❌";

  sendTG(title, msg);
  $notification.post(title, "", msg);
  $done();
});
