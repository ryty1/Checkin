const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public"))); // 提供静态资源

// **API: 获取节点信息**
app.get("/api/node", (req, res) => {
    const filePath = path.join(process.env.HOME, "serv00-play/singbox/list");

    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ success: false, message: "无法读取文件", error: err.message });
        }

        const cleanedData = data.replace(/(vmess:\/\/|hysteria2:\/\/|proxyip:\/\/|https:\/\/)/g, '\n$1').trim();
        const patterns = [/vmess:\/\/[^\n]+/g, /hysteria2:\/\/[^\n]+/g, /https:\/\/[^\n]+/g, /proxyip:\/\/[^\n]+/g];
        const allConfigs = patterns.flatMap(pattern => cleanedData.match(pattern) || []);

        res.json({ success: true, configs: allConfigs });
    });
});

// **API: 获取日志信息**
app.get("/api/log", (req, res) => {
    exec("ps aux", (err, stdout) => {
        if (err) {
            return res.status(500).json({ success: false, message: "无法获取日志", error: err.message });
        }
        res.json({ success: true, log: stdout.trim() });
    });
});

// **API: 执行 OTA 更新**
app.get("/api/ota/update", (req, res) => {
    exec("your-ota-update-script.sh", (error, stdout, stderr) => {
        if (error || stderr) {
            return res.status(500).json({ success: false, message: "更新失败", error: error?.message || stderr });
        }
        res.json({ success: true, message: "更新成功", output: stdout });
    });
});

// **提供前端页面**
app.get("/node", (req, res) => res.sendFile(path.join(__dirname, "public", "node.html")));
app.get("/log", (req, res) => res.sendFile(path.join(__dirname, "public", "log.html")));
app.get("/ota", (req, res) => res.sendFile(path.join(__dirname, "public", "ota.html")));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));