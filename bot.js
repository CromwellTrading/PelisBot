const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ================= CONFIGURACIÓN =================
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [];
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://localhost';
const WEBHOOK_URL = process.env.WEBHOOK_URL || `${WEBAPP_URL}/webhook`;

// Clientes Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Precios actualizados (después de comisión del 15%)
const PRECIOS = {
  tarjeta: { clasico: 235, premium: 415 },
  saldo: { clasico: 145, premium: 235 }
};

// ID fijo del admin que puede cobrar comisión (hardcodeado)
const COMISION_ADMIN_ID = 5376388604;

// ================= FUNCIONES AUXILIARES =================
function esAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

async function obtenerUsuario(telegramId) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  if (error && error.code !== 'PGRST116') console.error('Error obteniendo usuario:', error);
  return data;
}

async function usuarioActivo(telegramId) {
  const user = await obtenerUsuario(telegramId);
  if (!user || !user.fecha_expiracion) return false;
  const expiracion = new Date(user.fecha_expiracion);
  return expiracion > new Date();
}

// ================= CONFIGURACIÓN DEL BOT =================
const bot = new TelegramBot(BOT_TOKEN);

// ================= EXPRESS APP =================
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'webapp')));

// Endpoint para el webhook
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Estados para búsqueda, sugerencias, tickets y respuestas
const searchState = new Map();
const suggestState = new Map();
const ticketState = new Map();        // userId -> true (usuario escribiendo un ticket)
const respondState = new Map();       // adminId -> { targetUserId } (admin respondiendo a un ticket)

// ================= FUNCIÓN PARA TECLADO PRINCIPAL =================
function getMainKeyboard(userId, tieneSuscripcion) {
  const keyboard = {
    keyboard: [
      [{ text: '🔍 Buscar' }, { text: '🎬 Ver planes' }, { text: '❓ Ayuda' }],
      [{ text: '👤 Mi perfil' }, { text: '💡 Sugerir película' }],
      [{ text: '🎫 Abrir ticket' }, { text: '🔐 VPN' }],
      [{ text: '🌐 Abrir WebApp' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  return keyboard;
}

// ================= HANDLERS DEL BOT =================

// Comando /start - VERSIÓN ROBUSTA
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name;

  try {
    const usuario = await obtenerUsuario(userId);
    const activo = await usuarioActivo(userId);

    const keyboard = getMainKeyboard(userId, activo);

    if (activo && usuario) {
      const expiracion = new Date(usuario.fecha_expiracion);
      const diasRestantes = Math.ceil((expiracion - new Date()) / (1000 * 60 * 60 * 24));
      const mensaje = 
        `✨ ¡Bienvenido de nuevo, ${firstName}! ✨\n\n` +
        `🎬 **Tu membresía VIP**\n` +
        `   Plan: **${usuario.plan === 'clasico' ? '⚜️ Clásico' : '💎 Premium'}**\n` +
        `   📅 Activo hasta: ${expiracion.toLocaleDateString()}\n` +
        `   ⏳ Días restantes: ${diasRestantes}\n\n` +
        `🔍 **¿Cómo buscar?**\n` +
        `   • Presiona el botón **"🔍 Buscar"** y luego escribe el nombre.\n` +
        `   • También puedes usar la **webapp** para una experiencia mejorada.\n\n` +
        `💡 ¿No encuentras una película? Usa **"💡 Sugerir película"** para pedirla.\n\n` +
        `🎫 ¿Tienes dudas? Abre un ticket con **"🎫 Abrir ticket"**.\n\n` +
        `🔐 ¿Necesitas una VPN? Prueba nuestro bot **@vpncubaw_bot** (botón "🔐 VPN").\n\n` +
        `🎉 Disfruta de tu experiencia VIP.`;

      await bot.sendMessage(chatId, mensaje, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      });
    } else {
      const mensaje = 
        `🍿 **CineBot - Tu cine personal** 🍿\n\n` +
        `Para acceder al catálogo necesitas una suscripción.\n\n` +
        `⚜️ **Clásico** — ${PRECIOS.tarjeta.clasico} CUP (tarjeta) / ${PRECIOS.saldo.clasico} CUP (saldo)\n` +
        `   ✅ Catálogo completo\n` +
        `   ✅ Visualización sin límites\n` +
        `   ❌ No permite reenviar/guardar\n\n` +
        `💎 **Premium** — ${PRECIOS.tarjeta.premium} CUP (tarjeta) / ${PRECIOS.saldo.premium} CUP (saldo)\n` +
        `   ✅ Todo lo del plan Clásico\n` +
        `   ✅ Reenvío y guardado de películas\n` +
        `   ✅ Prioridad en solicitudes\n\n` +
        `Presiona "🎬 Ver planes" para comenzar.`;

      await bot.sendMessage(chatId, mensaje, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      });
    }
  } catch (error) {
    console.error('Error en /start:', error);
    await bot.sendMessage(
      chatId,
      `Hola ${firstName}, el bot está activo. Por favor, intenta usar los botones del menú. Si el problema persiste, contacta a un administrador.`,
      { reply_markup: getMainKeyboard(userId, false) }
    );
  }
});

// Manejo de mensajes (texto, fotos, etc.)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text; // puede ser undefined

  // 1. Manejar estados de ticket (usuario enviando mensaje para admin)
  if (ticketState.has(userId)) {
    ticketState.delete(userId); // solo se permite un mensaje por ticket
    // Reenviar el mensaje original a todos los administradores
    for (const adminId of ADMIN_IDS) {
      try {
        // Reenviar el mensaje del usuario al admin
        const forwardedMsg = await bot.forwardMessage(adminId, chatId, msg.message_id);
        // Enviar un mensaje con botón para responder, adjuntando el ID del usuario
        const replyButton = {
          inline_keyboard: [
            [{ text: '✏️ Responder', callback_data: `respond_${userId}` }]
          ]
        };
        await bot.sendMessage(adminId, 
          `📩 Nuevo ticket de ${msg.from.first_name} (@${msg.from.username || 'sin username'}) [ID ${userId}].\n` +
          `Mensaje reenviado arriba. Haz clic en "Responder" para contestar.`,
          { reply_markup: replyButton }
        );
      } catch (e) {
        console.error(`Error reenviando ticket al admin ${adminId}:`, e);
      }
    }
    await bot.sendMessage(chatId, '✅ Tu mensaje ha sido enviado a los administradores. Te responderán a la mayor brevedad.');
    return;
  }

  // 2. Manejar estados de respuesta (admin respondiendo a un ticket)
  if (respondState.has(userId)) {
    const { targetUserId } = respondState.get(userId);
    respondState.delete(userId);
    try {
      // Copiar el mensaje del admin (puede ser cualquier tipo) al usuario destino
      await bot.copyMessage(targetUserId, chatId, msg.message_id);
      await bot.sendMessage(chatId, '✅ Respuesta enviada al usuario.');
    } catch (e) {
      console.error('Error enviando respuesta:', e);
      await bot.sendMessage(chatId, '❌ No se pudo enviar la respuesta. El usuario puede haber bloqueado el bot.');
    }
    return;
  }

  // Si no hay texto, ignorar (no podemos procesar comandos sin texto)
  if (!text) return;
  if (text.startsWith('/')) return;

  // 3. Botones principales (incluyendo el nuevo "Abrir ticket")
  if (text === '🎫 Abrir ticket') {
    ticketState.set(userId, true);
    bot.sendMessage(chatId, '✍️ Escribe tu consulta o mensaje. Puede ser texto, foto, etc. Lo enviaremos a los administradores.');
    return;
  }

  if (text === '🔍 Buscar') {
    const activo = await usuarioActivo(userId);
    if (!activo) {
      bot.sendMessage(chatId, '❌ No tienes una suscripción activa. Usa "🎬 Ver planes" para adquirir una.');
      return;
    }
    searchState.set(userId, true);
    bot.sendMessage(chatId, '✍️ Escribe el nombre de la película que deseas buscar:');
    return;
  }

  if (text === '💡 Sugerir película') {
    const activo = await usuarioActivo(userId);
    if (!activo) {
      bot.sendMessage(chatId, '❌ Solo los usuarios con suscripción activa pueden sugerir películas.');
      return;
    }
    suggestState.set(userId, true);
    bot.sendMessage(chatId, '✍️ Escribe el nombre de la película que te gustaría que agreguemos:');
    return;
  }

  if (text === '🔐 VPN') {
    bot.sendMessage(chatId, '🔐 Accede a nuestro bot VPN: [@vpncubaw_bot](https://t.me/vpncubaw_bot)', { parse_mode: 'Markdown' });
    return;
  }

  if (text === '🎬 Ver planes') {
    const mensaje = 
      '📋 **Planes disponibles**\n\n' +
      `⚜️ **Clásico**\n` +
      `   • Acceso al catálogo completo\n` +
      `   • Visualización sin límites\n` +
      `   • No permite reenviar/guardar\n` +
      `   • Precio: ${PRECIOS.tarjeta.clasico} CUP (tarjeta) / ${PRECIOS.saldo.clasico} CUP (saldo)\n\n` +
      `💎 **Premium**\n` +
      `   • Todo lo del plan Clásico\n` +
      `   • Reenvío y guardado de películas\n` +
      `   • Prioridad en solicitudes\n` +
      `   • Precio: ${PRECIOS.tarjeta.premium} CUP (tarjeta) / ${PRECIOS.saldo.premium} CUP (saldo)\n\n` +
      'Elige uno para continuar:';
    
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: '⚜️ Clásico', callback_data: 'plan_clasico' }],
        [{ text: '💎 Premium', callback_data: 'plan_premium' }]
      ]
    };
    bot.sendMessage(chatId, mensaje, { 
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard 
    });
    return;
  }

  if (text === '👤 Mi perfil') {
    const usuario = await obtenerUsuario(userId);
    const activo = await usuarioActivo(userId);
    if (!activo) {
      bot.sendMessage(chatId, '❌ No tienes una suscripción activa. Usa "🎬 Ver planes" para adquirir una.');
      return;
    }
    const expiracion = new Date(usuario.fecha_expiracion);
    const diasRestantes = Math.ceil((expiracion - new Date()) / (1000 * 60 * 60 * 24));
    const mensaje = 
      `👤 **Tu perfil VIP**\n\n` +
      `Plan: **${usuario.plan === 'clasico' ? '⚜️ Clásico' : '💎 Premium'}**\n` +
      `📅 Activo hasta: ${expiracion.toLocaleDateString()}\n` +
      `⏳ Días restantes: ${diasRestantes}\n\n` +
      `¿Quieres renovar? Usa "🎬 Ver planes".`;
    bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
    return;
  }

  if (text === '❓ Ayuda') {
    const ayuda = 
      '❓ **Ayuda**\n\n' +
      '• Para comprar un plan, usa "🎬 Ver planes".\n' +
      '• Luego de pagar, envía la captura.\n' +
      '• Los administradores aprobarán tu pago.\n' +
      '• Una vez activo, podrás buscar películas con "🔍 Buscar".\n' +
      '• Usa "👤 Mi perfil" para ver tu estado.\n' +
      '• ¿Falta una película? Usa "💡 Sugerir película".\n' +
      '• ¿Tienes dudas? Usa "🎫 Abrir ticket".\n' +
      '• ¿Necesitas VPN? Prueba nuestro bot "🔐 VPN".\n\n' +
      '¿Dudas? Escribe aqui cual es tu problema 👇.';
    bot.sendMessage(chatId, ayuda, { parse_mode: 'Markdown' });
    return;
  }

  if (text === '🌐 Abrir WebApp') {
    const webAppButton = {
      text: 'Abrir WebApp',
      web_app: { url: `${WEBAPP_URL}?tg_id=${userId}` }
    };
    const keyboard = {
      inline_keyboard: [[webAppButton]]
    };
    bot.sendMessage(chatId, 'Haz clic para abrir la webapp:', {
      reply_markup: keyboard
    });
    return;
  }

  // 4. Manejo de búsqueda
  if (searchState.get(userId)) {
    searchState.delete(userId);
    const activo = await usuarioActivo(userId);
    if (!activo) {
      bot.sendMessage(chatId, '❌ Tu suscripción ya no está activa. Usa "🎬 Ver planes" para renovar.');
      return;
    }
    if (text.length < 3) {
      bot.sendMessage(chatId, '🔍 Escribe al menos 3 caracteres para buscar.');
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('peliculas')
      .select('*')
      .ilike('titulo', `%${text}%`)
      .limit(10);
    if (error || !data.length) {
      bot.sendMessage(chatId, `😕 No encontré ninguna película con "${text}".`);
      return;
    }
    const inlineKeyboard = {
      inline_keyboard: data.map(p => [{ text: p.titulo, callback_data: `pelicula_${p.id}` }])
    };
    bot.sendMessage(chatId, `🎥 Resultados para "${text}":`, {
      reply_markup: inlineKeyboard
    });
    return;
  }

  // 5. Manejo de sugerencias
  if (suggestState.get(userId)) {
    suggestState.delete(userId);
    const activo = await usuarioActivo(userId);
    if (!activo) {
      bot.sendMessage(chatId, '❌ Solo usuarios activos pueden sugerir.');
      return;
    }
    if (text.length < 3) {
      bot.sendMessage(chatId, '✍️ Escribe al menos 3 caracteres para la sugerencia.');
      return;
    }
    const { error } = await supabaseAdmin.from('sugerencias').insert({
      telegram_id: userId,
      sugerencia: text,
      estado: 'pendiente'
    });
    if (error) {
      console.error('Error guardando sugerencia:', error);
      bot.sendMessage(chatId, '❌ Error al guardar la sugerencia. Intenta más tarde.');
    } else {
      bot.sendMessage(chatId, '✅ ¡Gracias por tu sugerencia! La revisaremos pronto.');
      for (const adminId of ADMIN_IDS) {
        try {
          bot.sendMessage(adminId,
            `💡 Nueva sugerencia de película\n` +
            `👤 Usuario: ${msg.from.first_name} (@${msg.from.username})\n` +
            `📝 Sugerencia: ${text}\n` +
            `🆔 ID: ${userId}`
          );
        } catch (e) {}
      }
    }
    return;
  }

  // Si llegamos aquí, el mensaje no fue reconocido
  // Podríamos ignorarlo o enviar un mensaje de ayuda
  // bot.sendMessage(chatId, 'No entendí ese mensaje. Usa los botones del menú.');
});

// Callbacks de botones inline (planes, películas y responder ticket)
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // Responder a ticket
  if (data.startsWith('respond_')) {
    const targetUserId = parseInt(data.split('_')[1]);
    // Verificar que quien hace clic es admin (opcional, pero todos los admins tienen acceso)
    if (!esAdmin(userId)) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'No autorizado', show_alert: true });
      return;
    }
    // Guardar estado de respuesta para este admin
    respondState.set(userId, { targetUserId });
    // Eliminar el mensaje con el botón para evitar respuestas duplicadas
    bot.deleteMessage(chatId, messageId).catch(() => {});
    bot.sendMessage(chatId, `✍️ Escribe tu respuesta para el usuario ${targetUserId}. Puede ser texto, foto, etc.`);
    bot.answerCallbackQuery(callbackQuery.id);
    return;
  }

  // Manejo de planes y películas
  if (data.startsWith('plan_')) {
    const plan = data.split('_')[1];
    if (!global.userPlans) global.userPlans = new Map();
    global.userPlans.set(userId, plan);

    const nombrePlan = plan === 'clasico' ? '⚜️ Clásico' : '💎 Premium';
    const montoTarjeta = plan === 'clasico' ? PRECIOS.tarjeta.clasico : PRECIOS.tarjeta.premium;
    const montoSaldo = plan === 'clasico' ? PRECIOS.saldo.clasico : PRECIOS.saldo.premium;

    const texto = 
      `**${nombrePlan}**\n\n` +
      `🎬 Acceso ilimitado por 30 días.\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💳 **Transferencia bancaria**\n` +
      `   Tarjeta: \`9248-1299-7027-1730\`\n` +
      `   Confirmación: \`63806513\`\n` +
      `   Monto: **${montoTarjeta} CUP**\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📱 **Saldo móvil**\n` +
      `   Número: \`63806513\`\n` +
      `   Monto: **${montoSaldo} CUP**\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📷 **Envía la captura del comprobante y tu cuenta se activará en minutos.**`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔙 Volver a planes', callback_data: 'volver_planes' }]
      ]
    };
    bot.editMessageText(texto, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
  else if (data === 'volver_planes') {
    const mensaje = 
      '📋 **Planes disponibles**\n\n' +
      `⚜️ **Clásico** — ${PRECIOS.tarjeta.clasico} CUP (tarjeta) / ${PRECIOS.saldo.clasico} CUP (saldo)\n` +
      '   ✅ Catálogo completo\n' +
      '   ✅ Visualización sin límites\n' +
      '   ❌ No permite reenviar/guardar\n\n' +
      `💎 **Premium** — ${PRECIOS.tarjeta.premium} CUP (tarjeta) / ${PRECIOS.saldo.premium} CUP (saldo)\n` +
      '   ✅ Todo lo del plan Clásico\n' +
      '   ✅ Reenvío y guardado\n' +
      '   ✅ Prioridad en solicitudes\n\n' +
      'Selecciona:';
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: '⚜️ Clásico', callback_data: 'plan_clasico' }],
        [{ text: '💎 Premium', callback_data: 'plan_premium' }]
      ]
    };
    bot.editMessageText(mensaje, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard
    });
  }
  else if (data.startsWith('pelicula_')) {
    const peliculaId = data.split('_')[1];
    if (!(await usuarioActivo(userId))) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'No tienes suscripción activa', show_alert: true });
      return;
    }
    const { data: peli, error } = await supabase
      .from('peliculas')
      .select('*')
      .eq('id', peliculaId)
      .single();
    if (error || !peli) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Película no encontrada', show_alert: true });
      return;
    }
    const usuario = await obtenerUsuario(userId);
    const protect = usuario.plan === 'clasico';
    try {
      await bot.forwardMessage(userId, CHANNEL_ID, peli.message_id, { protect_content: protect });
      if (protect) {
        bot.sendMessage(userId,
          'ℹ️ Esta película tiene **protección de contenido**. No puedes reenviarla ni guardarla.\n' +
          'Para disfrutar de estas funciones, actualiza al plan Premium.',
          { parse_mode: 'Markdown' }
        );
      }
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Película enviada a tu chat' });
    } catch (e) {
      console.error('Error al reenviar:', e);
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Error al enviar', show_alert: true });
    }
  }
});

// Manejo de fotos (capturas de pago)
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Verificar si el usuario está en ticketState, en cuyo caso no procesamos como pago (ya lo hará el handler general)
  if (ticketState.has(userId)) {
    return; // el ticket ya se manejará en el evento 'message'
  }

  // Lógica original de pago
  const plan = global.userPlans?.get(userId);
  if (!plan) {
    bot.sendMessage(chatId, '⚠️ Primero debes elegir un plan con "🎬 Ver planes".');
    return;
  }

  try {
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    const fileLink = await bot.getFileLink(fileId);
    const response = await fetch(fileLink);
    const buffer = Buffer.from(await response.arrayBuffer());

    const fileName = `${userId}_${plan}_${uuidv4()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('capturas')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage.from('capturas').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    const { data: insertData, error: insertError } = await supabaseAdmin
      .from('solicitudes_pago')
      .insert({
        telegram_id: userId,
        plan_solicitado: plan,
        metodo_pago: 'desconocido',
        captura_url: publicUrl,
        estado: 'pendiente'
      })
      .select();

    if (insertError) throw insertError;

    bot.sendMessage(chatId,
      '✅ **¡Solicitud recibida!**\n\n' +
      'El administrador verificará el pago en breve. Te notificaremos cuando esté aprobado.\n' +
      'Gracias por tu paciencia 🙌',
      { parse_mode: 'Markdown' }
    );

    for (const adminId of ADMIN_IDS) {
      try {
        bot.sendMessage(adminId,
          `📩 Nueva solicitud de pago\n` +
          `👤 Usuario: ${msg.from.first_name} (@${msg.from.username})\n` +
          `📋 Plan: ${plan}\n` +
          `🆔 ID: ${userId}\n` +
          `🌐 Revisa en la webapp (abre el menú y presiona "Abrir WebApp")`
        );
      } catch (e) {}
    }

    global.userPlans?.delete(userId);
  } catch (error) {
    console.error('Error procesando captura:', error);
    bot.sendMessage(chatId, '❌ Ocurrió un error al procesar la imagen. Intenta de nuevo.');
  }
});

// Comandos de admin
bot.onText(/\/addpelicula (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!esAdmin(userId)) return;

  const titulo = match[1];
  if (!msg.reply_to_message) {
    bot.sendMessage(msg.chat.id, '❌ Debes responder al mensaje de la película en el canal con /addpelicula Título');
    return;
  }
  const replied = msg.reply_to_message;
  if (replied.chat.id.toString() !== CHANNEL_ID) {
    bot.sendMessage(msg.chat.id, '❌ El mensaje debe ser del canal de películas.');
    return;
  }

  const { error } = await supabaseAdmin.from('peliculas').insert({
    titulo,
    message_id: replied.message_id,
    canal_id: CHANNEL_ID
  });

  if (error) {
    console.error('Error agregando película:', error);
    bot.sendMessage(msg.chat.id, '❌ Error al agregar la película.');
  } else {
    bot.sendMessage(msg.chat.id, `✅ Película '${titulo}' agregada correctamente.`);
  }
});

// ================= API ENDPOINTS =================

// Obtener estado del usuario
app.post('/api/user-status', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'Falta ID' });
  const usuario = await obtenerUsuario(parseInt(telegram_id));
  const activo = usuario ? await usuarioActivo(parseInt(telegram_id)) : false;
  res.json({
    existe: !!usuario,
    activo,
    plan: usuario?.plan || null,
    expiracion: usuario?.fecha_expiracion || null,
    es_admin: esAdmin(parseInt(telegram_id)),
    es_admin_comision: parseInt(telegram_id) === COMISION_ADMIN_ID
  });
});

// Enviar solicitud de pago desde webapp
app.post('/api/submit-payment', async (req, res) => {
  const { telegram_id, plan, metodo, imagen } = req.body;
  if (!telegram_id || !plan || !metodo || !imagen) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  try {
    const base64Data = imagen.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${telegram_id}_${plan}_${uuidv4()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('capturas')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage.from('capturas').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    const { data: insertData, error: insertError } = await supabaseAdmin
      .from('solicitudes_pago')
      .insert({
        telegram_id: parseInt(telegram_id),
        plan_solicitado: plan,
        metodo_pago: metodo,
        captura_url: publicUrl,
        estado: 'pendiente'
      })
      .select();

    if (insertError) throw insertError;

    res.json({ success: true });
  } catch (e) {
    console.error('Error en submit-payment:', e);
    res.status(500).json({ error: 'Error al procesar imagen' });
  }
});

// Obtener solicitudes pendientes (solo admin)
app.post('/api/pending-requests', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id || !esAdmin(parseInt(telegram_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const { data, error } = await supabaseAdmin
    .from('solicitudes_pago')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Aprobar solicitud
app.post('/api/approve-request', async (req, res) => {
  const { admin_id, solicitud_id } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const { data: sol, error: fetchError } = await supabaseAdmin
    .from('solicitudes_pago')
    .select('*')
    .eq('id', solicitud_id)
    .single();
  if (fetchError || !sol) return res.status(404).json({ error: 'No existe' });

  await supabaseAdmin
    .from('solicitudes_pago')
    .update({ estado: 'aprobado' })
    .eq('id', solicitud_id);

  const fechaExpiracion = new Date();
  fechaExpiracion.setDate(fechaExpiracion.getDate() + 30);

  await supabaseAdmin
    .from('usuarios')
    .upsert({
      telegram_id: sol.telegram_id,
      plan: sol.plan_solicitado,
      fecha_inicio: new Date().toISOString(),
      fecha_expiracion: fechaExpiracion.toISOString()
    }, { onConflict: 'telegram_id' });

  // Actualizar estadísticas de comisiones
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: comisionExistente } = await supabaseAdmin
    .from('comisiones')
    .select('*')
    .eq('admin_id', COMISION_ADMIN_ID)
    .eq('mes', inicioMes)
    .single();

  const monto = sol.plan_solicitado === 'clasico' 
    ? (sol.metodo_pago === 'saldo' ? PRECIOS.saldo.clasico : PRECIOS.tarjeta.clasico)
    : (sol.metodo_pago === 'saldo' ? PRECIOS.saldo.premium : PRECIOS.tarjeta.premium);

  if (comisionExistente) {
    if (sol.metodo_pago === 'saldo') {
      await supabaseAdmin
        .from('comisiones')
        .update({ total_saldo: comisionExistente.total_saldo + monto })
        .eq('id', comisionExistente.id);
    } else {
      await supabaseAdmin
        .from('comisiones')
        .update({ total_tarjeta: comisionExistente.total_tarjeta + monto })
        .eq('id', comisionExistente.id);
    }
  } else {
    await supabaseAdmin.from('comisiones').insert({
      admin_id: COMISION_ADMIN_ID,
      mes: inicioMes,
      total_tarjeta: sol.metodo_pago === 'saldo' ? 0 : monto,
      total_saldo: sol.metodo_pago === 'saldo' ? monto : 0,
      comision_cobrada: false
    });
  }

  try {
    await bot.sendMessage(sol.telegram_id,
      `✅ **¡Pago aprobado!**\n\nTu suscripción **${sol.plan_solicitado}** está activa hasta el ${fechaExpiracion.toLocaleDateString()}.\n¡Disfruta del catálogo! 🍿`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}

  res.json({ success: true });
});

// Rechazar solicitud
app.post('/api/reject-request', async (req, res) => {
  const { admin_id, solicitud_id, motivo } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  await supabaseAdmin
    .from('solicitudes_pago')
    .update({ estado: 'rechazado', motivo_rechazo: motivo })
    .eq('id', solicitud_id);

  const { data: sol } = await supabaseAdmin
    .from('solicitudes_pago')
    .select('*')
    .eq('id', solicitud_id)
    .single();

  if (sol) {
    try {
      await bot.sendMessage(sol.telegram_id,
        `❌ **Pago rechazado**\n\nMotivo: ${motivo}\n\nPuedes intentar nuevamente con otro comprobante.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }
  res.json({ success: true });
});

// Obtener catálogo de películas (requiere suscripción activa)
app.post('/api/catalogo', async (req, res) => {
  const { telegram_id, page = 1, search = '' } = req.body;
  if (!telegram_id || !(await usuarioActivo(parseInt(telegram_id)))) {
    return res.status(403).json({ error: 'Suscripción no activa' });
  }
  const limit = 10;
  const offset = (page - 1) * limit;
  let query = supabaseAdmin
    .from('peliculas')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1)
    .order('titulo');
  if (search) {
    query = query.ilike('titulo', `%${search}%`);
  }
  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count, page });
});

// Solicitar envío de película al chat de Telegram
app.post('/api/request-movie', async (req, res) => {
  const { telegram_id, pelicula_id } = req.body;
  if (!telegram_id || !(await usuarioActivo(parseInt(telegram_id)))) {
    return res.status(403).json({ error: 'Suscripción no activa' });
  }
  const { data: peli, error } = await supabaseAdmin
    .from('peliculas')
    .select('*')
    .eq('id', pelicula_id)
    .single();
  if (error || !peli) return res.status(404).json({ error: 'Película no encontrada' });

  const usuario = await obtenerUsuario(parseInt(telegram_id));
  const protect = usuario.plan === 'clasico';
  try {
    await bot.forwardMessage(parseInt(telegram_id), CHANNEL_ID, peli.message_id, { protect_content: protect });
    res.json({ success: true });
  } catch (e) {
    console.error('Error enviando película:', e);
    res.status(500).json({ error: 'Error al enviar' });
  }
});

// Obtener lista de todos los usuarios (solo admin)
app.post('/api/users', async (req, res) => {
  const { admin_id } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Obtener catálogo completo (sin verificar suscripción) - solo admin
app.post('/api/catalogo-admin', async (req, res) => {
  const { admin_id, page = 1, search = '' } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const limit = 10;
  const offset = (page - 1) * limit;
  let query = supabaseAdmin
    .from('peliculas')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1)
    .order('titulo');
  if (search) {
    query = query.ilike('titulo', `%${search}%`);
  }
  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count, page });
});

// Agregar nueva película (solo admin)
app.post('/api/add-movie', async (req, res) => {
  const { admin_id, titulo, message_id } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!titulo || !message_id) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  try {
    await supabaseAdmin.from('peliculas').insert({
      titulo,
      message_id: parseInt(message_id),
      canal_id: CHANNEL_ID
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Error agregando película:', e);
    res.status(500).json({ error: 'Error al agregar' });
  }
});

// Editar película (solo admin)
app.post('/api/update-movie', async (req, res) => {
  const { admin_id, movie_id, titulo } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!movie_id || !titulo) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  try {
    await supabaseAdmin
      .from('peliculas')
      .update({ titulo })
      .eq('id', movie_id);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando película:', e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// Borrar película (solo admin)
app.post('/api/delete-movie', async (req, res) => {
  const { admin_id, movie_id } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!movie_id) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  try {
    await supabaseAdmin
      .from('peliculas')
      .delete()
      .eq('id', movie_id);
    res.json({ success: true });
  } catch (e) {
    console.error('Error borrando película:', e);
    res.status(500).json({ error: 'Error al borrar' });
  }
});

// Obtener estadísticas de comisiones (solo admin)
app.post('/api/estadisticas', async (req, res) => {
  const { admin_id } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: comision, error } = await supabaseAdmin
    .from('comisiones')
    .select('*')
    .eq('admin_id', COMISION_ADMIN_ID)
    .eq('mes', inicioMes)
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ error: error.message });
  }

  const totalTarjeta = comision ? comision.total_tarjeta : 0;
  const totalSaldo = comision ? comision.total_saldo : 0;
  const totalGeneral = totalTarjeta + totalSaldo;
  const comision15 = Math.round(totalGeneral * 0.15);

  res.json({
    total_tarjeta: totalTarjeta,
    total_saldo: totalSaldo,
    total_general: totalGeneral,
    comision_15: comision15,
    cobrada: comision ? comision.comision_cobrada : false
  });
});

// Recoger comisión (solo el admin 5376388604)
app.post('/api/recoger-comision', async (req, res) => {
  const { admin_id } = req.body;
  if (parseInt(admin_id) !== COMISION_ADMIN_ID) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { error } = await supabaseAdmin
    .from('comisiones')
    .update({ comision_cobrada: true, fecha_cobro: new Date().toISOString() })
    .eq('admin_id', COMISION_ADMIN_ID)
    .eq('mes', inicioMes);

  if (error) return res.status(500).json({ error: error.message });

  // Crear nuevo registro para el próximo mes
  const proximoMes = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  await supabaseAdmin.from('comisiones').insert({
    admin_id: COMISION_ADMIN_ID,
    mes: proximoMes,
    total_tarjeta: 0,
    total_saldo: 0,
    comision_cobrada: false
  });

  res.json({ success: true });
});

// Obtener sugerencias pendientes (solo admin)
app.post('/api/sugerencias', async (req, res) => {
  const { admin_id } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const { data, error } = await supabaseAdmin
    .from('sugerencias')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Marcar sugerencia como vista/agregada (solo admin)
app.post('/api/update-sugerencia', async (req, res) => {
  const { admin_id, sugerencia_id, estado } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const { error } = await supabaseAdmin
    .from('sugerencias')
    .update({ estado })
    .eq('id', sugerencia_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ================= RUTA PARA LA WEBAPP =================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'webapp', 'index.html'));
});

// ================= INICIAR SERVIDOR Y WEBHOOK =================
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  try {
    await bot.setWebHook(WEBHOOK_URL);
    console.log(`✅ Webhook configurado en ${WEBHOOK_URL}`);
  } catch (error) {
    console.error('❌ Error configurando webhook:', error);
  }
});
