#!/usr/bin/env python3
"""
Script de benchmarking pour valider les performances vs version Python
Discord Reminder Bot - Phase 6 Assurance Qualité
"""
import asyncio
import json
import sys
import time
import statistics
import psutil
import os
from pathlib import Path
from typing import Dict, List, Any, Tuple
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor
import tempfile

# Ajouter le répertoire racine au path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.database_models import Event
from persistence.storage import StorageManager
from utils.unified_event_manager import UnifiedEventManager


@dataclass
class BenchmarkResult:
    """Résultat d'un benchmark"""
    test_name: str
    operation: str
    dataset_size: int
    execution_time: float
    memory_usage_mb: float
    operations_per_second: float
    python_version: str
    success: bool
    error_message: str = ""


class PerformanceBenchmark:
    """Gestionnaire de benchmarks de performance"""
    
    def __init__(self):
        self.process = psutil.Process(os.getpid())
        self.results: List[BenchmarkResult] = []
        self.python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        
    def measure_memory(self) -> float:
        """Mesure l'utilisation mémoire actuelle en MB"""
        return self.process.memory_info().rss / 1024 / 1024
    
    def benchmark_decorator(self, test_name: str, operation: str, dataset_size: int = 0):
        """Décorateur pour mesurer les performances d'une fonction"""
        def decorator(func):
            def wrapper(*args, **kwargs):
                initial_memory = self.measure_memory()
                start_time = time.time()
                
                try:
                    result = func(*args, **kwargs)
                    success = True
                    error_msg = ""
                except Exception as e:
                    result = None
                    success = False
                    error_msg = str(e)
                
                end_time = time.time()
                final_memory = self.measure_memory()
                
                execution_time = end_time - start_time
                memory_usage = max(0, final_memory - initial_memory)
                
                ops_per_second = dataset_size / execution_time if execution_time > 0 and dataset_size > 0 else 0
                
                benchmark_result = BenchmarkResult(
                    test_name=test_name,
                    operation=operation,
                    dataset_size=dataset_size,
                    execution_time=execution_time,
                    memory_usage_mb=memory_usage,
                    operations_per_second=ops_per_second,
                    python_version=self.python_version,
                    success=success,
                    error_message=error_msg
                )
                
                self.results.append(benchmark_result)
                print(f"✓ {test_name} - {operation}: {execution_time:.3f}s, {memory_usage:.1f}MB")
                
                return result
            return wrapper
        return decorator
    
    def generate_test_events(self, count: int) -> List[Event]:
        """Génère des événements de test pour les benchmarks"""
        events = []
        base_time = time.time()
        
        for i in range(count):
            event_data = {
                'message_id': str(1000000 + i),
                'channel_id': str(100000 + (i % 100)),  # 100 canaux différents
                'guild_id': str(10000 + (i % 20)),      # 20 serveurs différents
                'message_link': f'https://discord.com/channels/bench/{i}',
                'users_who_reacted': [str(j) for j in range(i % 50)],  # 0-49 utilisateurs
                'reminder_interval_hours': 24.0,
                'last_reminder_time': base_time - (i * 1800),  # Décalage de 30min
                'created_at': base_time - (i * 1800),
                'is_active': i % 10 != 0  # 10% d'événements inactifs
            }
            events.append(Event.from_dict(event_data))
        
        return events
    
    @benchmark_decorator
    def benchmark_event_creation(self, count: int) -> List[Event]:
        """Benchmark création d'événements"""
        return self.generate_test_events(count)
    
    @benchmark_decorator  
    def benchmark_json_serialization(self, events: List[Event]) -> str:
        """Benchmark sérialisation JSON"""
        events_dict = [event.to_dict() for event in events]
        return json.dumps(events_dict)
    
    @benchmark_decorator
    def benchmark_json_deserialization(self, json_data: str) -> List[Event]:
        """Benchmark désérialisation JSON"""
        data = json.loads(json_data)
        return [Event.from_dict(event_data) for event_data in data]
    
    @benchmark_decorator
    def benchmark_reminder_calculation(self, events: List[Event]) -> List[Event]:
        """Benchmark calcul des rappels dus"""
        current_time = time.time()
        return [event for event in events if event.is_reminder_due(current_time)]
    
    @benchmark_decorator
    def benchmark_event_filtering(self, events: List[Event]) -> List[Event]:
        """Benchmark filtrage des événements actifs"""
        return [event for event in events if event.is_active]
    
    @benchmark_decorator
    def benchmark_grouping_by_guild(self, events: List[Event]) -> Dict[str, List[Event]]:
        """Benchmark groupement par serveur"""
        by_guild = {}
        for event in events:
            if event.guild_id not in by_guild:
                by_guild[event.guild_id] = []
            by_guild[event.guild_id].append(event)
        return by_guild
    
    @benchmark_decorator
    def benchmark_sorting_by_time(self, events: List[Event]) -> List[Event]:
        """Benchmark tri par timestamp"""
        return sorted(events, key=lambda e: e.last_reminder_time)
    
    @benchmark_decorator
    def benchmark_concurrent_processing(self, events: List[Event]) -> List[bool]:
        """Benchmark traitement concurrent"""
        def process_event(event):
            time.sleep(0.001)  # Simuler du travail
            return event.is_reminder_due(time.time())
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            return list(executor.map(process_event, events))
    
    async def benchmark_async_operations(self, events: List[Event]) -> List[bool]:
        """Benchmark opérations asynchrones"""
        async def async_check(event):
            await asyncio.sleep(0.001)
            return event.is_reminder_due(time.time())
        
        initial_memory = self.measure_memory()
        start_time = time.time()
        
        try:
            tasks = [async_check(event) for event in events]
            results = await asyncio.gather(*tasks)
            success = True
            error_msg = ""
        except Exception as e:
            results = []
            success = False
            error_msg = str(e)
        
        end_time = time.time()
        final_memory = self.measure_memory()
        
        execution_time = end_time - start_time
        memory_usage = max(0, final_memory - initial_memory)
        ops_per_second = len(events) / execution_time if execution_time > 0 else 0
        
        benchmark_result = BenchmarkResult(
            test_name="Async Operations",
            operation="async_reminder_check",
            dataset_size=len(events),
            execution_time=execution_time,
            memory_usage_mb=memory_usage,
            operations_per_second=ops_per_second,
            python_version=self.python_version,
            success=success,
            error_message=error_msg
        )
        
        self.results.append(benchmark_result)
        print(f"✓ Async Operations - async_reminder_check: {execution_time:.3f}s, {memory_usage:.1f}MB")
        
        return results
    
    def run_storage_benchmarks(self, events: List[Event]) -> None:
        """Benchmark des opérations de stockage"""
        with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
            temp_file = f.name
        
        try:
            # Benchmark sauvegarde
            @self.benchmark_decorator("Storage", "save_events", len(events))
            def benchmark_save():
                storage = StorageManager(temp_file)
                asyncio.run(storage.save_events(events))
                return True
            
            # Benchmark chargement
            @self.benchmark_decorator("Storage", "load_events", len(events))
            def benchmark_load():
                storage = StorageManager(temp_file)
                return asyncio.run(storage.load_events())
            
            benchmark_save()
            loaded_events = benchmark_load()
            
            # Vérifier l'intégrité des données
            assert len(loaded_events) == len(events)
            
        finally:
            if os.path.exists(temp_file):
                os.unlink(temp_file)
    
    def analyze_results(self) -> Dict[str, Any]:
        """Analyse les résultats de benchmark"""
        if not self.results:
            return {}
        
        successful_results = [r for r in self.results if r.success]
        
        analysis = {
            "python_version": self.python_version,
            "total_tests": len(self.results),
            "successful_tests": len(successful_results),
            "failed_tests": len(self.results) - len(successful_results),
            "summary": {}
        }
        
        if successful_results:
            execution_times = [r.execution_time for r in successful_results]
            memory_usages = [r.memory_usage_mb for r in successful_results]
            ops_per_second = [r.operations_per_second for r in successful_results if r.operations_per_second > 0]
            
            analysis["summary"] = {
                "avg_execution_time": statistics.mean(execution_times),
                "max_execution_time": max(execution_times),
                "min_execution_time": min(execution_times),
                "avg_memory_usage": statistics.mean(memory_usages),
                "max_memory_usage": max(memory_usages),
                "avg_ops_per_second": statistics.mean(ops_per_second) if ops_per_second else 0,
                "max_ops_per_second": max(ops_per_second) if ops_per_second else 0
            }
            
            # Analyse par catégorie
            analysis["by_category"] = {}
            categories = set(r.test_name for r in successful_results)
            
            for category in categories:
                category_results = [r for r in successful_results if r.test_name == category]
                category_times = [r.execution_time for r in category_results]
                
                analysis["by_category"][category] = {
                    "count": len(category_results),
                    "avg_time": statistics.mean(category_times),
                    "max_time": max(category_times),
                    "min_time": min(category_times)
                }
        
        return analysis
    
    def save_results(self, filename: str = None) -> str:
        """Sauvegarde les résultats dans un fichier JSON"""
        if filename is None:
            timestamp = int(time.time())
            filename = f"benchmark_results_{self.python_version}_{timestamp}.json"
        
        data = {
            "timestamp": time.time(),
            "python_version": self.python_version,
            "system_info": {
                "cpu_count": psutil.cpu_count(),
                "memory_total_gb": psutil.virtual_memory().total / 1024**3,
                "platform": sys.platform
            },
            "results": [asdict(result) for result in self.results],
            "analysis": self.analyze_results()
        }
        
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)
        
        return filename
    
    def compare_with_baseline(self, baseline_file: str) -> Dict[str, Any]:
        """Compare les résultats avec une baseline"""
        if not os.path.exists(baseline_file):
            return {"error": "Baseline file not found"}
        
        with open(baseline_file, 'r') as f:
            baseline_data = json.load(f)
        
        current_analysis = self.analyze_results()
        baseline_analysis = baseline_data.get("analysis", {})
        
        comparison = {
            "baseline_version": baseline_data.get("python_version", "unknown"),
            "current_version": self.python_version,
            "performance_comparison": {}
        }
        
        if "summary" in current_analysis and "summary" in baseline_analysis:
            current_summary = current_analysis["summary"]
            baseline_summary = baseline_analysis["summary"]
            
            for metric in ["avg_execution_time", "max_memory_usage", "avg_ops_per_second"]:
                if metric in current_summary and metric in baseline_summary:
                    current_val = current_summary[metric]
                    baseline_val = baseline_summary[metric]
                    
                    if baseline_val != 0:
                        change_percent = ((current_val - baseline_val) / baseline_val) * 100
                        comparison["performance_comparison"][metric] = {
                            "current": current_val,
                            "baseline": baseline_val,
                            "change_percent": change_percent,
                            "improved": change_percent < 0 if "time" in metric else change_percent > 0
                        }
        
        return comparison


async def main():
    """Fonction principale pour exécuter tous les benchmarks"""
    print(f"🚀 Démarrage des benchmarks de performance - Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")
    print(f"📊 Système: {psutil.cpu_count()} CPUs, {psutil.virtual_memory().total / 1024**3:.1f}GB RAM")
    print("=" * 60)
    
    benchmark = PerformanceBenchmark()
    
    # Datasets de différentes tailles pour tester la scalabilité
    dataset_sizes = [100, 500, 1000, 2000]
    
    for size in dataset_sizes:
        print(f"\n📈 Tests avec {size} événements:")
        
        # Génération des données
        events = benchmark.benchmark_event_creation("Event Creation", "generate_events", size)(size)
        
        if events:
            # Benchmarks de base
            json_data = benchmark.benchmark_json_serialization("Serialization", "json_dumps", size)(events)
            benchmark.benchmark_json_deserialization("Deserialization", "json_loads", size)(json_data)
            
            # Benchmarks logique métier
            benchmark.benchmark_reminder_calculation("Reminder Logic", "calculate_due", size)(events)
            benchmark.benchmark_event_filtering("Filtering", "filter_active", size)(events)
            benchmark.benchmark_grouping_by_guild("Grouping", "group_by_guild", size)(events)
            benchmark.benchmark_sorting_by_time("Sorting", "sort_by_time", size)(events)
            
            # Benchmarks concurrence
            if size <= 1000:  # Limiter pour éviter la surcharge
                benchmark.benchmark_concurrent_processing("Concurrency", "thread_pool", size)(events)
                await benchmark.benchmark_async_operations(events[:500])  # Limité pour éviter trop de tâches async
            
            # Benchmarks stockage (seulement pour les plus petites tailles)
            if size <= 500:
                benchmark.run_storage_benchmarks(events)
    
    print("\n" + "=" * 60)
    print("📊 Analyse des résultats:")
    
    analysis = benchmark.analyze_results()
    if analysis:
        print(f"✅ Tests réussis: {analysis['successful_tests']}/{analysis['total_tests']}")
        
        if "summary" in analysis:
            summary = analysis["summary"]
            print(f"⏱️  Temps moyen d'exécution: {summary['avg_execution_time']:.3f}s")
            print(f"🧠 Utilisation mémoire moyenne: {summary['avg_memory_usage']:.1f}MB")
            print(f"🔥 Performance moyenne: {summary.get('avg_ops_per_second', 0):.0f} ops/s")
    
    # Sauvegarder les résultats
    results_file = benchmark.save_results()
    print(f"💾 Résultats sauvegardés dans: {results_file}")
    
    # Comparaison avec baseline si elle existe
    baseline_file = f"benchmark_baseline_{sys.version_info.major}.{sys.version_info.minor}.json"
    if os.path.exists(baseline_file):
        comparison = benchmark.compare_with_baseline(baseline_file)
        print(f"\n📊 Comparaison avec baseline ({comparison.get('baseline_version', 'unknown')}):")
        
        for metric, data in comparison.get("performance_comparison", {}).items():
            change = data["change_percent"]
            status = "🟢" if data["improved"] else "🔴" if abs(change) > 10 else "🟡"
            print(f"{status} {metric}: {change:+.1f}%")
    else:
        # Créer une baseline pour cette version Python
        baseline_path = Path(results_file).parent / baseline_file
        Path(results_file).rename(baseline_path)
        print(f"📝 Baseline créée pour Python {sys.version_info.major}.{sys.version_info.minor}: {baseline_path}")
    
    print("\n🎯 Benchmark terminé avec succès!")
    
    return analysis


if __name__ == "__main__":
    asyncio.run(main())