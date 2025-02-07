const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const TelegramBot = require("node-telegram-bot-api");
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); 
const MAIN_SERVER_USER = process.env.USER || process.env.USERNAME || "default_user"; 

// 读取账户信息
async function getAccounts(excludeMainUser = true) {
    if (!fs.existsSync(ACCOUNTS_FILE)) return {};
    let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    if (excludeMainUser) {
        delete accounts[MAIN_SERVER_USER];
    }
    return accounts;
}

// 过滤节点
function filterNodes(nodes) {
    return nodes.filter(node => node.startsWith("vmess://") || node.startsWith("hysteria2://"));
}

// 获取节点汇总
async function getNodesSummary(socket) {
    const accounts = await getAccounts(true);
    const users = Object.keys(accounts); 
    let successfulNodes = [];
    let failedAccounts = [];
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const nodeUrl = `https://${user}.serv00.net/node`;
        try {
            const nodeResponse = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = nodeResponse.data;
            const nodeLinks = filterNodes([...(nodeData.match(/vmess:\/\/[^\s<>"]+/g) || []), ...(nodeData.match(/hysteria2:\/\/[^\s<>"]+/g) || [])]);
            if (nodeLinks.length > 0) {
                successfulNodes.push(...nodeLinks);
            } else {
                console.log(`Account ${user} connected but has no valid nodes.`);
                failedAccounts.push(user);
            }
        } catch (error) {
            console.log(`Failed to get node for ${user}: ${error.message}`);
            failedAccounts.push(user);
        }
    }
    socket.emit("nodesSummary", { successfulNodes, failedAccounts });
}

io.on("connection", (socket) => {
    console.log("Client connected");
    socket.on("startNodesSummary", () => {
        getNodesSummary(socket);
    });
    socket.on("saveAccount", async (accountData) => {
        const accounts = await getAccounts(false);
        accounts[accountData.user] = accountData;
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountSaved", { message: `账号 ${accountData.user} 已保存` });
        socket.emit("accountsList", await getAccounts(true));
    });
    socket.on("deleteAccount", async (user) => {
        const accounts = await getAccounts(false);
        delete accounts[user];
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountDeleted", { message: `账号 ${user} 已删除` });
        socket.emit("accountsList", await getAccounts(true));
    });
    socket.on("loadAccounts", async () => {
        socket.emit("accountsList", await getAccounts(true));
    });
});

// 读取 Telegram 设置
function getSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
}

app.post("/setTelegramSettings", (req, res) => {
    const { telegramToken, telegramChatId } = req.body;
    if (!telegramToken || !telegramChatId) {
        return res.status(400).json({ message: "Telegram 配置不完整" });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ telegramToken, telegramChatId }, null, 2));
    res.json({ message: "Telegram 设置已更新" });
});

app.get("/getTelegramSettings", (req, res) => {
    if (!fs.existsSync(SETTINGS_FILE)) {
        return res.json({ telegramToken: "", telegramChatId: "" });
    }
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    res.json(settings);
});

// 发送检测结果到 Telegram
async function sendCheckResultsToTG() {
    try {
        const settings = getSettings();
        if (!settings) {
            console.log("Telegram 设置不存在");
            return;
        }
        const { telegramToken, telegramChatId } = settings;
        const bot = new TelegramBot(telegramToken, { polling: false });
        const response = await axios.get(`https://${process.env.USER}.serv00.net/checkAccounts`);
        const data = response.data.results;
        if (!data || Object.keys(data).length === 0) {
            await bot.sendMessage(telegramChatId, "📋 账号检测结果：没有账号需要检测", { parse_mode: "MarkdownV2" });
            return;
        }
        let results = [];
        let maxUserLength = 0;
        let maxIndexLength = String(Object.keys(data).length).length; 
        const accounts = await getAccounts(); 
        const users = Object.keys(accounts);
        users.forEach(user => {
            maxUserLength = Math.max(maxUserLength, user.length);
        });
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const status = data[user] || "未知状态"; 
            const maskedUser = `${escapeMarkdownV2(user)}`; 
            const paddedIndex = String(i + 1).padEnd(maxIndexLength, " "); 
            const paddedUser = maskedUser.padEnd(maxUserLength + 4, " "); 
            results.push(`${paddedIndex}.${paddedUser}: ${escapeMarkdownV2(status)}`);
        }
        const now = new Date();
        const beijingTime = now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        let message = `📢 账号检测结果：\n\`\`\`\n${results.join("\n")}\n\`\`\`\n⏰ 北京时间：${escapeMarkdownV2(beijingTime)}`;
        await bot.sendMessage(telegramChatId, message, { parse_mode: "MarkdownV2" });
    } catch (error) {
        console.error("发送 Telegram 失败:", error);
    }
}

function escapeMarkdownV2(text) {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// 定时任务调度
function scheduleNotification() {
    const settings = getSettings();
    if (!settings) {
        return;
    }

    const { scheduleType, timeValue } = settings;

    if (scheduleType === "interval") {
        cron.schedule(`*/${timeValue} * * * *`, () => {
            console.log("⏰ 执行定时任务...");
            sendCheckResultsToTG();
        });
    } else if (scheduleType === "daily") {
        const [hour, minute] = timeValue.split(":").map(num => parseInt(num, 10));
        cron.schedule(`0 ${minute} ${hour} * * *`, () => {
            console.log("⏰ 执行定时任务...");
            sendCheckResultsToTG();
        });
    } else if (scheduleType === "weekly") {
        const [day, time] = timeValue.split("-");
        const [hour, minute] = time.split(":").map(num => parseInt(num, 10));
        cron.schedule(`0 ${minute} ${hour} * * ${day}`, () => {
            console.log("⏰ 执行定时任务...");
            sendCheckResultsToTG();
        });
    }
}

scheduleNotification();

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/getMainUser", (req, res) => {
    res.json({ mainUser: MAIN_SERVER_USER });
});

app.get("/accounts", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "accounts.html"));
});

app.get("/nodes", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "nodes.html"));
});

app.get("/info", (req, res) => {
    const user = req.query.user;
    if (!user) return res.status(400).send("用户未指定");
    res.redirect(`https://${user}.serv00.net/info`);
});

app.get("/checkAccountsPage", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "check_accounts.html"));
});

app.get("/checkAccounts", async (req, res) => {
    try {
        const accounts = await getAccounts(false); 
        const users = Object.keys(accounts);

        if (users.length === 0) {
            return res.json({ status: "success", results: {} });
        }
        let results = {};
        const promises = users.map(async (username) => {
            try {
                const apiUrl = `https://s00test.64t76dee9sk5.workers.dev/?username=${username}`;
                const response = await axios.get(apiUrl);
                const data = response.data;
                if (data.message) {
                    const parts = data.message.split("：");
                    results[username] = parts.length > 1 ? parts.pop() : data.message;
                } else {
                    results[username] = "未知状态";
                }
            } catch (error) {
                console.error(`账号 ${username} 检测失败:`, error.message);
                results[username] = "检测失败";
            }
        });
        await Promise.all(promises);
        const orderedResults = {};
        users.forEach(user => {
            orderedResults[user] = results[user] || "检测失败";
        });
        res.json({ status: "success", results: orderedResults });
    } catch (error) {
        console.error("批量账号检测错误:", error);
        res.status(500).json({ status: "error", message: "检测失败，请稍后再试" });
    }
});

// 设置通知的时间
app.post("/setNotificationSettings", (req, res) => {
    const { scheduleType, timeValue } = req.body;
    const settings = getSettings();
    if (!settings) {
        return res.status(400).json({ message: "设置文件丢失" });
    }

    // 更新通知设置
    settings.scheduleType = scheduleType;
    settings.timeValue = timeValue;

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    res.json({ message: "通知设置已更新" });
});

app.get("/getNotificationSettings", (req, res) => {
    const settings = getSettings();
    if (!settings) {
        return res.json({ scheduleType: "interval", timeValue: "" });
    }
    res.json({
        scheduleType: settings.scheduleType || "interval",
        timeValue: settings.timeValue || ""
    });
});
app.get("/notificationSettings", (req, res) => {
    const settings = getSettings();
    if (!settings) {
        return res.status(404).json({ message: "No notification settings found." });
    }
    res.json({
        scheduleType: settings.scheduleType || "interval",
        timeValue: settings.timeValue || ""
    });
});
server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
