# CLAUDE.md - Guide de développement Discord Reminder Bot

Ce fichier fournit des instructions spécifiques à Claude pour travailler avec ce projet de bot Discord.

## 🚀 Commandes de développement essentielles

### Développement local (RECOMMANDÉ)
```bash
# Configuration initiale (une seule fois)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install audioop-lts  # Nécessaire pour Python 3.13

# Lancement simple du bot en développement
./run_dev.sh

# Ou manuellement
source venv/bin/activate && python bot.py

# Arrêt : Ctrl+C dans le terminal
```

### Docker (pour production/test d'intégration)
```bash
# Développement avec reconstruction
docker-compose up --build

# Production (détaché)
docker-compose up -d

# Arrêt
docker-compose down

# Logs
docker-compose logs --tail=50 discord-reminder-bot
```

### Tests et validation
```bash
# Tests de formatage
python test_formatting.py

# Tests de planification dynamique
python test_dynamic_scheduling.py

# Tests du mode veille
python test_sleep_mode.py

# Vérification des imports
python verify_imports.py

# Tests d'intégration avec pytest
pytest tests/

# Test des logs colorisés - Colorisation COMPLÈTE (temporaire)
FORCE_COLOR=1 python -c "
import logging
from utils.logging_config import setup_logging
setup_logging('DEBUG', False)
logger = logging.getLogger('test_complet')
logger.debug('🔧 DEBUG - Timestamp, niveau, logger et message colorisés')
logger.info('ℹ️ INFO - Hiérarchie visuelle parfaite avec couleurs')
logger.warning('⚠️ WARNING - Structure complète colorisée')
logger.error('❌ ERROR - Détection instantanée des erreurs')
logger.critical('🚨 CRITICAL - Maximum de visibilité')
"
```

## ⚙️ Configuration de développement

### Fichier .env pour tests rapides
```env
DISCORD_TOKEN=your_token_here
TEST_MODE=true
REMINDER_INTERVAL_HOURS=0.0167  # 1 minute
LOG_LEVEL=DEBUG
LOG_TO_FILE=true
ADMIN_ROLES=Admin,Moderateur,Coach
USE_SEPARATE_REMINDER_CHANNEL=false
```

### Prérequis Python
- **Python 3.13** : Nécessite `audioop-lts` pour compatibilité discord.py
- **Python 3.12** : Fonctionne nativement sans packages supplémentaires
- **Environnement virtuel** : Obligatoire pour éviter les conflits système

## 🏗️ Architecture modulaire (version actuelle)

### Structure des dossiers
```
├── bot.py                     # Point d'entrée principal
├── commands/
│   ├── handlers.py           # Logique métier des commandes
│   └── slash_commands.py     # Commandes slash Discord
├── config/
│   └── settings.py          # Configuration centralisée
├── models/
│   └── reminder.py          # Modèle MatchReminder
├── persistence/
│   └── storage.py           # Persistance JSON
├── utils/
│   ├── logging_config.py    # Configuration des logs
│   ├── message_parser.py    # Analyse des liens Discord
│   ├── permissions.py       # Gestion des permissions
│   └── error_recovery.py    # Système de récupération d'erreurs
├── tests/
│   └── test_error_recovery.py # Tests unitaires récupération d'erreurs
├── data/                    # Données persistantes
└── logs/                    # Logs de l'application
```

### Composants principaux

**1. Classe MatchReminder** (`models/reminder.py`)
- Structure de données centrale pour l'état des évènements
- Sérialisation JSON avec `to_dict()`/`from_dict()`
- Calcul intelligent des rappels avec `is_reminder_due()`
- Gestion des permissions de canal

**2. Système de planification dynamique** (`commands/handlers.py`)
- `schedule_next_reminder_check()` : Planification précise au timestamp
- `check_reminders_dynamic()` : Vérification des rappels avec replanification
- **Mode veille intelligent** : 0 vérification quand aucun évènement surveillé
- **Précision** : ±5 secondes au lieu de ±30 secondes

**3. Configuration centralisée** (`config/settings.py`)
- Classe `Settings` avec validation automatique
- Support TEST_MODE pour intervalles flexibles (1-10080 min)
- Gestion des rôles administrateurs et permissions

**4. Persistance** (`persistence/storage.py`)
- Stockage JSON thread-safe
- Gestion des erreurs avec dégradation gracieuse
- Auto-sauvegarde sur changements d'état

## 🔄 Flux de données principal

### 1. Surveillance d'un match
```
Commande !watch → parse_message_link() → MatchReminder() → 
scan réactions existantes → save_matches() → reschedule_reminders()
```

### 2. Suivi des réactions
```
Événement Discord → on_reaction_add/remove → 
update users_who_reacted → save_matches()
```

### 3. Rappels automatiques
```
schedule_next_reminder_check() → sleep(temps_calculé) → 
check_reminders_dynamic() → send_reminder() → reschedule_next()
```

## 🛠️ Fonctionnalités spéciales

### Mode veille intelligent
- **Activation** : Automatique quand aucun match surveillé
- **Performance** : Économie de 288 vérifications/jour
- **Réactivation** : Instantanée lors d'ajout de match

### Planification dynamique
- **Précision** : Calcul au timestamp exact du prochain rappel
- **Optimisation** : Pas de vérifications inutiles
- **Fiabilité** : Élimination de la dérive temporelle

### Gestion multi-serveur
- Filtrage automatique par `guild_id`
- Permissions par canal (view_channel + send_messages)
- Canaux de rappels séparés optionnels

## 📝 Variables d'environnement

### Obligatoires
- `DISCORD_TOKEN` : Token du bot Discord

### Configuration des rappels
- `REMINDER_INTERVAL_HOURS` : Intervalle par défaut (24)
- `USE_SEPARATE_REMINDER_CHANNEL` : Canal séparé (false)
- `REMINDER_CHANNEL_NAME` : Nom du canal (rappels-event)

### Développement
- `TEST_MODE` : Active le mode test (false)
- `LOG_LEVEL` : Niveau de logs (INFO/DEBUG)
- `LOG_TO_FILE` : Logs dans fichier (true)
- `ADMIN_ROLES` : Rôles admin (Admin,Moderateur,Coach)

## 🐛 Débogage et logs

### Logs colorisés (NOUVEAU)
**Colorisation complète** de tous les éléments pour une lecture optimale :

#### 🎨 Couleurs par niveau :
- **🔧 DEBUG** : Cyan - Niveau en gras + message colorisé
- **ℹ️ INFO** : Vert - Niveau en gras + message colorisé
- **⚠️ WARNING** : Jaune - Niveau en gras + message colorisé
- **❌ ERROR** : Rouge - Niveau en gras + message colorisé
- **🚨 CRITICAL** : Magenta - Niveau en gras + message colorisé

#### 🏗️ Structure colorisée :
- **🕐 Timestamp** : Gris foncé (discret)
- **📍 Séparateurs** ` | ` : Gris foncé (structure subtile)
- **📂 Nom du logger** : Gris clair (lisible sans distraire)

**Résultat** : Hiérarchie visuelle parfaite pour une détection instantanée des erreurs !

### Contrôle des couleurs
```bash
# Forcer l'activation des couleurs
FORCE_COLOR=1 ./run_dev.sh

# Désactiver les couleurs
NO_COLOR=1 ./run_dev.sh

# Configuration via .env (optionnel)
LOG_COLORS=true    # ou false pour désactiver
```

### Logs en temps réel
```bash
# En développement local
tail -f logs/bot_$(date +%Y%m%d).log

# Avec Docker
docker-compose logs -f discord-reminder-bot
```

### Mode DEBUG
Dans `.env` : `LOG_LEVEL=DEBUG` pour logs détaillés incluant :
- Planification des rappels avec timestamps
- Calculs d'intervalles
- Permissions utilisateurs
- État du mode veille

## 🔒 Sécurité et bonnes pratiques

### Thread-safety
- Toutes les opérations de persistance sont protégées
- Utilisation d'asyncio pour la concurrence
- Pas de conditions de course sur les sauvegardes

### Gestion d'erreurs
- Reprise après erreur avec dégradation gracieuse
- Messages d'erreur descriptifs pour l'utilisateur
- Logging détaillé des exceptions

### Rate limiting Discord
- Limite de 50 mentions par rappel
- Délai de 2s entre rappels multiples
- Gestion des permissions 403/404

## 🧪 Tests et validation

### Configuration de test
```env
TEST_MODE=true
REMINDER_INTERVAL_HOURS=0.0167  # 1 minute
LOG_LEVEL=DEBUG
```

### Scénarios de test
1. **Ajout/suppression** d'évènements
2. **Réactions** en temps réel
3. **Rappels automatiques** avec intervalles courts
4. **Mode veille** sans évènements
5. **Permissions** multi-serveur

## 📚 Références importantes

### Fichiers de configuration
- `.env.example` : Template de configuration
- `requirements.txt` : Dépendances Python
- `docker-compose.yml` : Configuration Docker

### Scripts utilitaires
- `run_dev.sh` : Lancement développement
- `test_*.py` : Scripts de validation
- `fix_trailing_spaces.py` : Nettoyage formatage

### Documentation API
- [discord.py 2.3.2](https://discordpy.readthedocs.io/)
- [Python asyncio](https://docs.python.org/3/library/asyncio.html)