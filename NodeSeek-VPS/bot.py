# bot.py
import os
import json
import logging
import random
import asyncio
import telegram
import tempfile
import shutil
import subprocess
from datetime import datetime, time
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from telegram import (
    Update, BotCommand, InlineKeyboardButton, InlineKeyboardMarkup
)
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    ContextTypes, CallbackContext
)
from nodeseek_login import login_and_get_cookie

# ========== 配置 ==========
load_dotenv()
TOKEN = os.getenv("TG_BOT_TOKEN")
ADMIN_IDS = [int(s.strip()) for s in os.getenv("ADMIN_IDS", "").split(",") if s.strip()]

DATA_FILE = "data.json"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def ensure_user_structure(data, uid):
    """
    确保用户数据结构完整，避免 KeyError
    """
    if uid not in data["users"]:
        data["users"][uid] = {}

    u = data["users"][uid]

    if "accounts" not in u:
        u["accounts"] = {}
    if "mode" not in u:
        u["mode"] = False   # 默认模式
    if "tgUsername" not in u:
        u["tgUsername"] = ""
    if "sign_hour" not in u:   # 默认签到时间
        u["sign_hour"] = 0
    if "sign_minute" not in u:
        u["sign_minute"] = 0

    return u

# ========== 数据存取 ==========
def ensure_file(file_path, default):
    """确保文件存在"""
    if not os.path.exists(file_path):
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(default, f, indent=2, ensure_ascii=False)

def save_data(data):
    """安全保存 JSON 数据"""
    with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as tf:
        json.dump(data, tf, indent=2, ensure_ascii=False)
        tempname = tf.name
    shutil.move(tempname, DATA_FILE)

def load_data():
    """加载数据并自动修复缺失字段"""
    if not os.path.exists(DATA_FILE):
        return {"users": {}}

    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError:
        print("⚠️ data.json 损坏，已重置为空")
        data = {"users": {}}
        save_data(data)
        return data

    changed = False
    for uid in data.get("users", {}):
        before = json.dumps(data["users"][uid], sort_keys=True)
        ensure_user_structure(data, uid)
        after = json.dumps(data["users"][uid], sort_keys=True)
        if before != after:
            changed = True

    if changed:
        save_data(data)  # 🔥 写回文件，保证 data.json 补齐

    return data


# 初始化空文件
ensure_file(DATA_FILE, {"users": {}})

    
# ========== 工具 ==========
def is_admin(user_id: str) -> bool:
    return int(user_id) in ADMIN_IDS

def mask_username(name: str) -> str:
    if len(name) <= 2:
        return name[0] + "***" + (name[1] if len(name) > 1 else "")
    return name[0] + "***" + name[-1]

def mode_text(mode: bool) -> str:
    return "随机模式" if mode else "固定模式"

async def notify_admins(app, message: str):
    for admin_id in ADMIN_IDS:
        try:
            await app.bot.send_message(admin_id, message)
        except:
            pass


async def send_and_auto_delete(chat, text: str, delay: int, user_msg=None):
    # 机器人发送的消息
    sent = await chat.send_message(text)
    print(f"Bot message sent: {sent.message_id}")  # 日志输出，确认消息发送

    async def _delete_later():
        print(f"Waiting {delay} seconds before deleting.")  # 日志输出，确认延时
        await asyncio.sleep(delay)

        # 删掉机器人回复
        try:
            await sent.delete()
            print(f"Deleted bot message: {sent.message_id}")  # 日志输出，确认删除
        except Exception as e:
            print(f"Failed to delete bot message {sent.message_id}: {e}")  # 日志输出错误

        # 删掉用户命令消息
        if user_msg:
            try:
                await user_msg.delete()
                print(f"Deleted user command message: {user_msg.message_id}")  # 日志输出，确认删除
            except Exception as e:
                print(f"Failed to delete user message {user_msg.message_id}: {e}")  # 日志输出错误

    # 创建后台任务，不阻塞主流程
    asyncio.create_task(_delete_later())
    return sent


# ========== 命令保护：检查是否有账号 ==========
def require_account(func):
    """装饰器：限制命令必须绑定账号"""
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user_id = str(update.effective_user.id)
        data = load_data()
        if user_id not in data.get("users", {}) or not data["users"][user_id].get("accounts"):
            return await send_and_auto_delete(update.message.chat, "⚠️ 无效指令，请添加账号后使用", 3, user_msg=update.message)
        return await func(update, context, *args, **kwargs)
    return wrapper
    
# ========== 命令 ==========
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    if is_admin(user_id):
        text = """欢迎使用 NodeSeek 签到机器人！
------- 【菜 单】 --------
/start - 显示帮助
/check - 手动签到
/add   - 添加账号(请勿在群聊中使用)
/del   - 删除账号
/mode  - 签到模式（true=随机，默认固定false）
/list  - 账号列表
/hz    - 每日汇总
/log   - 签到记录(默认7天)
/stats - 签到统计(默认30天)
/settime - 自动签到时间（范围 0–10 点）
/txt  - 管理喊话
------- 【说 明】 --------
默认每天0 - 0时5分随机时间签到
check 格式(/check)所以账号
check 格式(/check TGID,账号)指定用户的账号
add 格式(/add 账号@密码)
del 格式(/del 账号)删除指定账号
del 格式(/del TGID)删除ID下所有账号
mode 格式(/mode true)
log 格式(/log 天数)所有账号的指定天数
log 格式(/log 天数 账号)指定账号的指定天数
stats 格式(/stats 天数)所有账号的指定天数
settime 格式(/settime 7:00)
txt 格式(/txt 内容)全体喊话
txt 格式(/txt TGID,内容)指定喊话
-------------------------"""
    else:
        text = """欢迎使用 NodeSeek 签到机器人！
------- 【菜 单】 --------
/start - 显示帮助
/check - 手动签到
/add   - 添加账号(请勿在群聊中使用)
/del   - 删除账号
/mode  - 签到模式（true=随机，默认固定false）
/list  - 账号列表
/log   - 签到记录(默认7天)
/stats - 签到统计(默认30天)
/settime - 自动签到时间（范围 0–10 点）
------- 【说 明】 --------
默认每天0 - 0时5分随机时间签到
check 格式(/check)所以账号
check 格式(/check 账号)指定账号
add 格式(/add 账号@密码)
del 格式(/del 账号)删除指定账号
del 格式(/del -all)删除所有账号
mode 格式(/mode true)
log 格式(/log 天数)所有账号的指定天数
log 格式(/log 天数 账号)指定账号的指定天数
stats 格式(/stats 天数)所有账号的指定天数
settime 格式(/settime 7:00)"""
    # 30秒后自动删除
    # await send_and_auto_delete(update.message.chat, text, 30, user_msg=update.message)

    # 不自动删除
    await update.message.chat.send_message(text)

# ========== /add ==========
async def cmd_add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_type = update.effective_chat.type
    user_id = str(update.effective_user.id)
    tg_username = update.effective_user.username or ""   # 取TG用户名（可能为空）

    # 限制只能私聊使用
    if chat_type != "private":
        await send_and_auto_delete(update.message.chat, "🚨 安全警告：/add 功能只能在私聊中使用！", 5, user_msg=update.message)
        return

    if not context.args or "@" not in context.args[0]:
        await send_and_auto_delete(update.message.chat, "用法：/add 账号@密码", 5, user_msg=update.message)
        return

    try:
        account, password = context.args[0].split("@", 1)
    except ValueError:
        await send_and_auto_delete(update.message.chat, "格式错误，应为：/add 账号@密码", 3, user_msg=update.message)
        return

    account_name = account.strip()
    password = password.strip()

    # 发送临时提示消息
    temp_msg = await update.message.chat.send_message(f"➡️ 正在为 {account_name} 登录...")

    # 调用登录逻辑
    new_cookie = login_and_get_cookie(account_name, password)
    if not new_cookie:
        await temp_msg.delete()
        await send_and_auto_delete(update.message.chat, "❌ 登录失败，请检查账号密码", 3, user_msg=update.message)
        return

    # 读取 JSON 数据
    data = load_data()
    # 判断是否是首次添加账号（原本没有用户，或者没有账号）
    is_first_account = user_id not in data["users"] or not data["users"][user_id].get("accounts")

    if user_id not in data["users"]:
        data["users"][user_id] = {
            "accounts": {},
            "mode": False,
            "tgUsername": tg_username
        }
    else:
        data["users"][user_id]["tgUsername"] = tg_username

    # 写入账户信息
    data["users"][user_id]["accounts"][account_name] = {
        "username": account_name,
        "password": password,
        "cookie": new_cookie
    }

    save_data(data)

    # 🚀 如果是首次添加账号 → 刷新菜单
    if is_first_account:
        await post_init(context.application)

    # 删除 "正在登录" 提示
    await temp_msg.delete()

    # 创建用户日志文件 date/<TGID>.json，如果不存在就初始化为空 logs
    import os, json
    log_file = f"./data/{user_id}.json"
    os.makedirs(os.path.dirname(log_file), exist_ok=True)  # 确保 data 目录存在
    if not os.path.exists(log_file):
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump({"logs": []}, f, ensure_ascii=False, indent=2)

    # 给用户反馈
    await send_and_auto_delete(
        update.message.chat,
        f"✅ 账号 {account_name} 成功获取 Cookie",
        180,
        user_msg=update.message
    )

    # 通知所有管理员成功情况
    for admin_id in ADMIN_IDS:
        await context.bot.send_message(
            chat_id=admin_id,
            text=f"✅ 用户 {tg_username or user_id} 添加账号 {account_name}"
        )


# ========== /del ==========
async def delete(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    args = " ".join(context.args)
    if not args:
        return await send_and_auto_delete(update.message.chat, "⚠️ 格式错误: /del 账号 | /del -all", 5, user_msg=update.message)

    data = load_data()
    tgUsername = data["users"].get(user_id, {}).get("tgUsername", user_id)

    if is_admin(user_id):
        if args.isdigit():  # 按用户 ID 删
            if args not in data["users"]:
                return await send_and_auto_delete(update.message.chat, "⚠️ 未找到用户", 3, user_msg=update.message)
            del data["users"][args]
            save_data(data)

            # 删除用户日志
            log_file = f"./data/{args}.json"
            if os.path.exists(log_file):
                os.remove(log_file)

            await post_init(context.application)
            await context.bot.set_my_commands(
                [BotCommand("start", "显示帮助"), BotCommand("add", "添加账号")],
                scope=telegram.BotCommandScopeChat(int(args))
            )
            return await send_and_auto_delete(update.message.chat, f"✅ 已删除用户 {args} 的所有账号", 15, user_msg=update.message)
        else:  # 按账号名删
            for uid, u in list(data["users"].items()):
                if args in u["accounts"]:
                    del u["accounts"][args]
                    if not u["accounts"]:
                        del data["users"][uid]
                        save_data(data)

                        # 删除日志
                        log_file = f"./data/{uid}.json"
                        if os.path.exists(log_file):
                            os.remove(log_file)

                        await post_init(context.application)
                        await context.bot.set_my_commands(
                            [BotCommand("start", "显示帮助"), BotCommand("add", "添加账号")],
                            scope=telegram.BotCommandScopeChat(int(uid))
                        )
                    else:
                        save_data(data)
                    await notify_admins(context.application, f"管理员 {tgUsername} 删除了账号: {args}")
                    return await send_and_auto_delete(update.message.chat, f"✅ 已删除账号: {args}", 15, user_msg=update.message)
            return await send_and_auto_delete(update.message.chat, "⚠️ 未找到账号", 3)
    else:
        if user_id not in data["users"] or not data["users"][user_id].get("accounts"):
            return await send_and_auto_delete(update.message.chat, "⚠️ 无效指令，请添加账号后使用", 5, user_msg=update.message)

        if args == "-all":
            deleted = list(data["users"][user_id]["accounts"].keys())
            del data["users"][user_id]
            save_data(data)

            # 删除日志
            log_file = f"./data/{user_id}.json"
            if os.path.exists(log_file):
                os.remove(log_file)

            await post_init(context.application)
            await context.bot.set_my_commands(
                [BotCommand("start", "显示帮助"), BotCommand("add", "添加账号")],
                scope=telegram.BotCommandScopeChat(int(user_id))
            )
            await notify_admins(context.application, f"用户 {tgUsername} 删除了所有账号: {', '.join(deleted)}")
            return await send_and_auto_delete(update.message.chat, f"🗑 已删除所有账号: {', '.join(deleted)}", 15, user_msg=update.message)
        else:
            if args not in data["users"][user_id]["accounts"]:
                return await send_and_auto_delete(update.message.chat, "⚠️ 未找到账号", 3, user_msg=update.message)
            del data["users"][user_id]["accounts"][args]
            if not data["users"][user_id]["accounts"]:
                del data["users"][user_id]
                save_data(data)

                # 删除日志
                log_file = f"./data/{user_id}.json"
                if os.path.exists(log_file):
                    os.remove(log_file)

                await post_init(context.application)
                await context.bot.set_my_commands(
                    [BotCommand("start", "显示帮助"), BotCommand("add", "添加账号")],
                    scope=telegram.BotCommandScopeChat(int(user_id))
                )
            else:
                save_data(data)
            await notify_admins(context.application, f"用户 {tgUsername} 删除了账号: {args}")
            return await send_and_auto_delete(update.message.chat, f"🗑 已删除账号: {args}", 15, user_msg=update.message)

# ========== /mode ==========
@require_account
async def mode(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    args = " ".join(context.args).strip().lower()
    data = load_data()
    if user_id not in data["users"]:
        data["users"][user_id] = {"accounts": {}, "logs": [], "mode": False}
    if args in ["true", "false"]:
        data["users"][user_id]["mode"] = args == "true"
        save_data(data)
        await send_and_auto_delete(update.message.chat, f"✅ 签到模式: {mode_text(data['users'][user_id]['mode'])}", 5, user_msg=update.message)
    else:
        await send_and_auto_delete(update.message.chat, "⚠️ 参数错误，应为 /mode true 或 /mode false", 5, user_msg=update.message)

# ========== /list ==========
async def list_accounts(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()

    if is_admin(user_id):
        # 管理员 → 不需要账号，也能查看所有用户
        text = "📋 所有用户账号:\n"
        for uid, u in data["users"].items():
            accounts = list(u["accounts"].keys())
            if accounts:
                text += f"\n👤 {u.get('tgUsername', uid)}【{mode_text(u['mode'])}】\n🆔 {uid}\n账号: {', '.join(accounts)}\n"
        await send_and_auto_delete(update.message.chat, text or "📭 暂无用户账号", 20, user_msg=update.message)
    else:
        # 普通用户 → 必须先有账号
        if user_id not in data["users"] or not data["users"][user_id].get("accounts"):
            return await send_and_auto_delete(update.message.chat, "⚠️ 无效指令，请添加账号后使用", 5, user_msg=update.message)

        accounts = "\n".join(data["users"][user_id]["accounts"].keys())
        mode = mode_text(data["users"][user_id]["mode"])
        await send_and_auto_delete(update.message.chat, f"📋 你的账号:\n模式: {mode}\n{accounts}", 20, user_msg=update.message)

# ================= 签到明细日志 =================
@require_account
async def log(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()

    user = data.get("users", {}).get(user_id)
    if not user or not user.get("accounts"):
        return await send_and_auto_delete(update.message.chat, "⚠️ 你还没有绑定账号，无法查询签到明细", 5, user_msg=update.message)

    days = 7
    filter_acc = None

    args = context.args
    if args:
        if args[0].isdigit():
            days = int(args[0])
            if len(args) > 1:
                filter_acc = args[1]
        else:
            filter_acc = args[0]
            if len(args) > 1 and args[1].isdigit():
                days = int(args[1])

    targets = {user_id: {}}
    for acc_name, acc in user["accounts"].items():
        if filter_acc and acc_name != filter_acc:
            continue
        ns_cookie = acc.get("cookie")
        if ns_cookie:
            targets[user_id][acc_name] = ns_cookie

    if not targets[user_id]:
        if filter_acc:
            return await send_and_auto_delete(update.message.chat, f"⚠️ 账号 {filter_acc} 没有找到或未绑定 Cookie", 5, user_msg=update.message)
        return await send_and_auto_delete(update.message.chat, "⚠️ 你所有账号都没有绑定 Cookie，无法查询", 5, user_msg=update.message)

    payload = {"targets": targets, "days": days}

    waiting_msg = await update.message.chat.send_message("⏳ 正在查询中，请稍候...")

    try:
        res = subprocess.run(
            ["node", "stats.js", json.dumps(payload)],
            capture_output=True, text=True, timeout=60
        )
        if res.returncode != 0:
            await waiting_msg.delete()
            return await send_and_auto_delete(update.message.chat, f"⚠️ stats.js 执行失败: {res.stderr}", 3, user_msg=update.message)

        results = json.loads(res.stdout)
    except Exception as e:
        await waiting_msg.delete()
        return await send_and_auto_delete(update.message.chat, f"⚠️ 查询异常: {e}", 3, user_msg=update.message)

    text = f"📜 签到明细（{days} 天）：\n"
    results_list = results.get(user_id, [])

    for idx, r in enumerate(results_list):
        acc_name = mask_username(r["name"])
        text += f"\n🔸 {acc_name} (签到收益)\n"

        if r.get("stats") and r["stats"]["days_count"] > 0:
            records = r["stats"]["records"]
            if not records:
                text += "   ⚠️ 没有签到明细记录\n"
            else:
                sorted_records = sorted(records, key=lambda x: x["date"], reverse=True)
                for rec in sorted_records:
                    text += f"   {rec['date']}  🍗 +{rec['amount']}\n"
        else:
            text += f"   {r['result']}\n"

        if idx < len(results_list) - 1:
            text += "-----------------------\n"

    await waiting_msg.delete()
    await send_and_auto_delete(update.message.chat, text, 20, user_msg=update.message)
    
# ================= 单个账号重试签到 =================
async def retry_sign_if_invalid(uid, acc_name, res, data, mode):
    # 仅在第一次失败时才尝试刷新 cookie
    if "🚫 响应解析失败" not in res["result"]:
        return res  # 成功或其他错误，不重试

    logging.warning("[%s] %s cookie 失效，尝试自动刷新...", uid, acc_name)

    account = data["users"][uid]["accounts"][acc_name]
    username, password = account["username"], account["password"]

    # 调用自动登录获取新 cookie
    new_cookie = login_and_get_cookie(username, password)
    if not new_cookie:
        logging.error("[%s] %s cookie 刷新失败", uid, acc_name)
        return {**res, "result": "🚫 Cookie 刷新失败", "no_log": True}

    # 保存新 cookie
    account["cookie"] = new_cookie
    save_data(data)

    # ⚡ 再跑一次签到
    payload = {
        "targets": {uid: {acc_name: new_cookie}},
        "userModes": {uid: mode}
    }

    try:
        proc = subprocess.run(
            ["node", "sign.js", json.dumps(payload, ensure_ascii=False)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode != 0:
            logging.error("sign.js 重试执行失败: %s", proc.stderr.strip())
            return {**res, "result": "🚫 Cookie 刷新后签到失败", "no_log": True}

        retry_results = json.loads(proc.stdout)
        retry_res = retry_results.get(uid, [{}])[0]

        # ✅ 在结果里直接加上刷新标记
        retry_res["cookie_refreshed"] = True
        return retry_res

    except Exception as e:
        logging.error("sign.js 重试调用异常: %s", e)
        return {**res, "result": "🚫 Cookie 刷新后签到异常", "no_log": True}


# ================= 调用 sign.js 并自动刷新 cookie =================
async def run_sign_and_fix(targets, user_modes, data):
    results = {}

    # 转换为 sign.js 需要的格式 {账号名: cookie字符串}
    targets_for_js = {
        uid: {name: acc["cookie"] for name, acc in accounts.items()}
        for uid, accounts in targets.items()
    }
    payload = {"targets": targets_for_js, "userModes": user_modes}

    try:
        proc = subprocess.run(
            ["node", "sign.js", json.dumps(payload, ensure_ascii=False)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if proc.returncode != 0:
            logging.error("sign.js 执行失败: %s", proc.stderr.strip())
            return {}

        results = json.loads(proc.stdout)
    except Exception as e:
        logging.error("调用 sign.js 异常: %s", e)
        return {}

    # ✅ 遍历每个账号，失败则重试，最终结果全部保留
    for uid, logs in results.items():
        fixed_logs = []
        for res in logs:
            acc_name = res["name"]
            mode = user_modes.get(uid, False)

            fixed_res = await retry_sign_if_invalid(uid, acc_name, res, data, mode)
            fixed_logs.append(fixed_res)  # ✅ 不管是否重试成功，最终记录成功的

        results[uid] = fixed_logs

    return results


# ================= 写入日志函数 =================
def append_user_log(tgid: str, log_entry: dict):
    """在 data/<TGID>.json 里追加日志，只记录含“收益”的日志"""
    # 只记录含收益的日志
    if "收益" not in str(log_entry.get("result", "")):
        return

    path = f"./data/{tgid}.json"
    os.makedirs(os.path.dirname(path), exist_ok=True)

    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            user_data = json.load(f)
    else:
        user_data = {"logs": []}

    user_data.setdefault("logs", [])
    user_data["logs"].append(log_entry)
    # 只保留最近 10 条
    user_data["logs"] = user_data["logs"][-30:]

    with open(path, "w", encoding="utf-8") as f:
        json.dump(user_data, f, indent=2, ensure_ascii=False)

# ================= 时间工具 =================
beijing = ZoneInfo("Asia/Shanghai")

def now_str():
    return datetime.now(beijing).strftime("%Y-%m-%d %H:%M:%S")
    
# ================= 手动签到 =================
async def check(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()
    targets, user_modes = {}, {}

    if is_admin(user_id):
        for uid, u in data.get("users", {}).items():
            accounts = u.get("accounts", {})
            if accounts:
                targets[uid] = accounts
                user_modes[uid] = u.get("mode")
    else:
        u = data.get("users", {}).get(user_id)
        if not u or not u.get("accounts"):
            return await send_and_auto_delete(update.message.chat, "⚠️ 你还没有绑定账号", 3, user_msg=update.message)
        targets[user_id] = u["accounts"]
        user_modes[user_id] = u.get("mode")

    if not targets:
        return await send_and_auto_delete(update.message.chat, "⚠️ 没有可签到的账号", 3, user_msg=update.message)

    waiting_msg = await update.message.chat.send_message("⏳ 签到中...")

    results = await run_sign_and_fix(targets, user_modes, data)

    manual_by = "admin" if is_admin(user_id) else "user"

    # ✅ 写入日志到每个用户
    for uid, logs in results.items():
        for r in logs:
            append_user_log(uid, {
                **r,
                "source": "manual",
                "time": now_str(),
                "by": manual_by
            })

    # ✅ 输出推送内容
    text = ""
    if is_admin(user_id):
        text = "📋 所有用户签到结果:\n"
        for uid, logs in results.items():
            u = data["users"][uid]
            text += f"\n👤 {u.get('tgUsername', uid)}【{mode_text(user_modes.get(uid, False))}】\n🆔 {uid}\n"
            for r in logs:
                line = f"{mask_username(r['name'])} - {r['result']}"
                if r.get("cookie_refreshed"):
                    line += " [♻️ Cookie]"
                text += line + "\n"
    else:
        logs = results.get(user_id, [])
        text = f"📋 签到结果（{mode_text(user_modes.get(user_id, False))}）：\n"
        for r in logs:
            line = f"{mask_username(r['name'])} - {r['result']}"
            if r.get("cookie_refreshed"):
                line += " [♻️ Cookie]"
            text += line + "\n"

    await send_and_auto_delete(update.message.chat, text, 60, user_msg=update.message)

    try:
        await waiting_msg.delete()
    except Exception:
        pass

# ================= 定时签到 =================
async def user_daily_check(app: Application, uid: str):
    uid = str(uid)  # 🔥 确保 uid 是字符串
    data = load_data()
    u = data["users"].get(uid)
    if not u or not u.get("accounts"):
        return

    delay = random.randint(0, 5 * 60)
    await asyncio.sleep(delay)

    targets = {uid: u["accounts"]}
    user_modes = {uid: u.get("mode")}

    # 执行签到（含重试逻辑）
    results = await run_sign_and_fix(targets, user_modes, data)
    results = {str(k): v for k, v in results.items()}  # 保底处理

    # ✅ 写入日志到 ./data/<TGID>.json
    for r in results.get(uid, []):
        append_user_log(uid, {
            **r,
            "source": "auto",
            "time": now_str(),
            "by": "system"
        })

    # ✅ 推送结果给用户
    text = f"📋 自动签到结果（{mode_text(user_modes[uid])}）：\n"
    for r in results.get(uid, []):
        line = f"{mask_username(r['name'])} - {r['result']}"
        if r.get("cookie_refreshed"):
            line += " [♻️ Cookie]"
        text += line + "\n"

    try:
        await app.bot.send_message(chat_id=uid, text=text)
    except Exception:
        pass

# ========== /txt ==========
async def txt(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    admin_name = update.effective_user.username or f"id:{user_id}"

    # 🚫 群聊/频道中不允许 /txt
    if update.message.chat.type != "private":
        if is_admin(user_id):
            await send_and_auto_delete(
                update.message.chat,
                "⚠️ /txt 群聊限制使用",
                5,
                user_msg=update.message
            )
        return

    # 只允许管理员使用
    if not is_admin(user_id):
        return

    args = " ".join(context.args)
    if not args:
        return await send_and_auto_delete(
            update.message.chat,
            "⚠️ 格式错误: /txt 内容 或 /txt TGID,内容",
            5,
            user_msg=update.message
        )

    data = load_data()

    # 单发
    if "," in args and args.split(",", 1)[0].isdigit():
        target, content = args.split(",", 1)
        if target not in data["users"]:
            return await send_and_auto_delete(
                update.message.chat,
                "⚠️ 未找到用户",
                3,
                user_msg=update.message
            )

        keyboard = [[
            InlineKeyboardButton("去回复", url="https://t.me/SerokBot_bot"),
            InlineKeyboardButton("己知晓", callback_data=f"ack_{user_id}")
        ]]

        await context.application.bot.send_message(
            target,
            f"📢 管理员 {admin_name} 喊话:\n{content}",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )

        return await send_and_auto_delete(
            update.message.chat,
            f"✅ 已向 {target} 发送喊话",
            10,
            user_msg=update.message
        )

    # 群发
    sent = 0
    for uid in data["users"]:
        if uid == user_id:  # 不给自己发
            continue

        keyboard = [[
            InlineKeyboardButton("去回复", url="https://t.me/SerokBot_bot"),
            InlineKeyboardButton("己知晓", callback_data=f"ack_{user_id}")
        ]]

        try:
            await context.application.bot.send_message(
                uid,
                f"📢 管理员 {admin_name} 喊话:\n{args}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            sent += 1
        except Exception as e:
            logger.warning(f"发送失败: {uid}, 错误: {e}")

    await send_and_auto_delete(
        update.message.chat,
        f"✅ 已发送 {sent} 个用户",
        10,
        user_msg=update.message
    )


# 存放 每条喊话消息 -> 已确认的用户集合
acknowledged_users = {}

# ========== ack_callback ==========
async def ack_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user_id = str(query.from_user.id)
    username = query.from_user.username or f"id:{user_id}"
    data = query.data

    if not data.startswith("ack_"):
        return

    admin_id = int(data.split("_")[1])  # 转 int 确保 send_message 不报错
    key = (query.message.chat.id, query.message.message_id)

    if key not in acknowledged_users:
        acknowledged_users[key] = set()

    if user_id in acknowledged_users[key]:
        await query.answer("⚠️ 你已知晓", show_alert=True)
        return

    acknowledged_users[key].add(user_id)

    # 通知管理员
    try:
        await context.application.bot.send_message(
            admin_id,
            f"📣 用户 {username} 已知晓喊话内容"
        )
    except Exception as e:
        logger.warning(f"通知管理员失败: {admin_id}, 错误: {e}")

    await query.answer("✅ 已知晓")

# ================= /hz =================
async def hz(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    chat_id = update.message.chat.id  # 当前会话 ID

    # 🚫 如果不是管理员，直接忽略
    if not is_admin(user_id):
        return

    # 限制时间：每天 10:10 ~ 23:59
    now_time = datetime.now().time()
    start = time(10, 10)
    end = time(23, 59)
    if not (start <= now_time <= end):
        return await send_and_auto_delete(
            update.message.chat,
            "⚠️ 请在 10:10 后使用",
            5,
            user_msg=update.message
        )

    # ✅ 判断是群聊还是私聊
    if update.message.chat.type == "private":
        # 在私聊里 → 发到私聊
        await admin_daily_summary(context.application, target_admin_id=user_id)
    else:
        # 在群聊里 → 发到群里
        await admin_daily_summary(context.application, target_admin_id=chat_id)


# ================= 每日汇总 =================
async def admin_daily_summary(app: Application, target_admin_id: str = None):
    data = load_data()
    today = now_str()[:10]  # e.g. "2025-08-30"

    text = "📋 今日签到成功汇总:\n"
    any_user_shown = False

    for uid, u in data.get("users", {}).items():
        # 从 ./data/<TGID>.json 读取日志
        log_file = f"./data/{uid}.json"
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                user_data = json.load(f)
                logs = user_data.get("logs", [])
        else:
            logs = []

        # 只取今天 + 含“收益”的记录
        todays = [
            l for l in logs
            if l.get("time", "")[:10] == today
            and "收益" in str(l.get("result", ""))
        ]
        if not todays:
            continue

        any_user_shown = True
        text += f"\n👤 {u.get('tgUsername', uid)}【{mode_text(u.get('mode', False))}】\n🆔 {uid}\n"

        for r in todays:
            tag = "[手动]" if r.get("source") == "manual" else "[自动]"
            line = f"{tag} {r['result']} - {mask_username(r['name'])}"
            if r.get("cookie_refreshed"):
                line += "  ♻️"
            text += line + "\n"

    if not any_user_shown:
        text += "\n（今天暂无签到收益记录）"

    # ✅ 发送方式：指定管理员或所有管理员
    if target_admin_id:
        await app.bot.send_message(chat_id=target_admin_id, text=text)
    else:
        await notify_admins(app, text)

    
# ================= 管理员每日汇总 =================
async def admin_daily_summary(app: Application, target_admin_id: str = None):
    data = load_data()
    today = now_str()[:10]  # e.g. "2025-08-30"

    text = "📋 今日签到成功汇总:\n"
    any_user_shown = False

    for uid, u in data.get("users", {}).items():
        log_file = f"./data/{uid}.json"
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                user_data = json.load(f)
                logs = user_data.get("logs", [])
        else:
            logs = []

        # 只取今天的签到收益
        todays = [
            l for l in logs
            if l.get("time", "")[:10] == today
            and "收益" in str(l.get("result", ""))
        ]
        if not todays:
            continue

        any_user_shown = True
        text += f"\n👤 {u.get('tgUsername', uid)}【{mode_text(u.get('mode', False))}】\n🆔 {uid}\n"

        for r in todays:
            tag = "[手动]" if r.get("source") == "manual" else "[自动]"
            line = f"{tag} {r['result']} - {mask_username(r['name'])}"
            if r.get("cookie_refreshed"):
                line += "  ♻️"
            text += line + "\n"

    if not any_user_shown:
        text += "\n（今天暂无签到收益记录）"

    # ✅ 只推送给指定管理员，或者推送给所有管理员
    if target_admin_id:
        await app.bot.send_message(chat_id=target_admin_id, text=text)
    else:
        await notify_admins(app, text)


# ========== 用户设置签到时间 ==========
@require_account
async def settime(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()

    if user_id not in data.get("users", {}):
        return await send_and_auto_delete(update.message.chat, "⚠️ 你还没有绑定账号，不能设置时间", 3, user_msg=update.message)


    if not context.args:
        return await send_and_auto_delete(update.message.chat, "用法: /settime 小时:分钟 (0–10点)，例如: /settime 8:30", 5, user_msg=update.message)

    try:
        parts = context.args[0].split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return await send_and_auto_delete(update.message.chat,"⚠️ 时间格式错误，用法示例: /settime 8:30", 5, user_msg=update.message)

    # 校验范围：0–10 点
    if not (0 <= hour <= 9):
        return await send_and_auto_delete(update.message.chat, "⚠️ 签到时间范围只能是 0–10 点", 5, user_msg=update.message)
    if not (0 <= minute < 60):
        return await send_and_auto_delete(update.message.chat, "⚠️ 分钟必须是 0–59", 3, user_msg=update.message)

    # 保存用户设置
    data["users"][user_id]["sign_hour"] = hour
    data["users"][user_id]["sign_minute"] = minute
    save_data(data)

    await send_and_auto_delete(update.message.chat, f"✅ 已设置每日签到时间为 {hour:02d}:{minute:02d} (北京时间)", 10, user_msg=update.message)

    # ⚡️ 重新注册用户的定时任务
    app: Application = context.application
    job_name = f"user_{user_id}_daily_check"

    # 移除旧任务
    old_jobs = app.job_queue.get_jobs_by_name(job_name)
    for j in old_jobs:
        j.schedule_removal()

    # 添加新任务（北京时间）
    app.job_queue.run_daily(
        lambda ctx, uid=user_id: asyncio.create_task(user_daily_check(app, uid)),
        time=time(hour=hour, minute=minute, tzinfo=beijing),
        name=job_name
    )

def register_jobs(app: Application):
    data = load_data()

    # 管理员汇总任务 → 每天 11:00 (北京时间)
    async def admin_job(context: CallbackContext):
        await admin_daily_summary(app)

    app.job_queue.run_daily(
        admin_job,
        time=time(hour=10, minute=5, tzinfo=beijing),
        name="admin_summary"
    )

    # 用户签到任务 (每个用户自己的时间)
    for uid, u in data.get("users", {}).items():
        hour = u.get("sign_hour")
        minute = u.get("sign_minute")

        async def user_job(context: CallbackContext, user_id=uid):
            await user_daily_check(app, user_id)

        app.job_queue.run_daily(
            user_job,
            time=time(hour=hour, minute=minute, tzinfo=beijing),  # ⚡ 加上 tzinfo
            name=f"user_{uid}_daily_check"
        )

# ================= 签到收益统计 =================
@require_account
async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()

    user = data.get("users", {}).get(user_id)
    if not user or not user.get("accounts"):
        return await send_and_auto_delete(update.message.chat, "⚠️ 你还没有绑定账号，无法查询签到收益", 3, user_msg=update.message)

    try:
        days = int(context.args[0]) if context.args else 30
    except ValueError:
        days = 30

    targets = {user_id: {}}
    for acc_name, acc in user["accounts"].items():
        ns_cookie = acc.get("cookie")
        if ns_cookie:
            targets[user_id][acc_name] = ns_cookie

    if not targets[user_id]:
        return await send_and_auto_delete(update.message.chat, "⚠️ 你所有账号都没有绑定 Cookie，无法查询", 3, user_msg=update.message)

    payload = {"targets": targets, "days": days}

    # 发送等待提示（群里不会是回复）
    waiting_msg = await update.message.chat.send_message("⏳ 正在查询中，请稍候...")

    try:
        res = subprocess.run(
            ["node", "stats.js", json.dumps(payload)],
            capture_output=True, text=True, timeout=60
        )
        if res.returncode != 0:
            await waiting_msg.delete()
            return await send_and_auto_delete(update.message.chat, f"⚠️ stats.js 执行失败: {res.stderr}", 3, user_msg=update.message)

        results = json.loads(res.stdout)
    except Exception as e:
        await waiting_msg.delete()
        return await send_and_auto_delete(update.message.chat, f"⚠️ 查询异常: {e}", 3, user_msg=update.message)

    text = f"📊 签到收益统计（{days} 天）：\n"
    results_list = results.get(user_id, [])
    for idx, r in enumerate(results_list):
        acc_name = mask_username(r["name"])
        if r.get("stats") and r["stats"]["days_count"] > 0:
            stats = r["stats"]
            text += (
                f"\n🔸 {acc_name}\n"
                f"   🗓️ 签到天数 : {stats['days_count']} 天\n"
                f"   🍗 总收益   : {stats['total_amount']} 个\n"
                f"-----------------------\n"
                f"   📈 日均收益 : {stats['average']} 个\n"
            )
        else:
            text += f"\n🔸 {acc_name}\n   ⚠️ {r['result']}\n"
    
    await waiting_msg.delete()
    await send_and_auto_delete(update.message.chat, text, 20, user_msg=update.message)

# ========== 设置命令菜单 ==========
async def post_init(application: Application):
    data = load_data()

    # 普通用户菜单
    user_no_acc = [
        BotCommand("start", "显示帮助"),
        BotCommand("add", "添加账号"),
    ]
    user_with_acc = [
        BotCommand("start", "显示帮助"),
        BotCommand("check", "手动签到"),
        BotCommand("add", "添加账号"),
        BotCommand("del", "删除账号"),
        BotCommand("mode", "签到模式"),
        BotCommand("list", "账号列表"),
        BotCommand("log", "签到记录"),
        BotCommand("stats", "签到统计"),
        BotCommand("settime", "设置每日签到时间 (0–10点)"),
    ]

    # 管理员菜单
    admin_no_acc = [
        BotCommand("start", "显示帮助"),
        BotCommand("check", "手动签到"),
        BotCommand("add", "添加账号"),
        BotCommand("del", "删除账号"),
        BotCommand("list", "账号列表"),
        BotCommand("hz", "每日汇总"),
        BotCommand("txt", "管理员喊话"),
    ]
    admin_with_acc = [
        BotCommand("start", "显示帮助"),
        BotCommand("check", "手动签到"),
        BotCommand("add", "添加账号"),
        BotCommand("del", "删除账号"),
        BotCommand("mode", "签到模式"),
        BotCommand("list", "账号列表"),
        BotCommand("log", "签到记录"),
        BotCommand("settime", "设置每日签到时间 (0–10点)"),
        BotCommand("stats", "签到统计"),
        BotCommand("hz", "每日汇总"),
        BotCommand("txt", "管理员喊话"),
    ]

    # 🚀 群聊统一菜单（不包含 /hz 和 /txt）
    group_commands = [
        BotCommand("start", "显示帮助"),
        BotCommand("check", "手动签到"),
        BotCommand("add", "添加账号"),
        BotCommand("del", "删除账号"),
        BotCommand("mode", "签到模式"),
        BotCommand("list", "账号列表"),
        BotCommand("log", "签到记录"),
        BotCommand("stats", "签到统计"),
        BotCommand("settime", "设置每日签到时间 (0–10点)"),
    ]
    await application.bot.set_my_commands(group_commands, scope=telegram.BotCommandScopeAllGroupChats())

    # 默认：普通用户未绑定账号（私聊场景）
    await application.bot.set_my_commands(user_no_acc)

    # 为每个已知用户设置专属菜单（私聊）
    for uid, u in data.get("users", {}).items():
        has_account = u.get("accounts")
        if int(uid) in ADMIN_IDS:
            commands = admin_with_acc if has_account else admin_no_acc
        else:
            commands = user_with_acc if has_account else user_no_acc

        await application.bot.set_my_commands(
            commands,
            scope=telegram.BotCommandScopeChat(int(uid))
        )

    # 处理未绑定账号的管理员（私聊）
    for admin_id in ADMIN_IDS:
        if str(admin_id) not in data.get("users", {}):
            await application.bot.set_my_commands(
                admin_no_acc,
                scope=telegram.BotCommandScopeChat(admin_id)
            )


# ========== 启动 ==========
def main():
    app = Application.builder().token(TOKEN).post_init(post_init).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("check", check))
    app.add_handler(CommandHandler("add", cmd_add))
    app.add_handler(CommandHandler("del", delete))
    app.add_handler(CommandHandler("mode", mode))
    app.add_handler(CommandHandler("list", list_accounts))
    app.add_handler(CommandHandler("log", log))
    app.add_handler(CommandHandler("hz", hz))
    app.add_handler(CommandHandler("settime", settime))
    app.add_handler(CommandHandler("stats", stats))
    app.add_handler(CommandHandler("txt", txt))
    app.add_handler(CallbackQueryHandler(ack_callback))

# ✅ 定时任务注册
    register_jobs(app)

    app.run_polling()

if __name__ == "__main__":
    import asyncio
    main()