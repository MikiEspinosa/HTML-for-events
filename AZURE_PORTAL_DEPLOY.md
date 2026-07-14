# Publicar en Azure sin consola

Esta app debe publicarse como Azure Container App porque tiene backend Node, Dockerfile, secretos y llamadas a OpenAI/Salesforce/Pardot.

## 1. Preparar GitHub

Sube el contenido de esta carpeta a un repositorio privado de GitHub:

```text
Dockerfile
package.json
pnpm-lock.yaml
server.js
public/
templates/
azure/
.env.example
.gitignore
.dockerignore
README.md
```

No subas estos archivos o carpetas:

```text
.env
node_modules/
*.log
```

## 2. Crear la Container App

En Azure Portal:

1. Busca `Container Apps`.
2. Pulsa `Create`.
3. Usa estos valores:

```text
Subscription: d9f3a88f-a670-4206-9c51-984436a2365a
Resource group: RG-WE-AITaskforce-DEV
Container app name: html-generator-app
Region: West Europe
```

4. Crea o selecciona un Container Apps Environment.
5. Activa Log Analytics si Azure lo pide.
6. En origen de despliegue, elige GitHub si aparece la opcion de desplegar desde codigo.
7. Selecciona el repositorio y rama.
8. Usa el Dockerfile de la raiz del proyecto.

## 3. Ingress

Configura:

```text
Ingress: Enabled
Traffic: Accepting traffic from anywhere
Target port: 4173
Transport: Auto
```

## 4. Variables y secretos

Añade estas variables en la Container App.

Variables normales:

```text
PORT=4173
PARDOT_DRY_RUN=false
PARDOT_API_BASE_URL=https://pi.pardot.com
SALESFORCE_LOGIN_URL=https://login.salesforce.com
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

Secrets:

```text
PARDOT_BUSINESS_UNIT_ID
SALESFORCE_CLIENT_ID
SALESFORCE_CLIENT_SECRET
SALESFORCE_REFRESH_TOKEN
OPENAI_API_KEY
```

Si Azure separa `Secrets` y `Environment variables`, crea primero el secret y luego referencia ese secret desde la variable de entorno con el mismo nombre.

## 5. Salesforce callback

Cuando Azure te de la URL publica, añade esta callback en la Connected App de Salesforce:

```text
https://TU-URL-DE-AZURE/oauth/callback
```

Ejemplo:

```text
https://html-generator-app.<region>.azurecontainerapps.io/oauth/callback
```

## 6. Prueba final

1. Abre la URL publica de la Container App.
2. Pulsa `Previsualizar`.
3. Pulsa `Crear email template`.
4. Comprueba que devuelve un enlace de Pardot.
