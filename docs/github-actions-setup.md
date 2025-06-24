# Configuration des GitHub Actions pour les Vaults

Ce guide explique comment configurer les GitHub Actions pour déclencher des workflows spécifiques après chaque dépôt ou retrait dans les vaults.

## Configuration requise

### 1. Token GitHub

Créez un token GitHub avec les permissions suivantes :
- `repo` (pour accéder aux repositories privés)
- `workflow` (pour déclencher les workflows)

Ajoutez le token dans votre fichier `.env` :

```bash
PRIVATE_GITHUB_TOKEN=ghp_your_github_token_here
```

### 2. Repository GitHub

Le système utilise le repository `detradefund/subgraph` qui contient les workflows suivants :

```
detradefund/subgraph/
├── .github/
│   └── workflows/
│       ├── sync-scheduler-eth.yml
│       ├── sync-scheduler-eurc.yml
│       └── sync-scheduler-usdc.yml
```

### 3. Mapping des vaults

Le mapping des vaults vers leurs workflows est configuré dans `src/routes/api/github/trigger-action/+server.ts` :

```typescript
const vaultActions = {
  'detrade-core-usdc': {
    repository: 'detradefund/subgraph',
    workflow: 'sync-scheduler-usdc.yml'
  },
  'detrade-core-eth': {
    repository: 'detradefund/subgraph',
    workflow: 'sync-scheduler-eth.yml'
  },
  'detrade-core-eurc': {
    repository: 'detradefund/subgraph',
    workflow: 'sync-scheduler-eurc.yml'
  },
  'dev-detrade-core-usdc': {
    repository: 'detradefund/subgraph',
    workflow: 'sync-scheduler-usdc.yml'
  }
};
```

## Fonctionnement

### 1. Déclenchement automatique

Après chaque transaction réussie (dépôt ou retrait), l'application :

1. Appelle l'endpoint `/api/github/trigger-action`
2. L'endpoint identifie le vault et récupère la configuration correspondante
3. Déclenche la GitHub Action appropriée via l'API GitHub
4. Passe les paramètres de la transaction (hash, montant, adresse utilisateur, etc.)

### 2. Paramètres transmis

Chaque GitHub Action reçoit les paramètres suivants :

- `manual_trigger` : 'true' (pour indiquer un déclenchement manuel)
- `vault_id` : ID du vault (ex: "detrade-core-usdc")
- `action_type` : Type d'action ("deposit" ou "withdraw")
- `transaction_hash` : Hash de la transaction blockchain
- `amount` : Montant de la transaction
- `user_address` : Adresse du wallet utilisateur
- `timestamp` : Timestamp de la transaction

### 3. Workflows existants

Les workflows existants dans `detradefund/subgraph` sont configurés pour :

- Se déclencher automatiquement toutes les 15 minutes
- Permettre un déclenchement manuel
- Synchroniser les données MongoDB
- Exécuter des scripts de synchronisation spécifiques à chaque vault

## Utilisation

### Ajouter un nouveau vault

1. Créez le workflow GitHub Action dans le repository `detradefund/subgraph`
2. Ajoutez le mapping dans `src/routes/api/github/trigger-action/+server.ts`
3. Testez avec une transaction

### Personnalisation des workflows

Chaque workflow peut être personnalisé selon les besoins du vault :

- Notifications Discord/Slack
- Mise à jour de bases de données
- Analytics et reporting
- Intégrations tierces
- Alertes de sécurité

## Sécurité

- Le token GitHub est stocké dans les variables d'environnement
- Les workflows sont déclenchés uniquement après confirmation de transaction
- Les paramètres sont validés côté serveur
- Les erreurs sont loggées mais n'interrompent pas le flux utilisateur

## Monitoring

Les logs des GitHub Actions sont disponibles dans :
- L'interface GitHub Actions du repository `detradefund/subgraph`
- Les logs de l'application (console)
- Les logs du serveur API

## Exemples d'utilisation

### Notification Discord

```yaml
- name: Send Discord notification
  run: |
    curl -H "Content-Type: application/json" \
         -d '{"content":"New ${{ github.event.inputs.action_type }} in vault ${{ github.event.inputs.vault_id }}: ${{ github.event.inputs.amount }}"}' \
         ${{ secrets.DISCORD_WEBHOOK_URL }}
```

### Mise à jour de base de données

```yaml
- name: Update database
  run: |
    npm run update-vault-stats \
      --vault=${{ github.event.inputs.vault_id }} \
      --action=${{ github.event.inputs.action_type }} \
      --amount=${{ github.event.inputs.amount }}
```

### Analytics

```yaml
- name: Send to analytics
  run: |
    curl -X POST https://api.analytics.com/events \
         -H "Authorization: Bearer ${{ secrets.ANALYTICS_TOKEN }}" \
         -d '{
           "event": "vault_transaction",
           "vault_id": "${{ github.event.inputs.vault_id }}",
           "action_type": "${{ github.event.inputs.action_type }}",
           "amount": "${{ github.event.inputs.amount }}"
         }'
```

## Structure des workflows existants

Les workflows existants suivent cette structure :

```yaml
name: Sync Scheduler - ETH

on:
  push:
    branches: [ master, main ]
  schedule:
    # Toutes les 15 minutes
    - cron: '*/15 * * * *'
  workflow_dispatch:
    inputs:
      manual_trigger:
        description: 'Déclenchement manuel de la synchronisation'
        required: false
        default: 'true'

jobs:
  sync:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
        cache-dependency-path: detrade-core-eth/mongo-sync/package-lock.json
        
    - name: Install dependencies
      run: |
        cd detrade-core-eth/mongo-sync
        npm ci
        
    - name: Run sync-once script
      run: |
        cd detrade-core-eth/mongo-sync
        node sync-once.js
      env:
        MONGODB_URI: ${{ secrets.MONGODB_URI }}
        
    - name: Log completion
      run: |
        echo "Sync completed at $(date)"
        echo "Triggered by: ${{ github.event_name }}"
``` 