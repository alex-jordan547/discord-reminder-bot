#!/usr/bin/env python3
"""
Integration tests for health commands functionality.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

import asyncio
from unittest.mock import Mock, AsyncMock
from utils.error_recovery import retry_stats
from commands.slash_commands import SlashCommands


async def test_health_stats_functionality():
    """Test de la fonctionnalité des statistiques health."""
    print("🧪 Test de la fonctionnalité des statistiques health")
    
    # Reset stats and add some test data
    retry_stats.reset()
    retry_stats.record_call(success=True, retries=0)
    retry_stats.record_call(success=True, retries=1)
    retry_stats.record_call(success=False, error_type="TestError", retries=2)
    retry_stats.record_call(success=True, retries=1)  # This should count as recovered
    
    # Verify statistics are correct
    stats = retry_stats.get_summary()
    print(f"✅ Total calls: {stats['total_calls']}")
    print(f"✅ Success rate: {stats['success_rate_percent']}%")
    print(f"✅ Recovery rate: {stats['recovery_rate_percent']}%")
    print(f"✅ Recovered calls: {stats['recovered_calls']}")
    print(f"✅ Failed calls: {stats['failed_calls']}")
    print(f"✅ Most common errors: {stats['most_common_errors']}")
    
    # Verify calculations
    assert stats['total_calls'] == 4, f"Expected 4 total calls, got {stats['total_calls']}"
    assert stats['successful_calls'] == 3, f"Expected 3 successful calls, got {stats['successful_calls']}"
    assert stats['failed_calls'] == 1, f"Expected 1 failed call, got {stats['failed_calls']}"
    assert stats['recovered_calls'] == 2, f"Expected 2 recovered calls, got {stats['recovered_calls']}"
    assert len(stats['most_common_errors']) >= 1, "Should have at least one error type recorded"
    
    print("🎉 Test de la fonctionnalité des statistiques health réussi !")


def test_thread_safety():
    """Test de la thread safety des statistiques."""
    print("\n🧪 Test de thread safety des statistiques")
    
    import threading
    
    # Reset stats
    retry_stats.reset()
    
    def worker(worker_id):
        """Worker function for threading test."""
        for i in range(10):
            success = (i % 3) != 0  # 2/3 success rate
            retries = i % 2  # Some with retries
            error_type = f"Worker{worker_id}Error" if not success else None
            retry_stats.record_call(success=success, retries=retries, error_type=error_type)
    
    # Launch multiple threads
    threads = []
    for i in range(5):
        thread = threading.Thread(target=worker, args=(i,))
        threads.append(thread)
        thread.start()
    
    # Wait for all threads to complete
    for thread in threads:
        thread.join()
    
    # Verify results
    stats = retry_stats.get_summary()
    print(f"✅ Total calls after threading: {stats['total_calls']}")
    print(f"✅ Success rate: {stats['success_rate_percent']}%")
    assert stats['total_calls'] == 50, f"Expected 50 total calls, got {stats['total_calls']}"
    
    print("🎉 Test de thread safety réussi !")


async def test_health_command_integration():
    """Test d'intégration de la commande health."""
    print("\n🧪 Test d'intégration de la commande health")
    
    # Mock Discord interaction
    interaction = Mock()
    interaction.response = AsyncMock()
    interaction.response.send_message = AsyncMock()
    
    # Mock bot
    bot = Mock()
    
    # Create slash commands instance
    slash_commands = SlashCommands(bot)
    
    # Reset and populate stats
    retry_stats.reset()
    retry_stats.record_call(success=True, retries=0)
    retry_stats.record_call(success=False, error_type="TestError", retries=1)
    retry_stats.record_call(success=True, retries=1)
    
    # Execute health command
    try:
        await slash_commands.health(interaction)
        print("✅ Health command executed successfully")
        
        # Verify interaction was called
        assert interaction.response.send_message.called, "Expected send_message to be called"
        
        # Get the call arguments
        call_args = interaction.response.send_message.call_args
        message_content = str(call_args[1]['embed'].description) if 'embed' in call_args[1] else str(call_args[0][0])
        
        print(f"✅ Health command response length: {len(message_content)} characters")
        
        # Verify key information is included
        assert "Total calls" in message_content or "appels" in message_content.lower(), "Should include total calls information"
        print("✅ Health command includes expected statistics")
        
    except Exception as e:
        print(f"❌ Health command failed: {e}")
        raise
    
    print("🎉 Test d'intégration de la commande health réussi !")


async def test_error_recovery_stats():
    """Test des statistiques de récupération d'erreurs."""
    print("\n🧪 Test des statistiques de récupération d'erreurs")
    
    # Reset stats
    retry_stats.reset()
    
    # Simulate various error scenarios
    test_scenarios = [
        {"success": True, "retries": 0, "description": "Success on first try"},
        {"success": True, "retries": 1, "description": "Success after 1 retry"},
        {"success": True, "retries": 2, "description": "Success after 2 retries"},
        {"success": False, "retries": 3, "error_type": "NetworkError", "description": "Failed after max retries"},
        {"success": False, "retries": 0, "error_type": "ValidationError", "description": "Immediate failure"},
    ]
    
    for scenario in test_scenarios:
        retry_stats.record_call(
            success=scenario["success"], 
            retries=scenario["retries"],
            error_type=scenario.get("error_type")
        )
        print(f"  📝 Recorded: {scenario['description']}")
    
    # Verify statistics
    stats = retry_stats.get_summary()
    
    print(f"✅ Total calls: {stats['total_calls']}")
    print(f"✅ Successful calls: {stats['successful_calls']}")
    print(f"✅ Failed calls: {stats['failed_calls']}")
    print(f"✅ Recovered calls (with retries): {stats['recovered_calls']}")
    print(f"✅ Success rate: {stats['success_rate_percent']}%")
    print(f"✅ Recovery rate: {stats['recovery_rate_percent']}%")
    print(f"✅ Error types: {stats['most_common_errors']}")
    
    # Verify calculations
    assert stats['total_calls'] == 5, f"Expected 5 total calls, got {stats['total_calls']}"
    assert stats['successful_calls'] == 3, f"Expected 3 successful calls, got {stats['successful_calls']}"
    assert stats['failed_calls'] == 2, f"Expected 2 failed calls, got {stats['failed_calls']}"
    assert stats['recovered_calls'] == 2, f"Expected 2 recovered calls, got {stats['recovered_calls']}"
    assert stats['success_rate_percent'] == 60.0, f"Expected 60% success rate, got {stats['success_rate_percent']}%"
    
    print("🎉 Test des statistiques de récupération d'erreurs réussi !")


async def main():
    """Fonction principale des tests."""
    print("🚀 Tests d'intégration des commandes health")
    print("=" * 60)
    
    tests = [
        test_health_stats_functionality,
        lambda: test_thread_safety(),  # Sync function wrapped
        test_health_command_integration,
        test_error_recovery_stats,
    ]
    
    passed = 0
    total = len(tests)
    
    for i, test in enumerate(tests):
        try:
            if asyncio.iscoroutinefunction(test):
                await test()
            else:
                test()
            passed += 1
            print(f"✅ Test {i+1}/{total} réussi\n")
        except Exception as e:
            print(f"❌ Test {i+1}/{total} échoué: {e}\n")
    
    print("=" * 60)
    print(f"📊 Résultats: {passed}/{total} tests réussis")
    
    if passed == total:
        print("🎉 Tous les tests d'intégration health sont passés !")
        return 0
    else:
        print("⚠️  Certains tests ont échoué.")
        return 1


if __name__ == "__main__":
    exit(asyncio.run(main()))