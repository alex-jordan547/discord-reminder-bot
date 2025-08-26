# Structure des Tests - Discord Reminder Bot

Ce document décrit l'organisation et les conventions de test pour le projet.

## 🏗️ Structure des Répertoires

```
tests/
├── README.md                   # Ce fichier
├── conftest.py                 # Configuration pytest globale et fixtures
├── fixtures/                   # Données de test réutilisables
│   └── test_compatibility.json
├── unit/                      # Tests unitaires (rapides, isolés)
│   ├── conftest.py            # Fixtures spécifiques aux tests unitaires
│   ├── commands/              # Tests des commandes Discord
│   ├── config/                # Tests de configuration
│   ├── models/                # Tests des modèles de données
│   ├── utils/                 # Tests des utilitaires
│   ├── test_dynamic_scheduling.py
│   ├── test_sleep_mode.py
│   └── test_validation_basic.py
├── integration/               # Tests d'intégration (multi-composants)
│   ├── database/              # Tests d'intégration base de données
│   ├── events/                # Tests d'intégration événements
│   ├── storage/               # Tests d'intégration stockage
│   ├── test_concurrency.py
│   ├── test_health_commands.py
│   └── test_multi_server_isolation.py
├── functional/                # Tests fonctionnels end-to-end
│   └── test_comprehensive.py
├── manual/                    # Tests manuels (non automatisés)
│   ├── test_commands.py
│   ├── test_manual.py
│   ├── test_sqlite_concurrency.py
│   ├── test_sqlite_event_manager.py
│   └── test_sqlite_scheduler.py
├── test_basic.py             # Tests de base généraux
├── test_fixes.py             # Tests de régression
├── test_imports.py           # Tests d'import
├── test_performance.py       # Tests de performance
└── test_regression.py        # Tests de régression automatisés
```

## 🏷️ Marqueurs pytest

Les tests utilisent des marqueurs pour organiser l'exécution :

- `@pytest.mark.unit` : Tests unitaires rapides (< 1s)
- `@pytest.mark.integration` : Tests d'intégration (1-10s)
- `@pytest.mark.functional` : Tests fonctionnels end-to-end (> 10s)
- `@pytest.mark.slow` : Tests lents nécessitant une attention particulière
- `@pytest.mark.database` : Tests nécessitant une base de données
- `@pytest.mark.discord` : Tests nécessitant des mocks Discord

## 🎯 Conventions de Nommage

### Fichiers
- `test_*.py` : Tests automatisés
- `*_test.py` : Tests alternatifs (moins commun)
- `conftest.py` : Configuration et fixtures pytest

### Fonctions
- `test_*` : Fonctions de test standard
- `Test*` : Classes de test (groupement thématique)

### Fixtures
- `*_fixture` : Fixtures réutilisables
- `mock_*` : Objets mockés
- `sample_*` : Données d'exemple

## 🚀 Commandes Utiles

```bash
# Tous les tests
pytest

# Tests par marqueur
pytest -m unit
pytest -m integration
pytest -m "not slow"

# Tests spécifiques
pytest tests/unit/
pytest tests/integration/
pytest tests/functional/

# Avec couverture
pytest --cov=. --cov-report=html

# Tests en parallèle
pytest -n auto

# Tests verbeux
pytest -v -s
```

## 📋 Guidelines

### Tests Unitaires
- **Rapides** : < 1 seconde par test
- **Isolés** : Aucune dépendance externe
- **Mocks** : Utiliser des mocks pour les dépendances
- **Coverage** : Viser > 90% de couverture

### Tests d'Intégration
- **Multi-composants** : Tester l'interaction entre modules
- **Base de données** : Utiliser des DB temporaires
- **Timeouts** : Prévoir des timeouts appropriés
- **Cleanup** : Nettoyer les ressources après test

### Tests Fonctionnels
- **End-to-end** : Scénarios utilisateur complets
- **Environnement** : Proche de la production
- **Données** : Utiliser des données réalistes
- **Performance** : Mesurer les temps de réponse

## 🔧 Fixtures Disponibles

Voir `conftest.py` pour la liste complète des fixtures :
- `test_db` : Base de données de test temporaire
- `mock_bot` : Bot Discord mocké
- `mock_guild` : Guild Discord mockée
- `sample_event` : Événement d'exemple
- `test_settings` : Configuration de test

## 📊 Métriques de Qualité

- **Couverture cible** : > 80% globale, > 90% pour les modules critiques
- **Temps d'exécution** : 
  - Tests unitaires : < 5 minutes total
  - Tests integration : < 15 minutes total
  - Tests fonctionnels : < 30 minutes total
- **Fiabilité** : > 99% de tests stables (non-flaky)