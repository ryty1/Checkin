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
app.use(express.json()); // 解析 JSON 格式的请求体

// 获取本机账号，仅用于主页显示
const MAIN_SERVER_USER = process.env.USER || process.env.USERNAME || "default_user"; // 适配不同系统环境变量

io.on("connection", (socket) => {
    socket.on("saveAccount", async (accountData) => {
        const accounts = await getAccounts();
        accounts[accountData.user] = { user: accountData.user, group: "未分组", note: "无备注" };
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountsList", await getAccounts());
    });

    socket.on("deleteAccount", async (user) => {
        const accounts = await getAccounts();
        delete accounts[user];
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountsList", await getAccounts());
    });

    socket.on("modifyAccount", async ({ user, group, note }) => {
        const accounts = await getAccounts();
        if (accounts[user]) {
            if (group !== null) accounts[user].group = group;
            if (note !== null) accounts[user].note = note;
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        }
        socket.emit("accountsList", await getAccounts());
    });

    socket.on("loadAccounts", async () => {
        socket.emit("accountsList", await getAccounts());
    });
});

// 过滤无效节点，只保留 `vmess://` 和 `hysteria2://`
function filterNodes(nodes) {
    return nodes.filter(node => node.startsWith("vmess://") || node.startsWith("hysteria2://"));
}

// 获取节点汇总
async function getNodesSummary(socket) {
    const accounts = await getAccounts(true); // 排除本机账号
    const users = Object.keys(accounts); // 获取账号配置的顺序
    let successfulNodes = [];
    let failedAccounts = [];

    // 使用 for 循环逐个请求节点，确保顺序
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const nodeUrl = `https://${user}.serv00.net/node`;

        try {
            const nodeResponse = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = nodeResponse.data;
            const nodeLinks = filterNodes([
                ...(nodeData.match(/vmess:\/\/[^\s<>"]+/g) || []),
                ...(nodeData.match(/hysteria2:\/\/[^\s<>"]+/g) || [])
            ]);

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

    // 发送结果，保持顺序
    socket.emit("nodesSummary", { successfulNodes, failedAccounts });
}

// 获取 Telegram 设置
function getTelegramSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
}

// 更新 Telegram 设置
app.post("/setTelegramSettings", (req, res) => {
    const { telegramToken, telegramChatId } = req.body;
    if (!telegramToken || !telegramChatId) {
        return res.status(400).json({ message: "Telegram 配置不完整" });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ telegramToken, telegramChatId }, null, 2));
    res.json({ message: "Telegram 设置已更新" });
});

// 获取已保存的 Telegram 设置
app.get("/getTelegramSettings", (req, res) => {
    if (!fs.existsSync(SETTINGS_FILE)) {
        return res.json({ telegramToken: "", telegramChatId: "" });
    }
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    res.json(settings);
});

// 发送账号检测结果到 Telegram
async function sendCheckResultsToTG() {
    try {
        const settings = getTelegramSettings();
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
        let maxIndexLength = String(Object.keys(data).length).length; // 计算序号最大宽度

        // 获取账号列表，确保按照配置顺序排列
        const accounts = await getAccounts();  // 假设此方法返回配置的所有账号
        const users = Object.keys(accounts); // 获取账号顺序

        // 计算最长账号长度
        users.forEach(user => {
            maxUserLength = Math.max(maxUserLength, user.length);
        });

        // 生成格式化的账号检测信息，确保按照账号顺序处理
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const status = data[user] || "未知状态";  // 获取账号状态
            const maskedUser = `${escapeMarkdownV2(user)}`; 
            const paddedIndex = String(i + 1).padEnd(maxIndexLength, " "); // 序号对齐
            const paddedUser = maskedUser.padEnd(maxUserLength + 4, " "); // 账号对齐冒号
            results.push(`${paddedIndex}.${paddedUser}: ${escapeMarkdownV2(status)}`);
        }

        // 获取当前北京时间
        const now = new Date();
        const beijingTime = now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

        // 组合消息，使用 `pre` 确保对齐
        let message = `📢 账号检测结果：\n\`\`\`\n${results.join("\n")}\n\`\`\`\n⏰ 北京时间：${escapeMarkdownV2(beijingTime)}`;

        await bot.sendMessage(telegramChatId, message, { parse_mode: "MarkdownV2" });
    } catch (error) {
        console.error("发送 Telegram 失败:", error);
    }
}

// 处理 Telegram MarkdownV2 特殊字符
function escapeMarkdownV2(text) {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// 定时任务：每天早上 8:00 运行账号检测
cron.schedule("0 8 * * *", () => {
    console.log("⏰ 运行每日账号检测任务...");
    sendCheckResultsToTG();
});

// 主页
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 主页接口，单独获取本机账号（不会写入 `accounts.json`）
app.get("/getMainUser", (req, res) => {
    res.json({ mainUser: MAIN_SERVER_USER });
});

// 账号管理页面
app.get("/accounts", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "accounts.html"));
});

// 节点汇总页面
app.get("/nodes", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "nodes.html"));
});

// 跳转到指定用户的节点页面
app.get("/info", (req, res) => {
    const user = req.query.user;
    if (!user) return res.status(400).send("用户未指定");
    res.redirect(`https://${user}.serv00.net/info`);
});

// 账号检测页面
app.get("/checkAccountsPage", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "check_accounts.html"));
});

// 账号批量检测路由
app.get("/checkAccounts", async (req, res) => {
    try {
        const accounts = await getAccounts(false); // 获取所有账号
        const users = Object.keys(accounts);

        if (users.length === 0) {
            return res.json({ status: "success", results: {} });
        }

        let results = {};

        // 使用 Promise.all 保持顺序
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

        // 等待所有检测完成
        await Promise.all(promises);

        // 按照配置文件顺序返回结果
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

// 获取和保存 Telegram 设置
app.post("/setTelegramSettings", (req, res) => {
    const { telegramToken, telegramChatId } = req.body;
    if (!telegramToken || !telegramChatId) {
        return res.status(400).json({ message: "Telegram 配置不完整" });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ telegramToken, telegramChatId }, null, 2));
    res.json({ message: "Telegram 设置已更新" });
});

// Telegram 设置页面
app.get("/notificationSettings", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "notification_settings.html"));
});

server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});