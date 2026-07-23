# A.U.R.A. HTML Generator

Aplicación web de IESE para preparar invitaciones HTML de eventos y crear `email templates` en Salesforce Account Engagement (Pardot). Incluye previsualización, plantillas editables, generación de contenido con Azure OpenAI e importación de landings de eventos de `apply.iese.edu`.

## Tecnología

- Frontend: HTML, CSS y JavaScript nativo.
- Backend: Node.js 22 o superior.
- IA: SDK oficial de OpenAI con Azure OpenAI, API key o Managed Identity.
- Salesforce: Account Engagement API v5 y OAuth 2.0.
- Importación de landings: Cheerio.
- Despliegue: Docker, GitHub Container Registry y Azure Container Apps.

## Desarrollo local

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

Abre `http://localhost:4173`. La aplicación arranca en modo seguro con `PARDOT_DRY_RUN=true`, por lo que genera la previsualización y el payload sin crear nada en Pardot.

## Configuración

Todas las credenciales son variables de entorno del servidor. Usa [.env.example](.env.example) como referencia y no subas nunca el archivo `.env`.

Configuración principal:

- `PARDOT_BUSINESS_UNIT_ID`
- `SALESFORCE_CLIENT_ID`
- `SALESFORCE_CLIENT_SECRET`
- `SALESFORCE_REFRESH_TOKEN`
- `PARDOT_DEFAULT_CAMPAIGN_ID`
- `PARDOT_DEFAULT_TRACKER_DOMAIN_ID`
- `PARDOT_DEFAULT_FOLDER_ID`

Azure OpenAI tiene prioridad cuando existen `AZURE_OPENAI_ENDPOINT` y `AZURE_OPENAI_DEPLOYMENT`. Si también existe `AZURE_OPENAI_API_KEY`, se usa la clave; en caso contrario se usa `DefaultAzureCredential` y Managed Identity. Para desarrollo local puede utilizarse `OPENAI_API_KEY` como fallback. Sin configuración de IA, la aplicación conserva el modo demo local.

Las claves, tokens y endpoints privados no se envían al frontend ni se escriben en logs.

## Funciones principales

- Tres variantes de plantilla: Genérico, Membresía y Recordatorio semanal/calendario.
- Campos y módulos ocultables.
- Importación asistida de landings HTTPS de `apply.iese.edu`.
- Generación bilingüe en español e inglés.
- Traducción completa de los campos editoriales al idioma seleccionado mediante Azure OpenAI.
- Ponentes, agenda, otros eventos, recursos y módulos gráficos editables.
- Previsualización de HTML y payload.
- Creación de email templates en Account Engagement.

## API

- `GET /api/config`: configuración pública y valores predeterminados sin secretos.
- `POST /api/import-event-url`: extrae datos de una landing IESE permitida.
- `POST /api/generate-copy`: genera el cuerpo editorial con IA o modo demo.
- `POST /api/translate-event`: traduce los campos editoriales conservando nombres, formato y estructura.
- `POST /api/preview`: renderiza HTML, texto y payload.
- `POST /api/list-email`: nombre conservado por compatibilidad; crea un email template en modo real.

## Pruebas

```powershell
npm test
```

## Docker

```powershell
docker build -t aura-html-generator .
docker run --env-file .env -p 4173:80 aura-html-generator
```

## GitHub Actions

El workflow [publish-container.yml](.github/workflows/publish-container.yml) se ejecuta al publicar en `main` o manualmente. Ejecuta las pruebas y, si pasan, publica la imagen en:

```text
ghcr.io/<organización-o-usuario>/<repositorio>:latest
```

El workflow utiliza `GITHUB_TOKEN`; no necesita guardar credenciales de Salesforce, Pardot ni Azure OpenAI en GitHub para construir la imagen.

## Azure

Las instrucciones de despliegue desde el portal están en [AZURE_PORTAL_DEPLOY.md](AZURE_PORTAL_DEPLOY.md). La infraestructura automatizada y su documentación están en [azure/](azure/README.md).

En Azure, guarda las credenciales como secretos de Container Apps o referencias a Azure Key Vault. Configura en la Connected App de Salesforce la callback pública:

```text
https://<host-publico>/oauth/callback
```

## Seguridad antes de publicar

1. Comprueba que `.env` no está incluido en Git.
2. No pegues claves reales en issues, commits ni Actions.
3. Mantén `PARDOT_DRY_RUN=true` hasta validar el entorno desplegado.
4. Si alguna credencial se compartió fuera de un gestor de secretos, rótala antes de producción.
