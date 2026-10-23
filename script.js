```javascript
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

let enviando = false;
let ultimoEnvio = 0;

// Agrega mensajes al chat sin interpretar HTML del usuario
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

campoMensaje.addEventListener("input", ajustarCampo);

// Permite enviar con Enter y escribir nuevas líneas con Shift + Enter
campoMensaje.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.shiftKey) {
        evento.preventDefault();
        formulario.requestSubmit();
    }
});

// Extrae la respuesta de los formatos habituales del webhook
function obtenerRespuesta(datos) {
    if (typeof datos === "string" && datos.trim()) {
        return datos.trim();
    }

    if (datos && typeof datos === "object") {
        const posiblesCampos = [
            "respuesta",
            "response",
            "mensaje",
            "message",
            "output",
            "text"
        ];

        for (const campo of posiblesCampos) {
            if (typeof datos[campo] === "string" && datos[campo].trim()) {
                return datos[campo].trim();
            }
        }
    }

    throw new Error("El servidor no devolvió una respuesta válida.");
}

// Envía la consulta al webhook y procesa el resultado
async function enviarConsulta(texto) {
    const controlador = new AbortController();
    const temporizador = setTimeout(
        () => controlador.abort(),
        TIEMPO_LIMITE
    );

    const burbujaCarga = agregarMensaje(
        "Estoy preparando la respuesta...",
        "agente"
    );

    burbujaCarga.classList.add("cargando");

    enviando = true;
    botonEnviar.disabled = true;
    campoMensaje.disabled = true;

    mostrarEstado("Procesando tu consulta...");

    try {
        if (
            !WEBHOOK_URL ||
            WEBHOOK_URL.includes("ejemplo-webhook-prueba")
        ) {
            throw new Error(
                "Configurá una URL de webhook válida en config.js."
            );
        }

        const respuesta = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/plain"
            },
            body: JSON.stringify({
                mensaje: texto
            }),
            signal: controlador.signal
        });

        if (!respuesta.ok) {
            throw new Error(
                `El servidor respondió con el código ${respuesta.status}.`
            );
        }

        const contenido = await respuesta.text();
        let datos;

        try {
            datos = JSON.parse(contenido);
        } catch {
            datos = contenido;
        }

        const textoRespuesta = obtenerRespuesta(datos);

        burbujaCarga.textContent = textoRespuesta;
        burbujaCarga.classList.remove("cargando");

        mostrarEstado("Respuesta recibida correctamente.", "exito");
    } catch (error) {
        burbujaCarga.remove();

        if (error.name === "AbortError") {
            agregarMensaje(
                "La consulta tardó demasiado. Intentá nuevamente.",
                "agente"
            );
            mostrarEstado("Tiempo de espera agotado.", "error");
        } else {
            agregarMensaje(
                "No pudimos obtener una respuesta. Revisá la conexión o intentá más tarde.",
                "agente"
            );

            mostrarEstado(error.message, "error");
            console.error("Error al consultar el webhook:", error);
        }
    } finally {
        clearTimeout(temporizador);

        // Evita envíos repetidos y mantiene una pausa entre consultas.
        const tiempoTranscurrido = Date.now() - ultimoEnvio;
        const esperaRestante = Math.max(
            0,
            ESPERA_ENTRE_ENVIOS - tiempoTranscurrido
        );

        setTimeout(() => {
            enviando = false;
            botonEnviar.disabled = false;
            campoMensaje.disabled = false;
            campoMensaje.focus();
        }, esperaRestante);
    }
}

// Controla el envío del formulario
formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (enviando) {
        return;
    }

    const texto = campoMensaje.value.trim();

    if (!texto) {
        mostrarEstado("Escribí una consulta antes de enviar.", "error");
        campoMensaje.focus();
        return;
    }

    // Oculta la bienvenida cuando comienza la conversación.
    bienvenida.hidden = true;

    agregarMensaje(texto, "usuario");

    campoMensaje.value = "";
    ajustarCampo();

    ultimoEnvio = Date.now();

    await enviarConsulta(texto);
});
```
