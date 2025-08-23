#!/usr/bin/env python3
"""
Test de validation pour les améliorations de la PR #14
- Thread safety des RetryStats
- Commandes slash /health et /sync ajoutées
- Fonctionnalité des statistiques de récupération améliorée
"""

import asyncio
import threading
from unittest.mock import Mock, AsyncMock
from utils.error_recovery import retry_stats, RetryStats


def test_retry_stats_thread_safety():
    """Test de la sécurité thread-safe des RetryStats."""
    print("🧪 Test de thread safety pour RetryStats...")
    
    stats = RetryStats()
    stats.reset()
    
    def record_calls():
        """Fonction pour enregistrer des appels dans un thread."""
        for i in range(100):
            stats.record_call(success=True if i % 2 == 0 else False, 
                             error_type="ThreadTestError" if i % 2 == 1 else None,
                             retries=1 if i % 3 == 0 else 0)
    
    # Créer plusieurs threads
    threads = []
    for _ in range(5):
        thread = threading.Thread(target=record_calls)
        threads.append(thread)
        thread.start()
    
    # Attendre que tous les threads se terminent
    for thread in threads:
        thread.join()
    
    summary = stats.get_summary()
    expected_total = 5 * 100  # 5 threads * 100 appels chacun
    
    assert summary['total_calls'] == expected_total, f"Expected {expected_total} total calls, got {summary['total_calls']}"
    print(f"✅ Thread safety validé: {summary['total_calls']} appels enregistrés correctement")
    print(f"✅ Taux de succès: {summary['success_rate_percent']}%")
    print(f"✅ Taux de récupération: {summary['recovery_rate_percent']}%")
    
    return True


def test_recovery_stats_calculation():
    """Test du calcul des statistiques de récupération."""
    print("🧪 Test du calcul des statistiques de récupération...")
    
    stats = RetryStats()
    stats.reset()
    
    # Scénario de test :
    # 1. Succès immédiat (pas de retry)
    stats.record_call(success=True, retries=0)
    
    # 2. Succès après retry (récupération)
    stats.record_call(success=True, retries=2)
    
    # 3. Échec après retries (pas de récupération)
    stats.record_call(success=False, error_type="TestError", retries=3)
    
    # 4. Autre succès après retry (récupération)
    stats.record_call(success=True, retries=1)
    
    summary = stats.get_summary()
    
    # Vérifications
    assert summary['total_calls'] == 4, f"Expected 4 total calls, got {summary['total_calls']}"
    assert summary['successful_calls'] == 3, f"Expected 3 successful calls, got {summary['successful_calls']}"
    assert summary['failed_calls'] == 1, f"Expected 1 failed call, got {summary['failed_calls']}"
    assert summary['retried_calls'] == 3, f"Expected 3 retried calls, got {summary['retried_calls']}"
    assert summary['recovered_calls'] == 2, f"Expected 2 recovered calls, got {summary['recovered_calls']}"
    
    # Vérifier le taux de récupération (2 récupérés / 3 avec retries = 66.67%)
    expected_recovery_rate = round((2 / 3) * 100, 2)
    assert summary['recovery_rate_percent'] == expected_recovery_rate, f"Expected {expected_recovery_rate}% recovery rate, got {summary['recovery_rate_percent']}%"
    
    print(f"✅ Calcul des statistiques de récupération validé")
    print(f"✅ Appels récupérés: {summary['recovered_calls']}/{summary['retried_calls']}")
    print(f"✅ Taux de récupération: {summary['recovery_rate_percent']}%")
    
    return True


async def test_slash_commands_imports():
    """Test que les commandes slash sont correctement importées."""
    print("🧪 Test des imports des commandes slash...")
    
    try:
        from commands.slash_commands import SlashCommands
        from commands.handlers import sync_slash_commands_logic
        
        # Créer une instance mock
        bot = Mock()
        slash_commands = SlashCommands(bot)
        
        # Vérifier que les méthodes existent
        assert hasattr(slash_commands, 'health'), "Méthode health manquante"
        assert hasattr(slash_commands, 'sync'), "Méthode sync manquante"
        
        # Vérifier que sync_slash_commands_logic existe
        assert callable(sync_slash_commands_logic), "sync_slash_commands_logic n'est pas callable"
        
        print("✅ Toutes les commandes slash sont correctement importées")
        return True
        
    except Exception as e:
        print(f"❌ Erreur lors de l'import des commandes slash: {e}")
        return False


def test_global_retry_stats():
    """Test de l'instance globale retry_stats."""
    print("🧪 Test de l'instance globale retry_stats...")
    
    # Reset pour commencer proprement
    retry_stats.reset()
    
    # Ajouter quelques données de test
    retry_stats.record_call(success=True, retries=0)
    retry_stats.record_call(success=True, retries=1)
    retry_stats.record_call(success=False, error_type="GlobalTestError", retries=2)
    
    summary = retry_stats.get_summary()
    
    assert summary['total_calls'] == 3, f"Expected 3 total calls, got {summary['total_calls']}"
    assert len(summary['most_common_errors']) > 0, "Aucune erreur enregistrée"
    assert summary['most_common_errors'][0][0] == "GlobalTestError", "Erreur non enregistrée correctement"
    
    print(f"✅ Instance globale retry_stats fonctionne correctement")
    print(f"✅ Total calls: {summary['total_calls']}")
    print(f"✅ Erreurs les plus fréquentes: {summary['most_common_errors']}")
    
    return True


async def main():
    """Fonction principale de test."""
    print("🚀 Démarrage des tests pour les améliorations de la PR #14\n")
    
    success_count = 0
    total_tests = 4
    
    # Test 1: Thread safety
    try:
        if test_retry_stats_thread_safety():
            success_count += 1
            print("✅ Test thread safety: RÉUSSI\n")
        else:
            print("❌ Test thread safety: ÉCHEC\n")
    except Exception as e:
        print(f"❌ Test thread safety: ERREUR - {e}\n")
    
    # Test 2: Calcul des statistiques de récupération
    try:
        if test_recovery_stats_calculation():
            success_count += 1
            print("✅ Test calcul récupération: RÉUSSI\n")
        else:
            print("❌ Test calcul récupération: ÉCHEC\n")
    except Exception as e:
        print(f"❌ Test calcul récupération: ERREUR - {e}\n")
    
    # Test 3: Imports des commandes slash
    try:
        if await test_slash_commands_imports():
            success_count += 1
            print("✅ Test imports commandes slash: RÉUSSI\n")
        else:
            print("❌ Test imports commandes slash: ÉCHEC\n")
    except Exception as e:
        print(f"❌ Test imports commandes slash: ERREUR - {e}\n")
    
    # Test 4: Instance globale retry_stats
    try:
        if test_global_retry_stats():
            success_count += 1
            print("✅ Test instance globale: RÉUSSI\n")
        else:
            print("❌ Test instance globale: ÉCHEC\n")
    except Exception as e:
        print(f"❌ Test instance globale: ERREUR - {e}\n")
    
    # Résumé final
    print("=" * 60)
    print(f"🎯 RÉSULTATS FINAUX: {success_count}/{total_tests} tests réussis")
    
    if success_count == total_tests:
        print("🎉 TOUS LES TESTS SONT RÉUSSIS!")
        print("✅ Les améliorations de la PR #14 sont fonctionnelles:")
        print("   - Thread safety des RetryStats ✓")
        print("   - Calcul des statistiques de récupération ✓")
        print("   - Commandes slash /health et /sync ✓")
        print("   - Instance globale retry_stats ✓")
    else:
        print("⚠️ Certains tests ont échoué. Veuillez vérifier les détails ci-dessus.")
    
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())