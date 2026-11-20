// Elementos principales de la interfaz
const formulario = document.getElementById("formulario-chat");
const campoMensaje = document.getElementById("mensaje");
const botonEnviar = document.getElementById("boton-enviar");
const zonaChat = document.getElementById("zona-chat");
const listaMensajes = document.getElementById("mensajes");
const bienvenida = document.querySelector(".bienvenida");
const estado = document.getElementById("estado");

// Configuración de seguridad y tiempos
const TIEMPO_LIMITE = 30000;
const ESPERA_ENTRE_ENVIOS = 1500;
const LIMITE_CARACTERES = 500;

// Control de envíos
let enviando = false;
let ultimoEnvio = 0;

// Identificador de sesión
let sessionId = "";

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
        // Si localStorage falla, usa un identificador en memoria.
        return `${Date.now()}-${Math.random()}`;
    }
}

// Se genera una sola vez al iniciar la aplicación.
sessionId = generarSessionId();

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
    campoMensaje.style.height =
        `${Math.min(campoMensaje.scrollHeight, 140)}px`;
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
        // Intenta reparar saltos de línea sin escapar.
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

    // Si Make devuelve un objeto, busca los campos conocidos.
    if (
        datos !== null &&
        typeof datos === "object" &&
        !Array.isArray(datos)
