@description('Azure region for all regional resources.')
param location string = resourceGroup().location

@description('Short app name used as a prefix for Azure resources.')
param appName string

@description('Container image to deploy initially. The deploy script updates this after ACR build.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Azure Container Registry name. Must be globally unique, lowercase letters and numbers only.')
param acrName string

@description('Log Analytics workspace name.')
param logAnalyticsName string = '${appName}-law'

@description('Container Apps managed environment name.')
param containerAppsEnvironmentName string = '${appName}-cae'

@description('Container App name.')
param containerAppName string = '${appName}-app'

@description('Azure Front Door profile name.')
param frontDoorProfileName string = '${appName}-afd'

@description('Azure Front Door endpoint name. Must be globally unique within azurefd.net.')
param frontDoorEndpointName string

@description('Pardot API base URL.')
param pardotApiBaseUrl string = 'https://pi.pardot.com'

@description('Salesforce login URL.')
param salesforceLoginUrl string = 'https://login.salesforce.com'

@description('OpenAI model used by the app.')
param openAiModel string = 'gpt-5.4-mini'

@description('Default timezone used by the app.')
param defaultEventTimezone string = 'Europe/Madrid'

@description('Pardot Business Unit ID.')
@secure()
param pardotBusinessUnitId string

@description('Salesforce connected app client ID.')
@secure()
param salesforceClientId string

@description('Salesforce connected app client secret.')
@secure()
param salesforceClientSecret string

@description('Salesforce OAuth refresh token.')
@secure()
param salesforceRefreshToken string

@description('OpenAI API key.')
@secure()
param openAiApiKey string

@description('Default Pardot campaign ID.')
param pardotDefaultCampaignId string

@description('Default Pardot tracker domain ID.')
param pardotDefaultTrackerDomainId string

@description('Default Pardot folder ID.')
param pardotDefaultFolderId string

@description('Default sender name.')
param pardotDefaultSenderName string

@description('Default sender email.')
param pardotDefaultSenderEmail string

@description('Default reply-to email.')
param pardotDefaultReplyToEmail string

var tags = {
  app: appName
  managedBy: 'bicep'
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 4173
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'pardot-business-unit-id'
          value: pardotBusinessUnitId
        }
        {
          name: 'salesforce-client-id'
          value: salesforceClientId
        }
        {
          name: 'salesforce-client-secret'
          value: salesforceClientSecret
        }
        {
          name: 'salesforce-refresh-token'
          value: salesforceRefreshToken
        }
        {
          name: 'openai-api-key'
          value: openAiApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: containerImage
          env: [
            {
              name: 'PORT'
              value: '4173'
            }
            {
              name: 'PARDOT_DRY_RUN'
              value: 'false'
            }
            {
              name: 'PARDOT_API_BASE_URL'
              value: pardotApiBaseUrl
            }
            {
              name: 'PARDOT_BUSINESS_UNIT_ID'
              secretRef: 'pardot-business-unit-id'
            }
            {
              name: 'SALESFORCE_LOGIN_URL'
              value: salesforceLoginUrl
            }
            {
              name: 'SALESFORCE_CLIENT_ID'
              secretRef: 'salesforce-client-id'
            }
            {
              name: 'SALESFORCE_CLIENT_SECRET'
              secretRef: 'salesforce-client-secret'
            }
            {
              name: 'SALESFORCE_REFRESH_TOKEN'
              secretRef: 'salesforce-refresh-token'
            }
            {
              name: 'OPENAI_API_KEY'
              secretRef: 'openai-api-key'
            }
            {
              name: 'OPENAI_MODEL'
              value: openAiModel
            }
            {
              name: 'DEFAULT_EVENT_TIMEZONE'
              value: defaultEventTimezone
            }
            {
              name: 'PARDOT_EMAIL_TEMPLATE_ENDPOINT'
              value: '/api/v5/objects/email-templates'
            }
            {
              name: 'PARDOT_EMAIL_TEMPLATE_URL_TEMPLATE'
              value: 'https://pi.pardot.com/emailTemplate/read/id/{id}'
            }
            {
              name: 'PARDOT_DEFAULT_CAMPAIGN_ID'
              value: pardotDefaultCampaignId
            }
            {
              name: 'PARDOT_DEFAULT_TRACKER_DOMAIN_ID'
              value: pardotDefaultTrackerDomainId
            }
            {
              name: 'PARDOT_DEFAULT_FOLDER_ID'
              value: pardotDefaultFolderId
            }
            {
              name: 'PARDOT_DEFAULT_SENDER_NAME'
              value: pardotDefaultSenderName
            }
            {
              name: 'PARDOT_DEFAULT_SENDER_EMAIL'
              value: pardotDefaultSenderEmail
            }
            {
              name: 'PARDOT_DEFAULT_REPLY_TO_EMAIL'
              value: pardotDefaultReplyToEmail
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

resource frontDoorProfile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: frontDoorProfileName
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

resource frontDoorEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' = {
  parent: frontDoorProfile
  name: frontDoorEndpointName
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: frontDoorProfile
  name: '${appName}-origin-group'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

resource origin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: originGroup
  name: '${appName}-origin'
  properties: {
    hostName: containerApp.properties.configuration.ingress.fqdn
    originHostHeader: containerApp.properties.configuration.ingress.fqdn
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: frontDoorEndpoint
  name: '${appName}-route'
  properties: {
    originGroup: {
      id: originGroup.id
    }
    origins: [
      {
        id: origin.id
      }
    ]
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
  }
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output containerAppName string = containerApp.name
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output frontDoorUrl string = 'https://${frontDoorEndpoint.properties.hostName}'
