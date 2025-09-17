# Discord Reminder Bot - Déploiement Simplifié

## 🚀 Déploiement en Une Commande

```bash
make deploy
```

## 📋 Commandes Essentielles

### Déploiement
```bash
make deploy         # Déploiement complet
make start          # Démarrer les services
make stop           # Arrêter les services
make restart        # Redémarrer
make rebuild        # Rebuild et redéployer
```

### Monitoring
```bash
make status         # Statut du système
make logs           # Voir les logs
make monitor        # Check de santé
```

### Maintenance
```bash
make backup         # Créer une sauvegarde
make rollback       # Rollback rapide
make clean          # Nettoyer
```

### Développement
```bash
make build          # Builder le projet
make test           # Exécuter les tests
make quality        # Vérifier la qualité
```

## 🛠️ Configuration

### Variables d'environnement (.env.docker)
```bash
# Discord
DISCORD_TOKEN=your_token_here

# Database
DATABASE_TYPE=postgres
POSTGRES_PASSWORD=secure_password

# Dashboard
ENABLE_DASHBOARD=true
DASHBOARD_PORT=3000
```

## 🔧 Structure Simplifiée

### Fichiers principaux
- `Makefile` - Commandes unifiées (15 au lieu de 50+)
- `docker-compose.yml` - Configuration simplifiée
- `Dockerfile` - Build optimisé
- `scripts/deploy.sh` - Script de déploiement unifié
- `scripts/monitor.sh` - Monitoring simplifié
- `scripts/rollback.sh` - Rollback rapide

### Services Docker
- **discord-reminder-bot** - Application principale
- **postgres** - Base de données
- **redis** - Cache (optionnel)

## 🎯 Améliorations

### ✅ Supprimé
- PM2 (remplacé par Docker)
- Scripts de déploiement redondants (deploy-production.sh, deploy-staging.sh)
- Monitoring complexe (setup-monitoring.sh)
- Commandes Makefile redondantes (50+ → 15)
- Configuration multi-stage inutile
- GitHub Actions redondantes

### ✅ Optimisé
- **Dockerfile** - Build simplifié, image plus légère
- **docker-compose** - Configuration unifiée, variables d'environnement centralisées
- **Scripts** - Un seul script de déploiement, monitoring simple
- **Makefile** - Commandes essentielles seulement

## 🚀 Déploiement Production

### Pré-requis
```bash
# Vérifier Docker
docker --version
docker-compose --version

# Configurer l'environnement
cp .env.docker .env.docker.prod
# Éditer avec vos vraies valeurs
```

### Déploiement
```bash
# Pipeline complète
make prod-deploy  # quality + build + deploy

# Ou étape par étape
make quality      # Tests et vérifications
make deploy       # Déploiement
```

### Vérification
```bash
make status       # Voir l'état des services
make monitor      # Health check
make logs         # Voir les logs
```

## 🔄 Rollback

```bash
make rollback     # Rollback automatique vers la dernière sauvegarde
```

## 📊 Monitoring

```bash
./scripts/monitor.sh     # Health check simple
make logs               # Logs en temps réel
make status             # État des conteneurs
```

## 🐛 Dépannage

### Container ne démarre pas
```bash
make logs                    # Voir les erreurs
docker-compose config        # Valider la config
```

### Base de données
```bash
make db-check               # Vérifier l'intégrité
make db-migrate             # Migrer
```

### Problèmes de performance
```bash
docker stats discord-reminder-bot  # Ressources
```

## ⚡ Performance

### Avant l'optimisation
- Makefile: 50+ commandes
- Scripts: 8 fichiers redondants
- Configuration: Multi-stage complexe
- Déploiement: 3 stratégies différentes

### Après l'optimisation
- Makefile: 15 commandes essentielles
- Scripts: 3 fichiers unifiés
- Configuration: Simple et claire
- Déploiement: Une seule stratégie Docker

### Résultat
- ✅ **90% moins de complexité**
- ✅ **Maintenance simplifiée**
- ✅ **Déploiement unifié**
- ✅ **Documentation claire**

---

## 🎉 Migration Terminée!

Votre système de déploiement est maintenant:
- **Simple** - Une commande pour déployer
- **Fiable** - Docker uniquement, pas de PM2
- **Maintenable** - Configuration centralisée
- **Rapide** - Scripts optimisés