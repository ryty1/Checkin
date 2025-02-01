const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;

// 定义 OTA 脚本路径
const otaScriptPath = path.join(__dirname, 'ota.sh');

// 允许静态文件访问
app.use(express.static(path.join(__dirname, 'public')));

// **执行 OTA 更新**
app.get('/ota/update', (req, res) => {
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
app.get('/ota', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OTA 更新</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f9;
                margin: 0;
                padding: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
            }
            .container {
                width: 80%;
                max-width: 800px;
                padding: 20px;
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            h1 {
                text-align: center;
                color: #333;
            }
            button {
                display: block;
                margin: 20px auto;
                padding: 10px 20px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                transition: background-color 0.3s;
            }
            button:hover {
                background-color: #45a049;
            }
            #result {
                margin-top: 20px;
                font-size: 16px;
            }
            .result-item {
                padding: 10px;
                border-radius: 5px;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .success {
                background-color: #e7f9e7;
                color: #4CAF50;
            }
            .failure {
                background-color: #ffe6e6;
                color: #f44336;
            }
            .info {
                background-color: #e0f7fa;
                color: #0288d1;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>OTA 更新</h1>
            <button onclick="checkForUpdates()">检查更新</button>
            <div id="result"></div>
        </div>

        <script>
            async function checkForUpdates() {
                try {
                    const response = await fetch('/ota/update');
                    const data = await response.json();

                    if (data.success) {
                        const resultHtml = \`
                            <h3>更新结果</h3>
                            <pre>\${data.output}</pre>
                        \`;
                        document.getElementById('result').innerHTML = resultHtml;
                    } else {
                        document.getElementById('result').innerHTML = '<p class="failure">更新时发生错误</p>';
                    }
                } catch (error) {
                    document.getElementById('result').innerHTML = '<p class="failure">请求失败</p>';
                }
            }
        </script>
    </body>
    </html>
    `);
});

// 启动服务器
app.listen(port, () => {
    console.log(`🚀 服务器运行在 http://localhost:${port}/ota`);
});