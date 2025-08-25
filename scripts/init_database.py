#!/usr/bin/env python3
"""
Database initialization script for Discord Reminder Bot.

This script initializes the SQLite database and creates all necessary tables.
It can be run standalone or imported as a module.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from persistence.database_manager import get_database_manager
from persistence.database import get_database_info
from models.database_models import get_table_info


async def main():
    """
    Main initialization function.
    """
    # Setup basic logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    logger = logging.getLogger(__name__)
    
    print("🚀 Initializing Discord Reminder Bot Database...")
    print("=" * 50)
    
    try:
        # Get database manager
        db_manager = get_database_manager()
        
        # Initialize the database
        success = await db_manager.initialize()
        
        if success:
            print("✅ Database initialization successful!")
            
            # Display database information
            db_info = get_database_info()
            print(f"📁 Database path: {db_info['database_path']}")
            print(f"📊 Database exists: {db_info['database_exists']}")
            
            if db_info.get('database_size_mb'):
                print(f"💾 Database size: {db_info['database_size_mb']} MB")
            
            # Display table information
            table_info = get_table_info()
            print("\n📋 Table Information:")
            print("-" * 30)
            
            total_records = 0
            for table_name, info in table_info.items():
                if isinstance(info, dict):
                    status = "✅" if info.get('exists', False) else "❌"
                    count = info.get('row_count', 0)
                    total_records += count
                    print(f"{status} {info['model']}: {count} records")
            
            print("-" * 30)
            print(f"📈 Total records: {total_records}")
            
            # Perform health check
            print("\n🏥 Health Check:")
            print("-" * 20)
            health = await db_manager.health_check()
            
            status_emoji = {
                'healthy': '✅',
                'degraded': '⚠️',
                'unhealthy': '❌',
                'error': '💥',
                'unknown': '❓'
            }
            
            print(f"{status_emoji.get(health['status'], '❓')} Status: {health['status']}")
            print(f"🔧 Initialized: {health['initialized']}")
            print(f"🗄️ Database Available: {health['database_available']}")
            print(f"📊 Tables Exist: {health['tables_exist']}")
            
            if health['errors']:
                print("\n⚠️ Errors:")
                for error in health['errors']:
                    print(f"  - {error}")
            
            print("\n🎉 Database setup complete!")
            
        else:
            print("❌ Database initialization failed!")
            return 1
            
    except Exception as e:
        logger.error(f"Initialization failed: {e}")
        print(f"💥 Error: {e}")
        return 1
    
    finally:
        # Shutdown the database manager
        db_manager = get_database_manager()
        await db_manager.shutdown()
    
    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)