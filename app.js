const express = require('express');
const { exec } = require('child_process');
const app = express();

// 设置静态文件路径
app.use(express.static('public'));

// 解析请求体
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 提供静态文件服务（例如，HTML、CSS、JS）
app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>命令执行</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
            }
            .container {
                width: 100%;
                max-width: 600px;
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                text-align: center;
            }
            h1 {
                font-size: 24px;
                margin-bottom: 20px;
            }
            input[type="text"] {
                width: 100%;
                padding: 10px;
                font-size: 16px;
                border: 1px solid #ccc;
                border-radius: 4px;
                box-sizing: border-box;
                margin-bottom: 20px;
            }
            button {
                width: 100%;
                padding: 10px;
                font-size: 16px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.3s ease;
            }
            button:hover {
                background-color: #0056b3;
            }
            .output {
                margin-top: 20px;
                padding: 10px;
                background-color: #f9f9f9;
                border-radius: 4px;
                border: 1px solid #ccc;
                min-height: 100px;
                overflow-y: auto;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>命令执行</h1>
            <input type="text" id="command" placeholder="输入命令">
            <button onclick="sendCommand()">执行命令</button>
            <div class="output" id="output"></div>
        </div>

        <script>
            function sendCommand() {
                const command = document.getElementById('command').value;

                if (!command) {
                    alert("请输入命令！");
                    return;
                }

                fetch('/execute-command', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ command: command }),
                })
                .then(response => response.json())
                .then(data => {
                    document.getElementById('output').innerHTML = '<pre>' + data.output + '</pre>';
                })
                .catch(error => {
                    document.getElementById('output').innerHTML = '<pre>执行命令时发生错误: ' + error.message + '</pre>';
                });
            }
        </script>
    </body>
    </html>
    `);
});

// 提交命令的接口
app.post('/execute-command', (req, res) => {
    const { command } = req.body;

    // 验证命令不能为空
    if (!command) {
        return res.status(400).json({ output: "命令不能为空" });
    }

    // 获取用户目录
    const userDirectory = process.env.HOME;
    console.log("User Directory:", userDirectory);  // 打印用户目录

    if (!userDirectory) {
        return res.status(500).json({ output: "无法获取用户目录" });
    }

    // 使用 bash -c 确保执行 cd 命令
    const fullCommand = `cd ${userDirectory} && ${command}`;

    // 执行命令并捕获错误
    exec(fullCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Error:', error);  // 打印错误
            return res.status(500).json({ output: `执行错误: ${error.message}` });
        }

        if (stderr) {
            console.error('stderr:', stderr);  // 打印 stderr 输出
            return res.status(500).json({ output: `stderr: ${stderr}` });
        }

        console.log('stdout:', stdout);  // 打印标准输出
        // 返回命令执行的输出结果
        res.json({ output: stdout });
    });
});

// 启动服务器
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});