#!/bin/bash

# Script de sauvegarde de la base de données
# Usage: ./scripts/backup-db.sh

set -e

DB_PATH="./data/discord_bot.db"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/discord_bot_${TIMESTAMP}.db"

# Créer le dossier de sauvegarde s'il n'existe pas
mkdir -p "$BACKUP_DIR"

# Vérifier que la BDD existe
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Base de données non trouvée : $DB_PATH"
    exit 1
fi

# Sauvegarder la BDD
cp "$DB_PATH" "$BACKUP_FILE"

echo "✅ Base de données sauvegardée : $BACKUP_FILE"
echo "📊 Taille : $(du -h "$BACKUP_FILE" | cut -f1)"

# Garder seulement les 5 dernières sauvegardes
cd "$BACKUP_DIR"
ls -t discord_bot_*.db | tail -n +6 | xargs rm -f 2>/dev/null || true

echo "🧹 Anciennes sauvegardes nettoyées (gardé les 5 plus récentes)"