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
    if "logs" not in u:
        u["logs"] = []
    if "tgUsername" not in u:
        u["tgUsername"] = ""


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

# 自动删除封包
async def send_and_auto_delete(chat, text: str, delay: int):
    sent = await chat.send_message(text)

    async def _delete_later():
        await asyncio.sleep(delay)
        try:
            await sent.delete()
        except:
            pass

    # 创建后台任务，不阻塞主流程
    asyncio.create_task(_delete_later())

    return sent

    
# ========== 命令 ==========
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    if is_admin(user_id):
        text = """管理员菜单:
欢迎使用 NodeSeek 签到机器人！
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
        text = """用户菜单:
欢迎使用 NodeSeek 签到机器人！
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
    await send_and_auto_delete(update.message.chat, text, 180)

# ========== /add ==========
async def cmd_add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_type = update.effective_chat.type
    user_id = str(update.effective_user.id)
    tg_username = update.effective_user.username or ""   # 取TG用户名（可能为空）

    # 限制只能私聊使用
    if chat_type != "private":
        await send_and_auto_delete(update.message.chat, "🚨 安全警告：/add 功能只能在私聊中使用！", 10)
        return

    if not context.args or "@" not in context.args[0]:
        await send_and_auto_delete(update.message.chat, "用法：/add 账号@密码", 30)
        return

    try:
        account, password = context.args[0].split("@", 1)
    except ValueError:
        await send_and_auto_delete(update.message.chat, "格式错误，应为：/add 账号@密码", 30)
        return

    account_name = account.strip()
    password = password.strip()

    # 发送临时提示消息
    temp_msg = await update.message.chat.send_message(f"➡️ 正在为 {account_name} 登录...")

    # 调用登录逻辑
    new_cookie = login_and_get_cookie(account_name, password)
    if not new_cookie:
        await temp_msg.delete()
        await send_and_auto_delete(update.message.chat, "❌ 登录失败，请检查账号密码", 30)
        return

    # 读取 JSON 数据
    data = load_data()
    if user_id not in data["users"]:
        data["users"][user_id] = {
            "accounts": {},
            "logs": [],
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

    # 删除 "正在登录" 提示
    await temp_msg.delete()

    # 给用户反馈
    await send_and_auto_delete(
        update.message.chat,
        f"✅ 账号 {account_name} 成功获取 Cookie",
        180
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
        return await send_and_auto_delete(update.message.chat, "⚠️ 格式错误: /del 账号 | /del -all", 30)

    data = load_data()
    if not is_admin(user_id):
        if args == "-all":
            if user_id not in data["users"]:
                return await send_and_auto_delete(update.message.chat, "⚠️ 你没有绑定账号", 30)
                
            deleted = list(data["users"][user_id]["accounts"].keys())
            del data["users"][user_id]
            save_data(data)
            return await send_and_auto_delete(update.message.chat, f"🗑 已删除所有账号: {', '.join(deleted)}", 300)
        else:
            if user_id not in data["users"] or args not in data["users"][user_id]["accounts"]:
                return await send_and_auto_delete(update.message.chat, "⚠️ 未找到账号", 30)
            del data["users"][user_id]["accounts"][args]
            if not data["users"][user_id]["accounts"]:
                del data["users"][user_id]
            save_data(data)
            return await send_and_auto_delete(update.message.chat, f"🗑 已删除账号: {args}", 300)
    else:
        if args.isdigit():
            if args not in data["users"]:
                return await send_and_auto_delete(update.message.chat, "⚠️ 未找到用户", 30)
            del data["users"][args]
            save_data(data)
            return await send_and_auto_delete(update.message.chat, f"✅ 已删除用户 {args} 的所有账号", 300)
        else:
            for uid, u in data["users"].items():
                if args in u["accounts"]:
                    del u["accounts"][args]
                    if not u["accounts"]:
                        del data["users"][uid]
                    save_data(data)
                    return await send_and_auto_delete(update.message.chat, f"✅ 已删除账号: {args}", 300)
            return await send_and_auto_delete(update.message.chat, "⚠️ 未找到账号", 30)

# ========== /mode ==========
async def mode(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    args = " ".join(context.args).strip().lower()
    data = load_data()
    if user_id not in data["users"]:
        data["users"][user_id] = {"accounts": {}, "logs": [], "mode": False}
    if args in ["true", "false"]:
        data["users"][user_id]["mode"] = args == "true"
        save_data(data)
        await send_and_auto_delete(update.message.chat, f"✅ 签到模式: {mode_text(data['users'][user_id]['mode'])}", 180)
    else:
        await send_and_auto_delete(update.message.chat, "⚠️ 参数错误，应为 /mode true 或 /mode false", 30)

# ========== /list ==========
async def list_accounts(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()
    if is_admin(user_id):
        text = "📋 所有用户账号:\n"
        for uid, u in data["users"].items():
            accounts = list(u["accounts"].keys())
            if accounts:
                text += f"\n👤 {u.get('tgUsername', uid)}【{mode_text(u['mode'])}】\n🆔 {uid}\n账号: {', '.join(accounts)}\n"
        await send_and_auto_delete(update.message.chat, text or "📭 暂无用户账号", 30)
    else:
        if user_id not in data["users"] or not data["users"][user_id]["accounts"]:
            return await send_and_auto_delete(update.message.chat, "📭 你还没有绑定账号", 30)
        accounts = "\n".join(data["users"][user_id]["accounts"].keys())
        mode = mode_text(data["users"][user_id]["mode"])
        await send_and_auto_delete(update.message.chat, f"📋 你的账号:\n模式: {mode}\n{accounts}", 300)

# ================= 签到明细日志 =================
async def log(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()

    user = data.get("users", {}).get(user_id)
    if not user or not user.get("accounts"):
        return await send_and_auto_delete(update.message.chat, "⚠️ 你还没有绑定账号，无法查询签到明细", 30)

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
            return await send_and_auto_delete(update.message.chat, f"⚠️ 账号 {filter_acc} 没有找到或未绑定 Cookie", 30)
        return await send_and_auto_delete(update.message.chat, "⚠️ 你所有账号都没有绑定 Cookie，无法查询", 30)

    payload = {"targets": targets, "days": days}

    waiting_msg = await update.message.chat.send_message("⏳ 正在查询中，请稍候...")

    try:
        res = subprocess.run(
            ["node", "stats.js", json.dumps(payload)],
            capture_output=True, text=True, timeout=60
        )
        if res.returncode != 0:
            await waiting_msg.delete()
            return await send_and_auto_delete(update.message.chat, f"⚠️ stats.js 执行失败: {res.stderr}", 30)

        results = json.loads(res.stdout)
    except Exception as e:
        await waiting_msg.delete()
        return await send_and_auto_delete(update.message.chat, f"⚠️ 查询异常: {e}", 30)

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
    await send_and_auto_delete(update.message.chat, text, 180)
    
# ========== /txt ==========
async def txt(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    admin_name = update.effective_user.username or f"id:{user_id}"
    if not is_admin(user_id):
        return
    args = " ".join(context.args)
    if not args:
        return await send_and_auto_delete(update.message.chat, "⚠️ 格式错误: /txt 内容 或 /txt TGID,内容", 30)

    data = load_data()
    if "," in args and args.split(",")[0].isdigit():
        target, content = args.split(",", 1)
        if target not in data["users"]:
            return await send_and_auto_delete(update.message.chat, "⚠️ 未找到用户", 30)
        keyboard = [[
            InlineKeyboardButton("去回复", url="https://t.me/SerokBot_bot"),
            InlineKeyboardButton("己知晓", callback_data=f"ack_{user_id}")
        ]]
        await context.application.bot.send_message(
            target,
            f"📢 管理员 {admin_name} 喊话:\n{content}",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return await send_and_auto_delete(update.message.chat, f"✅ 已向 {target} 发送喊话", 300)
    else:
        sent = 0
        for uid in data["users"]:
            if uid == user_id:
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
            except:
                pass
        await send_and_auto_delete(update.message.chat, f"✅ 已发送 {sent} 个用户", 300)


# 存放 每条喊话消息 -> 已确认的用户集合
acknowledged_users = {}

async def ack_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user_id = str(query.from_user.id)
    username = query.from_user.username or f"id:{user_id}"  # 新增
    data = query.data
    if not data.startswith("ack_"):
        return
    admin_id = data.split("_")[1]

    if query.message.message_id not in acknowledged_users:
        acknowledged_users[query.message.message_id] = set()

    if user_id in acknowledged_users[query.message.message_id]:
        await query.answer("⚠️ 你已知晓", show_alert=True)
        return

    acknowledged_users[query.message.message_id].add(user_id)
    await context.application.bot.send_message(
        admin_id,
        f"📣 用户 {username} 已知晓喊话内容"   # 这里用用户名
    )
    await query.answer("✅ 已知晓")

# ========== 签到逻辑：调用 sign.js ==========
        
# 单个账号重试签到（刷新 cookie 后再跑一次）
async def retry_sign_if_invalid(uid, acc_name, res, data, mode):
    if "🚫 响应解析失败" not in res["result"]:
        return res

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
        retry_res = retry_results[uid][0] if retry_results.get(uid) else {**res, "result": "🚫 未返回结果", "no_log": True}

        # ✅ 在结果里直接加上刷新标记，不再生成第二条
        retry_res["cookie_refreshed"] = True
        return retry_res

    except Exception as e:
        logging.error("sign.js 重试调用异常: %s", e)
        return {**res, "result": "🚫 Cookie 刷新后签到异常", "no_log": True}


# 包装：调用 sign.js，并在必要时自动刷新 cookie
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

    # 检查结果，失败则重试
    for uid, logs in results.items():
        fixed_logs = []
        for res in logs:
            acc_name = res["name"]
            mode = user_modes.get(uid, False)

            fixed_res = await retry_sign_if_invalid(uid, acc_name, res, data, mode)

            # 🚫 跳过不需要写日志的（比如异常占位）
            if fixed_res.get("no_log"):
                continue

            # ✅ 正常签到结果（带 cookie_refreshed 标记）
            fixed_logs.append(fixed_res)

        results[uid] = fixed_logs

    return results



beijing = ZoneInfo("Asia/Shanghai")

def now_str():
    return datetime.now(beijing).strftime("%Y-%m-%d %H:%M:%S")
    
# ================= 手动签到 =================
async def check(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()
    targets, user_modes = {}, {}

    if is_admin(user_id):
        # 管理员 → 扫描所有用户
        for uid, u in data.get("users", {}).items():
            accounts = u.get("accounts", {})
            if accounts:
                targets[uid] = accounts
                user_modes[uid] = u.get("mode", False)
    else:
        # 普通用户 → 只能跑自己
        u = data.get("users", {}).get(user_id)
        if not u or not u.get("accounts"):
            return await send_and_auto_delete(update.message.chat, "⚠️ 你还没有绑定账号", 30)
        targets[user_id] = u["accounts"]
        user_modes[user_id] = u.get("mode", False)

    if not targets:
        return await send_and_auto_delete(update.message.chat, "⚠️ 没有可签到的账号", 30)

    # 发送“签到中...”
    waiting_msg = await update.message.chat.send_message("⏳ 签到中...")

    # 执行签到
    results = await run_sign_and_fix(targets, user_modes, data)

    # ✅ 写入日志（只保存非 no_log 的），并标记为【手动】
    manual_by = "admin" if is_admin(user_id) else "user"

    for uid, logs in results.items():
        if uid not in data["users"]:
            continue
        u = data["users"][uid]
        u.setdefault("logs", [])
        for r in logs:
            if not r.get("no_log"):
                u["logs"].append({
                    **r,
                    "source": "manual",
                    "time": now_str(),
                    "by": manual_by
                })
        u["logs"] = u["logs"][-30:]  # 只保留 30 条
    save_data(data)

    # ✅ 输出推送内容
    if is_admin(user_id):
        text = "📋 所有用户签到结果:\n"
        for uid, logs in results.items():
            u = data["users"][uid]
            text += f"\n👤 {u.get('tgUsername', uid)}【{mode_text(user_modes.get(uid, False))}】\n🆔 {uid}\n"
            for r in logs:
                if r.get("no_log"):
                    continue
                line = f"{mask_username(r['name'])} - {r['result']}"
                if r.get("cookie_refreshed"):
                    line += "  ♻️ Cookie 刷新成功"
                text += line + "\n"
    else:
        logs = results.get(user_id, [])
        text = f"📋 签到结果（{mode_text(user_modes.get(user_id, False))}）：\n"
        for r in logs:
            if r.get("no_log"):
                continue
            line = f"{mask_username(r['name'])} - {r['result']}"
            if r.get("cookie_refreshed"):
                line += "  ♻️ Cookie 刷新成功"
            text += line + "\n"

    await send_and_auto_delete(update.message.chat, text, 180)

    # 删除“签到中...”提示
    try:
        await waiting_msg.delete()
    except Exception:
        pass


# ================= 定时签到 =================
async def user_daily_check(app: Application, uid: str):
    data = load_data()
    u = data["users"].get(uid)
    if not u or not u.get("accounts"):
        return

    # ⚡ 延迟 0~5 分钟，避免拥挤
    delay = random.randint(0, 5 * 60)
    await asyncio.sleep(delay)

    targets = {uid: u["accounts"]}
    user_modes = {uid: u.get("mode", False)}

    results = await run_sign_and_fix(targets, user_modes, data)

    # ✅ 写入日志（标记为自动，time 即含日期）
    for r in results.get(uid, []):
        u.setdefault("logs", [])
        u["logs"].append({
            **r,
            "source": "auto",
            "time": now_str()
        })
    u["logs"] = u.get("logs", [])[-30:]
    save_data(data)

    # 推送结果给用户
    text = f"📋 自动签到结果（模式 {mode_text(user_modes[uid])}）：\n"
    for r in results.get(uid, []):
        text += f"{mask_username(r['name'])} - {r['result']}\n"
        if r.get("cookie_refreshed"):
            text += "♻️ Cookie 刷新成功\n"
    try:
        await app.bot.send_message(chat_id=uid, text=text)
    except Exception:
        pass


# ================= 管理员每日汇总 =================
async def admin_daily_summary(app: Application):
    data = load_data()
    today = now_str()[:10]  # e.g. "2025-08-30"

    text = "📋 每日签到汇总（仅统计今日自动签到）:\n"
    any_user_shown = False

    for uid, u in data.get("users", {}).items():
        logs = u.get("logs", [])
        # 只取：今天 + 自动
        todays_auto = [
            l for l in logs
            if l.get("source") == "auto" and l.get("time", "")[:10] == today
        ]
        if not todays_auto:
            continue

        any_user_shown = True
        text += f"\n👤 {u.get('tgUsername', uid)}【{mode_text(u.get('mode', False))}】\n🆔 {uid}\n"
        for r in todays_auto:
            line = f"{mask_username(r['name'])} - {r['result']}"
            if r.get("cookie_refreshed"):
                line += "  ♻️"
            text += line + "\n"

    if not any_user_shown:
        text += "\n（今天暂无自动签到记录）"

    await notify_admins(app, text)


# ========== 用户设置签到时间 ==========
async def settime(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()

    if user_id not in data.get("users", {}):
        return await send_and_auto_delete(update.message.chat, "⚠️ 你还没有绑定账号，不能设置时间", 30)


    if not context.args:
        return await send_and_auto_delete(update.message.chat, "用法: /settime 小时:分钟 (0–10点)，例如: /settime 8:30", 30)

    try:
        parts = context.args[0].split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return await send_and_auto_delete(update.message.chat,"⚠️ 时间格式错误，用法示例: /settime 8:30", 30)

    # 校验范围：0–10 点
    if not (0 <= hour <= 9):
        return await send_and_auto_delete(update.message.chat, "⚠️ 签到时间范围只能是 0–10 点", 30)
    if not (0 <= minute < 60):
        return await send_and_auto_delete(update.message.chat, "⚠️ 分钟必须是 0–59", 30)

    # 保存用户设置
    data["users"][user_id]["sign_hour"] = hour
    data["users"][user_id]["sign_minute"] = minute
    save_data(data)

    await send_and_auto_delete(update.message.chat, f"✅ 已设置每日签到时间为 {hour:02d}:{minute:02d} (北京时间)", 180)

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
        hour = u.get("sign_hour", 0)
        minute = u.get("sign_minute", 0)

        async def user_job(context: CallbackContext, user_id=uid):
            await user_daily_check(app, user_id)

        app.job_queue.run_daily(
            user_job,
            time=time(hour=hour, minute=minute, tzinfo=beijing),  # ⚡ 加上 tzinfo
            name=f"user_{uid}_daily_check"
        )

# ================= 签到收益统计 =================
async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    data = load_data()

    user = data.get("users", {}).get(user_id)
    if not user or not user.get("accounts"):
        return await send_and_auto_delete(update.message.chat, "⚠️ 你还没有绑定账号，无法查询签到收益", 30)

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
        return await send_and_auto_delete(update.message.chat, "⚠️ 你所有账号都没有绑定 Cookie，无法查询", 30)

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
            return await send_and_auto_delete(update.message.chat, f"⚠️ stats.js 执行失败: {res.stderr}", 30)

        results = json.loads(res.stdout)
    except Exception as e:
        await waiting_msg.delete()
        return await send_and_auto_delete(update.message.chat, f"⚠️ 查询异常: {e}", 30)

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
    await send_and_auto_delete(update.message.chat, text, 180)

# ========== 设置命令菜单 ==========
async def post_init(application: Application):
    data = load_data()  # 需要能拿到用户数据，判断管理员是否绑定了账号

    # 普通用户命令（始终有 /stats）
    user_commands = [
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

    # 基础管理员命令（不含 /stats）
    base_admin_commands = [
        BotCommand("start", "显示帮助"),
        BotCommand("check", "手动签到"),
        BotCommand("add", "添加账号"),
        BotCommand("del", "删除账号"),
        BotCommand("mode", "签到模式"),
        BotCommand("list", "账号列表"),
        BotCommand("log", "签到记录"),
        BotCommand("settime", "设置每日签到时间 (0–10点)"),
        BotCommand("txt", "管理员喊话"),
    ]

    # 设置全局默认命令（普通用户菜单）
    await application.bot.set_my_commands(user_commands)

    # 给管理员单独设置菜单
    for admin_id in ADMIN_IDS:
        # 判断该管理员是否绑定了账号
        user = data.get("users", {}).get(str(admin_id))
        has_account = user and user.get("accounts")

        admin_commands = base_admin_commands.copy()
        if has_account:
            # 管理员有账号 → 加入 /stats
            admin_commands.insert(-1, BotCommand("stats", "签到统计"))

        await application.bot.set_my_commands(
            admin_commands,
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
