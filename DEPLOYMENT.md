# Guide de Déploiement - Discord Reminder Bot

## Vue d'ensemble

Ce guide décrit le processus complet de déploiement pour le Discord Reminder Bot en production, incluant la configuration Docker optimisée, PM2, CI/CD, et les procédures de rollback.

## Architecture de Déploiement

### Composants

- **Docker** : Containerisation avec image Alpine optimisée
- **PM2** : Gestionnaire de processus pour la production
- **GitHub Actions** : Pipeline CI/CD automatisé
- **Shadow Deployment** : Déploiement parallèle pour validation
- **Monitoring** : Surveillance continue sur 48h

## Prérequis

### Environnement de Production

- Docker et Docker Compose installés
- Node.js 18+ (pour PM2)
- SQLite3 pour la base de données
- Minimum 2GB d'espace disque libre
- Minimum 512MB de RAM disponible

### Variables d'Environnement

Créer un fichier `.env` avec les variables suivantes :

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_token_here

# Database
DATABASE_URL=./data/discord_bot.db

# Bot Configuration
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

# Production
NODE_ENV=production
TZ=Europe/Paris

# Optional
TEST_MODE=false
```

## Méthodes de Déploiement

### 1. Déploiement Automatisé (Recommandé)

#### Utilisation du Script de Déploiement

```bash
# Déploiement complet avec validation
./scripts/deploy.sh

# Vérifier le statut
./scripts/deploy.sh --status

# Rollback si nécessaire
./scripts/deploy.sh --rollback
```

#### Processus Automatisé

1. **Vérifications pré-déploiement**
   - État Docker
   - Espace disque disponible
   - Fichiers de configuration

2. **Sauvegarde automatique**
   - Base de données
   - Répertoire data/
   - Logs

3. **Build de l'image Docker**
   - Multi-stage build optimisé
   - Tagging avec timestamp

4. **Déploiement Shadow**
   - Container parallèle pour tests
   - Validation des ressources

5. **Tests de santé**
   - Health checks
   - Tests de charge
   - Validation fonctionnelle

6. **Basculement en production**
   - Arrêt de l'ancien container
   - Activation du nouveau
   - Validation post-déploiement

### 2. Déploiement avec Docker Compose

```bash
# Build et démarrage
docker-compose up -d --build

# Vérification des logs
docker-compose logs -f discord-reminder-bot

# Arrêt
docker-compose down
```

### 3. Déploiement avec PM2

```bash
# Installation PM2 globale
npm install -g pm2

# Build du projet
npm run build

# Démarrage avec PM2
pm2 start ecosystem.config.js --env production

# Monitoring
pm2 monit

# Logs
pm2 logs discord-reminder-bot

# Redémarrage
pm2 reload ecosystem.config.js --env production
```

## CI/CD avec GitHub Actions

### Configuration

Le pipeline CI/CD est configuré dans `.github/workflows/ci-cd.yml` et inclut :

1. **Tests automatiques** sur Node.js 18 et 20
2. **Build Docker** multi-architecture (amd64/arm64)
3. **Scan de sécurité** avec Trivy
4. **Déploiement staging** sur la branche `develop`
5. **Déploiement production** sur la branche `main`

### Utilisation

```bash
# Push sur develop → déploiement staging
git push origin develop

# Push sur main → déploiement production
git push origin main

# Les environnements doivent être configurés dans GitHub
```

## Monitoring et Validation

### Surveillance 48h

```bash
# Démarrer la surveillance complète
./scripts/monitor.sh --start

# Check ponctuel
./scripts/monitor.sh --check

# Test de charge
./scripts/monitor.sh --load-test

# Générer un rapport
./scripts/monitor.sh --report
```

### Métriques Surveillées

- **Statut du container** : Disponibilité
- **Ressources** : CPU < 80%, RAM < 400MB
- **Redémarrages** : Maximum 5
- **Logs** : Erreurs et warnings
- **Réseau** : Connectivité Discord API
- **Base de données** : Intégrité et taille

### Alertes

Les alertes sont automatiquement générées pour :
- Container arrêté
- Utilisation excessive des ressources
- Erreurs dans les logs
- Problèmes de connectivité
- Corruption de base de données

## Procédures de Rollback

### Rollback Automatique

En cas d'échec de déploiement, le rollback est automatique :

```bash
# Le script de déploiement gère les échecs
./scripts/deploy.sh  # Rollback auto si échec
```

### Rollback Manuel

```bash
# Rollback rapide vers la dernière sauvegarde
./scripts/rollback.sh --quick

# Lister les sauvegardes disponibles
./scripts/rollback.sh --list

# Rollback vers une sauvegarde spécifique
./scripts/rollback.sh --backup backup_20250903_143022
```

### Plan de Rollback d'Urgence

1. **Immédiat** (< 5 minutes)
   ```bash
   docker stop discord-reminder-bot
   docker run -d --name discord-reminder-bot-emergency --env-file .env [previous-image]
   ```

2. **Complet** (< 15 minutes)
   ```bash
   ./scripts/rollback.sh --quick
   ```

3. **Restauration données** (< 30 minutes)
   - Restaurer depuis sauvegarde la plus récente
   - Vérifier l'intégrité des données
   - Redémarrer avec configuration précédente

## Optimisations Production

### Docker

- **Image Alpine** : Réduction de la taille
- **Multi-stage build** : Séparation build/runtime
- **Utilisateur non-root** : Sécurité renforcée
- **Health checks** : Détection des problèmes
- **Limites de ressources** : Contrôle consommation

### Performance

- **PM2** : Gestion avancée des processus
- **Logging optimisé** : Rotation automatique
- **Cache intelligent** : Réduction I/O
- **Monitoring** : Détection proactive

## Sécurité

### Mesures Implémentées

1. **Container Security**
   - Utilisateur non-root (1001:1001)
   - Image Alpine minimale
   - Scan de vulnérabilités

2. **Network Security**
   - Réseau Docker dédié
   - Isolation des containers

3. **Data Security**
   - Volumes persistants sécurisés
   - Sauvegardes chiffrées
   - Rotation des logs

4. **Access Control**
   - Variables d'environnement sécurisées
   - Permissions fichiers restreintes

## Troubleshooting

### Problèmes Courants

#### Container ne démarre pas
```bash
# Vérifier les logs
docker logs discord-reminder-bot

# Vérifier la configuration
docker-compose config

# Vérifier les variables d'environnement
docker exec discord-reminder-bot env | grep DISCORD
```

#### Haute consommation mémoire
```bash
# Vérifier les stats
docker stats discord-reminder-bot

# Ajuster les limites dans docker-compose.yml
# Redémarrer le container
docker-compose restart discord-reminder-bot
```

#### Erreurs de base de données
```bash
# Vérifier l'intégrité
sqlite3 discord_bot.db "PRAGMA integrity_check;"

# Sauvegarder et restaurer
./scripts/rollback.sh --quick
```

#### Bot ne répond plus
```bash
# Check Discord API
curl -s https://discord.com/api/v10/gateway

# Vérifier le token
# Redémarrer le service
docker-compose restart discord-reminder-bot
```

## Contacts et Support

### Escalade

1. **Niveau 1** : Logs automatiques et monitoring
2. **Niveau 2** : Rollback automatique
3. **Niveau 3** : Intervention manuelle requise

### Logs

- **Application** : `/app/logs/bot_YYYY-MM-DD.log`
- **PM2** : `/app/logs/pm2-*.log`
- **Déploiement** : `/app/logs/deployment.log`
- **Monitoring** : `/app/logs/health-monitor.log`
- **Alertes** : `/app/logs/alerts.log`

### Commandes Utiles

```bash
# État général
docker ps
docker-compose ps
pm2 list

# Logs temps réel
docker-compose logs -f
pm2 logs --lines 100

# Ressources
docker stats
htop

# Réseau
docker network ls
netstat -tlnp
```

---

**Note** : Ce guide suppose un environnement Linux/Unix. Pour Windows, adapter les chemins et commandes selon le contexte.
