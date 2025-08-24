# 🚀 Deployment Guide - Discord Reminder Bot

Guide complet pour configurer et déployer le bot Discord avec GitHub Actions CI/CD.

## 📋 Vue d'ensemble

Le système CI/CD comprend :
- **CI (Intégration Continue)** : Tests automatiques sur chaque push/PR
- **CD (Déploiement Continu)** : Construction d'images Docker et déploiement automatique
- **Registry** : Utilise GitHub Container Registry (GHCR) par défaut

## ⚙️ Configuration GitHub

### 1. Secrets à configurer

Dans votre repository GitHub → Settings → Secrets and variables → Actions :

#### Obligatoires (pour CI/CD de base) :
```
# Aucun secret obligatoire pour la configuration de base
# Le token GitHub est automatiquement fourni
```

#### Optionnels (pour fonctionnalités avancées) :
```bash
# Pour les tests d'intégration (optionnel)
DISCORD_TOKEN_TEST=your_test_bot_token_here

# Pour Docker Hub (si vous préférez à GitHub Registry)
DOCKERHUB_USERNAME=your_dockerhub_username
DOCKERHUB_TOKEN=your_dockerhub_access_token

# Pour déploiement automatique sur VPS (optionnel)
PRODUCTION_SSH_KEY=your_private_ssh_key
PRODUCTION_HOST=your.server.com
PRODUCTION_USER=your_username
```

### 2. Permissions GitHub

Assurez-vous que GitHub Actions a les permissions nécessaires :
- Repository → Settings → Actions → General
- **Workflow permissions** : "Read and write permissions"
- **Allow GitHub Actions to create and approve pull requests** : ✅

### 3. Environments (optionnel mais recommandé)

Créez les environnements pour le déploiement protégé :
- Repository → Settings → Environments
- Créer : `production` et `staging`
- Ajouter des règles de protection (ex: required reviewers)

## 🐳 Configuration Docker Registry

### Option 1 : GitHub Container Registry (GHCR) - Recommandé ✅

**Avantages** : Intégré à GitHub, pas de configuration supplémentaire

Les images sont automatiquement publiées sur :
```
ghcr.io/alex-jordan547/discord-reminder-bot:latest
ghcr.io/alex-jordan547/discord-reminder-bot:main-2025-08-24
```

### Option 2 : Docker Hub (alternative)

1. Créer un compte sur [Docker Hub](https://hub.docker.com/)
2. Créer un Access Token : Account Settings → Security → New Access Token
3. Ajouter les secrets :
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`
4. Modifier `.github/workflows/cd.yml` :
   ```yaml
   build-dockerhub:
     if: true  # Changer de false à true
   ```

## 🖥️ Configuration VPS

### 1. Prérequis sur le serveur

```bash
# Installer Docker et Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Installer Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Créer le répertoire du projet
sudo mkdir -p /opt/discord-bot
sudo chown $USER:$USER /opt/discord-bot
```

### 2. Configuration environnement sur le serveur

```bash
cd /opt/discord-bot

# Créer le fichier .env
cat > .env << EOF
# Configuration Production
DISCORD_TOKEN=your_real_discord_token_here

# Reminder Configuration  
REMINDER_INTERVAL_HOURS=24
USE_SEPARATE_REMINDER_CHANNEL=false
REMINDER_CHANNEL_NAME=rappels-events

# Auto-deletion
AUTO_DELETE_REMINDERS=true
AUTO_DELETE_DELAY_HOURS=1

# Permissions
ADMIN_ROLES=Admin,Moderateur,Coach

# Logging
LOG_LEVEL=INFO
LOG_TO_FILE=true
LOG_COLORS=false

# Error Recovery
ERROR_RECOVERY_MAX_RETRIES=3
ERROR_RECOVERY_BASE_DELAY=1.5
ERROR_RECOVERY_MAX_DELAY=60
ERROR_RECOVERY_ENABLE_STATS=true

# Production Mode
TEST_MODE=false
EOF

# Créer les répertoires de données
mkdir -p data logs

# Permissions
chmod 600 .env
```

### 3. Docker Compose pour Production

```bash
# Télécharger le docker-compose depuis le repo
curl -O https://raw.githubusercontent.com/alex-jordan547/discord-reminder-bot/main/docker-compose.yml

# Ou le créer manuellement en adaptant l'image :
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  discord-reminder-bot:
    image: ghcr.io/alex-jordan547/discord-reminder-bot:latest
    container_name: discord-reminder-bot
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "python", "-c", "import discord; from bot import create_bot; bot = create_bot(); print('Health check passed'); import sys; sys.exit(0)"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M

networks:
  default:
    name: discord-bot-network
EOF
```

## 🔧 Déploiement

### 1. Déploiement automatique (GitHub Actions)

Quand vous push sur `main`, le workflow CD va :
1. Construire l'image Docker
2. La pousser sur GHCR
3. Créer un package de déploiement
4. (Optionnel) Déployer automatiquement sur le VPS

### 2. Déploiement manuel depuis GitHub

1. Repository → Actions → "CD - Build and Deploy"
2. "Run workflow" → Sélectionner `production` → "Run workflow"

### 3. Déploiement manuel sur le VPS

```bash
# Se connecter au VPS
ssh user@your-server.com
cd /opt/discord-bot

# Arrêter le bot actuel
docker-compose down

# Récupérer la dernière image
docker-compose pull

# Démarrer avec la nouvelle image
docker-compose up -d

# Vérifier les logs
docker-compose logs -f discord-reminder-bot
```

### 4. Script de déploiement automatique (optionnel)

Pour un déploiement automatique via SSH, créez ce script sur votre VPS :

```bash
# /opt/discord-bot/auto-deploy.sh
#!/bin/bash
set -e

SCRIPT_DIR="/opt/discord-bot"
IMAGE_NAME="${1:-ghcr.io/alex-jordan547/discord-reminder-bot:latest}"

echo "🚀 Starting deployment of Discord Reminder Bot"
echo "📦 Using image: $IMAGE_NAME"

cd "$SCRIPT_DIR"

# Stop existing container
echo "🛑 Stopping existing container..."
docker-compose down || true

# Pull latest image
echo "📥 Pulling latest image..."
docker pull "$IMAGE_NAME"

# Start new container
echo "▶️ Starting new container..."
docker-compose up -d

# Check health
echo "🔍 Checking container health..."
sleep 15

if docker-compose ps | grep -q "Up"; then
    echo "✅ Deployment successful!"
    docker-compose logs --tail=20 discord-reminder-bot
else
    echo "❌ Deployment failed!"
    docker-compose logs discord-reminder-bot
    exit 1
fi
```

Puis l'ajouter aux secrets GitHub :
```bash
# Ajouter la clé SSH privée dans PRODUCTION_SSH_KEY
# Et modifier le workflow CD pour décommenter les lignes SSH
```

## 🔍 Monitoring et Maintenance

### Vérification de l'état

```bash
# État des containers
docker-compose ps

# Logs en temps réel
docker-compose logs -f discord-reminder-bot

# Utilisation des ressources
docker stats discord-reminder-bot

# Santé du container
docker-compose exec discord-reminder-bot python -c "
import discord
from bot import create_bot
print('✅ Bot health check passed')
"
```

### Mise à jour

```bash
# Récupérer la dernière version
docker-compose pull

# Redémarrer avec la nouvelle image
docker-compose up -d

# Nettoyer les anciennes images
docker image prune -f
```

### Backup des données

```bash
# Backup automatique quotidien
(crontab -l 2>/dev/null; echo "0 2 * * * cd /opt/discord-bot && tar -czf backup-\$(date +\%Y\%m\%d).tar.gz data/ logs/") | crontab -
```

## 🚨 Dépannage

### Problèmes courants

1. **Container ne démarre pas** :
   ```bash
   docker-compose logs discord-reminder-bot
   # Vérifier DISCORD_TOKEN dans .env
   ```

2. **Permissions de fichiers** :
   ```bash
   sudo chown -R $USER:$USER /opt/discord-bot/
   chmod 600 .env
   ```

3. **Image non trouvée** :
   ```bash
   # Vérifier que l'image existe
   docker pull ghcr.io/alex-jordan547/discord-reminder-bot:latest
   ```

4. **Port déjà utilisé** :
   ```bash
   # Le bot n'utilise pas de ports externes normalement
   # Vérifier les conflits réseau si nécessaire
   ```

## 📚 Références

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

---

*Ce guide est maintenu à jour avec les dernières versions du bot et des workflows.*