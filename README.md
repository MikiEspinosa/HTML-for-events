# HTML generator

App para pedir los datos de un evento, renderizar una invitacion HTML desde una plantilla predefinida y crear un `email template` en Salesforce Account Engagement/Pardot mediante API v5.

## Puesta en marcha

1. Crea tu configuracion local:

```powershell
Copy-Item .env.example .env
```

2. Rellena `.env` con el Business Unit ID, OAuth y valores por defecto.

3. Arranca la app:

```powershell
node server.js
```

4. Abre `http://localhost:4173`.

La app arranca en `PARDOT_DRY_RUN=true`. En ese modo genera el HTML, texto y payload, pero no llama a Pardot. Cambia a `PARDOT_DRY_RUN=false` solo cuando hayas validado la configuracion.

## Configuracion minima

- `PARDOT_BUSINESS_UNIT_ID`: ID de Account Engagement Business Unit, empieza por `0Uv`.
- `PARDOT_API_BASE_URL`: `https://pi.pardot.com` para produccion o `https://pi.demo.pardot.com` para sandbox/demo.
- OAuth: usa `PARDOT_ACCESS_TOKEN` temporal o configura `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` y `SALESFORCE_REFRESH_TOKEN`.
- Valores tecnicos ocultos al formulario: `PARDOT_DEFAULT_CAMPAIGN_ID`, `PARDOT_DEFAULT_TRACKER_DOMAIN_ID` y `PARDOT_DEFAULT_FOLDER_ID`.
- Valores visibles por defecto: remitente, reply-to, zona horaria e imagen de cabecera.

El formulario no pide Campaign ID, recipient lists, suppression lists, tracker domain, folder, programacion ni email operacional. Esos datos se gestionan desde configuracion para que la persona que prepara el evento solo vea campos editoriales y de envio basicos.

## Flujo

- `GET /api/config`: devuelve el modo, defaults y estado de configuracion sin exponer secretos.
- `POST /api/generate-copy`: genera el cuerpo del email desde la descripcion aproximada del evento.
- `POST /api/preview`: renderiza plantilla y devuelve `html`, `text` y `payload`.
- `POST /api/list-email`: mantiene el nombre interno por compatibilidad; en modo real crea un email template mediante `POST /api/v5/objects/email-templates`.

## Generacion con IA

El formulario pide una `Descripcion aproximada del evento`. Con el boton `Generar cuerpo con IA`, la app crea un cuerpo de email editable y lo inserta en la plantilla IESE.

El campo `Idioma del email` permite elegir `Español` o `English`. Ese idioma se aplica al cuerpo generado, fecha formateada, CTA y textos fijos de la plantilla.

El cuerpo generado conserva formato:

- Una linea en blanco separa parrafos.
- Un salto de linea simple se mantiene dentro del parrafo.
- `**texto**` se convierte en negrita en el HTML del email.

Azure OpenAI tiene prioridad cuando se configuran endpoint y deployment. Con API key:

```powershell
AZURE_OPENAI_ENDPOINT=https://TU-RECURSO.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=TU-DEPLOYMENT
AZURE_OPENAI_API_KEY=
```

Si `AZURE_OPENAI_API_KEY` queda vacia, la app usa `DefaultAzureCredential`, Managed Identity y el scope `https://ai.azure.com/.default`. Para desarrollo local, si Azure no esta configurado, puede utilizarse `OPENAI_API_KEY` con la API publica. Si no existe ninguna configuracion, el endpoint usa el generador local de demo.

Las credenciales, tokens, endpoints y nombres de deployment se mantienen exclusivamente en el servidor y no se envian al navegador ni se escriben en logs.

## Plantilla

Las plantillas viven en:

- `templates/event-invite.html`
- `templates/event-invite.txt`

La plantilla usa una direccion visual inspirada en IESE: rojo, negro, blanco, CTAs compactos, agenda con separadores rojos y cierre institucional.

Puedes editar los placeholders `{{eventName}}`, `{{emailHeadline}}`, `{{eventDateHuman}}`, `{{registrationUrl}}`, `{{speakerLine}}`, `{{agendaRowsHtml}}` y similares. Los bloques opcionales usan esta forma:

```text
{{#speakerName}}
Ponente: {{speakerLine}}
{{/speakerName}}
```

La plantilla incluye `%%unsubscribe%%` y `%%email_preference_center%%`, que suelen ser necesarios cuando se manda contenido propio en Account Engagement.

El campo `Agenda` acepta una linea por punto del programa con este formato:

```text
09:30 | Welcome remarks | IESE Business School
09:45 | Keynote session | Professor name
10:30 | Networking coffee
```

`Imagen de cabecera` debe ser una URL publica si quieres que se vea tambien cuando se envie desde Pardot.

## Referencias oficiales

- List Email API v5: https://developer.salesforce.com/docs/marketing/pardot/guide/list-email-v5.html
- Email Template API v5: https://developer.salesforce.com/docs/marketing/pardot/guide/email-template-v5.html
- Autenticacion Account Engagement: https://developer.salesforce.com/docs/marketing/pardot/guide/authentication.html
- Overview API v5: https://developer.salesforce.com/docs/marketing/pardot/guide/version5overview.html

## Tests

```powershell
node --test
```
