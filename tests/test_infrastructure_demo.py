"""
Demonstration tests for the new test infrastructure managers.

These tests showcase the capabilities of the FixtureManager,
DiscordMockManager, and TestDatabaseManager implementations.
"""

import pytest

from tests.fixtures import DiscordMockManager, FixtureManager, TestDatabaseManager


@pytest.mark.unit
@pytest.mark.database
def test_fixture_manager_basic_usage(fixture_manager):
    """Demonstrate basic FixtureManager usage."""
    # Create individual fixtures
    guild = fixture_manager.create_guild(name="Demo Guild")
    user = fixture_manager.create_user(username="DemoUser")
    event = fixture_manager.create_event(guild=guild, title="Demo Event")

    assert guild.name == "Demo Guild"
    assert user.username == "DemoUser"
    assert event.title == "Demo Event"
    assert event.guild.id == guild.id

    # Validate relationships
    assert fixture_manager.validate_fixture_relationships()

    # Get stats
    stats = fixture_manager.get_fixture_stats()
    assert stats["total_objects"] >= 3
    assert "guild" in stats["by_type"]
    assert "user" in stats["by_type"]
    assert "event" in stats["by_type"]


@pytest.mark.unit
@pytest.mark.database
def test_fixture_manager_complete_scenario(fixture_manager):
    """Demonstrate complete scenario creation."""
    scenario = fixture_manager.create_complete_scenario("standard")

    assert len(scenario["guilds"]) == 2
    assert len(scenario["users"]) == 5
    assert len(scenario["events"]) == 3
    assert scenario["metadata"]["scenario"] == "standard"
    assert scenario["metadata"]["total_entities"] > 0

    # Validate all relationships
    assert fixture_manager.validate_fixture_relationships()


@pytest.mark.unit
@pytest.mark.discord
def test_discord_mock_manager_server_setup(discord_mock_manager):
    """Demonstrate Discord mock server creation."""
    server = discord_mock_manager.create_complete_server_mock(
        guild_name="Test Discord Server", channel_count=2, user_count=3
    )

    assert server["guild"].name == "Test Discord Server"
    assert len(server["channels"]) == 2
    assert len(server["users"]) == 3
    assert len(server["messages"]) > 0

    # Validate mock relationships
    validation = discord_mock_manager.validate_mock_relationships()
    assert validation["valid"] == True
    assert len(validation["errors"]) == 0


@pytest.mark.unit
@pytest.mark.discord
def test_discord_mock_interaction_tracking(discord_mock_manager):
    """Demonstrate interaction tracking with Discord mocks."""
    guild = discord_mock_manager.create_guild_mock(name="Tracked Guild")
    channel = discord_mock_manager.create_channel_mock(guild_mock=guild)

    # Perform some interactions
    channel.send("Hello World")
    guild.fetch_member(123456)

    # Check interaction tracking
    report = discord_mock_manager.get_interaction_report()
    assert report["total_interactions"] >= 2
    assert "send" in str(report["method_calls"])
    assert "fetch_member" in str(report["method_calls"])


@pytest.mark.integration
@pytest.mark.database
def test_test_database_manager_isolation(test_database_manager):
    """Demonstrate database isolation capabilities."""
    # Create two isolated databases
    db1 = test_database_manager.create_test_database("test_1", populate=True)
    db2 = test_database_manager.create_test_database("test_2", populate=True)

    assert db1 != db2

    # Check they have separate data
    stats1 = test_database_manager.get_database_stats("test_1")
    stats2 = test_database_manager.get_database_stats("test_2")

    assert stats1["total_records"] > 0
    assert stats2["total_records"] > 0
    assert stats1["file_size"] != stats2["file_size"]


@pytest.mark.integration
@pytest.mark.database
def test_database_transaction_management(populated_database):
    """Demonstrate transaction management."""
    db_info = populated_database
    transaction_mgr = db_info["transaction_manager"]
    fixture_mgr = db_info["fixture_manager"]

    # Check initial state
    initial_count = fixture_mgr.Guild.select().count()

    # Test transaction with rollback
    with transaction_mgr.transaction(rollback_on_exit=True):
        fixture_mgr.create_guild(name="Rollback Guild")
        # This should be rolled back
        temp_count = fixture_mgr.Guild.select().count()
        assert temp_count == initial_count + 1

    # Verify rollback worked
    final_count = fixture_mgr.Guild.select().count()
    assert final_count == initial_count


@pytest.mark.functional
@pytest.mark.database
@pytest.mark.discord
def test_full_integration_setup(full_integration_setup):
    """Demonstrate full integration testing capabilities."""
    setup = full_integration_setup

    # Verify database components
    assert setup["database"] is not None
    assert setup["fixture_manager"] is not None
    assert setup["transaction_manager"] is not None

    # Verify Discord components
    assert setup["test_guild"] is not None
    assert len(setup["test_channels"]) > 0
    assert len(setup["test_users"]) > 0
    assert len(setup["test_messages"]) > 0

    # Test interaction between components
    guild = setup["fixture_manager"].create_guild(name="Integration Guild")
    mock_guild = setup["test_guild"]

    assert guild.name == "Integration Guild"
    assert mock_guild.name == "Test Server"


@pytest.mark.performance
def test_performance_monitoring(test_database_manager):
    """Demonstrate performance monitoring capabilities."""
    # Create database with performance monitoring
    db = test_database_manager.create_test_database("perf_test", config="minimal", populate=False)

    # Get fixture manager and perform operations
    fixture_mgr = test_database_manager.get_fixture_manager("perf_test")
    if fixture_mgr is None:
        # Create one if not auto-created
        fixture_mgr = FixtureManager(db)

    # Perform some database operations
    for i in range(10):
        fixture_mgr.create_guild(name=f"Guild {i}")

    # Get performance stats
    stats = test_database_manager.get_database_stats("perf_test")
    assert stats["total_records"] >= 10
    assert "Guild" in stats["table_stats"]


@pytest.mark.unit
def test_scenario_variations(scenario_database):
    """Demonstrate scenario-based testing."""
    scenario_info = scenario_database
    scenario_name = scenario_info["scenario_name"]
    scenario_data = scenario_info["scenario_data"]

    # Different scenarios have different entity counts
    if scenario_name == "minimal":
        assert len(scenario_data["guilds"]) == 1
        assert len(scenario_data["users"]) == 2
        assert len(scenario_data["events"]) == 1
    elif scenario_name == "standard":
        assert len(scenario_data["guilds"]) == 2
        assert len(scenario_data["users"]) == 5
        assert len(scenario_data["events"]) == 3
    elif scenario_name == "complex":
        assert len(scenario_data["guilds"]) == 3
        assert len(scenario_data["users"]) == 10
        assert len(scenario_data["events"]) == 7

    # All scenarios should have valid metadata
    assert scenario_data["metadata"]["scenario"] == scenario_name
    assert scenario_data["metadata"]["total_entities"] > 0


@pytest.mark.integration
@pytest.mark.database
def test_transactional_testing(transactional_test):
    """Demonstrate automatic transaction rollback."""
    db_info = transactional_test
    fixture_mgr = db_info["fixture_manager"]

    # Any changes made here will be automatically rolled back
    initial_count = fixture_mgr.Guild.select().count()

    # Create some data
    fixture_mgr.create_guild(name="Temp Guild")
    fixture_mgr.create_user(username="TempUser")

    # Verify data exists within transaction
    assert fixture_mgr.Guild.select().count() == initial_count + 1
    assert fixture_mgr.User.select().where(fixture_mgr.User.username == "TempUser").exists()

    # Transaction will be rolled back automatically when fixture exits
