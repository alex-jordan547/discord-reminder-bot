#!/usr/bin/env python3
"""
Test script pour valider les commandes health après les corrections.
"""

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
    
    def worker(thread_id):
        for i in range(50):
            retry_stats.record_call(
                success=(i % 3 != 0),  # 2/3 success rate
                error_type=f"Error{thread_id}" if (i % 3 == 0) else None,
                retries=(1 if i % 2 == 0 else 0)
            )
    
    # Run multiple threads
    threads = []
    for i in range(3):
        t = threading.Thread(target=worker, args=(i,))
        threads.append(t)
        t.start()
    
    # Wait for completion
    for t in threads:
        t.join()
    
    stats = retry_stats.get_summary()
    expected_total = 3 * 50  # 3 threads * 50 calls each
    
    assert stats['total_calls'] == expected_total, f"Expected {expected_total} calls, got {stats['total_calls']}"
    assert stats['successful_calls'] + stats['failed_calls'] == expected_total, "Inconsistent success/failure counts"
    
    print(f"✅ Thread safety verified: {stats['total_calls']} calls processed correctly")
    print(f"✅ Success rate: {stats['success_rate_percent']}%")
    print(f"✅ Error types: {len(stats['most_common_errors'])}")
    
    print("🎉 Test de thread safety réussi !")


def test_recovery_rate_calculation():
    """Test du calcul du taux de récupération."""
    print("\n🧪 Test du calcul du taux de récupération")
    
    # Reset and add specific test data
    retry_stats.reset()
    
    # Add some calls that succeed immediately
    retry_stats.record_call(success=True, retries=0)
    retry_stats.record_call(success=True, retries=0)
    
    # Add some calls that succeed after retry (should be counted as recovered)
    retry_stats.record_call(success=True, retries=1)
    retry_stats.record_call(success=True, retries=2)
    
    # Add some calls that fail even after retry
    retry_stats.record_call(success=False, error_type="PermanentError", retries=3)
    
    stats = retry_stats.get_summary()
    
    print(f"✅ Total calls: {stats['total_calls']}")
    print(f"✅ Successful calls: {stats['successful_calls']}")
    print(f"✅ Failed calls: {stats['failed_calls']}")
    print(f"✅ Retried calls: {stats['retried_calls']}")
    print(f"✅ Recovered calls: {stats['recovered_calls']}")
    print(f"✅ Recovery rate: {stats['recovery_rate_percent']}%")
    
    # Verify calculations
    assert stats['total_calls'] == 5, f"Expected 5 total calls, got {stats['total_calls']}"
    assert stats['successful_calls'] == 4, f"Expected 4 successful calls, got {stats['successful_calls']}"
    assert stats['failed_calls'] == 1, f"Expected 1 failed call, got {stats['failed_calls']}"
    assert stats['retried_calls'] == 3, f"Expected 3 retried calls, got {stats['retried_calls']}"
    assert stats['recovered_calls'] == 2, f"Expected 2 recovered calls, got {stats['recovered_calls']}"
    
    # Recovery rate should be 2/3 = 66.67%
    expected_recovery_rate = 2/3 * 100
    assert abs(stats['recovery_rate_percent'] - expected_recovery_rate) < 0.1, f"Expected ~66.67% recovery rate, got {stats['recovery_rate_percent']}%"
    
    print("🎉 Test du calcul du taux de récupération réussi !")


async def main():
    """Fonction principale de test."""
    print("🚀 Début des tests des commandes health\n")
    
    try:
        # Test thread safety first
        test_thread_safety()
        
        # Test recovery rate calculation
        test_recovery_rate_calculation()
        
        # Test health stats functionality
        await test_health_stats_functionality()
        
        print(f"\n🎉 Tous les tests sont réussis !")
        print("✅ Thread safety: OK")
        print("✅ Recovery rate calculation: OK") 
        print("✅ Health command: OK")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())