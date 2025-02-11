const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const http = require("http");
const { exec } = require("child_process");
const socketIo = require("socket.io");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const TelegramBot = require("node-telegram-bot-api");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const PASSWORD_FILE = path.join(__dirname, "password.json");
const SESSION_DIR = path.join(__dirname, "session"); // session 存储路径
const SESSION_FILE = path.join(__dirname, "session_secret.json");
const otaScriptPath = path.join(__dirname, 'ota.sh');

app.use(express.json()); 
app.use(express.static(path.join(__dirname, "public")));

// 禁止页面缓存，防止退出后仍能访问
app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
});

// 生成或读取 session 密钥
function getSessionSecret() {
    if (fs.existsSync(SESSION_FILE)) {
        return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8")).secret;
    } else {
        const secret = crypto.randomBytes(32).toString("hex");
        fs.writeFileSync(SESSION_FILE, JSON.stringify({ secret }), "utf-8");
        return secret;
    }
}

app.use(session({
    store: new FileStore({
        path: path.join(__dirname, "sessions"), // 明确 session 存储路径
        ttl: 60 * 60,  // 让 session 1 小时后自动失效
        retries: 1,
        clearInterval: 600 // 每 10 分钟清理过期 session
    }),
    secret: getSessionSecret(),  // 使用随机生成的密钥
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true }
}));

app.use(bodyParser.urlencoded({ extended: true }));

// **检查是否设置密码**
function checkPassword(req, res, next) {
    if (!fs.existsSync(PASSWORD_FILE)) {
        return res.redirect("/setPassword");
    }
    next();
}

// **检查 session 是否存在**
app.get("/checkSession", (req, res) => {
    if (req.session.authenticated) {
        res.status(200).json({ authenticated: true });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

// 检查 session 是否有效
function isAuthenticated(req, res, next) {
    if (req.session.authenticated) {
        return next();
    }
    res.redirect("/login");  // 未登录时跳转到登录页面
}

// **登录页面**
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "login.html"));
});

// **处理登录**
app.post("/login", (req, res) => {
    const { password } = req.body;
    if (!fs.existsSync(PASSWORD_FILE)) {
        return res.status(400).send("密码文件不存在，请先设置密码");
    }

    const savedPassword = JSON.parse(fs.readFileSync(PASSWORD_FILE, "utf-8")).password;
    if (password === savedPassword) {
        req.session.authenticated = true;
        res.redirect("/");
    } else {
        res.status(401).send("密码错误");
    }
});

app.get("/logout", (req, res) => {
    try {
        if (fs.existsSync(SESSION_DIR)) {
            fs.readdirSync(SESSION_DIR).forEach(file => {
                const filePath = path.join(SESSION_DIR, file);
                if (file.endsWith(".json")) { // 只删除 JSON 文件
                    fs.unlinkSync(filePath);
                    console.log("已删除 session 文件:", filePath);
                }
            });
        }
    } catch (error) {
        console.error("删除 session JSON 文件失败:", error);
    }

    res.redirect("/login"); // 退出后跳转到登录页
});

// 受保护的页面
const protectedRoutes = ["/", "/ota", "/accounts", "/nodes"];
protectedRoutes.forEach(route => {
    app.get(route, checkPassword, isAuthenticated, (req, res) => {
        res.sendFile(path.join(__dirname, "protected", route === "/" ? "index.html" : `${route.slice(1)}.html`));
    });
});

const MAIN_SERVER_USER = process.env.USER || process.env.USERNAME || "default_user"; 
// 获取账号数据
async function getAccounts(excludeMainUser = true) {
    if (!fs.existsSync(ACCOUNTS_FILE)) return {};
    let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    if (excludeMainUser) {
        delete accounts[MAIN_SERVER_USER];  // 如果存在主用户，排除它
    }
    return accounts;
}

// 监听客户端连接
io.on("connection", (socket) => {
    console.log("Client connected");
    socket.on("startNodesSummary", () => {
        getNodesSummary(socket);
    });

    // 加载账号列表
    socket.on("loadAccounts", async () => {
        const accounts = await getAccounts(true);
        socket.emit("accountsList", accounts);
    });

    // 保存新账号
    socket.on("saveAccount", async (accountData) => {
        const accounts = await getAccounts(false);
        accounts[accountData.user] = { 
            user: accountData.user, 
            season: accountData.season || ""  // 默认赛季为空
        };
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountsList", await getAccounts(true));
    });

    // 删除账号
    socket.on("deleteAccount", async (user) => {
        const accounts = await getAccounts(false);
        delete accounts[user];
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountsList", await getAccounts(true));
    });

    // 更新账号的赛季
    socket.on("updateSeason", async (data) => {
        const accounts = await getAccounts(false);
        if (accounts[data.user]) {
            accounts[data.user].season = data.season;  // 更新赛季
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        }
        socket.emit("accountsList", await getAccounts(true));
    });
});
function filterNodes(nodes) {
    return nodes.filter(node => node.startsWith("vmess://") || node.startsWith("hysteria2://"));
}
async function getNodesSummary(socket) {
    const accounts = await getAccounts(true);
    if (!accounts || Object.keys(accounts).length === 0) {
        console.log("⚠️ 未找到账号数据！");
        socket.emit("nodesSummary", { successfulNodes: [], failedAccounts: [] });
        return;
    }

    const users = Object.keys(accounts);  // 取出账号 key
    let successfulNodes = [];
    let failedAccounts = [];

    for (let i = 0; i < users.length; i++) {
        const userKey = users[i];  // 例如 "aodaliy"
        const user = accounts[userKey]?.user || userKey; // 兼容旧格式 & 新格式

        const nodeUrl = `https://${user}.serv00.net/node`;
        try {
            console.log(`请求节点数据: ${nodeUrl}`);
            const nodeResponse = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = nodeResponse.data;

            const nodeLinks = filterNodes([
                ...(nodeData.match(/vmess:\/\/[^\s<>"]+/g) || []),
                ...(nodeData.match(/hysteria2:\/\/[^\s<>"]+/g) || [])
            ]);

            if (nodeLinks.length > 0) {
                successfulNodes.push(...nodeLinks);
            } else {
                console.log(`账号 ${user} 连接成功但无有效节点`);
                failedAccounts.push(user);
            }
        } catch (error) {
            console.log(`账号 ${user} 获取节点失败: ${error.message}`);
            failedAccounts.push(user);
        }
    }

    console.log("成功的节点:", successfulNodes);
    console.log("失败的账号:", failedAccounts);

    socket.emit("nodesSummary", { successfulNodes, failedAccounts });
}

let cronJob = null; // 用于存储定时任务

// 读取通知设置
function getNotificationSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
}

// 保存通知设置
function saveNotificationSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// 解析时间配置并返回 cron 表达式
function getCronExpression(scheduleType, timeValue) {
    if (scheduleType === "interval") {
        const minutes = parseInt(timeValue, 10);
        if (isNaN(minutes) || minutes <= 0) return null;
        return `*/${minutes} * * * *`;
    } else if (scheduleType === "daily") {
        const [hour, minute] = timeValue.split(":").map(num => parseInt(num, 10));
        if (isNaN(hour) || isNaN(minute)) return null;
        return `${minute} ${hour} * * *`;
    } else if (scheduleType === "weekly") {
        const [day, time] = timeValue.split("-");
        const [hour, minute] = time.split(":").map(num => parseInt(num, 10));
        const weekDays = { "周日": 0, "周一": 1, "周二": 2, "周三": 3, "周四": 4, "周五": 5, "周六": 6 };
        if (!weekDays.hasOwnProperty(day) || isNaN(hour) || isNaN(minute)) return null;
        return `${minute} ${hour} * * ${weekDays[day]}`;
    }
    return null;
}

// 重新设置定时任务
function resetCronJob() {
    if (cronJob) cronJob.stop(); // 先停止现有任务
    const settings = getNotificationSettings();
    if (!settings || !settings.scheduleType || !settings.timeValue) return;

    const cronExpression = getCronExpression(settings.scheduleType, settings.timeValue);
    if (!cronExpression) return console.error("无效的 cron 表达式");

    cronJob = cron.schedule(cronExpression, () => {
        console.log("⏰ 运行账号检测任务...");
        sendCheckResultsToTG();
    });
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
// 处理 Telegram 发送消息
async function sendCheckResultsToTG() {
    try {
        const settings = getNotificationSettings();
        if (!settings.telegramToken || !settings.telegramChatId) {
            console.log("❌ Telegram 设置不完整，无法发送通知");
            return;
        }

        const bot = new TelegramBot(settings.telegramToken, { polling: false });
        const response = await axios.get(`https://${process.env.USER}.serv00.net/checkAccounts`);
        const data = response.data.results;

        if (!data || Object.keys(data).length === 0) {
            await bot.sendMessage(settings.telegramChatId, "📋 账号检测结果：没有账号需要检测", { parse_mode: "MarkdownV2" });
            return;
        }

        let results = [];
        let maxUserLength = 0;
        let maxSeasonLength = 0;

        // **保持账号配置文件的顺序**
        const users = Object.keys(data);  // 账号顺序应与配置文件一致

        // 计算最大用户名长度和赛季长度
        users.forEach(user => {
            maxUserLength = Math.max(maxUserLength, user.length);
            maxSeasonLength = Math.max(maxSeasonLength, (data[user]?.season || "").length);
        });

        // 构建格式化的账号检测结果，确保冒号和短横线对齐
        users.forEach((user, index) => {
            const paddedUser = user.padEnd(maxUserLength, " ");
            const season = (data[user]?.season || "--").padEnd(maxSeasonLength + 1, " ");
            const status = data[user]?.status || "未知状态";
            results.push(`${index + 1}. ${paddedUser} : ${season}- ${status}`);
        });

        const beijingTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        let message = `📢 账号检测结果：\n\`\`\`\n${results.join("\n")}\n\`\`\`\n⏰ 北京时间：${beijingTime}`;
        await bot.sendMessage(settings.telegramChatId, message, { parse_mode: "MarkdownV2" });

    } catch (error) {
        console.error("❌ 发送 Telegram 失败:", error);
    }
}

app.get("/", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "index.html"));
});
app.get("/getMainUser", isAuthenticated, (req, res) => {
    res.json({ mainUser: MAIN_SERVER_USER });
});
app.get("/accounts", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "accounts.html"));
});
app.get("/nodes", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "nodes.html"));
});
app.get("/info", (req, res) => {
    const user = req.query.user;
    if (!user) return res.status(400).send("用户未指定");
    res.redirect(`https://${user}.serv00.net/info`);
});
// 发送静态HTML文件
app.get("/checkAccountsPage", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "check_accounts.html"));
});

app.get("/checkAccounts", async (req, res) => {
    try {
        const accounts = await getAccounts(); // 获取所有账号（按配置文件顺序）
        const users = Object.keys(accounts); // 保持账号配置的顺序

        if (users.length === 0) {
            return res.json({ status: "success", results: {} });
        }

        let results = {};
        const promises = users.map(async (username) => {
            try {
                const apiUrl = `https://s00test.64t76dee9sk5.workers.dev/?username=${username}`;
                const response = await axios.get(apiUrl);
                const data = response.data;

                let status = "未知状态";
                if (data.message) {
                    const parts = data.message.split("：");
                    status = parts.length > 1 ? parts.pop() : data.message;
                }

                results[username] = {
                    status: status,
                    season: accounts[username]?.season || "--"
                };
            } catch (error) {
                console.error(`账号 ${username} 检测失败:`, error.message);
                results[username] = {
                    status: "检测失败",
                    season: accounts[username]?.season || "--"
                };
            }
        });

        await Promise.all(promises);

        // **保持账号顺序与配置文件一致**
        let orderedResults = {};
        users.forEach(user => {
            orderedResults[user] = results[user];
        });

        res.json({ status: "success", results: orderedResults });

    } catch (error) {
        console.error("批量账号检测错误:", error);
        res.status(500).json({ status: "error", message: "检测失败，请稍后再试" });
    }
});

// 获取通知设置
app.get("/getNotificationSettings", (req, res) => {
    res.json(getNotificationSettings());
});

// 设置通知和 Telegram 配置
app.post("/setNotificationSettings", (req, res) => {
    const { telegramToken, telegramChatId, scheduleType, timeValue } = req.body;
    
    if (!telegramToken || !telegramChatId || !scheduleType || !timeValue) {
        return res.status(400).json({ message: "所有字段都是必填项" });
    }

    // 解析时间并验证
    if (!getCronExpression(scheduleType, timeValue)) {
        return res.status(400).json({ message: "时间格式不正确，请检查输入" });
    }

    // 保存配置
    const settings = { telegramToken, telegramChatId, scheduleType, timeValue };
    saveNotificationSettings(settings);

    // 重新设置定时任务
    resetCronJob();

    res.json({ message: "✅ 设置已保存并生效" });
});

// 启动时检查并初始化定时任务
resetCronJob();

app.get("/notificationSettings", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "notification_settings.html"));
});

// **执行 OTA 更新**
app.get('/ota/update', isAuthenticated, (req, res) => {
    exec(otaScriptPath, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ 执行脚本错误: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
        if (stderr) {
            console.error(`❌ 脚本错误输出: ${stderr}`);
            return res.status(500).json({ success: false, message: stderr });
        }
        
        // 返回脚本执行的结果
        res.json({ success: true, output: stdout });
    });
});
// **前端页面 `/ota`**
app.get('/ota', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "ota.html"));
});

server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});