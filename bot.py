import os
import re
import subprocess
import time
import requests

import store

import base64
BOT_TOKEN = os.environ.get(
    "GLOW_BOT_TOKEN",
    base64.b64decode("ODIwMDM0NzczOTpBQUZJX0ZQWTdJTjdKMXZ1XzlUZVJGU0JJYkJZclFSNFl0Yw==").decode("utf-8"),
)
TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
FALLBACK_URL = os.environ.get(
    "GLOW_WEBAPP_URL",
    "https://loops-based-adipex-clone.trycloudflare.com",
)

# In-memory conversation states: chat_id -> {"action": ...}
USER_STATES = {}


def fmt_sum(amount):
    try:
        return f"{int(amount):,}".replace(",", " ") + " so‘m"
    except Exception:
        return f"{amount} so‘m"


def get_live_webapp_url():
    try:
        out = subprocess.check_output(
            ["journalctl", "-u", "glow-art-tunnel.service", "-n", "120", "--no-pager"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=4,
        )
        matches = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", out)
        if matches:
            return matches[-1]
    except Exception:
        pass
    return FALLBACK_URL


def tg_call(method, payload=None, timeout=35):
    try:
        r = requests.post(f"{TG_API}/{method}", json=payload or {}, timeout=timeout)
        return r.json()
    except Exception as e:
        print(f"[tg_call:{method}] error: {e}", flush=True)
        return {"ok": False}


def setup_bot_menu(webapp_url):
    tg_call(
        "setMyCommands",
        {
            "commands": [
                {"command": "start", "description": "✦ Glow Trace Art ilovasini ochish"},
                {"command": "tarif", "description": "💎 Tariflar va to‘lov"},
                {"command": "browser", "description": "🌐 Brauzerda ochish havolasi"},
                {"command": "admin", "description": "⚙️ Admin panel (faqat admin)"},
                {"command": "help", "description": "📖 Foydalanish qo‘llanmasi"},
            ]
        },
        timeout=10,
    )
    tg_call(
        "setChatMenuButton",
        {
            "menu_button": {
                "type": "web_app",
                "text": "✦ Glow Art",
                "web_app": {"url": webapp_url},
            }
        },
        timeout=10,
    )


def send_start(chat_id, first_name="", username=""):
    store.ensure_user(chat_id, first_name, username)
    status = store.get_user_status(chat_id)
    base_url = get_live_webapp_url()
    personal_url = f"{base_url}/?chat_id={chat_id}"
    greeting = f"Salom, {first_name}! " if first_name else "Salom! "

    if status["is_premium"]:
        plan_line = f"👑 <b>Premium faol</b> ({status['premium_days_left']} kun qoldi — cheksiz!)"
    elif status["free_remaining"] > 0:
        plan_line = "🎁 <b>1-rasmingiz va tanlagan animatsiyangiz BEPUL!</b>"
    elif status["credits"] > 0:
        plan_line = f"🎬 <b>Balans:</b> {status['credits']} ta video tayyorlash huquqi bor"
    else:
        s = status["settings"]
        plan_line = (
            f"💎 1 ta video: <b>{fmt_sum(s['video_price'])}</b> | "
            f"1 oy Premium: <b>{fmt_sum(s['premium_price'])}</b>"
        )

    text = (
        f"✦ <b>{greeting}Glow Trace Art PRO</b> botiga xush kelibsiz!\n\n"
        f"{plan_line}\n\n"
        "🎬 <b>Qanday ishlaydi:</b>\n"
        "1. Pastdagi tugma orqali ilovani oching.\n"
        "2. 12 ta super animatsiyadan birini tanlang va rasmingizni yuklang.\n"
        "3. <b>«Botga tayyor video yuborish»</b> tugmasini bosing — tayyor <b>MP4 video</b> "
        "avtomatik shu botga keladi!"
    )

    inline_kb = [
        [{"text": "✦ Glow Trace Art ochish (Telegram)", "web_app": {"url": personal_url}}],
        [{"text": "🌐 Brauzerda ochish (Chrome / Safari)", "url": personal_url}],
        [
            {"text": "💎 Tariflar / To‘lov", "callback_data": "tarifs"},
            {"text": "📖 Qo‘llanma", "callback_data": "help"},
        ],
    ]
    if status["is_admin"]:
        inline_kb.append([{"text": "⚙️ Admin panel", "callback_data": "admin_home"}])

    reply_rows = [
        [{"text": "✦ Glow Trace Art ochish", "web_app": {"url": personal_url}}],
        [{"text": "🌐 Brauzerda ochish"}, {"text": "💎 Tariflar / To‘lov"}],
        [{"text": "📖 Qo‘llanma"}],
    ]
    if status["is_admin"]:
        reply_rows[-1].append({"text": "⚙️ Admin panel"})

    tg_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "reply_markup": {"inline_keyboard": inline_kb},
        },
        timeout=15,
    )
    tg_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": "👇 Tezkor tugmalar tayyor:",
            "reply_markup": {"keyboard": reply_rows, "resize_keyboard": True},
        },
        timeout=15,
    )


def send_tarifs(chat_id):
    status = store.get_user_status(chat_id)
    s = status["settings"]
    text = (
        "💎 <b>Tariflar va To‘lov</b>\n\n"
        "🎁 <b>1-chi rasm + animatsiya:</b> BEPUL\n"
        f"🎬 <b>1 ta video tayyorlash:</b> <b>{fmt_sum(s['video_price'])}</b>\n"
        f"👑 <b>Premium (1 oy cheksiz):</b> <b>{fmt_sum(s['premium_price'])}</b>\n\n"
        f"💳 <b>Karta raqami:</b> <code>{s['card_number']}</code>\n"
        f"👤 <b>Karta egasi:</b> {s['card_holder']}\n\n"
        "👇 Xizmat turini tanlang, to‘lov qiling va <b>chek rasmini (skrinshot)</b> shu botga yuboring:"
    )
    tg_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [
                    [{"text": f"🎬 1 ta video ({fmt_sum(s['video_price'])})", "callback_data": "buy_video"}],
                    [{"text": f"👑 Premium 1 oy ({fmt_sum(s['premium_price'])})", "callback_data": "buy_premium"}],
                ]
            },
        },
        timeout=15,
    )


def prompt_payment_receipt(chat_id, plan):
    s = store.get_settings()
    amount = s["premium_price"] if plan == "premium" else s["video_price"]
    title = "👑 Premium (1 oy cheksiz)" if plan == "premium" else "🎬 1 ta video tayyorlash"

    USER_STATES[str(chat_id)] = {"action": "await_receipt", "plan": plan, "amount": amount}

    text = (
        f"<b>{title}</b>\n\n"
        f"💰 <b>To‘lov summasi:</b> <b>{fmt_sum(amount)}</b>\n"
        f"💳 <b>Karta raqami:</b> <code>{s['card_number']}</code>\n"
        f"👤 <b>Karta egasi:</b> {s['card_holder']}\n\n"
        "📸 To‘lovni amalga oshirgach, <b>chek rasmini (skrinshot)</b> shu chatga yuboring.\n"
        "Admin tasdiqlashi bilan darhol ruxsat ochiladi!"
    )
    tg_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [
                    [{"text": "❌ Bekor qilish", "callback_data": "cancel_state"}],
                ]
            },
        },
        timeout=15,
    )


def send_admin_panel(chat_id):
    # First person to call /admin when admin list is empty becomes owner admin
    if not store.claim_admin_if_empty(chat_id):
        tg_call(
            "sendMessage",
            {"chat_id": chat_id, "text": "⛔ Bu bo‘lim faqat bot admini uchun!"},
            timeout=10,
        )
        return

    s = store.get_settings()
    st = store.get_stats()
    text = (
        "⚙️ <b>ADMIN PANEL — @quiz15_testbot</b>\n\n"
        f"💳 <b>Karta raqami:</b> <code>{s['card_number']}</code>\n"
        f"👤 <b>Karta egasi:</b> {s['card_holder']}\n"
        f"🎬 <b>1 ta video narxi:</b> <b>{fmt_sum(s['video_price'])}</b>\n"
        f"👑 <b>Premium (1 oy cheksiz):</b> <b>{fmt_sum(s['premium_price'])}</b>\n\n"
        f"👥 Foydalanuvchilar: <b>{st['total_users']}</b> | "
        f"👑 Faol Premium: <b>{st['active_premium']}</b>\n"
        f"🎬 Yasalgan videolar: <b>{st['total_videos']}</b> | "
        f"⏳ Kutayotgan cheklar: <b>{st['pending_payments']}</b>"
    )

    kb = {
        "inline_keyboard": [
            [{"text": "💳 Karta raqamini kiritish", "callback_data": "adm_set_card"}],
            [{"text": "👤 Karta egasi (Ism Familiya)", "callback_data": "adm_set_holder"}],
            [{"text": "🎬 1 ta video narxini saqlash", "callback_data": "adm_set_video_price"}],
            [{"text": "👑 Premium (1 oy) narxini sozlash", "callback_data": "adm_set_prem_price"}],
            [
                {"text": f"⏳ Kutayotgan to‘lovlar ({st['pending_payments']})", "callback_data": "adm_pending"},
                {"text": "🔄 Yangilash", "callback_data": "admin_home"},
            ],
        ]
    }
    tg_call(
        "sendMessage",
        {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "reply_markup": kb},
        timeout=15,
    )


def send_payment_card_to_admin(adm_id, pay):
    is_prem = pay["plan"] == "premium"
    plan_txt = "👑 1 OYLIK CHEKSIZ PREMIUM" if is_prem else "🎬 1 MARTA RASM YUKLASH / VIDEO"
    approve_btn = "✅ Tasdiqlash (30 kun Premium)" if is_prem else "✅ Tasdiqlash (+1 rasm/video)"
    ts = time.strftime("%d.%m.%Y %H:%M", time.localtime(pay.get("created_at") or time.time()))

    caption = (
        f"🧾 <b>YANGI TO‘LOV CHEKI (#{pay['id']})</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"📦 <b>Sotib olinayotgan tarif:</b>\n"
        f"    <b>{plan_txt}</b>\n"
        f"💰 <b>To‘lov summasi:</b> <b>{fmt_sum(pay['amount'])}</b>\n"
        f"👤 <b>Foydalanuvchi:</b> {pay['user_name']}\n"
        f"🆔 <b>Telegram ID:</b> <code>{pay['chat_id']}</code>\n"
        f"🕒 <b>Vaqt:</b> {ts}\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        "Chekni tekshirib pastdan tasdiqlang yoki rad eting:"
    )
    kb = {
        "inline_keyboard": [
            [{"text": approve_btn, "callback_data": f"pay_ok:{pay['id']}"}],
            [{"text": "❌ Rad etish", "callback_data": f"pay_no:{pay['id']}"}],
        ]
    }
    fid = pay.get("file_id")
    mtype = pay.get("media_type", "photo")
    if fid and mtype == "photo":
        tg_call(
            "sendPhoto",
            {"chat_id": adm_id, "photo": fid, "caption": caption, "parse_mode": "HTML", "reply_markup": kb},
            timeout=15,
        )
    elif fid and mtype == "document":
        tg_call(
            "sendDocument",
            {"chat_id": adm_id, "document": fid, "caption": caption, "parse_mode": "HTML", "reply_markup": kb},
            timeout=15,
        )
    else:
        tg_call(
            "sendMessage",
            {"chat_id": adm_id, "text": caption, "parse_mode": "HTML", "reply_markup": kb},
            timeout=15,
        )


def send_pending_payments(chat_id):
    if not store.is_admin(chat_id):
        return
    items = store.get_pending_payments()
    if not items:
        tg_call(
            "sendMessage",
            {"chat_id": chat_id, "text": "✅ Hozircha kutayotgan to‘lovlar yo‘q."},
            timeout=10,
        )
        return
    for p in items[:10]:
        send_payment_card_to_admin(chat_id, p)


def send_browser_link(chat_id):
    base_url = get_live_webapp_url()
    personal_url = f"{base_url}/?chat_id={chat_id}"
    text = (
        "🌐 <b>Brauzerda ochish uchun shaxsiy havolangiz:</b>\n\n"
        "Havolani ochib animatsiya tanlang, rasmingizni yuklang va <b>«Botga tayyor video yuborish»</b> "
        "tugmasini bosing — video tayyor MP4 holatda shu chatga tushadi!\n\n"
        f"🆔 Sizning ID: <code>{chat_id}</code>"
    )
    tg_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [
                    [{"text": "🌐 Brauzerda ochish", "url": personal_url}],
                    [{"text": "✦ Telegram ichida ochish", "web_app": {"url": personal_url}}],
                ]
            },
        },
        timeout=15,
    )


def send_help(chat_id):
    s = store.get_settings()
    text = (
        "📖 <b>Foydalanish qo‘llanmasi:</b>\n\n"
        "1️⃣ <b>«✦ Glow Trace Art ochish»</b> tugmasini bosing.\n"
        "2️⃣ 12 ta animatsiyadan birini tanlang (Matrix 0/1, 3D Gologramma, Raketa, Zarracha gullashi va b.).\n"
        "3️⃣ <b>1-rasmingiz BEPUL!</b> Keyingi rasmlar uchun:\n"
        f"   • 1 ta video: <b>{fmt_sum(s['video_price'])}</b>\n"
        f"   • 1 oy cheksiz Premium: <b>{fmt_sum(s['premium_price'])}</b>\n"
        "4️⃣ <b>«Botga tayyor video yuborish»</b> tugmasini bosing — tayyor <b>MP4 video</b> shu botga keladi!"
    )
    tg_call("sendMessage", {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}, timeout=15)


def finalize_receipt_submission(chat_id, uname, plan, file_id, media_type):
    s = store.get_settings()
    amount = s["premium_price"] if plan == "premium" else s["video_price"]
    pay = store.create_payment(chat_id, uname.strip(), plan, amount, file_id=file_id, media_type=media_type)
    USER_STATES.pop(str(chat_id), None)

    plan_label = "👑 1 oylik cheksiz Premium" if plan == "premium" else "🎬 1 marta rasm yuklash / video"
    tg_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": (
                f"✅ <b>Chekingiz adminga yuborildi!</b>\n\n"
                f"📦 Tarif: <b>{plan_label}</b>\n"
                f"💰 Summa: <b>{fmt_sum(amount)}</b>\n\n"
                "Admin tasdiqlashi bilan darhol xabar keladi."
            ),
            "parse_mode": "HTML",
        },
        timeout=10,
    )

    admins = store.get_admin_ids()
    for adm_id in admins:
        send_payment_card_to_admin(adm_id, pay)


def handle_receipt_media(msg):
    chat_id = str(msg["chat"]["id"])
    file_id = None
    media_type = "photo"
    if msg.get("photo"):
        file_id = msg["photo"][-1]["file_id"]
        media_type = "photo"
    elif msg.get("document"):
        file_id = msg["document"]["file_id"]
        media_type = "document"
    else:
        return False

    user = msg.get("from", {})
    uname = user.get("first_name", "") + (f" (@{user['username']})" if user.get("username") else "")
    st = USER_STATES.get(chat_id)

    if st and st.get("action") == "await_receipt":
        finalize_receipt_submission(chat_id, uname, st["plan"], file_id, media_type)
        return True

    # User sent a receipt screenshot directly without picking a plan first -> ask which plan!
    s = store.get_settings()
    USER_STATES[chat_id] = {
        "action": "choose_plan_for_receipt",
        "file_id": file_id,
        "media_type": media_type,
        "uname": uname,
    }
    tg_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": "📸 <b>Chek rasmi qabul qilindi!</b>\n\nQaysi tarif uchun to‘lov qildingiz? Pastdan tanlang:",
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [
                    [{"text": f"🎬 1 marta rasm/video ({fmt_sum(s['video_price'])})", "callback_data": "rcpt_plan:video"}],
                    [{"text": f"👑 1 oylik Premium ({fmt_sum(s['premium_price'])})", "callback_data": "rcpt_plan:premium"}],
                    [{"text": "❌ Bekor qilish", "callback_data": "cancel_state"}],
                ]
            },
        },
        timeout=15,
    )
    return True


def handle_admin_input(chat_id, text):
    cid = str(chat_id)
    st = USER_STATES.get(cid)
    if not st or not store.is_admin(cid):
        return False

    action = st.get("action")
    if action == "adm_set_card":
        store.update_setting("card_number", text.strip())
        USER_STATES.pop(cid, None)
        tg_call("sendMessage", {"chat_id": cid, "text": f"✅ Karta raqami saqlandi: <code>{text.strip()}</code>", "parse_mode": "HTML"})
        send_admin_panel(cid)
        return True
    if action == "adm_set_holder":
        store.update_setting("card_holder", text.strip())
        USER_STATES.pop(cid, None)
        tg_call("sendMessage", {"chat_id": cid, "text": f"✅ Karta egasi saqlandi: <b>{text.strip()}</b>", "parse_mode": "HTML"})
        send_admin_panel(cid)
        return True
    if action in ("adm_set_video_price", "adm_set_prem_price"):
        digits = re.sub(r"[^\d]", "", text)
        if not digits:
            tg_call("sendMessage", {"chat_id": cid, "text": "⚠️ Iltimos, faqat raqam kiriting (masalan: 15000):"})
            return True
        val = int(digits)
        key = "video_price" if action == "adm_set_video_price" else "premium_price"
        label = "1 ta video narxi" if key == "video_price" else "Premium (1 oy) narxi"
        store.update_setting(key, val)
        USER_STATES.pop(cid, None)
        tg_call("sendMessage", {"chat_id": cid, "text": f"✅ {label} saqlandi: <b>{fmt_sum(val)}</b>", "parse_mode": "HTML"})
        send_admin_panel(cid)
        return True
    return False


def handle_update(upd):
    if "callback_query" in upd:
        cq = upd["callback_query"]
        cq_id = cq.get("id")
        chat_id = cq.get("message", {}).get("chat", {}).get("id")
        data = cq.get("data", "")
        tg_call("answerCallbackQuery", {"callback_query_id": cq_id}, timeout=8)
        if not chat_id:
            return
        cid = str(chat_id)

        if data == "cancel_state":
            USER_STATES.pop(cid, None)
            tg_call("sendMessage", {"chat_id": cid, "text": "❌ Bekor qilindi."})
        elif data == "help":
            send_help(cid)
        elif data == "tarifs":
            send_tarifs(cid)
        elif data == "buy_video":
            prompt_payment_receipt(cid, "video")
        elif data == "buy_premium":
            prompt_payment_receipt(cid, "premium")
        elif data.startswith("rcpt_plan:"):
            plan = data.split(":", 1)[1]
            st = USER_STATES.get(cid)
            if st and st.get("action") == "choose_plan_for_receipt":
                finalize_receipt_submission(cid, st["uname"], plan, st["file_id"], st["media_type"])
            else:
                prompt_payment_receipt(cid, plan)
        elif data == "admin_home":
            send_admin_panel(cid)
        elif data == "adm_pending":
            send_pending_payments(cid)
        elif data in ("adm_set_card", "adm_set_holder", "adm_set_video_price", "adm_set_prem_price"):
            if not store.is_admin(cid):
                return
            USER_STATES[cid] = {"action": data}
            prompts = {
                "adm_set_card": "💳 Yangi <b>karta raqamini</b> yuboring (masalan: <code>8600 1234 5678 9012</code>):",
                "adm_set_holder": "👤 <b>Karta egasining ism familiyasini</b> yuboring (masalan: <code>Ali Valiyev</code>):",
                "adm_set_video_price": "🎬 <b>1 ta video tayyorlash narxini</b> so‘mda kiriting (masalan: <code>10000</code>):",
                "adm_set_prem_price": "👑 <b>1 oylik cheksiz Premium narxini</b> so‘mda kiriting (masalan: <code>49000</code>):",
            }
            tg_call(
                "sendMessage",
                {
                    "chat_id": cid,
                    "text": prompts[data],
                    "parse_mode": "HTML",
                    "reply_markup": {"inline_keyboard": [[{"text": "❌ Bekor qilish", "callback_data": "cancel_state"}]]},
                },
            )
        elif data.startswith("pay_ok:") or data.startswith("pay_no:"):
            if not store.is_admin(cid):
                return
            approve = data.startswith("pay_ok:")
            pay_id = data.split(":", 1)[1]
            rec = store.resolve_payment(pay_id, approve=approve)
            if not rec:
                tg_call("sendMessage", {"chat_id": cid, "text": "⚠️ To‘lov topilmadi yoki allaqachon ko‘rib chiqilgan."})
                return
            u_cid = rec["chat_id"]
            if approve:
                plan_txt = "👑 1 oylik cheksiz Premium" if rec["plan"] == "premium" else "🎬 +1 ta video tayyorlash huquqi"
                tg_call("sendMessage", {"chat_id": cid, "text": f"✅ To‘lov #{pay_id} tasdiqlandi! ({plan_txt})"})
                tg_call(
                    "sendMessage",
                    {
                        "chat_id": u_cid,
                        "text": f"🎉 <b>To‘lovingiz tasdiqlandi!</b>\n\nSizga <b>{plan_txt}</b> berildi. Endi ilovaga kirib rasmingizni yuklashingiz mumkin!",
                        "parse_mode": "HTML",
                    },
                )
            else:
                tg_call("sendMessage", {"chat_id": cid, "text": f"❌ To‘lov #{pay_id} rad etildi."})
                tg_call(
                    "sendMessage",
                    {
                        "chat_id": u_cid,
                        "text": "❌ To‘lovingiz tasdiqlanmadi. Iltimos, chekni tekshirib qayta yuboring yoki admin bilan bog‘laning.",
                    },
                )
        return

    msg = upd.get("message")
    if not msg:
        return
    chat_id = msg.get("chat", {}).get("id")
    if not chat_id:
        return

    # Receipt screenshot photo or file/document?
    if msg.get("photo") or msg.get("document"):
        if handle_receipt_media(msg):
            return

    text = (msg.get("text") or "").strip()
    user = msg.get("from", {})
    first_name = user.get("first_name", "")
    username = user.get("username", "")

    if text.startswith("/start"):
        USER_STATES.pop(str(chat_id), None)
        parts = text.split(maxsplit=1)
        arg = parts[1].strip() if len(parts) > 1 else ""
        store.ensure_user(chat_id, first_name, username)
        if arg == "buy_video":
            prompt_payment_receipt(chat_id, "video")
            return
        if arg == "buy_premium":
            prompt_payment_receipt(chat_id, "premium")
            return
        send_start(chat_id, first_name, username)
        return
    if text.startswith("/admin") or "Admin panel" in text:
        USER_STATES.pop(str(chat_id), None)
        send_admin_panel(chat_id)
        return
    if text.startswith("/tarif") or "Tariflar" in text or "To‘lov" in text:
        USER_STATES.pop(str(chat_id), None)
        send_tarifs(chat_id)
        return
    if text.startswith("/browser") or "Brauzerda ochish" in text:
        send_browser_link(chat_id)
        return
    if text.startswith("/help") or "Qo‘llanma" in text:
        send_help(chat_id)
        return

    # Check if admin is typing a setting value
    if text and handle_admin_input(chat_id, text):
        return

    send_start(chat_id, first_name, username)


def main():
    print("Starting Glow Trace Art Telegram Bot (with Admin & Payments)...", flush=True)
    tg_call("deleteWebhook", {"drop_pending_updates": False}, timeout=10)
    last_url = get_live_webapp_url()
    setup_bot_menu(last_url)
    print(f"Live WebApp URL: {last_url}", flush=True)

    offset = 0
    last_menu_sync = time.time()

    while True:
        try:
            if time.time() - last_menu_sync > 60:
                cur_url = get_live_webapp_url()
                if cur_url != last_url:
                    last_url = cur_url
                    setup_bot_menu(last_url)
                    print(f"Updated WebApp URL: {last_url}", flush=True)
                last_menu_sync = time.time()

            resp = tg_call(
                "getUpdates",
                {"offset": offset, "timeout": 25, "allowed_updates": ["message", "callback_query"]},
                timeout=35,
            )
            if resp.get("ok"):
                for upd in resp.get("result", []):
                    offset = upd["update_id"] + 1
                    handle_update(upd)
            else:
                time.sleep(2)
        except Exception as e:
            print(f"Loop error: {e}", flush=True)
            time.sleep(3)


if __name__ == "__main__":
    main()
