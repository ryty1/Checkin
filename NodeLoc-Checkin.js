/*
📌 NodeLoc 签到脚本（Loon版，随机延时+网络重试+TG推送仅一次）
*/

const MAX_RETRY = 3;        // 最大重试次数
const RETRY_INTERVAL = 5000; // 重试间隔，单位毫秒（5秒）
const MAX_DELAY = 120;       // 最大随机延时，单位秒（2分钟）

function randomDelay(maxSeconds) {
  return Math.floor(Math.random() * maxSeconds * 1000);
}

const delayMs = randomDelay(MAX_DELAY);
console.log(`【NodeLoc 签到】延时 ${delayMs / 1000} 秒后开始执行`);

setTimeout(() => {
  main(MAX_RETRY);
}, delayMs);

function main(retryCount) {
  const cookie = $persistentStore.read("NODELOC_COOKIE");
  const csrf = $persistentStore.read("NODELOC_CSRF");

  console.log(`【NodeLoc 签到】开始，剩余重试次数：${retryCount}`);
  console.log("Cookie 长度: " + (cookie ? cookie.length : "无"));
  console.log("CSRF Token: " + (csrf || "无"));

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
      console.log("❌ 未配置 TG_TOKEN 或 TG_CHATID，跳过推送");
      return;
    }
    console.log("开始发送 Telegram 消息");

    const tgUrl = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
    const tgBody = {
      chat_id: TG_CHATID,
      text: message,
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
      console.log("使用代理发送 TG 消息：" + TG_PROXY);
    }

    $httpClient.post(tgOptions, (err, resp, data) => {
      if (err) {
        console.log("🆖 TG 推送失败：" + err);
      } else {
        console.log("✅ TG 推送成功");
      }
    });
  }

  $httpClient.post(request, (error, response, data) => {
    if (error) {
      console.log("🆖 签到请求失败：" + error);
      if (retryCount > 0) {
        console.log(`等待 ${RETRY_INTERVAL / 1000} 秒后重试...`);
        setTimeout(() => {
          main(retryCount - 1);
        }, RETRY_INTERVAL);
      } else {
        // 重试用尽，推送失败消息
        const failMsg = "⚠️ 请检查网络是否异常，重试已达最大次数";
        const title = "📢 NodeLoc 签到结果\n———————————————————\n🆖 签到失败";
        const msg = `${title}\n${failMsg}`;
        sendTG("🆖 NodeLoc 签到失败", msg);
        $notification.post("🆖 NodeLoc 签到失败", "", failMsg);
        $done();
      }
      return;
    }

    console.log("签到接口返回：" + data);

    let msg = "";
    let title = "📢 NodeLoc 签到结果\n———————————————————\n";

    try {
      const json = JSON.parse(data);
      msg = json.message || data || "无返回信息";

      if (/已经签到/.test(msg)) {
        title += "☑️ 已签到";
        msg = "🗓️ 今天你已经领取过 10 个能量值了~";
      } else if (/成功/.test(msg)) {
        title += "✅ 签到成功";
        const energy = msg.match(/(\d+)\s*个能量/)?.[1] || "10";
        msg = `🗓️ 获得 ${energy} ⚡能量`;
      } else {
        title += "🆖 签到失败";
        msg = "⚠️ 请检查网络是否异常";
      }
    } catch (e) {
      console.log("⚠️ 解析签到返回异常：" + e);
      title += "🆖 签到失败";
      msg = "⚠️ 数据解析异常";
    }

    const fullMsg = `${title}\n${msg}`;
    sendTG("NodeLoc 签到结果", fullMsg);
    $notification.post("NodeLoc 签到结果", "", fullMsg);
    console.log("签到完成，通知发送");
    $done();
  });
}
