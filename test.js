/*
📌 NodeLoc 签到 + 获取等级经验脚本（Loon版）
*/

const MAX_RETRY = 3;
const RETRY_INTERVAL = 5000; 
const MAX_DELAY = 120;

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
  const username = $persistentStore.read("NODELOC_USERNAME"); // 需要自己存储用户名

  console.log(`【NodeLoc 签到】开始，剩余重试次数：${retryCount}`);
  console.log("Cookie 长度: " + (cookie ? cookie.length : "无"));
  console.log("CSRF Token: " + (csrf || "无"));
  console.log("用户名: " + (username || "无"));

  const TG_TOKEN = $persistentStore.read("TG_TOKEN");
  const TG_CHATID = $persistentStore.read("TG_CHATID");
  const TG_PROXY = $persistentStore.read("TG_PROXY");

  const checkinRequest = {
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
        console.log("❌ TG 推送失败：" + err);
      } else {
        console.log("✅ TG 推送成功");
      }
    });
  }

  // 第一步，签到
  $httpClient.post(checkinRequest, (error, response, data) => {
    if (error) {
      console.log("签到请求失败：" + error);
      if (retryCount > 0) {
        console.log(`等待 ${RETRY_INTERVAL / 1000} 秒后重试...`);
        setTimeout(() => {
          main(retryCount - 1);
        }, RETRY_INTERVAL);
      } else {
        const failMsg = "请检查网络是否异常，重试已达最大次数";
        const title = "📢 NodeLoc 签到结果\n———————————————————\n签到失败";
        const msg = `${title}\n${failMsg}`;
        sendTG("NodeLoc 签到失败", msg);
        $notification.post("❌ NodeLoc 签到失败", "", failMsg);
        $done();
      }
      return;
    }

    console.log("签到接口返回：" + data);

    let checkinMsg = "";
    let checkinTitle = "📢 NodeLoc 签到结果\n———————————————————\n";

    try {
      const json = JSON.parse(data);
      checkinMsg = json.message || data || "无返回信息";

      if (/已经签到/.test(checkinMsg)) {
        checkinTitle += "☑️ 已签到";
        checkinMsg = "🗓️ 今天你已经领取过 10 个能量值了~";
      } else if (/成功/.test(checkinMsg)) {
        checkinTitle += "✅ 签到成功";
        const energy = checkinMsg.match(/(\d+)\s*个能量/)?.[1] || "10";
        checkinMsg = `🗓️ 获得 ${energy} ⚡能量`;
      } else {
        checkinTitle += "签到失败";
        checkinMsg = "请检查网络是否异常";
      }
    } catch (e) {
      console.log("解析签到返回异常：" + e);
      checkinTitle += "签到失败";
      checkinMsg = "数据解析异常";
    }

    // 第二步，获取升级进度
    if (!username) {
      const fullMsg = `${checkinTitle}\n${checkinMsg}\n⚠️ 未配置用户名，无法获取等级经验`;
      sendTG("NodeLoc 签到结果", fullMsg);
      $notification.post("NodeLoc 签到结果", "", fullMsg);
      $done();
      return;
    }

    const upgradeUrl = `https://nodeloc.cc/u/${username}/upgrade-progress.json`;
    const upgradeRequest = {
      url: upgradeUrl,
      method: "GET",
      headers: {
        "cookie": cookie,
        "origin": "https://nodeloc.cc",
        "referer": `https://nodeloc.cc/u/${username}`,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "x-csrf-token": csrf,
        "x-requested-with": "XMLHttpRequest",
        "accept": "application/json, text/javascript, */*; q=0.01"
      }
    };

    $httpClient.get(upgradeRequest, (err, resp, body) => {
      if (err) {
        console.log("获取等级经验失败：" + err);
        const fullMsg = `${checkinTitle}\n${checkinMsg}\n⚠️ 获取等级经验失败`;
        sendTG("NodeLoc 签到结果", fullMsg);
        $notification.post("NodeLoc 签到结果", "", fullMsg);
        $done();
        return;
      }

      console.log("等级经验接口返回：" + body);

      try {
        const json = JSON.parse(body);
        // 假设返回字段为level, current_exp, next_level_exp
        const level = json.level ?? "未知";
        const curExp = json.current_exp ?? "未知";
        const nextExp = json.next_level_exp ?? "未知";
        const percent = json.percent_complete ?? null;

        let expMsg = `等级: ${level}\n经验: ${curExp} / ${nextExp}`;
        if (percent !== null) {
          expMsg += ` (${percent}%)`;
        }

        const fullMsg = `${checkinTitle}\n${checkinMsg}\n\n${expMsg}`;

        sendTG("NodeLoc 签到结果", fullMsg);
        $notification.post("NodeLoc 签到结果", "", fullMsg);
      } catch (e) {
        console.log("解析等级经验返回异常：" + e);
        const fullMsg = `${checkinTitle}\n${checkinMsg}\n⚠️ 解析等级经验失败`;
        sendTG("NodeLoc 签到结果", fullMsg);
        $notification.post("NodeLoc 签到结果", "", fullMsg);
      }

      $done();
    });
  });
}
