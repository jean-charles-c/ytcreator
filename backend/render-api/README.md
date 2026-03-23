# RenderJobsAPI — Backend OVH pour les render jobs vidéo

## Déploiement rapide

```bash
# 1. Copier la config
cp .env.example .env
# Éditer .env avec vos valeurs

# 2. Lancer avec Docker
docker compose up -d --build

# 3. Vérifier
curl http://localhost:4000/health
```

## Endpoints

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| `GET` | `/health` | Non | Vérification de l'état du service |
| `POST` | `/render-jobs` | Bearer token | Créer un render job |
| `GET` | `/render-jobs/:id` | Bearer token | Lire le statut d'un job |
| `GET` | `/render-jobs?projectId=xxx` | Bearer token | Lister les jobs d'un projet |
| `PATCH` | `/render-jobs/:id/status` | Webhook secret | Mettre à jour le statut |

## Créer un job

```bash
curl -X POST http://localhost:4000/render-jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "projectId": "abc-123",
    "videoPromptIds": ["prompt-1", "prompt-2"],
    "payload": {
      "aspectRatio": "16:9",
      "quality": "high"
    }
  }'
```

## Statuts de job

| Statut | Description |
|--------|-------------|
| `queued` | Job reçu, en attente de traitement |
| `processing` | Rendu en cours |
| `completed` | Vidéo générée avec succès |
| `failed` | Erreur lors du rendu |

## Variables d'environnement

Voir `.env.example` pour la liste complète.
