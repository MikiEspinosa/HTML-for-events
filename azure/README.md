# Azure deployment

Este despliegue crea:

- Azure Container App para la app Node.js.
- Azure Container Apps Environment.
- Azure Container Registry para construir y alojar la imagen.
- Azure Front Door Standard delante de la app.
- Log Analytics Workspace.
- Secretos nativos de Azure Container App para las credenciales sensibles.

Este despliegue no crea asignaciones IAM (`roleAssignments`). Esta variante esta pensada para funcionar con permisos de Contributor sobre el grupo de recursos, sin necesitar Owner ni User Access Administrator.

## Requisitos locales

- Azure CLI instalada.
- Sesion iniciada con `az login`.
- Permisos para crear recursos en la suscripcion y grupo de recursos.
- `.env` local completo en la raiz de la app.

## Despliegue

Desde `outputs/HTML generator`:

```powershell
.\azure\deploy.ps1 `
  -SubscriptionId "<subscription-id>" `
  -ResourceGroupName "<resource-group>" `
  -Location "westeurope" `
  -AppName "html-generator"
```

El script lee secretos desde `.env` y los configura como secretos de Azure Container App. El Container Registry se crea con usuario admin habilitado para que la Container App pueda descargar la imagen sin asignaciones IAM.

## Despues del despliegue

Actualiza la Connected App de Salesforce para incluir la callback publica:

```text
https://<front-door-host>/oauth/callback
```

El script imprime la URL final de Front Door al terminar.
