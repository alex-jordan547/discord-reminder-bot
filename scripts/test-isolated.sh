#!/bin/bash

# Script de test isolé qui protège votre base de données de développement
# Usage: ./scripts/test-isolated.sh [fichier-de-test-optionnel]

echo "🔒 Démarrage des tests isolés..."

# Sauvegarde de la base de données actuelle
DB_FILE="discord_bot.db"
BACKUP_FILE="${DB_FILE}.backup-$(date +%Y%m%d-%H%M%S)"

if [ -f "$DB_FILE" ]; then
    echo "📦 Sauvegarde de la base de données: $BACKUP_FILE"
    cp "$DB_FILE" "$BACKUP_FILE"
fi

# Renomme temporairement la base de données de production
if [ -f "$DB_FILE" ]; then
    mv "$DB_FILE" "${DB_FILE}.temp"
fi

# Force l'utilisation de la base en mémoire
export NODE_ENV=test
export DATABASE_PATH=":memory:"
export DATABASE_NAME=":memory:"

echo "🧪 Exécution des tests avec base de données en mémoire..."

# Lance les tests
if [ -z "$1" ]; then
    npm run test
else
    npm run test -- "$1"
fi

TEST_EXIT_CODE=$?

# Restaure la base de données de production
if [ -f "${DB_FILE}.temp" ]; then
    mv "${DB_FILE}.temp" "$DB_FILE"
fi

# Supprime la sauvegarde si les tests ont réussi
if [ $TEST_EXIT_CODE -eq 0 ] && [ -f "$BACKUP_FILE" ]; then
    rm "$BACKUP_FILE"
    echo "✅ Tests réussis, sauvegarde supprimée"
else
    echo "⚠️  Sauvegarde conservée: $BACKUP_FILE"
fi

echo "🔓 Tests terminés avec code de sortie: $TEST_EXIT_CODE"
exit $TEST_EXIT_CODE
