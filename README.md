## = NodeSeek 签到（带Loon通知） 
>
>    @compatible   loon
>
>    @version      1.7
>
>    @description  多账号签到 + 网络重试 + TG推送 + Loon本地通知 + 随机延迟（2分钟内）+ 模式选择

### 「本脚本为Loon软件的脚本，其他app自行测试」

## = PC端 `cookie` 抓取，需要登录 [NodeSeek](https://www.nodeseek.com/) 账号
- 具体按图操作：

![](https://tc.889269.xyz/1753172830433_image_2025-07-22_16-27-06.png)

- 复制到TXT，后面备用。

## = IOS端 打开 `Loon` APP

![](https://tc.889269.xyz/1753174749092_Snipaste_2025-07-22_16-58-26.png)

```bash
[Script]
cron "0 0 * * *" script-path=https://raw.githubusercontent.com/ryty1/NodeSeek/refs/heads/main/Checkin.js, timeout=60, tag=NS自动签

[MITM]
hostname = %APPEND% www.nodeseek.com
```
- 定时 可以在 `Loon ---> 脚本` 中修改.

## ----------- 环境变量（`数据持久化`）说明 -------------
| 变量名（Key）        | 值（Value）                                 |        说明    |
|------------------|----------------------------------------------|-------------|
| NODESEEK_COOKIE  | 账号A@cookie1&账号B@cookie2&账号C@cookie3     |  必须  |
| TG_TOKEN         | 123456789:ABCDEF_xxxxxxx                      |  非必须  |
| TG_CHATID        | 123456789                                     |  非必须  |
| TG_PROXY         | 策略名（如果TG推送不成功需要设置）                        |  非必须  |
| DEFAULT         | true （随机模式，不填写为固定模式）                       |  非必须  |

## = 设置完成后可以`手动运行`一次，查看是否正常！
