# 🧪 Mode Test - Documentation

## Vue d'ensemble

Le bot Discord Reminder dispose maintenant d'un **Mode Test** qui permet des intervalles de rappel plus flexibles pour les tests et le développement.

## 🚀 Activation du Mode Test

Le mode test est automatiquement activé quand `REMINDER_INTERVAL_HOURS < 1` dans le fichier `.env`.

**Exemple de configuration** :
```env
REMINDER_INTERVAL_HOURS=0.1  # 6 minutes = Mode Test
```

## ⏰ Intervalles Autorisés

### Mode Production (REMINDER_INTERVAL_HOURS ≥ 1)
- **Minimum** : 5 minutes
- **Maximum** : 1440 minutes (24 heures)
- **Valeurs courantes** : 5, 15, 30, 60, 120, 360, 720, 1440 minutes

### Mode Test (REMINDER_INTERVAL_HOURS < 1)
- **Minimum** : 1 minute
- **Maximum** : 10080 minutes (1 semaine)
- **Flexibilité** : Permet n'importe quelle valeur entre 1 et 10080 minutes

## 📝 Exemples d'Utilisation

### Commandes Legacy
```bash
# Mode Test : Intervalles courts maintenant autorisés
!watch https://discord.com/channels/.../... 1   # ✅ 1 minute (Mode Test)
!watch https://discord.com/channels/.../... 2   # ✅ 2 minutes (Mode Test)
!watch https://discord.com/channels/.../... 30  # ✅ 30 minutes

# Mode Production : Validation stricte
!watch https://discord.com/channels/.../... 2   # ⚠️ Ajusté à 5 minutes (minimum)
```

### Slash Commands
```bash
# Mode Test : Plus de flexibilité
/watch message:https://discord.com/... interval:1   # ✅ 1 minute
/watch message:https://discord.com/... interval:3   # ✅ 3 minutes
/watch message:https://discord.com/... interval:45  # ✅ 45 minutes
```

## 🎯 Messages d'Information

### Mode Test
Quand un intervalle est ajusté en mode test :
```
⚠️ Intervalle ajusté (Mode Test)
L'intervalle demandé (0 min) a été ajusté à 1 min (limite test: 1-10080 min)
```

### Mode Production  
Quand un intervalle est ajusté en production :
```
⚠️ Intervalle ajusté
L'intervalle demandé (2 min) a été ajusté à 5 min (limite: 5-1440 min)
```

## 📊 Formatage d'Affichage Étendu

Le mode test supporte un affichage amélioré pour tous les intervalles :

| Intervalle | Affichage |
|------------|-----------|
| 1 min | `1 minute` |
| 30 min | `30 minute(s)` |
| 90 min | `1h30m` |
| 1440 min | `1 jour` |
| 1500 min | `1j1h` |
| 1502 min | `1j1h2m` |
| 10080 min | `7 jour(s)` |

## 🔧 Utilisation pour les Tests

### Tests Rapides
```bash
# Rappels très fréquents pour test immédiat
!watch message_link 1   # Rappel toutes les 1 minute
!watch message_link 2   # Rappel toutes les 2 minutes
```

### Tests de Stress
```bash
# Test sur plusieurs jours
!watch message_link 2880   # Rappel tous les 2 jours
!watch message_link 10080  # Rappel toutes les semaines
```

## ⚠️ Bonnes Pratiques

### Mode Test
- ✅ Utilisez des intervalles courts (1-5 min) pour valider rapidement
- ✅ Testez différents scénarios avec des intervalles variés  
- ⚠️ Attention aux rappels très fréquents (évitez le spam Discord)
- ⚠️ N'utilisez le mode test qu'en développement

### Mode Production
- ✅ Intervalles réalistes (15-60 min minimum)
- ✅ Respectez les limites Discord pour éviter le rate limiting
- ✅ Utilisez les valeurs suggérées dans les slash commands

## 🚨 Sécurité

1. **Rate Limiting** : Même en mode test, le bot respecte les limites Discord
2. **Validation** : Tous les intervalles sont validés et clampés
3. **Logging** : Tous les ajustements sont loggés pour audit
4. **Persistence** : Les intervalles sont sauvegardés correctement

## 🔍 Debug et Monitoring

Pour vérifier le mode actuel :
- Consultez les logs de démarrage : `"TEST MODE"` apparaît si actif
- Utilisez `!config` pour voir l'intervalle global configuré
- Les messages d'ajustement indiquent le mode dans le titre

---

**Note** : Le mode test est conçu pour le développement et les tests. En production, utilisez toujours le mode standard avec des intervalles raisonnables.