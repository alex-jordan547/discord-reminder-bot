# Guide de Style - Discord Reminder Bot

## Vue d'ensemble du projet

Ce projet est un **bot Discord Python** utilisant la bibliothèque `discord.py` avec une architecture modulaire. Le code doit respecter les spécifications critiques de **sécurité concurrentielle** et de **récupération d'erreur**.

## 🚨 Règles Critiques (Non négociables)

### 1. Thread Safety & Concurrence
```python
# ✅ OBLIGATOIRE: Toutes les opérations de persistance doivent être thread-safe
import threading
from threading import Lock

class ThreadSafeStorage:
    def __init__(self):
        self._lock = Lock()
        
    async def save_data(self, data):
        with self._lock:  # Protection contre race conditions
            # Opération de sauvegarde
            pass
```

### 2. Gestion d'Erreur & Récupération (Discord API)
```python
# ✅ OBLIGATOIRE: Mécanismes de retry et récupération gracieuse
import asyncio
from discord.errors import HTTPException, DiscordServerError

async def safe_discord_operation():
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Opération Discord API
            return await some_discord_call()
        except (HTTPException, DiscordServerError) as e:
            if attempt == max_retries - 1:
                # Dégradation gracieuse
                await handle_fallback()
                raise
            await asyncio.sleep(2 ** attempt)  # Backoff exponentiel
```

### 3. Architecture Modulaire Stricte
```python
# ✅ Structure requise:
# commands/     - Gestionnaires de commandes
# config/       - Configuration système
# models/       - Modèles de données
# persistence/  - Stockage et persistance
# utils/        - Utilitaires

# ❌ INTERDIT: Imports circulaires entre modules
# ❌ INTERDIT: Logique business dans bot.py
```

## 📋 Standards de Code Python

### Imports et Organisation
```python
# ✅ Ordre des imports (respecter PEP 8)
import asyncio
import logging
from typing import Optional, Dict, Any

import discord
from discord.ext import commands

from config.settings import Config
from models.reminder import Reminder
from utils.logging_config import setup_logger
```

### Type Annotations (Obligatoires)
```python
# ✅ OBLIGATOIRE: Type hints sur toutes les fonctions publiques
async def create_reminder(
    user_id: int,
    message: str,
    timestamp: datetime,
    guild_id: Optional[int] = None
) -> Reminder:
    """Crée un nouveau rappel avec validation."""
    pass

# ✅ Utiliser les types Discord appropriés
async def handle_interaction(interaction: discord.Interaction) -> None:
    pass
```

### Async/Await Patterns
```python
# ✅ Toujours utiliser async/await pour Discord.py
async def send_reminder(channel: discord.TextChannel, content: str) -> None:
    try:
        await channel.send(content)
    except discord.Forbidden:
        logger.warning(f"Permission denied for channel {channel.id}")
    except discord.HTTPException as e:
        logger.error(f"Failed to send message: {e}")

# ❌ JAMAIS de .run() ou synchrone dans les handlers Discord
```

### Gestion des Exceptions
```python
# ✅ Pattern requis pour toutes les opérations Discord
async def discord_operation():
    try:
        # Opération principale
        result = await discord_api_call()
        return result
    except discord.NotFound:
        # Ressource introuvable - dégradation gracieuse
        logger.info("Resource not found, skipping operation")
        return None
    except discord.Forbidden:
        # Permissions insuffisantes - logging et fallback
        logger.warning("Insufficient permissions")
        await notify_admin()
        return None
    except discord.HTTPException as e:
        # Erreur réseau - retry avec backoff
        logger.error(f"HTTP error: {e}")
        raise  # Laisse le mécanisme de retry gérer
    except Exception as e:
        # Erreur inattendue - logging critique
        logger.critical(f"Unexpected error: {e}")
        raise
```

## 🏗️ Architecture et Modularité

### Structure des Commandes
```python
# ✅ Structure requise dans commands/
class ReminderCommands(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.storage = bot.get_cog('StorageManager')
    
    @app_commands.command(name="watch")
    async def watch_command(
        self,
        interaction: discord.Interaction,
        message: str
    ) -> None:
        """Commande watch avec gestion d'erreur complète."""
        # Implémentation...
```

### Persistence Thread-Safe
```python
# ✅ Toute classe de persistance DOIT hériter de cette base
from abc import ABC, abstractmethod
from threading import Lock

class ThreadSafeStorageBase(ABC):
    def __init__(self):
        self._lock = Lock()
    
    async def safe_operation(self, func, *args, **kwargs):
        with self._lock:
            return await func(*args, **kwargs)
```

### Configuration
```python
# ✅ Centraliser toute la config dans config/settings.py
from dataclasses import dataclass
from typing import Optional

@dataclass
class BotConfig:
    token: str
    guild_ids: list[int]
    log_level: str = "INFO"
    retry_attempts: int = 3
    retry_delay: float = 1.0
    
    @classmethod
    def from_env(cls) -> 'BotConfig':
        """Charge la configuration depuis les variables d'environnement."""
        # Implémentation sécurisée
        pass
```

## 📝 Documentation et Logging

### Docstrings (Format Google)
```python
async def create_reminder(user_id: int, content: str) -> Reminder:
    """Crée un nouveau rappel pour l'utilisateur.
    
    Args:
        user_id: ID Discord de l'utilisateur
        content: Contenu du rappel
        
    Returns:
        Reminder: Instance du rappel créé
        
    Raises:
        ValueError: Si le contenu est vide
        StorageError: Si la sauvegarde échoue
        
    Note:
        Cette fonction est thread-safe et inclut la récupération d'erreur.
    """
```

### Logging Structuré
```python
import logging
from utils.logging_config import get_logger

logger = get_logger(__name__)

# ✅ Niveaux de logging appropriés
logger.debug("Détails de débogage")      # Développement uniquement
logger.info("Opération normale")          # Info générale
logger.warning("Situation inhabituelle")  # Attention requise
logger.error("Erreur récupérable")       # Erreur gérée
logger.critical("Erreur critique")        # Système compromis
```

## 🔒 Sécurité

### Variables d'Environnement
```python
# ✅ JAMAIS de tokens/secrets en dur dans le code
import os
from typing import Optional

def get_env_var(name: str, default: Optional[str] = None) -> str:
    """Récupère une variable d'environnement avec validation."""
    value = os.getenv(name, default)
    if value is None:
        raise ValueError(f"Variable d'environnement requise: {name}")
    return value

# Usage:
DISCORD_TOKEN = get_env_var("DISCORD_TOKEN")
```

### Validation des Données
```python
# ✅ Valider toutes les entrées utilisateur
def validate_reminder_content(content: str) -> str:
    """Valide et nettoie le contenu d'un rappel."""
    if not content or not content.strip():
        raise ValueError("Le contenu ne peut pas être vide")
    
    # Nettoyer le contenu
    cleaned = content.strip()[:1000]  # Limite de taille
    return cleaned
```

## ❌ Anti-Patterns à Éviter

### Code Prohibé
```python
# ❌ JAMAIS: Operations bloquantes dans les handlers
def blocking_operation():
    time.sleep(5)  # Bloque l'event loop

# ❌ JAMAIS: Gestion d'erreur générique
try:
    await discord_call()
except Exception:
    pass  # Masque toutes les erreurs

# ❌ JAMAIS: Variables globales mutables
global_data = {}  # Race conditions garanties

# ❌ JAMAIS: Imports relatifs complexes
from ...utils.helpers import something
```

### Patterns Dangereux
```python
# ❌ JAMAIS: Retry infini
while True:
    try:
        await discord_call()
        break
    except:
        continue  # Boucle infinie potentielle

# ❌ JAMAIS: Ressources non libérées
file = open("data.json")
data = file.read()  # Fichier jamais fermé
```

## ✅ Checklist de Review

Avant de valider du code, vérifier:

- [ ] **Thread Safety**: Toutes les opérations de persistance sont protégées
- [ ] **Error Recovery**: Retry logic et dégradation gracieuse implémentés
- [ ] **Type Hints**: Annotations complètes sur les fonctions publiques
- [ ] **Async/Await**: Pas de code synchrone dans les handlers Discord
- [ ] **Exception Handling**: Gestion spécifique par type d'erreur
- [ ] **Logging**: Messages appropriés pour debug/monitoring
- [ ] **Documentation**: Docstrings Google format
- [ ] **Architecture**: Respect de la structure modulaire
- [ ] **Sécurité**: Pas de secrets en dur, validation des entrées
- [ ] **Performance**: Pas d'operations bloquantes dans l'event loop

## 🎯 Objectifs Qualité

- **Couverture d'erreur**: 90%+ des opérations Discord protégées
- **Type annotations**: 80%+ de couverture
- **Documentation**: 70%+ des fonctions publiques documentées
- **Complexité cyclomatique**: Max 10 par fonction
- **Thread safety**: 100% des opérations de persistance protégées

---

> **Note**: Ces règles sont basées sur les spécifications critiques du projet. Toute violation des règles de thread safety ou de récupération d'erreur doit être marquée comme **critique** et bloquante.