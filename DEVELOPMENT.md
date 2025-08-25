# 🛠️ Guide de Développement - Discord Reminder Bot

Guide complet pour éviter les erreurs de CI et maintenir la qualité du code.

## 🚀 Configuration initiale

### Pour les nouveaux développeurs
```bash
# Clone et configuration automatique
git clone https://github.com/alex-jordan547/discord-reminder-bot.git
cd discord-reminder-bot
chmod +x scripts/setup-dev.sh
./scripts/setup-dev.sh
```

### Configuration manuelle
```bash
# 1. Environnement virtuel
python3 -m venv venv
source venv/bin/activate

# 2. Installation complète
make dev-setup

# 3. Configuration .env
cp .env.example .env
# Editez .env avec vos tokens Discord
```

## ✅ Workflow de développement recommandé

### Avant de créer un nouveau fichier
```bash
# 1. Créez le fichier Python
touch nouveau_module.py

# 2. Formatez immédiatement
make format

# 3. Vérifiez avant commit
make validate-ci
```

### Avant chaque commit
```bash
# Formatage automatique
make format

# Validation complète (ce que les CI vont vérifier)
make validate-ci

# Si tout est OK, commit
git add .
git commit -m "feat: description du changement"
```

### Avant chaque push
```bash
# Le hook pre-push se lance automatiquement
git push origin ma-branche

# Si le hook échoue :
make format
make validate-ci
git add -u
git commit --amend --no-edit
git push origin ma-branche
```

## 🎯 Commandes de formatage essentielles

| Commande | Description | Quand utiliser |
|----------|-------------|----------------|
| `make format` | Formate tout le code | **Avant chaque commit** |
| `make format-check` | Vérifie sans modifier | Debug CI |
| `make validate-ci` | Validation complète | **Avant push** |
| `make pre-commit-all` | Lance tous les hooks | Validation approfondie |

## 🚫 Erreurs courantes et solutions

### ❌ Erreur: "py313 is not supported by black"

**Cause**: Configuration obsolète dans `pyproject.toml`

**Solution**:
```bash
# Vérifiez la configuration Black
grep -n "target-version" pyproject.toml

# Doit contenir : py38, py39, py310, py311, py312 (pas py313)
```

### ❌ Erreur: "would reformat healthcheck.py"

**Cause**: Fichier non formaté avec Black

**Solution**:
```bash
# Formatage automatique
make format

# Ou manuellement
python -m black healthcheck.py --line-length=100
```

### ❌ Erreur: "Imports incorrectly sorted"

**Cause**: Imports non triés avec isort

**Solution**:
```bash
# Formatage automatique
make format

# Ou manuellement
python -m isort healthcheck.py --profile=black --line-length=100
```

### ❌ Pre-commit hooks qui échouent

**Cause**: Hooks non installés ou obsolètes

**Solution**:
```bash
# Réinstallation complète
make dev-setup

# Mise à jour des hooks
make pre-commit-update

# Test sur tous les fichiers
make pre-commit-all
```

## 📋 Checklist avant commit/push

### ✅ Checklist commit
- [ ] `make format` exécuté
- [ ] `make format-check` passe
- [ ] Nouveaux fichiers Python formatés
- [ ] Tests locaux passent
- [ ] Message de commit descriptif

### ✅ Checklist push
- [ ] `make validate-ci` passe
- [ ] Pre-commit hooks installés
- [ ] Pas de fichiers temporaires ajoutés
- [ ] Configuration .env non commitée

## 🔧 Configuration IDE recommandée

### VS Code
Créer `.vscode/settings.json`:
```json
{
    "python.formatting.provider": "black",
    "python.formatting.blackArgs": ["--line-length=100"],
    "python.sortImports.args": ["--profile=black", "--line-length=100"],
    "python.linting.enabled": true,
    "python.linting.flake8Enabled": true,
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.organizeImports": true
    }
}
```

### PyCharm
1. Settings → Tools → Black → Enable
2. Settings → Tools → isort → Enable  
3. Settings → Code Style → Python → Line length: 100

## 🚨 Résolution des problèmes CI

### Si les CI échouent sur le formatage :
```bash
# 1. Récupérer la branche localement
git checkout ma-branche
git pull origin ma-branche

# 2. Corriger le formatage
make format

# 3. Valider localement
make validate-ci

# 4. Commit et push des corrections
git add -u
git commit -m "fix: resolve CI formatting issues"
git push origin ma-branche
```

### Si les hooks Git causent des problèmes :
```bash
# Contourner temporairement (usage exceptionnel)
git commit --no-verify -m "emergency commit"

# Réparer et recommit proprement
make format
git add -u
git commit --amend --no-edit
```

## 📊 Monitoring de la qualité

### Métriques importantes
- **Code coverage**: Maintenir >80%
- **Formatage**: 100% conformité Black/isort
- **Linting**: Zéro warning flake8
- **Sécurité**: Zéro vulnérabilité bandit critique

### Outils de validation
```bash
# Coverage des tests
make dev-test

# Analyse complète de sécurité
make lint

# Vérification des types
python -m mypy --ignore-missing-imports .
```

## 🎓 Bonnes pratiques générales

1. **Formatage systématique**: Jamais de commit sans `make format`
2. **Hooks obligatoires**: Installation automatique pour tous les devs
3. **Validation locale**: Tester avant de pusher
4. **Configuration synchronisée**: Versions d'outils alignées
5. **Documentation à jour**: Guide maintenu avec les changements

## 📞 Support

En cas de problème avec le formatage ou les CI :

1. Vérifiez ce guide de troubleshooting
2. Lancez `make help` pour voir toutes les commandes
3. Consultez la configuration dans `pyproject.toml`
4. Ouvrez une issue avec les détails de l'erreur

---

**💡 Astuce finale**: Utilisez `make validate-ci` avant chaque push pour éviter 99% des problèmes de CI !