// Elementos principales de la interfaz
const formulario = document.getElementById("formulario-chat");
const campoMensaje = document.getElementById("mensaje");
const botonEnviar = document.getElementById("boton-enviar");
const zonaChat = document.getElementById("zona-chat");
const listaMensajes = document.getElementById("mensajes");
const bienvenida = document.getElementById("bienvenida");
const estado = document.getElementById("estado");

// Configuración de seguridad y tiempos
const TIEMPO_LIMITE = 30000;
const ESPERA_ENTRE_ENVIOS = 1500;
const LIMITE_CARACTERES = 500;

// Control de envíos
let enviando = false;
let ultimoEnvio = 0;

// Identificador de sesión
function generarSessionId() {
    try {
        const guardado = localStorage.getItem("sessionId");
        if (guardado) {
            return guardado;
        }

        const nuevo = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;

        localStorage.setItem("sessionId", nuevo);
        return nuevo;
    } catch {
        return `${Date.now()}-${Math.random()}`;
    }
}

const sessionId = generarSessionId();

// Agrega mensajes al chat sin interpretar HTML
function agregarMensaje(texto, tipo) {
    const burbuja = document.createElement("div");
    burbuja.classList.add("burbuja", tipo);
    burbuja.textContent = texto;

    listaMensajes.appendChild(burbuja);
    zonaChat.scrollTop = zonaChat.scrollHeight;

    return burbuja;
}

// Muestra el estado de la petición
function mostrarEstado(texto, tipo = "") {
    if (!estado) return;
    estado.textContent = texto;
    estado.className = "estado";

    if (tipo) {
        estado.classList.add(tipo);
    }
}

// Ajusta la altura del campo de escritura
function ajustarCampo() {
    campoMensaje.style.height = "auto";
    campoMensaje.style.height = `${Math.min(campoMensaje.scrollHeight, 140)}px`;
}

// Comprueba si la URL está configurada de forma segura
function webhookConfigurado() {
    try {
        return (
            typeof WEBHOOK_URL === "string" &&
            WEBHOOK_URL.trim() !== "" &&
            !WEBHOOK_URL.includes("ACA VA") &&
            !WEBHOOK_URL.includes("ejemplo-webhook-prueba")
        );
    } catch {
        return false;
    }
}

// Limpia los bloques Markdown
function limpiarMarkdown(texto) {
    return texto
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
}

// Escapa saltos de línea reales dentro de valores JSON
function escaparSaltosDeLinea(texto) {
    let resultado = "";
    let dentroDeTexto = false;
    let escape = false;

    for (const caracter of texto) {
        if (escape) {
            resultado += caracter;
            escape = false;
            continue;
        }

        if (caracter === "\\" && dentroDeTexto) {
            resultado += caracter;
            escape = true;
            continue;
        }

        if (caracter === '"') {
            dentroDeTexto = !dentroDeTexto;
        }

        if (dentroDeTexto && caracter === "\n") {
            resultado += "\\n";
        } else if (dentroDeTexto && caracter === "\r") {
            resultado += "\\r";
        } else {
            resultado += caracter;
        }
    }

    return resultado;
}

// Extrae una respuesta aunque el JSON esté mal formado
function extraerRespuestaRegex(texto) {
    const campos = ["response", "respuesta", "message", "mensaje"];

    for (const campo of campos) {
        const expresion = new RegExp(
            `"${campo}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
            "i"
        );
        const coincidencia = texto.match(expresion);

        if (coincidencia && coincidencia[1].trim()) {
            return coincidencia[1]
                .replace(/\\n/g, "\n")
                .replace(/\\r/g, "\r")
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, "\\")
                .trim();
        }
    }

    return "";
}

// Obtiene el texto de respuesta de Make
function obtenerRespuesta(texto) {
    if (!texto) {
        return "(respuesta vacía)";
    }

    let datos;

    try {
        datos = JSON.parse(texto);
    } catch {
        if (texto.startsWith("{") && texto.endsWith("}")) {
            try {
                datos = JSON.parse(escaparSaltosDeLinea(texto));
            } catch {
                const extraida = extraerRespuestaRegex(texto);
                return extraida || texto;
            }
        } else {
            return texto;
        }
    }

    if (datos !== null && typeof datos === "object" && !Array.isArray(datos)) {
        const campos = ["response", "respuesta", "message", "mensaje"];

        for (const campo of campos) {
            if (typeof datos[campo] === "string" && datos[campo].trim()) {
                return datos[campo].trim();
            }
        }

        return "Make respondió, pero sin el campo response";
    }

    return texto;
}

// Envía la consulta al webhook
async function enviarConsulta(texto) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIEMPO_LIMITE);

    const burbujaCarga = agregarMensaje("Estoy preparando la respuesta...", "agente");
    burbujaCarga.classList.add("cargando");

    enviando = true;
    botonEnviar.disabled = true;
    campoMensaje.disabled = true;

    mostrarEstado("Procesando tu consulta...", "cargando");

    try {
        if (!webhookConfigurado()) {
            throw new Error("Falta pegar la URL de tu webhook en config.js");
        }

        const respuesta = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                sessionId: sessionId,
                mensaje: texto,
                fecha: new Date().toISOString()
            }),
            signal: controlador.signal
        });

        if (!respuesta.ok) {
            throw new Error(
                `Make respondió con error (código ${respuesta.status}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`
            );
        }

        const contenido = (await respuesta.text()).trim();
        const textoLimpio = limpiarMarkdown(contenido);
        const textoRespuesta = obtenerRespuesta(textoLimpio);

        burbujaCarga.textContent = textoRespuesta;
        burbujaCarga.classList.remove("cargando");
        zonaChat.scrollTop = zonaChat.scrollHeight;

        mostrarEstado("Respuesta recibida correctamente.", "exito");

    } catch (error) {
        burbujaCarga.remove();

        if (error.name === "AbortError") {
            agregarMensaje("La consulta tardó demasiado. Intentá nuevamente.", "agente");
            mostrarEstado("Tiempo de espera agotado (30 segundos).", "error");
        } else if (error.message && error.message.includes("Falta pegar la URL")) {
            agregarMensaje(error.message, "agente");
            mostrarEstado(error.message, "error");
        } else if (error.message && error.message.includes("Make respondió con error")) {
            agregarMensaje(error.message, "agente");
            mostrarEstado(error.message, "error");
        } else if (error instanceof TypeError) {
            agregarMensaje("No se pudo conectar con Make. Revisá tu conexión.", "agente");
            mostrarEstado("Error de red. No se pudo conectar.", "error");
        } else {
            agregarMensaje("Ocurrió un error al procesar la respuesta.", "agente");
            mostrarEstado("Error al procesar la respuesta.", "error");
            console.error("Error al consultar Make:", error);
        }

    } finally {
        clearTimeout(temporizador);

        const tiempoTranscurrido = Date.now() - ultimoEnvio;
        const esperaRestante = Math.max(0, ESPERA_ENTRE_ENVIOS - tiempoTranscurrido);

        setTimeout(() => {
            enviando = false;
            botonEnviar.disabled = false;
            campoMensaje.disabled = false;
            campoMensaje.focus();
        }, esperaRestante);
    }
}

// Función centralizada para procesar el envío
async function procesarEnvio() {
    if (enviando) {
        return;
    }

    const texto = campoMensaje.value.trim();

    if (!texto) {
        mostrarEstado("Escribí una consulta antes de enviar.", "error");
        campoMensaje.focus();
        return;
    }

    if (texto.length > LIMITE_CARACTERES) {
        mostrarEstado("El mensaje no puede superar los 500 caracteres.", "error");
        campoMensaje.focus();
        return;
    }

    if (bienvenida) {
        bienvenida.hidden = true;
    }

    agregarMensaje(texto, "usuario");

    campoMensaje.value = "";
    ajustarCampo();

    ultimoEnvio = Date.now();

    await enviarConsulta(texto);
}

// Registro de eventos
if (campoMensaje && formulario && botonEnviar) {
    campoMensaje.addEventListener("input", ajustarCampo);

    // Enviar con Enter (Shift + Enter hace salto de línea)
    campoMensaje.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" && !evento.shiftKey) {
            evento.preventDefault();
            procesarEnvio();
        }
    });

    // Enviar al hacer submit en el formulario
    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        procesarEnvio();
    });

    // Respaldo directo en el clic del botón
    botonEnviar.addEventListener("click", (evento) => {
        evento.preventDefault();
        procesarEnvio();
    });
}
