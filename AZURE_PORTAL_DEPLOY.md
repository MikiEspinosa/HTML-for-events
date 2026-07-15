# Publicar en Azure sin consola

La app debe publicarse como Azure Container App porque tiene backend Node, Dockerfile, secretos y llamadas a OpenAI y Salesforce Account Engagement.

## 1. Publicar la imagen desde GitHub

Sube todo el proyecto al repositorio `MikiEspinosa/HTML-for-events`. No subas `.env`, `node_modules` ni archivos de log.

El workflow `.github/workflows/publish-container.yml` construye el Dockerfile y publica automaticamente estas imagenes al actualizar `main`:

```text
ghcr.io/mikiespinosa/html-for-events:latest
ghcr.io/mikiespinosa/html-for-events:<commit>
```

En GitHub abre `Actions` > `Publish container image` y ejecuta `Run workflow` si no se ha iniciado automaticamente. Al terminar, la ejecucion debe aparecer en verde.

## 2. Dar acceso a Azure a la imagen

La opcion mas sencilla es hacer publico el package en GitHub:

1. Abre el repositorio en GitHub.
2. En la columna derecha abre `Packages` > `html-for-events`.
3. Abre `Package settings`.
4. En `Danger Zone`, cambia la visibilidad a `Public`.

Esto solo hace publica la imagen Docker. El repositorio puede seguir siendo privado y ninguna credencial queda incluida en la imagen.

Si la politica de la organizacion exige mantener privado el package, crea un GitHub Personal Access Token clasico con permiso `read:packages` y usalo en Azure como contrasena del registro.

## 3. Crear la Container App

En Azure Portal abre `Container Apps` > `Create` y usa:

```text
Subscription: IA DEV
Resource group: RG-WE-AITaskforce-DEV
Container app name: html-generator-app
Region: West Europe
Container Apps Environment: mba-etl-env
Deployment source: Container image
```

No selecciones `Source code or artifact`: ese flujo intenta crear una asignacion de rol que tu usuario no puede conceder.

En el contenedor configura:

```text
Registry: Other registries
Registry server: ghcr.io
Image and tag: ghcr.io/mikiespinosa/html-for-events:latest
CPU: 0.5
Memory: 1 Gi
```

Si el package es publico, no indiques usuario ni contrasena. Si es privado, usa `MikiEspinosa` y el token de GitHub con `read:packages`.

## 4. Configurar la entrada

```text
Ingress: Enabled
Traffic: Accepting traffic from anywhere
Target port: 4173
Transport: Auto
Insecure connections: Disabled
```

## 5. Variables y secretos

Variables normales:

```text
PORT=4173
PARDOT_DRY_RUN=false
PARDOT_API_BASE_URL=https://pi.pardot.com
SALESFORCE_LOGIN_URL=https://login.salesforce.com
AZURE_OPENAI_ENDPOINT=https://TU-RECURSO.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=TU-DEPLOYMENT
OPENAI_MODEL=gpt-5.4-mini
DEFAULT_EVENT_TIMEZONE=Europe/Madrid
PARDOT_EMAIL_TEMPLATE_ENDPOINT=/api/v5/objects/email-templates
PARDOT_EMAIL_TEMPLATE_URL_TEMPLATE=https://pi.pardot.com/emailTemplate/read/id/{id}
PARDOT_DEFAULT_CAMPAIGN_ID=174990
PARDOT_DEFAULT_TRACKER_DOMAIN_ID=4099143
PARDOT_DEFAULT_FOLDER_ID=11644
PARDOT_DEFAULT_SENDER_NAME=IESE Business School
PARDOT_DEFAULT_SENDER_EMAIL=iese@global-mail.iese.edu
PARDOT_DEFAULT_REPLY_TO_EMAIL=iese@iese.edu
```

Crea como secretos, sin copiar sus valores en campos visibles:

```text
PARDOT_BUSINESS_UNIT_ID
SALESFORCE_CLIENT_ID
SALESFORCE_CLIENT_SECRET
SALESFORCE_REFRESH_TOKEN
AZURE_OPENAI_API_KEY
OPENAI_API_KEY
```

`AZURE_OPENAI_API_KEY` es opcional. Si se omite, activa la identidad administrada de la Container App y solicita que se le asigne acceso al recurso de Azure OpenAI. `OPENAI_API_KEY` solo es el fallback local cuando Azure OpenAI no esta configurado. Referencia cada secreto utilizado desde una variable de entorno con exactamente el mismo nombre.

## 6. Callback y prueba

Cuando Azure muestre la URL publica, anade a la Connected App de Salesforce:

```text
https://TU-URL-DE-AZURE/oauth/callback
```

Abre la URL, previsualiza un email y crea un email template para comprobar la conexion con Pardot.
