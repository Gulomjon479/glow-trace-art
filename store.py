import json
import os
import time
import uuid

try:
    import fcntl
except ImportError:
    fcntl = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")
LOCK_FILE = os.path.join(BASE_DIR, "data.lock")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_wIk0yGFiSH4e@ep-sweet-rain-be29z29r-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
)

try:
    import psycopg2
except ImportError:
    psycopg2 = None

DEFAULT_DATA = {
    "admin_ids": ["1972059053"],
    "settings": {
        "card_number": "5614 6824 1425 9384",
        "card_holder": "FAXRIDDINOVA NODIRA",
        "video_price": 3000,
        "premium_price": 25000,
    },
    "users": {},
    "payments": {},
}


def _ensure_structure(data):
    if not isinstance(data, dict):
        data = {}
    data.setdefault("admin_ids", [])
    settings = data.setdefault("settings", {})
    for k, v in DEFAULT_DATA["settings"].items():
        settings.setdefault(k, v)
    data.setdefault("users", {})
    data.setdefault("payments", {})
    return data


def _with_lock(fn):
    os.makedirs(BASE_DIR, exist_ok=True)
    with open(LOCK_FILE, "a+") as lf:
        if fcntl:
            fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
        try:
            if os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except Exception:
                    data = {}
            else:
                data = {}
            data = _ensure_structure(data)
            result, modified = fn(data)
            if modified:
                tmp = DATA_FILE + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                os.replace(tmp, DATA_FILE)
            return result
        finally:
            if fcntl:
                fcntl.flock(lf.fileno(), fcntl.LOCK_UN)


def get_settings():
    def _op(data):
        return dict(data["settings"]), False
    return _with_lock(_op)


def update_setting(key, value):
    def _op(data):
        data["settings"][key] = value
        return dict(data["settings"]), True
    return _with_lock(_op)


def get_admin_ids():
    def _op(data):
        return list(data["admin_ids"]), False
    return _with_lock(_op)


def is_admin(chat_id):
    cid = str(chat_id)
    def _op(data):
        return cid in [str(x) for x in data["admin_ids"]], False
    return _with_lock(_op)


def claim_admin_if_empty(chat_id):
    """If no admin is registered yet, register this user as owner admin."""
    cid = str(chat_id)
    def _op(data):
        admins = [str(x) for x in data["admin_ids"]]
        if not admins:
            data["admin_ids"] = [cid]
            return True, True
        return (cid in admins), False
    return _with_lock(_op)


def ensure_user(chat_id, name="", username=""):
    cid = str(chat_id)
    def _op(data):
        u = data["users"].get(cid)
        changed = False
        if not u:
            u = {
                "name": name or "",
                "username": username or "",
                "free_used": False,
                "credits": 0,
                "premium_until": 0,
                "videos_created": 0,
                "created_at": int(time.time()),
            }
            data["users"][cid] = u
            changed = True
        else:
            if name and u.get("name") != name:
                u["name"] = name
                changed = True
            if username and u.get("username") != username:
                u["username"] = username
                changed = True
        return dict(u), changed
    return _with_lock(_op)


def get_user_status(chat_id):
    cid = str(chat_id)
    now = int(time.time())
    def _op(data):
        u = data["users"].get(cid)
        if not u:
            u = {
                "name": "",
                "username": "",
                "free_used": False,
                "credits": 0,
                "premium_until": 0,
                "videos_created": 0,
                "created_at": now,
            }
            data["users"][cid] = u
            changed = True
        else:
            changed = False

        is_adm = cid in [str(x) for x in data["admin_ids"]]
        prem_until = int(u.get("premium_until", 0) or 0)
        is_premium = prem_until > now
        free_used = bool(u.get("free_used", False))
        credits = int(u.get("credits", 0) or 0)
        can_upload = is_adm or is_premium or (not free_used) or (credits > 0)

        return {
            "chat_id": cid,
            "is_admin": is_adm,
            "free_used": free_used,
            "free_remaining": 0 if free_used else 1,
            "credits": credits,
            "is_premium": is_premium,
            "premium_until": prem_until,
            "premium_days_left": max(0, (prem_until - now) // 86400) if is_premium else 0,
            "can_upload": can_upload,
            "videos_created": int(u.get("videos_created", 0) or 0),
            "settings": dict(data["settings"]),
        }, changed
    return _with_lock(_op)


def consume_upload_access(chat_id):
    """Consume 1 free trial or 1 video credit before uploading a new image."""
    cid = str(chat_id)
    now = int(time.time())
    def _op(data):
        u = data["users"].setdefault(cid, {
            "name": "",
            "username": "",
            "free_used": False,
            "credits": 0,
            "premium_until": 0,
            "videos_created": 0,
            "created_at": now,
        })
        is_adm = cid in [str(x) for x in data["admin_ids"]]
        prem_until = int(u.get("premium_until", 0) or 0)
        if is_adm:
            u["videos_created"] = int(u.get("videos_created", 0)) + 1
            return {"allowed": True, "reason": "admin"}, True
        if prem_until > now:
            u["videos_created"] = int(u.get("videos_created", 0)) + 1
            return {"allowed": True, "reason": "premium"}, True
        if not u.get("free_used", False):
            u["free_used"] = True
            u["videos_created"] = int(u.get("videos_created", 0)) + 1
            return {"allowed": True, "reason": "free"}, True
        credits = int(u.get("credits", 0) or 0)
        if credits > 0:
            u["credits"] = credits - 1
            u["videos_created"] = int(u.get("videos_created", 0)) + 1
            return {"allowed": True, "reason": "credit", "credits_left": u["credits"]}, True
        return {"allowed": False, "reason": "payment_required"}, False
    return _with_lock(_op)


def create_payment(chat_id, user_name, plan, amount, file_id="", media_type="photo"):
    cid = str(chat_id)
    pay_id = uuid.uuid4().hex[:10]
    now = int(time.time())
    def _op(data):
        rec = {
            "id": pay_id,
            "chat_id": cid,
            "user_name": user_name or cid,
            "plan": plan,
            "amount": int(amount),
            "file_id": file_id or "",
            "media_type": media_type or "photo",
            "status": "pending",
            "created_at": now,
        }
        data["payments"][pay_id] = rec
        return rec, True
    return _with_lock(_op)


def resolve_payment(pay_id, approve=True):
    now = int(time.time())
    def _op(data):
        rec = data["payments"].get(pay_id)
        if not rec:
            return None, False
        if rec["status"] != "pending":
            return rec, False
        rec["status"] = "approved" if approve else "rejected"
        rec["resolved_at"] = now
        if approve:
            cid = str(rec["chat_id"])
            u = data["users"].setdefault(cid, {
                "name": rec.get("user_name", ""),
                "username": "",
                "free_used": False,
                "credits": 0,
                "premium_until": 0,
                "videos_created": 0,
                "created_at": now,
            })
            if rec["plan"] == "premium":
                base = max(now, int(u.get("premium_until", 0) or 0))
                u["premium_until"] = base + 30 * 86400
            else:
                u["credits"] = int(u.get("credits", 0) or 0) + 1
        return dict(rec), True
    return _with_lock(_op)


def get_pending_payments():
    def _op(data):
        items = [p for p in data["payments"].values() if p.get("status") == "pending"]
        items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
        return items, False
    return _with_lock(_op)


def get_stats():
    now = int(time.time())
    def _op(data):
        users = data["users"].values()
        total_users = len(data["users"])
        active_premium = sum(1 for u in users if int(u.get("premium_until", 0) or 0) > now)
        total_videos = sum(int(u.get("videos_created", 0) or 0) for u in users)
        pending_pays = sum(1 for p in data["payments"].values() if p.get("status") == "pending")
        approved_pays = sum(1 for p in data["payments"].values() if p.get("status") == "approved")
        return {
            "total_users": total_users,
            "active_premium": active_premium,
            "total_videos": total_videos,
            "pending_payments": pending_pays,
            "approved_payments": approved_pays,
        }, False
    return _with_lock(_op)
