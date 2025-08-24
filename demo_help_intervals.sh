#!/bin/bash
# Demo script for new /help command and short test intervals
# Usage: ./demo_help_intervals.sh

set -e  # Exit on any error

echo "🎯 Demo des nouvelles fonctionnalités Discord Reminder Bot"
echo "========================================================"
echo

# Configuration du mode test
export TEST_MODE=true
export REMINDER_INTERVAL_HOURS=0.0167  # 1 minute
export LOG_LEVEL=DEBUG

echo "📋 Configuration demo activée:"
echo "  TEST_MODE: $TEST_MODE"
echo "  REMINDER_INTERVAL_HOURS: $REMINDER_INTERVAL_HOURS"
echo "  LOG_LEVEL: $LOG_LEVEL"
echo

# Test des fonctionnalités
echo "🧪 Test des nouvelles fonctionnalités..."
source venv/bin/activate
python3 test_help_and_intervals.py

echo
echo "🚀 Instructions pour tester en live avec Discord:"
echo "================================================"
echo
echo "1️⃣  Configurer le bot pour les tests rapides:"
echo "   echo 'TEST_MODE=true' >> .env"
echo "   echo 'REMINDER_INTERVAL_HOURS=0.0167' >> .env  # 1 minute"
echo "   echo 'LOG_LEVEL=DEBUG' >> .env"
echo
echo "2️⃣  Lancer le bot en mode développement:"
echo "   ./run_dev.sh"
echo
echo "3️⃣  Tester la nouvelle commande /help:"
echo "   - Utiliser /help dans Discord"
echo "   - Vérifier l'affichage en mode test"
echo "   - Observer les intervalles courts disponibles"
echo
echo "4️⃣  Tester les intervalles courts:"
echo "   - /watch avec 'interval: 30 secondes (test)'"
echo "   - /watch avec 'interval: 1 minute (test)'"
echo "   - /watch avec 'interval: 2 minutes (test)'"
echo
echo "5️⃣  Valider le comportement:"
echo "   - /list pour voir les rappels actifs"
echo "   - Observer les rappels automatiques rapides"
echo "   - /status pour voir le formatage des intervalles"
echo
echo "💡 Nouveautés visibles dans Discord:"
echo "   ✨ Interface /help riche avec emojis et sections"
echo "   ⚡ Choix d'intervalles étendus en mode test"
echo "   🎯 Affichage adapté selon le mode (test/prod)"
echo "   📊 Statistiques en temps réel dans /help"
echo "   💬 Conseils d'utilisation intégrés"
echo
echo "🔧 Pour revenir en mode production:"
echo "   echo 'TEST_MODE=false' >> .env"
echo "   echo 'REMINDER_INTERVAL_HOURS=24' >> .env"
echo
echo "🎉 Demo terminée ! Prêt pour les tests Discord."