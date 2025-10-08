# Architecture du Projet Discord Reminder Bot

## Structure du Projet

Le projet est maintenant organisé en une architecture modulaire avec une séparation claire entre le backend et le frontend :

```
discord-reminder-bot/
├── server/                 # Backend (API, Bot Discord, Services)
│   ├── src/
│   │   ├── bot/           # Logique du bot Discord
│   │   ├── api/           # Endpoints REST API
│   │   ├── db/            # Couche base de données
│   │   ├── services/      # Logique métier
│   │   ├── models/        # Modèles de données
│   │   ├── utils/         # Utilitaires serveur
│   │   ├── types/         # Types serveur
│   │   ├── config/        # Configuration
│   │   └── persistence/   # Persistance des données
│   ├── tests/             # Tests du serveur
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── client/                 # Frontend (Dashboard Vue.js)
│   ├── src/
│   │   ├── components/    # Composants Vue
│   │   ├── stores/        # Stores Pinia
│   │   ├── composables/   # Composables Vue
│   │   ├── utils/         # Utilitaires client
│   │   ├── types/         # Types client
│   │   └── assets/        # Assets statiques
│   ├── tests/             # Tests du client
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── shared/                 # Types et utilitaires partagés
│   ├── types/             # Types partagés
│   ├── utils/             # Utilitaires partagés
│   ├── package.json
│   └── tsconfig.json
└── package.json           # Orchestration globale
```

## Avantages de cette Architecture

### 🎯 **Séparation des Responsabilités**
- **Server** : Gère la logique métier, l'API REST, le bot Discord, et la base de données
- **Client** : Interface utilisateur moderne avec Vue.js pour le dashboard
- **Shared** : Types et utilitaires communs pour éviter la duplication

### 🚀 **Développement Indépendant**
- Chaque partie peut être développée, testée et déployée indépendamment
- Équipes frontend et backend peuvent travailler en parallèle
- Hot reload séparé pour une meilleure expérience de développement

### 📦 **Gestion des Dépendances**
- Dépendances spécifiques à chaque partie (pas de pollution)
- Bundles optimisés pour chaque environnement
- Mises à jour ciblées et sécurisées

### 🧪 **Tests Isolés**
- Tests unitaires et d'intégration séparés
- Environnements de test adaptés (Node.js vs JSDOM)
- Coverage reports indépendants

## Scripts de Développement

### Développement Global
```bash
npm run dev                 # Lance serveur + client en parallèle
npm run dev:server         # Lance uniquement le serveur
npm run dev:client         # Lance uniquement le client
```

### Build et Déploiement
```bash
npm run build              # Build complet (shared + server + client)
npm run build:server       # Build serveur uniquement
npm run build:client       # Build client uniquement
```

### Tests
```bash
npm test                   # Tests serveur + client
npm run test:server        # Tests serveur uniquement
npm run test:client        # Tests client uniquement
npm run test:watch         # Tests en mode watch
```

### Qualité du Code
```bash
npm run lint               # Lint serveur + client
npm run format             # Format tout le code
npm run type-check         # Vérification TypeScript
npm run quality            # Lint + format + type-check + tests
```

## Configuration des Ports

- **Serveur** : `http://localhost:3000`
- **Client** : `http://localhost:3001`
- **Proxy API** : Le client proxie `/api` vers le serveur
- **WebSocket** : Le client proxie `/ws` vers le serveur

## Installation

```bash
# Installation de toutes les dépendances
npm run install:all

# Ou installation manuelle
npm install                 # Dépendances racine
cd server && npm install   # Dépendances serveur
cd ../client && npm install # Dépendances client
cd ../shared && npm install # Dépendances partagées
```

## Migration depuis l'Ancienne Structure

Les fichiers ont été réorganisés comme suit :

- `src/bot.ts` → `server/src/bot/index.ts`
- `src/server/` → `server/src/api/`
- `src/dashboard/` → `client/src/`
- `src/db/`, `src/models/`, `src/services/` → `server/src/`
- Types partagés → `shared/types/`

## État de la Migration

1. ✅ **Restructuration des dossiers** - Terminée
2. ✅ **Mise à jour des imports et références** - Terminée
3. ✅ **Configuration des outils de build** - Terminée
4. ✅ **Tests de la nouvelle architecture** - 94/97 tests passent (97% de réussite)
5. 🔄 **Correction des derniers tests** - En cours
6. 🔄 **Documentation des APIs** - À faire
7. 🔄 **Configuration CI/CD adaptée** - À faire

## Tests Restants à Corriger

- **2 tests database.example.test.ts** : Problème de migration manquante (table `events`)
- **1 test postgresConnection.test.ts** : Configuration d'environnement PostgreSQL

## Prochaines Étapes

1. 🔄 Corriger les 3 tests restants
2. 🔄 Implémenter les endpoints API du dashboard (Task 3 du monitoring dashboard)
3. 🔄 Créer les composants Vue.js du dashboard
4. 🔄 Ajouter le support WebSocket pour les mises à jour temps réel