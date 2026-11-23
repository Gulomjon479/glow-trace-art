import os
import subprocess
import tempfile
import requests
from flask import Flask, jsonify, request, send_from_directory

import store

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

BOT_TOKEN = os.environ.get(
    "GLOW_BOT_TOKEN",
    "8200347739:AAFI_FPY7IN7J1v5_9TeRFSBIbBYrQR4Ytc",
)
TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 60 * 1024 * 1024  # 60 MB max video


@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/health")
def health():
    return jsonify({"ok": True, "service": "glow-trace-art"})


@app.route("/api/user-status", methods=["GET", "OPTIONS"])
def api_user_status():
    if request.method == "OPTIONS":
        return ("", 204)
    chat_id = (request.args.get("chat_id") or "").strip()
    if not chat_id:
        return jsonify({
            "ok": True,
            "guest": True,
            "can_upload": True,
            "free_remaining": 1,
            "credits": 0,
            "is_premium": False,
            "settings": store.get_settings(),
        })
    status = store.get_user_status(chat_id)
    status["ok"] = True
    return jsonify(status)


@app.route("/api/consume-upload", methods=["POST", "OPTIONS"])
def api_consume_upload():
    if request.method == "OPTIONS":
        return ("", 204)
    body = request.get_json(silent=True) or {}
    chat_id = str(body.get("chat_id") or "").strip()
    if not chat_id:
        return jsonify({
            "ok": False,
            "allowed": False,
            "reason": "no_chat_id",
            "settings": store.get_settings(),
        }), 400

    res = store.consume_upload_access(chat_id)
    status = store.get_user_status(chat_id)
    return jsonify({
        "ok": True,
        "allowed": res["allowed"],
        "reason": res["reason"],
        "status": status,
    })


@app.route("/api/send-to-telegram", methods=["POST", "OPTIONS"])
def send_to_telegram():
    if request.method == "OPTIONS":
        return ("", 204)

    chat_id = (request.form.get("chat_id") or "").strip()
    caption = (request.form.get("caption") or "✦ Glow Trace Art").strip()
    video_file = request.files.get("video")

    if not chat_id:
        return jsonify({"ok": False, "error": "chat_id ko'rsatilmagan"}), 400
    if not video_file:
        return jsonify({"ok": False, "error": "Video fayl topilmadi"}), 400

    try:
        requests.post(
            f"{TG_API}/sendChatAction",
            data={"chat_id": chat_id, "action": "upload_video"},
            timeout=5,
        )
    except Exception:
        pass

    tmp_in = None
    tmp_out = None
    try:
        ext = os.path.splitext(video_file.filename or "video.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as f_in:
            video_file.save(f_in)
            tmp_in = f_in.name

        tmp_out = tmp_in + ".mp4"
        send_path = tmp_in

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            tmp_in,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-profile:v",
            "high",
            "-level",
            "4.0",
            "-preset",
            "veryfast",
            "-crf",
            "21",
            "-movflags",
            "+faststart",
            "-an",
            tmp_out,
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
        if res.returncode == 0 and os.path.exists(tmp_out) and os.path.getsize(tmp_out) > 1024:
            send_path = tmp_out

        final_caption = f"✦ {caption}\n\n@quiz15_testbot orqali tayyorlandi"
        with open(send_path, "rb") as vf:
            tg_resp = requests.post(
                f"{TG_API}/sendVideo",
                data={
                    "chat_id": chat_id,
                    "caption": final_caption[:1020],
                    "supports_streaming": "true",
                },
                files={"video": ("glow-trace-art.mp4", vf, "video/mp4")},
                timeout=90,
            )

        tg_json = tg_resp.json()
        if not tg_resp.ok or not tg_json.get("ok"):
            desc = tg_json.get("description") or f"HTTP {tg_resp.status_code}"
            return jsonify({"ok": False, "error": f"Telegram API: {desc}"}), 502

        return jsonify({"ok": True})
    except subprocess.TimeoutExpired:
        return jsonify({"ok": False, "error": "Video konvertatsiya vaqti tugadi"}), 504
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    finally:
        for p in (tmp_in, tmp_out):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8085)
