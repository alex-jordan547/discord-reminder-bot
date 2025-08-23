#!/usr/bin/env python3
"""
Docker Integration Tests

Tests to validate the Docker environment and container functionality.
"""

import subprocess
import sys
from pathlib import Path


def test_docker_build():
    """Test that Docker image builds successfully."""
    print("🐳 Testing Docker build...")
    
    try:
        result = subprocess.run([
            'docker', 'build', '-t', 'discord-reminder-bot-test', '.'
        ], capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0:
            print("✅ Docker build successful")
            return True
        else:
            print(f"❌ Docker build failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("❌ Docker build timed out")
        return False
    except FileNotFoundError:
        print("⚠️  Docker not available, skipping build test")
        return None


def test_docker_structure_validation():
    """Test the validate_docker_structure.py script."""
    print("🔍 Testing Docker structure validation...")
    
    try:
        result = subprocess.run([
            sys.executable, 'validate_docker_structure.py'
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            print("✅ Docker structure validation passed")
            return True
        else:
            print(f"❌ Docker structure validation failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("❌ Docker structure validation timed out")
        return False


def test_container_health_check():
    """Test that container health check works (without actually running Discord bot)."""
    print("🏥 Testing container health check...")
    
    try:
        # Test the health check command directly
        result = subprocess.run([
            'python', '-c', 'import discord; from bot import create_bot; import sys; sys.exit(0)'
        ], capture_output=True, text=True, timeout=15)
        
        if result.returncode == 0:
            print("✅ Health check command successful")
            return True
        else:
            print(f"❌ Health check command failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("❌ Health check command timed out")
        return False


def test_required_files():
    """Test that all required Docker files exist."""
    print("📁 Testing required Docker files...")
    
    required_files = [
        'Dockerfile',
        'docker-compose.yml',
        'requirements.txt',
        '.dockerignore'
    ]
    
    missing_files = []
    
    for file_path in required_files:
        if not Path(file_path).exists():
            missing_files.append(file_path)
        else:
            print(f"✅ {file_path}")
    
    if missing_files:
        print(f"❌ Missing files: {', '.join(missing_files)}")
        return False
    else:
        print("✅ All required Docker files present")
        return True


def main():
    """Run all Docker integration tests."""
    print("🚀 Running Docker Integration Tests\n")
    
    tests = [
        ("Required Files", test_required_files),
        ("Structure Validation", test_docker_structure_validation),
        ("Health Check", test_container_health_check),
        ("Docker Build", test_docker_build),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        results[test_name] = test_func()
    
    # Summary
    print("\n" + "="*50)
    print("📊 DOCKER INTEGRATION TEST RESULTS")
    print("="*50)
    
    passed = 0
    failed = 0
    skipped = 0
    
    for test_name, result in results.items():
        if result is True:
            print(f"✅ {test_name}")
            passed += 1
        elif result is False:
            print(f"❌ {test_name}")
            failed += 1
        else:
            print(f"⚠️  {test_name} (skipped)")
            skipped += 1
    
    print(f"\nSummary: {passed} passed, {failed} failed, {skipped} skipped")
    
    if failed > 0:
        print("\n❌ Some tests failed. Docker setup needs attention.")
        return 1
    else:
        print("\n🎉 All Docker integration tests passed!")
        return 0


if __name__ == "__main__":
    sys.exit(main())