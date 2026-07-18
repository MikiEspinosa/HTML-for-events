param(
  [Parameter(Mandatory = $true)]
  [string] $SubscriptionId,

  [Parameter(Mandatory = $true)]
  [string] $ResourceGroupName,

  [string] $Location = "westeurope",
  [string] $AppName = "html-generator",
  [string] $EnvironmentFile = ".env"
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string] $Path)
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "No existe el archivo de entorno: $Path"
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }
    $key, $value = $line.Split("=", 2)
    $values[$key.Trim()] = $value.Trim().Trim('"').Trim("'")
  }
  return $values
}

function Require-EnvValue {
  param(
    [hashtable] $Values,
    [string] $Key
  )
  if (-not $Values.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace($Values[$Key])) {
    throw "Falta $Key en $EnvironmentFile"
  }
  return $Values[$Key]
}

function Get-EnvValueOrDefault {
  param(
    [hashtable] $Values,
    [string] $Key,
    [string] $Default
  )
  if ($Values.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace($Values[$Key])) {
    return $Values[$Key]
  }
  return $Default
}

$envValues = Read-DotEnv -Path $EnvironmentFile

$suffix = (Get-Random -Minimum 10000 -Maximum 99999).ToString()
$safeBase = ($AppName.ToLowerInvariant() -replace '[^a-z0-9]', '')
if ($safeBase.Length -gt 18) {
  $safeBase = $safeBase.Substring(0, 18)
}

$acrName = "$safeBase$suffix"
$frontDoorEndpointName = "$safeBase-$suffix"
$imageTag = "$acrName.azurecr.io/$AppName`:$(Get-Date -Format yyyyMMddHHmmss)"

az account set --subscription $SubscriptionId
az group create --name $ResourceGroupName --location $Location

$deploymentName = "$AppName-$(Get-Date -Format yyyyMMddHHmmss)"
$deploymentParameters = @(
  "location=$Location"
  "appName=$AppName"
  "acrName=$acrName"
  "frontDoorEndpointName=$frontDoorEndpointName"
  "pardotApiBaseUrl=$(Require-EnvValue $envValues "PARDOT_API_BASE_URL")"
  "salesforceLoginUrl=$(Require-EnvValue $envValues "SALESFORCE_LOGIN_URL")"
  "openAiModel=$(Get-EnvValueOrDefault $envValues "OPENAI_MODEL" "gpt-5.4-mini")"
  "defaultEventTimezone=$(Get-EnvValueOrDefault $envValues "DEFAULT_EVENT_TIMEZONE" "Europe/Madrid")"
  "pardotBusinessUnitId=$(Require-EnvValue $envValues "PARDOT_BUSINESS_UNIT_ID")"
  "salesforceClientId=$(Require-EnvValue $envValues "SALESFORCE_CLIENT_ID")"
  "salesforceClientSecret=$(Require-EnvValue $envValues "SALESFORCE_CLIENT_SECRET")"
  "salesforceRefreshToken=$(Require-EnvValue $envValues "SALESFORCE_REFRESH_TOKEN")"
  "openAiApiKey=$(Require-EnvValue $envValues "OPENAI_API_KEY")"
  "pardotDefaultCampaignId=$(Require-EnvValue $envValues "PARDOT_DEFAULT_CAMPAIGN_ID")"
  "pardotDefaultTrackerDomainId=$(Require-EnvValue $envValues "PARDOT_DEFAULT_TRACKER_DOMAIN_ID")"
  "pardotDefaultFolderId=$(Require-EnvValue $envValues "PARDOT_DEFAULT_FOLDER_ID")"
  "pardotDefaultSenderName=$(Require-EnvValue $envValues "PARDOT_DEFAULT_SENDER_NAME")"
  "pardotDefaultSenderEmail=$(Require-EnvValue $envValues "PARDOT_DEFAULT_SENDER_EMAIL")"
  "pardotDefaultReplyToEmail=$(Require-EnvValue $envValues "PARDOT_DEFAULT_REPLY_TO_EMAIL")"
)

$deployment = az deployment group create `
  --name $deploymentName `
  --resource-group $ResourceGroupName `
  --template-file ".\azure\main.bicep" `
  --parameters $deploymentParameters `
  --output json | ConvertFrom-Json

if (-not $deployment -or $deployment.properties.provisioningState -ne "Succeeded") {
  throw "El despliegue de infraestructura no ha terminado correctamente."
}

az acr build `
  --registry $acrName `
  --image $imageTag `
  .

$acrPassword = az acr credential show `
  --name $acrName `
  --query "passwords[0].value" `
  --output tsv

az containerapp update `
  --name "$AppName-app" `
  --resource-group $ResourceGroupName `
  --image $imageTag `
  --registry-server "$acrName.azurecr.io" `
  --registry-username $acrName `
  --registry-password $acrPassword

$outputs = az deployment group show `
  --name $deploymentName `
  --resource-group $ResourceGroupName `
  --query properties.outputs `
  --output json | ConvertFrom-Json

Write-Host ""
Write-Host "Despliegue completado."
Write-Host "Container App: $($outputs.containerAppUrl.value)"
Write-Host "Front Door:    $($outputs.frontDoorUrl.value)"
Write-Host ""
Write-Host "Importante: configura en Salesforce Connected App la callback publica:"
Write-Host "$($outputs.frontDoorUrl.value)/oauth/callback"
