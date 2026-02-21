import os
import logging
import uuid
import threading
import time
import base64
from datetime import datetime, timedelta
from functools import lru_cache

from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes,
)
from telegram.constants import ParseMode
import supabase
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# ================= CONFIGURACIÓN =================
BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL_ID = os.getenv("CHANNEL_ID")
ADMIN_IDS = [int(id) for id in os.getenv("ADMIN_IDS", "").split(",") if id]
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://localhost")
SESSION_SECRET = os.getenv("SESSION_SECRET", os.urandom(24).hex())

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("bot.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Clientes Supabase
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_admin = supabase.create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Precios (tarjeta y monedero)
PRECIOS_TARJETA = {"clasico": 200, "premium": 350}
PRECIOS_SALDO = {"clasico": 120, "premium": 200}

# Métodos de pago
METODOS_PAGO = {
    "BPA": "9248-1299-7027-1730\nNúmero de confirmación: 63806513",
    "METRO": "9238959871181386\n63806513",
    "monedero": "63806513 (mismos precios que tarjeta)",
    "saldo": "63806513"
}

# ================= FUNCIONES AUXILIARES =================
def es_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS

def obtener_usuario(telegram_id: int):
    resp = supabase_client.table("usuarios").select("*").eq("telegram_id", telegram_id).execute()
    return resp.data[0] if resp.data else None

def usuario_activo(telegram_id: int) -> bool:
    user = obtener_usuario(telegram_id)
    if not user or not user.get("fecha_expiracion"):
        return False
    expiracion = datetime.fromisoformat(user["fecha_expiracion"])
    return expiracion > datetime.now()

@lru_cache(maxsize=128)
def buscar_peliculas_cached(query: str, limit: int = 10):
    """Búsqueda con caché simple."""
    resp = supabase_client.table("peliculas").select("*").ilike("titulo", f"%{query}%").limit(limit).execute()
    return resp.data

# ================= HANDLERS DEL BOT =================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    usuario = obtener_usuario(user.id)

    if usuario and usuario_activo(user.id):
        expiracion = datetime.fromisoformat(usuario["fecha_expiracion"])
        dias_restantes = (expiracion - datetime.now()).days
        keyboard = [
            [InlineKeyboardButton("🎬 Buscar películas", callback_data="buscar")],
            [InlineKeyboardButton("👤 Mi perfil", callback_data="perfil")],
            [InlineKeyboardButton("❓ Ayuda", callback_data="ayuda")]
        ]
        if es_admin(user.id):
            # Los admins ven enlace directo a la webapp con su ID
            webapp_link = f"{WEBAPP_URL}?tg_id={user.id}"
            keyboard.append([InlineKeyboardButton("⚙️ Panel Admin (Web)", url=webapp_link)])
        else:
            # Usuarios normales también pueden ir a la webapp con su ID
            webapp_link = f"{WEBAPP_URL}?tg_id={user.id}"
            keyboard.append([InlineKeyboardButton("🌐 Abrir WebApp", url=webapp_link)])
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            f"✨ ¡Bienvenido de nuevo, {user.first_name}! ✨\n\n"
            f"🎬 Tu suscripción **{usuario['plan']}** está activa.\n"
            f"📅 Días restantes: {dias_restantes}\n\n"
            "¿Qué deseas hacer?",
            reply_markup=reply_markup,
            parse_mode=ParseMode.MARKDOWN
        )
    else:
        keyboard = [
            [InlineKeyboardButton("🎬 Plan Clásico", callback_data="plan_clasico")],
            [InlineKeyboardButton("🌟 Plan Premium", callback_data="plan_premium")],
            [InlineKeyboardButton("🌐 Abrir WebApp", url=f"{WEBAPP_URL}?tg_id={user.id}")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            "🍿 **¡Bienvenido al CineBot!** 🍿\n\n"
            "Para acceder al catálogo de películas debes suscribirte.\n\n"
            "**Precios:**\n"
            "• Tarjeta/Monedero: Clásico 200 CUP | Premium 350 CUP\n"
            "• Saldo Móvil: Clásico 120 CUP | Premium 200 CUP\n\n"
            "Puedes pagar desde el bot o desde la webapp.",
            reply_markup=reply_markup,
            parse_mode=ParseMode.MARKDOWN
        )

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("plan_"):
        plan = data.split("_")[1]
        context.user_data["plan"] = plan
        texto = (
            f"📌 **Has elegido el plan {plan.capitalize()}**\n\n"
            "**Instrucciones de pago:**\n"
            "Realiza el depósito a una de las siguientes cuentas:\n\n"
            f"🏦 **BPA:**\n{METODOS_PAGO['BPA']}\n\n"
            f"🏧 **METRO:**\n{METODOS_PAGO['METRO']}\n\n"
            f"📱 **Monedero:**\n{METODOS_PAGO['monedero']}\n\n"
            f"📞 **Saldo Móvil:**\n{METODOS_PAGO['saldo']}\n"
            f"   * Clásico: {PRECIOS_SALDO['clasico']} CUP\n"
            f"   * Premium: {PRECIOS_SALDO['premium']} CUP\n\n"
            "✅ **Luego de pagar, envía una captura de pantalla del comprobante.**\n"
            "El administrador verificará y activará tu suscripción."
        )
        keyboard = [[InlineKeyboardButton("🔙 Volver al inicio", callback_data="volver_inicio")]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text(texto, reply_markup=reply_markup, parse_mode=ParseMode.MARKDOWN)

    elif data == "buscar":
        await query.edit_message_text(
            "🔍 Escribe el nombre de la película que deseas buscar.\n"
            "Ejemplo: `Avengers Endgame`",
            parse_mode=ParseMode.MARKDOWN
        )

    elif data == "perfil":
        user_id = query.from_user.id
        usuario = obtener_usuario(user_id)
        if not usuario or not usuario_activo(user_id):
            await query.edit_message_text("❌ No tienes una suscripción activa.")
            return
        expiracion = datetime.fromisoformat(usuario["fecha_expiracion"])
        dias_restantes = (expiracion - datetime.now()).days
        keyboard = [
            [InlineKeyboardButton("🎬 Buscar películas", callback_data="buscar")],
            [InlineKeyboardButton("🔄 Renovar suscripción", callback_data="renovar")],
            [InlineKeyboardButton("🔙 Volver al inicio", callback_data="volver_inicio")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text(
            f"👤 **Tu perfil**\n\n"
            f"Plan: **{usuario['plan']}**\n"
            f"Fecha de expiración: {expiracion.strftime('%d/%m/%Y')}\n"
            f"Días restantes: {dias_restantes}",
            reply_markup=reply_markup,
            parse_mode=ParseMode.MARKDOWN
        )

    elif data == "renovar":
        keyboard = [
            [InlineKeyboardButton("🎬 Plan Clásico", callback_data="plan_clasico")],
            [InlineKeyboardButton("🌟 Plan Premium", callback_data="plan_premium")],
            [InlineKeyboardButton("🔙 Volver al inicio", callback_data="volver_inicio")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text(
            "Selecciona el plan para renovar tu suscripción:",
            reply_markup=reply_markup
        )

    elif data == "ayuda":
        keyboard = [[InlineKeyboardButton("🔙 Volver al inicio", callback_data="volver_inicio")]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text(
            "❓ **Ayuda**\n\n"
            "• Para buscar películas, usa el botón 'Buscar' y escribe el nombre.\n"
            "• Si no tienes suscripción, elige un plan y sigue las instrucciones de pago.\n"
            "• Envía la captura del comprobante y espera la aprobación.\n"
            "• Una vez activo, podrás ver tu perfil y tiempo restante.\n\n"
            "Si tienes problemas, contacta al administrador.",
            reply_markup=reply_markup,
            parse_mode=ParseMode.MARKDOWN
        )

    elif data == "volver_inicio":
        user_id = query.from_user.id
        usuario = obtener_usuario(user_id)
        if usuario and usuario_activo(user_id):
            expiracion = datetime.fromisoformat(usuario["fecha_expiracion"])
            dias_restantes = (expiracion - datetime.now()).days
            keyboard = [
                [InlineKeyboardButton("🎬 Buscar películas", callback_data="buscar")],
                [InlineKeyboardButton("👤 Mi perfil", callback_data="perfil")],
                [InlineKeyboardButton("❓ Ayuda", callback_data="ayuda")]
            ]
            if es_admin(user_id):
                webapp_link = f"{WEBAPP_URL}?tg_id={user_id}"
                keyboard.append([InlineKeyboardButton("⚙️ Panel Admin (Web)", url=webapp_link)])
            else:
                webapp_link = f"{WEBAPP_URL}?tg_id={user_id}"
                keyboard.append([InlineKeyboardButton("🌐 Abrir WebApp", url=webapp_link)])
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text(
                f"✨ ¡Bienvenido de nuevo! ✨\n\n"
                f"🎬 Tu suscripción **{usuario['plan']}** está activa.\n"
                f"📅 Días restantes: {dias_restantes}\n\n"
                "¿Qué deseas hacer?",
                reply_markup=reply_markup,
                parse_mode=ParseMode.MARKDOWN
            )
        else:
            keyboard = [
                [InlineKeyboardButton("🎬 Plan Clásico", callback_data="plan_clasico")],
                [InlineKeyboardButton("🌟 Plan Premium", callback_data="plan_premium")],
                [InlineKeyboardButton("🌐 Abrir WebApp", url=f"{WEBAPP_URL}?tg_id={user_id}")]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text(
                "🍿 **Bienvenido al CineBot** 🍿\n\n"
                "Elige un plan para comenzar:",
                reply_markup=reply_markup,
                parse_mode=ParseMode.MARKDOWN
            )

async def handle_captura(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    plan = context.user_data.get("plan")
    if not plan:
        await update.message.reply_text("⚠️ Primero debes elegir un plan con /start")
        return

    photo_file = await update.message.photo[-1].get_file()
    file_name = f"{user.id}_{plan}_{uuid.uuid4()}.jpg"
    photo_bytes = await photo_file.download_as_bytearray()

    try:
        supabase_admin.storage.from_("capturas").upload(file_name, photo_bytes, {"content-type": "image/jpeg"})
    except Exception as e:
        logger.error(f"Error al subir captura: {e}")
        await update.message.reply_text("❌ Error al procesar la imagen. Intenta de nuevo.")
        return

    public_url = supabase_admin.storage.from_("capturas").get_public_url(file_name)

    supabase_admin.table("solicitudes_pago").insert({
        "telegram_id": user.id,
        "plan_solicitado": plan,
        "metodo_pago": "desconocido",
        "captura_url": public_url,
        "estado": "pendiente"
    }).execute()

    keyboard = [[InlineKeyboardButton("🔙 Volver al inicio", callback_data="volver_inicio")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "✅ **¡Solicitud recibida!**\n\n"
        "El administrador verificará el pago en breve. Te notificaremos cuando esté aprobado.\n"
        "Gracias por tu paciencia 🙌",
        reply_markup=reply_markup,
        parse_mode=ParseMode.MARKDOWN
    )

    for admin_id in ADMIN_IDS:
        try:
            await context.bot.send_message(
                admin_id,
                f"📩 Nueva solicitud de pago de {user.first_name} (@{user.username})\n"
                f"Plan: {plan}\n"
                f"ID: {user.id}\n"
                f"Revisa en la webapp: {WEBAPP_URL}?tg_id={admin_id}"
            )
        except Exception as e:
            logger.warning(f"No se pudo notificar al admin {admin_id}: {e}")

async def buscar_pelicula(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not usuario_activo(user_id):
        await update.message.reply_text("⚠️ No tienes una suscripción activa. Usa /start para ver los planes.")
        return

    query = update.message.text.strip()
    if len(query) < 3:
        await update.message.reply_text("🔍 Escribe al menos 3 caracteres para buscar.")
        return

    resultados = buscar_peliculas_cached(query, limit=20)

    if not resultados:
        keyboard = [[InlineKeyboardButton("🔙 Volver al inicio", callback_data="volver_inicio")]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            f"😕 No encontré ninguna película con '{query}'. Prueba con otro título.",
            reply_markup=reply_markup
        )
        return

    context.user_data["ultima_busqueda"] = {
        "query": query,
        "resultados": resultados,
        "pagina": 0
    }
    await mostrar_pagina(update, context, 0)

async def mostrar_pagina(update: Update, context: ContextTypes.DEFAULT_TYPE, pagina: int, edit: bool = False):
    busqueda = context.user_data.get("ultima_busqueda")
    if not busqueda:
        return

    resultados = busqueda["resultados"]
    total_paginas = (len(resultados) + 9) // 10
    inicio = pagina * 10
    fin = inicio + 10
    pagina_actual = resultados[inicio:fin]

    keyboard = []
    for peli in pagina_actual:
        keyboard.append([InlineKeyboardButton(peli["titulo"], callback_data=f"pelicula_{peli['id']}")])

    nav_buttons = []
    if pagina > 0:
        nav_buttons.append(InlineKeyboardButton("⬅️ Anterior", callback_data=f"pagina_{pagina-1}"))
    if pagina < total_paginas - 1:
        nav_buttons.append(InlineKeyboardButton("Siguiente ➡️", callback_data=f"pagina_{pagina+1}"))
    if nav_buttons:
        keyboard.append(nav_buttons)

    keyboard.append([InlineKeyboardButton("🔙 Volver al inicio", callback_data="volver_inicio")])

    reply_markup = InlineKeyboardMarkup(keyboard)
    texto = f"🎥 **Resultados para '{busqueda['query']}' (página {pagina+1}/{total_paginas}):**"

    if edit:
        await update.callback_query.edit_message_text(texto, reply_markup=reply_markup, parse_mode=ParseMode.MARKDOWN)
    else:
        await update.message.reply_text(texto, reply_markup=reply_markup, parse_mode=ParseMode.MARKDOWN)

async def paginacion_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    if data.startswith("pagina_"):
        pagina = int(data.split("_")[1])
        await mostrar_pagina(update, context, pagina, edit=True)

async def enviar_pelicula(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user_id = query.from_user.id
    pelicula_id = query.data.split("_")[1]

    if not usuario_activo(user_id):
        await query.edit_message_text("⚠️ Tu suscripción no está activa.")
        return

    peli = supabase_client.table("peliculas").select("*").eq("id", pelicula_id).execute().data
    if not peli:
        await query.edit_message_text("❌ Película no encontrada.")
        return
    peli = peli[0]
    usuario = obtener_usuario(user_id)
    plan = usuario["plan"]
    protect = (plan == "clasico")

    try:
        await context.bot.forward_message(
            chat_id=user_id,
            from_chat_id=CHANNEL_ID,
            message_id=peli["message_id"],
            protect_content=protect
        )
        if protect:
            await context.bot.send_message(
                user_id,
                "ℹ️ Esta película tiene **protección de contenido**. No puedes reenviarla ni guardarla.\n"
                "Para disfrutar de estas funciones, actualiza al plan Premium.",
                parse_mode=ParseMode.MARKDOWN
            )
    except Exception as e:
        logger.error(f"Error al reenviar: {e}")
        await query.edit_message_text("❌ Ocurrió un error al enviar la película. Intenta más tarde.")

# ================= COMANDOS DE ADMIN =================
async def add_pelicula(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not es_admin(update.effective_user.id):
        return  # Silencio total para no admins

    if not update.message.reply_to_message:
        await update.message.reply_text("❌ Debes responder al mensaje de la película en el canal con /addpelicula Título")
        return

    replied = update.message.reply_to_message
    if str(replied.chat.id) != CHANNEL_ID:
        await update.message.reply_text("❌ El mensaje debe ser del canal de películas.")
        return

    try:
        titulo = " ".join(context.args)
        if not titulo:
            await update.message.reply_text("❌ Debes especificar el título. Ej: /addpelicula Avengers Endgame")
            return
    except:
        await update.message.reply_text("❌ Error en el comando. Usa: /addpelicula Título")
        return

    supabase_admin.table("peliculas").insert({
        "titulo": titulo,
        "message_id": replied.message_id,
        "canal_id": CHANNEL_ID
    }).execute()

    buscar_peliculas_cached.cache_clear()
    await update.message.reply_text(f"✅ Película '{titulo}' agregada correctamente.")

async def panel_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not es_admin(update.effective_user.id):
        return
    await update.message.reply_text(
        f"👨‍💼 **Panel de Administración**\n\n"
        f"Accede a la webapp: {WEBAPP_URL}?tg_id={update.effective_user.id}",
        parse_mode=ParseMode.MARKDOWN
    )

# ================= TAREA PROGRAMADA: NOTIFICACIONES DE EXPIRACIÓN =================
def verificar_expiraciones(app_bot):
    while True:
        try:
            ahora = datetime.now()
            for dias in [5, 3, 1]:
                fecha_limite = ahora + timedelta(days=dias)
                inicio_dia = datetime(fecha_limite.year, fecha_limite.month, fecha_limite.day, 0, 0, 0)
                fin_dia = inicio_dia + timedelta(days=1)
                resp = supabase_admin.table("usuarios").select("telegram_id").gte("fecha_expiracion", inicio_dia.isoformat()).lt("fecha_expiracion", fin_dia.isoformat()).execute()
                for user in resp.data:
                    try:
                        app_bot.bot.send_message(
                            chat_id=user["telegram_id"],
                            text=f"⏰ **Tu suscripción expira en {dias} día(s).**\nRenueva para seguir disfrutando del catálogo.",
                            parse_mode=ParseMode.MARKDOWN
                        )
                    except Exception as e:
                        logger.warning(f"Error al notificar expiración a {user['telegram_id']}: {e}")
        except Exception as e:
            logger.error(f"Error en verificar_expiraciones: {e}")
        time.sleep(6 * 3600)

# ================= SERVIDOR FLASK =================
flask_app = Flask(__name__, static_folder='webapp', static_url_path='')
flask_app.secret_key = SESSION_SECRET
CORS(flask_app, supports_credentials=True)

@flask_app.route('/')
def serve_webapp():
    return send_from_directory('webapp', 'index.html')

@flask_app.route('/webhook', methods=['POST'])
def webhook():
    update = Update.de_json(request.get_json(force=True), application.bot)
    application.process_update(update)
    return 'ok', 200

# ========== API PARA LA WEBAPP ==========
@flask_app.route('/api/user-status', methods=['POST'])
def user_status():
    data = request.json
    tid = data.get('telegram_id')
    if not tid:
        return jsonify({'error': 'Falta ID'}), 400
    usuario = obtener_usuario(int(tid))
    activo = usuario_activo(int(tid)) if usuario else False
    return jsonify({
        'existe': usuario is not None,
        'activo': activo,
        'plan': usuario['plan'] if usuario else None,
        'expiracion': usuario['fecha_expiracion'] if usuario else None,
        'es_admin': es_admin(int(tid))
    })

@flask_app.route('/api/submit-payment', methods=['POST'])
def submit_payment():
    data = request.json
    tid = data.get('telegram_id')
    plan = data.get('plan')
    metodo = data.get('metodo')
    imagen_base64 = data.get('imagen')
    if not all([tid, plan, metodo, imagen_base64]):
        return jsonify({'error': 'Faltan datos'}), 400
    try:
        header, encoded = imagen_base64.split(',', 1)
        img_data = base64.b64decode(encoded)
        file_name = f"{tid}_{plan}_{uuid.uuid4()}.jpg"
        supabase_admin.storage.from_("capturas").upload(file_name, img_data, {"content-type": "image/jpeg"})
        public_url = supabase_admin.storage.from_("capturas").get_public_url(file_name)
    except Exception as e:
        logger.error(f"Error subiendo captura: {e}")
        return jsonify({'error': 'Error al procesar imagen'}), 500

    supabase_admin.table("solicitudes_pago").insert({
        "telegram_id": int(tid),
        "plan_solicitado": plan,
        "metodo_pago": metodo,
        "captura_url": public_url,
        "estado": "pendiente"
    }).execute()
    return jsonify({'success': True})

@flask_app.route('/api/pending-requests', methods=['POST'])
def pending_requests():
    data = request.json
    tid = data.get('telegram_id')
    if not tid or not es_admin(int(tid)):
        return jsonify({'error': 'No autorizado'}), 401
    resp = supabase_admin.table("solicitudes_pago").select("*").eq("estado", "pendiente").order("created_at", desc=True).execute()
    return jsonify(resp.data)

@flask_app.route('/api/approve-request', methods=['POST'])
def approve_request():
    data = request.json
    admin_id = data.get('admin_id')
    solicitud_id = data.get('solicitud_id')
    if not admin_id or not es_admin(int(admin_id)):
        return jsonify({'error': 'No autorizado'}), 401
    sol = supabase_admin.table("solicitudes_pago").select("*").eq("id", solicitud_id).execute()
    if not sol.data:
        return jsonify({'error': 'No existe'}), 404
    sol = sol.data[0]
    supabase_admin.table("solicitudes_pago").update({"estado": "aprobado"}).eq("id", solicitud_id).execute()
    fecha_expiracion = datetime.now() + timedelta(days=30)
    supabase_admin.table("usuarios").upsert({
        "telegram_id": sol["telegram_id"],
        "plan": sol["plan_solicitado"],
        "fecha_inicio": datetime.now().isoformat(),
        "fecha_expiracion": fecha_expiracion.isoformat()
    }, on_conflict="telegram_id").execute()
    try:
        application.bot.send_message(
            chat_id=sol["telegram_id"],
            text=f"✅ **¡Pago aprobado!**\n\nTu suscripción **{sol['plan_solicitado']}** está activa hasta el {fecha_expiracion.strftime('%d/%m/%Y')}.\n¡Disfruta del catálogo! 🍿",
            parse_mode=ParseMode.MARKDOWN
        )
    except Exception as e:
        logger.warning(f"No se pudo notificar al usuario {sol['telegram_id']}: {e}")
    return jsonify({'success': True})

@flask_app.route('/api/reject-request', methods=['POST'])
def reject_request():
    data = request.json
    admin_id = data.get('admin_id')
    solicitud_id = data.get('solicitud_id')
    motivo = data.get('motivo', '')
    if not admin_id or not es_admin(int(admin_id)):
        return jsonify({'error': 'No autorizado'}), 401
    supabase_admin.table("solicitudes_pago").update({"estado": "rechazado", "motivo_rechazo": motivo}).eq("id", solicitud_id).execute()
    sol = supabase_admin.table("solicitudes_pago").select("*").eq("id", solicitud_id).execute().data[0]
    try:
        application.bot.send_message(
            chat_id=sol["telegram_id"],
            text=f"❌ **Pago rechazado**\n\nMotivo: {motivo}\n\nPuedes intentar nuevamente con otro comprobante.",
            parse_mode=ParseMode.MARKDOWN
        )
    except Exception as e:
        logger.warning(f"No se pudo notificar al usuario {sol['telegram_id']}: {e}")
    return jsonify({'success': True})

@flask_app.route('/api/catalogo', methods=['POST'])
def catalogo():
    data = request.json
    tid = data.get('telegram_id')
    if not tid or not usuario_activo(int(tid)):
        return jsonify({'error': 'Suscripción no activa'}), 403
    page = int(data.get('page', 1))
    search = data.get('search', '')
    limit = 10
    offset = (page - 1) * limit
    query = supabase_admin.table("peliculas").select("*", count="exact")
    if search:
        query = query.ilike("titulo", f"%{search}%")
    query = query.range(offset, offset + limit - 1).order("titulo")
    resp = query.execute()
    return jsonify({
        'data': resp.data,
        'total': resp.count,
        'page': page
    })

@flask_app.route('/api/request-movie', methods=['POST'])
def request_movie():
    data = request.json
    tid = data.get('telegram_id')
    pelicula_id = data.get('pelicula_id')
    if not tid or not usuario_activo(int(tid)):
        return jsonify({'error': 'Suscripción no activa'}), 403
    peli = supabase_admin.table("peliculas").select("*").eq("id", pelicula_id).execute()
    if not peli.data:
        return jsonify({'error': 'Película no encontrada'}), 404
    peli = peli.data[0]
    usuario = obtener_usuario(int(tid))
    protect = (usuario["plan"] == "clasico")
    try:
        application.bot.forward_message(
            chat_id=int(tid),
            from_chat_id=CHANNEL_ID,
            message_id=peli["message_id"],
            protect_content=protect
        )
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error enviando película: {e}")
        return jsonify({'error': 'Error al enviar'}), 500

# ================= MAIN =================
if __name__ == "__main__":
    application = Application.builder().token(BOT_TOKEN).build()

    # Handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(button_handler))
    application.add_handler(MessageHandler(filters.PHOTO, handle_captura))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, buscar_pelicula))
    application.add_handler(CallbackQueryHandler(paginacion_callback, pattern="^pagina_"))
    application.add_handler(CallbackQueryHandler(enviar_pelicula, pattern="^pelicula_"))
    application.add_handler(CommandHandler("addpelicula", add_pelicula))
    application.add_handler(CommandHandler("panel", panel_admin))

    # Hilo de expiraciones
    threading.Thread(target=verificar_expiraciones, args=(application,), daemon=True).start()

    # Configurar webhook
    port = int(os.environ.get('PORT', 8080))
    import asyncio
    async def set_webhook():
        url = f"https://{os.environ.get('RENDER_EXTERNAL_HOSTNAME')}/webhook"
        await application.bot.set_webhook(url)
        logger.info(f"Webhook configurado en {url}")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(set_webhook())

    # Iniciar Flask
    flask_app.run(host='0.0.0.0', port=port, debug=False)
