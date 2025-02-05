const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");

// 获取本机账号，仅用于主页显示
const MAIN_SERVER_USER = process.env.USER ? process.env.USER.toLowerCase() : "default_user";

// 获取所有账号（不包含本机账号）
async function getAccounts(excludeMainUser = true) {
    if (!fs.existsSync(ACCOUNTS_FILE)) return {};
    let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    if (excludeMainUser) {
        delete accounts[MAIN_SERVER_USER]; // 账号管理和节点汇总排除本机账号
    }
    return accounts;
}

// 获取 Telegram 设置
function getTelegramSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
}

// 更新 Telegram 设置
async function updateTelegramSettings(token, chatId) {
    const settings = { telegramToken: token, telegramChatId: chatId };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

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
        const response = await axios.get("http://localhost:3000/checkAccounts"); // 本地 API 调用
        const data = response.data.results;

        if (!data || Object.keys(data).length === 0) {
            await bot.sendMessage(telegramChatId, "账号检测结果：没有账号需要检测");
            return;
        }

        let message = "📋 账号检测结果：\n";
        let index = 1;
        for (const [user, status] of Object.entries(data)) {
            message += `${index}. ${user}: ${status}\n`;
            index++;
        }

        await bot.sendMessage(telegramChatId, message);
    } catch (error) {
        console.error("发送 TG 失败：", error);
        const settings = getTelegramSettings();
        if (settings && settings.telegramChatId) {
            const bot = new TelegramBot(settings.telegramToken, { polling: false });
            await bot.sendMessage(settings.telegramChatId, "❌ 账号检测失败，无法获取数据");
        }
    }
}

// 定时任务：每天早上8点自动检测
cron.schedule('0 8 * * *', () => {
    console.log('启动每日账号检测');
    sendCheckResultsToTG();
});

// 提供前端页面
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); // 解析 JSON 格式的请求体

// 主页，传递本机账号
app.get("/", async (req, res) => {
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

        // 遍历所有账号，异步请求 API
        await Promise.all(users.map(async (username) => {
            try {
                const apiUrl = `https://s00test.64t76dee9sk5.workers.dev/?username=${username}`;
                const response = await axios.get(apiUrl);
                const data = response.data;

                if (data.message) {
                    const parts = data.message.split("："); // 使用全角冒号拆分
                    results[username] = parts.length > 1 ? parts.pop() : data.message; // 取最后一个部分
                } else {
                    results[username] = "未知状态";
                }
            } catch (error) {
                console.error(`账号 ${username} 检测失败:`, error.message);
                results[username] = "检测失败";
            }
        }));

        res.json({ status: "success", results });
    } catch (error) {
        console.error("批量账号检测错误:", error);
        res.status(500).json({ status: "error", message: "检测失败，请稍后再试" });
    }
});

// Telegram 设置页面
app.get("/notificationSettings", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "notification_settings.html"));
});
// 获取 Telegram 设置（如果文件不存在，则返回空值）
app.get("/getTelegramSettings", (req, res) => {
    if (!fs.existsSync(SETTINGS_FILE)) {
        return res.json({ telegramToken: "", telegramChatId: "" }); // 默认返回空数据
    }
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    res.json(settings);
});

// 保存 Telegram 设置，每次提交都会覆盖之前的值
app.post("/setTelegramSettings", (req, res) => {
    const { telegramToken, telegramChatId } = req.body;

    if (!telegramToken || !telegramChatId) {
        return res.status(400).json({ message: "Telegram 配置不完整" });
    }

    // 直接覆盖 `settings.json` 文件
    const settings = { telegramToken, telegramChatId };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

    res.json({ message: "Telegram 设置已更新" });
});
app.use(express.json()); // 解析 JSON 格式的请求体
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});