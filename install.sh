#!/bin/bash

# 项目路径
APP_DIR="/opt/nodeloc_bot"
PYTHON_BIN=$(which python3)

echo "🔧 开始部署 NodeLoc 签到 Bot..."

# 创建目录
mkdir -p $APP_DIR && cd $APP_DIR

# 写入 config.json（替换为你自己的信息）
cat > config.json <<EOF
{
  "bot_token": "7231458739:AAGWj2c2iENbPln1Mqq7aeFcO2-xYIc2JZc",
  "admin_id": 645346292
}
EOF

# 创建空用户数据文件
echo "{}" > user_data.json

# 写入 requirements.txt
cat > requirements.txt <<EOF
python-telegram-bot==13.15
requests
EOF

# 写入 sign.py
cat > sign.py <<'EOF'
import requests, time, random

def run_sign_in(name, cookie, max_retries=3):
    delay = random.randint(1, 120)
    time.sleep(delay)

    headers = {
        "User-Agent": "Mozilla/5.0",
        "cookie": cookie
    }

    for attempt in range(1, max_retries + 1):
        try:
            res = requests.get("https://nodeloc.cc/user/checkin", headers=headers, timeout=10)
            result = res.json()

            if result.get("success") is True:
                msg = f"""📢 NodeLoc 签到结果
———————————————————
✅ 签到成功
🗓️ 获得 10 ⚡能量
"""
            elif result.get("success") is False:
                msg = f"""📢 NodeLoc 签到结果
———————————————————
☑️ 已签到
🗓️ {result.get("message", "今天你已经领取过 10 个能量值了~")}
"""
            else:
                msg = "❌ 未知返回，请稍后再试"

            return msg

        except Exception as e:
            if attempt == max_retries:
                return f"""📢 NodeLoc 签到结果
———————————————————
❌ 签到失败
请检查网络是否异常 
"""
            time.sleep(3)
EOF

# 写入 main.py
cat > main.py <<'EOF'
import json, os
import logging
from telegram import Update
from telegram.ext import Updater, CommandHandler, CallbackContext
from sign import run_sign_in

CONFIG = json.load(open("config.json"))
USER_DATA_FILE = "user_data.json"
BOT_TOKEN = CONFIG["bot_token"]
ADMIN_ID = CONFIG["admin_id"]

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

def load_user_data():
    if not os.path.exists(USER_DATA_FILE):
        return {}
    with open(USER_DATA_FILE, "r") as f:
        return json.load(f)

def save_user_data(data):
    with open(USER_DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

def start(update: Update, context: CallbackContext):
    update.message.reply_text("📢 欢迎使用 NodeLoc 签到 Bot！\n使用 /set <cookie> 设置你的 Cookie。")

def set_cookie(update: Update, context: CallbackContext):
    if not context.args:
        return update.message.reply_text("⚠️ 格式错误，用法：/set <你的cookie>")

    uid = str(update.effective_user.id)
    cookie = context.args[0].strip()
    data = load_user_data()
    data[uid] = {"name": update.effective_user.first_name, "cookie": cookie}
    save_user_data(data)
    update.message.reply_text("✅ Cookie 设置成功！")

def myinfo(update: Update, context: CallbackContext):
    uid = str(update.effective_user.id)
    data = load_user_data()
    if uid not in data:
        return update.message.reply_text("⚠️ 你还没有设置 Cookie，使用 /set <cookie> 设置")

    user = data[uid]
    update.message.reply_text(f"👤 用户名: {user['name']}\n🍪 Cookie: {user['cookie']}")

def admin_list(update: Update, context: CallbackContext):
    if update.effective_user.id != ADMIN_ID:
        return update.message.reply_text("❌ 无权限")
    data = load_user_data()
    reply = "📋 当前用户列表：\n\n"
    for uid, info in data.items():
        reply += f"👤 {info['name']} | ID: {uid}\n"
    update.message.reply_text(reply or "暂无用户")

def manual_sign(update: Update, context: CallbackContext):
    uid = str(update.effective_user.id)
    data = load_user_data()
    if uid not in data:
        return update.message.reply_text("⚠️ 未设置 Cookie")

    name = data[uid]["name"]
    cookie = data[uid]["cookie"]
    result = run_sign_in(name, cookie)
    update.message.reply_text(result)

def main():
    updater = Updater(BOT_TOKEN)
    dp = updater.dispatcher

    dp.add_handler(CommandHandler("start", start))
    dp.add_handler(CommandHandler("set", set_cookie))
    dp.add_handler(CommandHandler("myinfo", myinfo))
    dp.add_handler(CommandHandler("sign", manual_sign))
    dp.add_handler(CommandHandler("list", admin_list))

    updater.start_polling()
    updater.idle()

if __name__ == '__main__':
    main()
EOF

# 安装依赖
echo "📦 安装依赖..."
pip3 install -r requirements.txt

# 启动服务
echo "🚀 启动 Bot..."
nohup $PYTHON_BIN main.py > log.txt 2>&1 &

echo "✅ NodeLoc 签到 Bot 已部署完成！使用 /start 开始与机器人交互。"
